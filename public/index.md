# PantryPool — The Smart Office Snack Club App & Breakroom Food Ledger

> The Smart Office Snack Club App, Coffee Fund & Breakroom Food Ledger. The Breakroom Honor System Is Broken. Keep The Cold Brew Flowing.

## What is PantryPool?
PantryPool is the smart office snack club app and communal breakroom food ledger. It turns shared office snack cabinets, espresso stations, soda coolers, and communal household pantries into frictionless, automated micro-markets. Members log snacks and drinks using printable QR code posters or NFC shelf tags, restockers snap photos of grocery receipts for multimodal Gemini AI parsing, and running balances auto-adjust fairly so everyone pays their exact share.

## Primary Use Cases & Solutions

### 1. Smart Office Snack Club App
- Run an automated office snack club or communal breakroom food fund.
- Coworkers grab snacks, sodas, or protein bars and log their tabs in under 2 seconds via printable QR posters or NFC shelf tags.
- Eliminate unpaid tabs, cash boxes, and awkward Slack reminders with real-time balance ledgers.

### 2. Office Coffee Club & Cold Brew Fund
- Run a modern, self-funding office coffee club, espresso bar, or cold brew tap.
- Print custom QR posters for your coffee station so coworkers can log espresso shots, cold brew cups, or bean contributions in under 2 seconds.
- Automatically track member tabs and prevent unpaid deficits without messy cash jars or clipboard tally sheets.

### 3. Workplace Soda Club & Drink Cooler Tracker
- Keep beverage coolers stocked with soda, sparkling water, kombucha, and energy drinks.
- Members scan or tap to log drinks, preventing shortages and ensuring the team buyer is reimbursed down to the cent.

### 4. Roommate & Shared Apartment Grocery Expense Ledger
- Track communal food staples (milk, eggs, butter, cooking oil, spices, coffee) without spreadsheets.
- Multimodal AI receipt scanning extracts line items from Costco, Trader Joe's, and local supermarkets, attributing fair costs without manual typing.
- Transparent 1-tap peer-to-peer settle up via Venmo, Cash App, or PayPal.

### 5. Coworking Space Honor Bar & Coffee Station
- Run an unattended coffee station, cold brew tap, or honor snack bar.
- Members tap NFC tags or scan item barcodes on shelves to immediately deduct the item cost from their balance.
- Non-custodial ledger design eliminates escrow friction and regulatory overhead.

## Core Features

### 1. Printable QR Fridge Posters & Zero-App Mobile Kiosk
- Generate custom PDF fridge posters with unique QR codes.
- Team members scan with any native smartphone camera to instantly open the mobile web kiosk and log drinks in under 2 seconds—zero App Store download or password required.

### 2. Multimodal Gemini AI Receipt Scanner
- Snap photos of grocery receipts from Costco, Trader Joe's, or local supermarkets.
- Google Gemini AI parses line items, unit prices, volume discounts, and sales taxes down to the penny, updating inventory and crediting the buyer's balance automatically.

### 3. Non-Custodial Real-Time Balance Ledger
- Track exact member balances down to the cent without holding custodial user funds.
- Members settle negative balances via 1-tap peer-to-peer payment links (Venmo, Cash App, PayPal, or cash).

### 4. Contactless NFC Shelf Tag Logging
- Stick contactless NFC tags on drink shelves and snack bins.
- Tap an iPhone or Android phone to instantly log an item in less than two seconds.

### 5. Collaborative Shopping Polls
- Team members propose and upvote snacks, coffee beans, and cold brews before grocery runs.
- Shoppers buy what the team actually wants, avoiding food waste and duplicate purchases.

### 6. Slack Bot Alerts & Friday Balance Digests
- 2-way Slack bot integration for low-stock alerts, restock announcements, and automatic Friday afternoon balance digests.
- CSV spreadsheet ledger exports for company expense reporting and accounting.

## Frequently Asked Questions

### Can team members log drinks without installing an app?
Yes! When someone scans your fridge poster with their phone camera, our mobile web kiosk opens immediately. They tap the item or scan its QR code, and it's logged in less than two seconds. No App Store download or password required.

### How do members settle up when their balance goes negative?
With 1-tap peer-to-peer settle up links. Members can pay back the pantry champion or team buyer via Venmo, Cash App, PayPal, or cash. When the recipient confirms, the communal ledger clears immediately.

### How is PantryPool different from generic expense-splitting apps like Splitwise?
Unlike generic expense apps designed for monthly rent or group trips, PantryPool is built specifically for communal food and workplace breakrooms. It provides physical QR code fridge posters, zero-app mobile grab-and-go kiosks, real-time pantry inventory, multimodal AI grocery receipt scanning with line-item tax calculation, and non-custodial running balance ledgers.

### Do we need specialized hardware or card readers to run an office snack kiosk?
No expensive terminals or card readers required. PantryPool turns any smartphone into a kiosk: print our free custom QR code poster for your fridge door or stick inexpensive NFC tags on snack shelves. Team members scan or tap with their phone camera to log snacks and drinks in under 2 seconds.

### Can I use PantryPool as a coffee club app for our office?
Yes! PantryPool is a dedicated coffee club app and breakroom snack tracker. It is purpose-built for office coffee clubs, espresso machines, bean subscriptions, cold brew kegs, soda clubs, and communal snack clubs. Print a QR code poster for your coffee station or soda fridge, let members tap or scan to log drinks and snacks in under 2 seconds, and automatically balance the fund without cash jars or awkward Slack reminders.

### Is PantryPool really free for small teams and households?
Yes! PantryPool Community Edition is 100% free forever for up to 3 members on our managed cloud. If you prefer to run it yourself on your own infrastructure, our open-source codebase on GitHub supports unlimited members with zero licensing fees.

### Can PantryPool integrate with our company's Slack or Microsoft Teams?
Yes! With Hosted Standard and Hosted Plus tiers on PantryPool SaaS, we offer native 2-way Slack bot integration for low-stock alerts, automatic Friday balance digests, restock polling, and item consumption notifications. Microsoft Teams bot integration is coming soon.

## Subscription Plans
- **Community Edition ($0 / forever)**: Up to 3 members on managed cloud, or unlimited self-hosted via open-source repository. Printable QR fridge posters, QR & NFC logging, 1-tap settle up.
- **Hosted Standard ($5/month or $49/year - Save 20%)**: Up to 5 pools and 50 members. Includes 50 Gemini AI receipt scans/month, Slack channel alerts, and automated daily backups.
- **Hosted Plus ($12/month or $119/year - Save 20%)**: Up to 15 pools and 250 members. Includes 250 Gemini AI receipt scans/month, multi-admin roles, CSV accounting exports, and Friday balance digests.
- **Enterprise (Custom Quote)**: Unlimited pools and members across campuses, corporate SAML 2.0 / SSO (Okta, Entra ID), custom AI receipt scan volume, and invoiced ACH/Net-30 billing.

## Technical Specifications & Developer API
- **Universal Edge Runtime**: Powered by Hono, deployable to Cloudflare Pages (D1 SQLite) and Node.js (MySQL).
- **Markdown for Agents**: All web routes support `Accept: text/markdown` content negotiation with estimated `x-markdown-tokens` headers.
- **SRE Health Check**: `GET /api/health` returns operational health and database latency.
- **Discovery Endpoint**: `GET /llms.txt` provides LLM-ready navigation and context.
