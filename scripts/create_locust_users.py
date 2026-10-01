#!/usr/bin/env python3
"""
🚀 PantryPool — Fast Asynchronous User Provisioner for Locust Load Testing

Provisions N (default 100) random users against the production API,
setting up for each user:
  1. User account registration (/api/auth/register) -> JWT token
  2. Workspace & Pantry onboarding (/api/organizations/onboard) -> Org & Pool
  3. Starter ledger balance deposit (/api/transactions/deposit) -> $100.00 balance

Outputs the generated credentials and pool metadata to `locust_users.json`.
"""

import argparse
import asyncio
import json
import os
import random
import sys
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx

DEFAULT_TARGET_URL = os.getenv("TARGET_URL", "https://pantrypool.com").rstrip("/")
DEFAULT_USER_COUNT = int(os.getenv("USER_COUNT", "100"))
DEFAULT_CONCURRENCY = int(os.getenv("CONCURRENCY", "10"))
OUTPUT_FILE = os.getenv("OUTPUT_FILE", "locust_users.json")

FIRST_NAMES = [
    "Alex", "Jordan", "Taylor", "Morgan", "Sam", "Casey", "Riley", "Avery",
    "Quinn", "Skyler", "Dakota", "Reese", "Rowan", "Finley", "Harper", "Logan"
]
LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson"
]
ORG_NAMES = [
    "Acme Innovations", "Quantum Dynamics", "Nebula Systems", "Vertex Labs",
    "Helix BioTech", "Apex Global", "Pioneer Studios", "Zenith Media",
    "Horizon Logistics", "Beacon Financial", "Starlight Software", "Nova Retail"
]

def generate_random_user_spec(index: int) -> Dict[str, str]:
    uid = uuid.uuid4().hex[:8]
    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    name = f"{first} {last} (Locust #{index+1})"
    email = f"locust_user_{index+1:03d}_{uid}@pantrypool-test.internal"
    password = f"PantryP@ss_{uid}!2026"
    org_name = f"{random.choice(ORG_NAMES)} #{index+1}"
    pool_name = f"{first}'s Breakroom Pantry"
    return {
        "index": index + 1,
        "name": name,
        "email": email,
        "password": password,
        "org_name": org_name,
        "pool_name": pool_name,
    }

async def provision_single_user(
    client: httpx.AsyncClient,
    spec: Dict[str, Any],
    base_url: str,
    semaphore: asyncio.Semaphore
) -> Optional[Dict[str, Any]]:
    async with semaphore:
        for attempt in range(3):
            try:
                # 1. Register User
                reg_payload = {
                    "email": spec["email"],
                    "password": spec["password"],
                    "name": spec["name"]
                }
                reg_res = await client.post(
                    f"{base_url}/api/auth/register",
                    json=reg_payload,
                    timeout=20.0
                )
                if reg_res.status_code != 200:
                    err_text = reg_res.text[:120]
                    if attempt < 2:
                        await asyncio.sleep(1.0 * (attempt + 1))
                        continue
                    print(f"❌ [{spec['index']}] Registration failed ({reg_res.status_code}): {err_text}", file=sys.stderr)
                    return None

                reg_data = reg_res.json()
                token = reg_data.get("token")
                user = reg_data.get("user", {})
                user_id = user.get("id")

                if not token or not user_id:
                    print(f"❌ [{spec['index']}] Incomplete registration payload", file=sys.stderr)
                    return None

                auth_headers = {
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json"
                }

                # 2. Atomic Workspace & Pool Onboarding
                onboard_payload = {
                    "orgName": spec["org_name"],
                    "poolName": spec["pool_name"],
                    "category": "Office",
                    "currency": "$",
                    "starterItems": True
                }
                onboard_res = await client.post(
                    f"{base_url}/api/organizations/onboard",
                    json=onboard_payload,
                    headers=auth_headers,
                    timeout=25.0
                )
                if onboard_res.status_code != 200:
                    err_text = onboard_res.text[:120]
                    if attempt < 2:
                        await asyncio.sleep(1.0 * (attempt + 1))
                        continue
                    print(f"❌ [{spec['index']}] Onboarding failed ({onboard_res.status_code}): {err_text}", file=sys.stderr)
                    return None

                onboard_data = onboard_res.json()
                org = onboard_data.get("organization", {})
                pool = onboard_data.get("pool", {})
                org_id = org.get("id")
                pool_id = pool.get("id")
                pool_code = pool.get("code") or pool.get("qrCodeKey")

                # 3. Seed Initial Balance ($100.00)
                deposit_payload = {
                    "poolId": pool_id,
                    "amount": 100.0,
                    "description": "Locust Test Pre-Seed Balance ($100.00)"
                }
                await client.post(
                    f"{base_url}/api/transactions/deposit",
                    json=deposit_payload,
                    headers=auth_headers,
                    timeout=15.0
                )

                return {
                    "index": spec["index"],
                    "name": spec["name"],
                    "email": spec["email"],
                    "password": spec["password"],
                    "userId": user_id,
                    "token": token,
                    "organizationId": org_id,
                    "organizationName": spec["org_name"],
                    "poolId": pool_id,
                    "poolName": spec["pool_name"],
                    "poolCode": pool_code
                }

            except Exception as e:
                if attempt < 2:
                    await asyncio.sleep(1.0 * (attempt + 1))
                    continue
                print(f"❌ [{spec['index']}] Exception during provisioning: {str(e)}", file=sys.stderr)
                return None
    return None

