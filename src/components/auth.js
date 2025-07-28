/**
 * Authentication utilities for protected pages
 */

import { html } from "htl";

// Environment-aware auth API base URL
const AUTH_API_BASE = (() => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    // Local development (localhost:3000) - uses test auth worker
    if (hostname === "localhost") {
      return "https://bartender-auth-test.wuote.workers.dev";
    }

    // Dev/test environment (auth-test-bartender.wuote.workers.dev) - uses test auth worker
    if (hostname.includes("auth-test-bartender")) {
      return "https://bartender-auth-test.wuote.workers.dev";
    }
  }

  // Production default - production auth worker
  return "https://bartender-auth.wuote.workers.dev";
})();

export class AuthManager {
  constructor() {
    this.authState = {
      authenticated: false,
      username: null,
      isFollower: false,
      loading: true,
    };
    this.listeners = [];
  }

  async checkAuth() {
    try {
      console.log("Checking auth...");
      const response = await fetch(`${AUTH_API_BASE}/auth/check`, {
        credentials: "include",
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("Auth check response:", response.status, response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log("Auth data received:", data);

        // Special case: if username is "wuote", grant full access regardless of follower status
        if (data.username && data.username.toLowerCase() === "wuote") {
          data.isFollower = true;
          console.log("Granting full access to wuote");
        }

        this.authState = { ...data, loading: false };
      } else {
        console.log("Auth check failed with status:", response.status);
        this.authState = { authenticated: false, loading: false };
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      // In case of network error, assume not authenticated but don't block the page
      this.authState = { authenticated: false, loading: false, error: true };
    }

    console.log("Final auth state:", this.authState);
    this.notifyListeners();
    return this.authState;
  }

  async login() {
    window.location.href = `${AUTH_API_BASE}/auth/login`;
  }

  async logout() {
    try {
      await fetch(`${AUTH_API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      this.authState = { authenticated: false, loading: false };
      this.notifyListeners();

      // Redirect to home
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach((callback) => callback(this.authState));
  }

  getState() {
    return this.authState;
  }
}

// Global auth manager instance
export const authManager = new AuthManager();

// Alternative auth guard class for different usage patterns
export class AuthGuard {
  constructor() {
    this.authManager = authManager;
  }

  async render() {
    const state = await this.authManager.checkAuth();

    if (state.loading) {
      return html`<div class="auth-loading">
        <div class="spinner"></div>
        <p>Checking authentication...</p>
      </div>`;
    }

    if (!state.authenticated) {
      return html`<div class="auth-required">
        <div class="auth-card">
          <h2>🔒 Follower-Only Content</h2>
          <p>This page is exclusive to <strong>WUOTE's Twitch followers</strong>.</p>
          <p>
            Follow
            <a
              href="https://www.twitch.tv/wuote"
              target="_blank"
              >@WUOTE on Twitch</a
            >
            and sign in to access this content.
          </p>
          <button
            onclick="window.authLogin && window.authLogin()"
            class="auth-button"
          >
            Sign in with Twitch
          </button>
        </div>
      </div>`;
    }

    if (state.authenticated && !state.isFollower) {
      return html`<div class="auth-required">
        <div class="auth-card">
          <h2>Thanks for signing in, ${state.username}!</h2>
          <p>This content is exclusive to <strong>WUOTE's Twitch followers</strong>.</p>
          <p>
            Please
            <a
              href="https://www.twitch.tv/wuote"
              target="_blank"
              >follow @WUOTE on Twitch</a
            >
            to access this page.
          </p>
          <button
            onclick="window.authCheck && window.authCheck().then(() => window.location.reload())"
            class="auth-button"
          >
            Check Follower Status
          </button>
        </div>
      </div>`;
    }

    // User is authenticated and authorized, return empty string to continue
    return "";
  }
}

// Factory function for creating auth guards
export function createAuthGuard() {
  return new AuthGuard();
}

// Auth check and render function for pages that need it
export async function checkAuthAndRender() {
  const authGuard = new AuthGuard();
  return await authGuard.render();
}

// Make auth manager globally available
if (typeof window !== "undefined") {
  window.authManager = authManager;

  // Also ensure it's available for onclick handlers
  window.authLogin = () => authManager.login();
  window.authLogout = () => authManager.logout();
  window.authCheck = () => authManager.checkAuth();
}

// Auth status display function
export async function renderAuthStatus() {
  const container = document.getElementById("auth-status-container");
  if (!container) {
    console.log("No auth-status-container found");
    return;
  }

  console.log("Setting up auth status rendering");

  // Subscribe to auth state changes to update UI automatically
  const unsubscribe = authManager.subscribe((state) => {
    console.log("Auth state changed, updating UI:", state);
    updateAuthStatusUI(container, state);
  });

  // Check for auth callback success in URL first
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("auth") === "success") {
    console.log("Auth success detected in URL");
    // Remove the parameter from URL
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete("auth");
    window.history.replaceState({}, "", newUrl);

    // Force a re-check of auth status after callback
    setTimeout(async () => {
      console.log("Re-checking auth after callback");
      await authManager.checkAuth();
      // Force page reload to update all data
      window.location.reload();
    }, 1000);
  }

  // Initial render
  console.log("Performing initial auth check");
  const state = await authManager.checkAuth();
  updateAuthStatusUI(container, state);

  // Return unsubscribe function for cleanup if needed
  return unsubscribe;
}

function updateAuthStatusUI(container, state) {
  console.log("Updating auth UI with state:", state);

  if (state.loading) {
    container.innerHTML = `<div class="auth-status loading">Checking auth...</div>`;
    return;
  }

  if (state.authenticated && state.isFollower) {
    console.log("Rendering authenticated follower UI");
    container.innerHTML = `<div class="auth-status authenticated">
      <span>${state.username}</span>
      <button
        onclick="window.authLogout && window.authLogout()"
        class="auth-logout-btn"
      >
        Logout
      </button>
    </div>`;
    return;
  }

  if (state.authenticated && !state.isFollower) {
    console.log("Rendering authenticated non-follower UI");
    container.innerHTML = `<div class="auth-status not-follower">
      <span>${state.username} (not following)</span>
      <button
        onclick="window.authLogout && window.authLogout()"
        class="auth-logout-btn"
      >
        Logout
      </button>
    </div>`;
    return;
  }

  console.log("Rendering login button");
  container.innerHTML = `<div class="auth-status">
    <button
      onclick="window.authLogin && window.authLogin()"
      class="auth-login-btn"
    >
      Sign in with Twitch
    </button>
  </div>`;
}
