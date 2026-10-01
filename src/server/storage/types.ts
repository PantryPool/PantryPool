export interface StorageUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string | null;
  password_hash?: string | null;
  google_id?: string | null;
  apple_id?: string | null;
  system_role: 'superadmin' | 'admin' | 'user';
  token_version: number;
  venmo_handle?: string | null;
  cashapp_handle?: string | null;
  paypal_handle?: string | null;
  zelle_identifier?: string | null;
  apple_pay_handle?: string | null;
  preferred_payment_method?: string | null;
  is_archived?: boolean | number;
  archived_at?: string | null;
  created_at?: string;
}

export interface StoragePasskeyCredential {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  device_type?: string | null;
  backed_up: boolean | number;
  transports?: string[] | null;
  name?: string | null;
  created_at?: string;
  last_used_at?: string | null;
}

export type OrgTier = 'community' | 'standard' | 'plus' | 'starter' | 'pro' | 'enterprise';

export interface StorageOrganization {
  id: string;
  name: string;
  owner_id: string;
  tier: OrgTier | string;
  invite_code?: string | null;
  role?: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  ai_scan_monthly_quota?: number;
  ai_scan_count_current_period?: number;
  scim_enabled?: boolean;
  is_archived?: boolean | number;
  archived_at?: string | null;
  created_at?: string;
}

export interface StorageOrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | string;
  invited_by?: string | null;
  joined_at?: string;
  user_name?: string;
  user_email?: string;
}

export interface StoragePool {
  id: string;
  organization_id?: string | null;
  name: string;
  category: string;
  currency: string;
  qr_code_key?: string | null;
  description?: string | null;
  kiosk_pin?: string | null;
  champion_id?: string | null;
  initial_reserve_fund_cents?: number;
  max_deficit?: number;
  max_deficit_cents?: number;
  savings_enabled?: boolean | number;
  savings_leaderboard_opt_in?: boolean | number;
  leaderboard_alias?: string | null;
  metro_tier?: 'baseline' | 'standard' | 'high' | string;
  is_archived?: boolean | number;
  archived_at?: string | null;
  created_at?: string;
}

export interface StoragePoolMember {
  id: string;
  pool_id: string;
  user_id: string;
  role: 'champion' | 'admin' | 'member' | 'contributor';
  balance: number;
  balance_cents: number;
  joined_at?: string;
}

export interface StorageItem {
  id: string;
  pool_id: string;
  name: string;
  category: string;
  stock: number;
  min_stock: number;
  cost_per_unit: number;
  cost_per_unit_cents: number;
  vending_benchmark_cents?: number;
  unit_name: string;
  icon: string;
  image_url?: string | null;
  description?: string | null;
  barcode?: string | null;
  last_restocked_at?: string | null;
  updated_at?: string;
  created_at?: string;
}

export interface StorageTransaction {
  id: string;
  pool_id: string;
  user_id: string;
  user_name?: string | null;
  user_avatar?: string | null;
  item_id?: string | null;
  item_name?: string | null;
  type: 'consume' | 'deposit' | 'refund' | 'adjustment';
  amount: number;
  amount_cents: number;
  savings_cents?: number;
  quantity: number;
  description?: string | null;
  created_at?: string;
}

export interface StorageShoppingItem {
  id: string;
  pool_id: string;
  name: string;
  category: string;
  quantity: number;
  estimated_cost: number;
  estimated_cost_cents: number;
  suggested_by: string;
  purchased: boolean;
  reason?: string | null;
  created_at?: string;
}

export interface StoragePoll {
  id: string;
  pool_id: string;
  title: string;
  options_json: string;
  created_by: string;
  status: 'active' | 'closed';
  created_at?: string;
}

export interface StorageNotification {
  id: string;
  user_id: string;
  pool_id?: string | null;
  type: string;
  title: string;
  message: string;
  channel: string;
  is_read?: boolean;
  created_at?: string;
}

export interface StorageNotificationPreferences {
  user_id: string;
  low_stock_email: boolean | number;
  low_stock_sms: boolean | number;
  low_stock_in_app?: boolean | number;
  weekly_digest_email: boolean | number;
  weekly_digest_in_app?: boolean | number;
  deposit_in_app?: boolean | number;
  phone_number?: string | null;
  updated_at?: string;
}

export interface StorageWebhook {
  id: string;
  pool_id: string;
  platform: string;
  webhook_url: string;
  channel_name?: string | null;
  enabled_events: string;
  created_at?: string;
}