async def main_async(target_url: str, count: int, concurrency: int, output_path: str):
    print("=======================================================================")
    print(" 🚀 PantryPool — Fast Asynchronous 100-User Provisioner")
    print("=======================================================================")
    print(f"🌐 Target Host : {target_url}")
    print(f"👥 Users Count : {count}")
    print(f"⚡ Concurrency : {concurrency}")
    print(f"💾 Output File : {output_path}")
    print("-----------------------------------------------------------------------\n")

    limits = httpx.Limits(max_keepalive_connections=concurrency * 2, max_connections=concurrency * 3)
    transport = httpx.AsyncHTTPTransport(retries=2, verify=True)
    semaphore = asyncio.Semaphore(concurrency)

    specs = [generate_random_user_spec(i) for i in range(count)]
    t0 = time.perf_counter()

    async with httpx.AsyncClient(limits=limits, transport=transport) as client:
        tasks = [
            provision_single_user(client, spec, target_url, semaphore)
            for spec in specs
        ]
        
        # Display progressive feedback
        completed_users = []
        for i, coro in enumerate(asyncio.as_completed(tasks)):
            res = await coro
            if res:
                completed_users.append(res)
            done_count = len(completed_users)
            pct = (done_count / count) * 100
            sys.stdout.write(f"\r✨ Provisioned: {done_count}/{count} users ({pct:.1f}%) ...")
            sys.stdout.flush()

    total_time = time.perf_counter() - t0
    sys.stdout.write("\n\n")

    completed_users.sort(key=lambda u: u["index"])

    # Write output JSON
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(completed_users, f, indent=2)

    print("=======================================================================")
    print(f"✅ Successfully provisioned {len(completed_users)}/{count} users in {total_time:.2f}s!")
    print(f"📄 Saved credentials and pool configurations to: {output_path}")
    print("=======================================================================\n")

def main():
    parser = argparse.ArgumentParser(description="Provision random users for PantryPool load testing")
    parser.add_argument("--host", default=DEFAULT_TARGET_URL, help="Target API host base URL")
    parser.add_argument("--count", type=int, default=DEFAULT_USER_COUNT, help="Number of users to provision (default: 100)")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help="Max concurrent connections (default: 10)")
    parser.add_argument("--output", default=OUTPUT_FILE, help="Output JSON path")
    args = parser.parse_args()

    asyncio.run(main_async(args.host.rstrip("/"), args.count, args.concurrency, args.output))

if __name__ == "__main__":
    main()
