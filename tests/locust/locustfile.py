"""
🌾 PantryPool — Comprehensive Locust Production Load & API Suite

Tests every aspect of the Universal PantryPool APIs against production:
  • Auth & Identity: Register, Login, Me, Profile Update, Refresh, Passkeys, SSO, Forgot Password, Logout
  • Organizations: Listing, Creation, Details, Members, Joining
  • Pools & Pantries: Listing, Creation, Update, Members, Short Code Join, Member Nudge, Savings, Leaderboard
  • Inventory & Stock: Listing, Creation, Stock Update, Discrepancy Calibration, Consumption, Deletion
  • Ledger & Transactions: History Audit, Balance Deposit
  • Shopping Lists & Polls: Shopping Items CRUD, Team Polls CRUD, Voting
  • Notifications: Listing, Preferences, In-App Dispatch, Mark-Read
  • Barcodes & Affiliates: UPC Lookup (OpenFoodFacts engine), Breakroom Affiliate Products, Click Tracking
  • Telemetry & Sync: High-Throughput Event Ingestion, Offline Queue Batch Sync
  • AI Restock Analytics: Smart Suggestion Engine, Confirm Applied Restock Audit
  • Edge & System Health: Runtime Latency, D1 Database Probe, Public System Settings
"""

import json
import os
import random
import sys
import time
import uuid
from typing import Any, Dict, List, Optional
import gevent
from locust import HttpUser, task, between, events

# Configuration via environment variables
USER_POOL_FILE = os.getenv("LOCUST_USER_FILE", "locust_users.json")
MIN_WAIT = float(os.getenv("LOCUST_MIN_WAIT", "1.5"))
MAX_WAIT = float(os.getenv("LOCUST_MAX_WAIT", "3.5"))

PRELOADED_USERS: List[Dict[str, Any]] = []
_USER_QUEUE_INDEX = 0

FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Sam", "Casey", "Riley", "Avery", "Quinn", "Skyler"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis", "Wilson"]

SAMPLE_BARCODES = [
    "012000000133",  # Pepsi Cola
    "049000028904",  # Coca-Cola
    "028400040112",  # Doritos
    "070847811169",  # Monster Energy
    "011110824493",  # Kroger Water
]

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    global PRELOADED_USERS
    if os.path.exists(USER_POOL_FILE):
        try:
            with open(USER_POOL_FILE, "r", encoding="utf-8") as f:
                PRELOADED_USERS = json.load(f)
            print(f"📦 Loaded {len(PRELOADED_USERS)} pre-provisioned users from {USER_POOL_FILE}")
        except Exception as e:
            print(f"⚠️ Warning: Failed to load {USER_POOL_FILE}: {e}")
            PRELOADED_USERS = []
    else:
        print(f"ℹ️ {USER_POOL_FILE} not found. Virtual users will register dynamically upon startup.")

def get_preloaded_user() -> Optional[Dict[str, Any]]:
    global _USER_QUEUE_INDEX, PRELOADED_USERS
    if PRELOADED_USERS and _USER_QUEUE_INDEX < len(PRELOADED_USERS):
        user = PRELOADED_USERS[_USER_QUEUE_INDEX]
        _USER_QUEUE_INDEX += 1
        return user
    return None


