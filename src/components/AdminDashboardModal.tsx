import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  Users, 
  Building2, 
  Layers, 
  Sliders, 
  Activity, 
  Trash2, 
  UserCheck, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Search,
  Edit2,
  Key,
  Database,
  Globe,
  Package,
  DollarSign,
  Sparkles,
  Cpu,
  Coins,
  ChevronDown,
  ChevronRight,
  Eye,
  BarChart3,
  AlertTriangle,
  ShoppingBag,
  ExternalLink,
  Plus,
  MousePointer,
  Upload,
  Image as ImageIcon,
  Loader2,
  Archive,
  RotateCcw
} from 'lucide-react';
import { getAuthToken, AuthUser, isOrganizationsEnabled } from '../lib/api';
import { getDefaultAvatarUrl } from '../lib/avatar';
import { AlertDialogModal } from './AlertDialogModal';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  authUser?: AuthUser | null;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({ 
  isOpen, 
  onClose,
  authUser
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'orgs' | 'pools' | 'ai' | 'telemetry' | 'settings'>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error' | 'success' | 'confirm';
    confirmText?: string;
    onConfirm?: () => void;
  } | null>(null);

  // Data states
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [orgs, setOrgs] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [poolSearch, setPoolSearch] = useState('');
  const [aiUsageData, setAiUsageData] = useState<any>(null);
  const [telemetryStats, setTelemetryStats] = useState<any>(null);
  const [telemetryDays, setTelemetryDays] = useState<number>(7);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({
    registration_enabled: 'true',
    maintenance_mode: 'false',
    system_notice: 'Welcome to PantryPool Platform!'
  });

  // Modal edit states
  const [editingUser, setEditingUser] = useState<{
    id: string;
    name: string;
    email: string;
    systemRole: string;
    newPassword?: string;
  } | null>(null);

  const [editingPool, setEditingPool] = useState<{
    id: string;
    name: string;
    category: string;
    currency: string;
    description: string;
  } | null>(null);

  const [editingOrg, setEditingOrg] = useState<{
    id: string;
    name: string;
    tier: string;
  } | null>(null);

  const [savingUser, setSavingUser] = useState(false);
  const [savingPool, setSavingPool] = useState(false);
  const [savingOrg, setSavingOrg] = useState(false);


  const isSuperAdmin = !authUser || authUser.systemRole === 'superadmin' || authUser.systemRole === 'admin';

  const token = getAuthToken();

  const fetchAdminData = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Stats & Health & AI Telemetry
      const [statsRes, healthRes, usersRes, orgsRes, poolsRes, setRes, aiRes, telemetryRes] = await Promise.all([
        fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/health'),
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/organizations', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/pools', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/settings', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/ai-usage', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
        fetch(`/api/admin/telemetry/stats?days=${telemetryDays}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
      ]);

      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      } else if (statsData.error) {
        setError(statsData.error);
      }

      const healthData = await healthRes.json();
      if (healthData) setHealth(healthData);

      const usersData = await usersRes.json();
      if (usersData.success) setUsers(usersData.users || []);

      const orgsData = await orgsRes.json();
      if (orgsData.success) setOrgs(orgsData.organizations || []);

      const poolsData = await poolsRes.json();
      if (poolsData.success) setPools(poolsData.pools || []);

      const setData = await setRes.json();
      if (setData.success) setSettings(prev => ({ ...prev, ...setData.settings }));

      if (aiRes && aiRes.ok) {
        const aiData = await aiRes.json();
        if (aiData.success) setAiUsageData(aiData);
      }

      if (telemetryRes && telemetryRes.ok) {
        const tData = await telemetryRes.json();
        if (tData.success) setTelemetryStats(tData.stats);
      }


    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAdminData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Toggle user system role (admin <-> user)
  const handleToggleUserRole = async (userId: string, currentRole: string) => {
    const nextRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ systemRole: nextRole })
      });
      const data = await res.json();
      if (data.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, systemRole: nextRole } : u));
        setSuccessMsg(`User system role updated to ${nextRole}`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to update user role');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update user role');
    }
  };

  // Save User Edit & Password Reset
  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    setError(null);
    try {
      const bodyPayload: any = {
        name: editingUser.name.trim(),
        email: editingUser.email.trim(),
        systemRole: editingUser.systemRole
      };
      if (editingUser.newPassword && editingUser.newPassword.trim().length > 0) {
        if (editingUser.newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long');
        }
        bodyPayload.password = editingUser.newPassword;
      }

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update user');

      setUsers(users.map(u => u.id === editingUser.id ? { 
        ...u, 
        name: editingUser.name, 
        email: editingUser.email,
        systemRole: editingUser.systemRole
      } : u));
      
      setEditingUser(null);
      setSuccessMsg('User profile & credentials updated successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  // Delete / Archive User with Confirmation Modal
  const handleDeleteUser = (userId: string, userName: string, isArchived: boolean = false) => {
    const isPurge = isArchived;
    setConfirmConfig({
      isOpen: true,
      title: isPurge ? 'Permanent GDPR Purge: User Account' : 'Archive User Account (Audit)',
      message: isPurge
        ? `Are you sure you want to permanently delete user "${userName}"? This will execute a permanent GDPR purge, irreversibly wiping all credentials, memberships, and personal data. This cannot be undone.`
        : `Are you sure you want to archive user "${userName}" for audit purposes? This will deactivate the user and revoke all active sessions while preserving historical ledger and audit records.`,
      type: isPurge ? 'error' : 'warning',
      confirmText: isPurge ? 'Purge User (GDPR)' : 'Archive User',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/users/${userId}${isPurge ? '?gdpr=true' : ''}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) {
            if (isPurge) {
              setUsers(users.filter(u => u.id !== userId));
              setSuccessMsg(`User purged successfully (GDPR)`);
            } else {
              setUsers(users.map(u => u.id === userId ? { ...u, isArchived: true, archivedAt: new Date().toISOString() } : u));
              setSuccessMsg(`User archived successfully for audit`);
            }
            setTimeout(() => setSuccessMsg(null), 3000);
          } else {
            setError(data.error || 'Failed to process user delete request');
          }
        } catch (err: any) {
          setError(err.message || 'Failed to delete user');
        }
      }
    });
  };

  // Restore User
  const handleRestoreUser = async (userId: string, userName: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, isArchived: false, archivedAt: null } : u));
        setSuccessMsg(`User "${userName}" restored successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to restore user');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to restore user');
    }
  };

  // Save Pool Edit
  const handleSavePoolEdit = async () => {
    if (!editingPool) return;
    setSavingPool(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pools/${editingPool.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingPool.name.trim(),
          category: editingPool.category.trim(),
          currency: editingPool.currency.trim(),
          description: editingPool.description.trim()
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update pool');

      setPools(pools.map(p => p.id === editingPool.id ? { 
        ...p, 
        name: editingPool.name, 
        category: editingPool.category,
        currency: editingPool.currency,
        description: editingPool.description
      } : p));
      
      setEditingPool(null);
      setSuccessMsg('Pantry pool details updated successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update pool');
    } finally {
      setSavingPool(false);
    }
  };

  // Delete / Archive Pool with Confirmation Modal
  const handleDeletePool = (poolId: string, poolName: string, isArchived: boolean = false) => {
    const isPurge = isArchived;
    setConfirmConfig({
      isOpen: true,
      title: isPurge ? 'Permanent GDPR Purge: Pantry Pool' : 'Archive Pantry Pool (Audit)',
      message: isPurge
        ? `Are you sure you want to permanently delete pool "${poolName}"? This will execute a permanent GDPR purge, permanently wiping all catalog items, transactions, and audit records. This cannot be undone.`
        : `Are you sure you want to archive pantry pool "${poolName}"? For audit purposes, this will deactivate the pool while preserving all items, member balances, and financial transaction ledger history.`,
      type: isPurge ? 'error' : 'warning',
      confirmText: isPurge ? 'Purge Pool (GDPR)' : 'Archive Pool',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/pools/${poolId}${isPurge ? '?gdpr=true' : ''}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (data.success) {
            if (isPurge) {
              setPools(pools.filter(p => p.id !== poolId));
              setSuccessMsg(`Pantry pool purged successfully (GDPR)`);
            } else {
              setPools(pools.map(p => p.id === poolId ? { ...p, isArchived: true, archivedAt: new Date().toISOString() } : p));
              setSuccessMsg(`Pantry pool archived successfully for audit`);
            }
            setTimeout(() => setSuccessMsg(null), 3000);
          } else {
            setError(data.error || 'Failed to process pool delete request');
          }
        } catch (err: any) {
          setError(err.message || 'Failed to delete pool');
        }
      }
    });
  };

  // Restore Pool
  const handleRestorePool = async (poolId: string, poolName: string) => {
    try {
      const res = await fetch(`/api/admin/pools/${poolId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setPools(pools.map(p => p.id === poolId ? { ...p, isArchived: false, archivedAt: null } : p));
        setSuccessMsg(`Pantry pool "${poolName}" restored successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to restore pool');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to restore pool');
    }
  };

  // Update Org Tier
  const handleUpdateOrgTier = async (orgId: string, newTier: string) => {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/tier`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tier: newTier })
      });
      const data = await res.json();
      if (data.success) {
        setOrgs(orgs.map(o => o.id === orgId ? { ...o, tier: newTier } : o));
        setSuccessMsg(`Organization tier updated to ${newTier}`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to update organization tier');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update tier');
    }
  };

  // Delete / Archive Organization
  const handleDeleteOrg = (orgId: string, orgName: string, isArchived: boolean = false) => {
    const isPurge = isArchived;
    setConfirmConfig({
      isOpen: true,
      title: isPurge ? 'Permanent GDPR Purge: Organization' : 'Archive Organization Workspace (Audit)',
      message: isPurge
        ? `Are you sure you want to permanently delete workspace "${orgName}"? This will execute a permanent GDPR purge, irreversibly deleting the organization workspace and unlinking all pools. This cannot be undone.`
        : `Are you sure you want to archive workspace "${orgName}"? For audit purposes, this will archive the workspace and its associated pantry pools while preserving financial transaction and ledger history.`,
      type: isPurge ? 'error' : 'warning',
      confirmText: isPurge ? 'Purge Workspace (GDPR)' : 'Archive Workspace',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/organizations/${orgId}${isPurge ? '?gdpr=true' : ''}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          const data = await res.json();
          if (data.success) {
            if (isPurge) {
              setOrgs(orgs.filter(o => o.id !== orgId));
              setSuccessMsg(`Workspace "${orgName}" purged successfully (GDPR).`);
            } else {
              setOrgs(orgs.map(o => o.id === orgId ? { ...o, isArchived: true, archivedAt: new Date().toISOString() } : o));
              setPools(pools.map(p => p.organizationId === orgId ? { ...p, isArchived: true, archivedAt: new Date().toISOString() } : p));
              setSuccessMsg(`Workspace "${orgName}" archived successfully for audit.`);
            }
            setTimeout(() => setSuccessMsg(null), 3000);
          } else {
            setError(data.error || 'Failed to delete workspace.');
          }
        } catch (err: any) {
          setError(err.message || 'Failed to delete organization.');
        }
      }
    });
  };

  // Restore Organization
  const handleRestoreOrg = async (orgId: string, orgName: string) => {
    try {
      const res = await fetch(`/api/admin/organizations/${orgId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setOrgs(orgs.map(o => o.id === orgId ? { ...o, isArchived: false, archivedAt: null } : o));
        setSuccessMsg(`Organization "${orgName}" restored successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to restore organization');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to restore organization');
    }
  };

  // Save Org Edit
  const handleSaveOrgEdit = async () => {
    if (!editingOrg) return;
    if (!editingOrg.name.trim()) {
      setError('Organization name cannot be empty');
      return;
    }
    setSavingOrg(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${editingOrg.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingOrg.name.trim(),
          tier: editingOrg.tier
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update organization');

      setOrgs(orgs.map(o => o.id === editingOrg.id ? {
        ...o,
        name: editingOrg.name.trim(),
        tier: editingOrg.tier
      } : o));

      setEditingOrg(null);
      setSuccessMsg('Organization updated successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update organization');
    } finally {
      setSavingOrg(false);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ settings })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccessMsg('Platform settings saved successfully.');
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredPools = pools.filter(p => 
    p.name?.toLowerCase().includes(poolSearch.toLowerCase()) || 
    p.category?.toLowerCase().includes(poolSearch.toLowerCase()) ||
    p.orgName?.toLowerCase().includes(poolSearch.toLowerCase())
  );

  interface NavItem {
    id: 'overview' | 'users' | 'orgs' | 'pools' | 'ai' | 'telemetry' | 'settings';
    label: string;
    shortLabel: string;
    icon: any;
    description: string;
    count?: number;
  }

  interface NavGroup {
    title: string;
    items: NavItem[];
  }

  const navigationGroups: NavGroup[] = [
    {
      title: 'Management',
      items: [
        { id: 'overview', label: 'Overview & Health', shortLabel: 'Overview', icon: Activity, description: 'High-level KPI metrics, health checks, and platform telemetry' },
        { id: 'users', label: 'Users & Roles', shortLabel: 'Users', icon: ShieldCheck, count: users.length, description: 'Manage accounts, system roles, and account statuses' },
        ...(isOrganizationsEnabled ? [{ id: 'orgs' as const, label: 'Organizations', shortLabel: 'Orgs', icon: Building2, count: orgs.length, description: 'Enterprise and team multi-tenant workspaces' }] : []),
        { id: 'pools', label: 'Pantry Pools', shortLabel: 'Pools', icon: Layers, count: pools.length, description: 'Active pantry pools, balances, and configurations' },
      ]
    },
    {
      title: 'Intelligence & Telemetry',
      items: [
        { id: 'ai', label: 'AI Telemetry & Costs', shortLabel: 'AI & OCR', icon: Sparkles, description: 'Token usage, cost telemetry, model routing, and OCR receipts' },
        { id: 'telemetry', label: 'Product Telemetry', shortLabel: 'Telemetry', icon: BarChart3, description: 'Friction points, drop-offs, and feature adoption tracking' },
      ]
    },
    {
      title: 'Growth & System',
      items: [
        { id: 'settings', label: 'System Settings', shortLabel: 'Settings', icon: Sliders, description: 'Global feature flags, Stripe credentials, and system limits' },
      ]
    }
  ];

  const allNavItems: NavItem[] = navigationGroups.flatMap(g => g.items);
  const currentTabMeta = allNavItems.find(item => item.id === activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D2D2D]/40 animate-fadeIn">
      <div className="relative w-full max-w-6xl bg-white border border-[#E0DAD1] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh] text-[#2D2D2D]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDE8E0] bg-[#FAFAF8] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#FDF0EC] text-[#E8694A]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#2D2D2D] flex items-center gap-2">
                Platform Admin Console
                <span className="bg-[#EDF5EF] text-[#5A9A6B] text-[10px] font-bold px-2 py-0.5 rounded-full border border-[#5A9A6B]/30 font-mono-financial uppercase tracking-wider">
                  Superadmin
                </span>
              </h2>
              <p className="text-xs text-[#6B6B6B]">Central management for workspaces, pools, telemetry, and system configuration</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAdminData}
              title="Refresh Data"
              className="p-2 rounded-lg bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] transition border border-[#E0DAD1] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              title="Close Console"
              className="p-2 rounded-lg bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#6B6B6B] hover:text-[#2D2D2D] transition border border-[#E0DAD1] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2-Column Responsive Body */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          
          {/* Left Sidebar Navigation */}
          <aside className="w-full lg:w-64 shrink-0 bg-[#FAF8F5] border-b lg:border-b-0 lg:border-r border-[#E0DAD1] flex flex-col overflow-y-auto">
            
            {/* Mobile & Tablet Portrait View: Clean Horizontal Scrollable Segmented Bar */}
            <div className="lg:hidden flex items-center gap-1.5 p-2.5 overflow-x-auto border-b border-[#E0DAD1] bg-[#F0EBE3]">
              {allNavItems.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-[#E8694A] text-white shadow-xs font-semibold'
                        : 'bg-white/80 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.shortLabel}</span>
                    {tab.count !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        active ? 'bg-white/25 text-white' : 'bg-[#EDE8E0] text-[#2D2D2D]'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Desktop View: Grouped Vertical Sidebar Navigation */}
            <div className="hidden lg:flex flex-col p-3 space-y-4 flex-1">
              {navigationGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#9A9A9A]">
                    {group.title}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((tab) => {
                      const Icon = tab.icon;
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition text-left cursor-pointer ${
                            active
                              ? 'bg-[#FDF0EC] text-[#E8694A] font-semibold shadow-xs border border-[#E8694A]/25'
                              : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#E8694A]' : 'text-[#6B6B6B]'}`} />
                            <span className="truncate">{tab.label}</span>
                          </div>
                          {tab.count !== undefined && (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 font-mono-financial ${
                              active
                                ? 'bg-[#E8694A] text-white'
                                : 'bg-[#EDE8E0] text-[#6B6B6B]'
                            }`}>
                              {tab.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar Footer Status Indicator */}
            <div className="hidden lg:block p-3 border-t border-[#E0DAD1] bg-[#F5F2EC] mt-auto">
              <div className="flex items-center justify-between text-[11px] text-[#6B6B6B]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Platform SRE</span>
                </span>
                <span className="font-semibold text-emerald-700 font-mono-financial">Operational</span>
              </div>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white min-w-0">
            
            {/* Top Bar with Breadcrumb / Section Context */}
            <div className="hidden lg:flex items-center justify-between px-6 lg:px-8 py-3 border-b border-[#EDE8E0] bg-[#FAF8F5]/60 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#9A9A9A]">Admin Console</span>
                <span className="text-xs text-[#9A9A9A]">/</span>
                <span className="text-xs font-semibold text-[#2D2D2D]">{currentTabMeta?.label || activeTab}</span>
              </div>
              {currentTabMeta?.description && (
                <span className="text-xs text-[#6B6B6B]">{currentTabMeta.description}</span>
              )}
            </div>

            {/* Alert Notifications */}
            {error && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-[#FDF0EC] border border-[#C9553D]/30 text-[#C9553D] text-xs flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
                <button onClick={() => setError(null)} className="cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {successMsg && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-[#EDF5EF] border border-[#5A9A6B]/30 text-[#5A9A6B] text-xs flex items-center gap-2 shrink-0">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Main Content Body */}
            <div className="p-4 sm:p-6 lg:p-8 overflow-y-auto flex-1 space-y-6">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="text-xs text-[#6B6B6B] mb-1">Total Users</div>
                  <div className="text-2xl font-semibold text-[#2D2D2D] font-mono-financial">{stats?.totalUsers || 0}</div>
                </div>
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="text-xs text-[#6B6B6B] mb-1">Organizations</div>
                  <div className="text-2xl font-semibold text-[#E8694A] font-mono-financial">{stats?.totalOrganizations || 0}</div>
                </div>
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="text-xs text-[#6B6B6B] mb-1">Active Pools</div>
                  <div className="text-2xl font-semibold text-[#5A9A6B] font-mono-financial">{stats?.totalPools || 0}</div>
                </div>
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="text-xs text-[#6B6B6B] mb-1">Pantry Items</div>
                  <div className="text-2xl font-semibold text-[#8FB8DE] font-mono-financial">{stats?.totalItems || 0}</div>
                </div>
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="text-xs text-[#6B6B6B] mb-1">Transactions</div>
                  <div className="text-2xl font-semibold text-[#D4870E] font-mono-financial">{stats?.totalTransactions || 0}</div>
                </div>
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="text-xs text-[#6B6B6B] mb-1">Volume Processed</div>
                  <div className="text-2xl font-semibold text-[#5A9A6B] font-mono-financial">${stats?.totalVolume || '0.00'}</div>
                </div>
              </div>

              {/* Infrastructure Status Banner */}
              <div className="bg-[#FAFAF8] border border-[#E0DAD1] p-5 rounded-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EDE8E0] pb-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#2D2D2D] mb-0.5 flex items-center gap-2">
                      <Database className="w-4 h-4 text-[#5A9A6B]" />
                      Platform Infrastructure & Edge Distributed Architecture
                    </h4>
                    <p className="text-xs text-[#6B6B6B]">Distributed edge database cluster and serverless runtime</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#5A9A6B] bg-[#EDF5EF] px-3 py-1.5 rounded-md border border-[#5A9A6B]/20 font-medium whitespace-nowrap self-start sm:self-auto font-mono-financial">
                    <span className="w-2 h-2 rounded-full bg-[#5A9A6B] animate-pulse" />
                    Edge Database & Runtime Connected
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-md border border-[#E0DAD1] text-xs">
                    <div className="text-[#6B6B6B] flex items-center gap-1.5 mb-1">
                      <Database className="w-3.5 h-3.5 text-[#E8694A]" />
                      <span>Database Engine</span>
                    </div>
                    <div className="font-semibold text-[#2D2D2D]">Distributed SQLite Database</div>
                    <div className="text-[11px] text-[#6B6B6B] mt-0.5">Latency: {health?.checks?.database?.latencyMs ?? health?.latencyMs ?? 12}ms</div>
                  </div>

                  <div className="bg-white p-3 rounded-md border border-[#E0DAD1] text-xs">
                    <div className="text-[#6B6B6B] flex items-center gap-1.5 mb-1">
                      <Globe className="w-3.5 h-3.5 text-[#5A9A6B]" />
                      <span>Edge Serverless Runtime</span>
                    </div>
                    <div className="font-semibold text-[#2D2D2D]">High-Availability Edge Runtime</div>
                    <div className="text-[11px] text-[#6B6B6B] mt-0.5">Region: {health?.checks?.edgeRuntime?.region || 'Global Anycast Edge'}</div>
                  </div>

                  <div className="bg-white p-3 rounded-md border border-[#E0DAD1] text-xs">
                    <div className="text-[#6B6B6B] flex items-center gap-1.5 mb-1">
                      <Activity className="w-3.5 h-3.5 text-[#D4870E]" />
                      <span>SRE Health Monitoring</span>
                    </div>
                    <div className="font-semibold text-[#2D2D2D]">Continuous Telemetry Active</div>
                    <div className="text-[11px] text-[#6B6B6B] mt-0.5">Automated Multi-Channel Probes</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                  <input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md py-2 pl-10 pr-4 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>
                <span className="text-xs text-[#6B6B6B] font-mono-financial">Showing {filteredUsers.length} of {users.length} users</span>
              </div>

              <div className="bg-white rounded-lg border border-[#E0DAD1] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[650px]">
                    <thead className="bg-[#F0EBE3] text-[#6B6B6B] font-medium text-xs border-b border-[#E0DAD1]">
                      <tr>
                        <th className="p-3.5">User Profile</th>
                        <th className="p-3.5">System Role</th>
                        <th className="p-3.5">Pools</th>
                        <th className="p-3.5">Registered Date</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE8E0]">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-[#FAFAF8] transition">
                          <td className="p-3.5">
                            <div className="flex items-center gap-3">
                              <img
                                src={u.avatarUrl || getDefaultAvatarUrl(u.name)}
                                alt={u.name}
                                className="w-8 h-8 rounded-full object-cover border border-[#E0DAD1] bg-[#F0EBE3]"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = getDefaultAvatarUrl(u.name);
                                }}
                              />
                              <div>
                                <div className="font-medium text-[#2D2D2D] flex items-center gap-1.5">
                                  <span>{u.name || 'Unnamed User'}</span>
                                  {u.isArchived && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                                      title={`Archived: ${u.archivedAt ? new Date(u.archivedAt).toLocaleString() : 'Audit record'}`}
                                    >
                                      <Archive className="w-2.5 h-2.5" />
                                      Archived
                                    </span>
                                  )}
                                </div>
                                <div className="text-[#6B6B6B] text-[11px]">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold font-mono-financial ${
                              u.systemRole === 'admin' || u.systemRole === 'superadmin'
                                ? 'bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/40'
                                : 'bg-[#F0EBE3] text-[#6B6B6B]'
                            }`}>
                              {u.systemRole}
                            </span>
                          </td>
                          <td className="p-3.5 text-[#6B6B6B] font-mono-financial">
                            <span className="bg-[#F0EBE3] px-2 py-0.5 rounded text-[11px] border border-[#E0DAD1]">
                              {u.poolCount || 0} pools
                            </span>
                          </td>
                          <td className="p-3.5 text-[#6B6B6B] font-mono-financial">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit User Button */}
                              <button
                                onClick={() => setEditingUser({
                                  id: u.id,
                                  name: u.name || '',
                                  email: u.email || '',
                                  systemRole: u.systemRole || 'user',
                                  newPassword: ''
                                })}
                                title="Edit User Profile & Credentials"
                                className="p-1.5 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] transition cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Toggle Role Button */}
                              <button
                                onClick={() => handleToggleUserRole(u.id, u.systemRole)}
                                title={u.systemRole === 'admin' ? 'Demote to Regular User' : 'Promote to Platform Admin'}
                                className="px-2 py-1 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>{u.systemRole === 'admin' ? 'Remove Admin' : 'Make Admin'}</span>
                              </button>

                              {/* Delete or Restore Button */}
                              {u.isArchived ? (
                                <>
                                  <button
                                    onClick={() => handleRestoreUser(u.id, u.name)}
                                    title="Restore User Account"
                                    className="p-1.5 rounded-md bg-[#EDF5EF] hover:bg-[#E3EFE6] text-[#5A9A6B] border border-[#5A9A6B]/30 transition cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUser(u.id, u.name, true)}
                                    title="Permanent GDPR Purge"
                                    className="p-1.5 rounded-md bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.name, false)}
                                  title="Archive User (Audit)"
                                  className="p-1.5 rounded-md bg-[#FDF0EC] hover:bg-[#FDF0EC]/80 text-[#C9553D] border border-[#C9553D]/30 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ORGANIZATIONS */}
          {activeTab === 'orgs' && (
            <div className="bg-white rounded-lg border border-[#E0DAD1] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[650px]">
                  <thead className="bg-[#F0EBE3] text-[#6B6B6B] font-medium text-xs border-b border-[#E0DAD1]">
                    <tr>
                      <th className="p-3.5">Organization Workspace</th>
                      <th className="p-3.5">Owner Profile</th>
                      <th className="p-3.5">Pools Count</th>
                      <th className="p-3.5">Tier Plan</th>
                      <th className="p-3.5">Tier Override</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDE8E0]">
                    {orgs.map((o) => (
                      <tr key={o.id} className="hover:bg-[#FAFAF8] transition">
                        <td className="p-3.5 font-medium text-[#2D2D2D]">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-[#E8694A]" />
                            <span>{o.name}</span>
                            {o.isArchived && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                                title={`Archived: ${o.archivedAt ? new Date(o.archivedAt).toLocaleString() : 'Audit record'}`}
                              >
                                <Archive className="w-2.5 h-2.5" />
                                Archived
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="text-[#2D2D2D] font-medium">{o.ownerName || 'Unknown Owner'}</div>
                          <div className="text-[#6B6B6B] text-[11px]">{o.ownerEmail}</div>
                        </td>
                        <td className="p-3.5 text-[#6B6B6B] font-mono-financial">
                          {o.poolsCount} pools
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold font-mono-financial ${
                            o.tier === 'enterprise'
                              ? 'bg-purple-100 text-purple-800 border border-purple-300 font-bold'
                              : o.tier === 'plus'
                              ? 'bg-[#FFF8EB] text-[#D4870E] border border-[#D4870E]/40'
                              : (o.tier === 'standard' || o.tier === 'pro')
                              ? 'bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/40'
                              : 'bg-[#F0EBE3] text-[#6B6B6B]'
                          }`}>
                            {o.tier === 'enterprise' ? 'Enterprise' : o.tier === 'plus' ? 'Plus' : (o.tier === 'standard' || o.tier === 'pro' ? 'Standard' : 'Community')}
                          </span>
                        </td>
                        <td className="p-3.5">
                          <select
                            value={o.tier === 'enterprise' ? 'enterprise' : o.tier === 'plus' ? 'plus' : (o.tier === 'standard' || o.tier === 'pro') ? 'standard' : 'community'}
                            onChange={(e) => handleUpdateOrgTier(o.id, e.target.value)}
                            className="bg-white border border-[#E0DAD1] text-[#2D2D2D] rounded-md px-2 py-1 text-[11px] focus:outline-none cursor-pointer"
                          >
                            <option value="community">Community (Free)</option>
                            <option value="standard">Hosted Standard ($5/mo)</option>
                            <option value="plus">Hosted Plus ($12/mo)</option>
                            <option value="enterprise">Enterprise (Unlimited)</option>
                          </select>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Edit Organization Button */}
                            <button
                              onClick={() => setEditingOrg({
                                id: o.id,
                                name: o.name || '',
                                tier: o.tier || 'community'
                              })}
                              title="Edit Organization Workspace"
                              className="p-1.5 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] transition cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete or Restore Organization Button */}
                            {o.isArchived ? (
                              <>
                                <button
                                  onClick={() => handleRestoreOrg(o.id, o.name)}
                                  title="Restore Organization Workspace"
                                  className="p-1.5 rounded-md bg-[#EDF5EF] hover:bg-[#E3EFE6] text-[#5A9A6B] border border-[#5A9A6B]/30 transition cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteOrg(o.id, o.name, true)}
                                  title="Permanent GDPR Purge"
                                  className="p-1.5 rounded-md bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleDeleteOrg(o.id, o.name, false)}
                                title="Archive Organization Workspace (Audit)"
                                className="p-1.5 rounded-md bg-[#FDF0EC] hover:bg-[#FDF0EC]/80 text-[#C9553D] border border-[#C9553D]/30 transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: POOLS */}
          {activeTab === 'pools' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                  <input
                    type="text"
                    placeholder="Search pantry pools by name, category, or workspace..."
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md py-2 pl-10 pr-4 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>
                <span className="text-xs text-[#6B6B6B] font-mono-financial">Showing {filteredPools.length} of {pools.length} pools</span>
              </div>

              <div className="bg-white rounded-lg border border-[#E0DAD1] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead className="bg-[#F0EBE3] text-[#6B6B6B] font-medium text-xs border-b border-[#E0DAD1]">
                      <tr>
                        <th className="p-3.5">Pool Name</th>
                        <th className="p-3.5">Category</th>
                        <th className="p-3.5">Organization</th>
                        <th className="p-3.5">Currency</th>
                        <th className="p-3.5">Members</th>
                        <th className="p-3.5">Items</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE8E0]">
                      {filteredPools.map((p) => (
                        <tr key={p.id} className="hover:bg-[#FAFAF8] transition">
                          <td className="p-3.5 font-medium text-[#2D2D2D]">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-[#E8694A] shrink-0" />
                              <div>
                                <div className="font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                                  <span>{p.name}</span>
                                  {p.isArchived && (
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                                      title={`Archived: ${p.archivedAt ? new Date(p.archivedAt).toLocaleString() : 'Audit record'}`}
                                    >
                                      <Archive className="w-2.5 h-2.5" />
                                      Archived
                                    </span>
                                  )}
                                </div>
                                {p.description && <div className="text-[11px] text-[#6B6B6B] truncate max-w-xs">{p.description}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span className="bg-[#F0EBE3] text-[#2D2D2D] px-2 py-0.5 rounded text-[10px] font-medium border border-[#E0DAD1]">
                              {p.category || 'General'}
                            </span>
                          </td>
                          <td className="p-3.5 text-[#6B6B6B]">{p.orgName || 'Personal Workspace'}</td>
                          <td className="p-3.5 font-mono-financial text-[#5A9A6B] font-semibold">{p.currency || '$'}</td>
                          <td className="p-3.5 text-[#2D2D2D] font-mono-financial font-medium">
                            <span className="inline-flex items-center gap-1 bg-[#EDF5EF] text-[#5A9A6B] px-2 py-0.5 rounded border border-[#5A9A6B]/20">
                              <Users className="w-3 h-3" />
                              <span>{p.memberCount ?? 0} {p.memberCount === 1 ? 'member' : 'members'}</span>
                            </span>
                          </td>
                          <td className="p-3.5 text-[#2D2D2D] font-mono-financial font-medium">
                            <span className="inline-flex items-center gap-1 bg-[#F0EBE3] text-[#6B6B6B] px-2 py-0.5 rounded border border-[#E0DAD1]">
                              <Package className="w-3 h-3" />
                              <span>{p.itemCount ?? 0} items</span>
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Edit Pool Button */}
                              <button
                                onClick={() => setEditingPool({
                                  id: p.id,
                                  name: p.name || '',
                                  category: p.category || 'Office Pantry',
                                  currency: p.currency || '$',
                                  description: p.description || ''
                                })}
                                title="Edit Pantry Pool"
                                className="p-1.5 rounded-md bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] border border-[#E0DAD1] transition cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete or Restore Pool Button */}
                              {p.isArchived ? (
                                <>
                                  <button
                                    onClick={() => handleRestorePool(p.id, p.name)}
                                    title="Restore Pantry Pool"
                                    className="p-1.5 rounded-md bg-[#EDF5EF] hover:bg-[#E3EFE6] text-[#5A9A6B] border border-[#5A9A6B]/30 transition cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePool(p.id, p.name, true)}
                                    title="Permanent GDPR Purge"
                                    className="p-1.5 rounded-md bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleDeletePool(p.id, p.name, false)}
                                  title="Archive Pantry Pool (Audit)"
                                  className="p-1.5 rounded-md bg-[#FDF0EC] hover:bg-[#FDF0EC]/80 text-[#C9553D] border border-[#C9553D]/30 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SYSTEM SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              
              <div className="bg-[#F0EBE3] p-5 rounded-lg border border-[#E0DAD1] space-y-4">
                <h4 className="text-sm font-semibold text-[#2D2D2D] mb-2 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#E8694A]" />
                  Platform Registration & Control Settings
                </h4>

                <div className="flex items-center justify-between py-2 border-b border-[#E0DAD1]">
                  <div>
                    <div className="text-xs font-medium text-[#2D2D2D]">Public User Registrations</div>
                    <div className="text-[11px] text-[#6B6B6B]">Allow new users to register accounts via email or Google</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={String(settings.registration_enabled) !== 'false'}
                    onChange={(e) => setSettings({ ...settings, registration_enabled: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 accent-[#E8694A] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#E0DAD1]">
                  <div>
                    <div className="text-xs font-medium text-[#2D2D2D]">Maintenance Mode</div>
                    <div className="text-[11px] text-[#6B6B6B]">Display maintenance announcement banner across all client apps</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={String(settings.maintenance_mode) === 'true'}
                    onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 accent-[#C9553D] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#E0DAD1]">
                  <div>
                    <div className="text-xs font-medium text-[#2D2D2D] flex items-center gap-1.5">
                      <span>Enable Sign in with Apple</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-medium text-[#6B6B6B] border border-[#E0DAD1]">Feature Flag</span>
                    </div>
                    <div className="text-[11px] text-[#6B6B6B]">Display "Sign in with Apple" button in auth dialogs</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={String(settings.apple_login_enabled) === 'true'}
                    onChange={(e) => setSettings({ ...settings, apple_login_enabled: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 accent-[#E8694A] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between py-2 border-b border-[#E0DAD1]">
                  <div>
                    <div className="text-xs font-medium text-[#2D2D2D] flex items-center gap-1.5">
                      <span>Enable Kiosk Mode</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-medium text-[#6B6B6B] border border-[#E0DAD1]">Feature Flag</span>
                    </div>
                    <div className="text-[11px] text-[#6B6B6B]">
                      Enable unattended self-service kiosk interface and tablet QR routing for breakrooms
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={String(settings.kiosk_mode_enabled) !== 'false'}
                    onChange={(e) => setSettings({ ...settings, kiosk_mode_enabled: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 accent-[#E8694A] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#E0DAD1] bg-white">
                  <div>
                    <div className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#E8694A]" />
                      TypeSafe AI Decision Engine (System One / Jev)
                    </div>
                    <div className="text-[11px] text-[#6B6B6B]">
                      Enable calibrated probabilistic AI for grocery haul classification, receipt item verification, and SKU deduplication
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={String(settings.typesafe_ai_enabled) !== 'false'}
                    onChange={(e) => setSettings({ ...settings, typesafe_ai_enabled: e.target.checked ? 'true' : 'false' })}
                    className="w-4 h-4 accent-[#E8694A] rounded cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#2D2D2D] mb-1.5">
                    Global System Announcement Notice
                  </label>
                  <input
                    type="text"
                    value={settings.system_notice || ''}
                    onChange={(e) => setSettings({ ...settings, system_notice: e.target.value })}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs text-[#2D2D2D] outline-none focus:border-[#E8694A]"
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="mt-4 px-6 py-2.5 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full text-xs transition flex items-center gap-2 shadow-xs"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Platform Settings</span>
                </button>
              </div>

            </div>
          )}

          {/* TAB 6: AI TELEMETRY & COSTS */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider">Total AI Scans</div>
                    <div className="p-2 rounded-md bg-[#FDF0EC] text-[#E8694A]">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[#2D2D2D] font-mono-financial">
                    {aiUsageData?.summary?.totalScans || 0}
                  </div>
                  <div className="text-[11px] text-[#6B6B6B] mt-1">Receipt OCR & natural language hauls</div>
                </div>

                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider">Tokens Processed</div>
                    <div className="p-2 rounded-md bg-[#EDF5EF] text-[#5A9A6B]">
                      <Cpu className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[#2D2D2D] font-mono-financial">
                    {(aiUsageData?.summary?.totalTokens || 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[#6B6B6B] mt-1">
                    Prompt: {(aiUsageData?.summary?.totalPromptTokens || 0).toLocaleString()} | Completion: {(aiUsageData?.summary?.totalCompletionTokens || 0).toLocaleString()}
                  </div>
                </div>

                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider">Cumulative Cost (USD)</div>
                    <div className="p-2 rounded-md bg-[#FDF0EC] text-[#E8694A]">
                      <Coins className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold text-[#E8694A] font-mono-financial">
                    ${(aiUsageData?.summary?.totalEstimatedCostUsd ?? 0).toFixed(6)}
                  </div>
                  <div className="text-[11px] text-[#6B6B6B] mt-1">
                    Avg ~${(aiUsageData?.summary?.avgCostPerScanUsd ?? 0.00017).toFixed(6)} per scan
                  </div>
                </div>

                <div className="bg-[#F0EBE3] p-4 rounded-lg border border-[#E0DAD1]">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-medium text-[#6B6B6B] uppercase tracking-wider">Primary Model</div>
                    <div className="p-2 rounded-md bg-[#EDF5EF] text-[#5A9A6B]">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-2 text-lg font-bold text-[#2D2D2D] font-mono-financial">
                    {aiUsageData?.summary?.activePrimaryModel || 'gemini-3.5-flash-lite'}
                  </div>
                  <div className="text-[11px] text-[#5A9A6B] mt-1 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#5A9A6B] inline-block animate-pulse"></span>
                    Operational & cost-optimized
                  </div>
                </div>
              </div>

              {/* TypeSafe Decision Engine Status Card */}
              <div className="bg-white p-4 rounded-lg border border-[#E0DAD1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-[#FDF0EC] text-[#E8694A]">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-2">
                      <span>TypeSafe System One Engine</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[#EDF5EF] text-[#5A9A6B]">
                        jev-latest
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6B6B6B] mt-0.5">
                      Fast, typed probabilistic judgments for haul item categorization, SKU deduplication, and receipt sanity pre-checks.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="w-2 h-2 rounded-full bg-[#5A9A6B]"></span>
                  <span className="text-xs font-medium text-[#2D2D2D]">Active &amp; Calibrated</span>
                </div>
              </div>

              {/* Model Breakdown */}
              {aiUsageData?.modelBreakdown && aiUsageData.modelBreakdown.length > 0 && (
                <div className="bg-[#F0EBE3] p-5 rounded-lg border border-[#E0DAD1]">
                  <h4 className="text-sm font-semibold text-[#2D2D2D] mb-3 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[#E8694A]" />
                    Model Consumption Breakdown
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {aiUsageData.modelBreakdown.map((m: any, idx: number) => (
                      <div key={idx} className="bg-white p-3 rounded border border-[#E0DAD1] space-y-1">
                        <div className="text-xs font-semibold text-[#2D2D2D] font-mono-financial">{m.model}</div>
                        <div className="text-[11px] text-[#6B6B6B] flex justify-between">
                          <span>Scans: {m.scanCount}</span>
                          <span>Tokens: {m.tokens.toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] font-medium text-[#E8694A] font-mono-financial">
                          Est. Cost: ${Number(m.costUsd || 0).toFixed(6)} USD
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent AI Scans Table */}
              <div className="bg-[#F0EBE3] p-5 rounded-lg border border-[#E0DAD1] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#E8694A]" />
                    Recent AI Scan Activity Ledger
                  </h4>
                  <span className="text-[11px] text-[#6B6B6B]">
                    Showing last {aiUsageData?.recentLogs?.length || 0} scan requests
                  </span>
                </div>

                <div className="overflow-x-auto border border-[#E0DAD1] rounded-lg bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#FAFAF8] border-b border-[#E0DAD1] text-[#6B6B6B]">
                        <th className="p-2.5 font-medium">Timestamp</th>
                        <th className="p-2.5 font-medium">User</th>
                        <th className="p-2.5 font-medium">Activity</th>
                        <th className="p-2.5 font-medium">Model</th>
                        <th className="p-2.5 font-medium text-right">Tokens (Prompt / Comp)</th>
                        <th className="p-2.5 font-medium text-right">Est. Cost</th>
                        <th className="p-2.5 font-medium text-center">Status</th>
                        <th className="p-2.5 font-medium text-center">Audit / Items</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE8E0]">
                      {(!aiUsageData?.recentLogs || aiUsageData.recentLogs.length === 0) ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-xs text-[#6B6B6B]">
                            No AI scans recorded yet. Scan a receipt to see real-time token telemetry here!
                          </td>
                        </tr>
                      ) : (
                        aiUsageData.recentLogs.map((log: any) => {
                          const isExpanded = expandedLogId === log.id;
                          const hasDetails = (log.parsedItems && log.parsedItems.length > 0) || (log.appliedItems && (log.appliedItems.items || log.appliedItems).length > 0);
                          const appliedItemsList = Array.isArray(log.appliedItems?.items) ? log.appliedItems.items : (Array.isArray(log.appliedItems) ? log.appliedItems : []);

                          return (
                            <React.Fragment key={log.id}>
                              <tr className="hover:bg-[#FAFAF8] transition-colors font-mono-financial">
                                <td className="p-2.5 text-[#6B6B6B] whitespace-nowrap">
                                  {new Date(log.createdAt).toLocaleString()}
                                </td>
                                <td className="p-2.5 text-[#2D2D2D] whitespace-nowrap font-sans font-medium">
                                  {log.userEmail || 'anonymous'}
                                </td>
                                <td className="p-2.5 text-[#2D2D2D] whitespace-nowrap font-sans">
                                  {log.activity === 'receipt_ocr' ? (
                                    <span className="inline-flex items-center gap-1 text-[#E8694A] bg-[#FDF0EC] px-2 py-0.5 rounded text-[11px] font-medium">
                                      <Sparkles className="w-3 h-3" /> Image OCR
                                    </span>
                                  ) : (log.activity?.startsWith('typesafe') || log.activity === 'catalog_deduplication') ? (
                                    <span className="inline-flex items-center gap-1 text-[#4F46E5] bg-[#EEF2FF] px-2 py-0.5 rounded text-[11px] font-medium">
                                      <Sparkles className="w-3 h-3" /> TypeSafe Eval
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-[#5A9A6B] bg-[#EDF5EF] px-2 py-0.5 rounded text-[11px] font-medium">
                                      Text Parse
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-[#2D2D2D] whitespace-nowrap text-[11px]">
                                  {log.model}
                                </td>
                                <td className="p-2.5 text-right whitespace-nowrap text-[#2D2D2D]">
                                  {log.totalTokens.toLocaleString()} <span className="text-[#6B6B6B] text-[10px]">({log.promptTokens}/{log.completionTokens})</span>
                                </td>
                                <td className="p-2.5 text-right whitespace-nowrap font-semibold text-[#E8694A]">
                                  ${log.estimatedCostUsd.toFixed(6)}
                                </td>
                                <td className="p-2.5 text-center whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 font-sans">
                                    {log.status}
                                  </span>
                                </td>
                                <td className="p-2.5 text-center whitespace-nowrap font-sans">
                                  {hasDetails ? (
                                    <button
                                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-[11px] font-medium transition"
                                      title="Inspect parsed vs applied inventory items"
                                    >
                                      <Eye className="w-3 h-3 text-[#E8694A]" />
                                      <span>Items ({log.parsedItems?.length || 0})</span>
                                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    </button>
                                  ) : (
                                    <span className="text-[10px] text-[#9A9A9A]">—</span>
                                  )}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-[#FAFAF8] font-sans">
                                  <td colSpan={8} className="p-4 border-t border-b border-[#E0DAD1]">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                      {/* Parsed by AI */}
                                      <div className="bg-white border border-[#E0DAD1] rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between font-semibold text-[#2D2D2D] border-b border-[#EDE8E0] pb-1.5">
                                          <span className="flex items-center gap-1 text-[#E8694A]">
                                            <Sparkles className="w-3.5 h-3.5" /> 1. AI Parsed Items ({log.parsedItems?.length || 0})
                                          </span>
                                          <span className="text-[11px] text-[#6B6B6B]">Raw Receipt Extraction</span>
                                        </div>
                                        {(!log.parsedItems || log.parsedItems.length === 0) ? (
                                          <p className="text-[#6B6B6B] italic text-[11px]">No parsed items stored for this scan.</p>
                                        ) : (
                                          <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-[#F0EBE3]">
                                            {log.parsedItems.map((item: any, iIdx: number) => (
                                              <div key={iIdx} className="pt-1.5 first:pt-0 flex items-start justify-between">
                                                <div>
                                                  <span className="font-medium text-[#2D2D2D]">{item.name}</span>
                                                  <span className="text-[10px] text-[#6B6B6B] block">
                                                    Category: {item.category} • Qty: {item.quantity} {item.unitName || 'unit'}s
                                                  </span>
                                                </div>
                                                <div className="text-right">
                                                  <span className="font-mono-financial font-medium text-[#2D2D2D]">${Number(item.totalCost || 0).toFixed(2)}</span>
                                                  <span className="text-[10px] text-[#6B6B6B] block font-mono-financial">
                                                    (${Number(item.costPerUnit || 0).toFixed(2)} / unit)
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      {/* Confirmed / Put into Inventory */}
                                      <div className="bg-white border border-[#E0DAD1] rounded-lg p-3 space-y-2">
                                        <div className="flex items-center justify-between font-semibold text-[#2D2D2D] border-b border-[#EDE8E0] pb-1.5">
                                          <span className="flex items-center gap-1 text-[#5A9A6B]">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> 2. Applied to Inventory ({appliedItemsList.length})
                                          </span>
                                          <span className="text-[11px] text-[#6B6B6B]">User Confirmed &amp; Restocked</span>
                                        </div>
                                        {appliedItemsList.length === 0 ? (
                                          <p className="text-[#6B6B6B] italic text-[11px]">Pending confirmation or discarded by user.</p>
                                        ) : (
                                          <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-[#F0EBE3]">
                                            {appliedItemsList.map((item: any, aIdx: number) => (
                                              <div key={aIdx} className="pt-1.5 first:pt-0 flex items-start justify-between">
                                                <div>
                                                  <span className="font-medium text-[#2D2D2D]">{item.name}</span>
                                                  <span className="text-[10px] text-[#5A9A6B] block">
                                                    {item.id ? '✓ Matched to Catalog' : '+ New Item Created'} • Added: {item.quantity} units
                                                  </span>
                                                </div>
                                                <div className="text-right">
                                                  <span className="font-mono-financial font-medium text-[#2D2D2D]">${(Number(item.costPerUnit || 0) * Number(item.quantity || 1)).toFixed(2)}</span>
                                                  <span className="text-[10px] text-[#6B6B6B] block font-mono-financial">
                                                    (${Number(item.costPerUnit || 0).toFixed(2)} / unit)
                                                  </span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PRODUCT TELEMETRY & ROADBLOCKS */}
          {activeTab === 'telemetry' && (
            <div className="space-y-6">
              {/* Header & Range Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F0EBE3] p-4 rounded-xl border border-[#E0DAD1]">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-[#2D2D2D] flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-[#E8694A]" />
                      <span>Product Telemetry, Feature Usage & Roadblocks</span>
                    </h4>
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#5A9A6B]/15 text-[#5A9A6B] rounded-full border border-[#5A9A6B]/30">
                      First-Party Telemetry
                    </span>
                  </div>
                  <p className="text-xs text-[#6B6B6B]">
                    Aggregated user engagement, feature adoption velocity, and roadblock signals collected via same-origin edge telemetry.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6B6B6B] font-medium">Window:</span>
                  <div className="flex bg-white rounded-lg border border-[#E0DAD1] p-0.5 text-xs">
                    {[7, 14, 30].map((d) => (
                      <button
                        key={d}
                        onClick={async () => {
                          setTelemetryDays(d);
                          const token = getAuthToken();
                          const res = await fetch(`/api/admin/telemetry/stats?days=${d}`, {
                            headers: { Authorization: `Bearer ${token}` }
                          }).catch(() => null);
                          if (res && res.ok) {
                            const data = await res.json();
                            if (data.success) setTelemetryStats(data.stats);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                          telemetryDays === d
                            ? 'bg-[#E8694A] text-white shadow-xs'
                            : 'text-[#6B6B6B] hover:text-[#2D2D2D]'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={fetchAdminData}
                    className="p-1.5 rounded-lg bg-white border border-[#E0DAD1] text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] transition"
                    title="Refresh Telemetry"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-[#E0DAD1] shadow-xs">
                  <div className="text-xs text-[#6B6B6B] mb-1 font-medium">Total Ingested Events ({telemetryDays}d)</div>
                  <div className="text-2xl font-bold text-[#2D2D2D] font-mono-financial">
                    {(telemetryStats?.totalEvents || 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-[#5A9A6B] mt-1 flex items-center gap-1 font-sans">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>0% data loss from ad-blockers</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#E0DAD1] shadow-xs">
                  <div className="text-xs text-[#6B6B6B] mb-1 font-medium">Unique Features Logged</div>
                  <div className="text-2xl font-bold text-[#E8694A] font-mono-financial">
                    {telemetryStats?.topFeatures?.length || 0}
                  </div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1 font-sans">
                    Most active: {telemetryStats?.topFeatures?.[0]?.event_name || 'None'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#E0DAD1] shadow-xs">
                  <div className="text-xs text-[#6B6B6B] mb-1 font-medium">Roadblocks & Errors Logged</div>
                  <div className="text-2xl font-bold text-[#C9553D] font-mono-financial">
                    {telemetryStats?.errorSummary?.length || 0}
                  </div>
                  <div className="text-[10px] text-[#C9553D] mt-1 font-sans">
                    {telemetryStats?.errorSummary?.length ? 'Friction points requiring triage' : 'Zero errors recorded'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#E0DAD1] shadow-xs">
                  <div className="text-xs text-[#6B6B6B] mb-1 font-medium">Funnel Touchpoints</div>
                  <div className="text-2xl font-bold text-[#D4870E] font-mono-financial">
                    {telemetryStats?.funnelBreakdown?.length || 0}
                  </div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1 font-sans">
                    Conversion milestones tracked
                  </div>
                </div>
              </div>

              {/* Two Column Grid: Top Features & Roadblock Friction */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Top Features Used */}
                <div className="bg-white border border-[#E0DAD1] rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                    <h5 className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#E8694A]" />
                      <span>Top Product Features Used</span>
                    </h5>
                    <span className="text-[11px] text-[#6B6B6B]">Last {telemetryDays} Days</span>
                  </div>

                  {(!telemetryStats?.topFeatures || telemetryStats.topFeatures.length === 0) ? (
                    <div className="p-8 text-center text-xs text-[#6B6B6B]">
                      No feature interactions recorded yet in this time window.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {telemetryStats.topFeatures.map((feat: any, idx: number) => {
                        const maxCount = telemetryStats.topFeatures[0]?.count || 1;
                        const pct = Math.round((feat.count / maxCount) * 100);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono-financial text-[#2D2D2D] font-medium">{feat.event_name}</span>
                              <span className="text-[11px] text-[#6B6B6B] font-mono-financial">{feat.count} times</span>
                            </div>
                            <div className="h-2 w-full bg-[#F0EBE3] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#E8694A] rounded-full transition-all duration-300"
                                style={{ width: `${Math.max(5, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 2. Roadblocks & Error Signals */}
                <div className="bg-white border border-[#E0DAD1] rounded-xl p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-2">
                    <h5 className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#C9553D]" />
                      <span>Roadblocks & Friction Signals</span>
                    </h5>
                    <span className="text-[11px] text-[#C9553D]">Active Blockers</span>
                  </div>

                  {(!telemetryStats?.errorSummary || telemetryStats.errorSummary.length === 0) ? (
                    <div className="p-8 text-center text-xs text-[#5A9A6B] flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-6 h-6" />
                      <span>Zero roadblocks or client exceptions detected in this time window!</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {telemetryStats.errorSummary.map((errItem: any, idx: number) => (
                        <div key={idx} className="p-3 bg-[#FDF0EC] border border-[#C9553D]/20 rounded-lg flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[#C9553D] truncate">{errItem.event_name}</div>
                            {errItem.last_seen && (
                              <div className="text-[10px] text-[#6B6B6B] mt-0.5">
                                Last seen: {new Date(errItem.last_seen).toLocaleDateString()} {new Date(errItem.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            )}
                          </div>
                          <span className="px-2.5 py-1 bg-[#C9553D] text-white font-mono-financial font-bold rounded-full text-xs shrink-0">
                            {errItem.count} hit{errItem.count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Real-time Ingestion Stream Table */}
              <div className="bg-white border border-[#E0DAD1] rounded-xl overflow-hidden shadow-xs">
                <div className="p-4 border-b border-[#EDE8E0] flex items-center justify-between">
                  <h5 className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-[#5A9A6B]" />
                    <span>Real-Time Ingestion Stream (Last 50 Events)</span>
                  </h5>
                  <span className="text-[11px] text-[#6B6B6B]">Live diagnostics</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF8F5] border-b border-[#EDE8E0] text-[10px] uppercase font-semibold text-[#6B6B6B]">
                      <tr>
                        <th className="p-3">Time</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Event Name</th>
                        <th className="p-3">Session / User</th>
                        <th className="p-3">Path</th>
                        <th className="p-3">Properties</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EDE8E0]">
                      {(!telemetryStats?.recentEvents || telemetryStats.recentEvents.length === 0) ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-xs text-[#6B6B6B]">
                            No events recorded yet. Perform actions on the site to populate live telemetry stream.
                          </td>
                        </tr>
                      ) : (
                        telemetryStats.recentEvents.map((evt: any) => {
                          const isErr = evt.category === 'error';
                          return (
                            <tr key={evt.id} className="hover:bg-[#FAFAF8] transition">
                              <td className="p-3 whitespace-nowrap text-[11px] text-[#6B6B6B] font-mono-financial">
                                {evt.created_at ? new Date(evt.created_at).toLocaleTimeString() : 'Just now'}
                              </td>
                              <td className="p-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  isErr
                                    ? 'bg-[#FDF0EC] text-[#C9553D] border border-[#C9553D]/30'
                                    : evt.category === 'feature'
                                      ? 'bg-[#E8694A]/10 text-[#E8694A] border border-[#E8694A]/30'
                                      : 'bg-[#F0EBE3] text-[#6B6B6B]'
                                }`}>
                                  {evt.category}
                                </span>
                              </td>
                              <td className="p-3 whitespace-nowrap font-mono-financial font-medium text-[#2D2D2D]">
                                {evt.event_name}
                              </td>
                              <td className="p-3 whitespace-nowrap text-[11px] text-[#6B6B6B] font-mono-financial">
                                {evt.user_id ? `User: ${evt.user_id.slice(0, 10)}...` : `Session: ${evt.session_id ? evt.session_id.slice(0, 12) : 'anon'}`}
                              </td>
                              <td className="p-3 whitespace-nowrap text-[11px] text-[#6B6B6B]">
                                {evt.path || '/'}
                              </td>
                              <td className="p-3 text-[10px] font-mono-financial text-[#6B6B6B] max-w-xs truncate" title={evt.properties_json || '{}'}>
                                {evt.properties_json || '{}'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}


            </div>

          </div>

        </div>

      </div>

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#2D2D2D]/60 animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-md bg-white border border-[#E0DAD1] rounded-xl shadow-2xl p-6 text-[#2D2D2D] space-y-4 my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3 shrink-0">
              <h3 className="text-base font-semibold text-[#2D2D2D] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#E8694A]" />
                Edit User Account
              </h3>
              <button 
                onClick={() => setEditingUser(null)}
                className="p-1 rounded text-[#6B6B6B] hover:text-[#2D2D2D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">Full Name</label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">Email Address</label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">System Role</label>
                <select
                  value={editingUser.systemRole}
                  onChange={(e) => setEditingUser({ ...editingUser, systemRole: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A] cursor-pointer"
                >
                  <option value="user">Regular User</option>
                  <option value="admin">Platform Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              <div className="border-t border-[#EDE8E0] pt-3">
                <label className="block font-medium text-[#2D2D2D] mb-1 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-[#E8694A]" />
                  <span>Reset Password (leave blank to keep current)</span>
                </label>
                <input
                  type="password"
                  placeholder="Min 8 characters..."
                  value={editingUser.newPassword || ''}
                  onChange={(e) => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#EDE8E0] pt-4 shrink-0">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-medium rounded-md border border-[#E0DAD1] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUserEdit}
                disabled={savingUser}
                className="px-4 py-2 bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium rounded-md shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingUser && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ORG MODAL */}
      {editingOrg && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#2D2D2D]/60 animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-md bg-white border border-[#E0DAD1] rounded-xl shadow-2xl p-6 text-[#2D2D2D] space-y-4 my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3 shrink-0">
              <h3 className="text-base font-semibold text-[#2D2D2D] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#E8694A]" />
                Edit Organization Workspace
              </h3>
              <button 
                onClick={() => setEditingOrg(null)}
                className="p-1 rounded text-[#6B6B6B] hover:text-[#2D2D2D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">Organization Name</label>
                <input
                  type="text"
                  value={editingOrg.name}
                  onChange={(e) => setEditingOrg({ ...editingOrg, name: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                />
              </div>

              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">Subscription Tier Plan</label>
                <select
                  value={editingOrg.tier}
                  onChange={(e) => setEditingOrg({ ...editingOrg, tier: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A] cursor-pointer"
                >
                  <option value="community">Community (Free)</option>
                  <option value="standard">Hosted Standard ($5/mo)</option>
                  <option value="plus">Hosted Plus ($12/mo)</option>
                  <option value="enterprise">Enterprise (Unlimited)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#EDE8E0] pt-4 shrink-0">
              <button
                type="button"
                onClick={() => setEditingOrg(null)}
                className="px-4 py-2 bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-medium rounded-md border border-[#E0DAD1] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOrgEdit}
                disabled={savingOrg}
                className="px-4 py-2 bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium rounded-md shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingOrg && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT POOL MODAL */}
      {editingPool && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#2D2D2D]/60 animate-fadeIn overflow-y-auto">
          <div className="relative w-full max-w-md bg-white border border-[#E0DAD1] rounded-xl shadow-2xl p-6 text-[#2D2D2D] space-y-4 my-auto max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#EDE8E0] pb-3 shrink-0">
              <h3 className="text-base font-semibold text-[#2D2D2D] flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#E8694A]" />
                Edit Pantry Pool
              </h3>
              <button 
                onClick={() => setEditingPool(null)}
                className="p-1 rounded text-[#6B6B6B] hover:text-[#2D2D2D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">Pool Name</label>
                <input
                  type="text"
                  value={editingPool.name}
                  onChange={(e) => setEditingPool({ ...editingPool, name: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[#2D2D2D] mb-1">Category</label>
                  <input
                    type="text"
                    value={editingPool.category}
                    onChange={(e) => setEditingPool({ ...editingPool, category: e.target.value })}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-[#2D2D2D] mb-1">Currency Symbol</label>
                  <input
                    type="text"
                    value={editingPool.currency}
                    onChange={(e) => setEditingPool({ ...editingPool, currency: e.target.value })}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[#2D2D2D] mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editingPool.description}
                  onChange={(e) => setEditingPool({ ...editingPool, description: e.target.value })}
                  className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs outline-none focus:border-[#E8694A]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#EDE8E0] pt-4 shrink-0">
              <button
                type="button"
                onClick={() => setEditingPool(null)}
                className="px-4 py-2 bg-[#F0EBE3] hover:bg-[#E8E2D9] text-[#2D2D2D] text-xs font-medium rounded-md border border-[#E0DAD1] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePoolEdit}
                disabled={savingPool}
                className="px-4 py-2 bg-[#E8694A] hover:bg-[#D45A3D] text-white text-xs font-medium rounded-md shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {savingPool && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Stylized Confirmation Popup Modal */}
      {confirmConfig && (
        <AlertDialogModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          type={confirmConfig.type}
          confirmText={confirmConfig.confirmText}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
};
