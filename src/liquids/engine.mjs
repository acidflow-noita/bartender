import {LiquidRandom, canDisplaceLiquid, nativeFlag, attachmentDirection, allowsSandSlide, allowsSlimeSlide} from './native-rules.mjs';
import {compileContactReactions, stepContactReactions, convertReactionBlob} from './reactions.mjs';
import {initializeCellEnvironment, convertCellEnvironment, expireCell, stepGasOrFire, stepCellEnvironment, stepAttachedEnvironment, igniteCell} from './thermal.mjs';
import {applyReactionEffects} from './effects.mjs';
import {resetDeferred, defer, flush as flushDeferred, countDeferred} from './deferred.mjs';
import {resetMutations, queueMaterialCreation, flushMaterialCreations, flushBlobMutations, flushExplosions} from './mutations.mjs';
import {CellReactionScheduler} from './scheduler.mjs';
import {stainContact} from './stains.mjs';
import {formationColor, packedMaterialColor} from './materials.mjs';

export const EMPTY = 0;
export const WALL = 65535;
const f32 = Math.fround;

/** A closed cell world with native liquid movement rules. */
export class LiquidWorld {
  constructor({width, height, materials, seed = 1, reactions = [], processes = true}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width * height > 1048576) {
      throw new RangeError('Liquid world dimensions must be integers, at least 2, and at most 1,048,576 cells.');
    }
    if (!Array.isArray(materials) || materials.length >= WALL) throw new TypeError('Provide a liquid material array.');
    this.width = width;
    this.height = height;
    this.processes = processes;
    this.materials = [null, ...materials.map(material => {
      const result = {...material};
      for (const key of ['density', 'liquid_gravity', 'liquid_damping', 'liquid_flow_speed']) {
        if (!Number.isFinite(Number(material[key]))) throw new TypeError(`Missing finite liquid property: ${key}`);
        result[key] = f32(Number(material[key]));
      }
      result.liquid_viscosity = Math.trunc(Number(material.liquid_viscosity ?? 0));
      result.liquid_sticks_to_ceiling = Math.trunc(Number(material.liquid_sticks_to_ceiling ?? 0));
      for (const key of ['liquid_sand', 'liquid_static', 'liquid_slime', 'liquid_sand_never_box2d']) result[key] = nativeFlag(material[key]);
      return result;
    })];
    this._ids = new Map();
    this.materials.forEach((material, id) => {
      if (material) {
        if (material.id) this._ids.set(material.id, id);
        if (material.name) this._ids.set(material.name, id);
      }
    });
    this._ids.set('air', EMPTY);
    this.kind = new Uint8Array(this.materials.length);
    this.materials.forEach((material, id) => {
      if (material) this.kind[id] = ({liquid: 1, gas: 2, solid: 3, fire: 4})[material.cell_type] ?? 1;
    });
    this.contactReactions = compileContactReactions(this.materials, reactions);
    const colors = this.materials.map(mat => packedMaterialColor(mat?.graphics?.color, 0xffc0c0c0));
    this.sampleColor = id => colors[id];
    this.customPigments = this.materials.map(mat => packedMaterialColor(mat?.liquid_stains_custom_color) || null);
    const size = width * height;
    this.cells = new Uint16Array(size);
    this.vertical = new Float32Array(size);
    this.horizontal = new Float32Array(size);
    this._updated = new Uint32Array(size);
    this._motion = new Uint8Array(size);
    this._attached = new Uint8Array(size);
    this._idle = new Uint8Array(size);
    this.age = new Int32Array(size);
    this.burning = new Uint8Array(size);
    this.fireTemperature = new Int8Array(size);
    this.gasDirection = new Int8Array(size);
    this.gasHeat = new Int32Array(size);
    this.gasIdle = new Uint8Array(size);
    this.warmth = new Uint8Array(size);
    this.cold = new Uint8Array(size);
    this._environmentReactionEligible = new Uint8Array(size);
    this.hp = new Int32Array(size);
    this._changedAt = new Uint32Array(size);
    this._revision = new Uint32Array(size);
    this.colorOrigin = new Uint32Array(size);
    this.colorMaterial = new Uint32Array(size);
    this.formationColor = new Uint32Array(size);
    this.stain = new Array(size).fill(null);
    this._cellState = [this.cells, this.vertical, this.horizontal, this._motion, this._attached,
      this._idle, this.age, this.burning, this.fireTemperature, this.gasDirection,
      this.gasHeat, this.gasIdle, this._environmentReactionEligible, this.hp, this._changedAt,
      this._updated, this._revision, this.colorOrigin, this.colorMaterial, this.formationColor, this.stain];
    // Move the raw bits of each field. Keeping the views the same type in
    // each loop also keeps a dense pool within the browser's frame budget.
    this._wordFields = this._cellState.filter(field => field.BYTES_PER_ELEMENT === 4)
      .map(field => new Uint32Array(field.buffer, field.byteOffset, size));
    this._byteFields = this._cellState.filter(field => field.BYTES_PER_ELEMENT === 1)
      .map(field => new Uint8Array(field.buffer, field.byteOffset, size));
    this.seed = seed >>> 0;
    this.clear();
  }

  getMaterialId(name) { return this._ids.get(name) ?? EMPTY; }

  clear(seed = this.seed) {
    this.seed = seed >>> 0;
    this.random = new LiquidRandom(this.seed);
    this.effectRandom = new LiquidRandom(this.seed);
    this.tick = 0;
    this.cells.fill(EMPTY);
    this.vertical.fill(0);
    this.horizontal.fill(0);
    this._updated.fill(0);
    this._motion.fill(3);
    this._attached.fill(0);
    this.colorOrigin.fill(0);
    this.colorMaterial.fill(0);
    this.formationColor.fill(0);
    this.stain.fill(null);
    this._idle.fill(0);
    for (const array of [this.age, this.burning, this.fireTemperature, this.gasDirection,
      this.gasHeat, this.gasIdle, this.warmth, this.cold, this._environmentReactionEligible,
      this.hp, this._changedAt, this._revision]) array.fill(0);
    this._nextRevision = 0;
    this.effects = [];
    this.reactionCount = 0;
    this.reactionScheduler = new CellReactionScheduler(this.width, this.height, this.seed);
    this._forceFullUpdate = false;
    resetDeferred(this);
    resetMutations(this);
    this._inStep = false;
    this._committing = false;
    this._activeDeferred = null;
  }

  setCell(x, y, id) {
    if (!Number.isInteger(id) || (id !== WALL && (id < 0 || id >= this.materials.length))) {
      throw new RangeError('Unknown liquid material ID.');
    }
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const index = y * this.width + x;
    this._replaceMaterial(index, id, {fresh: true});
    return true;
  }

  _replaceMaterial(index, id, options = {}) {
    if (index < 0 || index >= this.cells.length) return false;
    if (!Number.isInteger(id) || (id !== WALL && (id < 0 || id >= this.materials.length))) throw new RangeError('Unknown material ID.');
    if (id !== WALL || this.cells[index] !== EMPTY) this._markActive(index);
    const previous = this.materials[this.cells[index]], next = this.materials[id];
    const color = options.formationColor ?? (options.fresh ? 0 : formationColor(previous, next));
    if (!options.fresh && id !== EMPTY && id !== WALL
      && convertCellEnvironment(this, index, previous, next, options)) {
      this.cells[index] = id;
      if (this.kind[id] === 1 || this.kind[id] === 3) {
        this.colorOrigin[index] = index;
        this.colorMaterial[index] = id;
        this.formationColor[index] = color;
        this.stain[index] = null;
      }
      this.hp[index] = Math.max(0, Math.trunc(Number(this.materials[id].hardness) || 0));
      this._changedAt[index] = this.tick;
      this._revision[index] = ++this._nextRevision;
      return true;
    }
    if (this._inStep && !this._committing && !options.immediate) {
      return queueMaterialCreation(this, index, id, color ? {...options, formationColor: color} : options);
    }
    this.cells[index] = id;
    this.colorOrigin[index] = index;
    this.colorMaterial[index] = id;
    this.formationColor[index] = color;
    this.stain[index] = null;
    this.vertical[index] = 0;
    this.horizontal[index] = 0;
    this._updated[index] = 0;
    this._motion[index] = 3;
    this._attached[index] = this.materials[id]?.liquid_static ? 2 : 0;
    this._idle[index] = 0;
    for (const array of [this.age, this.burning, this.fireTemperature, this.gasDirection,
      this.gasHeat, this.gasIdle]) array[index] = 0;
    this._environmentReactionEligible[index] = 1;
    this._changedAt[index] = this.tick;
    this._revision[index] = ++this._nextRevision;
    this.hp[index] = id === WALL ? 2147483647 : Math.max(0, Math.trunc(Number(this.materials[id]?.hardness) || 0));
    if (id !== EMPTY && id !== WALL) initializeCellEnvironment(this, index, this.materials[id], options);
    return true;
  }

  _forCircle(x, y, radius, action) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0) return;
    for (let row = Math.max(0, Math.floor(y - radius)); row <= Math.min(this.height - 1, Math.ceil(y + radius)); row++) {
      for (let column = Math.max(0, Math.floor(x - radius)); column <= Math.min(this.width - 1, Math.ceil(x + radius)); column++) {
        if ((column - x) ** 2 + (row - y) ** 2 <= radius ** 2) action(row * this.width + column);
      }
    }
  }

  eraseCircle(x, y, radius) {
    this._forCircle(x, y, radius, index => {
      this._replaceMaterial(index, EMPTY);
      this.warmth[index] = 0;
      this.cold[index] = 0;
    });
  }

  applyEnvironmentCircle(x, y, radius, tool, strength = 50) {
    if (!['heat', 'cool', 'ignite'].includes(tool)) return;
    const amount = Number.isFinite(strength) ? Math.max(1, Math.min(100, Math.trunc(strength))) : 50;
    this._forCircle(x, y, radius, index => {
      this._markActive(index);
      if (tool === 'heat' || tool === 'cool') {
        this.warmth[index] = tool === 'heat' ? amount : 0;
        this.cold[index] = tool === 'cool' ? amount : 0;
      } else {
        const id = this.cells[index], material = this.materials[id];
        if (id !== WALL && material) igniteCell(this, index, Number(material.temperature_of_fire) || 0, {force: true});
      }
    });
  }

  fillRect(x, y, width, height, id) {
    if (![x, y, width, height].every(Number.isFinite)) return;
    for (let row = Math.max(0, Math.floor(y)); row < Math.min(this.height, Math.ceil(y + height)); row++) {
      for (let column = Math.max(0, Math.floor(x)); column < Math.min(this.width, Math.ceil(x + width)); column++) {
        this.setCell(column, row, id);
      }
    }
  }

  paintCircle(x, y, radius, id, {replace = false} = {}) {
    if (![x, y, radius].every(Number.isFinite) || radius < 0) return;
    for (let row = Math.max(0, Math.floor(y - radius)); row <= Math.min(this.height - 1, Math.ceil(y + radius)); row++) {
      for (let column = Math.max(0, Math.floor(x - radius)); column <= Math.min(this.width - 1, Math.ceil(x + radius)); column++) {
        if ((column - x) ** 2 + (row - y) ** 2 > radius ** 2) continue;
        if (replace || this.cells[row * this.width + column] === EMPTY) this.setCell(column, row, id);
      }
    }
  }

  countMaterials() {
    const counts = new Map();
    for (const id of this.cells) if (id !== EMPTY && id !== WALL) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, count] of countDeferred(this)) counts.set(id, (counts.get(id) ?? 0) + count);
    return counts;
  }

  step(count = 1) {
    if (!Number.isInteger(count) || count < 0 || count > 10000) throw new RangeError('Step count must be an integer from 0 to 10,000.');
    for (let frame = 0; frame < count; frame++) {
      this._inStep = true;
      try {
        this.tick++;
        this.reactionScheduler.advance(this.effectRandom, this._forceFullUpdate);
        this._forceFullUpdate = false;
        this.effects = this.effects.filter(effect => this.tick - effect.tick < 12);
        if (this.processes) {
          for (let index = 0; index < this.cells.length; index++) {
            const id = this.cells[index];
            if (id !== EMPTY && id !== WALL && this.kind[id] !== 2) this.age[index]++;
          }
        }
        // Reaction cadence follows the native region scheduler. Movement still
        // scans the full tank instead of running parallel dirty rectangles.
        if (this.tick >= 0xffffffff) { this._updated.fill(0); this.tick = 1; }
        for (let y = this.height - 1; y >= 0; y--) {
          const rightward = (this.random.next() & 1) !== 0;
          for (let column = 0; column < this.width; column++) {
            const x = rightward ? column : this.width - 1 - column;
            let index = y * this.width + x;
            let id = this.cells[index];
            if (id === EMPTY || id === WALL) continue;
            const special = this.reactionScheduler.isNormal(index);
            let material = this.materials[id];
            if (this.burning[index] || this.kind[id] === 4
              || (this.kind[id] === 2 && this.gasIdle[index] < 100)
              || (material.liquid_slime && !this._attached[index])) this._markActive(index);
            // liquid_static sets the birth state. A sticky cell can later lose its support.
            const attached = this.kind[id] === 1 && this._attached[index] !== 0;
            const revision = this._revision[index];
            if (this.processes && attached) {
              const route = stepAttachedEnvironment(this, index, material, {special});
              if (route.index >= 0) {
                if (route.reaction) this._runReaction(route.index, route.reaction === 'fast');
                else if (route.burn) stepCellEnvironment(this, route.index, material, {special});
              }
              continue;
            }
            if (this.kind[id] === 1 && !attached) {
              if (!special && this._motion[index] === 3 && this._idle[index] > 49) continue;
            }
            if (this.kind[id] !== 4 && !attached) {
              if (this._updated[index] === this.tick) continue;
              this._updated[index] = this.tick;
            }
            if (this.kind[id] === 1 && !attached) {
              if (material.liquid_sand || material.liquid_slime) {
                if (this._motion[index] === 3) this._idle[index] = Math.min(51, this._idle[index] + 1);
                else this._idle[index] = 0;
              }
            }
            if (this.processes) {
              if (!attached && this.kind[id] === 1 && material.liquid_stains) stainContact(this, index, material);
              if (expireCell(this, index, material)) continue;
            }
            this._movingCell = index;
            this._activeDeferred = null;
            this._environmentReactionEligible[index] = 1;
            if (this.kind[id] === 2 || this.kind[id] === 4) {
              index = stepGasOrFire(this, index, material, {special, processes: this.processes});
            } else if (this.kind[id] === 1) {
              if (attached) {
                if (special && this.random.integer(100) < 20) this._releaseAttachment(index, material);
              }
              else if (material.liquid_sand) this._stepSand(index, material);
              else if (material.liquid_slime) this._stepSlime(index, material);
              else this._stepLiquid(index, material);
              index = this._movingCell;
            }
            if (index < 0 && this._activeDeferred) {
              if (this.processes) this._runDetachedCallbacks(this._activeDeferred, special);
              continue;
            }
            if (!this.processes || index < 0 || this.cells[index] === EMPTY || this._revision[index] !== revision) continue;
            id = this.cells[index];
            material = this.materials[id];
            if (this.kind[id] !== 2 && this.kind[id] !== 4) {
              index = stepCellEnvironment(this, index, material, {special});
            }
            if (index < 0 || this.cells[index] === EMPTY || this._revision[index] !== revision
              || !this._environmentReactionEligible[index]) continue;
            this._runReaction(index, this.kind[this.cells[index]] === 4 ? false : !special);
          }
        }
        flushMaterialCreations(this);
        flushBlobMutations(this, (world, command) => convertReactionBlob(world,
          world._index(command.x, command.y), command.input, command.output, command.radius, command.restricted));
        flushExplosions(this, applyReactionEffects);
        flushDeferred(this);
      } finally {
        this._inStep = false;
        this._committing = false;
        this._activeDeferred = null;
      }
    }
  }

  requestFullUpdate() { this._forceFullUpdate = true; }

  _markActive(index) {this.reactionScheduler.mark(index);}

  _runReaction(index, fast, source = undefined) {
    if (!this.contactReactions.rules.length && !this.warmth[index] && !this.cold[index]) return;
    const reaction = stepContactReactions(this.contactReactions, this, index, {fast, source});
    if (reaction) {
      this.reactionCount++;
      applyReactionEffects(this, reaction.effects);
    }
  }

  _runDetachedCallbacks(entry, special) {
    const world = this;
    const index = this._index(entry.x, entry.y);
    for (let field = 1; field < this._cellState.length; field++) this._cellState[field][index] = entry.values[field];
    const source = {
      get id() { return entry.id; },
      get age() { return world.age[index]; },
      get burning() { return world.burning[index]; },
      getState(name) { return world[name]?.[index] ?? 0; },
      setState(name, value) { if (world[name]) world[name][index] = value; },
      replace(output) {
        if (output === entry.id) return false;
        const color = formationColor(world.materials[entry.id], world.materials[output]);
        if (output !== EMPTY && convertCellEnvironment(world, index,
          world.materials[entry.id], world.materials[output])) {
          entry.id = output;
          if (world.kind[output] === 1 || world.kind[output] === 3) {
            world.colorOrigin[index] = index;
            world.colorMaterial[index] = output;
            world.formationColor[index] = color;
            world.stain[index] = null;
          }
          world.hp[index] = Math.max(0, Math.trunc(Number(world.materials[output].hardness) || 0));
          world._changedAt[index] = world.tick;
          world._revision[index] = ++world._nextRevision;
        } else {
          queueMaterialCreation(world, index, output, color ? {formationColor: color} : undefined);
        }
        return true;
      },
    };
    try {
      stepCellEnvironment(this, index, this.materials[entry.id], {special, source});
      if (this._environmentReactionEligible[index]) this._runReaction(index, !special, source);
    } finally {
      entry.values[0] = entry.id;
      for (let field = 1; field < this._cellState.length; field++) {
        entry.values[field] = this._cellState[field][index];
        this._cellState[field][index] = 0;
      }
      entry.tick = this.tick;
    }
  }

  _wakeLiquid(x, y) {
    const index = this._index(x, y);
    if (index >= 0 && this.kind[this.cells[index]] === 1) {
      this._idle[index] = Math.min(45, this._idle[index]);
      this._markActive(index);
    }
  }

  _index(x, y) {
    return x < 0 || y < 0 || x >= this.width || y >= this.height ? -1 : y * this.width + x;
  }

  _canEnter(source, target) {
    if (target < 0) return false;
    const id = this.cells[target];
    if (id === EMPTY) return true;
    if (id === WALL) { this.random.integer(100); return false; }
    if (this.kind[id] === 2 || this.kind[id] === 4) return true;
    if (this.kind[id] === 3) { this.random.integer(100); return false; }
    return canDisplaceLiquid(this.materials[this.cells[source]], this.materials[id], this.random);
  }

  // Keep the cell's movement and environment state together.
  _swap(source, target) {
    this._markActive(source); this._markActive(target);
    const displaced = this.cells[target];
    this.cells[target] = this.cells[source];
    this.cells[source] = displaced;
    const stain = this.stain[target];
    this.stain[target] = this.stain[source];
    this.stain[source] = stain;
    for (const words of this._wordFields) {
      const value = words[target];
      words[target] = words[source];
      words[source] = value;
    }
    for (const bytes of this._byteFields) {
      const value = bytes[target];
      bytes[target] = bytes[source];
      bytes[source] = value;
    }
    if (this._movingCell === source) this._movingCell = target;
    else if (this._movingCell === target) this._movingCell = source;
    if (this.kind[this.cells[target]] === 1 && this._idle[target]) this._idle[target]--;
    return target;
  }

  _occupied(x, y) {
    const index = this._index(x, y);
    return index < 0 || this.cells[index] !== EMPTY;
  }

  _sandSupport(index, attachment = false) {
    const id = this.cells[index];
    if (this.kind[id] !== 1) return false;
    if (this._attached[index]) return true;
    const mat = this.materials[id], motion = this._motion[index];
    if (!mat.liquid_sand || mat.liquid_sand_never_box2d) return false;
    if (!attachment) return motion === 3;
    return mat.liquid_sticks_to_ceiling !== 0 && ((motion === 3 && this._idle[index] >= 20) || (motion >= 5 && motion <= 7));
  }

  _releaseAttachment(index, material) {
    if (material.liquid_sticks_to_ceiling <= 0) return false;
    const x = index % this.width, y = Math.floor(index / this.width);
    const direction = (this._attached[index] || 2) - 2;
    const support = this._index(x + direction, y - (direction === 0 ? 1 : 0));
    const motion = this._motion[support];
    const hooked = this.kind[this.cells[support]] === 1 && motion >= 5 && motion <= 7;
    if (hooked || this._sandSupport(support, true)) {
      if (this.random.integer(100) >= material.liquid_sticks_to_ceiling || this._occupied(x, y + 1)) return false;
    }
    this._attached[index] = 0;
    this._markActive(index);
    return true;
  }

  // Sand-like liquid branch, 0x0070b2d0. This is used by the two fading plasma
  // liquids as well as the game's powder materials (not part of this catalog).
  _stepSand(index, material) {
    let x = index % this.width, y = Math.floor(index / this.width);
    if (material.liquid_sticks_to_ceiling > 0) {
      const direction = attachmentDirection(x, y);
      const support = this._index(x + direction, y - (direction === 0 ? 1 : 0));
      if (this.materials[this.cells[support]]?.liquid_sand && this._sandSupport(support, true)) {
        this._attached[index] = direction + 2;
        this._motion[index] = 6 - direction;
        return;
      }
    }
    const falling = this._motion[index] === 1;
    if (falling && f32(this.random.next() / 32767) < f32(f32(1 - material.liquid_gravity) * .5)) return;
    const below = this._index(x, y + 1);
    if (this._canEnter(index, below)) {
      this._wakeLiquid(x, y - 1);
      index = this._swap(index, below);
      y++;
      this._motion[index] = 1;
      if (!falling) {
        this.vertical[index] = 0;
        this._deferBlockedCell(index, this._index(x, y + 1));
        return;
      }
      this.vertical[index] = f32(this.vertical[index] + f32(material.liquid_gravity * .25));
      let remaining = f32(this.vertical[index] - 1), drift = 0;
      while (remaining > 0) {
        if (this.random.integer(127) < 64) {
          const choice = this.random.integer(7);
          drift = choice === 1 ? -1 : choice === 2 ? 1 : 0;
        }
        const next = this._index(x + drift, y + 1);
        if (!this._canEnter(index, next)) {
          if (next >= 0 && !this._deferBlockedCell(index, next)) this.vertical[index] = 0;
          break;
        }
        index = this._swap(index, next);
        x += drift; y++;
        remaining = f32(remaining - 2);
      }
      return;
    }
    if (allowsSandSlide(material.liquid_viscosity, this.random)) {
      for (const direction of [-1, 1]) {
        const next = this._index(x + direction, y + 1);
        if (!this._canEnter(index, next)) continue;
        this._wakeLiquid(x, y - 1);
        index = this._swap(index, next);
        this._motion[index] = 1;
        return;
      }
    }
    if (this._occupied(x - 1, y) && this._occupied(x + 1, y)) this._motion[index] = 3;
  }

  // Slime branch, 0x0070b7c0. Its sideways speed is the native constant 0.9;
  // ordinary-liquid flow_speed/damping do not apply to this branch.
  _stepSlime(index, material) {
    let x = index % this.width, y = Math.floor(index / this.width);
    let drift = 0;
    const preferred = this.random.integer(1) === 0 ? 1 : -1;
    for (const direction of [preferred, -preferred]) {
      if (this._occupied(x + direction, y) && this._canEnter(index, this._index(x + direction, y + 1))) {
        drift = direction;
        this.horizontal[index] = direction;
        break;
      }
    }
    let next = this._index(x + drift, y + 1);
    if (this._canEnter(index, next)) {
      this._wakeLiquid(x, y - 1);
      index = this._swap(index, next);
      x += drift; y++;
      if (this._sandSupport(this._index(x, y - 1))) return;
      const falling = this._motion[index] === 1;
      this._motion[index] = 1;
      if (!falling) { this.vertical[index] = 0; return; }
      this.vertical[index] = f32(this.vertical[index] + f32(material.liquid_gravity * .25));
      let remaining = f32(this.vertical[index] - 1);
      while (remaining > 0) {
        if (this.random.integer(127) < 12) {
          const choice = this.random.integer(7);
          drift = choice === 1 ? -1 : choice === 2 ? 1 : 0;
        }
        next = this._index(x + drift, y + 1);
        if (!this._canEnter(index, next)) { this.vertical[index] = 0; break; }
        index = this._swap(index, next);
        x += drift; y++;
        remaining = f32(remaining - 2);
      }
      return;
    }
    if (!allowsSlimeSlide(material.liquid_viscosity, this.random)) return;
    for (const direction of [-1, 1]) {
      next = this._index(x + direction, y + 1);
      if (!this._canEnter(index, next)) continue;
      this._wakeLiquid(x, y - 1);
      index = this._swap(index, next);
      this._motion[index] = 1;
      return;
    }
    const left = this._occupied(x - 1, y), right = this._occupied(x + 1, y);
    if (left !== right) {
      const direction = left ? 1 : -1;
      this.horizontal[index] = f32(this.horizontal[index] + f32(direction * .9));
      if (Math.abs(this.horizontal[index]) >= 1) {
        next = this._index(x + direction, y);
        if (next >= 0) {
          index = this._swap(index, next);
          this.horizontal[index] = f32(this.horizontal[index] - direction);
        }
      }
      this._motion[index] = 2;
    } else if (left && right) {
      this._motion[index] = 3;
    }
  }

  // Ordinary-liquid movement, reconstructed from CLiquidCell 0x0070bdc0.
  _stepLiquid(index, material) {
    let x = index % this.width, y = Math.floor(index / this.width);
    let fell = false, flowed = false;
    const canDefer = this.vertical[index] >= f32(material.liquid_gravity * .25);
    let below = this._index(x, y + 1);
    if (this._canEnter(index, below)) {
      this._wakeLiquid(x, y - 1);
      index = this._swap(index, below);
      y++;
      fell = true;
      this.vertical[index] = f32(this.vertical[index] + f32(material.liquid_gravity * .25));
      let remaining = f32(this.vertical[index] - 1);
      let drift = 0;
      while (remaining > 0) {
        if (this.random.integer(127) < 64) {
          if (Math.abs(this.horizontal[index]) >= 1) drift = this.horizontal[index] < 0 ? -1 : 1;
          else {
            const choice = this.random.integer(7);
            drift = choice === 1 ? -1 : choice === 2 ? 1 : 0;
          }
        }
        const next = this._index(x + drift, y + 1);
        if (!this._canEnter(index, next)) {
          if (canDefer && this._deferBlockedCell(index, next)) return -1;
          this.vertical[index] = 0;
          break;
        }
        index = this._swap(index, next);
        x += drift;
        y++;
        remaining = f32(remaining - 2);
      }
    } else {
      if (canDefer && this._deferBlockedCell(index, below)) return -1;
      this.vertical[index] = 0;
    }

    below = this._index(x, y + 1);
    if (!this._canEnter(index, below) && (below < 0 || this.cells[below] === WALL || this.vertical[below] <= 0)) {
      const left = this._index(x - 1, y), right = this._index(x + 1, y);
      // These calls intentionally consume independent native RNG samples.
      if (this._canEnter(index, right) && !this._canEnter(index, left)) {
        this._wakeLiquid(x - 1, y);
        this.horizontal[index] = f32(this.horizontal[index] + material.liquid_flow_speed);
        if (this.horizontal[index] >= 1) {
          index = this._swap(index, right);
          x++;
          this.horizontal[index] = f32(this.horizontal[index] * material.liquid_damping);
          flowed = true;
        }
      } else if (this._canEnter(index, left) && !this._canEnter(index, right)) {
        this._wakeLiquid(x + 1, y);
        this.horizontal[index] = f32(this.horizontal[index] - material.liquid_flow_speed);
        if (this.horizontal[index] <= -1) {
          index = this._swap(index, left);
          x--;
          this.horizontal[index] = f32(this.horizontal[index] * material.liquid_damping);
          flowed = true;
        }
      }
    }

    if (Math.abs(this.horizontal[index]) >= 1) {
      const direction = this.horizontal[index] > 0 ? 1 : -1;
      const fromX = x;
      // Damping is applied after each one-pixel move, not once per frame.
      // The world boundary also bounds damping=1 or >1 material definitions.
      for (let moves = 0; moves < this.width && Math.abs(this.horizontal[index]) >= 1; moves++) {
        const next = this._index(x + direction, y);
        if (!this._canEnter(index, next)) break;
        index = this._swap(index, next);
        x += direction;
        this.horizontal[index] = f32(this.horizontal[index] * material.liquid_damping);
        flowed = true;
      }
      if (flowed) this._wakeLiquid(fromX - direction, y);
    } else if (!fell && !flowed && !this._canEnter(index, this._index(x, y + 1))) {
      const direction = this.random.integer(1) ? -1 : 1;
      for (const side of [direction, -direction]) {
        const next = this._index(x + side, y + 1);
        if (!this._canEnter(index, next)) continue;
        this.horizontal[index] = side;
        this._wakeLiquid(x - side, y - 1);
        index = this._swap(index, next);
        x += side;
        y++;
        fell = true;
        break;
      }
    }
    if (fell || flowed) {
      this._wakeLiquid(x, y + 1);
      this._idle[index] = 0;
      this._motion[index] = fell ? (this.vertical[index] >= 4 ? 8 : 1) : 2;
    } else {
      this._motion[index] = 3;
      if (this._idle[index] < 5) {this._idle[index]++; this._markActive(index);}
    }
    return index;
  }

  _deferBlockedCell(index, target) {
    const queued = target >= 0 && this.kind[this.cells[target]] === 1
      && this._updated[target] < this._updated[index] && this.vertical[target] > 0
      && defer(this, index);
    if (queued) this._activeDeferred = this._deferredState.pending.at(-1);
    return queued;
  }
}
