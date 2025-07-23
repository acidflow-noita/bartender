/**
 * Auth status component for the site header
 */

import { authManager } from "./auth.js";

export function createHeaderAuthStatus() {
  let currentState = { loading: true, authenticated: false };

  // Check auth status on load
  authManager.checkAuth().then((state) => {
    currentState = state;
    updateDisplay();
  });

  // Subscribe to auth state changes
  authManager.subscribe((state) => {
    currentState = state;
    updateDisplay();
  });

  function updateDisplay() {
    const container = document.getElementById("auth-status-container");
    if (!container) return;

    if (currentState.loading) {
      container.innerHTML = `
        <div class="auth-status loading">
          <span>...</span>
        </div>
      `;
      return;
    }

    if (currentState.authenticated) {
      container.innerHTML = `
        <div class="auth-status authenticated">
          <span>👋 ${currentState.username}</span>
          <button onclick="authManager.logout()" class="auth-logout-btn">
            Logout
          </button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="auth-status">
          <button onclick="authManager.login()" class="auth-login-btn">
            Sign in with Twitch
          </button>
        </div>
      `;
    }
  }

  return {
    render() {
      return html`<div id="auth-status-container"></div>`;
    },
  };
}
