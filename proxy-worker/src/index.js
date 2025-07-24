/**
 * Proxy Worker - Sits in front of static site to provide real auth protection
 * This worker intercepts requests and checks authentication before serving content
 */

const PROTECTED_PATHS = ["/hardness", "/density", "/durability", "/digging"];
const AUTH_API_BASE = "https://bartender-auth-test.wuote.workers.dev";
const STATIC_SITE_URL = "https://bartender-protected.runfast.stream"; // Your protected build URL

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Check if this is a protected path
    const isProtectedPath = PROTECTED_PATHS.some(
      (path) => url.pathname === path || url.pathname.startsWith(path + "/")
    );

    if (!isProtectedPath) {
      // Not a protected path, serve normally from public site
      return fetch(request);
    }

    // This is a protected path - check authentication
    const authResult = await checkAuthentication(request);

    if (!authResult.authenticated || !authResult.isFollower) {
      // Not authenticated or not a follower - return auth page
      return new Response(generateAuthPage(url.pathname), {
        headers: { "Content-Type": "text/html" },
        status: 401,
      });
    }

    // User is authenticated and is a follower - proxy to protected content
    const protectedUrl = new URL(request.url);
    protectedUrl.hostname = new URL(STATIC_SITE_URL).hostname;

    const protectedRequest = new Request(protectedUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    return fetch(protectedRequest);
  },
};

async function checkAuthentication(request) {
  try {
    // Extract session cookie
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) {
      return { authenticated: false };
    }

    // Forward the auth check to your auth worker
    const authResponse = await fetch(`${AUTH_API_BASE}/auth/check`, {
      headers: {
        Cookie: cookieHeader,
      },
    });

    if (!authResponse.ok) {
      return { authenticated: false };
    }

    return await authResponse.json();
  } catch (error) {
    console.error("Auth check failed:", error);
    return { authenticated: false };
  }
}

function generateAuthPage(path) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Protected Content - Authentication Required</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
    }
    .auth-card {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    .auth-button {
      background: #9146ff;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      margin-top: 1rem;
    }
    .auth-button:hover {
      background: #7c3aed;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <h2>🔒 Follower-Only Content</h2>
    <p>The page <strong>${path}</strong> is exclusive to WUOTE's Twitch followers.</p>
    <p>Follow <a href="https://www.twitch.tv/wuote" target="_blank">@WUOTE on Twitch</a> and sign in to access this content.</p>
    <a href="${AUTH_API_BASE}/auth/login" class="auth-button">
      Sign in with Twitch
    </a>
  </div>
</body>
</html>`;
}