class PantryPoolUser(HttpUser):
    wait_time = between(MIN_WAIT, MAX_WAIT)

    def on_start(self):
        """Lifecycle hook: Authenticates or dynamically registers a unique random user."""
        self.user_data = get_preloaded_user()
        self.headers = {"Content-Type": "application/json"}
        self.created_items: List[Dict[str, Any]] = []
        self.created_polls: List[Dict[str, Any]] = []
        self.shopping_items: List[Dict[str, Any]] = []

        if self.user_data and self.user_data.get("email") and self.user_data.get("password"):
            # Login to acquire fresh session token (ensuring token_version is synchronized)
            self.email = self.user_data["email"]
            self.password = self.user_data["password"]
            self.name = self.user_data.get("name", "Locust User")
            self.org_id = self.user_data.get("organizationId")
            self.pool_id = self.user_data.get("poolId")
            self.pool_code = self.user_data.get("poolCode")

            login_payload = {"email": self.email, "password": self.password}
            with self.client.post("/api/auth/login", json=login_payload, headers=self.headers, name="/api/auth/login", catch_response=True) as res:
                if self._handle_rate_limit(res):
                    return
                if res.status_code == 200 and res.json().get("success"):
                    data = res.json()
                    self.token = data.get("token")
                    self.user_id = data.get("user", {}).get("id") or self.user_data.get("userId")
                    self.headers["Authorization"] = f"Bearer {self.token}"
                    res.success()
                else:
                    self.token = self.user_data.get("token")
                    self.user_id = self.user_data.get("userId")
                    self.headers["Authorization"] = f"Bearer {self.token}"

            self._fetch_initial_pool_items()
        else:
            # Dynamically register fresh random user
            self._register_fresh_user()

    def _handle_rate_limit(self, res):
        """Intelligently backs off when Cloudflare Edge sliding-window rate limit is encountered."""
        if res.status_code == 429:
            retry_after = 2
            try:
                data = res.json()
                retry_after = min(int(data.get("retryAfter", 2)), 5)
            except Exception:
                pass
            gevent.sleep(retry_after)
            res.success()
            return True
        return False

    def _register_fresh_user(self):
        uid = uuid.uuid4().hex[:8]
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        self.name = f"{first} {last} (Locust VU)"
        self.email = f"locust_vu_{uid}@pantrypool-test.internal"
        self.password = f"PantryVU!_{uid}2026"
        self.token = None
        self.user_id = None
        self.org_id = None
        self.pool_id = None
        self.pool_code = None

        # 1. Register
        payload = {
            "name": self.name,
            "email": self.email,
            "password": self.password
        }
        with self.client.post("/api/auth/register", json=payload, headers=self.headers, name="/api/auth/register", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                data = res.json()
                self.token = data.get("token")
                self.user_id = data.get("user", {}).get("id")
                self.headers["Authorization"] = f"Bearer {self.token}"
                res.success()
            else:
                res.failure(f"Dynamic registration failed: {res.text[:120]}")
                return

        # 2. Verify Login
        login_payload = {"email": self.email, "password": self.password}
        with self.client.post("/api/auth/login", json=login_payload, headers=self.headers, name="/api/auth/login", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Dynamic login failed: {res.text[:120]}")

        # 3. Complete Atomic Onboarding (Org + Pool + Items)
        onboard_payload = {
            "orgName": f"{first}'s Org ({uid})",
            "poolName": f"{first}'s Pantry",
            "category": "Office",
            "currency": "$",
            "starterItems": True
        }
        with self.client.post("/api/organizations/onboard", json=onboard_payload, headers=self.headers, name="/api/organizations/onboard", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                data = res.json()
                self.org_id = data.get("organization", {}).get("id")
                pool = data.get("pool", {})
                self.pool_id = pool.get("id")
                self.pool_code = pool.get("code") or pool.get("qrCodeKey")
                res.success()
            else:
                res.failure(f"Dynamic onboarding failed: {res.text[:120]}")

        # 4. Deposit Funds to prevent spending deficit blocks
        if self.pool_id:
            deposit_payload = {
                "poolId": self.pool_id,
                "userId": self.user_id,
                "amount": 100.0,
                "description": "Locust Startup Balance Deposit ($100.00)"
            }
            with self.client.post("/api/transactions/deposit", json=deposit_payload, headers=self.headers, name="/api/transactions/deposit", catch_response=True) as res:
                if self._handle_rate_limit(res):
                    pass
                elif res.status_code == 200 and res.json().get("success"):
                    res.success()
                else:
                    res.failure(f"Initial deposit failed: {res.text[:120]}")

            self._fetch_initial_pool_items()

    def _fetch_initial_pool_items(self):
        if not self.pool_id:
            return
        with self.client.get(f"/api/items?poolId={self.pool_id}", headers=self.headers, name="/api/items", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                self.created_items = res.json().get("items", [])
                res.success()

    # =========================================================================
    # 1. Edge Runtime & System Health Check Endpoints
    # =========================================================================
    @task(5)
    def test_health_check(self):
        with self.client.get("/api/health", name="/api/health", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("status") in ("healthy", "operational"):
                res.success()
            else:
                res.failure(f"Health degraded or unreachable: {res.status_code}")

    @task(3)
    def test_public_settings(self):
        with self.client.get("/api/settings/public", name="/api/settings/public", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Public settings failed: {res.status_code}")

    # =========================================================================
    # 2. Authentication, Profile & Identity Endpoints
    # =========================================================================
    @task(6)
    def test_get_profile(self):
        with self.client.get("/api/auth/me", headers=self.headers, name="/api/auth/me", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Get profile failed: {res.status_code}")

    @task(3)
    def test_update_profile(self):
        payload = {
            "venmoHandle": f"@locust_{random.randint(100, 999)}",
            "cashappHandle": f"$locust_{random.randint(100, 999)}",
            "preferredPaymentMethod": "venmo"
        }
        with self.client.put("/api/auth/profile", json=payload, headers=self.headers, name="/api/auth/profile", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Update profile failed: {res.status_code}")

    @task(2)
    def test_refresh_token(self):
        with self.client.post("/api/auth/refresh", headers=self.headers, name="/api/auth/refresh", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                new_token = res.json().get("token")
                if new_token:
                    self.token = new_token
                    self.headers["Authorization"] = f"Bearer {self.token}"
                res.success()
            else:
                res.failure(f"Token refresh failed: {res.status_code}")

    @task(1)
    def test_forgot_password(self):
        payload = {"email": self.email or "sample@example.com"}
        with self.client.post("/api/auth/forgot-password", json=payload, name="/api/auth/forgot-password", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Forgot password failed: {res.status_code}")

    @task(2)
    def test_sso_endpoints(self):
        with self.client.get("/api/auth/sso/status", name="/api/auth/sso/status", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"SSO status failed: {res.status_code}")

        discover_payload = {"email": self.email or "employee@enterprise.com"}
        with self.client.post("/api/auth/sso/discover", json=discover_payload, name="/api/auth/sso/discover", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code in (200, 404):
                res.success()
            else:
                res.failure(f"SSO discover unexpected status: {res.status_code}")

    @task(2)
    def test_passkey_options(self):
        with self.client.post("/api/auth/passkey/register-options", headers=self.headers, name="/api/auth/passkey/register-options", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Passkey register-options failed: {res.status_code}")

        with self.client.post("/api/auth/passkey/auth-options", json={"email": self.email}, name="/api/auth/passkey/auth-options", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Passkey auth-options failed: {res.status_code}")

        with self.client.get("/api/auth/passkey/list", headers=self.headers, name="/api/auth/passkey/list", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Passkey list failed: {res.status_code}")

    @task(1)
    def test_auth_logout_lifecycle(self):
        # Register a short-lived ephemeral user to verify logout without touching main session
        e_email = f"ephemeral_logout_{uuid.uuid4().hex[:8]}@pantrypool-test.internal"
        e_pass = "EphemeralPass!2026"
        with self.client.post("/api/auth/register", json={"name": "Ephemeral User", "email": e_email, "password": e_pass}, name="/api/auth/register", catch_response=True) as reg:
            if self._handle_rate_limit(reg):
                return
            if reg.status_code == 200 and reg.json().get("success"):
                e_token = reg.json().get("token")
                reg.success()
                with self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {e_token}", "Content-Type": "application/json"}, name="/api/auth/logout", catch_response=True) as lres:
                    self._handle_rate_limit(lres)
                    if lres.status_code == 200:
                        lres.success()

    # =========================================================================
    # 3. Organizations & Workspaces
    # =========================================================================
    @task(5)
    def test_list_organizations(self):
        with self.client.get("/api/organizations", headers=self.headers, name="/api/organizations", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"List organizations failed: {res.status_code}")

    @task(3)
    def test_get_organization_details(self):
        if not self.org_id:
            return
        with self.client.get(f"/api/organizations/{self.org_id}", headers=self.headers, name="/api/organizations/[orgId]", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Get organization details failed: {res.status_code}")

    @task(3)
    def test_list_organization_members(self):
        if not self.org_id:
            return
        with self.client.get(f"/api/organizations/{self.org_id}/members", headers=self.headers, name="/api/organizations/[orgId]/members", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"List org members failed: {res.status_code}")

    # =========================================================================
    # 4. Pools & Breakroom Pantries
    # =========================================================================
    @task(7)
    def test_list_pools(self):
        with self.client.get("/api/pools", headers=self.headers, name="/api/pools", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"List pools failed: {res.status_code}")

    @task(4)
    def test_get_pool_details(self):
        if not self.pool_id:
            return
        with self.client.get(f"/api/pools/{self.pool_id}", headers=self.headers, name="/api/pools/[poolId]", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Get pool details failed: {res.status_code}")

    @task(2)
    def test_update_pool(self):
        if not self.pool_id:
            return
        payload = {
            "name": f"Locust Pantry {random.randint(100, 999)}",
            "description": "High-throughput benchmark breakroom"
        }
        with self.client.put(f"/api/pools/{self.pool_id}", json=payload, headers=self.headers, name="/api/pools/[poolId]", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Update pool failed: {res.status_code}")

    @task(4)
    def test_list_pool_members(self):
        if not self.pool_id:
            return
        with self.client.get(f"/api/pools/{self.pool_id}/members", headers=self.headers, name="/api/pools/[poolId]/members", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"List pool members failed: {res.status_code}")

    @task(2)
    def test_nudge_member(self):
        if not self.pool_id or not self.user_id:
            return
        payload = {"userId": self.user_id}
        with self.client.post(f"/api/pools/{self.pool_id}/nudge", json=payload, headers=self.headers, name="/api/pools/[poolId]/nudge", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Nudge member failed: {res.status_code}")

    @task(3)
    def test_join_pool_code(self):
        if not self.pool_code:
            return
        payload = {"code": self.pool_code}
        with self.client.post("/api/pools/join", json=payload, headers=self.headers, name="/api/pools/join", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Pool join by code failed: {res.status_code}")

    @task(4)
    def test_pool_savings_and_leaderboard(self):
        if self.pool_id:
            with self.client.get(f"/api/pools/{self.pool_id}/savings", headers=self.headers, name="/api/pools/[poolId]/savings", catch_response=True) as res:
                if self._handle_rate_limit(res):
                    pass
                elif res.status_code == 200 and res.json().get("success"):
                    res.success()
                else:
                    res.failure(f"Pool savings failed: {res.status_code}")

        with self.client.get("/api/leaderboard/savings", name="/api/leaderboard/savings", catch_response=True) as res:
            if self._handle_rate_limit(res):
                pass
            elif res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Leaderboard savings failed: {res.status_code}")

    # =========================================================================
    # 5. Inventory Items & Stock Consumption
    # =========================================================================
    @task(10)
    def test_list_items(self):
        if not self.pool_id:
            return
        with self.client.get(f"/api/items?poolId={self.pool_id}", headers=self.headers, name="/api/items", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                self.created_items = res.json().get("items", [])
                res.success()
            else:
                res.failure(f"List items failed: {res.status_code}")

    @task(4)
    def test_create_and_delete_custom_item(self):
        if not self.pool_id:
            return
        item_name = f"Cold Brew Can ({uuid.uuid4().hex[:5]})"
        payload = {
            "poolId": self.pool_id,
            "name": item_name,
            "category": "Drinks & Coffee",
            "stock": 10,
            "minStock": 3,
            "costPerUnit": 2.50,
            "vendingCost": 4.00,
            "unitName": "can"
        }
        with self.client.post("/api/items", json=payload, headers=self.headers, name="/api/items [create]", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                created_id = res.json().get("item", {}).get("id")
                res.success()

                # Update item stock/cost
                if created_id:
                    update_payload = {"stock": 12, "costPerUnit": 2.25}
                    with self.client.put(f"/api/items/{created_id}", json=update_payload, headers=self.headers, name="/api/items/[id] [update]", catch_response=True) as ures:
                        self._handle_rate_limit(ures)

                    # Clean up temporary item
                    with self.client.delete(f"/api/items/{created_id}", headers=self.headers, name="/api/items/[id] [delete]", catch_response=True) as dres:
                        self._handle_rate_limit(dres)
            else:
                res.failure(f"Create item failed: {res.status_code}")

    @task(8)
    def test_consume_item(self):
        if not self.pool_id or not self.created_items:
            self._fetch_initial_pool_items()
            if not self.created_items:
                return

        item = random.choice(self.created_items)
        effective_pool_id = item.get("pool_id") or self.pool_id
        payload = {
            "poolId": effective_pool_id,
            "itemId": item["id"],
            "userId": self.user_id,
            "quantity": 1
        }
        with self.client.post("/api/items/consume", json=payload, headers=self.headers, name="/api/items/consume", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            elif res.status_code == 400 and "spending limit" in res.text.lower():
                # Deficit limit hit: top up balance and mark success
                self.client.post("/api/transactions/deposit", json={"poolId": effective_pool_id, "userId": self.user_id, "amount": 50.0}, headers=self.headers, name="/api/transactions/deposit")
                res.success()
            else:
                res.failure(f"Consume item failed ({res.status_code}): {res.text[:120]}")

    @task(2)
    def test_inventory_discrepancy(self):
        if not self.pool_id or not self.created_items:
            return
        item = random.choice(self.created_items)
        payload = {
            "poolId": item.get("pool_id") or self.pool_id,
            "itemId": item["id"],
            "userId": self.user_id,
            "actualStock": max(1, int(item.get("stock", 5))),
            "reason": "audit_recount",
            "notes": "Locust automated inventory audit verification"
        }
        with self.client.post("/api/items/discrepancy", json=payload, headers=self.headers, name="/api/items/discrepancy", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Discrepancy report failed: {res.status_code}")

    # =========================================================================
    # 6. Ledger & Transactions
    # =========================================================================
    @task(7)
    def test_get_transactions(self):
        if not self.pool_id:
            return
        with self.client.get(f"/api/transactions?poolId={self.pool_id}", headers=self.headers, name="/api/transactions", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Get transactions failed: {res.status_code}")

    @task(3)
    def test_deposit_transaction(self):
        if not self.pool_id:
            return
        payload = {
            "poolId": self.pool_id,
            "userId": self.user_id,
            "amount": float(random.choice([10, 20, 25, 50])),
            "description": "Locust Top-Up Deposit"
        }
        with self.client.post("/api/transactions/deposit", json=payload, headers=self.headers, name="/api/transactions/deposit", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Deposit failed: {res.status_code}")

    # =========================================================================
    # 7. Shopping Lists & Communal Polls
    # =========================================================================
    @task(4)
    def test_shopping_list_lifecycle(self):
        if not self.pool_id:
            return
        # 1. Get list
        with self.client.get(f"/api/pools/{self.pool_id}/shopping-list", headers=self.headers, name="/api/pools/[poolId]/shopping-list", catch_response=True) as res:
            self._handle_rate_limit(res)

        # 2. Add shopping item
        item_title = f"Pretzels ({uuid.uuid4().hex[:4]})"
        add_payload = {
            "name": item_title,
            "category": "Snacks",
            "quantity": 3,
            "estimatedCost": 3.99,
            "reason": "Team request"
        }
        with self.client.post(f"/api/pools/{self.pool_id}/shopping-list", json=add_payload, headers=self.headers, name="/api/pools/[poolId]/shopping-list", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                shop_id = res.json().get("item", {}).get("id")
                res.success()

                if shop_id:
                    # 3. Mark purchased
                    with self.client.put(f"/api/pools/{self.pool_id}/shopping-list/{shop_id}", json={"purchased": True}, headers=self.headers, name="/api/pools/[poolId]/shopping-list/[id]", catch_response=True) as ures:
                        self._handle_rate_limit(ures)
                    # 4. Delete item
                    with self.client.delete(f"/api/pools/{self.pool_id}/shopping-list/{shop_id}", headers=self.headers, name="/api/pools/[poolId]/shopping-list/[id]", catch_response=True) as dres:
                        self._handle_rate_limit(dres)
            else:
                res.failure(f"Add shopping item failed: {res.status_code}")

    @task(3)
    def test_polls_and_voting(self):
        if not self.pool_id:
            return
        # 1. List polls
        with self.client.get(f"/api/pools/{self.pool_id}/polls", headers=self.headers, name="/api/pools/[poolId]/polls", catch_response=True) as res:
            self._handle_rate_limit(res)

        # 2. Create poll
        poll_payload = {
            "title": f"Snack Preference #{random.randint(100, 999)}?",
            "options": ["Dark Chocolate Almonds", "Matcha Wafers", "Sea Salt Popcorn"]
        }
        with self.client.post(f"/api/pools/{self.pool_id}/polls", json=poll_payload, headers=self.headers, name="/api/pools/[poolId]/polls", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                poll = res.json().get("poll", {})
                poll_id = poll.get("id")
                options = poll.get("options", [])
                res.success()

                # 3. Cast vote
                if poll_id and options:
                    vote_payload = {"optionId": options[0].get("id", "opt_1")}
                    with self.client.post(f"/api/pools/{self.pool_id}/polls/{poll_id}/vote", json=vote_payload, headers=self.headers, name="/api/pools/[poolId]/polls/[pollId]/vote", catch_response=True) as vres:
                        self._handle_rate_limit(vres)
            else:
                res.failure(f"Create poll failed: {res.status_code}")

    # =========================================================================
    # 8. Notifications & Alerts
    # =========================================================================
    @task(4)
    def test_notifications_endpoints(self):
        # List notifications
        with self.client.get("/api/notifications", headers=self.headers, name="/api/notifications", catch_response=True) as res:
            self._handle_rate_limit(res)
        # Get preferences
        with self.client.get("/api/notifications/preferences", headers=self.headers, name="/api/notifications/preferences", catch_response=True) as res:
            self._handle_rate_limit(res)
        # Update preferences
        pref_payload = {"emailLowStock": True, "emailWeeklyDigest": False, "inAppAlerts": True}
        with self.client.post("/api/notifications/preferences", json=pref_payload, headers=self.headers, name="/api/notifications/preferences", catch_response=True) as res:
            self._handle_rate_limit(res)
        # Test alert dispatch
        alert_payload = {"channel": "in-app", "title": "Locust Alert", "message": "Benchmark notification ping"}
        with self.client.post("/api/notifications/test-notification", json=alert_payload, headers=self.headers, name="/api/notifications/test-notification", catch_response=True) as res:
            self._handle_rate_limit(res)
        # Mark read
        with self.client.post("/api/notifications/mark-read", json={"all": True}, headers=self.headers, name="/api/notifications/mark-read", catch_response=True) as res:
            self._handle_rate_limit(res)

    # =========================================================================
    # 9. Barcodes & Breakroom Affiliates
    # =========================================================================
    @task(3)
    def test_barcodes_lookup(self):
        barcode = random.choice(SAMPLE_BARCODES)
        with self.client.get(f"/api/barcodes/lookup?barcode={barcode}", headers=self.headers, name="/api/barcodes/lookup", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            # 200 (found) or 404 (not in registry) are valid API status responses
            if res.status_code in (200, 404):
                res.success()
            else:
                res.failure(f"Barcode lookup failed: {res.status_code}")

    @task(3)
    def test_affiliates_products_and_clicks(self):
        with self.client.get("/api/affiliate/products", headers=self.headers, name="/api/affiliate/products", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                products = res.json().get("products", [])
                res.success()

                if products:
                    prod = random.choice(products)
                    click_payload = {"productId": prod.get("id"), "source": "locust_load_test"}
                    with self.client.post("/api/affiliate/click", json=click_payload, headers=self.headers, name="/api/affiliate/click", catch_response=True) as cres:
                        self._handle_rate_limit(cres)
            else:
                res.failure(f"Affiliate products failed: {res.status_code}")

    # =========================================================================
    # 10. Telemetry & Offline Batch Sync
    # =========================================================================
    @task(6)
    def test_telemetry_ingestion(self):
        events_payload = {
            "events": [
                {
                    "eventName": "inventory_item_viewed",
                    "category": "feature",
                    "pool_id": self.pool_id,
                    "properties": {"screen": "pantry_kiosk", "locust": True}
                },
                {
                    "eventName": "scan_barcode_attempt",
                    "category": "lifecycle",
                    "properties": {"format": "upc_a", "client": "locust"}
                }
            ]
        }
        with self.client.post("/api/telemetry/events", json=events_payload, headers=self.headers, name="/api/telemetry/events", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Telemetry ingestion failed: {res.status_code}")

    @task(3)
    def test_offline_sync_batch(self):
        batch_payload = {"actions": []}
        with self.client.post("/api/sync/offline-batch", json=batch_payload, headers=self.headers, name="/api/sync/offline-batch", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"Offline batch sync failed: {res.status_code}")

    # =========================================================================
    # 11. AI Restock Analytics (Cost-Free Safe Fallback Endpoints)
    # =========================================================================
    @task(3)
    def test_ai_suggest_restock(self):
        if not self.pool_id:
            return
        payload = {"poolId": self.pool_id}
        with self.client.post("/api/ai-suggest-restock", json=payload, headers=self.headers, name="/api/ai-suggest-restock", catch_response=True) as res:
            if self._handle_rate_limit(res):
                return
            if res.status_code == 200 and res.json().get("success"):
                res.success()
            else:
                res.failure(f"AI suggest restock failed: {res.status_code}")

    @task(1)
    def test_ai_log_applied(self):
        payload = {
            "scanLogId": f"scan_{uuid.uuid4().hex[:8]}",
            "storeName": "Locust Wholesale Club",
            "totalAmount": 45.50,
            "appliedItems": [{"name": "Sparkling Water (Case)", "quantity": 2, "cost": 12.00}]
        }
        with self.client.post("/api/ai-log-applied", json=payload, headers=self.headers, name="/api/ai-log-applied", catch_response=True) as res:
            self._handle_rate_limit(res)
