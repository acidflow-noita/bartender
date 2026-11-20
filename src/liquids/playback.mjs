export const LIQUID_TICK_MS = 1000 / 60;

// Simulation time advances in fixed native-sized ticks, independent of display refresh.
// Drop excess wall-clock time after a stall instead of fast-forwarding the experiment.
export function createLiquidPlayback({step, draw, beforeStep = () => {},
  requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id),
  paused = false, hidden = false}) {
  let frame = null, previous = null, accumulated = 0, disposed = false, dirty = false;
  const advance = () => {beforeStep(); step();};
  const schedule = () => {if (!disposed && !hidden && (!paused || dirty) && frame === null) frame = requestFrame(update);};
  const update = time => {
    frame = null;
    if (disposed || hidden) return;
    if (!paused) {
      if (previous === null) dirty = true;
      else accumulated += Math.min(100, Math.max(0, time - previous));
      previous = time;
      // Round to the nearest tick so small 60 Hz vsync jitter does not alternate between zero and two steps.
      while (accumulated + 1e-7 >= LIQUID_TICK_MS / 2) {
        advance(); accumulated -= LIQUID_TICK_MS; dirty = true;
      }
    }
    if (dirty) {dirty = false; draw();}
    schedule();
  };
  const resetTime = () => {previous = null; accumulated = 0;};
  const stopFrame = () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    resetTime();
  };
  const setPaused = value => {
    paused = !!value;
    stopFrame();
    dirty = false; draw(); schedule();
  };
  schedule();
  return {
    get paused() {return paused;},
    setPaused,
    setHidden(value) {
      hidden = !!value;
      stopFrame();
      schedule();
    },
    resetTime,
    requestDraw() {dirty = true; schedule();},
    step() {paused = true; stopFrame(); advance(); dirty = false; draw();},
    dispose() {disposed = true; if (frame !== null) cancelFrame(frame); frame = null;},
  };
}
