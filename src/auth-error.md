---
title: Authentication Error
---

# Authentication Error

<div id="auth-error-content"></div>

```js
const urlParams = new URLSearchParams(window.location.search);
const error = urlParams.get("error");

const errorMessages = {
  not_follower: {
    title: "Thanks for signing in!",
    message:
      "This content is exclusive to WUOTE's Twitch followers. Please follow @WUOTE on Twitch to access this page.",
    action: "Follow WUOTE",
    link: "https://www.twitch.tv/wuote",
  },
  invalid_state: {
    title: "⚠️ Session Expired",
    message: "Your authentication session has expired. Please try signing in again.",
    action: "Try Again",
    link: "/density",
  },
  server_error: {
    title: "🔧 Server Error",
    message: "There was a problem with the authentication server. Please try again later.",
    action: "Try Again",
    link: "/density",
  },
  missing_parameters: {
    title: "❌ Authentication Failed",
    message: "The authentication process was interrupted. Please try again.",
    action: "Try Again",
    link: "/density",
  },
};

const errorInfo = errorMessages[error] || {
  title: "❓ Unknown Error",
  message: "An unknown error occurred during authentication.",
  action: "Go Home",
  link: "/",
};

document.getElementById("auth-error-content").innerHTML = `
  <div style="text-align: center; padding: 2rem; max-width: 500px; margin: 0 auto;">
    <h2>${errorInfo.title}</h2>
    <p style="margin: 1.5rem 0; line-height: 1.6;">${errorInfo.message}</p>
    <a href="${errorInfo.link}" style="
      display: inline-block;
      background: #9146ff;
      color: white;
      padding: 12px 24px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      margin-top: 1rem;
    ">${errorInfo.action}</a>
  </div>
`;
```
