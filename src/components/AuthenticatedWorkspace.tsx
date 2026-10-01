import React, { useState, useEffect, Suspense, lazy, useMemo, useCallback } from 'react';
import { Pool, User, UserRole, Item, Transaction, ShoppingListItem, PollItem, ItemCategory, AppNotification, NotificationPreferences, WebhookConfig, DiscrepancyReason, PaymentProvider } from '../types';
import { loadPools, savePools, loadActivePoolId, saveActivePoolId, loadActiveUserId, saveActiveUserId, loadCachedAuthUser, saveCachedAuthUser, loadCachedOrganizations, saveCachedOrganizations, loadActiveOrgId, saveActiveOrgId, loadItems, saveItems, loadTransactions, saveTransactions, loadShoppingList, saveShoppingList, loadPolls, savePolls, isSoundEnabled, saveSoundEnabled, clearUserData } from '../lib/storage';
import { fetchPools, fetchItems, fetchTransactions, consumeItemApi, addDepositApi, createPoolApi, updatePoolApi, deletePoolApi, joinPoolApi, saveItemApi, deleteItemApi, reportDiscrepancyApi, fetchCurrentUserApi, setAuthToken, removeAuthToken, getAuthToken, AuthUser, fetchOrganizationsApi, ApiOrganization, isOrganizationsEnabled, fetchPublicSettingsApi, fetchNotificationsApi, markNotificationsReadApi, fetchNotificationPreferencesApi, saveNotificationPreferencesApi, triggerLowStockCheckApi, triggerWeeklyDigestApi, deleteNotificationApi, sendTestNotificationApi, fetchWebhooksApi, saveWebhookApi, deleteWebhookApi, testWebhookDispatchApi, fetchShoppingListApi, addShoppingItemApi, updateShoppingItemApi, deleteShoppingItemApi, fetchPollsApi, createPollApi, votePollApi, updatePollApi as updatePollEndpointApi, deletePollApi as deletePollEndpointApi, updateMemberRoleApi, removeMemberApi, refundTransactionApi, deleteOrganizationApi, joinOrganizationApi, fetchOrgMembersApi, removeOrgMemberApi } from '../lib/api';
import { playConsumeSound, playDepositSound, playAlertSound } from '../lib/sound';
import { getDefaultAvatarUrl } from '../lib/avatar';
import { calculateMovingAveragePrice } from '../lib/pricing';
import { resolvePoolCode } from '../lib/poolUtils';
import { areBarcodesMatching } from '../shared/barcodeUtils';

import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { AlertDialogModal } from './AlertDialogModal';
import { OfflineQueueBanner } from './OfflineQueueBanner';
import { LegalTabType } from './LegalModal';
import { DashboardSkeleton } from './DashboardSkeleton';
import { useModals } from '../contexts/ModalContext';

import { markAppMilestone } from '../lib/performance';
import { extractJoinCode } from '../lib/joinCode';
import { telemetry } from '../lib/telemetry';
import { trackPageView, trackEvent } from '../lib/analytics';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { CookieConsentBanner } from './CookieConsentBanner';
import { SignupIntent } from './LandingPage';

// Preload ItemCatalog chunk immediately since it is the default landing tab in workspace
import('./ItemCatalog').catch(() => {});

const PoolSummaryCard = lazyWithRetry(() => import('./PoolSummaryCard').then(m => ({ default: m.PoolSummaryCard })));
const ItemCatalog = lazyWithRetry(() => import('./ItemCatalog').then(m => ({ default: m.ItemCatalog })));
const MembersBalanceList = lazyWithRetry(() => import('./MembersBalanceList').then(m => ({ default: m.MembersBalanceList })));
const LedgerTransactionsView = lazyWithRetry(() => import('./LedgerTransactionsView').then(m => ({ default: m.LedgerTransactionsView })));
const OnboardingWizardModal = lazyWithRetry(() => import('./OnboardingWizardModal').then(m => ({ default: m.OnboardingWizardModal })));
const AnalyticsCharts = lazyWithRetry(() => import('./AnalyticsCharts').then(m => ({ default: m.AnalyticsCharts })));
const AuthModal = lazyWithRetry(() => import('./AuthModal').then(m => ({ default: m.AuthModal })));
const LegalModal = lazyWithRetry(() => import('./LegalModal').then(m => ({ default: m.LegalModal })));
const AdminDashboardModal = lazyWithRetry(() => import('./AdminDashboardModal').then(m => ({ default: m.AdminDashboardModal })));
const CreateOrganizationModal = lazyWithRetry(() => import('./CreateOrganizationModal').then(m => ({ default: m.CreateOrganizationModal })));
const ConsumptionKioskModal = lazyWithRetry(() => import('./ConsumptionKioskModal').then(m => ({ default: m.ConsumptionKioskModal })));
const ReceiptScannerModal = lazyWithRetry(() => import('./ReceiptScannerModal').then(m => ({ default: m.ReceiptScannerModal })));
const AddContributionModal = lazyWithRetry(() => import('./AddContributionModal').then(m => ({ default: m.AddContributionModal })));
const ShoppingListModal = lazyWithRetry(() => import('./ShoppingListModal').then(m => ({ default: m.ShoppingListModal })));
const ItemFormModal = lazyWithRetry(() => import('./ItemFormModal').then(m => ({ default: m.ItemFormModal })));
const CreatePoolModal = lazyWithRetry(() => import('./CreatePoolModal').then(m => ({ default: m.CreatePoolModal })));
const ManagePoolModal = lazyWithRetry(() => import('./ManagePoolModal').then(m => ({ default: m.ManagePoolModal })));
const SharePoolModal = lazyWithRetry(() => import('./SharePoolModal').then(m => ({ default: m.SharePoolModal })));
const FridgeQRScannerModal = lazyWithRetry(() => import('./FridgeQRScannerModal').then(m => ({ default: m.FridgeQRScannerModal })));
const StockDiscrepancyModal = lazyWithRetry(() => import('./StockDiscrepancyModal').then(m => ({ default: m.StockDiscrepancyModal })));
const PrintableFridgePosterModal = lazyWithRetry(() => import('./PrintableFridgePosterModal').then(m => ({ default: m.PrintableFridgePosterModal })));
const ItemQRCodeModal = lazyWithRetry(() => import('./ItemQRCodeModal').then(m => ({ default: m.ItemQRCodeModal })));
const PollsModal = lazyWithRetry(() => import('./PollsModal').then(m => ({ default: m.PollsModal })));
const NotificationModal = lazyWithRetry(() => import('./NotificationModal').then(m => ({ default: m.NotificationModal })));
const WebhookIntegrationModal = lazyWithRetry(() => import('./WebhookIntegrationModal').then(m => ({ default: m.WebhookIntegrationModal })));
const UserProfileModal = lazyWithRetry(() => import('./UserProfileModal').then(m => ({ default: m.UserProfileModal })));
const SettleUpModal = lazyWithRetry(() => import('./SettleUpModal').then(m => ({ default: m.SettleUpModal })));
const NFCTagModal = lazyWithRetry(() => import('./NFCTagModal').then(m => ({ default: m.NFCTagModal })));
const SavingsLeaderboardModal = lazyWithRetry(() => import('./SavingsLeaderboardModal').then(m => ({ default: m.SavingsLeaderboardModal })));
const OnboardingChecklist = lazyWithRetry(() => import('./OnboardingChecklist').then(m => ({ default: m.OnboardingChecklist })));
const MemberWelcomeBanner = lazyWithRetry(() => import('./MemberWelcomeBanner').then(m => ({ default: m.MemberWelcomeBanner })));
const HelpGuideModal = lazyWithRetry(() => import('./HelpGuideModal').then(m => ({ default: m.HelpGuideModal })));

import { Vote, Layers, PieChart as PieChartIcon, Users, Receipt, ShoppingBag, Sparkles, Coffee } from 'lucide-react';

export interface AuthenticatedWorkspaceProps {
  authUser: AuthUser;
  setAuthUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  initialLaunchOnboarding?: boolean;
  initialSignupIntent?: SignupIntent | null;
  onOpenLegal: (tab?: LegalTabType) => void;
  onLogout: () => void;
}

