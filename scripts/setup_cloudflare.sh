#!/usr/bin/env bash
# ==============================================================================
# PantryPool — 1-Step Turnkey Cloudflare Platform Deployment Script
# 
# Provisions Cloudflare D1 Serverless SQL Database, executes schema migrations,
# configures wrangler bindings, builds static assets, and deploys to Cloudflare Pages.
# ==============================================================================

set -e

COLOR_RESET="\033[0m"
COLOR_BOLD="\033[1m"
COLOR_GREEN="\033[32m"
COLOR_ORANGE="\033[38;5;208m"
COLOR_BLUE="\033[34m"
COLOR_RED="\033[31m"

echo -e "${COLOR_ORANGE}${COLOR_BOLD}"
echo "======================================================================"
echo "   PantryPool — 1-Step Cloudflare Edge Platform Setup"
echo "======================================================================"
echo -e "${COLOR_RESET}"

# 1. Dependency Checks
echo -e "${COLOR_BLUE}🔍 [1/6] Checking prerequisites...${COLOR_RESET}"

if ! command -v node &> /dev/null; then
  echo -e "${COLOR_RED}❌ Error: Node.js is not installed. Please install Node.js v18+ first.${COLOR_RESET}"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo -e "${COLOR_RED}❌ Error: npm is not installed.${COLOR_RESET}"
  exit 1
fi

echo -e "${COLOR_GREEN}✓ Node.js and npm verified.${COLOR_RESET}"

# 2. Cloudflare Wrangler Authentication Check
echo -e "\n${COLOR_BLUE}🔐 [2/6] Verifying Cloudflare Wrangler credentials...${COLOR_RESET}"

if ! npx wrangler whoami &> /dev/null; then
  echo -e "${COLOR_ORANGE}⚠️ Not authenticated with Cloudflare. Launching browser login...${COLOR_RESET}"
  npx wrangler login
else
  echo -e "${COLOR_GREEN}✓ Cloudflare authentication confirmed.${COLOR_RESET}"
fi

# 3. Cloudflare D1 Database Provisioning
DB_NAME="pantrypool-db"
echo -e "\n${COLOR_BLUE}🗄️ [3/6] Provisioning Cloudflare D1 Database '${DB_NAME}'...${COLOR_RESET}"

# Check if database already exists or create it
D1_OUTPUT=$(npx wrangler d1 create "$DB_NAME" 2>&1 || true)

DB_ID=$(echo "$D1_OUTPUT" | grep -oE "database_id = \"[a-f0-9-]+\"" | head -n 1 | cut -d'"' -f2 || true)

if [ -z "$DB_ID" ]; then
  # Try querying existing database list
  DB_ID=$(npx wrangler d1 list --json 2>/dev/null | node -e '
    const fs = require("fs");
    try {
      const list = JSON.parse(fs.readFileSync(0, "utf8"));
      const match = list.find(d => d.name === "pantrypool-db");
      if (match) process.stdout.write(match.uuid);
    } catch (e) {}
  ' 2>/dev/null || true)
fi

if [ -n "$DB_ID" ]; then
  echo -e "${COLOR_GREEN}✓ D1 Database ID: ${DB_ID}${COLOR_RESET}"
  
  # Update wrangler.jsonc with the provisioned database_id
  node -e "
    const fs = require('fs');
    const path = './wrangler.jsonc';
    if (fs.existsSync(path)) {
      let content = fs.readFileSync(path, 'utf8');
      content = content.replace(/\"database_id\":\s*\"[^\"]*\"/, '\"database_id\": \"$DB_ID\"');
      fs.writeFileSync(path, content, 'utf8');
    }
  "
  echo -e "${COLOR_GREEN}✓ Updated wrangler.jsonc with database binding.${COLOR_RESET}"
else
  echo -e "${COLOR_ORANGE}⚠️ Using existing database ID from wrangler.jsonc.${COLOR_RESET}"
fi

# 4. Execute SQL Schema Migration on Remote D1
echo -e "\n${COLOR_BLUE}📜 [4/6] Applying D1 SQL database schema (schema.sql)...${COLOR_RESET}"
if [ -f "./schema.sql" ]; then
  npx wrangler d1 execute "$DB_NAME" --remote --file="./schema.sql" -y
  echo -e "${COLOR_GREEN}✓ Schema successfully applied to remote D1 cluster!${COLOR_RESET}"
else
  echo -e "${COLOR_RED}❌ Error: schema.sql not found in current directory.${COLOR_RESET}"
  exit 1
fi

# 5. Build Frontend & Edge Distribution
echo -e "\n${COLOR_BLUE}⚡ [5/6] Compiling production build (Vite + Edge Assets)...${COLOR_RESET}"
npm run build
echo -e "${COLOR_GREEN}✓ Production bundle generated in ./dist${COLOR_RESET}"

# 6. Deploy to Cloudflare Pages
echo -e "\n${COLOR_BLUE}🚀 [6/6] Deploying project to Cloudflare Pages...${COLOR_RESET}"
npx wrangler pages deploy dist --project-name=pantrypool --commit-dirty=true

echo -e "\n${COLOR_GREEN}${COLOR_BOLD}======================================================================"
echo "   🎉 PantryPool Platform Successfully Deployed to Cloudflare!"
echo "======================================================================${COLOR_RESET}"
echo -e "Your application is now live on Cloudflare's Global Edge Network."
echo -e "To configure secrets on Cloudflare Pages:"
echo -e "  - npx wrangler pages secret put JWT_SECRET --project-name=pantrypool"
echo -e "  - npx wrangler pages secret put GEMINI_API_KEY --project-name=pantrypool"
echo -e "  - npx wrangler pages secret put EMAIL_RELAY_URL --project-name=pantrypool"
echo -e "  - npx wrangler pages secret put EMAIL_RELAY_SECRET --project-name=pantrypool"
echo -e "======================================================================\n"