export interface StorageSsoConfig {
  id: string;
  organization_id: string;
  domain: string;
  idp_entity_id: string;
  sso_url: string;
  certificate?: string | null;
  protocol: string;
  client_id?: string | null;
  client_secret?: string | null;
  jit_provisioning: boolean;
  enabled: boolean;
  created_at?: string;
}

export interface StorageTelemetryEvent {
  id: string;
  event_name: string;
  category: 'lifecycle' | 'feature' | 'error' | 'funnel' | 'performance';
  session_id?: string | null;
  user_id?: string | null;
  pool_id?: string | null;
  properties_json?: string | null;
  path?: string | null;
  client_timestamp?: string | null;
  created_at?: string;
}

export interface TelemetryStats {
  periodDays: number;
  totalEvents: number;
  topFeatures: { event_name: string; count: number }[];
  errorSummary: { event_name: string; count: number; last_seen: string }[];
  funnelBreakdown: { event_name: string; count: number }[];
  activityByDay: { day: string; count: number }[];
  recentEvents: StorageTelemetryEvent[];
}

export interface StorageAiUsageLog {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  pool_id?: string | null;
  model: string;
  activity: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  status?: string;
  parsed_items_json?: string | null;
  applied_items_json?: string | null;
  created_at?: string;
}

export interface StorageAdapter {
  // Users & Auth
  getUserById(id: string): Promise<StorageUser | null>;
  getUserByEmail(email: string): Promise<StorageUser | null>;
  createUser(user: Partial<StorageUser> & { id: string; email: string; name: string }): Promise<StorageUser>;
  updateUser(id: string, updates: Partial<StorageUser>): Promise<void>;
  listUsers(): Promise<StorageUser[]>;
  countUsers?(): Promise<number>;
  bumpTokenVersion(userId: string): Promise<number>;

