# 🌾 PantryPool — Production Locust Load & API Stress Testing Suite

Enterprise-grade, distributed load testing suite implemented in **Python + Locust** designed to benchmark the live PantryPool Edge and Node.js APIs at scale.

---

## 🎯 Features

1. **100 Randomized Users Simulation**:
   - Each virtual user creates or assumes a distinct random user identity (`locust_vu_<hex>@pantrypool-test.internal`).
   - Authenticates via `/api/auth/register` and verifies credentials via `/api/auth/login`.
   - Provisions an isolated workspace organization and pantry pool with starter inventory (`/api/organizations/onboard`).
   - Tops up member balance (`/api/transactions/deposit`) to test continuous inventory consumption without hitting deficit blocks.
   - Gracefully clears sessions upon teardown (`/api/auth/logout`).

2. **100% API Parity Coverage**:
   - **Identity & Authentication**: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/profile`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/sso/status`, `/api/auth/sso/discover`, WebAuthn passkey options `/api/auth/passkey/*`.
   - **Organizations & Workspaces**: `/api/organizations`, `/api/organizations/:id`, `/api/organizations/:id/members`, `/api/organizations/onboard`, `/api/organizations/join`.
   - **Pools & Pantries**: `/api/pools`, `/api/pools/:id`, `/api/pools/:id/members`, `/api/pools/join`, `/api/pools/:id/nudge`, `/api/pools/:id/savings`, `/api/leaderboard/savings`.
   - **Inventory & Items**: `/api/items` (GET/POST/PUT/DELETE), `/api/items/consume`, `/api/items/discrepancy`.
   - **Financial Ledger**: `/api/transactions` (history audit), `/api/transactions/deposit`.
   - **Shopping & Team Polls**: `/api/pools/:id/shopping-list` (CRUD), `/api/pools/:id/polls` (CRUD), `/api/pools/:id/polls/:pollId/vote`.
   - **Notifications & Preferences**: `/api/notifications`, `/api/notifications/preferences`, `/api/notifications/test-notification`, `/api/notifications/mark-read`.
   - **Barcodes & Affiliates**: `/api/barcodes/lookup` (OpenFoodFacts engine), `/api/affiliate/products`, `/api/affiliate/click`.
   - **Telemetry & Sync**: `/api/telemetry/events` (batched event ingestion), `/api/sync/offline-batch` (offline queue synchronization).
   - **AI Restock Analytics**: `/api/ai-suggest-restock`, `/api/ai-log-applied` (safe, token-free fallback engine).
   - **Edge Health**: `/api/health`, `/api/settings/public`.

3. **Two Execution Modes**:
   - **Dynamic Mode**: Users are generated and authenticated on-the-fly as Locust ramps up virtual users.
   - **Pre-Seeded Mode**: `scripts/create_locust_users.py` asynchronously provisions 100 users beforehand and writes to `locust_users.json`, which virtual users consume instantly.

---

## 🚀 Quick Start

### 1. Interactive Web UI
Launch the Locust Web Dashboard (defaults to `https://pantrypool.com`):
```bash
npm run test:locust
# or
./scripts/run_locust.sh
```
Open **http://localhost:8089** in your browser, configure user count (e.g. 100) and spawn rate (e.g. 10), and click **Start Swarming**.

### 2. Automated Headless Run (100 Users)
Run a headless 100-user stress test for 1 minute:
```bash
npm run test:locust:headless
# or with custom parameters:
./scripts/run_locust.sh --headless -u 100 -r 10 -t 1m --html locust_report.html
```

### 3. Pre-Seeding 100 Users
To provision 100 users asynchronously before running tests:
```bash
npm run test:locust:preseed
# or with custom concurrency:
python3 scripts/create_locust_users.py --host https://pantrypool.com --count 100 --concurrency 10
```

---

## 📊 Reports & Artifacts

- **HTML Report**: `locust_report.html` (interactive charts, latency distributions, failure logs).
- **CSV Metrics**: `locust_stats_*.csv` (machine-readable throughput and latency percentiles).
- **Pre-seeded Users**: `locust_users.json` (stored user credentials and workspace metadata).
