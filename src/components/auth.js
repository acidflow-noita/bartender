/**
 * Authentication utilities for protected pages
 */

import { html } from "htl";

// Environment-aware auth API base URL
const AUTH_API_BASE = (() => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    // Local development (localhost:3000) - uses local auth worker
    if (hostname === "localhost") {
      return "http://localhost:8787";
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
    this.checkAuthPromise = null;
    this.cacheKey = "bartender_auth_cache";
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour cache
  }

  // Check if cached auth data is still valid
  getCachedAuth() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      const now = Date.now();

      // Check if cache is still valid
      if (now - timestamp < this.cacheExpiry) {
        console.log("Using cached auth data");
        return data;
      } else {
        console.log("Auth cache expired");
        localStorage.removeItem(this.cacheKey);
        return null;
      }
    } catch (error) {
      console.error("Error reading auth cache:", error);
      localStorage.removeItem(this.cacheKey);
      return null;
    }
  }

  // Cache auth data with timestamp
  setCachedAuth(authData) {
    try {
      const cacheData = {
        data: authData,
        timestamp: Date.now(),
      };
      localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error("Error caching auth data:", error);
    }
  }

  // Clear auth cache
  clearAuthCache() {
    localStorage.removeItem(this.cacheKey);
  }

  async checkAuth(forceRefresh = false) {
    // If auth state is already loaded and we're not forcing refresh, return it immediately.
    if (this.authState.loading === false && !forceRefresh) {
      return this.authState;
    }

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cachedAuth = this.getCachedAuth();
      if (cachedAuth) {
        this.authState = { ...cachedAuth, loading: false };
        this.notifyListeners();
        return this.authState;
      }
    }

    // If a check is already in progress, return the existing promise to avoid concurrent requests.
    if (this.checkAuthPromise) {
      return this.checkAuthPromise;
    }

    // Start a new authentication check.
    this.checkAuthPromise = (async () => {
      try {
        console.log("Checking auth from server...");

        // Get session from localStorage for cross-domain support
        const sessionId = localStorage.getItem("bartender_session");
        const headers = {
          "Content-Type": "application/json",
        };

        if (sessionId) {
          headers["Authorization"] = `Bearer ${sessionId}`;
        }

        const response = await fetch(`${AUTH_API_BASE}/auth/check`, {
          credentials: "include",
          method: "GET",
          headers,
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

          // Cache the successful auth result
          this.setCachedAuth(this.authState);
        } else {
          console.log("Auth check failed with status:", response.status);
          this.authState = { authenticated: false, username: null, isFollower: false, loading: false };

          // Cache the failed auth result (shorter cache time)
          this.setCachedAuth(this.authState);
        }
      } catch (error) {
        console.error("Auth check failed:", error);
        // In case of network error, assume not authenticated but don't block the page
        this.authState = { authenticated: false, username: null, isFollower: false, loading: false, error: true };

        // Don't cache network errors - they should retry
      }

      console.log("Final auth state:", this.authState);
      this.notifyListeners();
      return this.authState;
    })();

    // After the promise settles, clear it to allow future checks if needed (e.g., manual refresh).
    this.checkAuthPromise.finally(() => {
      this.checkAuthPromise = null;
    });

    return this.checkAuthPromise;
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

      // Clear cache and session storage
      this.clearAuthCache();
      localStorage.removeItem("bartender_session");

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
            onclick="window.authCheckForce && window.authCheckForce().then(() => window.location.reload())"
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
  window.authCheckForce = () => authManager.checkAuth(true);
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

    const sessionId = urlParams.get("session");
    if (sessionId) {
      console.log("Session ID found in URL, storing in localStorage");
      localStorage.setItem("bartender_session", sessionId);
    }

    // Remove the parameters from URL
    const newUrl = new URL(window.location);
    newUrl.searchParams.delete("auth");
    newUrl.searchParams.delete("session");
    window.history.replaceState({}, "", newUrl);

    // Force a re-check of auth status after callback
    setTimeout(async () => {
      console.log("Re-checking auth after callback");
      // Clear cache and force refresh after successful login
      authManager.clearAuthCache();
      await authManager.checkAuth(true);
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
