---
title: Streamer Wands Integration
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Streamer Wands Integration</h1>
<h2>Work in progress: fetching inventory data directly from <a href="https://onlywands.com/">streamer wands</a>.</h2>

```js
// Load JSON data
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const reactions = await FileAttachment("./data/jsons/reactions.json").json();
const tags = await FileAttachment("./data/material_tags_with_descriptions.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

<div class="grid grid-cols-4">
  <div class="card grid-colspan-1 grid-rowspan-1">
    <input id="usernameInput" placeholder="Enter your Twitch username" value="WUOTE" />
    <button id="submitButton">Submit</button>
    <h2 id="statusElement">Not connected</h2>
  </div>
  <div class="card grid-colspan-3 grid-rowspan-1">
    <div id="dataElement" class="data-display"></div>
  </div>
</div>

```js
// Get DOM elements
const usernameInput = document.getElementById("usernameInput");
const submitButton = document.getElementById("submitButton");
const statusElement = document.getElementById("statusElement");
const dataElement = document.getElementById("dataElement");

let currentWs = null;

const setupWebSocket = (playerNameValue) => {
  // Close existing connection if any
  if (currentWs) {
    currentWs.close();
  }

  const ws = new WebSocket(`wss://onlywands.com/client=${playerNameValue}`);
  currentWs = ws;

  ws.onopen = () => {
    statusElement.textContent = "WebSocket connection established";
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    dataElement.textContent = JSON.stringify(data.items, null, 2);
  };

  ws.onerror = (error) => {
    statusElement.textContent = `WebSocket error: ${error.message}`;
  };

  ws.onclose = () => {
    statusElement.textContent = "WebSocket connection closed";
    dataElement.textContent = "";
  };
};

// Handle WebSocket connection on submit button press
submitButton.addEventListener("click", () => {
  setupWebSocket(usernameInput.value);
});
```
