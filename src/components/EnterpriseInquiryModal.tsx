import React, { useState } from 'react';
import { X, Building2, Mail, Users, Sparkles, Send, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react';
import { submitEnterpriseInquiryApi } from '../lib/api';

interface EnterpriseInquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCompany?: string;
}

export const EnterpriseInquiryModal: React.FC<EnterpriseInquiryModalProps> = ({
  isOpen,
  onClose,
  defaultCompany = ''
}) => {
  const [company, setCompany] = useState(defaultCompany);
  const [email, setEmail] = useState('');
  const [teamSize, setTeamSize] = useState('250-500');
  const [pantryCount, setPantryCount] = useState('15-30');
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !company.trim()) {
      setError('Please provide your company name and work email.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await submitEnterpriseInquiryApi({
        company: company.trim(),
        email: email.trim(),
        teamSize,
        pantryCount,
        requirements: requirements.trim(),
      });

      if (res && res.success) {
        setSubmitted(true);
      } else {
        setError(res?.error || 'Unable to submit your inquiry right now. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2D2D2D]/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-md bg-white border border-[#E0DAD1] rounded-2xl shadow-2xl overflow-hidden p-6 text-[#2D2D2D]">
        
        {/* Close Button */}
        <button
          onClick={handleReset}
          className="absolute top-4 right-4 text-[#6B6B6B] hover:text-[#2D2D2D] p-1.5 rounded-lg hover:bg-[#F0EBE3] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {submitted ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#2D2D2D]">Inquiry Received!</h3>
              <p className="text-xs text-[#6B6B6B] mt-1 max-w-xs mx-auto leading-relaxed">
                Thank you! Our enterprise solutions team has received your request and will follow up with you at{' '}
                <strong className="text-[#2D2D2D]">{email}</strong> shortly.
              </p>
            </div>
            <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E0DAD1] text-[11px] text-[#6B6B6B] text-left space-y-1.5">
              <div><strong className="text-[#2D2D2D]">Company:</strong> {company || 'N/A'}</div>
              <div><strong className="text-[#2D2D2D]">Work Email:</strong> {email}</div>
              <div><strong className="text-[#2D2D2D]">Estimated Breakrooms:</strong> {pantryCount}</div>
              <div><strong className="text-[#2D2D2D]">Team Size:</strong> {teamSize}</div>
              {requirements.trim() && (
                <div><strong className="text-[#2D2D2D]">Requirements:</strong> {requirements.trim()}</div>
              )}
            </div>
            <button
              onClick={handleReset}
              className="w-full py-2.5 px-4 bg-[#2D2D2D] hover:bg-[#1A1A1A] text-white font-medium rounded-full text-xs transition cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            <div className="text-center mb-5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-purple-100 text-purple-700 mb-2 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-[#2D2D2D]">
                Enterprise Workspace
              </h2>
              <p className="text-xs text-[#6B6B6B] mt-0.5">
                Unlimited breakroom pantries, custom member volumes, and corporate provisioning.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wider mb-1">
                  Company or Organization Name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                  <input
                    type="text"
                    required
                    placeholder="Acme Global Inc."
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg py-2 pl-9 pr-3 text-xs text-[#2D2D2D] outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wider mb-1">
                  Work Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                  <input
                    type="email"
                    required
                    placeholder="facilities@acme.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] focus:border-purple-600 focus:ring-1 focus:ring-purple-600 rounded-lg py-2 pl-9 pr-3 text-xs text-[#2D2D2D] outline-none transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wider mb-1">
                    Pantries / Floors
                  </label>
                  <select
                    value={pantryCount}
                    onChange={(e) => setPantryCount(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] focus:border-purple-600 rounded-lg py-2 px-2.5 text-xs text-[#2D2D2D] outline-none cursor-pointer"
                  >
                    <option value="15-30">15 – 30 pantries</option>
                    <option value="30-50">30 – 50 pantries</option>
                    <option value="50-100">50 – 100 pantries</option>
                    <option value="100+">100+ campus pantries</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wider mb-1">
                    Total Team Size
                  </label>
                  <select
                    value={teamSize}
                    onChange={(e) => setTeamSize(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] focus:border-purple-600 rounded-lg py-2 px-2.5 text-xs text-[#2D2D2D] outline-none cursor-pointer"
                  >
                    <option value="250-500">250 – 500 members</option>
                    <option value="500-2000">500 – 2,000 members</option>
                    <option value="2000+">2,000+ enterprise</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#2D2D2D] uppercase tracking-wider mb-1">
                  Specific Requirements (Optional)
                </label>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-2.5 w-4 h-4 text-[#9A9A9A]" />
                  <input
                    type="text"
                    placeholder="e.g. Okta SAML 2.0, Net-30 Invoicing, Custom volume"
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    className="w-full bg-white border border-[#E0DAD1] focus:border-purple-600 rounded-lg py-2 pl-9 pr-3 text-xs text-[#2D2D2D] outline-none transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-full shadow-md text-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <span>Submitting Inquiry...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Enterprise Inquiry</span>
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-center text-[#9A9A9A] mt-2">
                Direct inquiries sent securely to the PantryPool Enterprise team.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
