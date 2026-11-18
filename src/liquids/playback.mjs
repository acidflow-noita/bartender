export const LIQUID_TICK_MS = 1000 / 60;

// Simulation time advances in fixed native-sized ticks, independent of display refresh.
// Drop excess wall-clock time after a stall instead of fast-forwarding the experiment.
export function createLiquidPlayback({step, draw, beforeStep = () => {},
  requestFrame = callback => requestAnimationFrame(callback), cancelFrame = id => cancelAnimationFrame(id),
  paused = false, hidden = false}) {
  let frame = null, previous = null, accumulated = 0, disposed = false;
  const advance = () => {beforeStep(); step();};
  const schedule = () => {if (!disposed && !paused && !hidden && frame === null) frame = requestFrame(update);};
  const update = time => {
    frame = null;
    if (disposed || paused || hidden) return;
    if (previous !== null) accumulated += Math.min(100, Math.max(0, time - previous));
    previous = time;
    while (accumulated + 1e-7 >= LIQUID_TICK_MS) {
      advance(); accumulated -= LIQUID_TICK_MS;
    }
    draw(); schedule();
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
    draw(); schedule();
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
    step() {setPaused(true); advance(); draw();},
    dispose() {disposed = true; if (frame !== null) cancelFrame(frame); frame = null;},
  };
}
