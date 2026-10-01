import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  Receipt, 
  ArrowRight, 
  Check, 
  ChevronDown, 
  HelpCircle, 
  Smartphone, 
  ShieldCheck, 
  Zap, 
  Coffee, 
  ScanLine, 
  Flame,
  Printer,
  PackageCheck
} from 'lucide-react';
import { LegalTabType } from './LegalModal';
import { PantryPoolIcon, PantryPoolLogo } from './Logo';
import { isOrganizationsEnabled } from '../lib/api';
import { EnterpriseInquiryModal } from './EnterpriseInquiryModal';

export interface SignupIntent {
  tier?: 'community' | 'standard' | 'plus';
  billingCycle?: 'monthly' | 'yearly';
}

interface LandingPageProps {
  onOpenAuthModal: (mode?: 'login' | 'register', intent?: SignupIntent) => void;
  onOpenLegal?: (tab: LegalTabType) => void;
  onOpenAffiliates?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuthModal,
  onOpenLegal,
  onOpenAffiliates
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [chaosMode, setChaosMode] = useState<boolean>(true);
  const [isEnterpriseModalOpen, setIsEnterpriseModalOpen] = useState<boolean>(false);

  // High-performance GPU-composited parallax:
  // Runs purely on requestAnimationFrame via passive scroll listeners without React re-renders or layout queries.
  // Restricted to tablet/desktop (>768px) to protect mobile Core Web Vitals and battery.
  const coldBrewRef = useRef<HTMLDivElement>(null);
  const tabletRef = useRef<HTMLDivElement>(null);
  const nfcRef = useRef<HTMLDivElement>(null);
  const boxesRef = useRef<HTMLDivElement>(null);

