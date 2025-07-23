# Authentication Setup Guide

This guide explains how to set up the Twitch authentication system for the Noita Bartender protected pages.

## Overview

The authentication system restricts access to certain pages (density, durability, hardness, and digging) to WUOTE's Twitch followers only. It uses a separate Cloudflare Worker with D1 database for handling OAuth authentication.

**Note**: This setup uses D1 database which is available on Cloudflare's free tier, making it cost-effective for small to medium traffic.

## Architecture

- **Main Site**: Observable Framework site with protected pages
- **Auth Worker**: Cloudflare Worker handling Twitch OAuth (`auth-worker/`)
- **Protected Pages**: density.md, durability.md, hardness.md, digging.md

## Setup Steps

### 1. Twitch Application Setup

1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Create a new application with these settings:

   - **Name**: Noita Bartender Auth
   - **OAuth Redirect URLs**: `https://bartender-auth.wuote.workers.dev/auth/callback`
   - **Category**: Website Integration

3. Note down:
   - Client ID
   - Client Secret

### 2. Get WUOTE's User ID

You can get the user ID using the Twitch API:

```bash
curl -H "Client-ID: YOUR_CLIENT_ID" \
     -H "Authorization: Bearer YOUR_APP_ACCESS_TOKEN" \
     "https://api.twitch.tv/helix/users?login=wuote"
```

### 3. Configure Auth Worker

1. Navigate to the auth worker directory:

   ```bash
   cd auth-worker
   ```

2. The `wrangler.jsonc` file should look like this:

   ```jsonc
   {
     "name": "bartender-auth",
     "compatibility_date": "2025-01-22",
     "main": "src/index.js",

     // Non-sensitive environment variables
     "vars": {
       "MAIN_SITE_URL": "https://bartender.runfast.stream"
     },

     // D1 database for session storage (free tier compatible)
     "d1_databases": [
       {
         "binding": "AUTH_DB",
         "database_name": "bartender-auth",
         "database_id": "your_database_id_here"
       }
     ]
   }
   ```

3. Create a D1 database for sessions:

   ```bash
   npx wrangler d1 create bartender-auth
   ```

4. Update the `database_id` in `wrangler.jsonc` with the ID from the previous command.

5. Set sensitive data as encrypted secrets (NOT in config files):

   ```bash
   npx wrangler secret put TWITCH_CLIENT_ID_SECRET
   # Enter your actual Client ID when prompted

   npx wrangler secret put TWITCH_CLIENT_SECRET_SECRET
   # Enter your actual Client Secret when prompted

   npx wrangler secret put WUOTE_USER_ID_SECRET
   # Enter WUOTE's User ID when prompted
   ```

6. The database tables will be created automatically on first run. The worker creates:
   - `sessions` table for storing user sessions
   - `oauth_states` table for OAuth state validation

### 4. Deploy Auth Worker

```bash
cd auth-worker
npm install
npx wrangler deploy
```

You'll get a URL like: `https://bartender-auth.wuote.workers.dev`

### 5. Update Main Site Configuration

Update `src/components/auth.js` to use your worker URL:

```javascript
const AUTH_API_BASE = "https://bartender-auth.wuote.workers.dev";
```

## How It Works

1. **Protected Page Access**: When users visit protected pages, the auth system checks their authentication status
2. **Login Flow**: Unauthenticated users see a login prompt that redirects to Twitch OAuth
3. **Follower Check**: After successful OAuth, the system checks if the user follows WUOTE
4. **Session Management**: Authenticated followers get a session cookie valid for 24 hours

## Protected Pages Implementation

Each protected page uses the auth system:

```javascript
import { checkAuthAndRender } from "./components/auth.js";

// Check authentication before rendering content
const authResult = await checkAuthAndRender();
if (authResult !== null) {
  display(html`${authResult}`);
  throw new Error("Authentication required");
}
```

## Testing

1. **Test auth endpoint**:

   ```bash
   curl https://bartender-auth.wuote.workers.dev/auth/check
   ```

   Should return: `{"authenticated":false}`

2. **Test login redirect**:
   Open: `https://bartender-auth.wuote.workers.dev/auth/login`
   Should redirect to Twitch OAuth

3. **Test protected page**:
   Go to: `https://bartender.runfast.stream/density`
   Should show follower login prompt

## Troubleshooting

### Common Issues

1. **Worker Exception**: Check `npx wrangler tail` for detailed error logs
2. **Redirect Issues**: Verify the OAuth redirect URL matches exactly in Twitch app settings
3. **D1 Database**: Ensure database ID is correct in `wrangler.jsonc`
4. **Secrets**: Use `npx wrangler secret list` to verify secrets are set

### Debug Commands

```bash
# View worker logs in real-time
npx wrangler tail

# List configured secrets
npx wrangler secret list

# Test database connection
npx wrangler d1 execute bartender-auth --command "SELECT COUNT(*) FROM sessions"
```

## Security Considerations

- **Secrets are encrypted** and stored securely in Cloudflare Workers
- **Not visible in config files** or version control
- Sessions are stored in D1 database with automatic expiration
- HTTPS is enforced for all authentication flows
- CORS is properly configured to prevent unauthorized access

## Maintenance

- Monitor D1 database usage for session data
- Regularly rotate Twitch application credentials using `npx wrangler secret put`
- Keep track of Twitch API changes that might affect follower checking
- Use `npx wrangler tail` to monitor for errors
