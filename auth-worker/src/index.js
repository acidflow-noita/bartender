/**
 * Bartender Auth Worker - Handles Twitch OAuth for protected pages
 * Uses D1 database for session storage (free tier compatible)
 */

const PROTECTED_PATHS = ["/density", "/durability", "/hardness", "/digging"];
const TWITCH_CHANNEL = "wuote"; // The channel users need to follow

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Initialize database on first run
    await initializeDatabase(env);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    try {
      switch (url.pathname) {
        case "/auth/login":
          return handleLogin(env);

        case "/auth/callback":
          return handleCallback(request, env);

        case "/auth/check":
          return handleAuthCheck(request, env);

        case "/auth/logout":
          return handleLogout(request, env);

        default:
          return new Response("Not Found", { status: 404 });
      }
    } catch (error) {
      console.error("Auth worker error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};

async function initializeDatabase(env) {
  try {
    // Create sessions table if it doesn't exist
    await env.AUTH_DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        is_follower INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `
    ).run();

    // Create states table for OAuth state validation
    await env.AUTH_DB.prepare(
      `
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `
    ).run();

    // Clean up expired sessions and states
    const now = Date.now();
    await env.AUTH_DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
    await env.AUTH_DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(now).run();
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function addCORSHeaders(response) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

async function handleLogin(env) {
  const state = crypto.randomUUID();
  const redirectUri = `https://bartender-auth.wuote.workers.dev/auth/callback`;

  const twitchAuthUrl = new URL("https://id.twitch.tv/oauth2/authorize");
  twitchAuthUrl.searchParams.set("client_id", env.TWITCH_CLIENT_ID_SECRET);
  twitchAuthUrl.searchParams.set("redirect_uri", redirectUri);
  twitchAuthUrl.searchParams.set("response_type", "code");
  twitchAuthUrl.searchParams.set("scope", "user:read:follows");
  twitchAuthUrl.searchParams.set("state", state);

  // Store state for validation (expires in 10 minutes)
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await env.AUTH_DB.prepare("INSERT INTO oauth_states (state, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(state, Date.now(), expiresAt)
    .run();

  return Response.redirect(twitchAuthUrl.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToMain(`/auth-error?error=${encodeURIComponent(error)}`, env);
  }

  if (!code || !state) {
    return redirectToMain("/auth-error?error=missing_parameters", env);
  }

  // Validate state
  const stateResult = await env.AUTH_DB.prepare("SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?")
    .bind(state, Date.now())
    .first();

  if (!stateResult) {
    return redirectToMain("/auth-error?error=invalid_state", env);
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID_SECRET,
        client_secret: env.TWITCH_CLIENT_SECRET_SECRET,
        code: code,
        grant_type: "authorization_code",
        redirect_uri: `https://bartender-auth.wuote.workers.dev/auth/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error("Token exchange failed");
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info
    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": env.TWITCH_CLIENT_ID_SECRET,
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to get user info");
    }

    const userData = await userResponse.json();
    const user = userData.data[0];

    // Check if user follows the channel
    const followsResponse = await fetch(
      `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${env.WUOTE_USER_ID_SECRET}&user_id=${user.id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": env.TWITCH_CLIENT_ID_SECRET,
        },
      }
    );

    const isFollower = followsResponse.ok && (await followsResponse.json()).data.length > 0;

    if (!isFollower) {
      return redirectToMain("/auth-error?error=not_follower", env);
    }

    // Create session (expires in 24 hours)
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await env.AUTH_DB.prepare(
      `
      INSERT INTO sessions (id, user_id, username, is_follower, created_at, expires_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
      .bind(sessionId, user.id, user.display_name, 1, Date.now(), expiresAt)
      .run();

    // Clean up state
    await env.AUTH_DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();

    // Redirect with session cookie
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${env.MAIN_SITE_URL}/`,
        "Set-Cookie": `bartender_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
      },
    });
  } catch (error) {
    console.error("Callback error:", error);
    return redirectToMain("/auth-error?error=server_error", env);
  }
}

async function handleAuthCheck(request, env) {
  const sessionId = getSessionFromRequest(request);

  if (!sessionId) {
    return addCORSHeaders(
      new Response(JSON.stringify({ authenticated: false }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  const session = await env.AUTH_DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?")
    .bind(sessionId, Date.now())
    .first();

  if (!session) {
    return addCORSHeaders(
      new Response(JSON.stringify({ authenticated: false }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  return addCORSHeaders(
    new Response(
      JSON.stringify({
        authenticated: true,
        username: session.username,
        isFollower: session.is_follower === 1,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    )
  );
}

async function handleLogout(request, env) {
  const sessionId = getSessionFromRequest(request);

  if (sessionId) {
    await env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  const response = addCORSHeaders(
    new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    })
  );

  response.headers.set("Set-Cookie", "bartender_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");

  return response;
}

function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    acc[key] = value;
    return acc;
  }, {});

  return cookies.bartender_session;
}

function redirectToMain(path, env) {
  return Response.redirect(`${env.MAIN_SITE_URL}${path}`, 302);
}
