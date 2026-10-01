/**
 * Agentic Resource Discovery (ARD) Manifest Definition
 * Spec: https://github.com/ards-project/ard-spec
 * Conforms to ai-catalog.schema.json & ard-entry.schema.json
 */

export const AI_CATALOG_MANIFEST = {
  specVersion: '1.0',
  host: {
    displayName: 'PantryPool',
    identifier: 'did:web:pantrypool.com',
    documentationUrl: 'https://pantrypool.com/index.md',
    logoUrl: 'https://pantrypool.com/logo.png',
  },
  entries: [
    {
      identifier: 'urn:air:pantrypool.com:inventory:pantry-ledger',
      displayName: 'PantryPool Communal Pantry & Food Ledger',
      type: 'application/json',
      url: 'https://pantrypool.com/index.md',
      description: 'Smart ledger for office snack clubs, coffee clubs, soda funds, breakrooms, and communal pantries with printable QR fridge posters, non-custodial balance tracking, and automated restock alerts.',
      tags: ['pantry', 'inventory', 'breakroom', 'food-ledger', 'snack-club', 'coffee-club', 'soda-club', 'qr-code', 'micro-market'],
      capabilities: ['PantryInventory', 'BalanceLedger', 'ShoppingPolls', 'FridgePosterKiosk'],
      representativeQueries: [
        'smart office snack club app',
        'coffee club app for office breakroom',
        'office soda club honor system ledger',
        'track shared office pantry snacks and drinks',
        'manage breakroom food fund and unpaid tabs',
      ],
      version: '1.0.0',
      updatedAt: '2026-09-26T02:00:00Z',
    },
    {
      identifier: 'urn:air:pantrypool.com:receipt:scanner',
      displayName: 'PantryPool AI Receipt Scanner',
      type: 'application/json',
      url: 'https://pantrypool.com/index.md',
      description: 'Multimodal AI grocery receipt scanner that itemizes line items, prices, volume discounts, and taxes down to the penny to credit buyer balances automatically.',
      tags: ['receipt-scanner', 'multimodal-ai', 'gemini', 'expense-splitting', 'grocery-tax'],
      capabilities: ['ReceiptScanning', 'TaxSplitting', 'ItemMatching'],
      representativeQueries: [
        'scan grocery receipt to split communal food expenses',
        'parse Costco or Trader Joes receipt items and taxes',
        'extract line items and prices from receipt photo',
        'split grocery receipt line items and sales tax fairly',
      ],
      version: '1.0.0',
      updatedAt: '2026-09-26T01:45:00Z',
    },
  ],
};