  deleteUser?(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void>;
  archiveUser?(id: string): Promise<void>;
  restoreUser?(id: string): Promise<void>;
  listAllUsersForAdmin?(): Promise<any[]>;

  // Password Reset Tokens
  createPasswordResetToken(token: { id: string; user_id: string; token_hash: string; expires_at: string; used?: boolean | number }): Promise<void>;
  getPasswordResetToken(tokenHash: string): Promise<{ id: string; user_id: string; token_hash: string; expires_at: string; used: boolean | number } | null>;
  markPasswordResetTokenUsed(id: string): Promise<void>;

  // Passkey / WebAuthn Credentials
  createPasskeyCredential?(cred: StoragePasskeyCredential): Promise<StoragePasskeyCredential>;
  getPasskeyCredentialById?(id: string): Promise<StoragePasskeyCredential | null>;
  getPasskeyCredentialsByUserId?(userId: string): Promise<StoragePasskeyCredential[]>;
  updatePasskeyCredentialCounter?(id: string, counter: number, lastUsedAt?: string): Promise<void>;
  deletePasskeyCredential?(id: string, userId: string): Promise<boolean>;

  // Organizations
  getOrgById(id: string): Promise<StorageOrganization | null>;
  getOrgByNameAndOwner?(name: string, ownerId: string): Promise<StorageOrganization | null>;
  getOrgByInviteCode?(code: string): Promise<StorageOrganization | null>;
  getOrgByStripeCustomerId?(customerId: string): Promise<StorageOrganization | null>;
  getOrgByStripeSubscriptionId?(subscriptionId: string): Promise<StorageOrganization | null>;
  listOrgsByOwner(ownerId: string): Promise<StorageOrganization[]>;
  listOrgsForUser?(userId: string): Promise<StorageOrganization[]>;
  listAllOrgsForAdmin?(): Promise<any[]>;
  createOrg(org: Partial<StorageOrganization> & { id: string; name: string; owner_id: string }): Promise<StorageOrganization>;
  updateOrgTier(id: string, tier: OrgTier | string): Promise<void>;
  updateOrg?(id: string, updates: Partial<StorageOrganization>): Promise<void>;
  deleteOrg?(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void>;
  archiveOrg?(id: string): Promise<void>;
  restoreOrg?(id: string): Promise<void>;
  addOrgMember?(member: StorageOrganizationMember): Promise<void>;
  getOrgMember?(orgId: string, userId: string): Promise<StorageOrganizationMember | null>;
  listOrgMembers?(orgId: string): Promise<StorageOrganizationMember[]>;
  removeOrgMember?(orgId: string, userId: string): Promise<void>;

  // Pools & Members
  getPoolById(id: string): Promise<StoragePool | null>;
  getPoolByCode?(code: string): Promise<StoragePool | null>;
  getAllPools?(): Promise<StoragePool[]>;
  getPoolsByOrg?(orgId: string): Promise<StoragePool[]>;
  listPoolsForUser(userId: string): Promise<StoragePool[]>;
  listAllPoolsForAdmin?(): Promise<any[]>;
  createPool(pool: Partial<StoragePool> & { id: string; name: string }): Promise<StoragePool>;
  updatePool(id: string, updates: Partial<StoragePool>): Promise<void>;
  deletePool(id: string, options?: { hardDelete?: boolean; gdpr?: boolean } | boolean): Promise<void>;
  archivePool?(id: string): Promise<void>;
  restorePool?(id: string): Promise<void>;
  getPoolMember(poolId: string, userId: string): Promise<StoragePoolMember | null>;
  listPoolMembers(poolId: string): Promise<StoragePoolMember[]>;
  upsertPoolMember(member: Partial<StoragePoolMember> & { id: string; pool_id: string; user_id: string }): Promise<void>;
  updateMemberRole(poolId: string, userId: string, role: string): Promise<void>;
  removePoolMember(poolId: string, userId: string): Promise<void>;
  countPoolsByOrg(orgId: string): Promise<number>;
  countPersonalPools(userId: string): Promise<number>;
  adjustMemberBalance(poolId: string, userId: string, deltaAmount: number, deltaCents: number): Promise<void>;
  reassignUserResources?(sourceUserId: string, targetUserId: string): Promise<void>;

  // Items
  getItemById(id: string): Promise<StorageItem | null>;
  listItemsByPool(poolId: string): Promise<StorageItem[]>;
  searchItems?(query: string, poolId?: string, limit?: number): Promise<StorageItem[]>;
  saveItem(item: Partial<StorageItem> & { id: string; pool_id: string; name: string }): Promise<StorageItem>;
  deleteItem(id: string): Promise<void>;
  adjustItemStock(id: string, deltaQty: number): Promise<void>;

  // Transactions
  getTransactionById(id: string): Promise<StorageTransaction | null>;
  listTransactionsByPool(poolId: string, limit?: number): Promise<StorageTransaction[]>;
  createTransaction(tx: StorageTransaction): Promise<StorageTransaction>;

  // Shopping List
  listShoppingItems(poolId: string): Promise<StorageShoppingItem[]>;
  createShoppingItem(item: StorageShoppingItem): Promise<StorageShoppingItem>;
  updateShoppingItemStatus(id: string, poolId: string, purchased: boolean): Promise<void>;
  deleteShoppingItem(id: string, poolId: string): Promise<void>;

  // Polls
  listPolls(poolId: string): Promise<StoragePoll[]>;
  getPollById?(id: string, poolId?: string): Promise<StoragePoll | null>;
  createPoll(poll: StoragePoll): Promise<StoragePoll>;
  updatePoll(id: string, poolId: string, updates: Partial<StoragePoll>): Promise<void>;
  deletePoll(id: string, poolId: string): Promise<void>;

  // Notifications
  listNotifications(userId: string, limit?: number): Promise<StorageNotification[]>;
  createNotification(notif: StorageNotification): Promise<StorageNotification>;
  markNotificationsRead(userId: string, notifId?: string): Promise<void>;
  deleteNotification?(id: string, userId?: string): Promise<void>;
  getNotificationPreferences?(userId: string): Promise<StorageNotificationPreferences | any | null>;
  saveNotificationPreferences?(userId: string, prefs: Partial<StorageNotificationPreferences>): Promise<StorageNotificationPreferences | any>;

  // Webhooks
  listWebhooks(poolId: string): Promise<StorageWebhook[]>;
  saveWebhook(webhook: StorageWebhook): Promise<StorageWebhook>;
  deleteWebhook(id: string, poolId?: string): Promise<void>;

  // SSO
  getSsoConfigByDomain(domain: string): Promise<StorageSsoConfig | null>;
  getSsoConfigByOrg(orgId: string): Promise<StorageSsoConfig | null>;
  getSsoConfigCount?(): Promise<number>;
  saveSsoConfig(config: StorageSsoConfig): Promise<StorageSsoConfig>;

  // System Settings & Admin
  getSystemSettings(): Promise<Record<string, any>>;
  saveSystemSettings(settings: Record<string, any>): Promise<void>;
  getPlatformStats(): Promise<{ totalUsers: number; totalPools: number; totalTransactions: number; totalVolume: number }>;

  // AI Usage Telemetry
  getAiUsageStats?(envModel?: string): Promise<{ summary: any; modelBreakdown: any[]; recentLogs: any[] }>;
  logAiUsage?(log: StorageAiUsageLog): Promise<void>;
  logAiAppliedItems?(scanLogId: string, appliedJson: string): Promise<void>;

  // Telemetry & Operational Analytics
  recordTelemetryEvents(events: StorageTelemetryEvent[]): Promise<void>;
  getTelemetryStats(days?: number): Promise<TelemetryStats>;

  // Vending Savings & Community Leaderboard
  getPoolSavingsSummary?(poolId: string): Promise<StoragePoolSavingsSummary>;
  getGlobalSavingsLeaderboard?(limit?: number): Promise<StorageGlobalSavingsLeaderboardResponse>;

  // Affiliate Products & Click Tracking (Amazon Associates)
  listAffiliateProducts?(onlyActive?: boolean): Promise<StorageAffiliateProduct[]>;
  getAffiliateProductById?(id: string): Promise<StorageAffiliateProduct | null>;
  createAffiliateProduct?(product: Partial<StorageAffiliateProduct> & { id: string; title: string; affiliate_url: string }): Promise<StorageAffiliateProduct>;
  updateAffiliateProduct?(id: string, updates: Partial<StorageAffiliateProduct>): Promise<StorageAffiliateProduct | null>;
  deleteAffiliateProduct?(id: string): Promise<void>;
  recordAffiliateClick?(click: StorageAffiliateClick): Promise<void>;
  getAffiliateStats?(): Promise<StorageAffiliateStats>;
  saveAffiliateImage?(image: StorageAffiliateImage): Promise<void>;
  getAffiliateImage?(id: string): Promise<StorageAffiliateImage | null>;
  deleteAffiliateImage?(id: string): Promise<void>;

  // User Profile Avatars
  saveUserAvatar?(avatar: StorageUserAvatar): Promise<void>;
  getUserAvatar?(id: string): Promise<StorageUserAvatar | null>;
  deleteUserAvatar?(id: string): Promise<void>;

  // Email Delivery Logs
  createEmailLog?(log: StorageEmailLog): Promise<StorageEmailLog>;
  listEmailLogs?(options?: { recipientEmail?: string; userId?: string; emailType?: string; limit?: number; offset?: number }): Promise<{ logs: StorageEmailLog[]; total: number }>;
  getEmailLogById?(id: string): Promise<StorageEmailLog | null>;
}

export interface StorageEmailLog {
  id: string;
  user_id?: string | null;
  recipient_email: string;
  email_type: string;
  subject: string;
  status: 'sent' | 'simulated' | 'failed' | string;
  message_id?: string | null;
  error_message?: string | null;
  metadata_json?: string | null;
  created_at?: string;
}

export interface StoragePoolSavingsSummary {
  totalSavingsCents: number;
  totalSavings: number;
  itemsConsumedCount: number;
  topSavedItems: { itemId: string; itemName: string; totalSavingsCents: number; quantity: number }[];
}

export interface StorageGlobalSavingsLeaderboardEntry {
  rank?: number;
  poolId: string;
  displayName: string;
  category: string;
  totalSavingsCents: number;
  totalSavings: number;
  memberCount: number;
}

export interface StorageGlobalSavingsLeaderboardResponse {
  pools: StorageGlobalSavingsLeaderboardEntry[];
  networkTotalSavingsCents: number;
  networkTotalSavings: number;
}

export interface StorageAffiliateProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  image_url?: string | null;
  affiliate_url: string;
  badge?: string | null;
  price_estimate?: number;
  click_count?: number;
  display_order?: number;
  is_active?: boolean | number;
  created_at?: string;
  updated_at?: string;
}

export interface StorageAffiliateClick {
  id: string;
  product_id: string;
  user_id?: string | null;
  source: string;
  referrer?: string | null;
  user_agent?: string | null;
  created_at?: string;
}

export interface StorageAffiliateStats {
  totalProducts: number;
  activeProducts: number;
  totalClicks: number;
  clicksBySource: { source: string; count: number }[];
  topProducts: { id: string; title: string; clickCount: number }[];
}

export interface StorageAffiliateImage {
  id: string;
  mime_type: string;
  data: string;
  created_at?: string;
}

export interface StorageUserAvatar {
  id: string;
  user_id: string;
  mime_type: string;
  data: string; // base64
  created_at?: string;
}


