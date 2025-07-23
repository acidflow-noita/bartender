/**
 * Authentication utilities for protected pages
 */

// htl.html is available globally in Observable Framework

const AUTH_API_BASE = "https://bartender-auth-test.wuote.workers.dev";

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
      const response = await fetch(`${AUTH_API_BASE}/auth/check`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        this.authState = { ...data, loading: false };
      } else {
        this.authState = { authenticated: false, loading: false };
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      // In case of network error, assume not authenticated but don't block the page
      this.authState = { authenticated: false, loading: false, error: true };
    }

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

// Auth guard function for protected pages
export async function checkAuthAndRender(contentCallback) {
  const state = await authManager.checkAuth();

  if (state.loading) {
    return htl.html`<div class="auth-loading">
      <div class="spinner"></div>
      <p>Checking authentication...</p>
    </div>`;
  }

  // If there's an error (e.g., auth service unavailable), show error message
  if (state.error) {
    return htl.html`<div class="auth-required">
      <div class="auth-card">
        <h2>⚠️ Authentication Service Unavailable</h2>
        <p>Unable to verify authentication status. Please try again later.</p>
        <p>If the problem persists, contact support.</p>
        <button
          onclick="window.location.reload()"
          class="auth-button"
        >
          Retry
        </button>
      </div>
    </div>`;
  }

  if (!state.authenticated) {
    return htl.html`<div class="auth-required">
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
          onclick="window.authManager.login()"
          class="auth-button"
        >
          Sign in with Twitch
        </button>
      </div>
    </div>`;
  }

  if (state.authenticated && !state.isFollower) {
    return htl.html`<div class="auth-required">
      <div class="auth-card">
        <h2>👋 Thanks for signing in, ${state.username}!</h2>
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
          onclick="window.location.reload()"
          class="auth-button"
        >
          Refresh after following
        </button>
      </div>
    </div>`;
  }

  // User is authenticated and authorized, render the content
  return contentCallback ? contentCallback() : null;
}

// Alternative auth guard class for different usage patterns
export class AuthGuard {
  constructor() {
    this.authManager = authManager;
  }

  async render() {
    const state = await this.authManager.checkAuth();

    if (state.loading) {
      return htl.html`<div class="auth-loading">
        <div class="spinner"></div>
        <p>Checking authentication...</p>
      </div>`;
    }

    if (!state.authenticated) {
      return htl.html`<div class="auth-required">
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
            onclick="window.authManager.login()"
            class="auth-button"
          >
            Sign in with Twitch
          </button>
        </div>
      </div>`;
    }

    if (state.authenticated && !state.isFollower) {
      return htl.html`<div class="auth-required">
        <div class="auth-card">
          <h2>👋 Thanks for signing in, ${state.username}!</h2>
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
            onclick="window.location.reload()"
            class="auth-button"
          >
            Refresh after following
          </button>
        </div>
      </div>`;
    }

    // User is authenticated and authorized, return null to continue
    return null;
  }
}

// Factory function for creating auth guards
export function createAuthGuard() {
  return new AuthGuard();
}

// Make auth manager globally available
if (typeof window !== "undefined") {
  window.authManager = authManager;
}

// Auth status display function
export async function renderAuthStatus() {
  const state = await authManager.checkAuth();
  const container = document.getElementById("auth-status-container");

  if (!container) return;

  if (state.loading) {
    container.innerHTML = `<div class="auth-status loading">...</div>`;
    return;
  }

  if (state.authenticated) {
    container.innerHTML = `<div class="auth-status authenticated">
      <span>👋 ${state.username}</span>
      <button
        onclick="window.authManager.logout()"
        class="auth-logout-btn"
      >
        Logout
      </button>
    </div>`;
    return;
  }

  container.innerHTML = `<div class="auth-status">
    <button
      onclick="window.authManager.login()"
      class="auth-login-btn"
    >
      Sign in with Twitch
    </button>
  </div>`;
}