export const AuthenticatedWorkspace: React.FC<AuthenticatedWorkspaceProps> = ({
  authUser,
  setAuthUser,
  initialLaunchOnboarding = false,
  initialSignupIntent = null,
  onOpenLegal,
  onLogout,
}) => {
  const [pools, setPools] = useState<Pool[]>(() => loadPools(authUser?.id));
  const [isLoadingPools, setIsLoadingPools] = useState<boolean>(() => {
    const cachedPools = loadPools(authUser?.id);
    // Only show skeleton on initial mount if authenticated but 0 cached pools exist
    return Boolean(authUser && cachedPools.length === 0);
  });
  const [activePoolId, setActivePoolId] = useState<string>(() => loadActivePoolId(authUser?.id));

  const activePool: Pool | undefined = pools.find((p) => p.id === activePoolId) || pools[0];

  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');
  const [signupIntent, setSignupIntent] = useState<SignupIntent | null>(initialSignupIntent || null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(Boolean(initialLaunchOnboarding));

  useEffect(() => {
    if (initialLaunchOnboarding) {
      setIsOnboardingOpen(true);
      if (initialSignupIntent) {
        setSignupIntent(initialSignupIntent);
      }
    }
  }, [initialLaunchOnboarding, initialSignupIntent]);
  const [authResetToken, setAuthResetToken] = useState<string | null>(null);
  const [authResetEmail, setAuthResetEmail] = useState<string | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [organizations, setOrganizations] = useState<ApiOrganization[]>(() => {
    const cachedUser = loadCachedAuthUser();
    if (cachedUser && cachedUser.id !== authUser?.id) return [];
    return loadCachedOrganizations();
  });
  const [activeOrgId, setActiveOrgId] = useState<string>(() => {
    const cachedUser = loadCachedAuthUser();
    if (cachedUser && cachedUser.id !== authUser?.id) return '';
    return loadActiveOrgId();
  });
  const [isCreateOrgOpen, setIsCreateOrgOpen] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTabType>('terms');

  const handleOpenLegal = (tab: LegalTabType = 'terms') => {
    setLegalTab(tab);
    setIsLegalOpen(true);
  };

  const handleCloseLegal = () => {
    setIsLegalOpen(false);
    if (typeof window !== 'undefined') {
      const currentPath = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      const legalPaths = ['/privacy', '/terms', '/user-agreement', '/cookies', '/legal'];
      if (legalPaths.includes(currentPath)) {
        window.history.replaceState(null, '', '/');
      } else {
        const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
        if (['privacy', 'terms', 'user-agreement', 'cookies', 'legal'].includes(currentHash)) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    }
  };

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error' | 'success' | 'confirm';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  const [activeUserId, setActiveUserId] = useState<string>(() => loadActiveUserId(activePool));

  const poolMembers = activePool?.members || [];
  const existingMember = authUser
    ? poolMembers.find((m) => m.id === authUser.id || (m as any).userId === authUser.id || (m as any).user_id === authUser.id)
    : undefined;

  const authMember: User | undefined = authUser ? (
    existingMember ? {
      ...existingMember,
      id: authUser.id,
      name: existingMember.name && existingMember.name !== 'Member' ? existingMember.name : authUser.name,
      email: existingMember.email || authUser.email,
      avatar: authUser.avatarUrl || existingMember.avatar || (existingMember as any).avatarUrl || getDefaultAvatarUrl(authUser.name),
      role: existingMember.role || (activePool?.championId === authUser.id ? 'champion' : 'contributor'),
    } : {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      avatar: authUser.avatarUrl || getDefaultAvatarUrl(authUser.name),
      balance: 0,
      role: (activePool?.championId === authUser.id ? 'champion' : 'contributor') as UserRole,
      joinedAt: new Date().toISOString()
    }
  ) : undefined;

  const defaultUser: User = authMember || {
    id: 'u_visitor',
    name: 'Visitor',
    email: '',
    avatar: '',
    balance: 0,
    role: 'contributor',
    joinedAt: new Date().toISOString()
  };

  const activeUser: User = authMember || poolMembers.find((m) => m.id === activeUserId) || poolMembers[0] || defaultUser;

  const poolOrg = activePool?.organizationId ? organizations.find((o) => o.id === activePool.organizationId) : (activeOrgId ? organizations.find((o) => o.id === activeOrgId) : undefined);
  const isOrgManagerUser = Boolean(poolOrg && (poolOrg.ownerId === authUser?.id || (poolOrg as any)?.role === 'owner' || (poolOrg as any)?.role === 'admin'));

  const isCurrentPoolManager = Boolean(
    activePool && activeUser && (
      activeUser.id === activePool.championId ||
      activeUser.role === 'champion' ||
      activeUser.role === 'admin' ||
      activePool.members?.find((m) => m.id === activeUser.id)?.role === 'champion' ||
      activePool.members?.find((m) => m.id === activeUser.id)?.role === 'admin' ||
      authUser?.systemRole === 'superadmin' ||
      authUser?.systemRole === 'admin' ||
      isOrgManagerUser
    )
  );

  const [items, setItems] = useState<Item[]>(() => {
    const cachedUser = loadCachedAuthUser();
    if (cachedUser && cachedUser.id !== authUser?.id) return [];
    return loadItems();
  });

  // Memoized items for active pool to prevent unnecessary ItemCatalog re-evaluations
  const activePoolItems = useMemo(() => {
    return activePool ? items.filter((i) => i.poolId === activePool.id) : [];
  }, [items, activePool?.id]);

  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const cachedUser = loadCachedAuthUser();
    if (cachedUser && cachedUser.id !== authUser?.id) return [];
    return loadTransactions();
  });
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>(() => {
    const cachedUser = loadCachedAuthUser();
    if (cachedUser && cachedUser.id !== authUser?.id) return [];
    return loadShoppingList();
  });
  const [polls, setPolls] = useState<PollItem[]>(() => {
    const cachedUser = loadCachedAuthUser();
    if (cachedUser && cachedUser.id !== authUser?.id) return [];
    return loadPolls();
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(isSoundEnabled);

  // Load current user profile & organizations concurrently in parallel
  useEffect(() => {
    async function loadUserAndOrgs() {
      try {
        // Hydrate incoming session token from OAuth redirect if present
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const incomingToken = urlParams.get('auth_token') || urlParams.get('token');
          if (incomingToken) {
            if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(\.[A-Za-z0-9-_+/=]+)?$/.test(incomingToken) && incomingToken.length <= 4096) {
              setAuthToken(incomingToken);
            }
            urlParams.delete('auth_token');
            urlParams.delete('token');
            const cleanSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
            window.history.replaceState({}, '', window.location.pathname + cleanSearch + window.location.hash);
          }
        }

        const [user, orgs] = await Promise.all([
          fetchCurrentUserApi(),
          isOrganizationsEnabled ? fetchOrganizationsApi() : Promise.resolve([])
        ]);

        markAppMilestone('auth_resolved', { isLoggedIn: Boolean(user) });

        if (user) {
          setAuthUser((prev) => {
            if (
              prev &&
              prev.id === user.id &&
              prev.name === user.name &&
              prev.email === user.email &&
              prev.avatarUrl === user.avatarUrl &&
              prev.systemRole === user.systemRole
            ) {
              return prev; // Preserve reference to avoid re-triggering dependent effects
            }
            return user;
          });
          saveCachedAuthUser(user);
          const validOrgs = Array.isArray(orgs) ? orgs : (Array.isArray((orgs as any)?.organizations) ? (orgs as any).organizations : []);
          setOrganizations(validOrgs);
          saveCachedOrganizations(validOrgs);
          if (!validOrgs.some((o: any) => o.id === activeOrgId)) {
            setActiveOrgId('');
            saveActiveOrgId('');
          }
        } else {
          setAuthUser(null);
          saveCachedAuthUser(null);
          setOrganizations([]);
          saveCachedOrganizations([]);
          setActiveOrgId('');
          saveActiveOrgId('');
        }
      } catch (e) {
        setAuthUser(null);
        saveCachedAuthUser(null);
      }
    }
    loadUserAndOrgs();
  }, [authUser?.id]);


  // Handle incoming native smartphone camera QR scans and NFC tag taps (iOS CoreNFC & Android Tag Dispatch)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const action = searchParams.get('action');
    const joinCode = searchParams.get('join') || searchParams.get('code');
    const orgJoinCode = searchParams.get('org_join') || searchParams.get('invite') || searchParams.get('org');
    const itemId = searchParams.get('item');
    const poolId = searchParams.get('pool');
    const isKiosk = searchParams.get('kiosk') === '1' || searchParams.get('mode') === 'kiosk';

    if (isKiosk) {
      setIsKioskOpen(true);
    }

    const resetTokenParam = searchParams.get('reset_token');
    const resetEmailParam = searchParams.get('email');

    if (resetTokenParam) {
      setAuthResetToken(resetTokenParam);
      if (resetEmailParam) {
        setAuthResetEmail(resetEmailParam);
      }
      setIsAuthOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // action=consume QR shelf tag scan — explicit consume intent, no join ambiguity
    if (action === 'consume' && itemId) {
      const isAlreadyMember = pools.some(
        (p) => p.id === poolId || (joinCode && p.code?.toUpperCase() === joinCode.toUpperCase())
      );
      if (!isAlreadyMember && joinCode) {
        handleJoinPool(joinCode, { silent: true });
      }
      if (poolId && activePoolId !== poolId) setActivePoolId(poolId);
      const matchedItem = items.find((i) => i.id === itemId);
      if (matchedItem) {
        handleConsumeItem(matchedItem);
        window.history.replaceState({}, '', window.location.pathname);
      } else if (items.length > 0) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    // Process any pending QR consume action deferred from unauthenticated scan
    if (items.length > 0) {
      const pendingConsumeRaw = localStorage.getItem('pantrypool_pending_consume');
      if (pendingConsumeRaw) {
        try {
          const { itemId: pItemId, poolId: pPoolId, joinCode: pJoinCode } = JSON.parse(pendingConsumeRaw);
          localStorage.removeItem('pantrypool_pending_consume');
          const isMember = pools.some(
            (p) => p.id === pPoolId || (pJoinCode && p.code?.toUpperCase() === pJoinCode.toUpperCase())
          );
          if (!isMember && pJoinCode) {
            handleJoinPool(pJoinCode, { silent: true });
          }
          if (pPoolId && activePoolId !== pPoolId) setActivePoolId(pPoolId);
          const matched = items.find((i) => i.id === pItemId);
          if (matched) {
            handleConsumeItem(matched);
          }
        } catch (e) {
          localStorage.removeItem('pantrypool_pending_consume');
        }
      }
    } else if (orgJoinCode && isOrganizationsEnabled) {
      // Explicit ?org_join= / ?invite= organization invite link
      if (authUser) {
        handleJoinOrganization(orgJoinCode);
      } else {
        localStorage.setItem('pantrypool_pending_org_join', orgJoinCode);
        setIsAuthOpen(true);
      }
      window.history.replaceState({}, '', window.location.pathname);
    } else if (joinCode) {
      // Explicit ?join= pool invite link
      if (authUser) {
        handleJoinPool(joinCode);
      } else {
        localStorage.setItem('pantrypool_pending_join', joinCode);
        setIsAuthOpen(true);
      }
      window.history.replaceState({}, '', window.location.pathname);
    } else if (itemId) {
      // Legacy QR URLs without action= param — fall back to consume
      if (poolId) {
        setActivePoolId(poolId);
      }
      const matchedItem = items.find((i) => i.id === itemId);
      if (matchedItem) {
        handleConsumeItem(matchedItem);
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [items, authUser?.id]);

  // Sync with live backend API (Parallelized Single-Flight SWR)
  useEffect(() => {
    let isMounted = true;

    async function syncBackendData() {
      if (!authUser) {
        setPools([]);
        setItems([]);
        setTransactions([]);
        setShoppingList([]);
        setPolls([]);
        setIsLoadingPools(false);
        return;
      }

      // Only show full skeleton loader if 0 cached pools exist
      if (pools.length === 0) {
        setIsLoadingPools(true);
      }

      try {
        const initialTargetPoolId = activePoolId || (pools[0]?.id) || '';

        let apiPools: any = null;
        let initialItems: any = null;
        let initialTxs: any = null;
        let initialShopping: any = null;
        let initialPolls: any = null;

        // Single-flight Parallel Batch: fetch pools AND active pool resources simultaneously
        await Promise.all([
          fetchPools(activeOrgId || undefined)
            .then((p) => { apiPools = p; })
            .catch((e) => console.warn('[API] Sync pools error:', e)),
          initialTargetPoolId
            ? fetchItems(initialTargetPoolId)
                .then((i) => { initialItems = i; })
                .catch((e) => console.warn('[API] Sync items error:', e))
            : Promise.resolve(),
          initialTargetPoolId
            ? fetchTransactions(initialTargetPoolId)
                .then((t) => { initialTxs = t; })
                .catch((e) => console.warn('[API] Sync txs error:', e))
            : Promise.resolve(),
          initialTargetPoolId
            ? fetchShoppingListApi(initialTargetPoolId)
                .then((s) => { initialShopping = s; })
                .catch((e) => console.warn('[API] Sync shopping error:', e))
            : Promise.resolve({ success: true, shoppingList: [] }),
          initialTargetPoolId
            ? fetchPollsApi(initialTargetPoolId)
                .then((p) => { initialPolls = p; })
                .catch((e) => console.warn('[API] Sync polls error:', e))
            : Promise.resolve({ success: true, polls: [] })
        ]);

        if (!isMounted) return;

        let resolvedActivePoolId = activePoolId;

        if (apiPools !== null) {
          if (apiPools.length > 0) {
            const normalizedPools = apiPools.map((p: any) => {
              const rawMembers = Array.isArray(p.members) ? p.members : [];
              const members = rawMembers.map((m: any) => {
                const uId = m.userId || m.user_id || m.id;
                const isCurrentUser = Boolean(authUser && (uId === authUser.id || m.id === authUser.id || m.memberId === authUser.id));
                const mName = m.name && m.name !== 'Member' ? m.name : (isCurrentUser && authUser?.name ? authUser.name : (m.name || 'Member'));
                const mEmail = m.email || (isCurrentUser && authUser?.email ? authUser.email : '');
                const mAvatar = (isCurrentUser && authUser?.avatarUrl) ? authUser.avatarUrl : (m.avatar || m.avatarUrl || getDefaultAvatarUrl(mName));
                return {
                  ...m,
                  id: uId,
                  memberId: m.memberId || m.id,
                  userId: uId,
                  name: mName,
                  email: mEmail,
                  avatar: mAvatar,
                  avatarUrl: mAvatar,
                };
              });
              const poolCode = resolvePoolCode(p);
              return {
                ...p,
                code: poolCode,
                qrCodeKey: poolCode,
                members,
              };
            });
            setPools(normalizedPools as any);
            savePools(normalizedPools as any);

            if (!resolvedActivePoolId || !normalizedPools.some((p: any) => p.id === resolvedActivePoolId)) {
              resolvedActivePoolId = normalizedPools[0].id;
              setActivePoolId(resolvedActivePoolId);
            }
          } else {
            setPools([]);
            resolvedActivePoolId = '';
          }
        }

        if (resolvedActivePoolId) {
          let apiItems = initialItems;
          let apiTxs = initialTxs;
          let apiShopping = initialShopping;
          let apiPolls = initialPolls;

          // If activePoolId differed from our initial optimistic target, fetch the resolved pool's data
          if (resolvedActivePoolId !== initialTargetPoolId) {
            await Promise.all([
              fetchItems(resolvedActivePoolId)
                .then((i) => { apiItems = i; })
                .catch((e) => console.warn('[API] Fallback items error:', e)),
              fetchTransactions(resolvedActivePoolId)
                .then((t) => { apiTxs = t; })
                .catch((e) => console.warn('[API] Fallback txs error:', e)),
              fetchShoppingListApi(resolvedActivePoolId)
                .then((s) => { apiShopping = s; })
                .catch((e) => console.warn('[API] Fallback shopping error:', e)),
              fetchPollsApi(resolvedActivePoolId)
                .then((p) => { apiPolls = p; })
                .catch((e) => console.warn('[API] Fallback polls error:', e))
            ]);
            if (!isMounted) return;
          }

          if (apiItems !== null && Array.isArray(apiItems)) {
            const normalizedItems: Item[] = apiItems.map((i: any) => ({
              ...i,
              poolId: i.poolId || i.pool_id || resolvedActivePoolId,
              costPerUnit: Number(i.costPerUnit ?? i.cost_per_unit ?? 0),
              minStock: Number(i.minStock ?? i.min_stock ?? 5),
              unitName: i.unitName || i.unit_name || i.unit || 'unit',
            }));
            setItems(normalizedItems);
            saveItems(normalizedItems);
          }

          if (apiTxs !== null && Array.isArray(apiTxs)) {
            const normalizedTxs: Transaction[] = apiTxs.map((t: any) => ({
              id: t.id,
              poolId: t.poolId || t.pool_id || resolvedActivePoolId,
              userId: t.userId || t.user_id || '',
              type: t.type === 'deposit' ? 'contribution' : t.type === 'consume' ? 'consumption' : (t.type || 'consumption'),
              amount: Number(t.amount || 0),
              amountCents: t.amountCents ?? t.amount_cents,
              savingsCents: t.savingsCents ?? t.savings_cents ?? 0,
              itemId: t.itemId || t.item_id,
              itemName: t.itemName || t.item_name || (t.type === 'deposit' ? 'Balance Deposit' : 'Item'),
              quantity: t.quantity ? Number(t.quantity) : undefined,
              timestamp: t.timestamp || t.created_at || t.createdAt || new Date().toISOString(),
              note: t.note || t.description || '',
              createdByName: t.createdByName || t.userName || t.user_name || 'Pool Member',
              createdByAvatar: t.createdByAvatar || t.userAvatar || t.user_avatar || t.avatar || t.avatarUrl,
              resultingBalance: Number(t.resultingBalance ?? 0),
            }));
            setTransactions(normalizedTxs);
            saveTransactions(normalizedTxs);
          }

          if (apiShopping && apiShopping.success && Array.isArray(apiShopping.shoppingList)) {
            setShoppingList(apiShopping.shoppingList);
            saveShoppingList(apiShopping.shoppingList);
          }

          if (apiPolls && apiPolls.success && Array.isArray(apiPolls.polls)) {
            setPolls(apiPolls.polls);
            savePolls(apiPolls.polls);
          }

          markAppMilestone('dashboard_ready', {
            isLoggedIn: true,
            activePoolId: resolvedActivePoolId,
            itemCount: Array.isArray(apiItems) ? apiItems.length : 0
          });
        }
      } catch (err) {
        console.warn('[Sync Backend Data Error]', err);
      } finally {
        if (isMounted) {
          setIsLoadingPools(false);
        }
      }
    }

    syncBackendData();
    return () => { isMounted = false; };
  }, [authUser?.id, activeOrgId, activePoolId]);

  // Synchronize active pool data (pools, items, transactions, shopping list, polls) from backend
  const refreshActivePoolData = async (targetPoolId?: string) => {
    const pId = targetPoolId || activePoolId;
    if (!pId) return;

    try {
      const [apiPools, apiItems, apiTxs, apiShopping, apiPolls] = await Promise.all([
        fetchPools(activeOrgId || undefined),
        fetchItems(pId),
        fetchTransactions(pId),
        fetchShoppingListApi(pId),
        fetchPollsApi(pId)
      ]);

      if (apiPools && apiPools.length > 0) {
        const normalizedPools = apiPools.map((p: any) => {
          const rawMembers = Array.isArray(p.members) ? p.members : [];
          const members = rawMembers.map((m: any) => {
            const uId = m.userId || m.user_id || m.id;
            const isCurrentUser = Boolean(authUser && (uId === authUser.id || m.id === authUser.id || m.memberId === authUser.id));
            const mName = m.name && m.name !== 'Member' ? m.name : (isCurrentUser && authUser?.name ? authUser.name : (m.name || 'Member'));
            const mEmail = m.email || (isCurrentUser && authUser?.email ? authUser.email : '');
            const mAvatar = (isCurrentUser && authUser?.avatarUrl) ? authUser.avatarUrl : (m.avatar || m.avatarUrl || getDefaultAvatarUrl(mName));
            return {
              ...m,
              id: uId,
              memberId: m.memberId || m.id,
              userId: uId,
              name: mName,
              email: mEmail,
              avatar: mAvatar,
              avatarUrl: mAvatar,
            };
          });
          return {
            ...p,
            members,
          };
        });
        setPools(normalizedPools as any);
      }
      if (apiItems && Array.isArray(apiItems)) {
        const normalizedItems: Item[] = apiItems.map((i: any) => ({
          ...i,
          poolId: i.poolId || i.pool_id || pId,
          costPerUnit: Number(i.costPerUnit ?? i.cost_per_unit ?? 0),
          minStock: Number(i.minStock ?? i.min_stock ?? 5),
          unitName: i.unitName || i.unit_name || i.unit || 'unit',
        }));
        setItems(normalizedItems);
      }
      if (apiTxs && Array.isArray(apiTxs)) {
        const normalizedTxs: Transaction[] = apiTxs.map((t: any) => ({
          id: t.id,
          poolId: t.poolId || t.pool_id || pId,
          userId: t.userId || t.user_id || '',
          type: t.type === 'deposit' ? 'contribution' : t.type === 'consume' ? 'consumption' : (t.type || 'consumption'),
          amount: Number(t.amount || 0),
          amountCents: t.amountCents ?? t.amount_cents,
          savingsCents: t.savingsCents ?? t.savings_cents ?? 0,
          itemId: t.itemId || t.item_id,
          itemName: t.itemName || t.item_name || (t.type === 'deposit' ? 'Balance Deposit' : 'Item'),
          quantity: t.quantity ? Number(t.quantity) : undefined,
          timestamp: t.timestamp || t.created_at || t.createdAt || new Date().toISOString(),
          note: t.note || t.description || '',
          createdByName: t.createdByName || t.userName || t.user_name || 'Pool Member',
          createdByAvatar: t.createdByAvatar || t.userAvatar || t.user_avatar || t.avatar || t.avatarUrl,
          resultingBalance: Number(t.resultingBalance ?? 0),
        }));
        setTransactions(normalizedTxs);
      }
      if (apiShopping && apiShopping.success && Array.isArray(apiShopping.shoppingList)) {
        setShoppingList(apiShopping.shoppingList);
        saveShoppingList(apiShopping.shoppingList);
      }
      if (apiPolls && apiPolls.success && Array.isArray(apiPolls.polls)) {
        setPolls(apiPolls.polls);
        savePolls(apiPolls.polls);
      }
    } catch (e) {
      console.warn('[Refresh Error]', e);
    }
  };

  // Tab & Modal States
  const [activeTab, setActiveTab] = useState<'catalog' | 'members' | 'ledger' | 'polls' | 'analytics'>('catalog');
  const [kioskModeEnabled, setKioskModeEnabled] = useState(true);
  const [isKioskOpen, setIsKioskOpen] = useState(false);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [receiptPreselectedItemId, setReceiptPreselectedItemId] = useState<string | undefined>(undefined);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositTargetUser, setDepositTargetUser] = useState<User | undefined>(undefined);
  const [isShoppingOpen, setIsShoppingOpen] = useState(false);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [isCreatePoolOpen, setIsCreatePoolOpen] = useState(false);
  const [isManagePoolOpen, setIsManagePoolOpen] = useState(false);
  const [isSharePoolOpen, setIsSharePoolOpen] = useState(false);
  const [isPollsOpen, setIsPollsOpen] = useState(false);
  const [qrItem, setQrItem] = useState<Item | null>(null);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isPosterOpen, setIsPosterOpen] = useState(false);
  const [isNfcOpen, setIsNfcOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [discrepancyItem, setDiscrepancyItem] = useState<Item | null>(null);
  const [isWebhooksOpen, setIsWebhooksOpen] = useState(false);
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false);
  const [isSettleUpOpen, setIsSettleUpOpen] = useState(false);
  const [settleUpTargetUser, setSettleUpTargetUser] = useState<User | null>(null);
  const [isSavingsOpen, setIsSavingsOpen] = useState(false);
  const [isHelpGuideOpen, setIsHelpGuideOpen] = useState(false);

  const modals = useModals();

  // Sync active pool reference into ModalContext for automatic action pre-flight validation
  useEffect(() => {
    modals.setActivePoolRef(activePool);
  }, [activePool, modals.setActivePoolRef]);

  // Centralized Modal Dispatcher: handles modal opening requested anywhere in workspace or child components
  useEffect(() => {
    if (!modals.activeModal) return;
    const m = modals.activeModal;
    const payload = modals.modalPayload;
    switch (m) {
      case 'kiosk':
        setIsKioskOpen(true);
        break;
      case 'receipt':
        if (payload?.preselectedItemId) setReceiptPreselectedItemId(payload.preselectedItemId);
        setIsReceiptOpen(true);
        break;
      case 'deposit':
        if (payload?.targetUser) setDepositTargetUser(payload.targetUser);
        setIsDepositOpen(true);
        break;
      case 'shopping':
        setIsShoppingOpen(true);
        break;
      case 'itemForm':
        if (payload?.item !== undefined) setEditingItem(payload.item);
        setIsItemFormOpen(true);
        break;
      case 'createPool':
        setIsCreatePoolOpen(true);
        break;
      case 'managePool':
        setIsManagePoolOpen(true);
        break;
      case 'sharePool':
        setIsSharePoolOpen(true);
        break;
      case 'polls':
        setIsPollsOpen(true);
        break;
      case 'qrScanner':
        setIsQRScannerOpen(true);
        break;
      case 'poster':
        setIsPosterOpen(true);
        break;
      case 'nfc':
        setIsNfcOpen(true);
        break;
      case 'notifications':
        setIsNotificationsOpen(true);
        break;
      case 'webhooks':
        setIsWebhooksOpen(true);
        break;
      case 'userProfile':
        setIsUserProfileOpen(true);
        break;
      case 'settleUp':
        if (payload?.targetUser) setSettleUpTargetUser(payload.targetUser);
        setIsSettleUpOpen(true);
        break;
      case 'savings':
        setIsSavingsOpen(true);
        break;
      case 'helpGuide':
        setIsHelpGuideOpen(true);
        break;
      case 'admin':
        setIsAdminOpen(true);
        break;
      case 'createOrg':
        setIsCreateOrgOpen(true);
        break;
      case 'legal':
        handleOpenLegal(payload?.tab || 'terms');
        break;
      case 'auth':
        setAuthModalMode(payload?.mode || 'login');
        setIsAuthOpen(true);
        break;
      default:
        break;
    }
    modals.closeModal(m);
  }, [modals.activeModal, modals.modalPayload]);

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    userId: '',
    lowStockEmail: true,
    lowStockSms: false,
    weeklyDigestEmail: true,
    phoneNumber: ''
  });

  // Load public system settings and feature flags
  const refreshPublicSettings = async () => {
    try {
      const settings = await fetchPublicSettingsApi();
      if (settings && typeof settings.kioskModeEnabled === 'boolean') {
        setKioskModeEnabled(settings.kioskModeEnabled);
      }
    } catch (e) {
      console.warn('[Public Settings Load Error]', e);
    }
  };

  useEffect(() => {
    refreshPublicSettings();
  }, []);

  // Sync active session context to telemetry engine
  useEffect(() => {
    telemetry.setContext(activeUser?.id, activePool?.id);
  }, [activeUser?.id, activePool?.id]);

  // Support deep-linking and browser back/forward buttons via URL hash and pathname
  useEffect(() => {
    const handleRouteSync = () => {
      const path = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = (searchParams.get('tab') || searchParams.get('page') || searchParams.get('legal') || '').toLowerCase();

      // 1. Legal & Compliance routes
      if (path === '/privacy' || hash === 'privacy' || tabParam === 'privacy') {
        handleOpenLegal('privacy');
        return;
      }
      if (path === '/terms' || hash === 'terms' || tabParam === 'terms' || path === '/tos' || hash === 'tos') {
        handleOpenLegal('terms');
        return;
      }
      if (path === '/user-agreement' || hash === 'user-agreement' || tabParam === 'user-agreement') {
        handleOpenLegal('user-agreement');
        return;
      }
      if (path === '/cookies' || hash === 'cookies' || tabParam === 'cookies') {
        handleOpenLegal('cookies');
        return;
      }
      if (path === '/legal' || hash === 'legal') {
        handleOpenLegal('terms');
        return;
      }

      // 2. Public / Marketing / SaaS routes
      if (path === '/pricing' || hash === 'pricing') {
        const pricingEl = document.getElementById('pricing');
        if (pricingEl) {
          pricingEl.scrollIntoView({ behavior: 'smooth' });
        }
        return;
      }
      if (path === '/login' || path === '/signin' || hash === 'login' || hash === 'signin' || hash === 'auth') {
        if (authUser) {
          setIsAuthOpen(false);
          const cleanPath = (path === '/login' || path === '/signin') ? '/' : window.location.pathname;
          window.history.replaceState(null, '', `${cleanPath}#catalog`);
          return;
        }
        setAuthModalMode('login');
        setIsAuthOpen(true);
        return;
      }
      if (path === '/register' || path === '/signup' || hash === 'register' || hash === 'signup') {
        if (authUser) {
          setIsAuthOpen(false);
          const cleanPath = (path === '/register' || path === '/signup') ? '/' : window.location.pathname;
          window.history.replaceState(null, '', `${cleanPath}#catalog`);
          return;
        }
        setAuthModalMode('register');
        setIsAuthOpen(true);
        return;
      }

      // 3. Communal & Team views
      if (path === '/kiosk' || hash === 'kiosk') {
        setIsKioskOpen(true);
      } else if (path === '/shopping' || path === '/shopping-list' || hash === 'shopping' || hash === 'shopping-list') {
        setIsShoppingOpen(true);
      } else if (path === '/polls' || hash === 'polls') {
        setIsPollsOpen(true);
      } else if (path === '/integrations' || path === '/webhooks' || hash === 'integrations' || hash === 'webhooks') {
        setIsWebhooksOpen(true);
      } else if (path === '/settings' || path === '/manage-pool' || hash === 'settings' || hash === 'manage-pool') {
        setIsManagePoolOpen(true);
      } else if (path === '/savings' || path === '/leaderboard' || hash === 'savings' || hash === 'leaderboard') {
        setIsSavingsOpen(true);
      } else if (path === '/notifications' || hash === 'notifications') {
        setIsNotificationsOpen(true);
      } else if (path === '/admin' || hash === 'admin') {
        setIsAdminOpen(true);
      } else if (path === '/profile' || hash === 'profile') {
        setIsUserProfileOpen(true);
      } else if (path === '/catalog' || hash === 'catalog' || path === '/members' || hash === 'members' || path === '/ledger' || hash === 'ledger' || path === '/analytics' || hash === 'analytics') {
        const targetTab = (path !== '/' ? path.replace(/^\//, '') : hash) as any;
        setActiveTab(targetTab);
      } else if (path.startsWith('/join/')) {
        const joinCode = path.replace(/^\/join\//, '');
        if (joinCode) {
          if (authUser) {
            handleJoinPool(joinCode);
          } else {
            localStorage.setItem('pantrypool_pending_join', joinCode);
            setIsAuthOpen(true);
          }
        }
      }
    };

    handleRouteSync();
    window.addEventListener('hashchange', handleRouteSync);
    window.addEventListener('popstate', handleRouteSync);
    return () => {
      window.removeEventListener('hashchange', handleRouteSync);
      window.removeEventListener('popstate', handleRouteSync);
    };
  }, [authUser]);

  // Synchronize Google Analytics 4 page_view tracking, document.title, and browser URL hash
  const lastTrackedViewRef = React.useRef<string>('');

  useEffect(() => {
    let path = '/';
    let title = 'PantryPool — Smart Communal Pantry & Office Breakroom Food Ledger';
    let hash = '';

    if (!authUser) {
      if (isAuthOpen) {
        path = authModalMode === 'register' ? '/register' : '/login';
        title = `${authModalMode === 'register' ? 'Register' : 'Sign In'} | PantryPool`;
        hash = authModalMode === 'register' ? 'register' : 'login';
      } else if (isLegalOpen) {
        const legalTitles: Record<LegalTabType, string> = {
          privacy: 'Privacy Policy (GDPR & CCPA Compliant) | PantryPool',
          terms: 'Terms of Service | PantryPool',
          'user-agreement': 'User Agreement & Communal Rules | PantryPool',
          cookies: 'Cookie Policy | PantryPool',
        };
        path = `/${legalTab}`;
        title = legalTitles[legalTab] || 'Legal & Compliance | PantryPool';
        hash = legalTab;
      } else if (typeof window !== 'undefined' && ((window.location.pathname || '').toLowerCase().replace(/\/+$/, '') === '/pricing' || window.location.hash.toLowerCase().includes('pricing'))) {
        path = '/pricing';
        title = 'Pricing Plans — PantryPool';
        hash = 'pricing';
      } else {
        path = '/';
        title = 'PantryPool — Smart Communal Pantry & Office Breakroom Food Ledger';
        hash = '';
      }
    } else {
      const poolName = activePool?.name || 'Breakroom';

      if (isAdminOpen) {
        path = '/admin';
        title = 'Admin Console | PantryPool';
        hash = 'admin';
      } else if (isKioskOpen) {
        path = '/kiosk';
        title = `Kiosk Mode — ${poolName} | PantryPool`;
        hash = 'kiosk';
      } else if (isShoppingOpen) {
        path = '/shopping-list';
        title = `Shopping List — ${poolName} | PantryPool`;
        hash = 'shopping-list';
      } else if (isPollsOpen) {
        path = '/polls';
        title = `Voting Polls — ${poolName} | PantryPool`;
        hash = 'polls';
      } else if (isWebhooksOpen) {
        path = '/integrations';
        title = 'Webhooks & Integrations | PantryPool';
        hash = 'integrations';
      } else if (isSavingsOpen) {
        path = '/savings';
        title = `Breakroom Savings — ${poolName} | PantryPool`;
        hash = 'savings';
      } else if (isManagePoolOpen) {
        path = '/settings';
        title = `Pool Settings — ${poolName} | PantryPool`;
        hash = 'settings';
      } else if (isSharePoolOpen) {
        path = '/share';
        title = `Share Pool — ${poolName} | PantryPool`;
        hash = 'share';
      } else if (isNotificationsOpen) {
        path = '/notifications';
        title = 'Notifications | PantryPool';
        hash = 'notifications';
      } else if (isUserProfileOpen) {
        path = '/profile';
        title = 'User Profile | PantryPool';
        hash = 'profile';
      } else if (isLegalOpen) {
        const legalTitles: Record<LegalTabType, string> = {
          privacy: 'Privacy Policy (GDPR & CCPA Compliant) | PantryPool',
          terms: 'Terms of Service | PantryPool',
          'user-agreement': 'User Agreement & Communal Rules | PantryPool',
          cookies: 'Cookie Policy | PantryPool',
        };
        path = `/${legalTab}`;
        title = legalTitles[legalTab] || 'Legal & Compliance | PantryPool';
        hash = legalTab;
      } else {
        switch (activeTab) {
          case 'members':
            path = '/members';
            title = `Team Balances — ${poolName} | PantryPool`;
            hash = 'members';
            break;
          case 'ledger':
            path = '/ledger';
            title = `Expense Ledger — ${poolName} | PantryPool`;
            hash = 'ledger';
            break;
          case 'analytics':
            path = '/analytics';
            title = `Pool Analytics — ${poolName} | PantryPool`;
            hash = 'analytics';
            break;
          case 'polls':
            path = '/polls';
            title = `Voting Polls — ${poolName} | PantryPool`;
            hash = 'polls';
            break;
          case 'catalog':
          default:
            path = '/catalog';
            title = `Catalog — ${poolName} | PantryPool`;
            hash = 'catalog';
            break;
        }
      }
    }

    const trackingKey = `${path}:${title}`;
    if (lastTrackedViewRef.current !== trackingKey) {
      lastTrackedViewRef.current = trackingKey;

      if (typeof window !== 'undefined') {
        const currentHash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
        const currentPath = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
        const legalTabs = ['privacy', 'terms', 'user-agreement', 'cookies', 'legal'];

        if (isLegalOpen) {
          if (currentPath === `/${legalTab}`) {
            // Already clean path
          } else if (legalTabs.includes(currentPath.replace(/^\//, ''))) {
            window.history.replaceState(null, '', `/${legalTab}`);
          } else {
            window.history.replaceState(null, '', `#${legalTab}`);
          }
        } else if (hash && currentHash !== hash) {
          const targetPath = (currentPath === '/login' || currentPath === '/signin' || currentPath === '/register' || currentPath === '/signup') ? '/' : window.location.pathname;
          window.history.replaceState(null, '', `${targetPath}#${hash}`);
        } else if (!hash && currentHash && !['login', 'register', 'legal', 'gear', ...legalTabs].includes(currentHash)) {
          const targetPath = (currentPath === '/login' || currentPath === '/signin' || currentPath === '/register' || currentPath === '/signup') ? '/' : window.location.pathname;
          window.history.replaceState(null, '', targetPath);
        }
      }

      trackPageView(title, path);
    }
  }, [
    authUser?.id,
    activePool?.id,
    activePool?.name,
    activeTab,
    authModalMode,
    isAuthOpen,
    isAdminOpen,
    isKioskOpen,
    isShoppingOpen,
    isPollsOpen,
    isWebhooksOpen,
    isSavingsOpen,
    isManagePoolOpen,
    isSharePoolOpen,
    isNotificationsOpen,
    isUserProfileOpen,
    isLegalOpen,
    legalTab
  ]);

  const handleTabSelect = (tab: 'catalog' | 'members' | 'ledger' | 'polls' | 'analytics') => {
    setActiveTab(tab);
    telemetry.trackView(tab);
    trackEvent('select_content', { content_type: 'tab', item_id: tab });
  };

  // Fetch notifications and preferences from backend API for authenticated user
  useEffect(() => {
    async function loadNotifications() {
      if (!authUser) {
        setNotifications([]);
        return;
      }
      try {
        const [notifData, prefData] = await Promise.all([
          fetchNotificationsApi(authUser.id),
          fetchNotificationPreferencesApi(authUser.id)
        ]);
        if (notifData.success && Array.isArray(notifData.notifications)) {
          setNotifications(notifData.notifications);
        }
        if (prefData.success && prefData.preferences) {
          setNotificationPreferences(prefData.preferences);
        }
      } catch (e) {
        console.warn('[Notifications Load Error]', e);
      }
    }
    loadNotifications();
  }, [authUser?.id]);

  const handleMarkNotificationsRead = async (notificationId?: string, markAll?: boolean) => {
    await markNotificationsReadApi(notificationId, markAll, authUser?.id || activeUser.id);

    if (markAll) {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } else if (notificationId) {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    }
  };

  const handleSaveNotificationPreferences = async (newPrefs: NotificationPreferences) => {
    setNotificationPreferences(newPrefs);
    await saveNotificationPreferencesApi(newPrefs);
  };

  const handleTriggerLowStockCheck = async () => {
    if (!activePool?.id) return 'No active pool selected.';
    const poolItems = items.filter(i => i.poolId === activePool.id);
    const data = await triggerLowStockCheckApi(activePool.id, poolItems);
    if (data.success && Array.isArray(data.alerts)) {
      setNotifications(prev => {
        const existingIds = new Set(prev.map(n => n.id));
        const newUnique = data.alerts.filter((a: any) => !existingIds.has(a.id));
        return [...newUnique, ...prev];
      });
    }
    return data.message || (data.alerts?.length ? `${data.alerts.length} low-stock item(s) detected.` : 'All items are well stocked.');
  };

  const handleTriggerWeeklyDigest = async () => {
    if (!activePool?.id) return 'No active pool selected.';
    const data = await triggerWeeklyDigestApi(activePool.id, authUser?.id || activeUser.id, activePool.name);
    if (data.requiresUpgrade) {
      setAlertDialog({
        isOpen: true,
        title: 'Hosted Plus Feature Required',
        message: data.error || 'Weekly email summary digests are exclusively available on Hosted Plus ($12/mo) and Enterprise plans.',
        type: 'warning',
        confirmText: 'View Plus Plan',
        onConfirm: () => setIsCreateOrgOpen(true),
      });
      return data.error || 'Weekly digests require Hosted Plus or Enterprise.';
    }
    if (data.success && data.digest) {
      setNotifications(prev => [data.digest, ...prev]);
    }
    return data.message || (data.success ? `Weekly digest generated for "${activePool.name}".` : data.error || 'Failed to generate weekly digest.');
  };

  const handleDeleteNotification = async (notificationId: string) => {
    await deleteNotificationApi(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const handleSendTestAlert = async () => {
    if (!activePool?.id) return;
    const data = await sendTestNotificationApi(authUser?.id || activeUser.id, activePool.id);
    if (data.success && data.alert) {
      setNotifications(prev => [data.alert, ...prev]);
    }
  };

  const handleUpdateUserProfile = (updated: { 
    name: string; 
    avatarUrl: string;
    venmoHandle?: string;
    cashappHandle?: string;
    paypalHandle?: string;
    zelleIdentifier?: string;
    applePayHandle?: string;
    preferredPaymentMethod?: PaymentProvider;
  }) => {
    if (authUser) {
      setAuthUser({ 
        ...authUser, 
        name: updated.name, 
        avatarUrl: updated.avatarUrl,
        venmoHandle: updated.venmoHandle,
        cashappHandle: updated.cashappHandle,
        paypalHandle: updated.paypalHandle,
        zelleIdentifier: updated.zelleIdentifier,
        applePayHandle: updated.applePayHandle,
        preferredPaymentMethod: updated.preferredPaymentMethod,
      });
    }

    setPools((prevPools) =>
      prevPools.map((p) => ({
        ...p,
        members: p.members.map((m) =>
          m.id === (authUser?.id || activeUserId)
            ? {
                ...m,
                name: updated.name,
                avatar: updated.avatarUrl,
                venmoHandle: updated.venmoHandle,
                cashappHandle: updated.cashappHandle,
                paypalHandle: updated.paypalHandle,
                zelleIdentifier: updated.zelleIdentifier,
                applePayHandle: updated.applePayHandle,
                preferredPaymentMethod: updated.preferredPaymentMethod,
              }
            : m
        ),
      }))
    );
  };
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);

  // Fetch webhooks from API
  useEffect(() => {
    async function loadWebhooks() {
      if (!activePool?.id) return;
      const data = await fetchWebhooksApi(activePool.id);
      if (data.success && Array.isArray(data.webhooks)) {
        setWebhooks(data.webhooks);
      }
    }
    loadWebhooks();
  }, [activePool?.id]);

  const handleSaveWebhook = async (webhookData: Partial<WebhookConfig>) => {
    const data = await saveWebhookApi(webhookData);
    if (data.success && data.webhook) {
      setWebhooks(prev => {
        const idx = prev.findIndex(w => w.id === data.webhook.id);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = data.webhook;
          return copy;
        }
        return [data.webhook, ...prev];
      });
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    await deleteWebhookApi(id);
    setWebhooks(prev => prev.filter(w => w.id !== id));
  };

  const handleTestDispatch = async (platform: 'slack' | 'teams', webhookUrl: string, channelName: string) => {
    return await testWebhookDispatchApi(platform, webhookUrl, channelName);
  };

  // Persist state updates to localStorage (guarded by authUser and token to prevent writing stale state on logout)
  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    savePools(pools);
  }, [pools, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveActivePoolId(activePoolId);
  }, [activePoolId, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveActiveOrgId(activeOrgId);
  }, [activeOrgId, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveCachedOrganizations(organizations);
  }, [organizations, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveActiveUserId(activeUserId);
  }, [activeUserId, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveItems(items);
  }, [items, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveTransactions(transactions);
  }, [transactions, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    saveShoppingList(shoppingList);
  }, [shoppingList, authUser]);

  useEffect(() => {
    if (!authUser || !getAuthToken()) return;
    savePolls(polls);
  }, [polls, authUser]);

  useEffect(() => {
    saveSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  const handleLogoutWithCleanup = useCallback(() => {
    setPools([]);
    setActivePoolId('');
    setItems([]);
    setTransactions([]);
    setShoppingList([]);
    setPolls([]);
    setOrganizations([]);
    setActiveOrgId('');
    clearUserData();
    onLogout();
  }, [onLogout]);

  // Handle pool select
  const handleSelectPool = (poolId: string) => {
    setActivePoolId(poolId);
    const selectedPool = pools.find((p) => p.id === poolId);
    if (selectedPool) {
      setActiveUserId(selectedPool.championId || selectedPool.members[0].id);
    }
  };

  // Sound toggle
  const handleToggleSound = () => {
    setSoundEnabled(!soundEnabled);
  };

  // Core Action: Consume Item
  const handleConsumeItem = (itemToConsume: Item, customUserId?: string, showConfirmation = true) => {
    const targetUserId = customUserId || activeUser?.id || authUser?.id || activeUserId;
    const targetItemId = itemToConsume.id;

    // Check item stock
    if (itemToConsume.stock <= 0) {
      telemetry.trackRoadblock('item_out_of_stock_attempt', {
        item_id: itemToConsume.id,
        item_name: itemToConsume.name,
        category: itemToConsume.category,
      });
      if (soundEnabled) playAlertSound();
      setAlertDialog({
        isOpen: true,
        title: 'Item Out of Stock',
        message: `"${itemToConsume.name}" is currently out of stock! Ask a pantry champion to restock or log a purchase receipt.`,
        type: 'warning',
        confirmText: 'Got It'
      });
      return;
    }

    // Check spending limit / credit ceiling
    const targetMember = activePool.members.find(
      (m) => m.id === targetUserId || (m as any).userId === targetUserId || (m as any).user_id === targetUserId
    );
    const maxDeficit = activePool.maxDeficit !== undefined ? Number(activePool.maxDeficit) : 10.00;
    const currentBalance = targetMember ? targetMember.balance : (activeUser?.balance ?? 0);
    const prospectiveBalance = currentBalance - itemToConsume.costPerUnit;

    if (maxDeficit >= 0 && prospectiveBalance < -maxDeficit - 0.0001) {
      telemetry.trackRoadblock('spending_limit_blocked', {
        item_id: itemToConsume.id,
        item_name: itemToConsume.name,
        user_id: targetUserId,
        current_balance: currentBalance,
        cost_per_unit: itemToConsume.costPerUnit,
        max_deficit: maxDeficit,
      });
      if (soundEnabled) playAlertSound();
      const curr = activePool.currency || '$';
      setAlertDialog({
        isOpen: true,
        title: 'Spending Limit Reached 🛑',
        message: maxDeficit === 0
          ? `This pool operates in strict pre-paid mode. Taking "${itemToConsume.name}" requires ${curr}${itemToConsume.costPerUnit.toFixed(2)}, but your balance is ${curr}${currentBalance.toFixed(2)}. Please top up to proceed.`
          : `Taking "${itemToConsume.name}" would drop your balance to -${curr}${Math.abs(prospectiveBalance).toFixed(2)}, exceeding the pool credit ceiling (-${curr}${maxDeficit.toFixed(2)}). Please settle your deficit before grabbing more items.`,
        type: 'warning',
        confirmText: 'Settle Up / Top Up',
        cancelText: 'Cancel',
        onConfirm: () => {
          setIsSettleUpOpen(true);
        }
      });
      return;
    }

    telemetry.trackFeature('item_consumed', {
      item_id: itemToConsume.id,
      item_name: itemToConsume.name,
      category: itemToConsume.category,
      cost_per_unit: itemToConsume.costPerUnit,
      is_kiosk: Boolean(isKioskOpen),
    });

    // Sound
    if (soundEnabled) playConsumeSound();

    // Snapshots for rollback
    const prevItems = items;
    const prevPools = pools;
    const prevTransactions = transactions;

    // 1. Optimistically update item stock immediately with functional updater & persist
    setItems((currentItems) => {
      const updated = currentItems.map((i) =>
        i.id === targetItemId ? { ...i, stock: Math.max(0, i.stock - 1) } : i
      );
      saveItems(updated);
      return updated;
    });

    // 2. Optimistically update user balance in pools state & persist
    let newBalance = currentBalance - itemToConsume.costPerUnit;
    setPools((currentPools) => {
      const updated = currentPools.map((p) => {
        if (p.id === activePool.id) {
          let foundMember = false;
          const updatedMembers = p.members.map((m) => {
            if (
              m.id === targetUserId ||
              (m as any).userId === targetUserId ||
              (m as any).user_id === targetUserId
            ) {
              foundMember = true;
              newBalance = m.balance - itemToConsume.costPerUnit;
              return { ...m, balance: newBalance };
            }
            return m;
          });
          if (!foundMember && targetUserId) {
            newBalance = (activeUser?.balance ?? 0) - itemToConsume.costPerUnit;
            updatedMembers.push({
              ...activeUser,
              id: targetUserId,
              balance: newBalance,
            });
          }
          return { ...p, members: updatedMembers };
        }
        return p;
      });
      savePools(updated);
      return updated;
    });

    // 3. Optimistically add transaction entry & persist
    const targetUser = activePool.members.find(
      (m) => m.id === targetUserId || (m as any).userId === targetUserId || (m as any).user_id === targetUserId
    ) || activeUser;
    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      poolId: activePool.id,
      userId: targetUserId,
      type: 'consumption',
      amount: -itemToConsume.costPerUnit,
      itemId: itemToConsume.id,
      itemName: itemToConsume.name,
      quantity: 1,
      timestamp: new Date().toISOString(),
      note: `Single-tap log on ${itemToConsume.name}`,
      createdByName: targetUser.name,
      resultingBalance: newBalance,
    };
    setTransactions((currentTxs) => {
      const updated = [newTx, ...currentTxs];
      saveTransactions(updated);
      return updated;
    });

    // 4. Show friendly confirmation dialog only when explicitly requested
    if (showConfirmation) {
      setAlertDialog({
        isOpen: true,
        title: `Enjoy your ${itemToConsume.name}! 🎉`,
        message: 'Thanks for using PantryPool!',
        type: 'success',
        confirmText: 'Got It'
      });
    }

    // 5. Sync with backend – rollback on failure, or sync authoritative server stock directly
    consumeItemApi(activePool.id, itemToConsume.id, targetUserId, 1).then((res: any) => {
      if (res?.success) {
        const serverStock = typeof res.remainingStock === 'number' ? res.remainingStock : (typeof res.newStock === 'number' ? res.newStock : undefined);
        if (serverStock !== undefined) {
          setItems((currentItems) => {
            const updated = currentItems.map((i) =>
              i.id === targetItemId ? { ...i, stock: serverStock } : i
            );
            saveItems(updated);
            return updated;
          });
        }
        const serverBalance = typeof res.remainingBalance === 'number' ? res.remainingBalance : (typeof res.newBalance === 'number' ? res.newBalance : undefined);
        if (serverBalance !== undefined) {
          setPools((currentPools) => {
            const updated = currentPools.map((p) => {
              if (p.id === activePool.id) {
                const updatedMembers = p.members.map((m) => {
                  if (
                    m.id === targetUserId ||
                    (m as any).userId === targetUserId ||
                    (m as any).user_id === targetUserId
                  ) {
                    return { ...m, balance: serverBalance };
                  }
                  return m;
                });
                return { ...p, members: updatedMembers };
              }
              return p;
            });
            savePools(updated);
            return updated;
          });
        }
      } else {
        setItems(prevItems);
        saveItems(prevItems);
        setPools(prevPools);
        savePools(prevPools);
        setTransactions(prevTransactions);
        saveTransactions(prevTransactions);
        if (res?.spendingBlocked) {
          if (soundEnabled) playAlertSound();
          setAlertDialog({
            isOpen: true,
            title: 'Spending Limit Reached 🛑',
            message: res.error || 'Your balance deficit exceeds the allowed credit ceiling for this pool. Please top up or settle up.',
            type: 'warning',
            confirmText: 'Settle Up Now',
            cancelText: 'Cancel',
            onConfirm: () => {
              setIsSettleUpOpen(true);
            }
          });
        } else {
          setAlertDialog({
            isOpen: true,
            title: 'Sync Error',
            message: res?.error || `Failed to record consumption of "${itemToConsume.name}" on the server. Please try again.`,
            type: 'error',
            confirmText: 'OK'
          });
        }
      }
    });
  };

  // Core Action: Record Deposit / Add Funds
  const handleRecordDeposit = (userId: string, amount: number, note: string) => {
    telemetry.trackFeature('deposit_recorded', { amount, note_length: note?.length || 0, user_id: userId });
    telemetry.trackFunnel('financial_velocity', 'deposit_completed', 2, { amount });

    if (soundEnabled) playDepositSound();

    // Snapshots for rollback
    const prevPools = pools;
    const prevTransactions = transactions;

    let newBalance = 0;
    const targetMember = activePool.members.find((m) => m.id === userId);
    const memberName = targetMember ? targetMember.name : 'Member';

    const updatedPools = pools.map((p) => {
      if (p.id === activePool.id) {
        const updatedMembers = p.members.map((m) => {
          if (m.id === userId) {
            newBalance = m.balance + amount;
            return { ...m, balance: newBalance };
          }
          return m;
        });
        return { ...p, members: updatedMembers };
      }
      return p;
    });
    setPools(updatedPools);

    // Immutable transaction
    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      poolId: activePool.id,
      userId: userId,
      type: 'contribution',
      amount: amount,
      timestamp: new Date().toISOString(),
      note: note || 'Contribution / Deposit',
      createdByName: memberName,
      resultingBalance: newBalance,
    };
    setTransactions([newTx, ...transactions]);

    // Sync with backend – rollback on failure
    addDepositApi(activePool.id, userId, amount, note).then((res) => {
      if (res?.success) {
        refreshActivePoolData(activePool.id);
      } else {
        setPools(prevPools);
        setTransactions(prevTransactions);
        setAlertDialog({
          isOpen: true,
          title: 'Sync Error',
          message: `Failed to record deposit of ${activePool.currency}${amount.toFixed(2)} on the server. Please try again.`,
          type: 'error',
          confirmText: 'OK'
        });
      }
    });
  };

  // Core Action: Quick Restock
  const handleQuickRestock = async (itemToRestock: Item, addCount: number) => {
    if (soundEnabled) playDepositSound();

    const prevItems = items;
    const newStock = itemToRestock.stock + addCount;
    const updatedItems = items.map((i) => {
      if (i.id === itemToRestock.id) {
        return { ...i, stock: newStock, lastRestockedAt: new Date().toISOString() };
      }
      return i;
    });
    setItems(updatedItems);
    saveItems(updatedItems);

    try {
      const res = await saveItemApi({
        id: itemToRestock.id,
        poolId: activePool.id,
        name: itemToRestock.name,
        category: itemToRestock.category,
        stock: newStock,
        minStock: itemToRestock.minStock,
        costPerUnit: itemToRestock.costPerUnit,
        imageUrl: itemToRestock.imageUrl,
      });
      if (!res?.success) {
        setItems(prevItems);
        saveItems(prevItems);
        setAlertDialog({ isOpen: true, title: 'Sync Error', message: `Failed to save restock for "${itemToRestock.name}" on the server. Please try again.`, type: 'error', confirmText: 'OK' });
      }
    } catch (e) {
      setItems(prevItems);
      saveItems(prevItems);
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to save restock. Please check your connection.', type: 'error', confirmText: 'OK' });
    }
  };

  // Core Action: Save/Edit Item
  const handleSaveItem = async (itemData: Omit<Item, 'id' | 'poolId'>, editItemId?: string, creditAmount?: number) => {
    const prevItems = items;
    let savedItem: Item;
    if (editItemId) {
      const existing = items.find((i) => i.id === editItemId);
      savedItem = {
        ...(existing || {}),
        ...itemData,
        id: editItemId,
        poolId: activePool.id,
      } as Item;
      const updated = items.map((i) => (i.id === editItemId ? savedItem : i));
      setItems(updated);
      saveItems(updated);
    } else {
      savedItem = {
        ...itemData,
        id: `item-${Date.now()}`,
        poolId: activePool.id,
        lastRestockedAt: new Date().toISOString(),
      };
      const updated = [savedItem, ...items];
      setItems(updated);
      saveItems(updated);

      // If user contributed initial inventory stock out of pocket, credit their member balance
      if (creditAmount && creditAmount > 0) {
        handleRecordDeposit(
          activeUser.id,
          creditAmount,
          `Initial stock: ${savedItem.name} (${savedItem.stock} @ ${activePool.currency}${savedItem.costPerUnit.toFixed(2)})`
        );
      }
    }

    try {
      const res = await saveItemApi({
        id: savedItem.id,
        poolId: activePool.id,
        name: savedItem.name,
        category: savedItem.category,
        stock: savedItem.stock,
        minStock: savedItem.minStock,
        costPerUnit: savedItem.costPerUnit,
        unitName: savedItem.unitName,
        icon: savedItem.icon,
        description: savedItem.description,
        barcode: (savedItem as any).barcode,
        imageUrl: savedItem.imageUrl,
        vendingBenchmarkCents: savedItem.vendingBenchmarkCents,
      });
      if (!res?.success) {
        setItems(prevItems);
        saveItems(prevItems);
        setAlertDialog({ isOpen: true, title: 'Sync Error', message: `Failed to save "${savedItem.name}" to the server. Please try again.`, type: 'error', confirmText: 'OK' });
      }
    } catch (e) {
      setItems(prevItems);
      saveItems(prevItems);
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to save item. Please check your connection.', type: 'error', confirmText: 'OK' });
    }
  };

  // Core Action: Delete Item from Catalog
  const handleDeleteItem = async (itemId: string) => {
    const prevItems = items;
    const deletedItem = items.find((i) => i.id === itemId);
    const updated = items.filter((i) => i.id !== itemId);
    setItems(updated);
    saveItems(updated);
    try {
      const res = await deleteItemApi(itemId);
      if (!res?.success) {
        setItems(prevItems);
        saveItems(prevItems);
        setAlertDialog({ isOpen: true, title: 'Sync Error', message: `Failed to delete "${deletedItem?.name || 'item'}" on the server. Please try again.`, type: 'error', confirmText: 'OK' });
      }
    } catch (e) {
      setItems(prevItems);
      saveItems(prevItems);
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to delete item. Please check your connection.', type: 'error', confirmText: 'OK' });
    }
  };

  // Core Action: Record Stock Discrepancy (Unlogged Takes, Visitor Grabs, Recounts)
  const handleSubmitDiscrepancy = async (data: {
    itemId: string;
    actualStock: number;
    delta: number;
    reason: DiscrepancyReason;
    notes?: string;
  }) => {
    if (soundEnabled) playAlertSound();

    const targetItem = items.find((i) => i.id === data.itemId);
    if (!targetItem) return;

    const prevItems = items;
    const prevTransactions = transactions;
    const prevStock = targetItem.stock;
    const updatedItems = items.map((i) => {
      if (i.id === data.itemId) {
        return { ...i, stock: data.actualStock };
      }
      return i;
    });
    setItems(updatedItems);
    saveItems(updatedItems);

    const reasonLabels: Record<string, string> = {
      forgot_to_log: 'Forgot to Log (Unlogged Take)',
      visitor_take: 'Visitor / Non-Member Take',
      damaged_expired: 'Damaged / Expired Item',
      audit_recount: 'Physical Count Recount',
      other: 'Count Adjustment',
    };
    const reasonText = reasonLabels[data.reason] || data.reason;
    const noteText = data.notes ? ` - Note: "${data.notes}"` : '';
    const description = `Stock count adjusted from ${prevStock} to ${data.actualStock} (${data.delta >= 0 ? '+' : ''}${data.delta} ${targetItem.unitName || 'units'}). Reason: ${reasonText}${noteText}`;

    const currentUserMember = activePool.members.find((m) => m.id === activeUser.id);
    const currentBalance = currentUserMember?.balance || 0;

    const auditTx: Transaction = {
      id: `tx-adj-${Date.now()}`,
      poolId: activePool.id,
      userId: activeUser.id,
      type: 'adjustment',
      amount: 0.00,
      itemId: targetItem.id,
      itemName: targetItem.name,
      quantity: data.delta,
      timestamp: new Date().toISOString(),
      note: description,
      createdByName: activeUser.name || 'Pool Member',
      resultingBalance: currentBalance,
    };

    setTransactions([auditTx, ...transactions]);

    try {
      const res = await reportDiscrepancyApi({
        poolId: activePool.id,
        itemId: data.itemId,
        actualStock: data.actualStock,
        reason: data.reason,
        notes: data.notes,
        userId: activeUser.id,
      });
      if (res?.success) {
        refreshActivePoolData(activePool.id);
      } else {
        setItems(prevItems);
        saveItems(prevItems);
        setTransactions(prevTransactions);
        setAlertDialog({ isOpen: true, title: 'Sync Error', message: 'Failed to record stock discrepancy on the server. Please try again.', type: 'error', confirmText: 'OK' });
      }
    } catch (e) {
      setItems(prevItems);
      saveItems(prevItems);
      setTransactions(prevTransactions);
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to save stock discrepancy. Please check your connection.', type: 'error', confirmText: 'OK' });
    }
  };

  // Core Action: Apply Restock / Parsed Receipt Data
  const handleApplyReceiptData = async (
    itemsParsed: { 
      id?: string; 
      name: string; 
      category: ItemCategory; 
      costPerUnit: number; 
      quantity: number;
      unitName?: string;
      barcode?: string;
      icon?: string;
    }[],
    totalAmount: number,
    storeName: string
  ) => {
    telemetry.trackFeature('receipt_restock_applied', {
      items_count: itemsParsed.length,
      total_amount: totalAmount,
      store_name: storeName,
      pool_id: activePool?.id,
    });
    telemetry.trackFunnel('receipt_restock_flow', 'applied', 3, { items_count: itemsParsed.length });

    if (soundEnabled) playDepositSound();

    // 1. Update/Add items to catalog
    let currentItems = [...items];
    const restockedNames: string[] = [];

    for (const p of itemsParsed) {
      // Find existing item by id first, then barcode, then exact name, then fuzzy name
      let existingIdx = -1;
      if (p.id) {
        existingIdx = currentItems.findIndex((i) => i.id === p.id && i.poolId === activePool.id);
      }
      if (existingIdx === -1 && p.barcode) {
        existingIdx = currentItems.findIndex(
          (i) => i.poolId === activePool.id && i.barcode && areBarcodesMatching(i.barcode, p.barcode)
        );
      }
      if (existingIdx === -1) {
        existingIdx = currentItems.findIndex(
          (i) => i.poolId === activePool.id && i.name.toLowerCase() === p.name.toLowerCase()
        );
      }
      if (existingIdx === -1) {
        existingIdx = currentItems.findIndex(
          (i) => i.poolId === activePool.id && (
            i.name.toLowerCase().includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().includes(i.name.toLowerCase())
          )
        );
      }

      if (existingIdx >= 0) {
        const existing = currentItems[existingIdx];
        const addedQty = p.quantity;
        const purchaseCost = p.costPerUnit > 0 ? p.costPerUnit : existing.costPerUnit;

        // Weighted moving average blended unit price
        const blendedCostPerUnit = calculateMovingAveragePrice(
          existing.stock,
          existing.costPerUnit,
          addedQty,
          purchaseCost
        );

        const updatedItem = {
          ...existing,
          stock: existing.stock + addedQty,
          costPerUnit: blendedCostPerUnit,
          lastRestockedAt: new Date().toISOString(),
          barcode: existing.barcode || p.barcode || undefined,
          unitName: existing.unitName || p.unitName || 'unit',
        };
        currentItems[existingIdx] = updatedItem;
        restockedNames.push(`${updatedItem.name} (+${addedQty})`);
        await saveItemApi({
          id: updatedItem.id,
          poolId: activePool.id,
          name: updatedItem.name,
          category: updatedItem.category,
          stock: updatedItem.stock,
          minStock: updatedItem.minStock,
          costPerUnit: updatedItem.costPerUnit,
          imageUrl: updatedItem.imageUrl,
          barcode: updatedItem.barcode,
          unitName: updatedItem.unitName,
        });
      } else {
        const newItem: Item = {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          poolId: activePool.id,
          name: p.name,
          category: p.category,
          costPerUnit: p.costPerUnit,
          stock: p.quantity,
          minStock: Math.max(3, Math.floor(p.quantity / 2)),
          unitName: p.unitName || 'unit',
          icon: p.icon || (p.category === 'Beverages' ? 'CupSoda' : 'Package'),
          description: `Restocked from ${storeName}`,
          lastRestockedAt: new Date().toISOString(),
          barcode: p.barcode,
        };
        currentItems.unshift(newItem);
        restockedNames.push(`${newItem.name} (+${p.quantity})`);
        await saveItemApi({
          id: newItem.id,
          poolId: activePool.id,
          name: newItem.name,
          category: newItem.category,
          stock: newItem.stock,
          minStock: newItem.minStock,
          costPerUnit: newItem.costPerUnit,
          barcode: newItem.barcode,
          unitName: newItem.unitName,
          icon: newItem.icon,
        });
      }
    }
    setItems(currentItems);
    saveItems(currentItems);

    // 2. Credit active user balance for spending their own cash
    if (totalAmount > 0) {
      const summaryText = restockedNames.length > 0
        ? restockedNames.slice(0, 3).join(', ') + (restockedNames.length > 3 ? ` +${restockedNames.length - 3} more` : '')
        : 'Pantry items';

      handleRecordDeposit(
        activeUser.id,
        totalAmount,
        `Restock: ${summaryText} (${storeName})`
      );
    }
  };

  // Core Action: Restock from Shopping List
  const handleExecuteRestockFromList = async (purchasedItems: ShoppingListItem[]) => {
    const totalSpent = purchasedItems.reduce((acc, curr) => acc + curr.estimatedCost * curr.quantity, 0);

    let currentItems = [...items];
    for (const shopItem of purchasedItems) {
      const existingIdx = currentItems.findIndex(
        (i) => i.poolId === activePool.id && i.name.toLowerCase() === shopItem.itemName.toLowerCase()
      );

      if (existingIdx >= 0) {
        const existing = currentItems[existingIdx];
        const addedQty = shopItem.quantity;
        const purchasePrice = shopItem.estimatedCost > 0 ? shopItem.estimatedCost : existing.costPerUnit;
        const blendedCost = calculateMovingAveragePrice(
          existing.stock,
          existing.costPerUnit,
          addedQty,
          purchasePrice
        );

        const updatedItem = {
          ...existing,
          stock: existing.stock + addedQty,
          costPerUnit: blendedCost,
          lastRestockedAt: new Date().toISOString(),
        };
        currentItems[existingIdx] = updatedItem;
        await saveItemApi({
          id: updatedItem.id,
          poolId: activePool.id,
          name: updatedItem.name,
          category: updatedItem.category,
          stock: updatedItem.stock,
          minStock: updatedItem.minStock,
          costPerUnit: updatedItem.costPerUnit,
        });
      } else {
        const newItem: Item = {
          id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          poolId: activePool.id,
          name: shopItem.itemName,
          category: shopItem.category,
          costPerUnit: shopItem.estimatedCost,
          stock: shopItem.quantity,
          minStock: 5,
          unitName: 'unit',
          icon: 'Package',
          lastRestockedAt: new Date().toISOString(),
        };
        currentItems.unshift(newItem);
        await saveItemApi({
          id: newItem.id,
          poolId: activePool.id,
          name: newItem.name,
          category: newItem.category,
          stock: newItem.stock,
          minStock: newItem.minStock,
          costPerUnit: newItem.costPerUnit,
        });
      }

      await deleteShoppingItemApi(activePool.id, shopItem.id);
    }
    setItems(currentItems);

    // Credit buyer
    handleRecordDeposit(activeUser.id, totalSpent, 'Shopping List Restock');

    // Clear purchased from shopping list
    const remainingShopping = shoppingList.filter((s) => !purchasedItems.some((p) => p.id === s.id));
    setShoppingList(remainingShopping);
  };

  // Add Item to Shopping List
  const handleAddShoppingItem = async (
    itemName: string,
    category: ItemCategory,
    estimatedCost: number,
    quantity: number,
    reason: string
  ) => {
    try {
      const res = await addShoppingItemApi(activePool.id, {
        itemName,
        category,
        estimatedCost,
        quantity,
        reason,
      });
      if (res.success && res.item) {
        setShoppingList([res.item, ...shoppingList]);
        return;
      }
    } catch (e) {
      console.warn('[Add Shopping Item Error]', e);
    }

    const newShopping: ShoppingListItem = {
      id: `shop-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      poolId: activePool.id,
      itemName,
      category,
      suggestedBy: activeUser.name,
      estimatedCost,
      quantity,
      purchased: false,
      reason,
      createdAt: new Date().toISOString(),
    };
    setShoppingList([newShopping, ...shoppingList]);
  };

  const handleTogglePurchased = async (id: string) => {
    const target = shoppingList.find((s) => s.id === id);
    if (!target) return;
    const newStatus = !target.purchased;
    const updated = shoppingList.map((s) => s.id === id ? { ...s, purchased: newStatus } : s);
    setShoppingList(updated);
    try {
      await updateShoppingItemApi(activePool.id, id, { purchased: newStatus });
    } catch (e) {
      console.warn('[Update Shopping Item Error]', e);
    }
  };

  const handleDeleteShoppingItem = async (id: string) => {
    setShoppingList(shoppingList.filter((s) => s.id !== id));
    try {
      await deleteShoppingItemApi(activePool.id, id);
    } catch (e) {
      console.warn('[Delete Shopping Item Error]', e);
    }
  };

  const handleClearShoppingList = async () => {
    const itemsToDelete = shoppingList.filter((s) => s.poolId === activePool.id);
    setShoppingList(shoppingList.filter((s) => s.poolId !== activePool.id));
    for (const item of itemsToDelete) {
      try {
        await deleteShoppingItemApi(activePool.id, item.id);
      } catch (e) {
        // Ignore individual deletion errors during batch clear
      }
    }
  };

  // Create New Pool
  const handleCreatePool = async (
    name: string,
    description: string,
    category: 'Office' | 'Home / Apartment' | 'Club / Group' | 'Co-Working',
    currency: string,
    initialSeed: number,
    organizationId?: string | null
  ) => {
    try {
      const res = await createPoolApi(
        name,
        category,
        currency,
        organizationId || null,
        description,
        authUser?.id || activeUser.id
      );

      const newPoolId = res.poolId || res.pool?.id;
      if (res.success && newPoolId) {
        const apiPools = await fetchPools(organizationId || activeOrgId || undefined);
        if (apiPools && apiPools.length > 0) {
          setPools(apiPools as any);
        } else {
          const newPoolCode = resolvePoolCode(res.pool) || res.code || res.qrCodeKey || (newPoolId?.startsWith('pool_') && newPoolId.length > 10 ? newPoolId.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : `PP${Math.floor(1000 + Math.random() * 9000)}`);
          const currentUserId = authUser?.id || activeUser.id;
          const newPool: Pool = {
            id: newPoolId,
            name,
            description: description || '',
            code: newPoolCode,
            currency,
            organizationId: organizationId || undefined,
            championId: currentUserId,
            category,
            createdAt: new Date().toISOString(),
            initialReserveFund: initialSeed,
            members: [
              {
                ...activeUser,
                id: currentUserId,
                role: 'champion',
                balance: initialSeed,
              },
            ],
          };
          setPools([...pools, newPool]);
        }

        if (organizationId) {
          setActiveOrgId(organizationId);
        }
        setActivePoolId(newPoolId);
        return;
      }

      if (res.upgradeRequired) {
        setAlertDialog({
          isOpen: true,
          title: 'Organization Pool Limit Reached',
          message: res.error || 'Please upgrade your organization tier to create more pantry pools.',
          type: 'warning',
          confirmText: 'View Upgrade Plans',
          onConfirm: () => {
            setIsAdminOpen(true);
          }
        });
        return;
      }

      if (res.error) {
        setAlertDialog({
          isOpen: true,
          title: 'Failed to Create Pool',
          message: res.error,
          type: 'error'
        });
      }
    } catch (e: any) {
      console.error('[Create Pool Error]', e);
    }
  };
  // Member role update from MembersBalanceList
  const handleMemberRoleUpdated = (userId: string, newRole: string) => {
    setPools(prev => prev.map(p => {
      if (p.id !== activePool?.id) return p;
      return {
        ...p,
        members: p.members.map(m => m.id === userId ? { ...m, role: newRole as any } : m)
      };
    }));
  };

  // Member removal from MembersBalanceList
  const handleMemberRemoved = (userId: string) => {
    setPools(prev => prev.map(p => {
      if (p.id !== activePool?.id) return p;
      return { ...p, members: p.members.filter(m => m.id !== userId) };
    }));
  };

  // Refund / void a transaction (Fix 24.5)
  const handleRefundTransaction = async (tx: Transaction) => {
    const prevTransactions = transactions;
    const prevPools = pools;
    const prevItems = items;

    // Optimistically update member balance and item stock immediately
    const origAmount = Math.abs(Number(tx.amount || 0));
    const txType = (tx.type as string) || '';
    const isConsume = txType === 'consume' || txType === 'consumption';
    const isDeposit = txType === 'deposit' || txType === 'contribution';
    const balanceDelta = isConsume ? origAmount : isDeposit ? -origAmount : -Number(tx.amount || 0);

    setPools(prev => prev.map(p => {
      if (p.id !== activePool?.id) return p;
      return {
        ...p,
        members: p.members.map(m => {
          if (m.id === tx.userId) {
            return { ...m, balance: m.balance + balanceDelta };
          }
          return m;
        })
      };
    }));

    if (tx.itemId && isConsume) {
      const qty = tx.quantity || 1;
      setItems(prev => prev.map(i => {
        if (i.id === tx.itemId) {
          return { ...i, stock: i.stock + qty };
        }
        return i;
      }));
    }

    try {
      const res = await refundTransactionApi(tx.id);
      if (res.success) {
        // Re-sync all pool reserves, balances, catalog items, and audit transactions from backend
        await refreshActivePoolData(activePool?.id);
        setAlertDialog({
          isOpen: true,
          title: 'Transaction Voided',
          message: 'The transaction has been successfully refunded. Member balance, pool reserve, and item stock have been refreshed.',
          type: 'success',
          confirmText: 'Done'
        });
      } else {
        setPools(prevPools);
        setItems(prevItems);
        setTransactions(prevTransactions);
        setAlertDialog({
          isOpen: true,
          title: 'Refund Failed',
          message: res.error || 'Failed to process refund. Please try again.',
          type: 'error',
          confirmText: 'OK'
        });
      }
    } catch (e) {
      setPools(prevPools);
      setItems(prevItems);
      setTransactions(prevTransactions);
      setAlertDialog({
        isOpen: true,
        title: 'Connection Error',
        message: 'Unable to reach the server to void this transaction. Please try again.',
        type: 'error',
        confirmText: 'OK'
      });
    }
  };

  // Join Organization with Invite Code or Link
  const handleJoinOrganization = async (codeOrLink: string) => {
    const cleanCode = extractJoinCode(codeOrLink);
    if (!cleanCode) return;
    try {
      setIsLoadingPools(true);
      const res = await joinOrganizationApi(cleanCode);
      if (res.success && res.organization) {
        const orgs = await fetchOrganizationsApi(authUser?.id);
        setOrganizations(orgs.length > 0 ? orgs : [res.organization, ...organizations]);
        setActiveOrgId(res.organization.id);
        const orgPools = await fetchPools(res.organization.id);
        if (orgPools && orgPools.length > 0) {
          setPools(orgPools as any);
          setActivePoolId(orgPools[0].id);
        }
        setAlertDialog({
          isOpen: true,
          title: '🎉 Workspace Joined!',
          message: `You've successfully joined "${res.organization.name}". You now have access to its breakrooms and pantries.`,
          type: 'success',
          confirmText: 'Get Started'
        });
        return;
      }
      setAlertDialog({
        isOpen: true,
        title: 'Unable to Join Workspace',
        message: res.error || `No workspace found matching "${cleanCode}". Please verify the invite code with your workspace admin.`,
        type: 'error',
        confirmText: 'OK'
      });
    } catch (e: any) {
      setAlertDialog({
        isOpen: true,
        title: 'Connection Error',
        message: e?.message || 'Unable to reach the server right now. Please try again.',
        type: 'error',
        confirmText: 'OK'
      });
    } finally {
      setIsLoadingPools(false);
    }
  };

  // Join Pool with Code or Share Link
  const handleJoinPool = async (codeOrLink: string, options?: { silent?: boolean }) => {
    const cleanCode = extractJoinCode(codeOrLink);
    if (!cleanCode) return;

    if (cleanCode.startsWith('ORG_') && isOrganizationsEnabled) {
      return handleJoinOrganization(cleanCode);
    }

    // Check if the user is already a member of this pool locally
    const existingPool = pools.find(
      (p) => p.id === cleanCode || (p.code && p.code.toUpperCase() === cleanCode.toUpperCase())
    );
    if (existingPool) {
      if (activePoolId !== existingPool.id) {
        setActivePoolId(existingPool.id);
      }
      if (options?.silent) return;
      setAlertDialog({
        isOpen: true,
        title: 'Already a Member',
        message: `You are already a member of "${existingPool.name}".`,
        type: 'info',
        confirmText: 'OK'
      });
      return;
    }

    try {
      const res = await joinPoolApi(cleanCode);
      if (res.success && res.poolId) {
        const apiPools = await fetchPools(activeOrgId || undefined);
        if (apiPools.length > 0) {
          setPools(apiPools as any);
        }
        setActivePoolId(res.poolId);
        if (!options?.silent) {
          setAlertDialog({
            isOpen: true,
            title: '🎉 Pool Joined!',
            message: `You've successfully joined "${res.name || 'the team pool'}". You can now log consumption, add items, and track balances.`,
            type: 'success',
            confirmText: 'Get Started'
          });
        }
        return;
      }

      // Check if user is already a member according to server response
      if (!res.success && res.error && res.error.toLowerCase().includes('already a member')) {
        const apiPools = await fetchPools(activeOrgId || undefined);
        if (apiPools.length > 0) {
          setPools(apiPools as any);
        }
        if (options?.silent) return;
        setAlertDialog({
          isOpen: true,
          title: 'Already a Member',
          message: 'You are already a member of this pantry pool.',
          type: 'info',
          confirmText: 'OK'
        });
        return;
      }

      // Check if this was an organization invite code entered into the join box
      if (isOrganizationsEnabled) {
        const orgRes = await joinOrganizationApi(cleanCode);
        if (orgRes.success && orgRes.organization) {
          const orgs = await fetchOrganizationsApi(authUser?.id);
          setOrganizations(orgs.length > 0 ? orgs : [orgRes.organization, ...organizations]);
          setActiveOrgId(orgRes.organization.id);
          const orgPools = await fetchPools(orgRes.organization.id);
          if (orgPools && orgPools.length > 0) {
            setPools(orgPools as any);
            setActivePoolId(orgPools[0].id);
          }
          if (!options?.silent) {
            setAlertDialog({
              isOpen: true,
              title: '🎉 Workspace Joined!',
              message: `You've successfully joined "${orgRes.organization.name}". You now have access to its breakrooms and pantries.`,
              type: 'success',
              confirmText: 'Get Started'
            });
          }
          return;
        }
      }

      if (options?.silent) return;

      // Server returned a non-success result – show user-facing error
      setAlertDialog({
        isOpen: true,
        title: res.upgradeRequired ? 'Member Limit Reached' : 'Unable to Join Pool',
        message: res.error || `No pantry pool found matching "${cleanCode}". Please verify the invite link or code with your pantry manager and try again.`,
        type: res.upgradeRequired ? 'warning' : 'error',
        confirmText: 'OK'
      });
    } catch (e) {
      if (options?.silent) return;
      setAlertDialog({
        isOpen: true,
        title: 'Connection Error',
        message: 'Unable to reach the PantryPool server right now. Please check your internet connection and try again.',
        type: 'error',
        confirmText: 'OK'
      });
    }
  };

  // QR Scanner Pool Handler
  const handleScanPoolCode = (code: string) => {
    handleJoinPool(code);
  };

  // QR Scanner Item Handler
  const handleScanItem = (item: Item) => {
    // Automatically log consumption of 1 unit of this item
    handleConsumeItem(item, activeUser.id);
  };

  // Update Pool Settings
  const handleUpdatePool = async (updatedData: Partial<Pool> & { kioskPin?: string }) => {
    const prevPools = pools;
    const updated = pools.map((p) => {
      if (p.id === activePool.id) {
        return { ...p, ...updatedData };
      }
      return p;
    });
    setPools(updated);
    try {
      const res = await updatePoolApi(activePool.id, updatedData);
      if (res && res.success === false) {
        setPools(prevPools);
        setAlertDialog({
          isOpen: true,
          title: 'Update Failed',
          message: res.error || 'Failed to update pool settings on server.',
          type: 'error',
          confirmText: 'OK',
        });
        return false;
      }
      if (res && res.success && res.pool) {
        const poolWithCode = {
          ...res.pool,
          code: res.pool.code || res.pool.qrCodeKey || res.pool.qr_code_key || updatedData.code,
          qrCodeKey: res.pool.qrCodeKey || res.pool.qr_code_key || updatedData.code,
        };
        setPools((current) => current.map((p) => p.id === activePool.id ? { ...p, ...poolWithCode } : p));
      }
      return true;
    } catch (e: any) {
      console.warn('[Update Pool Error]', e);
      setPools(prevPools);
      setAlertDialog({
        isOpen: true,
        title: 'Error',
        message: e?.message || 'An unexpected error occurred while updating pool settings.',
        type: 'error',
        confirmText: 'OK',
      });
      return false;
    }
  };

  const handleDeletePool = async (poolId: string) => {
    const targetPool = pools.find((p) => p.id === poolId) || activePool;
    const canDelete = Boolean(
      targetPool && activeUser && (
        activeUser.id === targetPool.championId ||
        activeUser.role === 'champion' ||
        activeUser.role === 'admin' ||
        targetPool.members?.find((m) => m.id === activeUser.id)?.role === 'champion' ||
        targetPool.members?.find((m) => m.id === activeUser.id)?.role === 'admin' ||
        authUser?.systemRole === 'superadmin' ||
        authUser?.systemRole === 'admin'
      )
    );

    if (!canDelete) {
      setAlertDialog({
        isOpen: true,
        title: 'Permission Denied',
        message: 'Only a pool manager or champion can delete this pantry pool.',
        type: 'error',
        confirmText: 'OK',
      });
      return;
    }

    const prevPools = pools;
    const remaining = pools.filter((p) => p.id !== poolId);
    setPools(remaining);
    if (activePoolId === poolId && remaining.length > 0) {
      setActivePoolId(remaining[0].id);
    }
    try {
      const res = await deletePoolApi(poolId);
      if (res && res.success === false) {
        setPools(prevPools);
        setAlertDialog({
          isOpen: true,
          title: 'Delete Pool Failed',
          message: res.error || 'Failed to delete pool. Only pool managers have deletion permissions.',
          type: 'error',
          confirmText: 'OK',
        });
      }
    } catch (e: any) {
      setPools(prevPools);
      setAlertDialog({
        isOpen: true,
        title: 'Delete Pool Error',
        message: e?.message || 'An error occurred while deleting the pool.',
        type: 'error',
        confirmText: 'OK',
      });
    }
  };

  // Poll Voting & Write-In Submission
  const handleVotePoll = async (pollId: string, optionId?: string, userId?: string, writeInOption?: string) => {
    if (!activePool?.id) return;
    const prevPolls = [...polls];
    const voterId = userId || authUser?.id || activeUser.id;

    // Optimistic UI update
    const updatedPolls = polls.map((p) => {
      if (p.id === pollId) {
        let options = Array.isArray(p.options) ? [...p.options] : [];
        let targetOptId = optionId;
        if (writeInOption && writeInOption.trim()) {
          const cleanName = writeInOption.trim();
          const existing = options.find(o => o.name.toLowerCase() === cleanName.toLowerCase());
          if (existing) {
            targetOptId = existing.id;
          } else {
            targetOptId = `opt_writein_${Date.now()}`;
            options.push({
              id: targetOptId,
              name: cleanName,
              votes: [],
              isWriteIn: true
            });
          }
        }
        const updatedOptions = options.map((opt) => {
          // Remove vote if already voted elsewhere
          const cleanedVotes = (opt.votes || []).filter((id) => String(id) !== String(voterId));
          if (opt.id === targetOptId) {
            return { ...opt, votes: [...cleanedVotes, String(voterId)] };
          }
          return { ...opt, votes: cleanedVotes };
        });
        return { ...p, options: updatedOptions };
      }
      return p;
    });
    setPolls(updatedPolls);
    savePolls(updatedPolls);
    try {
      const res = await votePollApi(activePool.id, pollId, optionId, writeInOption, voterId);
      if (res?.success && res.options) {
        setPolls(prev => {
          const next = prev.map(p => p.id === pollId ? { ...p, options: res.options } : p);
          savePolls(next);
          return next;
        });
      } else if (!res?.success) {
        setPolls(prevPolls);
        savePolls(prevPolls);
        setAlertDialog({ isOpen: true, title: 'Vote Error', message: res?.error || 'Failed to record your vote on the server. Please try again.', type: 'error', confirmText: 'OK' });
      }
    } catch (e) {
      try {
        const { enqueueOfflineAction } = await import('../lib/offlineQueue');
        enqueueOfflineAction('vote_poll', { poolId: activePool.id, pollId, optionId, writeInOption, userId: voterId });
      } catch (queueErr) {
        setPolls(prevPolls);
        savePolls(prevPolls);
        setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to submit vote. Please check your connection.', type: 'error', confirmText: 'OK' });
      }
    }
  };

  const handleCreatePoll = async (title: string, options: string[], allowWriteIn = true) => {
    if (!activePool?.id) {
      setAlertDialog({ isOpen: true, title: 'Poll Creation Failed', message: 'No active pool selected.', type: 'error', confirmText: 'OK' });
      return;
    }
    try {
      const res = await createPollApi(activePool.id, title, options, allowWriteIn);
      if (res.success && res.poll) {
        const normalizedPoll: PollItem = {
          id: res.poll.id,
          poolId: res.poll.poolId || res.poll.pool_id || activePool.id,
          title: res.poll.title,
          status: res.poll.status || 'active',
          options: Array.isArray(res.poll.options) ? res.poll.options : [],
          createdBy: res.poll.createdBy || res.poll.created_by || activeUser?.name || 'Pool Member',
          createdAt: res.poll.createdAt || res.poll.created_at || new Date().toISOString(),
          allowWriteIn: res.poll.allowWriteIn !== false
        };
        setPolls(prev => {
          const next = [normalizedPoll, ...prev.filter(p => p.id !== normalizedPoll.id)];
          savePolls(next);
          return next;
        });
        return;
      }
      setAlertDialog({ isOpen: true, title: 'Poll Creation Failed', message: res.error || 'Failed to create poll. Please try again.', type: 'error', confirmText: 'OK' });
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to create poll. Please check your connection.', type: 'error', confirmText: 'OK' });
    }
  };

  const handleUpdatePoll = async (pollId: string, updates: { title?: string; status?: 'active' | 'closed'; options?: any[] }) => {
    const prevPolls = [...polls];
    // Immediate optimistic update
    const optimisticPolls = polls.map((p) => {
      if (p.id !== pollId) return p;
      return {
        ...p,
        ...updates,
        status: updates.status || p.status,
      };
    });
    setPolls(optimisticPolls);
    savePolls(optimisticPolls);

    try {
      const res = await updatePollEndpointApi(activePool.id, pollId, updates);
      if (res.success && res.poll) {
        setPolls(prev => {
          const next = prev.map(p => {
            if (p.id !== pollId) return p;
            const resOpts = res.poll.options;
            const updatedOpts = (Array.isArray(resOpts) && resOpts.length > 0) ? resOpts : p.options;
            return {
              ...p,
              ...res.poll,
              poolId: res.poll.poolId || res.poll.pool_id || p.poolId,
              options: updatedOpts || [],
              status: res.poll.status || p.status,
              createdBy: res.poll.createdBy || res.poll.created_by || p.createdBy,
              createdAt: res.poll.createdAt || res.poll.created_at || p.createdAt,
              allowWriteIn: res.poll.allowWriteIn !== undefined ? res.poll.allowWriteIn : p.allowWriteIn
            };
          });
          savePolls(next);
          return next;
        });
        return { success: true };
      }
      setPolls(prevPolls);
      savePolls(prevPolls);
      setAlertDialog({ isOpen: true, title: 'Poll Update Failed', message: res.error || 'Failed to update poll.', type: 'error', confirmText: 'OK' });
      return { success: false, error: res.error };
    } catch (e) {
      setPolls(prevPolls);
      savePolls(prevPolls);
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to update poll.', type: 'error', confirmText: 'OK' });
      return { success: false, error: String(e) };
    }
  };

  const handleDeletePoll = async (pollId: string) => {
    try {
      const res = await deletePollEndpointApi(activePool.id, pollId);
      if (res.success) {
        setPolls(prev => {
          const next = prev.filter(p => p.id !== pollId);
          savePolls(next);
          return next;
        });
        return { success: true };
      }
      setAlertDialog({ isOpen: true, title: 'Poll Deletion Failed', message: res.error || 'Failed to delete poll.', type: 'error', confirmText: 'OK' });
      return { success: false, error: res.error };
    } catch (e) {
      setAlertDialog({ isOpen: true, title: 'Connection Error', message: 'Unable to reach the server to delete poll.', type: 'error', confirmText: 'OK' });
      return { success: false, error: String(e) };
    }
  };

  const handleOnboardingSuccess = async (result: { organization?: ApiOrganization | null; pool: any }) => {
    if (result.organization) {
      const org = result.organization;
      setOrganizations((prev) => [org, ...prev.filter(o => o.id !== org.id)]);
      setActiveOrgId(org.id);
      saveActiveOrgId(org.id);
    }
    if (result.pool) {
      const poolCode = resolvePoolCode(result.pool);
      const normalizedPool = {
        ...result.pool,
        code: poolCode,
        qrCodeKey: poolCode,
        members: [{
          id: authUser?.id || 'u_owner',
          name: authUser?.name || 'Champion',
          email: authUser?.email || '',
          avatar: authUser?.avatarUrl || getDefaultAvatarUrl(authUser?.name || 'C'),
          balance: 0,
          role: 'champion' as UserRole,
          joinedAt: new Date().toISOString()
        }]
      };
      setPools((prev) => [normalizedPool as any, ...prev.filter(p => p.id !== normalizedPool.id)]);
      setActivePoolId(normalizedPool.id);
      saveActivePoolId(normalizedPool.id);

      try {
        const poolItems = await fetchItems(normalizedPool.id);
        if (poolItems && Array.isArray(poolItems)) {
          const normalizedItems: Item[] = poolItems.map((i: any) => ({
            ...i,
            poolId: i.poolId || i.pool_id || normalizedPool.id,
            costPerUnit: Number(i.costPerUnit ?? i.cost_per_unit ?? 0),
            minStock: Number(i.minStock ?? i.min_stock ?? 5),
            unitName: i.unitName || i.unit_name || i.unit || 'unit',
          }));
          setItems(normalizedItems);
          saveItems(normalizedItems);
        }
      } catch (e) {
        console.warn('[Items Refresh Warning]', e);
      }
    }

    if (result.organization) {
      setAlertDialog({
        isOpen: true,
        title: 'Workspace Live & Ready!',
        message: `Your company workspace "${result.organization.name}" and first breakroom "${result.pool?.name || 'Pantry'}" are configured and ready. Invite your team or print your fridge QR poster to get started!`,
        type: 'success'
      });
    } else {
      setAlertDialog({
        isOpen: true,
        title: 'Pantry Live & Ready!',
        message: `Your breakroom pantry "${result.pool?.name || 'Pantry'}" is configured and ready. Add items or print your fridge QR poster to get started!`,
        type: 'success'
      });
    }
  };

  const currentOrg = organizations.find((o) => o.id === activeOrgId) || 
    (activePool?.organizationId ? organizations.find((o) => o.id === activePool.organizationId) : undefined);
  const isCompanyAccount = Boolean(currentOrg || (activeOrgId && activeOrgId !== ''));
  const isCompanyAdmin = Boolean(
    currentOrg && (
      currentOrg.ownerId === authUser?.id ||
      authUser?.systemRole === 'superadmin' ||
      authUser?.systemRole === 'admin' ||
      activeUser?.role === 'admin'
    )
  );

  const isPaidSubscriber = Boolean(
    authUser && (
      authUser.systemRole === 'superadmin' ||
      authUser.systemRole === 'admin' ||
      organizations.some((o) => (o.tier === 'standard' || o.tier === 'plus' || o.tier === 'pro' || o.tier === 'enterprise') && o.ownerId === authUser.id)
    )
  );

  const isOrgCreatorOrAdmin = Boolean(
    currentOrg &&
    authUser && (
      currentOrg.ownerId === authUser.id ||
      authUser.systemRole === 'superadmin' ||
      authUser.systemRole === 'admin'
    )
  );

  const handleDeleteActiveOrg = () => {
    if (!activeOrgId || !currentOrg) return;
    setAlertDialog({
      isOpen: true,
      title: 'Delete Company Workspace',
      message: `Are you sure you want to delete workspace "${currentOrg.name}"? For audit and compliance purposes, this workspace and its pantries will be archived. All transaction and ledger audit records will be preserved.`,
      type: 'confirm',
      confirmText: 'Archive Workspace',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await deleteOrganizationApi(activeOrgId);
          const updatedOrgs = organizations.filter(o => o.id !== activeOrgId);
          setOrganizations(updatedOrgs);
          saveCachedOrganizations(updatedOrgs);
          setActiveOrgId('');
          saveActiveOrgId('');
          const remainingPools = await fetchPools();
          if (remainingPools && remainingPools.length > 0) {
            setPools(remainingPools as any);
            savePools(remainingPools as any);
          }
        } catch (e: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Deletion Failed',
            message: e.message || 'Could not delete organization.',
            type: 'error'
          });
        }
      }
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#2D2D2D] flex flex-col font-sans selection:bg-[#FDF0EC] selection:text-[#E8694A]">
      {/* Global Application Header */}
      <Header
        pools={pools}
        activePool={activePool}
        organizations={isOrganizationsEnabled ? organizations : []}
        activeOrgId={activeOrgId}
        onSelectOrg={(orgId) => setActiveOrgId(orgId)}
        onOpenCreateOrg={isOrganizationsEnabled ? () => setIsCreateOrgOpen(true) : undefined}
        activeUser={activeUser}
        authUser={authUser}
        onOpenAuthModal={() => {
          setAuthModalMode('login');
          setIsAuthOpen(true);
        }}
        onLogout={handleLogoutWithCleanup}
        onSelectPool={handleSelectPool}
        onSelectUser={(userId) => setActiveUserId(userId)}
        onOpenCreatePool={() => setIsCreatePoolOpen(true)}
        onOpenKiosk={() => {
          if (!activePool) {
            setAlertDialog({
              isOpen: true,
              title: 'No Active Pantry',
              message: 'Please create or join a pantry pool before launching Kiosk Mode.',
              type: 'info',
              confirmText: 'Create Pool',
              onConfirm: () => setIsCreatePoolOpen(true),
            });
            return;
          }
          setIsKioskOpen(true);
        }}
        onOpenReceiptScanner={() => {
          if (!activePool) {
            setAlertDialog({
              isOpen: true,
              title: 'No Active Pantry',
              message: 'Please create or join a pantry pool before scanning receipts.',
              type: 'info',
              confirmText: 'Create Pool',
              onConfirm: () => setIsCreatePoolOpen(true),
            });
            return;
          }
          setIsReceiptOpen(true);
        }}
        onOpenQRScanner={() => {
          if (!activePool) {
            setAlertDialog({
              isOpen: true,
              title: 'No Active Pantry',
              message: 'Please create or join a pantry pool before scanning QR codes.',
              type: 'info',
              confirmText: 'Create Pool',
              onConfirm: () => setIsCreatePoolOpen(true),
            });
            return;
          }
          setIsQRScannerOpen(true);
        }}
        onOpenPoster={() => {
          if (!activePool) {
            setAlertDialog({
              isOpen: true,
              title: 'No Active Pantry',
              message: 'Please create or join a pantry pool before printing fridge posters.',
              type: 'info',
              confirmText: 'Create Pool',
              onConfirm: () => setIsCreatePoolOpen(true),
            });
            return;
          }
          setIsPosterOpen(true);
        }}
        onOpenNfc={() => {
          if (!activePool) {
            setAlertDialog({
              isOpen: true,
              title: 'No Active Pantry',
              message: 'Please create or join a pantry pool before setting up NFC tags.',
              type: 'info',
              confirmText: 'Create Pool',
              onConfirm: () => setIsCreatePoolOpen(true),
            });
            return;
          }
          setIsNfcOpen(true);
        }}
        onOpenWebhooks={
          isOrganizationsEnabled
            ? () => {
                if (isPaidSubscriber) {
                  setIsWebhooksOpen(true);
                } else {
                  setAlertDialog({
                    isOpen: true,
                    title: 'Hosted Standard Required',
                    message: 'Slack & Microsoft Teams 2-way bot integrations require a Hosted Standard ($5/mo) or Hosted Plus ($12/mo) subscription. Upgrade today to automate restock warnings and slash commands.',
                    type: 'warning',
                    confirmText: 'View Upgrade Plans',
                    onConfirm: () => setIsCreateOrgOpen(true),
                  });
                }
              }
            : undefined
        }
        onDeleteActiveOrg={isOrgCreatorOrAdmin && activeOrgId ? handleDeleteActiveOrg : undefined}
        isCompanyAccount={isCompanyAccount}
        isCompanyAdmin={isCompanyAdmin}
        isPaidSubscriber={isPaidSubscriber}
        currentOrgTier={currentOrg?.tier || 'standard'}
        kioskModeEnabled={kioskModeEnabled}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenAdminConsole={() => setIsAdminOpen(true)}
        onOpenNotifications={authUser ? () => setIsNotificationsOpen(true) : undefined}
        unreadNotificationCount={authUser ? notifications.filter(n => !n.isRead).length : 0}
        onOpenUserProfile={() => setIsUserProfileOpen(true)}
        onOpenLegal={handleOpenLegal}
        onOpenHelpGuide={() => setIsHelpGuideOpen(true)}
      />

      {/* Authenticated Workspace Views */}
      {isLoadingPools ? (
        <DashboardSkeleton />
      ) : (
        <>
        <Suspense fallback={<DashboardSkeleton />}>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-8 space-y-6">
        
        {!activePool ? (
          <div className="bg-white border border-[#E0DAD1] rounded-xl p-12 text-center max-w-lg mx-auto shadow-sm space-y-4 my-8">
            <Layers className="h-12 w-12 text-[#E8694A] mx-auto stroke-[1.5]" />
            <h2 className="text-xl font-semibold text-[#2D2D2D]">
              {activeOrgId && organizations.find(o => o.id === activeOrgId)
                ? `No Pantries in ${organizations.find(o => o.id === activeOrgId)?.name}`
                : 'No Pantry Pools Joined'}
            </h2>
            <p className="text-xs text-[#6B6B6B]">
              {activeOrgId && organizations.find(o => o.id === activeOrgId)
                ? `There are no breakrooms or supply pantries created in this workspace yet. Create your first pool to get started.`
                : 'You are not a member of any pantry pools yet. Create your first office breakroom or household pantry, or join an existing pool using an invite code.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsCreatePoolOpen(true)}
                className="px-5 py-2.5 bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium rounded-full transition shadow-xs cursor-pointer flex items-center gap-2"
              >
                <Coffee className="w-4 h-4" />
                <span>{activeOrgId ? 'Create Pool in Workspace' : 'Create Standalone Pantry'}</span>
              </button>
              {isOrganizationsEnabled && (!activeOrgId || organizations.length === 0) && (
                <button
                  onClick={() => setIsOnboardingOpen(true)}
                  className="px-5 py-2.5 bg-white hover:bg-[#FAF9F5] border border-[#E0DAD1] text-[#2D2D2D] text-xs font-medium rounded-full transition shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-[#E8694A]" />
                  <span>Company Workspace Setup</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
          {/* Champion Breakroom Launch Checklist */}
          {isCurrentPoolManager && activePool && (
            <OnboardingChecklist
              pool={activePool}
              items={items}
              isManager={isCurrentPoolManager}
              onOpenAddItem={() => {
                setEditingItem(null);
                setIsItemFormOpen(true);
              }}
              onOpenReceiptScanner={() => setIsReceiptOpen(true)}
              onOpenPrintPoster={() => setIsPosterOpen(true)}
              onOpenSharePool={() => setIsSharePoolOpen(true)}
            />
          )}

          {/* New Member Welcome Banner */}
          {!isCurrentPoolManager && activePool && (
            <MemberWelcomeBanner
              pool={activePool}
              activeUser={activeUser}
              isManager={isCurrentPoolManager}
              onOpenSettleUp={() => {
                setSettleUpTargetUser(activeUser);
                setIsSettleUpOpen(true);
              }}
            />
          )}

          {/* Pool Executive Summary Card */}
          <PoolSummaryCard
            pool={activePool}
            activeUser={activeUser}
            items={items}
            transactions={transactions}
            onOpenDeposit={() => {
              setDepositTargetUser(activeUser);
              setIsDepositOpen(true);
            }}
            onOpenSettleUp={() => {
              setSettleUpTargetUser(activeUser);
              setIsSettleUpOpen(true);
            }}
            onOpenReceiptScanner={() => setIsReceiptOpen(true)}
            onOpenShoppingList={() => setIsShoppingOpen(true)}
            onOpenAddItem={() => {
              setEditingItem(null);
              setIsItemFormOpen(true);
            }}
            onOpenManagePool={isCurrentPoolManager ? () => setIsManagePoolOpen(true) : undefined}
            onOpenSharePool={() => setIsSharePoolOpen(true)}
            onOpenSavings={() => setIsSavingsOpen(true)}
            isManager={isCurrentPoolManager}
          />

        {/* View Switcher Tabs & Quick Actions (Desktop & Tablet) */}
        <div className="hidden md:flex items-center justify-between gap-2 bg-[#F0EBE3] rounded-xl p-1.5 shadow-xs">
          
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 px-0.5 min-w-0 flex-1">
            {/* Catalog Tab */}
            <button
              onClick={() => handleTabSelect('catalog')}
              className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'catalog'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Catalog</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'catalog' ? 'bg-white/20 text-white' : 'bg-white/60 text-[#6B6B6B]'
              }`}>
                {items.filter((i) => i.poolId === activePool.id).length}
              </span>
            </button>

            {/* Members Tab */}
            <button
              onClick={() => handleTabSelect('members')}
              aria-label="Members"
              title="Members"
              data-testid="tab-members"
              className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'members'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Members</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'members' ? 'bg-white/20 text-white' : 'bg-white/60 text-[#6B6B6B]'
              }`}>
                {activePool.members?.length || 0}
              </span>
            </button>

            {/* Ledger Tab */}
            <button
              onClick={() => handleTabSelect('ledger')}
              className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>Ledger</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeTab === 'ledger' ? 'bg-white/20 text-white' : 'bg-white/60 text-[#6B6B6B]'
              }`}>
                {transactions.filter((t) => t.poolId === activePool.id).length}
              </span>
            </button>

            {/* Analytics Tab */}
            <button
              onClick={() => handleTabSelect('analytics')}
              className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-[#E8694A] text-white shadow-xs'
                  : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
              }`}
            >
              <PieChartIcon className="h-3.5 w-3.5" />
              <span>Analytics</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

            <button
              onClick={() => setIsPollsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-white hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] text-xs font-medium transition shrink-0 shadow-xs cursor-pointer"
            >
              <Vote className="h-3.5 w-3.5 text-[#E8694A]" />
              <span className="hidden sm:inline">Polls</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#F0EBE3] text-[#6B6B6B]">
                {polls.filter((p) => p.poolId === activePool.id).length}
              </span>
            </button>
          </div>

        </div>

        {/* Tab Content Views */}
        {activeTab === 'catalog' && (
          <ItemCatalog
            items={activePoolItems}
            currency={activePool.currency}
            activeUser={activeUser}
            onConsumeItem={(item) => handleConsumeItem(item, activeUser.id)}
            onOpenSettleUp={() => {
              setSettleUpTargetUser(activeUser);
              setIsSettleUpOpen(true);
            }}
            onOpenEditItem={(item) => {
              setEditingItem(item);
              setIsItemFormOpen(true);
            }}
            onOpenQR={(item) => setQrItem(item)}
            onQuickRestock={handleQuickRestock}
            onOpenRestockItem={(item) => {
              setReceiptPreselectedItemId(item.id);
              setIsReceiptOpen(true);
            }}
            onOpenAddItem={() => {
              setEditingItem(null);
              setIsItemFormOpen(true);
            }}
            onOpenReceiptScanner={() => setIsReceiptOpen(true)}
            onDeleteItem={handleDeleteItem}
            onReportDiscrepancy={(item) => setDiscrepancyItem(item)}
            isManager={isCurrentPoolManager}
          />
        )}

        {activeTab === 'members' && (
          <MembersBalanceList
            pool={activePool}
            activeUser={activeUser}
            onOpenDepositForUser={(user) => {
              setDepositTargetUser(user);
              setIsDepositOpen(true);
            }}
            onOpenManagePool={isCurrentPoolManager ? () => setIsManagePoolOpen(true) : undefined}
            onOpenSharePool={() => setIsSharePoolOpen(true)}
            onMemberRoleUpdated={handleMemberRoleUpdated}
            onMemberRemoved={handleMemberRemoved}
          />
        )}

        {activeTab === 'ledger' && (
          <LedgerTransactionsView
            pool={activePool}
            transactions={transactions}
            activeUser={activeUser}
            onRefundTransaction={handleRefundTransaction}
          />
        )}

        {activeTab === 'analytics' && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-12">
              <div className="w-8 h-8 border-4 border-[#E8694A] border-t-transparent rounded-full animate-spin"></div>
            </div>
          }>
            <AnalyticsCharts
              pool={activePool}
              transactions={transactions}
              items={items}
            />
          </Suspense>
        )}
        </>
        )}

      </main>
      </Suspense>

      {/* Footer (Hidden on mobile to avoid layout crowding above bottom navigation) */}
      <footer className="hidden md:block border-t border-[#E0DAD1] bg-[#FAFAF8] py-8 text-center text-xs text-[#6B6B6B] mt-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[#6B6B6B]">
            PantryPool • Communal Breakroom & Household Ledger Platform
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[#6B6B6B] font-medium">
            <a
              href="/terms"
              onClick={(e) => {
                e.preventDefault();
                handleOpenLegal('terms');
              }}
              className="hover:text-[#2D2D2D] transition"
            >
              Terms of Service
            </a>
            <span className="text-[#E0DAD1]">•</span>
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                handleOpenLegal('privacy');
              }}
              className="hover:text-[#2D2D2D] transition"
            >
              Privacy Policy
            </a>
            <span className="text-[#E0DAD1]">•</span>
            <a
              href="/user-agreement"
              onClick={(e) => {
                e.preventDefault();
                handleOpenLegal('user-agreement');
              }}
              className="hover:text-[#2D2D2D] transition"
            >
              User Agreement
            </a>
            <span className="text-[#E0DAD1]">•</span>
            <a
              href="/cookies"
              onClick={(e) => {
                e.preventDefault();
                handleOpenLegal('cookies');
              }}
              className="hover:text-[#2D2D2D] transition"
            >
              Cookie Policy
            </a>
            <span className="text-[#E0DAD1]">•</span>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open_cookie_preferences'));
              }}
              className="hover:text-[#E8694A] transition"
            >
              Cookie Settings
            </button>
          </div>
        </div>
      </footer>
      </>
      )}

      {/* Modals (Code-Split with Suspense / N11) */}
      <Suspense fallback={null}>
      {activePool && kioskModeEnabled && isKioskOpen && (
        <ConsumptionKioskModal
          pool={activePool}
          items={items}
          onClose={() => setIsKioskOpen(false)}
          onConsumeItem={(item, userId) => handleConsumeItem(item, userId, false)}
        />
      )}

      {activePool && isReceiptOpen && (
        <ReceiptScannerModal
          pool={activePool}
          activeUser={activeUser}
          items={items}
          initialSelectedItemId={receiptPreselectedItemId}
          onClose={() => {
            setIsReceiptOpen(false);
            setReceiptPreselectedItemId(undefined);
          }}
          onApplyReceiptData={handleApplyReceiptData}
        />
      )}

      {activePool && isDepositOpen && (
        <AddContributionModal
          pool={activePool}
          preselectedUser={depositTargetUser}
          onClose={() => setIsDepositOpen(false)}
          onRecordDeposit={handleRecordDeposit}
        />
      )}

      {activePool && isShoppingOpen && (
        <ShoppingListModal
          pool={activePool}
          shoppingList={shoppingList}
          items={items}
          onClose={() => setIsShoppingOpen(false)}
          onAddShoppingItem={handleAddShoppingItem}
          onTogglePurchased={handleTogglePurchased}
          onDeleteShoppingItem={handleDeleteShoppingItem}
          onClearShoppingList={handleClearShoppingList}
          onExecuteRestockFromList={handleExecuteRestockFromList}
        />
      )}

      {activePool && isItemFormOpen && (
        <ItemFormModal
          pool={activePool}
          itemToEdit={editingItem}
          onClose={() => setIsItemFormOpen(false)}
          onSaveItem={handleSaveItem}
          onDeleteItem={handleDeleteItem}
        />
      )}

      {activePool && discrepancyItem && (
        <StockDiscrepancyModal
          item={discrepancyItem}
          pool={activePool}
          activeUser={activeUser}
          onClose={() => setDiscrepancyItem(null)}
          onSubmitDiscrepancy={handleSubmitDiscrepancy}
        />
      )}

      {isCreatePoolOpen && (
        <CreatePoolModal
          activeUser={activeUser}
          pools={pools}
          isPaidSubscriber={isPaidSubscriber}
          organizations={organizations}
          activeOrgId={activeOrgId}
          onOpenCreateOrg={isOrganizationsEnabled ? () => setIsCreateOrgOpen(true) : undefined}
          onClose={() => setIsCreatePoolOpen(false)}
          onCreatePool={handleCreatePool}
          onJoinPool={handleJoinPool}
        />
      )}

      {activePool && isManagePoolOpen && isCurrentPoolManager && (
        <ManagePoolModal
          pool={activePool}
          activeUser={activeUser}
          isManager={isCurrentPoolManager}
          onClose={() => setIsManagePoolOpen(false)}
          onUpdatePool={handleUpdatePool}
          onDeletePool={handleDeletePool}
          onOpenSharePool={() => setIsSharePoolOpen(true)}
          kioskModeEnabled={kioskModeEnabled}
          items={items.filter((i) => i.poolId === activePool.id)}
          onUpdateItem={(item: Item) => handleSaveItem(item, item.id)}
        />
      )}

      {activePool && isSharePoolOpen && (
        <SharePoolModal
          pool={activePool}
          onClose={() => setIsSharePoolOpen(false)}
          onOpenPoster={() => setIsPosterOpen(true)}
        />
      )}

      {activePool && qrItem && (
        <ItemQRCodeModal
          item={qrItem}
          pool={activePool}
          onClose={() => setQrItem(null)}
        />
      )}

      {activePool && isPollsOpen && (
        <PollsModal
          pool={activePool}
          polls={polls}
          activeUser={activeUser}
          onClose={() => setIsPollsOpen(false)}
          onVote={handleVotePoll}
          onCreatePoll={handleCreatePoll}
          onUpdatePoll={handleUpdatePoll}
          onDeletePoll={handleDeletePoll}
        />
      )}

      {activePool && isQRScannerOpen && (
        <FridgeQRScannerModal
          pools={pools}
          activePool={activePool}
          items={items.filter((i) => i.poolId === activePool.id)}
          onClose={() => setIsQRScannerOpen(false)}
          onScanPoolCode={handleScanPoolCode}
          onScanItem={handleScanItem}
          onOpenKiosk={() => setIsKioskOpen(true)}
          kioskModeEnabled={kioskModeEnabled}
        />
      )}

      {activePool && isPosterOpen && (
        <PrintableFridgePosterModal
          pool={activePool}
          items={items.filter((i) => i.poolId === activePool.id)}
          onClose={() => setIsPosterOpen(false)}
          onOpenNfc={() => setIsNfcOpen(true)}
        />
      )}

      {activePool && (
        <NFCTagModal
          isOpen={isNfcOpen}
          onClose={() => setIsNfcOpen(false)}
          pool={activePool}
          items={items.filter((i) => i.poolId === activePool.id)}
          activeUser={activeUser as any}
          onConsumeItem={handleConsumeItem}
          kioskModeEnabled={kioskModeEnabled}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        initialMode={authModalMode}
        signupIntent={signupIntent}
        initialResetToken={authResetToken}
        initialResetEmail={authResetEmail}
        onClose={() => {
          setIsAuthOpen(false);
          setAuthResetToken(null);
          setAuthResetEmail(null);
        }}
        onSuccess={async (user, intent, token) => {
          setIsAuthOpen(false);
          const currentHash = (window.location.hash || '').replace(/^#\/?/, '').toLowerCase();
          const currentPath = (window.location.pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
          if (['login', 'signin', 'auth', 'register', 'signup'].includes(currentHash) || currentPath === '/login' || currentPath === '/signin' || currentPath === '/register' || currentPath === '/signup') {
            window.history.replaceState(null, '', '/#catalog');
          }

          // Strict isolation: if logging in as a different user or new login, clear in-memory state of prior account
          if (authUser?.id !== user.id) {
            setPools([]);
            setActivePoolId('');
            setItems([]);
            setTransactions([]);
            setShoppingList([]);
            setPolls([]);
            clearUserData({ preserveAuthTokens: true });
          }

          if (token) {
            setAuthToken(token);
          }

          setIsLoadingPools(true);
          setAuthUser(user);
          saveActiveUserId(user.id);
          setActiveUserId(user.id);
          setActiveOrgId('');
          setAuthResetToken(null);
          setAuthResetEmail(null);
          let loadedOrgs: ApiOrganization[] = [];
          if (isOrganizationsEnabled) {
            const orgs = await fetchOrganizationsApi(user.id);
            loadedOrgs = orgs || [];
            setOrganizations(loadedOrgs);
          } else {
            setOrganizations([]);
          }

          // Handle pending workspace invite join
          const pendingOrgJoin = localStorage.getItem('pantrypool_pending_org_join');
          if (pendingOrgJoin) {
            localStorage.removeItem('pantrypool_pending_org_join');
            await handleJoinOrganization(pendingOrgJoin);
          }

          const pendingJoin = localStorage.getItem('pantrypool_pending_join');
          if (pendingJoin) {
            localStorage.removeItem('pantrypool_pending_join');
            await handleJoinPool(pendingJoin);
          }
          const pendingConsumeRaw = localStorage.getItem('pantrypool_pending_consume');
          if (pendingConsumeRaw) {
            localStorage.removeItem('pantrypool_pending_consume');
            try {
              const { itemId, poolId } = JSON.parse(pendingConsumeRaw) as { itemId: string; poolId: string | null };
              if (poolId) setActivePoolId(poolId);
              // Items may not yet be in state; re-fetch inline so we can resolve the item
              const currentItems = items.length > 0 ? items : [];
              const matchedItem = currentItems.find((i) => i.id === itemId);
              if (matchedItem) {
                handleConsumeItem(matchedItem);
              }
            } catch {
              // Malformed pending consume — discard silently
            }
          }

          // Also fetch pools for this user to check if they already have personal / standalone pools
          let loadedPools: any[] = [];
          try {
            loadedPools = await fetchPools();
            if (loadedPools && loadedPools.length > 0) {
              setPools(loadedPools as any);
              if (!activePoolId) setActivePoolId(loadedPools[0].id);
            }
          } catch (e) {}

          // Launch 3-step Onboarding Wizard for new SaaS creators (0 orgs, 0 pools, not joining via code)
          const shouldLaunchOnboarding = isOrganizationsEnabled && !pendingOrgJoin && !pendingJoin && !pendingConsumeRaw && (
            (loadedOrgs.length === 0 && (!loadedPools || loadedPools.length === 0)) ||
            (Boolean(intent?.tier && intent.tier !== 'community') && loadedOrgs.length === 0)
          );
          if (shouldLaunchOnboarding) {
            if (intent) {
              setSignupIntent(intent);
            }
            setIsOnboardingOpen(true);
          }
        }}
        onOpenLegal={handleOpenLegal}
      />

      {/* 3-Step Guided Onboarding Wizard (SaaS Only) */}
      {isOrganizationsEnabled && isOnboardingOpen && (
        <OnboardingWizardModal
          isOpen={isOnboardingOpen}
          ownerId={authUser?.id || activeUser.id}
          initialTier={signupIntent?.tier || 'community'}
          initialBillingCycle={signupIntent?.billingCycle || 'yearly'}
          onClose={() => setIsOnboardingOpen(false)}
          onSuccess={handleOnboardingSuccess}
        />
      )}

      {/* Help & Quickstart Guide Modal */}
      {isHelpGuideOpen && (
        <HelpGuideModal
          isOpen={isHelpGuideOpen}
          onClose={() => setIsHelpGuideOpen(false)}
          initialTab={isCurrentPoolManager ? 'managers' : 'members'}
          kioskModeEnabled={kioskModeEnabled}
        />
      )}

      {/* Platform Admin Console Modal (Super Admin & Platform Admins) */}
      <AdminDashboardModal
        isOpen={isAdminOpen}
        authUser={authUser}
        onClose={() => {
          setIsAdminOpen(false);
          refreshPublicSettings();
        }}
      />

      {/* Create Organization Workspace Modal (SaaS Only) */}
      {isOrganizationsEnabled && isCreateOrgOpen && (
        <CreateOrganizationModal
          isOpen={isCreateOrgOpen}
          ownerId={authUser?.id || activeUser.id}
          initialTier={signupIntent?.tier === 'plus' ? 'plus' : 'standard'}
          initialBillingCycle={signupIntent?.billingCycle || 'yearly'}
          onClose={() => setIsCreateOrgOpen(false)}
          onSuccess={async (newOrg) => {
            const orgs = await fetchOrganizationsApi(authUser?.id);
            setOrganizations(orgs.length > 0 ? orgs : [newOrg, ...organizations]);
            setActiveOrgId(newOrg.id);
            const orgPools = await fetchPools(newOrg.id);
            if (orgPools && orgPools.length > 0) {
              setPools(orgPools as any);
              setActivePoolId(orgPools[0].id);
            }
          }}
        />
      )}

      {/* Mobile Sticky Bottom Nav Bar (Logged In Only) */}
      {authUser && activePool && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleTabSelect}
          onOpenQRScanner={() => setIsQRScannerOpen(true)}
          onOpenShoppingList={() => setIsShoppingOpen(true)}
          shoppingListCount={shoppingList.filter((s) => s.poolId === activePool.id && !s.purchased).length}
          poolCode={resolvePoolCode(activePool)}
          onOpenLegal={handleOpenLegal}
          onOpenPolls={() => setIsPollsOpen(true)}
          onOpenReceiptScanner={() => setIsReceiptOpen(true)}
          onOpenKiosk={() => setIsKioskOpen(true)}
          onOpenPoster={() => setIsPosterOpen(true)}
          onOpenNfc={() => setIsNfcOpen(true)}
          onOpenManagePool={isCurrentPoolManager ? () => setIsManagePoolOpen(true) : undefined}
          onOpenSharePool={() => setIsSharePoolOpen(true)}
          isManager={isCurrentPoolManager}
          kioskModeEnabled={kioskModeEnabled}
          pollsCount={polls.filter((p) => p.poolId === activePool.id).length}
          transactionsCount={transactions.filter((t) => t.poolId === activePool.id).length}
        />
      )}

      {/* Slack & MS Teams Webhook Integration Modal (SaaS Only) */}
      {isOrganizationsEnabled && activePool && (
        <WebhookIntegrationModal
          isOpen={isWebhooksOpen}
          onClose={() => setIsWebhooksOpen(false)}
          poolId={activePool.id}
          poolName={activePool.name}
          webhooks={webhooks}
          onSaveWebhook={handleSaveWebhook}
          onDeleteWebhook={handleDeleteWebhook}
          onTestDispatch={handleTestDispatch}
        />
      )}

      {/* User Profile & Account Linking Modal */}
      <UserProfileModal
        isOpen={isUserProfileOpen}
        onClose={() => setIsUserProfileOpen(false)}
        user={authUser}
        onUpdateUser={handleUpdateUserProfile}
        onOpenLegal={handleOpenLegal}
      />

      {/* 1-Click Settle Up & P2P Payout Modal */}
      {isSettleUpOpen && activePool && (
        <SettleUpModal
          pool={activePool}
          currentUser={activeUser}
          targetUser={settleUpTargetUser}
          onClose={() => {
            setIsSettleUpOpen(false);
            setSettleUpTargetUser(null);
          }}
          onNavigateToRestock={() => {
            handleTabSelect('catalog');
            setIsReceiptOpen(true);
          }}
        />
      )}

      {/* Notifications & Low Stock Digest Modal */}
      <NotificationModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        preferences={notificationPreferences}
        currentOrgTier={currentOrg?.tier || 'community'}
        isPlusOrEnterprise={currentOrg?.tier === 'plus' || currentOrg?.tier === 'enterprise' || authUser?.systemRole === 'superadmin'}
        onUpgradeTier={() => setIsCreateOrgOpen(true)}
        onMarkAsRead={handleMarkNotificationsRead}
        onDeleteNotification={handleDeleteNotification}
        onSavePreferences={handleSaveNotificationPreferences}
        onTriggerLowStockCheck={handleTriggerLowStockCheck}
        onTriggerWeeklyDigest={handleTriggerWeeklyDigest}
        onSendTestAlert={handleSendTestAlert}
        onNavigateToRestock={() => {
          handleTabSelect('catalog');
          setIsNotificationsOpen(false);
        }}
      />

      {/* Legal & Compliance Center Modal */}
      <LegalModal
        isOpen={isLegalOpen}
        onClose={handleCloseLegal}
        initialTab={legalTab}
        onTabChange={(tab) => setLegalTab(tab)}
      />

      {/* Breakroom Savings & Cross-Pool Leaderboard Modal */}
      {activePool && isSavingsOpen && (
        <SavingsLeaderboardModal
          pool={activePool}
          activeUser={activeUser}
          onClose={() => setIsSavingsOpen(false)}
          onOpenManagePool={isCurrentPoolManager ? () => setIsManagePoolOpen(true) : undefined}
          kioskModeEnabled={kioskModeEnabled}
        />
      )}
      </Suspense>

      {/* Legally Compliant Cookie & Analytics Consent Banner */}
      <CookieConsentBanner
        onOpenLegal={handleOpenLegal}
      />

      {/* Stylized Alert & Dialog Confirmation Popup Modal */}
      {alertDialog && (
        <AlertDialogModal
          isOpen={alertDialog.isOpen}
          title={alertDialog.title}
          message={alertDialog.message}
          type={alertDialog.type}
          confirmText={alertDialog.confirmText}
          cancelText={alertDialog.cancelText}
          onConfirm={alertDialog.onConfirm}
          onClose={() => setAlertDialog(null)}
        />
      )}

      {/* Offline Mutation Sync Status Banner */}
      <OfflineQueueBanner />

    </div>
  );
}

