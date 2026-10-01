import { User, PaymentProvider } from '../types';

export interface SettleUpHandles {
  venmo?: string;
  cashapp?: string;
  paypal?: string;
  zelle?: string;
  applepay?: string;
}

export interface SettleUpLink {
  provider: 'venmo' | 'cashapp' | 'paypal' | 'zelle' | 'applepay';
  label: string;
  url?: string;
  identifier?: string;
  instructions: string;
  iconName: string;
  badgeColor: string;
  isPreferred?: boolean;
}

/**
 * Clean handle by removing prefixes like @, $, or URL schemes
 */
export function cleanHandle(handle?: string): string {
  if (!handle) return '';
  let cleaned = handle.trim();
  
  // Strip full URLs if user pasted them
  cleaned = cleaned
    .replace(/^https?:\/\/(www\.)?venmo\.com\/(u\/)?/i, '')
    .replace(/^https?:\/\/(www\.)?cash\.app\/(\$)?/i, '')
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, '')
    .replace(/^(sms|tel):\/?\/?/i, '')
    .replace(/^[@$]/, '')
    .replace(/\/$/, '')
    .trim();

  return cleaned;
}

/**
 * Extract payment handles from a user object
 */
export function getUserPaymentHandles(user?: Partial<User> | null): SettleUpHandles & { preferred?: PaymentProvider } {
  if (!user) return {};
  return {
    venmo: user.venmoHandle || '',
    cashapp: user.cashappHandle || '',
    paypal: user.paypalHandle || '',
    zelle: user.zelleIdentifier || '',
    applepay: user.applePayHandle || '',
    preferred: user.preferredPaymentMethod,
  };
}

/**
 * Check if a set of handles has at least one configured provider
 */
export function hasAnyPaymentHandle(handles?: SettleUpHandles | null): boolean {
  if (!handles) return false;
  return Boolean(
    cleanHandle(handles.venmo) ||
    cleanHandle(handles.cashapp) ||
    cleanHandle(handles.paypal) ||
    (handles.zelle && handles.zelle.trim()) ||
    (handles.applepay && handles.applepay.trim())
  );
}

/**
 * Get the top members with credit for bringing in items.
 * Prioritizes members with positive balances (stockers/reimbursables).
 * Falls back to champions / admins if fewer than limit members have positive balance.
 */
export function getTopCreditedContributors(members: User[], limit: number = 3): User[] {
  if (!members || members.length === 0) return [];

  // Filter positive credit members first
  const positiveMembers = members
    .filter((m) => m.balance > 0)
    .sort((a, b) => b.balance - a.balance);

  if (positiveMembers.length >= limit) {
    return positiveMembers.slice(0, limit);
  }

  // If fewer than limit members have positive balance, supplement with other members (champions first, then highest balance)
  const positiveIds = new Set(positiveMembers.map((m) => m.id));
  const remainingMembers = members
    .filter((m) => !positiveIds.has(m.id))
    .sort((a, b) => {
      // Champion / admin first
      const aIsLead = a.role === 'champion' || a.role === 'admin' ? 1 : 0;
      const bIsLead = b.role === 'champion' || b.role === 'admin' ? 1 : 0;
      if (bIsLead !== aIsLead) return bIsLead - aIsLead;
      return b.balance - a.balance;
    });

  const combined = [...positiveMembers, ...remainingMembers];
  return combined.slice(0, limit);
}

/**
 * Generate 1-click P2P links for Venmo, Cash App, PayPal, and Zelle.
 * If preferredProvider is set, that link is marked as preferred and sorted to the top.
 */
export function generateSettleUpLinks(
  poolName: string,
  amountOwed: number,
  handles: SettleUpHandles,
  preferredProvider?: PaymentProvider | string
): SettleUpLink[] {
  const links: SettleUpLink[] = [];
  const absAmount = Math.abs(amountOwed).toFixed(2);
  const note = `PantryPool Settle Up - ${poolName}`;

  // 1. Venmo
  const cleanVenmo = cleanHandle(handles.venmo);
  if (cleanVenmo) {
    links.push({
      provider: 'venmo',
      label: 'Venmo',
      url: `https://venmo.com/?txn=pay&recipients=${encodeURIComponent(cleanVenmo)}&amount=${absAmount}&note=${encodeURIComponent(note)}`,
      identifier: `@${cleanVenmo}`,
      instructions: `Pay $${absAmount} to @${cleanVenmo} on Venmo with memo "${note}"`,
      iconName: 'Smartphone',
      badgeColor: '#008CFF',
      isPreferred: preferredProvider === 'venmo',
    });
  }

  // 2. Cash App
  const cleanCash = cleanHandle(handles.cashapp);
  if (cleanCash) {
    links.push({
      provider: 'cashapp',
      label: 'Cash App',
      url: `https://cash.app/$${encodeURIComponent(cleanCash)}/${absAmount}`,
      identifier: `$${cleanCash}`,
      instructions: `Send $${absAmount} to $${cleanCash} on Cash App`,
      iconName: 'DollarSign',
      badgeColor: '#00D632',
      isPreferred: preferredProvider === 'cashapp',
    });
  }

  // 3. PayPal
  const cleanPaypal = cleanHandle(handles.paypal);
  if (cleanPaypal) {
    links.push({
      provider: 'paypal',
      label: 'PayPal.me',
      url: `https://paypal.me/${encodeURIComponent(cleanPaypal)}/${absAmount}`,
      identifier: `paypal.me/${cleanPaypal}`,
      instructions: `Send $${absAmount} to ${cleanPaypal} via PayPal.me`,
      iconName: 'CreditCard',
      badgeColor: '#003087',
      isPreferred: preferredProvider === 'paypal',
    });
  }

  // 4. Zelle
  const zelleId = handles.zelle?.trim();
  if (zelleId) {
    links.push({
      provider: 'zelle',
      label: 'Zelle',
      identifier: zelleId,
      instructions: `Open your banking app and send $${absAmount} via Zelle to: ${zelleId}`,
      iconName: 'Zap',
      badgeColor: '#7414CA',
      isPreferred: preferredProvider === 'zelle',
    });
  }

  // 5. Apple Pay / Apple Cash (P2P via iMessage / Messages)
  const appleId = handles.applepay?.trim();
  if (appleId) {
    const cleanApple = cleanHandle(appleId);
    links.push({
      provider: 'applepay',
      label: 'Apple Pay / Cash',
      url: `sms:${encodeURIComponent(cleanApple)}?&body=${encodeURIComponent(`${note} ($${absAmount})`)}`,
      identifier: cleanApple,
      instructions: `Send $${absAmount} via Apple Cash to ${cleanApple}`,
      iconName: 'Smartphone',
      badgeColor: '#000000',
      isPreferred: preferredProvider === 'applepay',
    });
  }

  // Sort preferred provider to the top
  if (preferredProvider) {
    links.sort((a, b) => {
      if (a.provider === preferredProvider) return -1;
      if (b.provider === preferredProvider) return 1;
      return 0;
    });
  }

  return links;
}
