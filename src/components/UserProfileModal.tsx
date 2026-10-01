import React, { useState, useEffect, useRef } from 'react';
import { 
  AuthUser, 
  fetchPublicSettingsApi, 
  linkAuthProviderApi, 
  getPasskeyRegistrationOptionsApi, 
  verifyPasskeyRegistrationApi, 
  listPasskeysApi, 
  deletePasskeyApi,
  uploadUserAvatarApi,
  deleteUserAvatarApi
} from '../lib/api';
import { optimizeAvatarImage } from '../lib/imageOptimizer';
import { ensureGoogleIdentityLoaded, getGoogleClientId } from '../lib/googleAuthClient';
import { 
  X, 
  User as UserIcon, 
  Check, 
  ShieldCheck, 
  KeyRound, 
  Mail, 
  Camera, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  Plus,
  Fingerprint,
  Trash2,
  Upload,
  Loader2
} from 'lucide-react';

import { LegalTabType } from './LegalModal';
import { CreditCard, DollarSign, Wallet, Star } from 'lucide-react';
import { PaymentProvider } from '../types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onUpdateUser: (updated: { 
    name: string; 
    avatarUrl: string;
    venmoHandle?: string;
    cashappHandle?: string;
    paypalHandle?: string;
    zelleIdentifier?: string;
    applePayHandle?: string;
    preferredPaymentMethod?: PaymentProvider;
  }) => void;
  onOpenLegal?: (tab: LegalTabType) => void;
}

