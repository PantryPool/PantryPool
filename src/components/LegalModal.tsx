import React, { useState } from 'react';
import { X, ShieldCheck, FileText, Lock, Cookie, Scale, CheckCircle2, Printer, Share2, Check } from 'lucide-react';

export type LegalTabType = 'terms' | 'user-agreement' | 'privacy' | 'cookies';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTabType;
  onTabChange?: (tab: LegalTabType) => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'terms',
  onTabChange
}) => {
  const [activeTab, setActiveTab] = useState<LegalTabType>(initialTab);
  const [copied, setCopied] = useState(false);

  // Sync initialTab if modal is opened with a specific tab
  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleTabSelect = (tab: LegalTabType) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleShare = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://pantrypool.com';
    const shareUrl = `${origin}/${activeTab}`;
    const titles: Record<LegalTabType, string> = {
      privacy: 'PantryPool Privacy Policy (GDPR & CCPA Compliant)',
      terms: 'PantryPool Terms of Service',
      'user-agreement': 'PantryPool User Agreement & Communal Rules',
      cookies: 'PantryPool Cookie Policy',
    };
    const title = titles[activeTab] || 'PantryPool Legal & Compliance';

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title,
          url: shareUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#2D2D2D]/40 animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white border border-[#E0DAD1] rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] text-[#2D2D2D]">
        
        {/* Header */}
        <div className="px-6 py-4 sm:px-8 sm:py-5 border-b border-[#EDE8E0] flex items-center justify-between bg-[#FAFAF8]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FDF0EC] text-[#E8694A] flex items-center justify-center">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-[#2D2D2D]">Legal & Compliance Center</h2>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30">
                  Updated Sep 2026
                </span>
              </div>
              <p className="text-xs text-[#6B6B6B]">PantryPool Terms, User Agreement, Privacy & Cookie Policies</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              title="Copy shareable link"
              className="px-2.5 py-1.5 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-md transition flex items-center gap-1.5 text-xs font-medium border border-[#E0DAD1]/60"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#5A9A6B]" />
                  <span className="text-[#5A9A6B]">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </>
              )}
            </button>
            <button
              onClick={handlePrint}
              title="Print document"
              className="p-2 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-md transition"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#F0EBE3] rounded-md transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 sm:px-8 border-b border-[#E0DAD1] bg-[#F0EBE3] flex overflow-x-auto gap-2 py-2">
          <button
            onClick={() => handleTabSelect('terms')}
            className={`px-4 py-1.5 text-xs font-medium rounded-full transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'terms'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
            }`}
          >
            <FileText className="w-4 h-4" />
            Terms of Service
          </button>

          <button
            onClick={() => handleTabSelect('user-agreement')}
            className={`px-4 py-1.5 text-xs font-medium rounded-full transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'user-agreement'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            User Agreement & Communal Rules
          </button>

          <button
            onClick={() => handleTabSelect('privacy')}
            className={`px-4 py-1.5 text-xs font-medium rounded-full transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
            }`}
          >
            <Lock className="w-4 h-4" />
            Privacy Policy (GDPR / CCPA)
          </button>

          <button
            onClick={() => handleTabSelect('cookies')}
            className={`px-4 py-1.5 text-xs font-medium rounded-full transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'cookies'
                ? 'bg-[#E8694A] text-white shadow-xs'
                : 'text-[#6B6B6B] hover:text-[#2D2D2D] hover:bg-[#E8E2D9]'
            }`}
          >
            <Cookie className="w-4 h-4" />
            Cookie Policy
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-[#2D2D2D] text-sm leading-relaxed">
          
          {/* TAB 1: TERMS OF SERVICE */}
          {activeTab === 'terms' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-1">PantryPool Terms of Service</h3>
                <p className="text-xs text-[#6B6B6B]">Effective Date: August 14, 2026 (Updated September 2026)</p>
              </div>

              <div className="p-4 rounded-lg bg-[#F0EBE3] border border-[#E0DAD1] text-xs text-[#2D2D2D] leading-normal">
                <strong>Notice:</strong> Please review these Terms of Service carefully before utilizing the PantryPool platform, breakroom kiosks, QR scanners, or accounting tools. By accessing or using our services, you agree to be bound by all terms and conditions set forth herein.
              </div>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">1. Acceptance of Terms</h4>
                <p className="text-[#6B6B6B]">
                  These Terms of Service (&quot;Terms&quot;) constitute a legally binding agreement between you (&quot;User&quot;, &quot;you&quot;, or &quot;your&quot;) and PantryPool Inc. (&quot;PantryPool&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). These Terms govern your access to and use of our web application, breakroom kiosk software, automated OCR receipt parsing, communal accounting ledgers, and related services (collectively, the &quot;Service&quot;).
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">2. Description of the Service & Communal Pools</h4>
                <p className="text-[#6B6B6B]">
                  PantryPool provides a shared ledger accounting platform designed for communal pantries, coffee bars, office breakrooms, and co-living spaces. The Service facilitates tracking of inventory items, contributions, consumption events, and expense splits. PantryPool is a software intermediary and does not directly sell food or grocery merchandise; pool organizers and members are solely responsible for physical food safety and restocking integrity.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">3. Account Registration & Security</h4>
                <p className="text-[#6B6B6B]">
                  To access certain features, you must register for an account using email credentials or verified Single Sign-On (Google Workspace, Apple ID, SAML 2.0 / Okta). You agree to provide accurate, truthful information and maintain the confidentiality of your login credentials. You are responsible for all activities that occur under your account.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">4. Financial Transactions & Communal Accounting Balances</h4>
                <p className="text-[#6B6B6B]">
                  Balances shown in PantryPool represent internal communal accounting tallies agreed upon by your group or household. PantryPool is a software tracking and expense-balancing tool; it does not operate as an escrow agent, hold custodial funds, or provide banking services. Pool members and managers are solely responsible for physical cash handling, third-party peer-to-peer settlements (such as Venmo, Cash App, or Zelle), and internal dispute resolution.
                </p>
              </section>

              <section className="space-y-3 policy-section" id="refund-and-cancellation-policy">
                <h4 className="font-semibold text-[#2D2D2D] text-base">5. Billing, Cancellation, and Refund Policy</h4>
                <div className="p-4 rounded-lg bg-[#F9F7F4] border border-[#E0DAD1] space-y-3 text-xs text-[#2D2D2D] leading-normal">
                  <div>
                    <h5 className="font-semibold text-[#2D2D2D] text-xs uppercase tracking-wider mb-1">5.1 Subscription Plans and Automated Renewal</h5>
                    <p className="text-[#6B6B6B]">
                      PantryPool offers monthly and yearly paid subscription tiers (such as Hosted Standard and Hosted Plus) to support advanced team workspace features. By subscribing to PantryPool, you agree that your subscription will automatically renew at the end of each applicable billing cycle (monthly or annually) unless you cancel it prior to the renewal date. Payment will be charged to your designated payment method on file via our secure payment processor (Stripe).
                    </p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#2D2D2D] text-xs uppercase tracking-wider mb-1">5.2 Cancellation Terms</h5>
                    <p className="text-[#6B6B6B]">
                      You may cancel your subscription at any time directly through your account billing dashboard. Upon cancellation, your paid subscription features will remain active until the end of your current paid billing period. No partial-period refunds or mid-cycle shutdowns will occur, and your workspace will transition to our Free tier features once the paid period expires.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#2D2D2D] text-xs uppercase tracking-wider mb-1">5.3 14-Day Refund Window (Initial Purchases)</h5>
                    <p className="text-[#6B6B6B]">
                      We offer a full, no-questions-asked refund on initial subscription purchases (both monthly and yearly plans) if requested within <strong>14 days</strong> of the original transaction date. To request an initial purchase refund, contact our support team at <a href="mailto:support@pantrypool.com" className="text-[#E8694A] hover:underline font-medium">support@pantrypool.com</a> with your account details.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#2D2D2D] text-xs uppercase tracking-wider mb-1">5.4 Renewal Refunds and Exceptions</h5>
                    <p className="text-[#6B6B6B]">
                      Automatic subscription renewals are generally non-refundable once processed. However, if you experience an accidental automatic renewal charge and contact support within <strong>48 hours</strong> of the renewal billing date, our team will review the request for a courtesy refund.
                    </p>
                  </div>

                  <div>
                    <h5 className="font-semibold text-[#2D2D2D] text-xs uppercase tracking-wider mb-1">5.5 Processing and Payouts</h5>
                    <p className="text-[#6B6B6B]">
                      Approved refunds are processed immediately through our payment gateway and typically reflect in the user&#39;s financial institution account within 5 to 10 business days. Edge access controls and subscription status levels update automatically upon refund execution.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">6. Acceptable Use & Anti-Fraud</h4>
                <p className="text-[#6B6B6B]">
                  You agree not to: (a) deliberately record false receipts or fraudulent transactions; (b) manipulate or tamper with breakroom QR codes or kiosk displays; (c) attempt unauthorized access to other organizations&#39; private ledgers; (d) deploy automated scraping bots against our API; or (e) transmit malicious code or disrupt server operations.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">7. Disclaimer of Warranties & Limitation of Liability</h4>
                <p className="text-[#6B6B6B]">
                  THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. IN NO EVENT SHALL PANTRYPOOL INC. BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING OUT OF OR IN CONNECTION WITH THE USE OF OUR SERVICE OR COMMISSIONS/DISPUTES REGARDING SHARED GROCERIES.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">8. Governing Law & Dispute Resolution</h4>
                <p className="text-[#6B6B6B]">
                  These Terms shall be governed and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions. Any dispute arising out of these Terms shall be resolved through binding confidential arbitration in the State of Texas.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">9. Third-Party Data & Open Food Facts Attribution</h4>
                <p className="text-[#6B6B6B]">
                  Barcode product information, nutrition, packaging, and catalog metadata are sourced in part from <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="text-[#E8694A] hover:underline font-medium">Open Food Facts</a>, made available under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer" className="text-[#E8694A] hover:underline font-medium">Open Database License (ODbL 1.0)</a>. Individual product imagery remains under the copyright and license of respective contributors under Creative Commons (CC-BY-SA). In accordance with the ODbL Share-Alike principle, PantryPool encourages pool members to contribute new product barcodes and updates back to the global Open Food Facts collective database.
                </p>
              </section>
            </div>
          )}

          {/* TAB 2: USER AGREEMENT */}
          {activeTab === 'user-agreement' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-1">PantryPool User Agreement & Communal Guidelines</h3>
                <p className="text-xs text-[#6B6B6B]">Community Trust & Fairness Standard</p>
              </div>

              <div className="p-4 rounded-lg bg-[#EDF5EF] border border-[#5A9A6B]/30 text-xs text-[#2D2D2D] leading-normal">
                <strong>Honor System & Trust:</strong> PantryPool relies on mutual trust, transparency, and accountability among team members, roommates, and colleagues.
              </div>

              <section className="space-y-3">
                <h4 className="font-semibold text-[#2D2D2D] text-base">1. Member Responsibilities</h4>
                <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-[#6B6B6B]">
                  <li><strong className="text-[#2D2D2D]">Prompt Item Logging:</strong> Always scan or log snacks, drinks, or coffee consumed at the time of taking to ensure accurate real-time inventory for your pool mates.</li>
                  <li><strong className="text-[#2D2D2D]">Timely Balance Settlement:</strong> Settle negative ledger balances when requested by pool administrators or when reaching pool credit limits.</li>
                  <li><strong className="text-[#2D2D2D]">Accurate Restock Receipts:</strong> When claiming reimbursement for grocery restocks, ensure receipts uploaded are genuine and itemized.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h4 className="font-semibold text-[#2D2D2D] text-base">2. Pool Administrator Guidelines</h4>
                <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-[#6B6B6B]">
                  <li><strong className="text-[#2D2D2D]">Fair Pricing:</strong> Set item prices based on actual cost without unauthorized price gouging, accounting for taxes and delivery fees transparently.</li>
                  <li><strong className="text-[#2D2D2D]">Regular Audits:</strong> Perform periodic inventory counts and reconcile expired or damaged items using the ledger adjustment tools.</li>
                  <li><strong className="text-[#2D2D2D]">Privacy Respect:</strong> Treat member dietary preferences and consumption timestamps with respect and privacy.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h4 className="font-semibold text-[#2D2D2D] text-base">3. Kiosk & Breakroom Etiquette</h4>
                <p className="text-[#6B6B6B]">
                  Breakroom iPads or kiosk displays should remain in designated communal spaces and not be used for personal web browsing. Members should sanitize hands and treat communal equipment with care.
                </p>
              </section>
            </div>
          )}

          {/* TAB 3: PRIVACY POLICY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-1">PantryPool Privacy Policy (GDPR & CCPA Compliant)</h3>
                <p className="text-xs text-[#6B6B6B]">Last Revised: August 14, 2026</p>
              </div>

              <div className="p-4 rounded-lg bg-[#F0EBE3] border border-[#E0DAD1] text-xs text-[#2D2D2D]">
                PantryPool is committed to protecting your personal data and upholding your privacy rights in compliance with the General Data Protection Regulation (GDPR), the California Consumer Privacy Act (CCPA), and applicable global privacy regulations.
              </div>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">1. Data We Collect</h4>
                <p className="text-[#6B6B6B]">We collect only the information necessary to provide our shared pantry ledger services:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#6B6B6B]">
                  <li><strong className="text-[#2D2D2D]">Identity & Profile:</strong> Full name, email address, avatar image (via Gravatar/Dicebear or OAuth provider), and corporate organization affiliation.</li>
                  <li><strong className="text-[#2D2D2D]">OAuth Authentication Data:</strong> Google Account ID or Apple Sub IDs when signing in via Google or Apple Identity.</li>
                  <li><strong className="text-[#2D2D2D]">Google API User Data Policy:</strong> PantryPool&apos;s use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" className="text-[#E8694A] hover:underline font-medium">Google API Services User Data Policy</a>, including the Limited Use requirements. Google profile details (email, name, photo) are used strictly to authenticate your account and display your pantry profile to pool members. We never sell Google user data or transfer it for advertising purposes.</li>
                  <li><strong className="text-[#2D2D2D]">Transaction & Ledger Records:</strong> Items consumed, deposits made, restock receipts uploaded, and balance histories.</li>
                  <li><strong className="text-[#2D2D2D]">Technical & Analytics Data:</strong> IP addresses (anonymized in Google Analytics), browser type, device information, and interaction telemetry (subject to your cookie consent).</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">2. Google Analytics & Performance Telemetry</h4>
                <p className="text-[#6B6B6B]">
                  We utilize Google Analytics 4 (GA4) to understand aggregate user engagement and improve platform performance. In accordance with EU ePrivacy and GDPR laws:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#6B6B6B]">
                  <li>Google Analytics operates under <strong className="text-[#2D2D2D]">Google Consent Mode v2</strong>. Analytics cookies are strictly disabled until you explicitly give affirmative consent via our Cookie Banner.</li>
                  <li>IP addresses are automatically anonymized, and demographic data sharing with Google advertising networks is disabled.</li>
                  <li>You may withdraw or update your analytics consent at any time via the Cookie Settings dialog in the footer.</li>
                </ul>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">3. AI Receipt Parsing & Optical Recognition</h4>
                <p className="text-[#6B6B6B]">
                  When you upload receipt images for automated restocking, receipt images are processed strictly for extracting item names, quantities, and totals. Image data is not sold or shared with external marketing brokers.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">4. Your GDPR & CCPA Rights</h4>
                <p className="text-[#6B6B6B]">You have the following rights regarding your personal information:</p>
                <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-[#6B6B6B]">
                  <li><strong className="text-[#2D2D2D]">Right to Access & Portability:</strong> Request an export of your ledger transactions and personal profile.</li>
                  <li><strong className="text-[#2D2D2D]">Right to Rectification:</strong> Edit or correct inaccurate account details.</li>
                  <li><strong className="text-[#2D2D2D]">Right to Erasure (&quot;Right to be Forgotten&quot;):</strong> Request full account and data deletion.</li>
                  <li><strong className="text-[#2D2D2D]">Right to Object & Restrict:</strong> Opt-out of non-essential telemetry or automated processing.</li>
                </ul>
                <p className="text-xs text-[#6B6B6B] mt-2">
                  To exercise your privacy rights, email our Data Protection Officer at <code className="text-[#E8694A]">privacy@pantrypool.com</code>.
                </p>
              </section>
            </div>
          )}

          {/* TAB 4: COOKIE POLICY */}
          {activeTab === 'cookies' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-[#2D2D2D] mb-1">PantryPool Cookie Policy</h3>
                <p className="text-xs text-[#6B6B6B]">Last Updated: September 13, 2026</p>
              </div>

              <div className="p-4 rounded-lg bg-[#F0EBE3] border border-[#E0DAD1] text-xs text-[#2D2D2D] leading-normal">
                This Cookie Policy explains how PantryPool (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) uses cookies and similar storage technologies on our website and applications. By using the Service, you consent to the use of cookies in accordance with this policy and your consent preferences.
              </div>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">1. What Are Cookies?</h4>
                <p className="text-[#6B6B6B]">
                  Cookies and browser local storage are small data files stored on your device when you visit a website. They are widely used to ensure websites function properly, maintain secure user sessions, and provide aggregate usage information to site operators.
                </p>
              </section>

              <section className="space-y-3">
                <h4 className="font-semibold text-[#2D2D2D] text-base">2. Categories of Cookies We Use</h4>
                
                <div className="space-y-3">
                  <div className="border border-[#E0DAD1] bg-[#F9F7F4] rounded-lg p-3.5 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[#2D2D2D]">Essential & Strictly Necessary Storage</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#EDF5EF] text-[#5A9A6B] border border-[#5A9A6B]/30">
                        Always Active
                      </span>
                    </div>
                    <p className="text-[#6B6B6B]">
                      Required for security, user authentication, and basic site operations. Because these storage mechanisms are strictly necessary to deliver the Service, they cannot be disabled.
                    </p>
                  </div>

                  <div className="border border-[#E0DAD1] bg-[#F9F7F4] rounded-lg p-3.5 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[#2D2D2D]">Analytics & Performance Cookies</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#EDF4FA] text-[#8FB8DE] border border-[#8FB8DE]/30">
                        Consent Required
                      </span>
                    </div>
                    <p className="text-[#6B6B6B]">
                      Used with your affirmative consent to gather aggregated, anonymous metrics regarding how visitors navigate the platform. This helps us optimize performance, diagnose technical issues, and improve features.
                    </p>
                  </div>

                  <div className="border border-[#E0DAD1] bg-[#F9F7F4] rounded-lg p-3.5 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-[#2D2D2D]">Preferences & Functionality</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#FFF8EB] text-[#D4870E] border border-[#D4870E]/30">
                        Optional
                      </span>
                    </div>
                    <p className="text-[#6B6B6B]">
                      Enables the platform to remember your personal interface preferences and settings across browser sessions.
                    </p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">3. Managing Your Cookie Preferences</h4>
                <p className="text-[#6B6B6B]">
                  You can modify or withdraw your cookie consent at any time via the on-site Cookie Preferences banner or through your browser settings. You can configure most web browsers to block or alert you about cookies; however, blocking essential cookies may prevent parts of the site from functioning correctly.
                </p>
              </section>

              <section className="space-y-2">
                <h4 className="font-semibold text-[#2D2D2D] text-base">4. Contact Us</h4>
                <p className="text-[#6B6B6B]">
                  If you have questions about our use of cookies or privacy practices, please contact our Data Protection Officer at <a href="mailto:privacy@pantrypool.com" className="text-[#E8694A] hover:underline font-medium">privacy@pantrypool.com</a>.
                </p>
              </section>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 sm:px-8 bg-[#FAFAF8] border-t border-[#EDE8E0] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-[#6B6B6B]">
            <CheckCircle2 className="w-4 h-4 text-[#5A9A6B]" />
            <span>PantryPool Compliance & Trust Guarantee</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 bg-[#E8694A] hover:bg-[#D45A3D] text-white font-medium rounded-full transition text-xs shadow-xs"
            >
              I Understand & Acknowledge
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
