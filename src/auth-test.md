---
title: Auth Test Page
draft: false
---

# Auth Test Page

This is a simple test page to verify authentication is working.

```js
import { authManager } from "./components/auth.js";
import { html } from "htl";
```

```js
// Check auth status
const authState = await authManager.checkAuth();
```

## Current Auth Status

**Loading:** ${authState.loading}  
**Authenticated:** ${authState.authenticated}  
**Username:** ${authState.username || "N/A"}  
**Is Follower:** ${authState.isFollower || false}  
**Error:** ${authState.error || false}

```js
// Auth controls
const loginButton = html`<button onclick="window.authManager.login()">Login with Twitch</button>`;
const logoutButton = html`<button onclick="window.authManager.logout()">Logout</button>`;
```

## Auth Controls

${authState.authenticated ? logoutButton : loginButton}

## Debug Info

```js
// Show cookies for debugging
const cookies = document.cookie;
display(html`<pre>Cookies: ${cookies}</pre>`);
```

```js
// Test API endpoint directly
const testApiButton = html`<button onclick="testAuthAPI()">Test Auth API</button>`;
const testResult = html`<div id="test-result"></div>`;

// Add test function to window
window.testAuthAPI = async function () {
  const resultDiv = document.getElementById("test-result");
  try {
    const response = await fetch("https://bartender-auth-test.wuote.workers.dev/auth/check", {
      credentials: "include",
    });
    const data = await response.json();
    resultDiv.innerHTML = `<pre>API Response: ${JSON.stringify(data, null, 2)}</pre>`;
  } catch (error) {
    resultDiv.innerHTML = `<pre>Error: ${error.message}</pre>`;
  }
};
```

${testApiButton}
${testResult}