import { PRESET_AVATARS, getDefaultAvatarUrl, PresetAvatar } from '../lib/avatar';

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onUpdateUser,
  onOpenLegal
}) => {
  const [name, setName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [venmoHandle, setVenmoHandle] = useState(user?.venmoHandle || '');
  const [cashappHandle, setCashappHandle] = useState(user?.cashappHandle || '');
  const [paypalHandle, setPaypalHandle] = useState(user?.paypalHandle || '');
  const [zelleIdentifier, setZelleIdentifier] = useState(user?.zelleIdentifier || '');
  const [applePayHandle, setApplePayHandle] = useState(user?.applePayHandle || '');
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentProvider | ''>(
    (user?.preferredPaymentMethod as PaymentProvider) || ''
  );
  const [linkedGoogle, setLinkedGoogle] = useState(Boolean(user?.hasGoogle));
  const [linkedApple, setLinkedApple] = useState(Boolean(user?.hasApple));
  const [linkedPassword, setLinkedPassword] = useState(Boolean(user?.hasPassword));
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);
  const [appleLoginEnabled, setAppleLoginEnabled] = useState(false);
  const [avatarCategory, setAvatarCategory] = useState<'all' | 'portraits' | 'monograms' | 'vibes'>('all');
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [passkeyDeviceName, setPasskeyDeviceName] = useState('');
  const [showPasskeyNameInput, setShowPasskeyNameInput] = useState(false);

  const handleAvatarFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WebP, GIF, SVG).');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File is too large. Please select an image under 10MB.');
      return;
    }

    setIsUploadingAvatar(true);
    setUploadError(null);

    try {
      const opt = await optimizeAvatarImage(file, 400, 0.85);
      const res = await uploadUserAvatarApi(opt.base64, opt.mimeType);
      if (res.success && res.avatarUrl) {
        setAvatarUrl(res.avatarUrl);
        setUploadError(null);
      } else {
        setUploadError(res.error || 'Failed to upload profile icon');
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload profile icon');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAvatarFile(file);
      e.target.value = '';
    }
  };

  useEffect(() => {
    if (!isOpen || !user) return;
    setName(user.name || '');
    setAvatarUrl(user.avatarUrl || '');
    setUploadError(null);
    setIsUploadingAvatar(false);
    setIsDragging(false);
    setVenmoHandle(user.venmoHandle || '');
    setCashappHandle(user.cashappHandle || '');
    setPaypalHandle(user.paypalHandle || '');
    setZelleIdentifier(user.zelleIdentifier || '');
    setApplePayHandle(user.applePayHandle || '');
    setPreferredPaymentMethod((user.preferredPaymentMethod as PaymentProvider) || '');
    setLinkedGoogle(Boolean(user.hasGoogle));
    setLinkedApple(Boolean(user.hasApple));
    setLinkedPassword(Boolean(user.hasPassword));
    setShowPasswordSetup(false);
    setPasswordInput('');
    setLinkMsg(null);
    setShowPasskeyNameInput(false);
    setPasskeyDeviceName('');

    fetchPublicSettingsApi().then((s) => {
      if (s && typeof s.appleLoginEnabled === 'boolean') {
        setAppleLoginEnabled(s.appleLoginEnabled);
      }
    });

    listPasskeysApi().then((res) => {
      if (res?.success && Array.isArray(res.credentials)) {
        setPasskeys(res.credentials);
      }
    });
  }, [isOpen, user]);

  if (!isOpen || !user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const finalAvatar = avatarUrl.trim() || user.avatarUrl || getDefaultAvatarUrl(name || user.name);
      const token = localStorage.getItem('pantrypool_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        userId: user.id,
        name,
        avatarUrl: finalAvatar,
        venmoHandle: venmoHandle.trim(),
        cashappHandle: cashappHandle.trim(),
        paypalHandle: paypalHandle.trim(),
        zelleIdentifier: zelleIdentifier.trim(),
        applePayHandle: applePayHandle.trim(),
        preferredPaymentMethod: preferredPaymentMethod || undefined,
      };

      const res = await fetch('/api/users/profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        onUpdateUser({
          name,
          avatarUrl: finalAvatar,
          venmoHandle: venmoHandle.trim(),
          cashappHandle: cashappHandle.trim(),
          paypalHandle: paypalHandle.trim(),
          zelleIdentifier: zelleIdentifier.trim(),
          applePayHandle: applePayHandle.trim(),
          preferredPaymentMethod: (preferredPaymentMethod as PaymentProvider) || undefined,
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } else {
        setSaveError(data.error || 'Failed to update profile');
      }
    } catch (e: any) {
      setSaveError(e.message || 'Failed to update profile');
    }
    setIsSaving(false);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.length < 8) {
      setLinkMsg('⚠️ Password must be at least 8 characters long.');
      return;
    }
    setLinkMsg(null);
    try {
      const token = localStorage.getItem('pantrypool_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/users/link-provider', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: user.id,
          provider: 'password',
          password: passwordInput
        })
      });
      const data = await res.json();
      if (data.success) {
        setLinkedPassword(true);
        setShowPasswordSetup(false);
        setPasswordInput('');
        setLinkMsg('✅ Password successfully created! You can now log in with your email & password or Google.');
      } else {
        setLinkMsg(data.error || 'Failed to set password.');
      }
    } catch (err: any) {
      setLinkMsg(`Error: ${err.message}`);
    }
  };

  const handleLinkProvider = async (provider: 'google' | 'apple' | 'password') => {
    setLinkMsg(null);
    try {
      if (provider === 'google') {
        await ensureGoogleIdentityLoaded();
        // Trigger GIS Google OAuth popup if available
        if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
          const client = (window as any).google.accounts.oauth2.initTokenClient({
            client_id: getGoogleClientId(),
            scope: 'email profile openid',
            callback: async (response: any) => {
              if (response.access_token) {
                const res = await linkAuthProviderApi('google', { credential: response.access_token, providerId: `google_${user.email}` });
                if (res.success) {
                  setLinkedGoogle(true);
                  setLinkMsg('✅ Google account successfully linked!');
                }
              }
            },
          });
          client.requestAccessToken();
          return;
        }
      } else if (provider === 'apple') {
        if (typeof window !== 'undefined' && (window as any).AppleID?.auth) {
          try {
            const data = await (window as any).AppleID.auth.signIn();
            const token = data?.authorization?.id_token;
            if (token) {
              const res = await linkAuthProviderApi('apple', { identityToken: token, providerId: `apple_${user.email}` });
              if (res.success) {
                setLinkedApple(true);
                setLinkMsg('✅ Apple ID successfully linked!');
                return;
              }
            }
          } catch (err: any) {
            if (err?.error !== 'popup_closed_by_user') {
              console.warn('[Apple Link Warning]', err);
            }
          }
        }
      }

      // Direct provider link fallback
      const token = localStorage.getItem('pantrypool_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/users/link-provider', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: user.id,
          provider,
          providerId: `${provider}_id_${user.id}`
        })
      });
      const data = await res.json();
      if (data.success) {
        if (provider === 'google') setLinkedGoogle(true);
        if (provider === 'apple') setLinkedApple(true);
        if (provider === 'password') setLinkedPassword(true);
        setLinkMsg(`✅ Linked ${provider === 'apple' ? 'Sign in with Apple' : provider === 'google' ? 'Google Account' : 'Password Login'} to your account!`);
      } else {
        setLinkMsg(data.error || `Failed to link ${provider}.`);
      }
    } catch (e: any) {
      setLinkMsg(`Error: ${e.message}`);
    }
  };

  const handleRegisterPasskey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaveError(null);
    setLinkMsg(null);
    setIsRegisteringPasskey(true);

    try {
      const { browserSupportsWebAuthn, startRegistration } = await import('@simplewebauthn/browser');
      if (!browserSupportsWebAuthn()) {
        setSaveError('Passkeys are not supported on this browser or device.');
        setIsRegisteringPasskey(false);
        return;
      }

      const optRes = await getPasskeyRegistrationOptionsApi();
      if (!optRes?.success || !optRes?.options) {
        setSaveError(optRes?.error || 'Failed to start passkey registration.');
        setIsRegisteringPasskey(false);
        return;
      }

      const registrationResult = await startRegistration({ optionsJSON: optRes.options });

      const verifyRes = await verifyPasskeyRegistrationApi({
        response: registrationResult,
        challengeToken: optRes.challengeToken,
        name: passkeyDeviceName.trim() || undefined
      });

      if (verifyRes?.success) {
        setLinkMsg('✅ Passkey registered successfully!');
        setShowPasskeyNameInput(false);
        setPasskeyDeviceName('');
        const updatedList = await listPasskeysApi();
        if (updatedList?.success && Array.isArray(updatedList.credentials)) {
          setPasskeys(updatedList.credentials);
        }
      } else {
        setSaveError(verifyRes?.error || 'Failed to verify passkey registration.');
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        // User closed prompt
      } else {
        setSaveError(err.message || 'Passkey registration cancelled or failed.');
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this passkey?')) return;
    try {
      const res = await deletePasskeyApi(id);
      if (res?.success) {
        setPasskeys(prev => prev.filter(p => p.id !== id));
        setLinkMsg('✅ Passkey removed successfully.');
      } else {
        setSaveError(res?.error || 'Failed to remove passkey.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Error deleting passkey.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/40 animate-fade-in">
      <div className="bg-white border border-[#E0DAD1] rounded-xl shadow-xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] text-[#2D2D2D]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#EDE8E0] flex items-center justify-between bg-[#FAFAF8]">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#FDF0EC] text-[#E8694A] rounded-lg">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2D2D2D]">Profile Settings & Login Connections</h2>
              <p className="text-xs text-[#6B6B6B]">Manage custom avatar icon and linked login accounts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {saveSuccess && (
            <div className="p-3 bg-[#EDF5EF] border border-[#5A9A6B]/30 rounded-md text-[#5A9A6B] text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Profile avatar & display name updated!</span>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-[#FDF0EC] border border-[#C9553D]/30 rounded-md text-[#C9553D] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-5">
            
            {/* Avatar Selection */}
            <div>
              <label className="block text-xs font-semibold text-[#2D2D2D] mb-2">
                Choose Profile Avatar Icon
              </label>
              
              {/* Current Avatar Preview */}
              <div className="flex items-center gap-4 mb-4 p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg">
                <div className="relative">
                  <img
                    src={avatarUrl || user.avatarUrl || getDefaultAvatarUrl(name || user.name)}
                    alt={name}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = getDefaultAvatarUrl(name || user.name);
                    }}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-white shadow-xs bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload profile icon"
                    className="absolute -bottom-1 -right-1 p-1 bg-white hover:bg-[#FDF0EC] text-[#E8694A] rounded-full shadow-xs border border-[#E0DAD1] transition cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#2D2D2D]">{name || user.name}</div>
                  <div className="text-xs text-[#6B6B6B]">{user.email}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 rounded-full">
                      Active Avatar
                    </span>
                    {avatarUrl && avatarUrl.startsWith('/api/users/avatar') && (
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30 rounded-full">
                        Custom Uploaded
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Avatar Categories */}
              <div className="flex items-center gap-1 mb-2.5 overflow-x-auto pb-1">
                {[
                  { id: 'all', label: 'All Styles' },
                  { id: 'portraits', label: '☕ Breakroom Personas' },
                  { id: 'monograms', label: '🎨 Artisan Monograms' },
                  { id: 'vibes', label: '✨ Breakroom Vibes' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setAvatarCategory(cat.id as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition whitespace-nowrap ${
                      avatarCategory === cat.id
                        ? 'bg-[#E8694A] text-white shadow-xs'
                        : 'bg-[#F0EBE3] text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Preset Icon Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-3">
                {PRESET_AVATARS.filter(p => avatarCategory === 'all' || p.category === avatarCategory).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setAvatarUrl(p.url);
                      setUploadError(null);
                    }}
                    className={`relative p-2 rounded-lg border transition hover:scale-105 flex flex-col items-center gap-1 ${
                      avatarUrl === p.url
                        ? 'border-[#E8694A] ring-2 ring-[#E8694A]/30 bg-[#FDF0EC]'
                        : 'border-[#E0DAD1] hover:border-[#9A9A9A] bg-white'
                    }`}
                  >
                    <img
                      src={p.url}
                      alt={p.name}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = getDefaultAvatarUrl(p.name);
                      }}
                      className="w-10 h-10 rounded-full object-cover mx-auto bg-[#F0EBE3]"
                    />
                    <span className="text-[9px] text-[#6B6B6B] font-medium truncate w-full text-center">{p.name}</span>
                  </button>
                ))}
              </div>

              {/* Custom Image Upload Zone */}
              <div className="mt-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleAvatarFile(file);
                  }}
                  className={`border-2 border-dashed rounded-lg p-3.5 text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    isDragging
                      ? 'border-[#E8694A] bg-[#FDF0EC]'
                      : 'border-[#E0DAD1] hover:border-[#E8694A]/60 bg-[#FAF7F2]'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingAvatar ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-[#E8694A] font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Optimizing & uploading icon...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#2D2D2D]">
                        <Upload className="w-4 h-4 text-[#E8694A]" />
                        <span>Upload Custom Profile Icon</span>
                      </div>
                      <p className="text-[11px] text-[#6B6B6B]">
                        Click or drag & drop photo (PNG, JPG, WebP, GIF, SVG up to 10MB)
                      </p>
                    </>
                  )}
                </div>

                {uploadError && (
                  <p className="mt-1.5 text-xs text-[#C9553D] flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{uploadError}</span>
                  </p>
                )}

                {avatarUrl && (avatarUrl.startsWith('/api/users/avatar') || avatarUrl.startsWith('data:')) && (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-[#5A9A6B] font-medium">
                      <Check className="w-3.5 h-3.5" />
                      Custom profile icon uploaded
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAvatarUrl(getDefaultAvatarUrl(name || user.name));
                        setUploadError(null);
                      }}
                      className="text-[#C9553D] hover:underline text-[11px] font-medium cursor-pointer"
                    >
                      Reset to default avatar
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Display Name Input */}
            <div>
              <label className="block text-xs font-medium text-[#2D2D2D] mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border border-[#E0DAD1] rounded-md px-3 py-2 text-xs text-[#2D2D2D] focus:outline-none focus:border-[#E8694A]"
              />
            </div>

            {/* P2P Payment Preferences & Reimbursement Handles */}
            <div className="pt-3 border-t border-[#EDE8E0] space-y-4">
              <div>
                <h3 className="text-xs font-bold text-[#2D2D2D] uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-[#E8694A]" />
                  Preferred P2P Payment Methods (For Reimbursement)
                </h3>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">
                  Define what payment handles you prefer. When team members take sodas/items and contribute funds, they will be able to send funds directly to you for items you bring in!
                </p>
              </div>

              {/* Preferred Method Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] mb-1.5">
                  Default Preferred Payment Channel
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { id: 'venmo', label: 'Venmo', color: '#008CFF' },
                    { id: 'cashapp', label: 'Cash App', color: '#00D632' },
                    { id: 'paypal', label: 'PayPal', color: '#003087' },
                    { id: 'zelle', label: 'Zelle', color: '#7414CA' },
                    { id: 'applepay', label: 'Apple Pay', color: '#000000' },
                    { id: '', label: 'Any / None', color: '#6B6B6B' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPreferredPaymentMethod(opt.id as any)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition ${
                        preferredPaymentMethod === opt.id
                          ? 'border-[#E8694A] bg-[#FDF0EC] text-[#E8694A] ring-1 ring-[#E8694A]/30 font-semibold'
                          : 'border-[#E0DAD1] bg-white text-[#6B6B6B] hover:border-[#9A9A9A]'
                      }`}
                    >
                      {preferredPaymentMethod === opt.id && <Star className="w-3 h-3 fill-[#E8694A] text-[#E8694A]" />}
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Handles Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Venmo */}
                <div className="p-3 bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#008CFF]" />
                      Venmo
                    </span>
                    {preferredPaymentMethod === 'venmo' && (
                      <span className="text-[10px] bg-[#EDF5EF] text-[#5A9A6B] px-1.5 py-0.5 rounded font-medium">Preferred</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="@username (e.g. @sarah_m)"
                    value={venmoHandle}
                    onChange={(e) => setVenmoHandle(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-2.5 py-1.5 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>

                {/* Cash App */}
                <div className="p-3 bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#00D632]" />
                      Cash App
                    </span>
                    {preferredPaymentMethod === 'cashapp' && (
                      <span className="text-[10px] bg-[#EDF5EF] text-[#5A9A6B] px-1.5 py-0.5 rounded font-medium">Preferred</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="$cashtag (e.g. $sarah_cash)"
                    value={cashappHandle}
                    onChange={(e) => setCashappHandle(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-2.5 py-1.5 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>

                {/* PayPal */}
                <div className="p-3 bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#003087]" />
                      PayPal.me
                    </span>
                    {preferredPaymentMethod === 'paypal' && (
                      <span className="text-[10px] bg-[#EDF5EF] text-[#5A9A6B] px-1.5 py-0.5 rounded font-medium">Preferred</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="paypal.me/username or user"
                    value={paypalHandle}
                    onChange={(e) => setPaypalHandle(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-2.5 py-1.5 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>

                {/* Zelle */}
                <div className="p-3 bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#7414CA]" />
                      Zelle
                    </span>
                    {preferredPaymentMethod === 'zelle' && (
                      <span className="text-[10px] bg-[#EDF5EF] text-[#5A9A6B] px-1.5 py-0.5 rounded font-medium">Preferred</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Phone or Email linked to Zelle"
                    value={zelleIdentifier}
                    onChange={(e) => setZelleIdentifier(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-2.5 py-1.5 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>

                {/* Apple Pay / Apple Cash */}
                <div className="p-3 bg-[#FAF8F5] border border-[#E0DAD1] rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2D2D2D] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#000000]" />
                      Apple Pay / Cash
                    </span>
                    {preferredPaymentMethod === 'applepay' && (
                      <span className="text-[10px] bg-[#EDF5EF] text-[#5A9A6B] px-1.5 py-0.5 rounded font-medium">Preferred</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Phone or Apple ID (e.g. +1... or user@icloud.com)"
                    value={applePayHandle}
                    onChange={(e) => setApplePayHandle(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] rounded-md px-2.5 py-1.5 text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                  />
                </div>
              </div>
            </div>

            {/* Save Profile Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-medium bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full transition-colors shadow-xs"
              >
                Save Profile & Preferences
              </button>
            </div>
          </form>

          <div className="border-t border-[#EDE8E0] pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#2D2D2D] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#E8694A]" />
                Linked Login Accounts (Multi-Provider Authentication)
              </h3>
              <p className="text-xs text-[#6B6B6B]">Link multiple identity providers to log in seamlessly with any method</p>
            </div>

            {linkMsg && (
              <div className="p-3 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg text-xs text-[#2D2D2D] font-mono-financial">
                {linkMsg}
              </div>
            )}

            {/* Providers List */}
            <div className="space-y-2.5">
              
              {/* Email / Password */}
              <div className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white text-[#E8694A] rounded-lg border border-[#E0DAD1]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[#2D2D2D]">Email & Password</div>
                      <div className="text-[11px] text-[#6B6B6B]">{user.email}</div>
                    </div>
                  </div>
                  {linkedPassword ? (
                    <span className="px-2.5 py-1 text-[11px] font-medium bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 text-[10px] font-medium bg-white text-[#6B6B6B] rounded-full border border-[#E0DAD1]">
                        No Password Set
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPasswordSetup(!showPasswordSetup)}
                        className="px-3 py-1 text-xs font-medium bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full transition-colors flex items-center gap-1 shadow-xs"
                      >
                        <Plus className="w-3 h-3" /> Set Password
                      </button>
                    </div>
                  )}
                </div>

                {/* Inline Set Password Form for OAuth Accounts */}
                {!linkedPassword && showPasswordSetup && (
                  <form onSubmit={handleSetPassword} className="pt-2 border-t border-[#E0DAD1] flex items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="w-3.5 h-3.5 text-[#9A9A9A] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="New password (min. 8 characters)"
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E0DAD1] rounded-md text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                        minLength={8}
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 text-xs font-medium bg-[#5A9A6B] hover:bg-[#4E885D] text-white rounded-full transition-colors shadow-xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordSetup(false);
                        setPasswordInput('');
                      }}
                      className="px-2.5 py-1.5 text-xs text-[#6B6B6B] hover:text-[#2D2D2D] transition-colors"
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </div>

              {/* Google OAuth */}
              <div className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white rounded-lg border border-[#E0DAD1]">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
                      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                      <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12 0 12.3c0 2.6.7 4.9 1.9 7.3l3.7-2.9z" />
                      <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Google OAuth 2.0</div>
                    <div className="text-[11px] text-[#6B6B6B]">1-tap Google Workspace authentication</div>
                  </div>
                </div>
                {linkedGoogle ? (
                  <span className="px-2.5 py-1 text-[11px] font-medium bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> Connected
                  </span>
                ) : (
                  <button
                    onClick={() => handleLinkProvider('google')}
                    className="px-3 py-1 text-xs font-medium bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] border border-[#E0DAD1] rounded-full transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3 h-3" /> Link Google
                  </button>
                )}
              </div>

              {/* Sign in with Apple (Feature Flagged) */}
              {appleLoginEnabled && (
                <div className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white rounded-lg border border-[#E0DAD1]">
                      <svg className="w-4 h-4 fill-current text-[#2D2D2D]" viewBox="0 0 170 170">
                        <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.16-1.9-14.48-6.1-3.23-2.63-7.14-7.27-11.73-13.91-6.1-8.85-11.05-18.73-14.85-29.64-3.8-10.91-5.7-21.57-5.7-31.97 0-15.08 3.82-27.42 11.46-37.03 7.64-9.61 17.5-14.54 29.58-14.79 4.83 0 10.05 1.18 15.66 3.54 5.61 2.36 9.49 3.59 11.64 3.7 2.02 0 6.01-1.31 11.96-3.93 5.95-2.62 10.97-3.82 15.07-3.6 11.18.52 20.3 4.54 27.36 12.06-23.77 14.4-23.36 37.91 1.25 49.33-5.24 13.08-12.28 26.04-21.13 38.88zm-22.39-97.16c0 7.21-2.63 14.07-7.89 20.58-6.42 7.84-14.18 12.35-22.84 11.76-.14-1.05-.21-2.02-.21-2.92 0-7.07 2.82-14.06 8.46-20.97 5.64-6.91 13.32-11.13 23.04-12.66.14 1.4.21 2.76.21 4.09z"/>
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[#2D2D2D]">Sign in with Apple</div>
                      <div className="text-[11px] text-[#6B6B6B]">Apple ID & Touch ID / Face ID</div>
                    </div>
                  </div>
                  {linkedApple ? (
                    <span className="px-2.5 py-1 text-[11px] font-medium bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <button
                      onClick={() => handleLinkProvider('apple')}
                      className="px-3 py-1 text-xs font-medium bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] border border-[#E0DAD1] rounded-full transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3 h-3" /> Link Apple ID
                    </button>
                  )}
                </div>
              )}

              {/* Passkeys / WebAuthn Biometrics */}
              <div className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white text-[#E8694A] rounded-lg border border-[#E0DAD1]">
                      <Fingerprint className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[#2D2D2D]">Passkeys & Biometrics</div>
                      <div className="text-[11px] text-[#6B6B6B]">FIDO2 / Touch ID / Face ID passwordless login</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPasskeyNameInput(!showPasskeyNameInput)}
                    disabled={isRegisteringPasskey}
                    className="px-3 py-1 text-xs font-medium bg-[#E8694A] hover:bg-[#D45A3D] text-white rounded-full transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" /> Add Passkey
                  </button>
                </div>

                {/* Optional Custom Device Name Prompt */}
                {showPasskeyNameInput && (
                  <form onSubmit={handleRegisterPasskey} className="pt-2 border-t border-[#E0DAD1] flex items-center gap-2">
                    <div className="relative flex-1">
                      <Fingerprint className="w-3.5 h-3.5 text-[#9A9A9A] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={passkeyDeviceName}
                        onChange={(e) => setPasskeyDeviceName(e.target.value)}
                        placeholder="Device name (e.g. MacBook Touch ID)"
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#E0DAD1] rounded-md text-xs text-[#2D2D2D] placeholder-[#9A9A9A] focus:outline-none focus:border-[#E8694A]"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isRegisteringPasskey}
                      className="px-3.5 py-1.5 text-xs font-medium bg-[#5A9A6B] hover:bg-[#4E885D] text-white rounded-full transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1"
                    >
                      {isRegisteringPasskey ? (
                        <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Register'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasskeyNameInput(false);
                        setPasskeyDeviceName('');
                      }}
                      className="px-2.5 py-1.5 text-xs text-[#6B6B6B] hover:text-[#2D2D2D] transition-colors"
                    >
                      Cancel
                    </button>
                  </form>
                )}

                {/* List of Registered Passkeys */}
                {passkeys.length > 0 && (
                  <div className="pt-2 border-t border-[#E0DAD1] space-y-1.5">
                    {passkeys.map((pk) => (
                      <div key={pk.id} className="flex items-center justify-between p-2 bg-white rounded-md border border-[#E0DAD1] text-xs">
                        <div className="flex items-center gap-2">
                          <Fingerprint className="w-3.5 h-3.5 text-[#5A9A6B]" />
                          <div>
                            <span className="font-medium text-[#2D2D2D]">{pk.name || 'Security Key'}</span>
                            <span className="text-[10px] text-[#9A9A9A] ml-2">
                              {pk.createdAt ? new Date(pk.createdAt).toLocaleDateString() : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeletePasskey(pk.id)}
                          title="Revoke passkey"
                          className="p-1 text-[#9A9A9A] hover:text-[#C9553D] rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Corporate SSO */}
              <div className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white text-[#E8694A] rounded-lg border border-[#E0DAD1]">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#2D2D2D]">Corporate SSO (SAML 2.0 / Okta)</div>
                    <div className="text-[11px] text-[#6B6B6B]">Corporate Domain Claim (@{user.email.split('@')[1] || 'acme.com'})</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-medium bg-[#FDF0EC] text-[#E8694A] border border-[#E8694A]/30 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3" /> Enforced
                </span>
              </div>

            </div>

          </div>

          {/* Legal, Privacy & Cookie Management */}
          <div className="space-y-3 pt-2 border-t border-[#EDE8E0]">
            <h4 className="text-xs font-semibold text-[#2D2D2D]">
              Legal, Privacy & Consent
            </h4>
            <div className="p-3.5 bg-[#F0EBE3] border border-[#E0DAD1] rounded-lg space-y-3">
              <p className="text-xs text-[#6B6B6B]">
                PantryPool is committed to GDPR & CCPA privacy compliance and transparent communal accounting.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {onOpenLegal && (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('terms')}
                      className="px-3 py-1.5 bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] rounded-full border border-[#E0DAD1] transition shadow-xs font-medium"
                    >
                      Terms of Service
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('user-agreement')}
                      className="px-3 py-1.5 bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] rounded-full border border-[#E0DAD1] transition shadow-xs font-medium"
                    >
                      User Agreement
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenLegal('privacy')}
                      className="px-3 py-1.5 bg-white hover:bg-[#FAFAF8] text-[#2D2D2D] rounded-full border border-[#E0DAD1] transition shadow-xs font-medium"
                    >
                      Privacy Policy
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open_cookie_preferences'));
                  }}
                  className="px-3 py-1.5 bg-[#FDF0EC] hover:bg-[#FDF0EC]/80 text-[#E8694A] rounded-full border border-[#E8694A]/30 transition font-medium"
                >
                  Manage Cookie Consent
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
