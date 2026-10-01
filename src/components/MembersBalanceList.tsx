import React, { useState } from 'react';
import { Pool, User } from '../types';
import { nudgeMemberApi, updateMemberRoleApi, removeMemberApi } from '../lib/api';
import { getDefaultAvatarUrl } from '../lib/avatar';
import { 
  Users, 
  Crown, 
  PlusCircle, 
  Send, 
  Copy, 
  Check, 
  ArrowUpRight, 
  ArrowDownRight,
  Loader2,
  ShieldCheck,
  Trash2,
  ChevronDown,
  Zap,
  Share2
} from 'lucide-react';
import { AlertDialogModal, AlertDialogConfig } from './AlertDialogModal';
import { lazyWithRetry } from '../lib/lazyWithRetry';
const SettleUpModal = lazyWithRetry(() => import('./SettleUpModal').then(m => ({ default: m.SettleUpModal })));

interface MembersBalanceListProps {
  pool: Pool;
  activeUser: User;
  onOpenDepositForUser: (user: User) => void;
  onOpenManagePool?: () => void;
  onOpenSharePool?: () => void;
  onMemberRoleUpdated?: (userId: string, newRole: string) => void;
  onMemberRemoved?: (userId: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  champion: 'Champion',
  admin: 'Admin',
  member: 'Member',
  contributor: 'Contributor',
};

export const MembersBalanceList: React.FC<MembersBalanceListProps> = ({
  pool,
  activeUser,
  onOpenDepositForUser,
  onOpenManagePool,
  onOpenSharePool,
  onMemberRoleUpdated,
  onMemberRemoved,
}) => {
  const [nudgedUserId, setNudgedUserId] = useState<string | null>(null);
  const [nudgeLoading, setNudgeLoading] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [managingUserId, setManagingUserId] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<AlertDialogConfig | null>(null);
  const [settleTargetUser, setSettleTargetUser] = useState<User | null>(null);

  const isAdmin = activeUser.role === 'champion' || activeUser.role === 'admin';
  const isCurrentUserAdmin = isAdmin;

  const handleNudge = async (member: User) => {
    setNudgeLoading(member.id);
    try {
      await nudgeMemberApi(pool.id, member.id);
      setNudgedUserId(member.id);
      setTimeout(() => setNudgedUserId(null), 3000);
    } catch {
      setNudgedUserId(member.id);
      setTimeout(() => setNudgedUserId(null), 2500);
    } finally {
      setNudgeLoading(null);
    }
  };

  const handleCopyInvite = () => {
    if (onOpenSharePool) {
      onOpenSharePool();
      return;
    }
    const poolCode = pool.code || (pool as any).qrCodeKey || (pool as any).qr_code_key || (typeof pool.id === 'string' && pool.id.startsWith('pool_') && pool.id.length > 10 ? pool.id.replace('pool_', '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase() : pool.id);
    const inviteUrl = `${window.location.origin}/?join=${encodeURIComponent(poolCode)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRoleChange = async (member: User, newRole: string) => {
    if (member.role === newRole) return;
    setRoleLoading(member.id);
    setErrorMsg(null);
    const res = await updateMemberRoleApi(pool.id, member.id, newRole);
    setRoleLoading(null);
    if (res.success) {
      onMemberRoleUpdated?.(member.id, newRole);
      setManagingUserId(null);
    } else {
      setErrorMsg(res.error || 'Failed to update role. Please try again.');
    }
  };

  const handleRemoveMember = (member: User) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Remove Team Member',
      message: `Remove ${member.name} from "${pool.name}"? Their balance history will be preserved in the audit ledger.`,
      type: 'warning',
      confirmText: 'Remove Member',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setRemoveLoading(member.id);
        setErrorMsg(null);
        const res = await removeMemberApi(pool.id, member.id);
        setRemoveLoading(null);
        if (res.success) {
          onMemberRemoved?.(member.id);
        } else {
          setErrorMsg(res.error || 'Failed to remove member. Please try again.');
        }
      },
      onClose: () => setConfirmConfig(null)
    });
  };

  return (
    <div className="bg-white border border-[#E0DAD1] rounded-lg p-5 sm:p-6 shadow-xs text-[#2D2D2D] space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDE8E0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#E8694A]" />
            <h2 className="text-lg font-semibold text-[#2D2D2D] tracking-tight">
              Team Ledger & Member Balances
            </h2>
          </div>
          <p className="text-xs text-[#6B6B6B] mt-0.5">
            Real-time individual balances for {pool.name} ({pool.members.length} members)
          </p>
        </div>

        <button
          onClick={handleCopyInvite}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#E8694A]/10 hover:bg-[#E8694A]/20 text-[#E8694A] border border-[#E8694A]/30 text-xs font-semibold transition self-start sm:self-auto shadow-xs cursor-pointer active:scale-[0.98]"
        >
          <Share2 className="h-3.5 w-3.5" />
          <span>Invite & Share Pool</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* Members Grid / List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {pool.members.map((member) => {
          const isCurrentActive = member.id === activeUser.id || (member as any).userId === activeUser.id || (member as any).user_id === activeUser.id;
          const isChampion = member.id === pool.championId || (member as any).userId === pool.championId || (member as any).user_id === pool.championId || member.role === 'champion';
          const isPositive = member.balance >= 0;
          const isManaging = managingUserId === member.id;
          const canManage = isAdmin && !isCurrentActive && !isChampion;
          const maxDeficit = pool.maxDeficit !== undefined ? Number(pool.maxDeficit) : 10.00;
          const isOverLimit = maxDeficit >= 0 && member.balance <= -maxDeficit;

          const memberName = (isCurrentActive && activeUser?.name && (!member.name || member.name === 'Member'))
            ? activeUser.name
            : (member.name || (isCurrentActive && activeUser?.name) || 'Member');
          const memberEmail = (isCurrentActive && activeUser?.email && !member.email)
            ? activeUser.email
            : (member.email || (isCurrentActive && activeUser?.email) || '');
          const memberAvatar = (isCurrentActive && activeUser?.avatar)
            ? activeUser.avatar
            : (member.avatar || (member as any).avatarUrl || getDefaultAvatarUrl(memberName));

          return (
            <div
              key={member.id}
              data-testid={`member-card-${member.id}`}
              className={`p-3.5 rounded-lg border flex flex-col gap-2.5 transition ${
                isCurrentActive
                  ? 'bg-[#FDF0EC]/60 border-[#E8694A]/40'
                  : 'bg-white border-[#E0DAD1] hover:bg-[#FAFAF8]'
              }`}
            >
              {/* Top Row: Avatar + Name + Balance */}
              <div className="flex items-center justify-between gap-3">
                {/* Avatar & User Details */}
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={memberAvatar}
                      alt={memberName}
                      className="h-10 w-10 rounded-full object-cover ring-1 ring-[#E0DAD1] bg-[#F0EBE3]"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = getDefaultAvatarUrl(memberName);
                      }}
                    />
                    {isChampion && (
                      <div className="absolute -top-1 -right-1 bg-[#D4870E] text-white p-0.5 rounded-full ring-2 ring-white" title="Pool Manager">
                        <Crown className="h-2.5 w-2.5 fill-white" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[#2D2D2D] text-sm">{memberName}</span>
                      {isCurrentActive && (
                        <span className="text-[10px] font-semibold px-1.5 rounded bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30">
                          You
                        </span>
                      )}
                      {isOverLimit && (
                        <span 
                          className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[#FDF0EC] text-[#C9553D] border border-[#C9553D]/30"
                          title={`Spending locked: Balance reaches pool ceiling of -${pool.currency}${maxDeficit.toFixed(2)}`}
                        >
                          🛑 Spending Locked
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#6B6B6B] block">{memberEmail}</span>
                    <span className="text-[10px] text-[#9A9A9A] font-medium uppercase tracking-wide">
                      {ROLE_LABELS[member.role] || member.role}
                    </span>
                  </div>
                </div>

                {/* Balance */}
                <div className={`text-sm font-semibold font-mono-financial flex items-center gap-0.5 ${
                  isPositive ? 'text-[#5A9A6B]' : 'text-[#C9553D]'
                }`}>
                  {isPositive ? (
                    <>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span>+{pool.currency}{member.balance.toFixed(2)}</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownRight className="h-3.5 w-3.5" />
                      <span>-{pool.currency}{Math.abs(member.balance).toFixed(2)}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Bottom Row: Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onOpenDepositForUser(member)}
                  className="text-[11px] font-medium text-[#E8694A] hover:underline flex items-center gap-1"
                  title="Log a payment / fund contribution"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>Add Funds</span>
                </button>

                {!isPositive ? (
                  <>
                    <button
                      onClick={() => setSettleTargetUser(member)}
                      className="text-[11px] font-semibold text-[#E8694A] hover:text-[#D2583A] flex items-center gap-1 ml-1 cursor-pointer"
                      title="1-Click Settle Up via Venmo / Cash App / PayPal"
                    >
                      <Zap className="h-3.5 w-3.5 text-[#E8694A]" />
                      <span>Settle Up</span>
                    </button>

                    <button
                      onClick={() => handleNudge(member)}
                      disabled={nudgeLoading === member.id || nudgedUserId === member.id}
                      className="text-[11px] font-medium text-[#6B6B6B] hover:text-[#D4870E] flex items-center gap-1 ml-1 disabled:opacity-60 cursor-pointer"
                      title="Send friendly settlement reminder"
                    >
                      {nudgeLoading === member.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[#D4870E]" />
                      ) : (
                        <Send className="h-3 w-3 text-[#D4870E]" />
                      )}
                      <span>
                        {nudgeLoading === member.id
                          ? 'Sending...'
                          : nudgedUserId === member.id
                          ? 'Nudged!'
                          : 'Nudge'}
                      </span>
                    </button>
                  </>
                ) : (
                  !isCurrentActive && (
                    <button
                      onClick={() => setSettleTargetUser(member)}
                      className="text-[11px] font-semibold text-[#5A9A6B] hover:text-[#437A65] flex items-center gap-1 ml-1 cursor-pointer"
                      title={`Send money to ${member.name} via their preferred P2P provider`}
                    >
                      <Zap className="h-3.5 w-3.5 text-[#5A9A6B]" />
                      <span>Pay Member</span>
                    </button>
                  )
                )}

                {/* Admin-only: Role Management */}
                {canManage && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => setManagingUserId(isManaging ? null : member.id)}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#6B6B6B] hover:text-[#2D2D2D] px-1.5 py-0.5 rounded border border-[#E0DAD1] hover:border-[#2D2D2D] transition"
                      title="Manage member role"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      <span>Roles</span>
                      <ChevronDown className={`h-3 w-3 transition-transform ${isManaging ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleRemoveMember(member)}
                      disabled={removeLoading === member.id}
                      className="flex items-center gap-1 text-[11px] font-medium text-[#C9553D] hover:text-red-700 px-1.5 py-0.5 rounded border border-[#C9553D]/30 hover:border-red-400 transition disabled:opacity-50"
                      title="Remove member from pool"
                    >
                      {removeLoading === member.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Role Change Dropdown (expanded) */}
              {isManaging && canManage && (
                <div className="border border-[#E0DAD1] rounded-md p-2 bg-[#FAFAF8] flex flex-wrap gap-1.5">
                  {Object.entries(ROLE_LABELS)
                    .filter(([role]) => role !== 'champion')
                    .map(([role, label]) => (
                      <button
                        key={role}
                        disabled={roleLoading === member.id || member.role === role}
                        onClick={() => handleRoleChange(member, role)}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition flex items-center gap-1 ${
                          member.role === role
                            ? 'bg-[#FDF0EC] border-[#E8694A]/40 text-[#E8694A] cursor-default'
                            : 'bg-white border-[#E0DAD1] text-[#2D2D2D] hover:border-[#2D2D2D] hover:bg-[#F0EBE3]'
                        } disabled:opacity-60`}
                      >
                        {roleLoading === member.id && member.role !== role ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : null}
                        {label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 1-Click Settle Up Modal */}
      {settleTargetUser && (
        <React.Suspense fallback={null}>
          <SettleUpModal
            pool={pool}
            currentUser={activeUser}
            targetUser={settleTargetUser}
            onClose={() => setSettleTargetUser(null)}
          />
        </React.Suspense>
      )}

      {/* Customized Confirmation Dialog */}
      {confirmConfig && (
        <AlertDialogModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          type={confirmConfig.type}
          confirmText={confirmConfig.confirmText}
          cancelText={confirmConfig.cancelText}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}

    </div>
  );
};
