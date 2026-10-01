import { enqueueOfflineAction } from './offlineQueue';
import { recordApiTiming } from './performance';

export interface ApiOrganization {
  id: string;
  name: string;
  ownerId: string;
  inviteCode?: string;
  role?: string;
  tier?: 'community' | 'standard' | 'plus' | 'starter' | 'pro' | 'enterprise' | string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  poolsCount?: number;
  createdAt?: string;
}

export interface ApiPool {
  id: string;
  organizationId?: string;
  name: string;
  category: string;
  currency: string;
  description?: string;
  kioskPin?: string;
  code?: string;
  qrCodeKey?: string;
  championId?: string;
  members: {
    id: string;
    name: string;
    avatarUrl?: string;
    role: string;
    balance: number;
  }[];
}

export interface ApiItem {
  id: string;
  poolId?: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  costPerUnit: number;
  costPerUnitCents?: number;
  unitName?: string;
  unit_name?: string;
  unit?: string;
  icon?: string;
  imageUrl?: string;
  description?: string;
  barcode?: string;
  lastRestockedAt?: string;
  vendingBenchmarkCents?: number;
  vending_benchmark_cents?: number;
}

export interface ApiTransaction {
  id: string;
  userId: string;
  userName?: string;
  userAvatar?: string;
  itemId?: string;
  itemName?: string;
  type: 'deposit' | 'consume';
  amount: number;
  quantity?: number;
  description?: string;
  timestamp: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  systemRole?: 'superadmin' | 'admin' | 'user';
  hasPassword?: boolean;
  hasGoogle?: boolean;
  hasApple?: boolean;
  hasPasskey?: boolean;
  venmoHandle?: string;
  cashappHandle?: string;
  paypalHandle?: string;
  zelleIdentifier?: string;
  applePayHandle?: string;
  preferredPaymentMethod?: 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'applepay';
}

