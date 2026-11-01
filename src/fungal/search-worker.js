import { sourceState, advanceSearch, searchProgress } from "./engine.js";

let timer;
let state;
let sent = 0;
self.onmessage = ({data}) => {
  clearTimeout(timer);
  if (data.type !== "start") return;
  try {
    state = sourceState(data.seed, data.constraints, data.mode);
    sent = 0;
    tick();
  } catch (error) {
    self.postMessage({type: "error", message: error.message});
  }
};

function tick() {
  try {
    const deadline = performance.now() + 20;
    do { advanceSearch(state); } while (!state.finished && performance.now() < deadline);
    // Send all new source recipes in their original order, without truncation,
    // sorting or altered held materials. The model validates each returned
    // sequence before presenting it as a solution.
    self.postMessage({type: "progress", progress: searchProgress(state), recipes: state.solutions.slice(sent)});
    sent = state.solutions.length;
    if (!state.finished) timer = setTimeout(tick, 0);
  } catch (error) {
    self.postMessage({type: "error", message: error.message});
  }
}
