# 🔐 PantryPool Authentication Architecture & Implementation Manual

> **Purpose:** Deterministic, end-to-end documentation of PantryPool's dual-engine authentication system across Desktop, Android, and iOS/iPadOS. Refer to this document to prevent regression cycles and storage key mismatches.

---

## 📑 Table of Contents
1. [Architectural Overview & Dual-Engine Model](#1-architectural-overview--dual-engine-model)
2. [Supported Auth Providers & Strategies](#2-supported-auth-providers--strategies)
3. [The iOS / iPadOS Google OAuth Fork](#3-the-ios--ipados-google-oauth-fork)
4. [Step-by-Step Google Redirect Lifecycle](#4-step-by-step-google-redirect-lifecycle)
5. [Storage Key Matrix & Session Hydration](#5-storage-key-matrix--session-hydration)
6. [Backend Verification & Account Linking](#6-backend-verification--account-linking)
7. [Error Handling & Anti-Patterns Checklist](#7-error-handling--anti-patterns-checklist)
8. [Testing & Verification Protocol](#8-testing--verification-protocol)

---

## 1. Architectural Overview & Dual-Engine Model

PantryPool is an open-core SaaS designed to run on two distinct hosting architectures without code divergence:

| Component | Serverless Edge (Production SaaS) | Node.js Server (Self-Hosted / Local / Dev) |
| :--- | :--- | :--- |
| **Runtime** | Cloudflare Pages Functions (V8 Workers) | Node.js 20+ (`@hono/node-server`) |
| **Database** | Cloudflare D1 (Serverless SQLite) | MySQL 8.0+ / MariaDB 10.5+ |
| **Crypto API** | Web Cryptography API (`crypto.subtle`) | Web Cryptography API (`crypto.subtle`) |
| **Token Format** | HMAC-SHA256 Signed JWT (`src/server/api/routes/auth.ts`) | HMAC-SHA256 Signed JWT (`src/server/api/routes/auth.ts`) |
| **Route Handler** | Universal Hono API (`src/server/api/routes/auth.ts`) | Universal Hono API (`src/server/api/routes/auth.ts`) |

Both backends implement identical route contracts, token payloads, and callback behaviors.

---

## 2. Supported Auth Providers & Strategies

### A. Google OAuth 2.0 (Implicit / Token Flow)
- **Client ID**: Configured via `GOOGLE_CLIENT_ID` environment variable, falling back to client-side `DEFAULT_GOOGLE_CLIENT_ID` in `src/lib/googleAuthClient.ts`.
- **Authorized Redirect URI**: `https://pantrypool.com/api/auth/google/callback` (configured in Google Cloud Console).
- **Scopes**: `openid email profile`.
- **Tokens returned**: `id_token` (JWT) and `access_token` (Bearer).

### B. Apple Sign-In
- Handled via Apple JS SDK (`window.AppleID`).
- Authenticates identity token against backend `/api/auth/apple`.

### C. Email & Password
- Passwords hashed using standard PBKDF2-HMAC-SHA256 (`pbkdf2$iterations$salt$hash`).
- **Cloudflare Edge Isolate Cap**: PBKDF2 iterations are capped at 100,000 rounds (`iterations <= 100000`). Cloudflare Workers V8 isolates hard-cap WebCrypto PBKDF2 at 100,000 iterations and throw an uncaught exception for anything higher (e.g. 600,000). The crypto engine auto-scales requested iteration counts down to 100,000 while maintaining seamless verification of legacy hashes.
- Tokens issued with `token_version` tracking for instant session invalidation across all devices.

### D. Passkeys & WebAuthn (FIDO2)
- **Library Ecosystem**: `@simplewebauthn/server` and `@simplewebauthn/browser` (100% Web Crypto API compatible, zero native Node C++ dependencies, runs seamlessly on Cloudflare Workers and Node.js).
- **Dual-Runtime Storage Parity**: Passkey credentials stored in `passkey_credentials` table via `StorageAdapter` (`MySqlStorageAdapter` and `D1StorageAdapter`).
- **Stateless Ephemeral Challenge Tokens**: Eliminates external KV / Redis requirements. Challenges are cryptographically signed into tamper-proof 5-minute JWT tokens using HMAC-SHA256 via `crypto.subtle`.
- **Registration Flow**:
  - `POST /api/auth/passkey/register-options` (Authenticated): Issues WebAuthn challenge + user info + signed challenge token.
  - `POST /api/auth/passkey/register-verify` (Authenticated): Verifies attestation, verifies RP ID and expected origin, saves public key, counter, and transports to database.
- **Authentication Flow**:
  - `POST /api/auth/passkey/auth-options` (Public): Generates challenge options (supports discoverable credentials and email-scoped `allowCredentials`).
  - `POST /api/auth/passkey/auth-verify` (Public): Verifies signature assertion, checks and updates counter against replay attacks, verifies RP ID and origin, and issues session JWT.
- **Credential Management**:
  - `GET /api/auth/passkey/list` (Authenticated): Enumerates user's enrolled passkeys with creation timestamp and friendly device name.
  - `DELETE /api/auth/passkey/:id` (Authenticated): Revokes passkey credentials.

---

## 3. The iOS / iPadOS Google OAuth Fork

### The Problem on Apple Devices
1. **iPadOS User-Agent Spoofing**: iPadOS Safari reports a desktop Macintosh user agent (`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...`). However, it has touch hardware (`navigator.maxTouchPoints > 1`).
2. **SpringBoard Popup Stalls**: When `window.open` is invoked with desktop dimension features (e.g. `width=500,height=600`), iPadOS's window manager treats the popup as an unsupported floating desktop window, hanging on an `about:blank` page for 3–5 seconds.
3. **ITP & FedCM Restrictions**: WebKit Intelligent Tracking Prevention (ITP) and third-party cookie restrictions frequently block cross-origin authentication iframes and GIS popup messaging channels on iOS.

### The Solution: Platform Forking in `AuthModal.tsx`
In `src/components/AuthModal.tsx`:
```typescript
import { isIPadOS, isIOS, launchGoogleOAuthRedirect } from '../lib/googleAuthClient';

const handleGoogleSignInClick = () => {
  setError(null);
  setLoading(true);

  // On iPadOS & iOS, bypass popup windows completely using full-page OAuth redirect
  if (isIPadOS() || isIOS()) {
    launchGoogleOAuthRedirect({ prompt: 'select_account' });
    return;
  }

  // Desktop & Android: Fast-track GIS token client popup
  // ...
};
```

---

## 4. Step-by-Step Google Redirect Lifecycle

```
[User on iPad / iPhone]
       │
       ▼ (Taps "Continue with Google")
1. launchGoogleOAuthRedirect({ prompt: 'select_account' })
       │
       ├─ Builds state: JSON.stringify({ returnTo: window.location.href, timestamp: Date.now() })
       └─ Navigates full-page to: https://accounts.google.com/o/oauth2/v2/auth?...
       │
       ▼
[Google Authentication & Account Selector]
       │
       ▼ (User picks account)
2. Redirects to https://pantrypool.com/api/auth/google/callback#access_token=...&id_token=...&state=...
       │
       ▼
3. Callback Route (src/server/api/routes/auth.ts)
       ├─ Parses hash & search params (access_token, id_token, error, state)
       ├─ If error present: renders user-facing error UI + "Return to PantryPool" button
       ├─ Profile Resolution:
       │    ├─ If access_token present: queries https://www.googleapis.com/oauth2/v3/userinfo
       │    └─ Extracts email, name, avatarUrl, sub
       ├─ POST /api/auth/google with token + profile payload
       ├─ On Success (receives JWT data.token & data.user):
       │    ├─ Writes to LocalStorage:
       │    │    ├─ pantrypool_token = data.token
       │    │    ├─ pantrypool_auth_token = data.token
       │    │    ├─ pantrypool_cached_auth_user_v1 = JSON.stringify(data.user)
       │    │    └─ pantrypool_active_user_id_v1 = data.user.id
       │    └─ Redirects to: returnUrl + "?auth_token=" + encodeURIComponent(data.token)
       │
       ▼
4. Frontend Landing (src/App.tsx)
       ├─ [Top-level Synchronous Execution]:
       │    Consumes ?auth_token= from search params
       │    Calls setAuthToken(incomingToken)
       │    Cleans URL with window.history.replaceState
       ├─ [React State Initializers]:
       │    useState<AuthUser | null>(loadCachedAuthUser) (Reads cache immediately: NO skeleton delay)
       └─ [useEffect loadUserAndOrgs]:
            fetchCurrentUserApi() validates token against server and updates session
```

---

## 5. Storage Key Matrix & Session Hydration

### Critical Storage Keys

| Key | Value Type | Purpose | Owner |
| :--- | :--- | :--- | :--- |
| `pantrypool_token` | `string` (JWT) | **Primary App Auth Token** read by `getAuthToken()` for all `Authorization: Bearer` headers. | `src/lib/api.ts` |
| `pantrypool_auth_token` | `string` (JWT) | **Secondary Token Alias** for backward compatibility. | `src/lib/api.ts` |
| `pantrypool_cached_auth_user_v1` | `JSON string` (`AuthUser`) | Instant cache hydration on initial app mount before API response arrives. | `src/lib/storage.ts` |
| `pantrypool_active_user_id_v1` | `string` (`user.id`) | Tracks the active contributor/member ID in the pool ledger. | `src/lib/storage.ts` |

> ⚠️ **CRITICAL RULE:**
> Never write authentication tokens to `localStorage` under ad-hoc keys like `pantrypool_active_user` or without setting `pantrypool_token`.
> Always use `setAuthToken(token)` from `src/lib/api.ts` or set both `pantrypool_token` and `pantrypool_auth_token` simultaneously.

---

## 6. Backend Verification & Account Linking

### Verification Cascade
When `/api/auth/google` receives `{ credential, accessToken }`:
1. **Token Validation with Google**:
   - Queries `https://oauth2.googleapis.com/tokeninfo?id_token=...` (or `?access_token=...`).
   - Strictly enforces that token audience (`info.aud` or authorized party `info.azp`) exactly matches the configured `GOOGLE_CLIENT_ID`.
   - **Confused Deputy Prevention**: Any token issued for another Google OAuth application or client ID is immediately rejected with HTTP 401.
2. **Profile Data Extraction**:
   - For `id_token`: email, name, avatar, and subject identifier (`sub`) are provided directly in the verified token payload.
   - For `access_token`: if `name` or `picture` are omitted from `tokeninfo`, the backend queries `GET https://www.googleapis.com/oauth2/v3/userinfo` with `Bearer ${accessToken}` to enrich the profile — *only after* audience validity has been verified.
3. **Database Account Linking**:
   - Look up user by `email.toLowerCase().trim()`.
   - If user exists: link `google_id` if currently unlinked (`UPDATE users SET google_id = ? WHERE id = ?`).
   - If user does not exist: create user with normalized email, name, avatar, and `google_id`.
   - Issue universal PantryPool JWT signed with `JWT_SECRET`.

---

## 7. Error Handling & Anti-Patterns Checklist

### ❌ Anti-Patterns That Previously Caused Bugs
1. **Silent Redirect on Failure**:
   - *Previous Bug*: The callback script had `catch() { window.location.replace(returnUrl); }` which sent users back to `/` with no explanation and no session.
   - *Requirement*: Always call `showError(message)` rendering visible feedback with an action button.
2. **Double URL-Encoding of State**:
   - *Previous Bug*: `state: encodeURIComponent(JSON.stringify(stateObj))` inside `new URLSearchParams(...)` caused double percent-encoding (`%257B...`), breaking state parsing on return.
   - *Requirement*: Pass `JSON.stringify(stateObj)` directly into `URLSearchParams`; `URLSearchParams` handles standard encoding.
3. **Tokeninfo Limitations for Access Tokens**:
   - *Previous Bug*: `tokeninfo?access_token=` does not return `name` or `picture`.
   - *Requirement*: Always use `userinfo` endpoint with `Bearer` header to enrich profile data once the access token audience has been validated.
4. **Waiting for `useEffect` Before Storing Tokens**:
   - *Previous Bug*: If tokens were only read inside an async effect, the initial render showed unauthenticated state / flash of visitor view.
   - *Requirement*: Synchronously consume `auth_token` query parameter before `useState` executes in `App.tsx`.
5. **Unvalidated Query Token Injection**:
   - *Previous Bug*: Storing arbitrary query string contents directly into `localStorage`.
   - *Requirement*: Strictly validate standard JWT format (`/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+(\.[A-Za-z0-9-_+/=]+)?$/`) and cap length at 4,096 bytes before storage.
6. **Desktop Hash Re-entrancy Loop (`#login`)**:
   - *Previous Bug*: On desktop browsers, if an unauthenticated or post-auth navigation preserved `#login` in `window.location.hash`, the route change listener in `App.tsx` immediately set `showAuthModal = true`, reopening the login dialog over the catalog.
   - *Requirement*: Always clear `#login` hash via `window.history.replaceState` upon successful authentication, ignore hash-based auth triggers if an authenticated user session is active, and sanitize location state.
7. **Client Token Omission in Google OAuth (`"Google credential token is required."`)**:
   - *Previous Bug*: `AuthModal.tsx` received `tokenResponse.access_token` from Google Identity Services (`initTokenClient`) and retrieved userinfo, but forwarded only profile metadata `{ googleId, email, name, avatarUrl }` to `googleLoginApi(...)`, omitting `accessToken` and `credential`. The backend enforces cryptographic token verification via Google's Tokeninfo API (Hard Guardrail #2), causing it to fail with `400: "Google credential token is required."`.
   - *Requirement*: Always forward both `credential` and `accessToken` to `googleLoginApi(...)`. On the backend (`/api/auth/google`), verify `aud`, `azp`, `issued_to`, or `client_id` against the configured Google Client ID, falling back to server-side userinfo lookup when tokeninfo omits profile fields.
8. **P2P Financial Handles & Member Roster Privacy (PII Protection)**:
   - *Previous Vulnerability*: `GET /api/pools/:poolId/members` checked authorization inside `if (user) { ... }`, meaning unauthenticated visitors without an `Authorization` header bypassed authorization and could harvest all member names, emails, and P2P reimbursement handles (`zelle_identifier`, `apple_pay_handle`, `venmo_handle`, `cashapp_handle`, `paypal_handle`). Additionally, `GET /api/pools` populated member PII on pool objects for unauthenticated visitors.
   - *Requirement*: `GET /api/pools/:poolId/members` must reject unauthenticated callers with `401`. In `GET /api/pools`, member PII (`email`, `venmoHandle`, `cashappHandle`, `paypalHandle`, `zelleIdentifier`, `applePayHandle`) must be strictly redacted (`undefined`) for any caller who is not an authenticated member or administrator of that specific pool.

---

## 8. Testing & Verification Protocol

Before pushing changes to authentication:

```bash
# 1. Typecheck both client and serverless worker environments (0 errors required)
npm run lint

# 2. Run full automated test suite (378 tests across 50 suites)
npm test

# 3. Verify production bundle builds cleanly
npm run build

# 4. Verify Open-Core sync gates (ensures no secret leaks or boundary breaks)
npm run sync:dry
```

### Manual iOS Verification Checklist
1. Open PantryPool on iPad Safari or iOS Safari.
2. Tap **"Sign In"** -> **"Continue with Google"**.
3. Confirm full-page navigation occurs with zero `about:blank` delay.
4. Select Google account.
5. Confirm browser lands on `/` with logged-in status, user avatar, and active pools visible immediately.