export async function updateUserProfileApi(updates: {
  userId?: string;
  name?: string;
  avatarUrl?: string;
  venmoHandle?: string;
  cashappHandle?: string;
  paypalHandle?: string;
  zelleIdentifier?: string;
  applePayHandle?: string;
  preferredPaymentMethod?: 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'applepay';
}) {
  try {
    const res = await apiFetch('/api/users/profile', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export function getAuthToken(): string | null {
  return localStorage.getItem('pantrypool_token') || localStorage.getItem('pantrypool_auth_token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('pantrypool_token', token);
  localStorage.setItem('pantrypool_auth_token', token);
}

export function removeAuthToken() {
  localStorage.removeItem('pantrypool_token');
  localStorage.removeItem('pantrypool_auth_token');
  localStorage.removeItem('stokd_token');
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Executes a single-flight token refresh call to /api/auth/refresh.
 *
 * Auth / Revocation behavior:
 * - On HTTP 401/403 (e.g. invalid signature, revoked token_version, expired refresh window):
 *   Removes stored token and returns false so caller forces re-authentication.
 * - On network/transport errors (e.g. offline drop, connection timeout):
 *   Retains the stored token to avoid premature logout during transient disconnections or offline queues,
 *   returning false so callers can gracefully handle retries.
 */
async function executeTokenRefresh(): Promise<boolean> {
  const currentToken = getAuthToken();
  if (!currentToken) return false;
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      }
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        removeAuthToken();
      }
      return false;
    }
    const data = await res.json();
    if (data && data.success && data.token) {
      setAuthToken(data.token);
      return true;
    }
    if (data && data.success === false) {
      removeAuthToken();
    }
    return false;
  } catch (e) {
    // Retain token on network disconnects so offline queue is not wiped prematurely
    return false;
  }
}

export async function apiFetch(url: string, options: RequestInit = {}, isRetry = false): Promise<Response> {
  const isUserSensitive = url.startsWith('/api/pools') || url.startsWith('/api/items') || url.startsWith('/api/auth/me') || url.startsWith('/api/organizations') || url.startsWith('/api/users/profile');
  const fetchOptions: RequestInit = {
    ...options,
    cache: options.cache || (isUserSensitive ? 'no-store' : undefined),
  };
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err: any) {
    const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    recordApiTiming({
      url,
      method: options.method || 'GET',
      durationMs: elapsed,
      status: 0,
      success: false,
    });
    throw err;
  }

  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
  let serverTiming: string | undefined;
  try {
    serverTiming = res.headers?.get('server-timing') || undefined;
  } catch {}

  recordApiTiming({
    url,
    method: options.method || 'GET',
    durationMs: elapsed,
    status: res.status,
    success: res.ok,
    serverTiming,
  });

  // Automatic 401 Interceptor: If an authenticated request returns 401, attempt silent refresh once and retry
  if (
    res.status === 401 &&
    !isRetry &&
    !url.startsWith('/api/auth/login') &&
    !url.startsWith('/api/auth/register') &&
    !url.startsWith('/api/auth/refresh')
  ) {
    if (!refreshPromise) {
      refreshPromise = executeTokenRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    const refreshed = await refreshPromise;
    if (refreshed) {
      const newToken = getAuthToken();
      const updatedHeaders: Record<string, string> = {
        ...((options.headers as Record<string, string>) || {}),
        ...(newToken ? { 'Authorization': `Bearer ${newToken}` } : {})
      };
      return await apiFetch(url, { ...options, headers: updatedHeaders }, true);
    }
  }

  return res;
}

async function safeJsonFetch(url: string, options: RequestInit): Promise<any> {
  try {
    const res = await apiFetch(url, options);
    let contentType = 'application/json';
    try {
      if (res && res.headers && typeof res.headers.get === 'function') {
        contentType = res.headers.get('content-type') || 'application/json';
      }
    } catch (e) {}

    if (contentType && !contentType.includes('application/json')) {
      const text = await res.text();
      const isHtml = text.includes('<!doctype') || text.includes('<html') || res.status === 404;
      return {
        success: false,
        error: isHtml
          ? 'Backend API server is currently unreachable. Please try again shortly.'
          : `Server returned unexpected response (HTTP ${res.status}).`
      };
    }
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network request failed.' };
  }
}

/**
 * Standardized Unified API Request Wrapper (Sprint 3 / N15)
 * Returns a uniform ApiResponse<T> envelope with typed data, error strings, and HTTP status codes.
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  statusCode: number;
}

export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {})
  };

  try {
    const res = await apiFetch(url, { ...options, headers });
    let data: any;
    const contentType = res.headers?.get ? res.headers.get('content-type') || '' : '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return {
      success: res.ok && (typeof data === 'object' && data !== null ? data.success !== false : true),
      data: typeof data === 'object' && data !== null && 'data' in data ? data.data : data,
      error: typeof data === 'object' && data !== null ? data.error : (res.ok ? undefined : String(data)),
      code: typeof data === 'object' && data !== null ? data.code : undefined,
      statusCode: res.status
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network request failed.',
      statusCode: 0
    };
  }
}

export async function registerUserApi(email: string, password: string, name: string) {
  const data = await safeJsonFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function loginUserApi(email: string, password: string) {
  const data = await safeJsonFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function forgotPasswordApi(email: string) {
  return await safeJsonFetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function resetPasswordApi(token: string, newPassword: string) {
  return await safeJsonFetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function googleLoginApi(googleProfile: { credential?: string; accessToken?: string; googleId?: string; email?: string; name?: string; avatarUrl?: string }) {
  const data = await safeJsonFetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(googleProfile),
  });
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function appleLoginApi(appleProfile: { identityToken?: string; appleSub?: string; email?: string; name?: string }) {
  const data = await safeJsonFetch('/api/auth/apple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(appleProfile),
  });
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function getPasskeyRegistrationOptionsApi() {
  return await safeJsonFetch('/api/auth/passkey/register-options', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function verifyPasskeyRegistrationApi(body: { response: any; challengeToken: string; name?: string }) {
  return await safeJsonFetch('/api/auth/passkey/register-verify', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
}

export async function getPasskeyAuthOptionsApi(email?: string) {
  return await safeJsonFetch('/api/auth/passkey/auth-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function verifyPasskeyAuthApi(body: { response: any; challengeToken: string }) {
  const data = await safeJsonFetch('/api/auth/passkey/auth-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function listPasskeysApi() {
  return await safeJsonFetch('/api/auth/passkey/list', {
    method: 'GET',
    headers: authHeaders(),
  });
}

export async function deletePasskeyApi(id: string) {
  return await safeJsonFetch(`/api/auth/passkey/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function refreshAuthTokenApi(): Promise<{ success: boolean; token?: string; user?: AuthUser; error?: string }> {
  const token = getAuthToken();
  if (!token) return { success: false, error: 'No active session token.' };

  const data = await safeJsonFetch('/api/auth/refresh', {
    method: 'POST',
    headers: authHeaders(),
  });
  if (data.success && data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function fetchCurrentUserApi(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const res = await apiFetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.user) {
      return data.user;
    }
  } catch (e) {
    console.warn('[API] Auth profile fetch failed:', e);
  }
  return null;
}

export interface OnboardWorkspaceParams {
  orgName: string;
  poolName?: string;
  category?: string;
  currency?: string;
  tier?: 'community' | 'standard' | 'plus' | 'starter' | 'pro' | 'enterprise' | string;
  starterItems?: boolean;
}

export async function onboardWorkspaceApi(params: OnboardWorkspaceParams): Promise<{ success: boolean; organization?: ApiOrganization; pool?: any; error?: string }> {
  try {
    const res = await apiFetch('/api/organizations/onboard', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createOrganizationApi(name: string, ownerId: string, tier: 'community' | 'standard' | 'plus' | 'starter' | 'pro' | 'enterprise' | string = 'community') {
  try {
    const res = await apiFetch('/api/organizations', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, ownerId, tier }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export const isOrganizationsEnabled = import.meta.env.VITE_ENABLE_ORGANIZATIONS === 'true';

export async function fetchOrganizationsApi(userId?: string): Promise<ApiOrganization[]> {
  if (!isOrganizationsEnabled) {
    return [];
  }
  // Prevent unauthenticated visitor requests without a token or userId from triggering 401 errors
  if (!userId && !getAuthToken()) {
    return [];
  }
  try {
    const url = userId ? `/api/organizations?userId=${encodeURIComponent(userId)}` : '/api/organizations';
    const res = await apiFetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (data.success && Array.isArray(data.organizations)) {
      return data.organizations;
    }
  } catch (e) {
    console.warn('[API] Fetch organizations failed:', e);
  }
  return [];
}

export async function deleteOrganizationApi(organizationId: string, options?: { hardDelete?: boolean; gdpr?: boolean }) {
  try {
    const isGdpr = Boolean(options?.hardDelete || options?.gdpr);
    const query = isGdpr ? '?gdpr=true' : '';
    const res = await apiFetch(`/api/organizations/${encodeURIComponent(organizationId)}${query}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Failed to delete organization:', e);
    return { success: false, error: String(e) };
  }
}

export async function restoreOrgAdminApi(organizationId: string) {
  try {
    const res = await apiFetch(`/api/admin/organizations/${encodeURIComponent(organizationId)}/restore`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function joinOrganizationApi(inviteCode: string): Promise<{ success: boolean; organization?: ApiOrganization; pools?: ApiPool[]; error?: string }> {
  try {
    const res = await apiFetch('/api/organizations/join', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ inviteCode }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function fetchOrgMembersApi(orgId: string): Promise<{
  success: boolean;
  members?: Array<{ id: string; organizationId: string; userId: string; role: string; joinedAt: string; email?: string; name?: string; avatarUrl?: string }>;
  error?: string;
}> {
  try {
    const res = await apiFetch(`/api/organizations/${encodeURIComponent(orgId)}/members`, {
      method: 'GET',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function removeOrgMemberApi(orgId: string, memberUserId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiFetch(`/api/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberUserId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createPoolInOrgApi(organizationId: string, name: string, category: string, currency: string = '$', userId?: string) {
  try {
    const res = await apiFetch('/api/pools', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ organizationId, name, category, currency, userId }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function fetchPools(organizationId?: string): Promise<ApiPool[]> {
  try {
    const url = organizationId ? `/api/pools?orgId=${encodeURIComponent(organizationId)}` : '/api/pools';
    const res = await apiFetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (data.success && Array.isArray(data.pools)) {
      return data.pools;
    }
    if (!data.success) {
      console.warn('[API] /api/pools returned unsuccessful payload:', data.error || data);
    }
    return [];
  } catch (e) {
    console.warn('[API] Failed to fetch pools from backend:', e);
    throw e;
  }
}

export async function createPoolApi(
  name: string,
  category: string,
  currency: string = '$',
  organizationId?: string | null,
  description?: string,
  userId?: string,
  maxDeficit?: number,
  savingsEnabled: boolean = true
) {
  try {
    const res = await apiFetch('/api/pools', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name,
        category,
        currency,
        organizationId: organizationId || null,
        description,
        userId,
        maxDeficit,
        savingsEnabled,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Create pool failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function updatePoolApi(
  poolId: string,
  data: {
    name?: string;
    category?: string;
    currency?: string;
    description?: string;
    kioskPin?: string;
    code?: string;
    qrCodeKey?: string;
    maxDeficit?: number;
    savingsEnabled?: boolean;
    savingsLeaderboardOptIn?: boolean;
    leaderboardAlias?: string;
    metroTier?: string;
  }
) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function fetchPoolSavingsSummary(poolId: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/savings`, {
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function fetchGlobalSavingsLeaderboard(limit = 25) {
  try {
    const res = await apiFetch(`/api/leaderboard/savings?limit=${encodeURIComponent(limit)}`, {
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deletePoolApi(poolId: string, options?: { hardDelete?: boolean; gdpr?: boolean }) {
  try {
    const isGdpr = Boolean(options?.hardDelete || options?.gdpr);
    const query = isGdpr ? '?gdpr=true' : '';
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}${query}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function restorePoolAdminApi(poolId: string) {
  try {
    const res = await apiFetch(`/api/admin/pools/${encodeURIComponent(poolId)}/restore`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteUserAdminApi(userId: string, options?: { hardDelete?: boolean; gdpr?: boolean }) {
  try {
    const isGdpr = Boolean(options?.hardDelete || options?.gdpr);
    const query = isGdpr ? '?gdpr=true' : '';
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}${query}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function restoreUserAdminApi(userId: string) {
  try {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/restore`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteAccountApi(options?: { hardDelete?: boolean; gdpr?: boolean }) {
  try {
    const isGdpr = Boolean(options?.hardDelete || options?.gdpr);
    const query = isGdpr ? '?gdpr=true' : '';
    const res = await apiFetch(`/api/auth/account${query}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function joinPoolApi(code: string) {
  try {
    const res = await apiFetch('/api/pools/join', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ code }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function nudgeMemberApi(poolId: string, targetUserId: string, message?: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/nudge`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ targetUserId, message }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function verifyKioskPinApi(poolId: string, pin: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/verify-kiosk-pin`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ pin }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// -------------------------------------------------------------
// SHOPPING LIST API
// -------------------------------------------------------------
export async function fetchShoppingListApi(poolId: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/shopping-list`, { headers: authHeaders() });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function addShoppingItemApi(poolId: string, item: { itemName: string; category?: string; quantity?: number; estimatedCost?: number; reason?: string }) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/shopping-list`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(item),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateShoppingItemApi(poolId: string, itemId: string, data: { purchased: boolean }) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/shopping-list/${encodeURIComponent(itemId)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteShoppingItemApi(poolId: string, itemId: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/shopping-list/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// -------------------------------------------------------------
// POLLS & VOTING API
// -------------------------------------------------------------
export async function fetchPollsApi(poolId: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/polls`, { headers: authHeaders() });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createPollApi(poolId: string, title: string, options: string[], allowWriteIn = true) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/polls`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ title, options, allowWriteIn }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function votePollApi(poolId: string, pollId: string, optionId?: string, writeInOption?: string, userId?: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/polls/${encodeURIComponent(pollId)}/vote`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ optionId, writeInOption, userId }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updatePollApi(poolId: string, pollId: string, updates: { title?: string; status?: 'active' | 'closed'; options?: any[] }) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/polls/${encodeURIComponent(pollId)}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deletePollApi(poolId: string, pollId: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/polls/${encodeURIComponent(pollId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function linkAuthProviderApi(provider: 'google' | 'apple' | 'password', payload: { providerId?: string; credential?: string; identityToken?: string; password?: string }) {
  try {
    const res = await apiFetch('/api/users/link-provider', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ provider, ...payload }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function fetchItems(poolId: string): Promise<ApiItem[]> {
  try {
    const res = await apiFetch(`/api/items?poolId=${encodeURIComponent(poolId)}`, { headers: authHeaders() });
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data?.success && Array.isArray(data.items) ? data.items : null);
    if (list) {
      return list.map((i: any) => {
        const item = { ...i };
        if (item.unit_name && !item.unitName) item.unitName = item.unit_name;
        if (item.pool_id && !item.poolId) item.poolId = item.pool_id;
        if (item.vending_benchmark_cents !== undefined && item.vendingBenchmarkCents === undefined) {
          item.vendingBenchmarkCents = item.vending_benchmark_cents;
        }
        return item;
      });
    }
    return [];
  } catch (e) {
    console.warn('[API] Failed to fetch items from backend:', e);
    throw e;
  }
}

export async function saveItemApi(itemData: Partial<ApiItem> & { poolId: string }) {
  try {
    const res = await apiFetch('/api/items', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(itemData),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Save item failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function deleteItemApi(itemId: string) {
  try {
    const res = await apiFetch(`/api/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Delete item failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function reportDiscrepancyApi(data: {
  poolId: string;
  itemId: string;
  actualStock: number;
  reason: string;
  notes?: string;
  userId?: string;
}) {
  try {
    const res = await apiFetch('/api/items/discrepancy', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Report discrepancy failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function fetchTransactions(poolId: string): Promise<ApiTransaction[]> {
  try {
    const res = await apiFetch(`/api/transactions?poolId=${encodeURIComponent(poolId)}`, { headers: authHeaders() });
    const data = await res.json();
    if (Array.isArray(data)) {
      return data;
    }
    if (data.success && Array.isArray(data.transactions)) {
      return data.transactions;
    }
    return [];
  } catch (e) {
    console.warn('[API] Failed to fetch transactions from backend:', e);
    throw e;
  }
}

export async function consumeItemApi(poolId: string, itemId: string, userId: string, quantity: number = 1) {
  const transactionId = 'tx_' + crypto.randomUUID();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineAction('consume_item', { poolId, itemId, userId, quantity, transactionId });
    return { success: true, transactionId, queuedOffline: true };
  }

  try {
    const res = await apiFetch('/api/items/consume', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ poolId, itemId, userId, quantity, transactionId }),
    });
    if (!res.ok && (res.status >= 500 || res.status === 408)) {
      enqueueOfflineAction('consume_item', { poolId, itemId, userId, quantity, transactionId });
      return { success: true, transactionId, queuedOffline: true };
    }
    return await res.json();
  } catch (e) {
    console.warn('[API] Consume item failed, enqueuing offline:', e);
    enqueueOfflineAction('consume_item', { poolId, itemId, userId, quantity, transactionId });
    return { success: true, transactionId, queuedOffline: true };
  }
}

export async function addDepositApi(poolId: string, userId: string, amount: number, description?: string) {
  const transactionId = 'tx_' + crypto.randomUUID();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineAction('deposit_transaction', { poolId, userId, amount, description, transactionId });
    return { success: true, transactionId, queuedOffline: true };
  }

  try {
    const res = await apiFetch('/api/transactions/deposit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ poolId, userId, amount, description, transactionId }),
    });
    if (!res.ok && (res.status >= 500 || res.status === 408)) {
      enqueueOfflineAction('deposit_transaction', { poolId, userId, amount, description, transactionId });
      return { success: true, transactionId, queuedOffline: true };
    }
    return await res.json();
  } catch (e) {
    console.warn('[API] Add deposit failed, enqueuing offline:', e);
    enqueueOfflineAction('deposit_transaction', { poolId, userId, amount, description, transactionId });
    return { success: true, transactionId, queuedOffline: true };
  }
}

export async function addPoolMemberApi(poolId: string, userId: string, role: string = 'member') {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/members`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, role }),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Add pool member failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function updateMemberRoleApi(poolId: string, userId: string, role: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/members/${encodeURIComponent(userId)}/role`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ role }),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Update member role failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function removeMemberApi(poolId: string, userId: string) {
  try {
    const res = await apiFetch(`/api/pools/${encodeURIComponent(poolId)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Remove pool member failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function refundTransactionApi(transactionId: string) {
  try {
    const res = await apiFetch(`/api/transactions/${encodeURIComponent(transactionId)}/refund`, {
      method: 'POST',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    console.error('[API] Refund transaction failed:', e);
    return { success: false, error: String(e) };
  }
}

export async function fetchPublicSettingsApi(): Promise<{
  appleLoginEnabled: boolean;
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  kioskModeEnabled?: boolean;
  systemNotice: string;
}> {
  try {
    const res = await apiFetch('/api/admin/public-settings');
    const data = await res.json();
    if (data.success && data.settings) {
      return {
        ...data.settings,
        kioskModeEnabled: data.settings.kioskModeEnabled !== false,
      };
    }
  } catch (e) {
    console.warn('[API] Failed to fetch public settings:', e);
  }
  return { appleLoginEnabled: false, registrationEnabled: true, maintenanceMode: false, kioskModeEnabled: true, systemNotice: '' };
}

// -------------------------------------------------------------
// NOTIFICATIONS & PREFERENCES API
// -------------------------------------------------------------
export async function fetchNotificationsApi(userId?: string) {
  try {
    const url = userId ? `/api/notifications?userId=${encodeURIComponent(userId)}` : '/api/notifications';
    const res = await apiFetch(url, { headers: authHeaders() });
    const data = await res.json();
    if (Array.isArray(data)) {
      return { success: true, notifications: data };
    }
    return data;
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function markNotificationsReadApi(notificationId?: string, markAll?: boolean, userId?: string) {
  try {
    const res = await apiFetch('/api/notifications/read', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ notificationId, markAll, userId }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function fetchNotificationPreferencesApi(userId?: string) {
  try {
    const url = userId ? `/api/notifications/preferences?userId=${encodeURIComponent(userId)}` : '/api/notifications/preferences';
    const res = await apiFetch(url, { headers: authHeaders() });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function saveNotificationPreferencesApi(prefs: any) {
  try {
    const res = await apiFetch('/api/notifications/preferences', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(prefs),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function triggerLowStockCheckApi(poolId?: string, items?: any[]) {
  try {
    const res = await apiFetch('/api/notifications/trigger-low-stock-check', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ poolId, items }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function triggerWeeklyDigestApi(poolId?: string, userId?: string, poolName?: string) {
  try {
    const res = await apiFetch('/api/notifications/trigger-weekly-digest', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ poolId, userId, poolName }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteNotificationApi(notificationId: string) {
  try {
    const res = await apiFetch(`/api/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function sendTestNotificationApi(userId?: string, poolId?: string) {
  try {
    const res = await apiFetch('/api/notifications/test-notification', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, poolId }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// -------------------------------------------------------------
// WEBHOOKS API
// -------------------------------------------------------------
export async function fetchWebhooksApi(poolId: string) {
  try {
    const res = await apiFetch(`/api/webhooks?poolId=${encodeURIComponent(poolId)}`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      return { success: true, webhooks: data };
    }
    return data;
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function saveWebhookApi(webhook: any) {
  try {
    const res = await apiFetch('/api/webhooks', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(webhook),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteWebhookApi(webhookId: string) {
  try {
    const res = await apiFetch(`/api/webhooks/${encodeURIComponent(webhookId)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function testWebhookDispatchApi(platform: 'slack' | 'teams', webhookUrl: string, channelName: string) {
  try {
    const res = await apiFetch('/api/webhooks/test-dispatch', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ platform, webhookUrl, channelName }),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}


export async function uploadUserAvatarApi(
  fileOrBase64: File | string,
  mimeType?: string
): Promise<{ success: boolean; avatarUrl?: string; avatarId?: string; error?: string }> {
  try {
    const baseHeaders = authHeaders();
    if (fileOrBase64 instanceof File) {
      const formData = new FormData();
      formData.append('avatar', fileOrBase64);
      const headers = { ...baseHeaders };
      delete (headers as any)['Content-Type'];
      const res = await apiFetch('/api/users/avatar', {
        method: 'POST',
        headers,
        body: formData,
      });
      return await res.json();
    } else {
      const headers = { ...baseHeaders, 'Content-Type': 'application/json' };
      const res = await apiFetch('/api/users/avatar', {
        method: 'POST',
        headers,
        body: JSON.stringify({ data: fileOrBase64, mimeType }),
      });
      return await res.json();
    }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export async function deleteUserAvatarApi(
  avatarId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const endpoint = avatarId ? `/api/users/avatar/${avatarId}` : '/api/users/avatar';
    const res = await apiFetch(endpoint, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return await res.json();
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}


export interface EnterpriseInquiryPayload {
  company: string;
  email: string;
  teamSize?: string;
  pantryCount?: string;
  requirements?: string;
  name?: string;
}

export async function submitEnterpriseInquiryApi(payload: EnterpriseInquiryPayload): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const res = await apiFetch('/api/contact', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}



