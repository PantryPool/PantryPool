export type CanonicalOrgTier = 'community' | 'standard' | 'plus' | 'enterprise';
export type OrgTier = CanonicalOrgTier | 'starter' | 'pro';

export const TIER_LIMITS = {
  // Canonical Modern Naming (Community, Hosted Standard, Hosted Plus, Enterprise)
  community: { maxPools: 999999, maxMembersPerPool: 999999, aiScansPerMonth: 999999 },
  standard: { maxPools: 5, maxMembersPerPool: 50, aiScansPerMonth: 150 },
  plus: { maxPools: 15, maxMembersPerPool: 250, aiScansPerMonth: 500 },
  enterprise: { maxPools: 999999, maxMembersPerPool: 999999, aiScansPerMonth: 999999 },

  // Backwards-Compatible Legacy Naming
  starter: { maxPools: 999999, maxMembersPerPool: 999999, aiScansPerMonth: 999999 },
  pro: { maxPools: 5, maxMembersPerPool: 50, aiScansPerMonth: 150 }
};

export function normalizeTier(tier?: string): CanonicalOrgTier {
  const clean = (tier || 'community').toLowerCase().trim();
  if (clean === 'enterprise' || clean.includes('enterprise')) return 'enterprise';
  if (clean === 'plus' || clean.includes('plus')) return 'plus';
  if (clean === 'standard' || clean === 'pro' || clean.includes('standard') || clean.includes('pro')) return 'standard';
  return 'community';
}

export function getTierLimits(tier: string) {
  const cleanTier = (tier || "starter").toLowerCase().trim();
  if (cleanTier === "enterprise") return TIER_LIMITS.enterprise;
  if (cleanTier === "plus") return TIER_LIMITS.plus;
  if (cleanTier === "pro" || cleanTier === "standard") return TIER_LIMITS.pro;
  if (cleanTier === "community") return TIER_LIMITS.community;
  return TIER_LIMITS.starter;
}

export function isWeeklyDigestEligible(tier?: string): boolean {
  const normalized = normalizeTier(tier);
  return normalized === 'plus' || normalized === 'enterprise';
}

