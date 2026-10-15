# <a href="https://bartender.runfast.stream"><img src="https://github.com/user-attachments/assets/361c6fad-4b66-4ae9-993f-3470aa6a5612" width="200"> https://bartender.runfast.stream</a>

Explore Noita materials and mixology

All materials, spells, and tools are available to everyone. No account is required.

Built with [Observable Framework](https://observablehq.com/framework/).

### How to

Install

```bash
git submodule update --init --recursive
npm ci
```

Launch local dev copy

```bash
npm run clean && npm run build && npm run dev
```

For everyday development, `npm run dev` is enough; it watches source changes.
Run `npm run build` when you want to check the production output.

### Windows: npm points to a missing installation

If npm fails with `Cannot find module '...hermes/node/node_modules/npm/bin/npm-cli.js'`,
PowerShell is finding an incomplete Hermes npm installation. With NVM for Windows,
put its active Node installation first in the current terminal's PATH:

```powershell
$env:Path = "$env:NVM_SYMLINK;$env:Path"
Get-Command node,npm
npm --version
npm ci
npm run dev
```

`NVM_SYMLINK` must point to the active NVM installation (for example,
`C:\nvm4w\nodejs`). For a persistent fix, place that directory before
`%LOCALAPPDATA%\hermes\node` in your Windows user PATH, then restart the terminal
and its parent editor. Missing `observable` or `rimraf` commands mean the project
dependencies need installing with `npm ci`.

### Digging data

Rebuild the spell catalog offline from the checked-in projectile XML, action
definitions, component dump, and image metadata:

```bash
node src/data/FULL_SPELLS_FINAL.json.js
npm test
npm run build
```

The exporter keeps the cast entity's full path, preserves fractional physical
values, and separates explosion, beam, penetration, cell-eating, conversion,
motion, and secondary-projectile settings. Source identities, component defaults,
and verified script lifecycles are recorded in `src/data/raw_data/component-defaults.json`,
`digging-lifecycles.json`, and `digging-source-hashes.json`. Missing or conflicting
values remain unknown. The older runtime component dump has no recorded build
identity. `--game-data /path/to/extracted/data` selects another XML tree; source
hashes prevent reusing verified script behavior with changed sources.

The digging page starts with empty selections and includes both selected IDs
in shared links. Its full-width preview is 200–280px tall, with Minä at mid-height
near the left edge, facing right. **Fit whole effect** scales the preview and
Minä together.

Explosions use a circular size estimate: the smaller of the configured radius
and whole fresh-cell hardness payments covered by ray energy. Durability can
block removal. The former 360-ray contour reconstruction was removed from the
preview because it had not been validated against in-game crater shapes; it must
not be treated as an exact prediction. Native evidence remains in the ignored
analysis artifacts for further investigation.

Luminous Drill has a 1px penetration trace. Traveling cell eaters sweep their
diameter along an example rightward cast. Motion includes gravity, signed air
friction, terminal speed, lifetime and penetration slowdown at 60 updates per
second. The preview uses midpoint launch speed and base lifetime; the numerical
range still evaluates speed/lifetime endpoints and both force/movement orders.
Their relative scheduling has not been established. A second trail is not drawn.
Confirmed penetration cells remain cut out even if the simulation stops before
an unresolved bounce. Probabilistic cell eating uses a fixed dither to illustrate
partial removal, not the game's RNG or a guaranteed final pattern.

Bombs retain circular impact estimates. Conversion, corrosion, growing fields,
and secondary effects retain their own rules rather than combining their radii.
Beam width and maximum length remain settings, not measured digging depth.

The penetration contact rule was checked in the Jan 25, 2025 executable
(SHA-256 `a0d9f9ca513e27a598c61dd9a19211c7a11d1477c9a2b93d909757d91d17d914`)
at `0xc08a30`, with its coefficient/mass binding at `0xc0757a`. The page shows
the unmodified launch-speed range and first-cell damage, using float32 arithmetic;
repeated-hit counts assume identical contacts with the same cell. Actual flight,
acceleration, direction, modifiers and existing damage can change the result.
The beam contact helper is `0xb95ab0`; explosion ray budgeting is `0x656b10`,
called for 360 directions by `0x657960`. These checks establish the local rules,
not a complete simulation of a cast. Local analysis artifacts are retained in
the ignored `task/digging-native/` directory for reuse without sharing a live
Ghidra project.

### Fungal source updates

The fungal logic comes from the pinned Git submodule at
`src/vendor/noita-fungal`. Clone with `git clone --recurse-submodules` or run
the initialization command above. Deployments must initialize submodules too.

Observable Framework 1.13 preview serves local `.js` modules, but upstream uses
`.mjs`. The `predev`, `prebuild`, `pretest`, and `predeploy` hooks automatically
run `scripts/prepare-fungal.mjs`. This creates ignored files in
`src/fungal/_upstream/`, changing **only relative import extensions**. Do not edit
these generated files; the submodule is the source of truth. To regenerate while
a preview server is already running, use `npm run fungal:prepare`.

To pull a new upstream revision deliberately:

```bash
git submodule update --init --remote -- src/vendor/noita-fungal
git diff --submodule=log -- src/vendor/noita-fungal
```

Review its patches and adapt the UI to any changed data shape. Then regenerate
the source-only reference fixtures with `node tests/generate-fungal-ui-fixtures.mjs`
and run `npm test` and `npm run build`. Review the fixture changes before committing
the submodule pointer and adapters together. Do not edit the submodule or make
hand-maintained copies of its solver. Normal builds use the committed revision, not the
latest remote branch. See [parity checks](tests/FUNGAL_PARITY.md).
