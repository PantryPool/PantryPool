export type UserRole = 'champion' | 'contributor' | 'admin' | 'member';

export type ItemCategory = 
  | 'Beverages' 
  | 'Snacks' 
  | 'Coffee & Tea' 
  | 'Pantry & Fresh' 
  | 'Household';

export type TransactionType = 'consumption' | 'contribution' | 'refund' | 'restock' | 'adjustment';

export type DiscrepancyReason = 
  | 'forgot_to_log' 
  | 'visitor_take' 
  | 'damaged_expired' 
  | 'audit_recount' 
  | 'other';

export type PaymentProvider = 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'applepay';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  balance: number; // Positive = credit in pool, Negative = owes pool money
  balanceCents?: number; // Exact integer cents
  joinedAt: string;
  venmoHandle?: string;
  cashappHandle?: string;
  paypalHandle?: string;
  zelleIdentifier?: string;
  applePayHandle?: string;
  preferredPaymentMethod?: PaymentProvider;
}

export interface Item {
  id: string;
  poolId: string;
  name: string;
  category: ItemCategory;
  costPerUnit: number;
  costPerUnitCents?: number; // Exact integer cents
  vendingBenchmarkCents?: number; // Breakroom vending machine benchmark price in cents
  stock: number;
  minStock: number;
  unitName: string; // e.g. "can", "pod", "bar", "pack", "bottle"
  icon: string; // Lucide icon name or emoji
  imageUrl?: string;
  description?: string;
  lastRestockedAt?: string;
  barcode?: string;
}

export interface Transaction {
  id: string;
  poolId: string;
  userId: string;
  type: TransactionType;
  amount: number; // Monetary value (positive for contribution, negative for consumption cost)
  amountCents?: number; // Exact integer cents
  savingsCents?: number; // Exact integer cents saved vs vending benchmark
  itemId?: string;
  itemName?: string;
  quantity?: number;
  timestamp: string;
  note?: string;
  createdByName: string;
  createdByAvatar?: string;
  userAvatar?: string;
  resultingBalance: number; // Snapshot of user balance after transaction
}

export interface Pool {
  id: string;
  organizationId?: string;
  name: string;
  description: string;
  code: string; // 6-digit invite code
  currency: string; // e.g., "$", "€", "£"
  championId: string;
  members: User[];
  createdAt: string;
  category: 'Office' | 'Home / Apartment' | 'Club / Group' | 'Co-Working';
  initialReserveFund?: number;
  kioskPin?: string;
  maxDeficit?: number; // Spending ceiling / max debt (e.g. 10.00 blocks takes at -$10.00)
  maxDeficitCents?: number; // Integer cents equivalent (e.g. 1000)
  savingsEnabled?: boolean;
  savingsLeaderboardOptIn?: boolean;
  leaderboardAlias?: string;
  metroTier?: 'baseline' | 'standard' | 'high' | string;
}

export interface PoolSavingsSummary {
  totalSavingsCents: number;
  totalSavings: number;
  itemsConsumedCount: number;
  topSavedItems: { itemId: string; itemName: string; totalSavingsCents: number; quantity: number }[];
}

export interface GlobalSavingsLeaderboardEntry {
  poolId: string;
  displayName: string;
  category: string;
  totalSavingsCents: number;
  totalSavings: number;
  memberCount: number;
}

export interface ShoppingListItem {
  id: string;
  poolId: string;
  itemName: string;
  category: ItemCategory;
  suggestedBy: string;
  estimatedCost: number;
  estimatedCostCents?: number; // Exact integer cents
  quantity: number;
  purchased: boolean;
  reason?: string;
  createdAt: string;
}

export interface PollOption {
  id: string;
  name: string;
  votes: string[]; // array of user IDs
  isWriteIn?: boolean;
}

export interface PollItem {
  id: string;
  poolId: string;
  title: string;
  description?: string;
  options: PollOption[];
  status: 'active' | 'closed';
  createdBy: string;
  createdAt: string;
  allowWriteIn?: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  poolId?: string;
  itemId?: string;
  type: 'low_stock' | 'weekly_digest' | 'system' | 'balance_alert';
  title: string;
  message: string;
  channel: 'in_app' | 'email' | 'sms';
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPreferences {
  userId: string;
  lowStockEmail: boolean;
  lowStockSms: boolean;
  weeklyDigestEmail: boolean;
  phoneNumber?: string;
}

export interface WebhookConfig {
  id: string;
  poolId: string;
  platform: 'slack' | 'teams';
  webhookUrl: string;
  channelName?: string;
  enabledEvents: string; // e.g. "low_stock,restock"
  createdAt?: string;
}

export interface SsoConfig {
  id: string;
  organizationId: string;
  domain: string; // e.g. "acme.com"
  idpEntityId?: string;
  ssoUrl: string;
  certificate?: string;
  protocol: 'saml2' | 'oidc';
  clientId?: string;
  clientSecret?: string;
  jitProvisioning: boolean;
  enabled: boolean;
  createdAt?: string;
}
export interface AffiliateProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  imageUrl?: string | null;
  affiliateUrl: string;
  badge?: string | null;
  priceEstimate?: number;
  clickCount: number;
  displayOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AffiliateClick {
  id: string;
  productId: string;
  userId?: string | null;
  source: string; // 'marketing' | 'workspace' | 'admin'
  referrer?: string | null;
  userAgent?: string | null;
  createdAt?: string;
}

export interface AffiliateStats {
  totalProducts: number;
  activeProducts: number;
  totalClicks: number;
  clicksBySource: { source: string; count: number }[];
  topProducts: { id: string; title: string; clickCount: number }[];
}
