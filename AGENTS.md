# 🤖 PantryPool — AI Agent Automated Installation & Operations Guide

> **Target Audience:** Autonomous AI coding agents (Antigravity CLI `agy`, Claude Code, Cursor, GitHub Copilot, Codex) and automated provisioning scripts.

This document provides deterministic, non-interactive instructions for an AI agent to install, configure, verify, and operate the **PantryPool** open-source repository for a user.

---

## 🧭 Architecture Decision Fork

PantryPool supports two runtime & database engines. Before installing, determine the target environment:

| Target Environment | Deployment Engine | Database Engine | Setup Shortcut |
| :--- | :--- | :--- | :--- |
| **Serverless / Free Edge** | Cloudflare Pages Functions | Cloudflare D1 (SQLite) | `npm run setup:cloudflare` |
| **Localhost / VPS / Docker / cPanel** | Node.js Server (@hono/node-server) | MySQL 8.0+ / MariaDB 10.5+ | `npm run dev` / `npm start` |

---

## ⚡ Fast-Track Non-Interactive Agent Runbook

### Path A: Self-Hosted Node.js + MySQL Setup

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Auto-Generate `.env` Configuration
Generate a secure `.env` file with a strong random `JWT_SECRET`:
```bash
if [ ! -f .env ]; then
  cp .env.example .env
  # Generate cryptographically secure JWT Secret
  JWT_RANDOM=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s/CHANGE_ME_TO_A_STRONG_RANDOM_SECRET/$JWT_RANDOM/" .env
fi
```

#### Step 3: Configure Database Credentials
Ensure the `.env` file contains accessible MySQL credentials:
```bash
# Example environment variables to set/replace:
# DB_HOST="localhost"
# DB_PORT=3306
# DB_USER="your_mysql_user"
# DB_PASS="your_mysql_password"
# DB_NAME="pantrypool"
```

#### Step 4: Verify Code Quality & Automated Tests
Execute the static typecheck and automated test suite:
```bash
# Run TypeScript static type checking (0 errors)
npm run lint

# Run full Vitest automated test suite (50 test suites, 378 tests)
npm test

# Run build bundle verification
npm run build
```

#### Step 5: Start Server & Check SRE Health
```bash
# Start background server
npm run dev

# Probe health endpoint for DB & runtime status:
curl -s http://localhost:3000/api/health
```
Expected response:
```json
{
  "success": true,
  "status": "healthy",
  "service": "PantryPool Server API",
  "checks": {
    "database": { "status": "connected", "latencyMs": 5 },
    "nodeRuntime": { "status": "operational" }
  }
}
```

---

### Path B: Cloudflare Pages + D1 Serverless Deployment

If the user wants serverless edge deployment on Cloudflare:

#### Step 1: Install Dependencies
```bash
npm install
```

#### Step 2: Execute Turnkey Cloudflare Script
```bash
npm run setup:cloudflare
```
*Note: If running in a headless CI/CD environment without active Wrangler login, ensure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables are exported prior to execution.*

#### Step 3: Set Secrets on Cloudflare Pages
```bash
npx wrangler pages secret put JWT_SECRET --project-name=pantrypool
npx wrangler pages secret put GEMINI_API_KEY --project-name=pantrypool
# Optional: Authenticated HTTP email relay (if shared-host SMTP port 465 is firewalled against edge datacenter IPs)
npx wrangler pages secret put EMAIL_RELAY_URL --project-name=pantrypool
npx wrangler pages secret put EMAIL_RELAY_SECRET --project-name=pantrypool
```

---

## 🛠️ Diagnostics & Agent Troubleshooting

### 1. Database Connection Failure (`ECONNREFUSED` / `ER_ACCESS_DENIED_ERROR`)
* **Cause**: MySQL server is not running or user credentials in `.env` are invalid.
* **Agent Action**:
  1. Check if MySQL is running: `systemctl status mysql` or `pgrep -x mysqld`.
  2. Verify database exists: `mysql -u $DB_USER -p$DB_PASS -e "CREATE DATABASE IF NOT EXISTS pantrypool CHARACTER SET utf8mb4;"`.
  3. Re-verify `.env` configuration.

### 2. Port Conflict (`EADDRINUSE: 3000`)
* **Cause**: Another service is occupying port 3000.
* **Agent Action**: Set `PORT=3001` (or next free port) in `.env` and restart.

### 3. Missing Frontend Assets
* **Cause**: `npm run build` was not executed before running in production mode (`NODE_ENV=production npm start`).
* **Agent Action**: Run `npm run build` to generate `dist/index.html` and static assets.

---

## 🔒 Security & Safety Rules for Agents
* Consult [`AUTH_ARCHITECTURE.md`](AUTH_ARCHITECTURE.md) before making any modifications to authentication flows, token storage keys, or OAuth redirect callbacks.
* Never overwrite user credentials in an existing `.env` without backing it up first.
* Always use `npm test` and `curl http://localhost:3000/api/health` to confirm successful installation before handing off to the user.