  // Reality Check comparison auto-switch:
  // Automatically switches from "The Broken Honor System" to "PantryPool Equilibrium" as the comparison
  // container crosses the halfway mark of the viewport, and switches back when scrolling back above it.
  // Uses IntersectionObserver for smooth auto-switching with zero main-thread scroll listener overhead.
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const target = boxesRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setChaosMode(false);
          } else if (entry.boundingClientRect.top > 0) {
            setChaosMode(true);
          }
        }
      },
      {
        rootMargin: '100000px 0px -50% 0px',
        threshold: 0
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          if (scrollY < 1200) {
            if (coldBrewRef.current) {
              coldBrewRef.current.style.transform = `translate3d(0, ${scrollY * 0.12}px, 0)`;
            }
            if (tabletRef.current) {
              tabletRef.current.style.transform = `translate3d(0, ${scrollY * -0.06}px, 0)`;
            }
            if (nfcRef.current) {
              nfcRef.current.style.transform = `translate3d(0, ${scrollY * 0.16}px, 0) rotate(${scrollY * 0.015}deg)`;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const faqs = [
    {
      q: "Can team members log drinks without installing an app?",
      a: "Yes! When someone scans your fridge poster with their phone camera, our mobile web kiosk opens immediately. They tap the item or scan its QR code, and it's logged in less than two seconds. No App Store download or password required."
    },
    {
      q: "How do members settle up when their balance goes negative?",
      a: "With 1-tap peer-to-peer settle up links. Members can pay back the pantry champion or team buyer via Venmo, Cash App, PayPal, or cash. When the recipient confirms, the communal ledger clears immediately."
    },
    {
      q: "How is PantryPool different from generic expense-splitting apps like Splitwise?",
      a: "Unlike generic expense apps designed for monthly rent or group trips, PantryPool is built specifically for communal food and workplace breakrooms. It provides physical QR code fridge posters, zero-app mobile grab-and-go kiosks, real-time pantry inventory, multimodal AI grocery receipt scanning with line-item tax calculation, and non-custodial running balance ledgers."
    },
    {
      q: "Do we need specialized hardware or card readers to run an office snack kiosk?",
      a: "No expensive terminals or card readers required. PantryPool turns any smartphone into a kiosk: print our free custom QR code poster for your fridge door or stick inexpensive NFC tags on snack shelves. Team members scan or tap with their phone camera to log snacks and drinks in under 2 seconds."
    },
    {
      q: "Can I use PantryPool as a coffee club app for our office?",
      a: "Yes! PantryPool is a dedicated coffee club app and breakroom snack tracker. It is purpose-built for office coffee clubs, espresso machines, bean subscriptions, cold brew kegs, soda clubs, and communal snack clubs. Print a QR code poster for your coffee station or soda fridge, let members tap or scan to log drinks and snacks in under 2 seconds, and automatically balance the fund without cash jars or awkward Slack reminders."
    },
    {
      q: "Is it really free for small teams and households?",
      a: "Yes! PantryPool Community Edition is 100% free forever for up to 3 members on our managed cloud. If you prefer to run it yourself on your own infrastructure, our open-source codebase on GitHub supports unlimited members with zero licensing fees."
    },
    {
      q: "Can PantryPool integrate with our company's Slack or Microsoft Teams?",
      a: isOrganizationsEnabled
        ? "Yes! With Hosted Standard and Hosted Plus tiers on PantryPool SaaS, we offer native 2-way Slack bot integration for low-stock alerts, automatic Friday balance digests, restock polling, and item consumption notifications. Microsoft Teams bot integration is coming soon."
        : "The open-source self-hosted edition focuses on the core communal ledger, mobile QR code scanning, and peer-to-peer settle-ups. Enterprise 2-way Slack bot workflows (with Microsoft Teams bot integration coming soon) are exclusively hosted on the managed PantryPool SaaS platform (https://pantrypool.com)."
    }
  ];

  return (
    <main className="relative min-h-screen bg-[#0E1015] text-[#ECEEEA] font-sans selection:bg-[#FF5722] selection:text-white overflow-x-hidden">
      
      {/* Dynamic Ambient Mesh Glows (Optimized for Mobile WebKit GPU Compositor) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden transform-gpu [contain:strict]">
        <div className="absolute -top-[10%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-[radial-gradient(circle,rgba(255,87,34,0.12)_0%,transparent_70%)] md:bg-gradient-to-br md:from-[#FF5722]/15 md:to-transparent md:blur-[140px] transform-gpu"></div>
        <div className="absolute top-[30%] -right-[15%] w-[55vw] h-[55vw] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.08)_0%,transparent_70%)] md:bg-gradient-to-bl md:from-[#10B981]/10 md:to-transparent md:blur-[160px] transform-gpu"></div>
        <div className="absolute -bottom-[10%] left-[20%] w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.08)_0%,transparent_70%)] md:bg-gradient-to-tr md:from-[#3B82F6]/10 md:to-transparent md:blur-[150px] transform-gpu"></div>
        {/* Subtle grid texture (rendered on desktop only to avoid WebKit mask-image GPU buffer exhaustion on mobile) */}
        <div className="hidden md:block absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-12 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto min-h-[90vh] flex flex-col justify-center">

        {/* Top Tag Pill */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 md:backdrop-blur-md text-xs text-zinc-300 shadow-xl">
            <span className="flex h-2 w-2 rounded-full bg-[#FF5722] animate-pulse"></span>
            <span className="font-medium">The Smart Office Snack Club App, Coffee Fund &amp; Breakroom Ledger</span>
            <span className="text-zinc-500">•</span>
            <span className="text-[#FF5722] font-semibold flex items-center gap-1">
              Zero App Download Needed <Zap className="w-3 h-3 inline" />
            </span>
          </div>
        </div>

        {/* Dynamic Main Title - Instant paint for optimal LCP */}
        <div className="text-center max-w-5xl mx-auto relative">
          
          <h1 
            className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.14] text-white"
          >
            The Breakroom Honor System Is Broken.{' '}
            <span className="block mt-2 pb-2 sm:pb-3 bg-gradient-to-r from-[#FF5722] via-[#FF8A65] to-[#10B981] bg-clip-text text-transparent">
              Keep The Cold Brew Flowing.
            </span>
          </h1>

          <p 
            className="mt-7 text-lg sm:text-xl text-zinc-300 max-w-3xl mx-auto leading-relaxed"
          >
            PantryPool is the smart office snack club app and communal breakroom food ledger. 
            Turn shared snack cabinets, espresso bars, and soda fridges into automated micro-markets: scan fridge posters, 
            tap NFC shelf tags, and let multimodal Gemini AI parse grocery receipts down to the penny.
          </p>

          {/* Action CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <button
              onClick={() => onOpenAuthModal('register', { tier: 'community', billingCycle })}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#FF5722] to-[#F4511E] hover:from-[#F4511E] hover:to-[#E64A19] text-white font-semibold rounded-2xl shadow-[0_0_30px_rgba(255,87,34,0.35)] hover:shadow-[0_0_40px_rgba(255,87,34,0.55)] transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 text-sm"
            >
              <span>Create Your Pantry Pool Free</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => onOpenAuthModal('login')}
              className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/15 text-white font-medium rounded-2xl md:backdrop-blur-md transition flex items-center justify-center text-sm"
            >
              <span>Sign In To Existing Pool</span>
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[#10B981]" /> Instant Setup in 60s</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[#10B981]" /> 100% Free Forever for Small Teams</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[#10B981]" /> 1-Tap Venmo & Cash App Settle</span>
          </div>
        </div>

        {/* 3D Kinetic Floating Layer Stage */}
        <div className="mt-16 relative w-full max-w-5xl mx-auto h-[540px] sm:h-[620px] rounded-3xl border border-white/10 bg-[#141720]/80 md:bg-gradient-to-b md:from-white/[0.07] md:to-white/[0.02] md:backdrop-blur-xl p-4 sm:p-8 shadow-2xl overflow-hidden">
          
          {/* Subtle Stage Lighting Line */}
          <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-[#FF5722] to-transparent opacity-75"></div>

          {/* Floating Physical Artifact 1: Cold Brew Draft Can (Perspective 3D) */}
          <div ref={coldBrewRef} className="absolute top-20 sm:top-28 left-4 sm:left-8 lg:left-12 z-20 w-44 sm:w-50 p-4 rounded-2xl bg-[#181B22] md:bg-[#181B22]/95 border border-white/15 md:backdrop-blur-md shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer animate-float">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF8A65] border border-[#FF5722]/30 font-semibold">
                CHILLED
              </span>
              <span className="text-xs font-mono text-emerald-400 font-bold">$2.50</span>
            </div>
            <div className="h-28 rounded-xl bg-gradient-to-b from-[#2A2E39] via-[#1C1F27] to-[#12141A] border border-white/10 flex items-center justify-center relative overflow-hidden">
              {/* Metallic Sheen Line */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12"></div>
              <div className="text-center relative z-10">
                <Coffee className="w-8 h-8 text-amber-400 mx-auto mb-1" />
                <div className="text-xs font-bold text-white tracking-wide">NITRO BREW</div>
                <div className="text-[9px] text-zinc-400 font-mono">12 fl oz • Barista Grade</div>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[10px] text-zinc-400">
              <span>Stock: 8 left</span>
              <span className="text-[#10B981] font-semibold">1-Tap Log</span>
            </div>
          </div>

          {/* Center Stage: Interactive Live Pool Workspace Tablet Preview */}
          <div ref={tabletRef} className="relative z-10 max-w-xl mx-auto mt-8 sm:mt-12 rounded-2xl bg-[#13151C] border border-white/15 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <PantryPoolIcon variant="duotone" size={24} />
                <div>
                  <div className="text-xs font-bold text-white">Main Kitchen & Coffee Lab</div>
                  <div className="text-[10px] text-zinc-400 font-mono">Pool Balance: +$184.20</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Live Feed</span>
              </div>
            </div>

            {/* Quick Live Ledger Rows */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xs">
                    AM
                  </div>
                  <div>
                    <div className="font-semibold text-white">Alex Morgan</div>
                    <div className="text-[10px] text-zinc-400">Restocked Oat Milk (Costco) via AI Scanner</div>
                  </div>
                </div>
                <span className="font-mono text-emerald-400 font-bold">+$32.50</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                    SC
                  </div>
                  <div>
                    <div className="font-semibold text-white">Sarah Chen</div>
                    <div className="text-[10px] text-zinc-400">NFC Tap: Cold Brew & Sparkling Citrus</div>
                  </div>
                </div>
                <span className="font-mono text-red-400 font-bold">-$3.70</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/5 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                    MV
                  </div>
                  <div>
                    <div className="font-semibold text-white">Marcus Vance</div>
                    <div className="text-[10px] text-zinc-400">Settled balance via 1-Tap Venmo</div>
                  </div>
                </div>
                <span className="font-mono text-emerald-400 font-bold">+$12.00</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1 text-[11px]">
                <QrCode className="w-3.5 h-3.5 text-[#FF5722]" /> Scan fridge poster to participate
              </span>
              <button 
                onClick={() => onOpenAuthModal('register')}
                className="text-[#FF5722] font-semibold hover:underline inline-flex items-center gap-1"
              >
                Join Pool <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Floating Physical Artifact 2: The NFC Tap Tag Sticker */}
          <div ref={nfcRef} className="absolute bottom-12 sm:bottom-16 right-4 sm:right-8 lg:right-12 z-20 w-44 sm:w-52 p-4 rounded-2xl bg-[#1F232D] md:bg-[#1F232D]/95 border border-white/15 md:backdrop-blur-md shadow-2xl hover:scale-105 transition-all duration-300 animate-float-reverse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Smartphone className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-white">SHELF NFC TAG</span>
            </div>
            <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 font-mono text-[10px] text-zinc-300 space-y-1">
              <div className="text-emerald-400 font-bold">TAP DETECTED</div>
              <div>Item: Sparkling Lime 355ml</div>
              <div>Price: $1.20</div>
              <div className="text-zinc-400">Auto-debited instantly</div>
            </div>
            <div className="mt-2 text-[10px] text-zinc-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" /> Physical shelf verified
            </div>
          </div>

        </div>

      </section>

      {/* 4-Step Physical-to-Digital Flow & Reality Check */}
      <section id="how-it-works" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto border-t border-white/10">
        
        {/* 4-Step Walkthrough */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>HOW IT WORKS IN 60 SECONDS</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            The 4-Step Breakroom Loop
          </h2>
          <p className="mt-3 text-zinc-400 text-base">
            From grocery haul to honest communal ledger with zero friction.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-24">
          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition duration-200">
            <div className="w-10 h-10 rounded-xl bg-[#E8694A]/20 text-[#FF8A65] flex items-center justify-center font-bold text-sm mb-4">
              01
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="w-4 h-4 text-[#FF8A65]" />
              <h3 className="text-base font-bold text-white">Stock in Seconds</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Snap a supermarket receipt with Gemini AI vision or pick popular breakroom staples to auto-populate inventory.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition duration-200">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-sm mb-4">
              02
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Printer className="w-4 h-4 text-blue-400" />
              <h3 className="text-base font-bold text-white">Hang Fridge Poster</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Print your pool's custom QR poster with 1 click and tape it directly to the fridge or snack cabinet door.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition duration-200">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm mb-4">
              03
            </div>
            <div className="flex items-center gap-2 mb-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <h3 className="text-base font-bold text-white">2-Second Mobile Grab</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Coworkers scan the poster with their phone camera to log a drink in 2 seconds. Zero app download required.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition duration-200">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-sm mb-4">
              04
            </div>
            <div className="flex items-center gap-2 mb-2">
              <QrCode className="w-4 h-4 text-purple-400" />
              <h3 className="text-base font-bold text-white">Tab & Settle Up</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Running balances update automatically. Members square up on payday via 1-tap Venmo or Cash App links.
            </p>
          </div>
        </div>
        
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FF5722]/15 text-[#FF8A65] border border-[#FF5722]/30 mb-3">
            <Flame className="w-3.5 h-3.5" />
            <span>REALITY CHECK</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Stop Breakroom Passive-Aggression.
          </h2>
          <p className="mt-3 text-zinc-400 text-base">
            See what happens to office harmony before and after PantryPool.
          </p>

          {/* Interactive Toggle Pill */}
          <div className="mt-6 inline-flex p-1 rounded-full bg-white/10 border border-white/15">
            <button
              onClick={() => setChaosMode(true)}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-all duration-300 ${
                chaosMode 
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30 scale-105' 
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              The Broken Honor System 💥
            </button>
            <button
              onClick={() => setChaosMode(false)}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-all duration-300 ${
                !chaosMode 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-105' 
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              PantryPool Equilibrium ✨
            </button>
          </div>
        </div>

        {/* Comparison Showcase Container */}
        <div ref={boxesRef} className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          
          {/* Box 1: The Honor System (Red) */}
          <div className={`p-8 rounded-3xl border transition-all duration-500 ease-out transform ${
            chaosMode 
              ? 'bg-red-950/30 border-red-500/60 shadow-lg md:shadow-[0_0_50px_rgba(239,68,68,0.25)] scale-[1.02] -translate-y-1' 
              : 'bg-white/[0.02] border-white/10 scale-[0.98] translate-y-1'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-red-400">Before: Spreadsheets & Post-Its</span>
              <span className="text-xl">🤬</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">The Passive-Aggressive Kitchen</h3>
            
            <ul className="space-y-3.5 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 mt-0.5">✕</span>
                <span><strong>Crinkly cash jars:</strong> "I only had a $20 bill so I took 4 sodas and a bag of chips" (inevitably short $35 every Friday).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 mt-0.5">✕</span>
                <span><strong>Hostile sticky notes:</strong> Sharpie taped to the oat milk: <em>"WHO DRANK THIS? YOU OWE ME $4.99!!!"</em></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0 mt-0.5">✕</span>
                <span><strong>The Restocker's Burden:</strong> The generous colleague who buys groceries at Costco gets left with unpaid receipts and awkward Slack reminders.</span>
              </li>
            </ul>
          </div>

          {/* Box 2: PantryPool (Green / Orange) */}
          <div className={`p-8 rounded-3xl border transition-all duration-500 ease-out transform ${
            !chaosMode 
              ? 'bg-emerald-950/30 border-emerald-500/60 shadow-lg md:shadow-[0_0_50px_rgba(16,185,129,0.25)] scale-[1.02] -translate-y-1' 
              : 'bg-white/[0.02] border-white/10 scale-[0.98] translate-y-1'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">After: Automated & Fair</span>
              <span className="text-xl">☕</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">The Self-Balancing Breakroom</h3>

            <ul className="space-y-3.5 text-sm text-zinc-300">
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">✓</span>
                <span><strong>1-Tap QR Code Logging:</strong> Anyone can scan the fridge poster or item QR code from any smartphone with zero friction.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">✓</span>
                <span><strong>Multimodal AI Receipt Scanner:</strong> Take a photo of your receipt. Gemini Vision AI auto-credits the buyer and replenishes pantry stock.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">✓</span>
                <span><strong>Transparent Peer-to-Peer Settle:</strong> Balances are tracked down to the cent. 1 tap to square up via Venmo, Cash App, or cash.</span>
              </li>
            </ul>
          </div>

        </div>

      </section>

      {/* Laser OCR Parallax Feature Showcase */}
      <section id="features" className="relative z-10 py-24 bg-gradient-to-b from-white/[0.03] to-transparent border-t border-white/10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-3">
              <ScanLine className="w-3.5 h-3.5" />
              <span>MULTIMODAL GEMINI AI VISION</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
              Turn Crinkled Paper Receipts Into Clean Communal Math.
            </h2>
            <p className="mt-4 text-zinc-400 text-base leading-relaxed">
              No more typing item names or calculating sales tax splits by hand. Restockers simply snap a photo of any grocery receipt. 
              Our integrated vision model parses line items, unit quantities, volume discounts, and local taxes in seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-[#FF5722]/15 text-[#FF8A65] shrink-0 mt-1">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Full Line Item Breakdown</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">Extracts item name, unit cost, pack quantity, and volume discounts automatically.</p>
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 flex items-start gap-4">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0 mt-1">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1">Instant Credit to the Buyer</h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">The restocker's balance is credited immediately, so they never front office food costs for free.</p>
                </div>
              </div>
            </div>

            {/* Parallax Laser Scanned Receipt Visual */}
            <div className="relative p-6 sm:p-8 rounded-3xl bg-[#141720] border border-white/15 shadow-2xl overflow-hidden">
              
              {/* Laser Line Animation */}
              <div 
                className="absolute top-6 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF5722] to-transparent shadow-[0_0_20px_#FF5722,0_0_8px_#FF8A65] z-30 pointer-events-none animate-laser"
              >
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[#C2410C] text-white text-[9px] font-mono tracking-widest uppercase shadow-md flex items-center gap-1.5 whitespace-nowrap font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                  <span>GEMINI VISION RECEIPT SCANNER</span>
                </div>
              </div>

              {/* Thermal Paper Mockup */}
              <div className="p-6 rounded-2xl bg-[#FAFAF8] text-[#1E2024] font-mono shadow-inner border border-zinc-300 space-y-3 text-xs">
                <div className="text-center border-b border-dashed border-zinc-400 pb-3">
                  <div className="font-bold text-sm">WHOLESALE MARKET #412</div>
                  <div className="text-[10px] text-zinc-500">1044 MARKET ST • SAN FRANCISCO</div>
                  <div className="text-[10px] text-zinc-500 font-bold mt-1">BREAKROOM RESTOCK BATCH</div>
                </div>

                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between font-medium">
                    <span>COLD BREW 12PK</span>
                    <span>$18.99</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>OAT MILK ORGANIC 6CT</span>
                    <span>$14.50</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>KIND BARS VARIETY 24PK</span>
                    <span>$21.99</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>SPARKLING WATER 24PK</span>
                    <span>$8.50</span>
                  </div>
                </div>

                <div className="border-t border-dashed border-zinc-400 pt-2 flex justify-between font-bold text-sm">
                  <span>TOTAL CREDITED</span>
                  <span className="text-emerald-700 font-bold">$63.98</span>
                </div>

                <div className="p-2 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-sans font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Parsed by Gemini AI • 4 items added to pantry</span>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* Pricing / Tiers Section */}
      <section id="pricing" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        
        <div className="text-center mb-16">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF5722] mb-3">Transparent Economics</h2>
          <p className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Fair Plans for Households and Global Teams.
          </p>
          <p className="mt-3 text-zinc-400 text-base max-w-lg mx-auto">
            Zero setup fees. Start free forever or unlock team bots and managed backups.
          </p>

          {/* Billing Cycle Selector */}
          <div className="mt-8 inline-flex items-center p-1 rounded-full bg-white/10 border border-white/15">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition ${
                billingCycle === 'monthly'
                  ? 'bg-[#C2410C] text-white shadow-lg'
                  : 'text-zinc-200 hover:text-white'
              }`}
            >
              Monthly billing
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-[#C2410C] text-white shadow-lg'
                  : 'text-zinc-200 hover:text-white'
              }`}
            >
              <span>Annual billing</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shadow-xs ${
                billingCycle === 'yearly'
                  ? 'bg-white text-[#C2410C]'
                  : 'bg-emerald-950 text-emerald-200 border border-emerald-600/70'
              }`}>
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* 3 Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          
          {/* Card 1: Community */}
          <div className="p-6 sm:p-7 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Community Edition</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">FSL Open Source</span>
              </div>
              <div className="text-4xl font-extrabold text-white font-mono mb-2">$0</div>
              <p className="text-xs text-zinc-400 mb-6">Free forever for households, shared flats, and small creator studios.</p>
              
              <ul className="space-y-3 text-xs text-zinc-300 mb-8">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Up to 3 members on Cloud</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Unlimited members if self-hosted</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Printable fridge QR poster generator</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> QR Code & NFC tag logging</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 1-Tap Venmo / Cash App Settle</li>
              </ul>
            </div>

            <button
              onClick={() => onOpenAuthModal('register', { tier: 'community', billingCycle })}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition border border-white/10 cursor-pointer"
            >
              Start Free Today
            </button>
          </div>

          {/* Card 2: Hosted Standard (Featured) */}
          <div className="relative p-6 sm:p-7 rounded-3xl bg-gradient-to-b from-[#FF5722]/15 via-white/[0.04] to-white/[0.02] border-2 border-[#FF5722] shadow-xl md:shadow-[0_0_50px_rgba(255,87,34,0.2)] flex flex-col justify-between transform lg:-translate-y-2">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#C2410C] text-white text-[11px] font-bold tracking-wide shadow-md whitespace-nowrap">
              MOST POPULAR
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#FF8A65]">Hosted Standard</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FF5722]/20 text-[#FF8A65] border border-[#FF5722]/30 font-semibold">Managed Cloud</span>
              </div>
              <div className="text-4xl font-extrabold text-white font-mono mb-2">
                {billingCycle === 'yearly' ? '$49' : '$5'}
                <span className="text-xs text-zinc-400 font-sans font-normal ml-1">
                  {billingCycle === 'yearly' ? '/ year' : '/ month'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-6">Zero maintenance cloud for startups, agencies, and tech breakrooms.</p>
              
              <ul className="space-y-3 text-xs text-zinc-200 mb-8">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5722] shrink-0" /> <strong>Up to 5 pools · 50 members</strong></li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5722] shrink-0" /> 50 Gemini AI receipt scans / month</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5722] shrink-0" /> Automated daily cloud backups</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5722] shrink-0" /> Slack channel alerts & webhooks</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF5722] shrink-0" /> Consumption velocity & restock</li>
              </ul>
            </div>

            <button
              onClick={() => onOpenAuthModal('register', { tier: 'standard', billingCycle })}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF5722] to-[#F4511E] hover:from-[#F4511E] hover:to-[#E64A19] text-white font-bold text-xs shadow-lg transition cursor-pointer"
            >
              Get Started with Standard
            </button>
          </div>

          {/* Card 3: Hosted Plus */}
          <div className="p-6 sm:p-7 rounded-3xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Hosted Plus</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300 border border-white/15 font-semibold">Scale</span>
              </div>
              <div className="text-4xl font-extrabold text-white font-mono mb-2">
                {billingCycle === 'yearly' ? '$119' : '$12'}
                <span className="text-xs text-zinc-400 font-sans font-normal ml-1">
                  {billingCycle === 'yearly' ? '/ year' : '/ month'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mb-6">Multi-floor offices, regional hubs, and expanding workspaces.</p>
              
              <ul className="space-y-3 text-xs text-zinc-300 mb-8">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> <strong>Up to 15 pools · 250 members</strong></li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> 250 Gemini AI receipt scans / month</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Multi-admin roles & audit logs</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> CSV spreadsheet accounting exports</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" /> Friday automated balance digests</li>
              </ul>
            </div>

            <button
              onClick={() => onOpenAuthModal('register', { tier: 'plus', billingCycle })}
              className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs transition border border-white/10 cursor-pointer"
            >
              Get Started with Plus
            </button>
          </div>

        </div>

        {/* Enterprise Tier Bar (Underneath, Spanning All 3 Columns) */}
        <div className="mt-6 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/40 via-white/[0.03] to-purple-950/20 border border-purple-500/30 hover:border-purple-500/50 transition flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 shadow-lg md:shadow-[0_0_40px_rgba(168,85,247,0.1)]">
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400">Enterprise</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">Custom</span>
              <span className="text-xl sm:text-2xl font-extrabold text-white font-mono">Custom Quote</span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-2xl">
              Campuses, global networks, and companies needing unlimited capacity, custom compliance, and corporate setup.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-zinc-300 pt-1">
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400 shrink-0" /> <strong>Unlimited pools & members</strong></span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Custom AI receipt scan volume</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400 shrink-0" /> SAML 2.0 / Corporate SSO (Okta, Entra ID)</span>
              <span className="flex items-center gap-2"><Check className="w-4 h-4 text-purple-400 shrink-0" /> Invoiced PO billing (ACH / Net-30)</span>
            </div>
          </div>

          <div className="shrink-0 w-full lg:w-auto">
            <button
              onClick={() => setIsEnterpriseModalOpen(true)}
              className="w-full lg:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs transition shadow-md border border-purple-400/30 cursor-pointer whitespace-nowrap"
            >
              Contact Us
            </button>
          </div>
        </div>

      </section>

      {/* Interactive FAQ Accordion */}
      <section id="faq" className="relative z-10 py-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-white/10">
        
        <div className="text-center mb-14">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#FF5722] mb-3">Questions & Clarity</h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Frequently Asked Questions
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return (
              <div 
                key={index}
                className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] overflow-hidden transition"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : index)}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 font-semibold text-white hover:text-[#FF8A65] transition text-sm sm:text-base"
                >
                  <span className="flex items-center gap-3">
                    <HelpCircle className="w-4 h-4 text-[#FF5722] shrink-0" />
                    <span>{faq.q}</span>
                  </span>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#FF5722]' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 pt-1 text-sm text-zinc-300 leading-relaxed border-t border-white/5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </section>

      {/* Footer */}
      <footer className="relative z-10 py-12 border-t border-white/10 text-xs text-zinc-500 bg-[#090A0D]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <PantryPoolLogo lightModeText iconSize={24} />

          <div className="text-center text-zinc-400">
            © {new Date().getFullYear()} PantryPool Inc. The Communal Breakroom Ledger.
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-zinc-400">
            {onOpenLegal && (
              <>
                <a
                  href="/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenLegal('terms');
                  }}
                  className="hover:text-white transition"
                >
                  Terms of Service
                </a>
                <span>•</span>
                <a
                  href="/terms#refund-and-cancellation-policy"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenLegal('terms');
                  }}
                  className="hover:text-white transition"
                >
                  Refund Policy
                </a>
                <span>•</span>
                <a
                  href="/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenLegal('privacy');
                  }}
                  className="hover:text-white transition"
                >
                  Privacy Policy
                </a>
                <span>•</span>
                <a
                  href="/user-agreement"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenLegal('user-agreement');
                  }}
                  className="hover:text-white transition"
                >
                  User Agreement
                </a>
                <span>•</span>
                <a
                  href="/cookies"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenLegal('cookies');
                  }}
                  className="hover:text-white transition"
                >
                  Cookie Policy
                </a>
              </>
            )}
            {onOpenAffiliates && (
              <>
                <span>•</span>
                <a
                  href="/organize"
                  onClick={(e) => {
                    e.preventDefault();
                    onOpenAffiliates();
                  }}
                  className="hover:text-white transition"
                >
                  Pantry Organizers
                </a>
              </>
            )}
          </div>
        </div>
      </footer>

      <EnterpriseInquiryModal 
        isOpen={isEnterpriseModalOpen} 
        onClose={() => setIsEnterpriseModalOpen(false)} 
      />

    </main>
  );
};
