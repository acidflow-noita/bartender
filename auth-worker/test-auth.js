/**
 * Simple test script for the auth worker (D1 version)
 * Run with: node test-auth.js
 */

const AUTH_API_BASE = "https://auth.bartender.runfast.stream";

async function testAuthEndpoints() {
  console.log("Testing auth worker endpoints...\n");

  // Test 1: Check auth endpoint (should return unauthenticated)
  try {
    console.log("1. Testing /auth/check endpoint...");
    const response = await fetch(`${AUTH_API_BASE}/auth/check`);
    const data = await response.json();
    console.log("✅ Auth check response:", data);
    console.log("Expected: { authenticated: false }\n");
  } catch (error) {
    console.log("❌ Auth check failed:", error.message, "\n");
  }

  // Test 2: Test login redirect
  try {
    console.log("2. Testing /auth/login endpoint...");
    const response = await fetch(`${AUTH_API_BASE}/auth/login`, {
      redirect: "manual",
    });
    console.log("✅ Login redirect status:", response.status);
    console.log("✅ Redirect location:", response.headers.get("location"));
    console.log("Expected: 302 redirect to Twitch OAuth\n");
  } catch (error) {
    console.log("❌ Login test failed:", error.message, "\n");
  }

  // Test 3: Test CORS
  try {
    console.log("3. Testing CORS headers...");
    const response = await fetch(`${AUTH_API_BASE}/auth/check`, {
      method: "OPTIONS",
    });
    console.log("✅ CORS status:", response.status);
    console.log("✅ CORS headers:", {
      "Access-Control-Allow-Origin": response.headers.get("Access-Control-Allow-Origin"),
      "Access-Control-Allow-Methods": response.headers.get("Access-Control-Allow-Methods"),
    });
    console.log("Expected: 204 status with proper CORS headers\n");
  } catch (error) {
    console.log("❌ CORS test failed:", error.message, "\n");
  }

  console.log("Auth worker testing complete!");
}

testAuthEndpoints();
