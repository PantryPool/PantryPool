# 🥫 PantryPool — The Breakroom & Shared Pantry Ledger

> **A real-time, non-custodial ledger for office breakrooms, coworking kitchens, and roommate pantries.**  
> Track shared snacks and drinks down to the cent, log items via smartphone QR scans or NFC tags, parse grocery receipts with AI, and settle tabs seamlessly.

[![License: FSL-1.1-MIT](https://img.shields.io/badge/License-FSL--1.1--MIT-5A9A6B.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-100%25%20Passing-5A9A6B.svg)](tests/)
[![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-E8694A.svg)](https://pages.cloudflare.com/)

---

## 🌟 Why PantryPool?

Communal kitchens and office breakrooms often suffer from the "tragedy of the snack stash":
* The honor system fails with missing cash and unrecorded tabs.
* Manually updating spreadsheets or collecting receipts creates friction and chore fatigue.
* Roommates or coworkers argue about who paid for what and who drank the last cold brew.

**PantryPool eliminates the friction entirely.** Members scan a fridge QR code with their native phone camera, tap to consume an item, and the ledger updates in real time. Restockers upload grocery receipts via Gemini AI Vision OCR, and the balance automatically squares away.

---

## ✨ Features

* **⚡ Zero-App Smartphone QR Logging**: Scan a printable fridge poster or item label with any standard camera to open the web portal instantly.
* **📱 Fullscreen Tablet Kiosk Mode**: Turn an old iPad or Android tablet into a dedicated, PIN-protected self-checkout kiosk.
* **🏷️ NFC Micro-Tag Tap Hub**: Tap NTAG213/215/216 stickers directly on shelves to log drinks and snacks in under 2 seconds.
* **💰 Vending Machine Savings & Benchmarks**: Track savings against local vending benchmarks with regional metro tiers (SF, NYC, Seattle/Austin/LA, Standard US), price calibration, real-time toasts, and cross-pool opt-in leaderboard.
* **🚀 Flexible Onboarding**: Zero-overhead setup allows creating standalone breakroom pantries immediately without requiring a company workspace.
* **🧾 Multimodal AI Receipt & Plain Text Haul Parsing**: Upload paper receipts or describe your shopping haul in natural language to auto-extract items, packs, and pricing.
* **📦 Prioritized Catalog Restock & Pack Pricing**: Pick existing items first to prevent duplicates, enter full pack prices (e.g. 6-pack for $5.99) with automatic unit cost calculation.
* **⚖️ Weighted Moving Average Inventory Pricing**: Automatically recalculates blended cost per unit as new hauls are introduced at fluctuating store prices.
* **📊 Double-Entry Non-Custodial Ledger**: Transparent balance sheets with chronological running balance snapshots, deposit tracking, void support, and CSV exports.
* **💸 1-Tap P2P Settle-Up**: Integrated peer-to-peer payout links (Venmo, Cash App, PayPal, or cash) to square debts directly.
* **🛡️ Configurable Credit Ceiling & Hard Spending Block**: Eliminate financial debt risk by enforcing a maximum member deficit (default -$10.00) or strict pre-paid mode ($0.00).
* **🖨️ Printable Breakroom Kits**: One-click generation of customized 8.5x11" fridge posters, shelf tags, and QR cards.
* **🔌 Offline-Resilient Engine**: IndexedDB queue stores checkouts when Wi-Fi drops and automatically replays when reconnecting.

---

## 🧭 Choosing Your Database & Architecture

PantryPool provides two deployment options depending on your hosting preferences:

| Feature | Option A: Cloudflare Pages + D1 (Serverless) | Option B: Node.js + MySQL (Self-Hosted) |
| :--- | :--- | :--- |
| **Best For** | 100% Free hosting, zero server maintenance | Localhost testing, VPS (Ubuntu/EC2), Docker, cPanel |
| **Database** | Cloudflare D1 (Distributed Edge SQLite) | MySQL 8.0+ / MariaDB 10.5+ |
| **Backend** | Cloudflare Pages Functions | Node.js Server (@hono/node-server) |
| **Deployment** | `npm run setup:cloudflare` | `npm run dev` or `npm start` |

---

## 🚀 Quickstart & Local Development (Node.js + MySQL)

### Prerequisites
* **Node.js**: v18.0.0 or higher
* **MySQL 8.0+** or **MariaDB 10.5+**
* **npm** or **pnpm**

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/PantryPool/PantryPool.git
cd PantryPool

# 2. Install dependencies
npm install

# 3. Create your local environment configuration
cp .env.example .env
```

Open `.env` and set your MySQL credentials and a secure `JWT_SECRET`:
```env
DB_HOST="localhost"
DB_USER="your_db_user"
DB_PASS="your_db_password"
DB_NAME="pantrypool"
JWT_SECRET="your_random_secret_string"
```

```bash
# 4. Start the local development server (auto-creates tables on boot)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Initial Superadmin Setup
PantryPool implements an automated **First-User Bootstrap Pattern**:
* **Fresh Database**: The very first user to register or authenticate (via email/password, Google OAuth, or Apple) automatically becomes **`superadmin`**.
* **Subsequent Users**: All users registered afterwards receive standard member privileges.
* **Environment Override**: To explicitly designate an admin upfront, configure `INITIAL_ADMIN_EMAIL="admin@yourdomain.com"` in `.env`.
* **CLI Promotion**: Promote any registered user at any time using the command-line utility:
  ```bash
  npm run make-superadmin <email>
  ```

---

## 🧪 Testing & Code Quality

PantryPool is thoroughly covered by an automated test suite:

```bash
# Run unit & integration tests (567 tests across 66 suites)
npm test

# Run TypeScript static typecheck (0 errors)
npm run lint

# Check server health endpoint
curl http://localhost:3000/api/health
```

---

## 🛠️ Self-Hosting Guide

### Option 1: Cloudflare Pages & D1 (Serverless & Free)

PantryPool includes a **1-step automated setup script** that provisions Cloudflare D1, migrates the schema, builds assets, and deploys to Cloudflare Pages:

```bash
# 1-Step Turnkey Cloudflare Deployment
npm run setup:cloudflare
```

*Or manually step-by-step:*
```bash
# 1. Login to your Cloudflare account
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create pantrypool-db

# 3. Apply the database schema
npx wrangler d1 execute pantrypool-db --file=./schema.sql

# 4. Deploy to Cloudflare Pages
npm run build
npx wrangler pages deploy dist
```

### Option 2: Node.js / Docker / VPS / Local Server

Run the full-stack Express server on any Linux/macOS/Windows host, Raspberry Pi, or VPS:

```bash
# Build the production assets
npm run build

# Start the Node.js server
NODE_ENV=production npm start
```

---

## 🤖 AI Agent Installation Guide

Using an autonomous coding agent (Antigravity CLI, Claude Code, Cursor, Copilot)?  
See **[`AGENTS.md`](AGENTS.md)** for deterministic, non-interactive agent runbooks, automated `.env` generators, and health check validation procedures.

---

## 🏢 PantryPool Cloud (Managed SaaS)

Looking for zero-maintenance managed hosting with automated backups, corporate SAML SSO, and 2-way Slack & Microsoft Teams bots?

Check out **[PantryPool Cloud (pantrypool.com)](https://pantrypool.com)** for our fully managed cloud service.

---

## 📄 License

PantryPool Community Edition is licensed under the **[Functional Source License, Version 1.1, MIT Future License (FSL-1.1-MIT)](LICENSE)**. Free to use, inspect, modify, and self-host for internal company, office, or household breakrooms. It prohibits offering the software as a competing hosted or managed cloud service until the rolling 2-year Change Date, after which each release converts automatically to the **MIT License**.
