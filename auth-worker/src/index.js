/**
 * Bartender Auth Worker - Handles Twitch OAuth for protected pages
 * Uses D1 database for session storage (free tier compatible)
 */

// Configuration - channel checking is done via WUOTE_USER_ID_SECRET env var

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Initialize database on first run
    await initializeDatabase(env);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";
      return handleCORS(request, env, allowedOrigin);
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

        case "/api/protected-content":
          return handleProtectedContent(request, env);

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

function handleCORS(request, env, allowedOrigin) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function addCORSHeaders(response, allowedOrigin) {
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

async function handleLogin(env) {
  const state = crypto.randomUUID();
  const redirectUri = `${env.WORKER_URL || "https://bartender-auth.wuote.workers.dev"}/auth/callback`;

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
        redirect_uri: `${env.WORKER_URL || "https://bartender-auth.wuote.workers.dev"}/auth/callback`,
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
    let isFollower = false;

    try {
      const followsResponse = await fetch(
        `https://api.twitch.tv/helix/channels/followed?user_id=${user.id}&broadcaster_id=${env.WUOTE_USER_ID_SECRET}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Client-Id": env.TWITCH_CLIENT_ID_SECRET,
          },
        }
      );

      console.log("Follows API response status:", followsResponse.status);

      if (followsResponse.ok) {
        const followsData = await followsResponse.json();
        console.log("Follows API response data:", followsData);
        isFollower = followsData.data && followsData.data.length > 0;
      } else {
        const errorText = await followsResponse.text();
        console.log("Follows API error:", errorText);

        // If the API call fails, we'll still create a session but mark as non-follower
        // This prevents auth from completely breaking if Twitch API is down
        isFollower = false;
      }
    } catch (error) {
      console.error("Error checking follower status:", error);
      // On error, assume not a follower but don't break auth completely
      isFollower = false;
    }

    // Log follower check for debugging
    console.log("User ID:", user.id, "Username:", user.display_name);
    console.log("Is follower:", isFollower);

    // Create session (expires in 24 hours)
    const sessionId = crypto.randomUUID();
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    await env.AUTH_DB.prepare(
      `
      INSERT INTO sessions (id, user_id, username, is_follower, created_at, expires_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
      .bind(sessionId, user.id, user.display_name, isFollower ? 1 : 0, Date.now(), expiresAt)
      .run();

    // Clean up state
    await env.AUTH_DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();

    // Redirect with session cookie
    const cookieOptions = env.MAIN_SITE_URL.includes("localhost")
      ? `bartender_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
      : `bartender_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`;

    console.log("Redirecting to main site with session cookie");
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${env.MAIN_SITE_URL || "https://bartender.runfast.stream"}/?auth=success`,
        "Set-Cookie": cookieOptions,
      },
    });
  } catch (error) {
    console.error("Callback error:", error);
    return redirectToMain("/auth-error?error=server_error", env);
  }
}

async function handleAuthCheck(request, env) {
  let sessionId = getSessionFromRequest(request);

  // Check Authorization header for cross-domain requests
  if (!sessionId) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      sessionId = authHeader.substring(7);
    }
  }

  console.log("Auth check - sessionId:", sessionId);
  console.log("Auth check - cookies:", request.headers.get("Cookie"));

  if (!sessionId) {
    console.log("No session ID found");
    const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";
    return addCORSHeaders(
      new Response(JSON.stringify({ authenticated: false }), {
        headers: { "Content-Type": "application/json" },
      }),
      allowedOrigin
    );
  }

  const session = await env.AUTH_DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?")
    .bind(sessionId, Date.now())
    .first();

  console.log("Session found:", session);

  if (!session) {
    console.log("No valid session found");
    const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";
    return addCORSHeaders(
      new Response(JSON.stringify({ authenticated: false }), {
        headers: { "Content-Type": "application/json" },
      }),
      allowedOrigin
    );
  }

  const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";
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
    ),
    allowedOrigin
  );
}

async function handleLogout(request, env) {
  const sessionId = getSessionFromRequest(request);

  if (sessionId) {
    await env.AUTH_DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }

  const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";
  const response = addCORSHeaders(
    new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    }),
    allowedOrigin
  );

  response.headers.set(
    "Set-Cookie",
    "bartender_session=; Path=/; HttpOnly; Secure; SameSite=None; Domain=.runfast.stream; Max-Age=0"
  );

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

async function validateSession(request, env) {
  const sessionId = getSessionFromRequest(request);

  if (!sessionId) {
    return { valid: false, status: 401, error: "Authentication required" };
  }

  const session = await env.AUTH_DB.prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?")
    .bind(sessionId, Date.now())
    .first();

  if (!session || session.is_follower !== 1) {
    return { valid: false, status: 403, error: "Follower access required" };
  }

  return { valid: true, session };
}

async function handleProtectedContent(request, env) {
  const validation = await validateSession(request, env);

  const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";

  if (!validation.valid) {
    return addCORSHeaders(
      new Response(JSON.stringify({ error: validation.error }), {
        status: validation.status,
        headers: { "Content-Type": "application/json" },
      }),
      allowedOrigin
    );
  }

  return addCORSHeaders(
    new Response(
      JSON.stringify({
        success: true,
        message: "Welcome to protected content!",
        username: validation.session.username,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    ),
    allowedOrigin
  );
}

async function handleSessionExchange(request, env) {
  const url = new URL(request.url);
  const tempToken = url.searchParams.get("token");

  if (!tempToken) {
    return new Response("Missing token", { status: 400 });
  }

  // Look up session by temp token (we'll store this temporarily)
  const session = await env.AUTH_DB.prepare("SELECT * FROM sessions WHERE temp_token = ? AND expires_at > ?")
    .bind(tempToken, Date.now())
    .first();

  if (!session) {
    return new Response("Invalid or expired token", { status: 404 });
  }

  // Clear the temp token
  await env.AUTH_DB.prepare("UPDATE sessions SET temp_token = NULL WHERE id = ?").bind(session.id).run();

  const allowedOrigin = env.MAIN_SITE_URL || "https://bartender.runfast.stream";
  const cookieOptions = env.MAIN_SITE_URL.includes("localhost")
    ? `bartender_session=${session.id}; Path=/; SameSite=Lax; Max-Age=86400`
    : `bartender_session=${session.id}; Path=/; Secure; SameSite=Lax; Max-Age=86400`;

  const response = addCORSHeaders(
    new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    }),
    allowedOrigin
  );

  response.headers.set("Set-Cookie", cookieOptions);
  return response;
}

function redirectToMain(path, env) {
  return Response.redirect(`${env.MAIN_SITE_URL}${path}`, 302);
}
