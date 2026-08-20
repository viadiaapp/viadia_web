import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Receipt, 
  ShieldCheck, 
  User, 
  ArrowRight, 
  Moon, 
  Sun, 
  AlertCircle, 
  CheckCircle2, 
  Shirt, 
  Share2, 
  WifiOff, 
  Mail, 
  Send, 
  HelpCircle, 
  Check,
  ChevronDown,
  Users,
  Menu,
  X,
  Smartphone,
  Play,
  Loader2
} from 'lucide-react';
import { ViadiaLogo, ViadiaWordmark } from './BrandComponents';
import heroVideo from '../assets/video/viadia_hero.mp4';
import { onboardingPlanImage, onboardingTrackImage, onboardingListImage } from '../assets/splash';
import { sendInboundMessage } from '../lib/db';

interface WebLandingProps {
  onLoginWithGoogle: () => void;
  onLoginWithApple?: () => void;
  onContinueAsGuest: (name: string) => void;
  onRegisterGoogleName: (name: string) => void;
  onSendMagicLink?: (email: string) => Promise<{ success: boolean; message: string }>;
  isLoggingIn: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  loginError?: string | null;
  googleUserNeedName: boolean;
}

export default function WebLanding({
  onLoginWithGoogle,
  onLoginWithApple,
  onContinueAsGuest,
  onRegisterGoogleName,
  onSendMagicLink,
  isLoggingIn,
  theme,
  onToggleTheme,
  loginError,
  googleUserNeedName,
}: WebLandingProps) {
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [authSubStep, setAuthSubStep] = useState<'methods' | 'magic-link' | 'guest-name' | 'google-name'>('methods');
  const [guestName, setGuestName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSentNotice, setLinkSentNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Video Ref for robust autoplay handling
  const videoRef = useRef<HTMLVideoElement>(null);

  // Mobile navigation drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Section 4 FAQ State
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  // Section 4 Contact Us Form State
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactCategory, setContactCategory] = useState<'support' | 'feature' | 'bug' | 'other'>('support');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSuccess, setContactSuccess] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  useEffect(() => {
    if (googleUserNeedName) {
      setShowSignInModal(true);
      setAuthSubStep('google-name');
    }
  }, [googleUserNeedName]);

  // Video autoplay trigger
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      
      const attemptPlay = () => {
        video.play().catch((err) => {
          console.warn("Video autoplay prevented:", err);
          const handleInteraction = () => {
            if (video) video.play();
          };
          window.addEventListener('click', handleInteraction, { once: true });
          window.addEventListener('touchstart', handleInteraction, { once: true });
        });
      };

      attemptPlay();
      video.addEventListener('loadeddata', attemptPlay);
      return () => {
        video.removeEventListener('loadeddata', attemptPlay);
      };
    }
  }, []);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError('Please enter a display name to continue.');
      return;
    }
    setError(null);
    if (authSubStep === 'guest-name') {
      onContinueAsGuest(guestName.trim());
    } else if (authSubStep === 'google-name') {
      onRegisterGoogleName(guestName.trim());
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setIsSendingLink(true);
    try {
      if (onSendMagicLink) {
        const res = await onSendMagicLink(emailInput.trim());
        setLinkSent(true);
        setLinkSentNotice(res.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send magic sign-in link.');
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      return;
    }
    setIsSubmittingContact(true);
    try {
      const userCode = localStorage.getItem('viadia_user_code') || '';
      await sendInboundMessage({
        name: contactName.trim(),
        email: contactEmail.trim(),
        subject: contactCategory,
        message: contactMessage.trim(),
        userCode,
        uid: '',
        createdAt: new Date().toISOString(),
        IsResolved: false,
        Response: ''
      });
      setContactSuccess(true);
      setTimeout(() => {
        setContactName('');
        setContactEmail('');
        setContactCategory('support');
        setContactMessage('');
        setContactSuccess(false);
      }, 4000);
    } catch (err) {
      console.error('Failed to log inbound message:', err);
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const travelModules = [
    {
      id: 'plan',
      code: 'PLN·01',
      badge: 'Smart Itinerary',
      title: 'Plan every stop',
      subtitle: 'Organize day-by-day timelines, route distances & interactive map pins.',
      icon: Calendar,
      accent: 'indigo',
      accentColor: 'from-indigo-500 to-blue-600',
      barColor: 'bg-indigo-500',
      image: onboardingPlanImage,
      features: [
        'Drag-and-drop daily activities with exact time slots',
        'Interactive maps with live route distance calculations',
        'Attach hotel bookings, flight details, and ticket notes'
      ]
    },
    {
      id: 'track',
      code: 'TRK·02',
      badge: 'Group Expenses',
      title: 'Track every cost',
      subtitle: 'Multi-currency logging, auto exchange rates & split settlements.',
      icon: Receipt,
      accent: 'emerald',
      accentColor: 'from-emerald-500 to-teal-600',
      barColor: 'bg-emerald-500',
      image: onboardingTrackImage,
      features: [
        'Log expenses in foreign currencies (EUR, JPY, USD, etc.)',
        'Automatic base currency conversion with zero math hassle',
        'Minimal-balance splitting for easy group payback'
      ]
    },
    {
      id: 'checklist',
      code: 'PCK·03',
      badge: 'Outfits & Packing',
      title: 'Pack every day',
      subtitle: 'Plan daily outfits with photos & manage master packing progress.',
      icon: Shirt,
      accent: 'amber',
      accentColor: 'from-amber-500 to-orange-600',
      barColor: 'bg-amber-500',
      image: onboardingListImage,
      features: [
        'Organize daily outfits with photo previews & weather tags',
        'Master packing checklists by essentials & electronics',
        '100% offline access to your packing lists anywhere'
      ]
    }
  ];

  const faqs = [
    {
      q: 'Is Viadia completely free to use?',
      a: 'Yes! Viadia offers unlimited trip creation, itinerary planning, expense tracking, outfit packing checklists, and offline sync free of charge.'
    },
    {
      q: 'How does trip sharing work with travel companions?',
      a: 'Every trip generates a unique 6-character Join Pass code. Simply share this code with friends, and they can join instantly to view itineraries and add group expenses.'
    },
    {
      q: 'Does Viadia work without internet or roaming data?',
      a: 'Yes! Viadia is built offline-first. Your itineraries, schedules, and expense entries save locally on your device and automatically sync to the cloud when you reconnect.'
    },
    {
      q: 'How does multi-currency expense tracking work?',
      a: 'You can log expenses in any currency during your travels. Viadia automatically converts them to your base currency and calculates the minimal settlements required between group members.'
    }
  ];

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen font-sans relative overflow-x-hidden transition-colors duration-300 ${
      isDark 
        ? 'bg-[#060913] text-slate-100 selection:bg-indigo-500 selection:text-white' 
        : 'bg-slate-50 text-slate-900 selection:bg-indigo-600 selection:text-white'
    }`}>
      
      {/* Navigation Bar Header (STICKY TOP) */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b transition-colors shadow-sm ${
        isDark 
          ? 'bg-slate-950/85 border-white/10 text-white' 
          : 'bg-white/90 border-slate-200 text-slate-900'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <ViadiaLogo className="w-8 h-8 sm:w-9 sm:h-9 filter drop-shadow-[0_0_12px_rgba(59,130,246,0.4)]" animateRoad={false} />
            <ViadiaWordmark className={`w-20 sm:w-24 h-auto ${isDark ? 'text-white' : 'text-slate-900'}`} />
          </div>

          <nav className="hidden lg:flex items-center space-x-7 xl:space-x-9 text-sm xl:text-base font-bold">
            <a href="#hero" className={`transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-indigo-600'}`}>Home</a>
            <a href="#modules" className={`transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-indigo-600'}`}>Planner & Expenses</a>
            <a href="#features" className={`transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-indigo-600'}`}>Sharing & Offline</a>
            <a href="#faqs" className={`transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-indigo-600'}`}>FAQs</a>
            <a href="#contact" className={`transition-colors ${isDark ? 'text-slate-300 hover:text-white' : 'text-slate-600 hover:text-indigo-600'}`}>Contact</a>
          </nav>

          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={onToggleTheme}
              className={`p-2 sm:p-2.5 rounded-2xl border transition shadow-sm cursor-pointer ${
                isDark 
                  ? 'border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white' 
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Toggle Theme"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              onClick={() => {
                setAuthSubStep('methods');
                setShowSignInModal(true);
              }}
              className="hidden sm:flex px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer items-center space-x-1.5"
            >
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            {/* Mobile / Tablet: hamburger toggle (nav links hidden below lg) */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className={`lg:hidden p-2 sm:p-2.5 rounded-2xl border transition shadow-sm cursor-pointer ${
                isDark 
                  ? 'border-slate-800 bg-slate-900/90 text-slate-300 hover:text-white' 
                  : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile / Tablet Dropdown Nav */}
        <AnimatePresence initial={false}>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="lg:hidden overflow-hidden"
            >
              <div className={`border-t px-4 sm:px-6 py-4 space-y-1 ${
                isDark ? 'border-white/10 bg-slate-950/95' : 'border-slate-200 bg-white'
              }`}>
                {[
                  { href: '#hero', label: 'Home' },
                  { href: '#modules', label: 'Planner & Expenses' },
                  { href: '#features', label: 'Sharing & Offline' },
                  { href: '#faqs', label: 'FAQs' },
                  { href: '#contact', label: 'Contact' },
                ].map((link, lIdx) => (
                  <a
                    key={`nav-link-${link.href}-${lIdx}`}
                    href={link.href}
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMenuOpen(false);
                      // Wait for the dropdown's collapse animation to finish
                      // before scrolling — otherwise the closing menu shifts
                      // the page layout mid-scroll and the jump lands short.
                      window.setTimeout(() => {
                        document.querySelector(link.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 220);
                    }}
                    className={`block px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      isDark ? 'text-slate-300 hover:bg-slate-900 hover:text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-indigo-600'
                    }`}
                  >
                    {link.label}
                  </a>
                ))}
                <button
                  onClick={() => {
                    setAuthSubStep('methods');
                    setShowSignInModal(true);
                    setMobileMenuOpen(false);
                  }}
                  className="sm:hidden w-full mt-2 px-5 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ================= 1ST PAGE: HERO SECTION (VIDEO BACKGROUND + 4 COLORED LINES ONLY) ================= */}
      <section id="hero" className="relative isolate min-h-[calc(100svh-73px)] flex flex-col justify-center items-start px-6 sm:px-12 md:px-16 lg:px-24 py-16 overflow-hidden text-left bg-black scroll-mt-20">
        
        {/* Background Video */}
        <video 
          ref={videoRef}
          autoPlay 
          loop 
          muted 
          playsInline 
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none scale-105"
        >
          <source src="/assets/video/viadia_hero.mp4" type="video/mp4" />
          <source src={heroVideo} type="video/mp4" />
        </video>

        {/* Black Tint Overlay */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[1px] z-10 pointer-events-none" />

        {/* Foreground Content - colored headline on the left, app download badges on the right */}
        <div className="relative z-20 w-full max-w-[1400px] flex flex-col lg:flex-row lg:items-end lg:justify-between gap-10 lg:gap-6">
          
          <div className="max-w-5xl text-left space-y-1 sm:space-y-2">
            <h1 className="text-4xl sm:text-7xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] uppercase select-none">
              <span className="block text-[#3B77B5] drop-shadow-[0_4px_30px_rgba(59,119,181,0.6)]">
                Plan.
              </span>
              <span className="block text-[#4BC0B1] drop-shadow-[0_4px_30px_rgba(75,192,177,0.6)]">
                Track.
              </span>
              <span className="block text-[#7C53E5] drop-shadow-[0_4px_30px_rgba(124,83,229,0.6)]">
                Share.
              </span>
              <span className="block text-white drop-shadow-[0_4px_30px_rgba(255,255,255,0.4)]">
                Every Trip.
              </span>
            </h1>
          </div>

          {/* App Download Badges (Hidden until store links/apps are live) */}
          {/* <div className="flex flex-row sm:flex-row lg:flex-col gap-2 sm:gap-3 shrink-0">
            <a
              href="#"
              className="flex items-center justify-center gap-2 sm:gap-3 min-w-[150px] sm:min-w-[190px] px-3.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all active:scale-95 cursor-pointer"
            >
              <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-white shrink-0" strokeWidth={1.75} />
              <div className="text-left leading-tight">
                <p className="text-[8px] sm:text-[10px] text-white/70 font-semibold uppercase tracking-wider">Download on the</p>
                <p className="text-[11px] sm:text-sm font-extrabold text-white -mt-0.5">App Store</p>
              </div>
            </a>

            <a
              href="#"
              className="flex items-center justify-center gap-2 sm:gap-3 min-w-[150px] sm:min-w-[190px] px-3.5 py-2 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 hover:bg-white/15 hover:border-white/30 transition-all active:scale-95 cursor-pointer"
            >
              <Play className="h-5 w-5 sm:h-6 sm:w-6 text-white fill-white shrink-0" strokeWidth={1.75} />
              <div className="text-left leading-tight">
                <p className="text-[8px] sm:text-[10px] text-white/70 font-semibold uppercase tracking-wider">Get it on</p>
                <p className="text-[11px] sm:text-sm font-extrabold text-white -mt-0.5">Google Play</p>
              </div>
            </a>
          </div> */}

        </div>

      </section>

      {/* ================= 2ND PAGE: TRAVEL MODULES — BOARDING PASS CARDS ================= */}
      <section id="modules" className={`max-w-7xl mx-auto px-6 py-20 sm:py-24 border-t relative z-10 transition-colors scroll-mt-20 ${
        isDark ? 'border-white/10' : 'border-slate-200'
      }`}>
        
        {/* Section Header */}
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-14 sm:mb-16">
          <h2 className={`text-3xl sm:text-5xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            Everything you need for your trip
          </h2>
          <p className={`text-sm sm:text-base ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}>
            Three modules, one boarding pass each — your whole trip, checked in.
          </p>
        </div>

        {/* Boarding Pass Row — always a single horizontal line; scrolls instead of wrapping on any screen size */}
        <div className="-mx-6 px-6 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex flex-nowrap gap-6 lg:gap-8 snap-x snap-mandatory">
          {travelModules.map((mod, idx) => {
            const Icon = mod.icon;
            // Deterministic little "barcode" — bar heights derived from the module id so it stays stable across renders
            const barHeights = [10, 16, 8, 20, 12, 18, 9, 14, 20, 11, 16, 8, 19, 13, 10, 17];
            return (
              <motion.div
                key={`module-card-${mod.id}-${idx}`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: idx * 0.12, ease: 'easeOut' }}
                className={`group relative w-[82vw] sm:w-[380px] lg:w-[400px] shrink-0 snap-start overflow-hidden rounded-3xl border shadow-xl transition-all duration-300 hover:-translate-y-1.5 ${
                  isDark 
                    ? 'bg-slate-900/90 border-slate-800 shadow-black/40' 
                    : 'bg-white border-slate-200 shadow-slate-200/80'
                }`}
              >
                {/* Accent top edge */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${mod.accentColor}`} />

                {/* Photo banner — postcard stub, tinted to the module's accent, code stamped top-right */}
                <div className="relative h-40 sm:h-44 overflow-hidden">
                  <img
                    src={mod.image}
                    alt={mod.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                  />
                  <div className={`absolute inset-0 bg-gradient-to-t ${mod.accentColor} opacity-45 mix-blend-multiply`} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/10" />

                  <div className="absolute top-3.5 left-3.5 right-3.5 flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="font-mono text-[10px] font-black tracking-widest text-white/85 bg-black/25 backdrop-blur-sm px-2 py-1 rounded-lg">
                      {mod.code}
                    </span>
                  </div>

                  <div className="absolute bottom-3.5 left-4 right-4 space-y-0.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/75">
                      {mod.badge}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black leading-tight text-white drop-shadow-sm">
                      {mod.title}
                    </h3>
                  </div>
                </div>

                {/* Main stub: copy + checklist */}
                <div className="p-6 sm:p-7 space-y-5">
                  <p className={`text-xs sm:text-sm leading-relaxed ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}>
                    {mod.subtitle}
                  </p>

                  <div className="space-y-2.5 pt-1">
                    {mod.features.map((feat, i) => (
                      <div key={`mod-feat-${i}`} className={`flex items-start space-x-2.5 text-xs font-medium ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        <div className="p-0.5 rounded-full bg-emerald-500/20 text-emerald-500 shrink-0 mt-0.5">
                          <Check className="h-3 w-3" />
                        </div>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Perforation line with punched notches, like a torn ticket edge */}
                <div className={`relative border-t-2 border-dashed ${isDark ? 'border-slate-700' : 'border-slate-300'}`}>
                  <span className={`absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full ${
                    isDark ? 'bg-[#060913]' : 'bg-slate-50'
                  }`} />
                  <span className={`absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full ${
                    isDark ? 'bg-[#060913]' : 'bg-slate-50'
                  }`} />
                </div>

                {/* Ticket footer stub: barcode + module tag */}
                <div className={`px-6 sm:px-7 py-4 flex items-center justify-between gap-4 ${
                  isDark ? 'bg-slate-950/50' : 'bg-slate-50'
                }`}>
                  <div className="flex items-end space-x-[3px] h-5 shrink-0" aria-hidden="true">
                    {barHeights.map((h, i) => (
                      <span
                        key={`barcode-${i}`}
                        className={`w-[2px] rounded-full ${mod.barColor} ${i % 3 === 0 ? 'opacity-90' : 'opacity-40'}`}
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <span className={`font-mono text-[9px] sm:text-[10px] font-bold tracking-widest text-right ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    VIADIA · {mod.badge.toUpperCase()}
                  </span>
                </div>
              </motion.div>
            );
          })}
          {/* Trailing spacer — trailing padding on a scroll container is often ignored by mobile browsers; a real element guarantees breathing room after the last card */}
          <div className="w-6 shrink-0" aria-hidden="true" />
          </div>
        </div>

      </section>

      {/* ================= 3RD PAGE: APP SHARING & 100% OFFLINE MODE ================= */}
      <section id="features" className={`max-w-7xl mx-auto px-6 py-24 border-t relative z-10 transition-colors scroll-mt-20 ${
        isDark ? 'border-white/10' : 'border-slate-200'
      }`}>
        
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-16">
          <h2 className={`text-3xl sm:text-5xl font-black tracking-tight ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            Share effortlessly & travel offline
          </h2>
          <p className={`text-sm sm:text-base ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}>
            Engineered for seamless group collaboration and uninterrupted access everywhere on earth.
          </p>
        </div>

        <div className="-mx-6 px-6 overflow-x-auto pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex flex-nowrap lg:justify-center gap-6 md:gap-8 snap-x snap-mandatory text-left lg:mx-auto">
          
          {/* Feature 1: App & Trip Sharing */}
          <div className={`w-[82vw] sm:w-[420px] lg:w-[480px] shrink-0 snap-start p-6 sm:p-8 lg:p-10 rounded-3xl border space-y-6 transition-all shadow-xl group ${
            isDark 
              ? 'bg-slate-900/90 border-slate-800 hover:border-teal-500/40 text-white' 
              : 'bg-white border-slate-200 hover:border-teal-500/50 text-slate-900 shadow-slate-200/80'
          }`}>
            <div className="p-4 bg-teal-500/15 text-teal-500 rounded-2xl w-fit group-hover:scale-105 transition-transform">
              <Share2 className="h-8 w-8" />
            </div>

            <div className="space-y-3">
              <h3 className={`text-2xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>App & Trip Sharing</h3>
              <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Invite friends and family to your trip with zero friction. Every journey generates a simple 6-character Join Pass. Travel companions can join instantly to view live itineraries, log shared expenses, and contribute packing items together.
              </p>
            </div>

            <div className={`p-4 rounded-2xl border space-y-3 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-extrabold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Join Pass Code</span>
                <span className="font-mono font-black text-teal-600 text-sm bg-teal-500/10 px-3 py-1 rounded-xl border border-teal-500/30">
                  #VIA-882
                </span>
              </div>
              <div className={`flex items-center space-x-2 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <Users className="h-3.5 w-3.5 text-teal-500" />
                <span>Real-Time Multi-User Collaboration Enabled</span>
              </div>
            </div>
          </div>

          {/* Feature 2: 100% Offline Mode */}
          <div className={`w-[82vw] sm:w-[420px] lg:w-[480px] shrink-0 snap-start p-6 sm:p-8 lg:p-10 rounded-3xl border space-y-6 transition-all shadow-xl group ${
            isDark 
              ? 'bg-slate-900/90 border-slate-800 hover:border-indigo-500/40 text-white' 
              : 'bg-white border-slate-200 hover:border-indigo-500/50 text-slate-900 shadow-slate-200/80'
          }`}>
            <div className="p-4 bg-indigo-500/15 text-indigo-500 rounded-2xl w-fit group-hover:scale-105 transition-transform">
              <WifiOff className="h-8 w-8" />
            </div>

            <div className="space-y-3">
              <h3 className={`text-2xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>100% Offline Mode</h3>
              <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Never lose access to your travel plans due to poor signal or costly international roaming data. Viadia stores all your data locally on your device first. View itineraries, check off packing lists, and log expenses offline — everything automatically backs up to the cloud as soon as you reconnect.
              </p>
            </div>

            <div className={`p-4 rounded-2xl border space-y-3 ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs">
                <span className={`font-extrabold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Storage Architecture</span>
                <span className="font-extrabold text-indigo-600 text-xs bg-indigo-500/10 px-3 py-1 rounded-xl border border-indigo-500/30">
                  Local-First Database
                </span>
              </div>
              <div className={`flex items-center space-x-2 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                <span>Automatic Cloud Backup & Restoration</span>
              </div>
            </div>
          </div>

          <div className="w-6 lg:hidden shrink-0" aria-hidden="true" />
          </div>
        </div>

      </section>

      {/* ================= 4TH PAGE: FAQS ================= */}
      <section id="faqs" className={`max-w-7xl mx-auto px-6 py-20 sm:py-24 border-t relative z-10 transition-colors scroll-mt-20 ${
        isDark ? 'border-white/10' : 'border-slate-200'
      }`}>
        
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-14 sm:mb-16">
          <h2 className={`text-3xl sm:text-5xl font-black tracking-tight flex items-center justify-center gap-3 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <HelpCircle className="h-8 w-8 sm:h-10 sm:w-10 text-indigo-500 shrink-0" />
            <span>Frequently Asked Questions</span>
          </h2>
          <p className={`text-sm sm:text-base ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}>
            Have questions about Viadia? We are here to help you plan your next journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-5xl mx-auto">
          {faqs.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div
                key={`faq-item-${idx}`}
                className={`rounded-2xl border overflow-hidden transition-colors self-start ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <button
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className={`w-full p-5 flex items-center justify-between text-left font-bold text-sm transition cursor-pointer ${
                    isDark 
                      ? 'text-white hover:text-indigo-400' 
                      : 'text-slate-900 hover:text-indigo-600'
                  }`}
                >
                  <span>{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 ml-3 transition-transform ${
                    isOpen ? 'rotate-180 text-indigo-500' : isDark ? 'text-slate-400' : 'text-slate-500'
                  }`} />
                </button>

                {isOpen && (
                  <div className={`px-5 pb-5 text-xs leading-relaxed border-t pt-3 ${
                    isDark 
                      ? 'text-slate-300 border-slate-800/60' 
                      : 'text-slate-600 border-slate-100'
                  }`}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </section>

      {/* ================= 5TH PAGE: CONTACT US ================= */}
      <section id="contact" className={`max-w-7xl mx-auto px-6 py-20 sm:py-24 border-t relative z-10 transition-colors scroll-mt-20 ${
        isDark ? 'border-white/10' : 'border-slate-200'
      }`}>

        <div className="text-center space-y-4 max-w-2xl mx-auto mb-10 sm:mb-12">
          <h2 className={`text-3xl sm:text-5xl font-black tracking-tight flex items-center justify-center gap-3 ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            <Mail className="h-8 w-8 sm:h-10 sm:w-10 text-emerald-500 shrink-0" />
            <span>Get in Touch</span>
          </h2>
          <p className={`text-sm sm:text-base ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}>
            Send us a message or feedback and our team will get back to you promptly.
          </p>
        </div>

        <div className="max-w-xl mx-auto">
          <div className={`p-6 sm:p-8 rounded-3xl border space-y-6 shadow-2xl ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/80'
          }`}>

            {contactSuccess ? (
              <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-xs text-center space-y-2">
                <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-500" />
                <p className="font-extrabold text-sm">Thank You!</p>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>Your message has been sent successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Rivera"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl text-xs font-medium outline-none transition ${
                      isDark 
                        ? 'bg-slate-950 border border-slate-800 text-white focus:border-indigo-500' 
                        : 'bg-slate-100 border border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. alex@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl text-xs font-medium outline-none transition ${
                      isDark 
                        ? 'bg-slate-950 border border-slate-800 text-white focus:border-indigo-500' 
                        : 'bg-slate-100 border border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Topic</label>
                  <select
                    value={contactCategory}
                    onChange={(e) => setContactCategory(e.target.value as any)}
                    className={`w-full px-4 py-3 rounded-2xl text-xs font-medium outline-none transition cursor-pointer ${
                      isDark 
                        ? 'bg-slate-950 border border-slate-800 text-white focus:border-indigo-500' 
                        : 'bg-slate-100 border border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white'
                    }`}
                  >
                    <option value="support" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>General Support / Question</option>
                    <option value="feature" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>Feature Request</option>
                    <option value="bug" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>Report a Bug</option>
                    <option value="other" className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}>Other</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Message</label>
                  <textarea
                    required
                    rows={4}
                    placeholder="How can we help you?"
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl text-xs font-medium outline-none transition resize-none ${
                      isDark 
                        ? 'bg-slate-950 border border-slate-800 text-white focus:border-indigo-500' 
                        : 'bg-slate-100 border border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white'
                    }`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingContact}
                  className="w-full px-5 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-60"
                >
                  {isSubmittingContact ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </form>
            )}

          </div>
        </div>

      </section>

      {/* Footer */}
      <footer className={`border-t py-10 text-xs transition-colors ${
        isDark ? 'border-white/10 bg-slate-950 text-slate-400' : 'border-slate-200 bg-white text-slate-600'
      }`}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center space-x-2">
            <ViadiaLogo className="w-5 h-5 text-indigo-500" animateRoad={false} />
            <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Viadia Travel OS</span>
            <span>© 2026</span>
          </div>

          <div className={`flex items-center space-x-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <a href="#hero" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-indigo-600'}`}>Home</a>
            <a href="#modules" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-indigo-600'}`}>Features</a>
            <a href="#features" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-indigo-600'}`}>Offline & Sharing</a>
            <a href="#faqs" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-indigo-600'}`}>FAQs</a>
            <a href="#contact" className={`transition ${isDark ? 'hover:text-white' : 'hover:text-indigo-600'}`}>Contact</a>
          </div>
        </div>
      </footer>

      {/* ================= SIGN IN MODAL ================= */}
      {showSignInModal && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200 ${
          isDark ? 'bg-slate-950/85 backdrop-blur-md' : 'bg-slate-900/60 backdrop-blur-sm'
        }`}>
          <div className={`rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 text-left relative border ${
            isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            
            {/* Modal Close Button */}
            <button
              onClick={() => {
                setShowSignInModal(false);
                setError(null);
              }}
              className={`absolute top-5 right-5 p-2 rounded-full transition cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
              }`}
            >
              <span className="text-lg font-bold leading-none">×</span>
            </button>

            {/* Modal Header */}
            <div className="text-center space-y-2 pt-2">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-2">
                <ViadiaLogo className="w-8 h-8" animateRoad={false} />
              </div>
              <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Welcome to Viadia</h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Sign in to sync your trips across Web and Mobile devices seamlessly.
              </p>
            </div>

            {/* Error Message */}
            {(loginError || error) && (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{loginError || error}</span>
              </div>
            )}

            {/* SubStep: Methods */}
            {authSubStep === 'methods' && (
              <div className="space-y-3">
                {/* Email Magic Link option */}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setAuthSubStep('magic-link');
                  }}
                  className={`w-full flex items-center justify-center space-x-3 px-4 py-3.5 rounded-2xl font-extrabold text-xs transition shadow-md cursor-pointer ${
                    isDark ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  <Mail className="h-4 w-4 shrink-0" />
                  <span>Sign in with Email Magic Link</span>
                </button>

                <button
                  type="button"
                  onClick={onLoginWithGoogle}
                  disabled={isLoggingIn}
                  className={`w-full flex items-center justify-center space-x-3 px-4 py-3.5 rounded-2xl font-extrabold text-xs transition border cursor-pointer disabled:opacity-50 ${
                    isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-300'
                  }`}
                >
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4 shrink-0">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                  <span>{isLoggingIn ? 'Connecting...' : 'Continue with Google'}</span>
                </button>

                <div className="relative py-2 text-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className={`w-full border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`} />
                  </div>
                  <span className={`relative px-3 text-[10px] font-bold uppercase tracking-wider ${
                    isDark ? 'bg-slate-900 text-slate-500' : 'bg-white text-slate-400'
                  }`}>
                    Or
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setAuthSubStep('guest-name')}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-3.5 rounded-2xl font-bold text-xs transition border cursor-pointer ${
                    isDark ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-800' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  }`}
                >
                  <User className="h-4 w-4 text-slate-400" />
                  <span>Continue as Guest</span>
                </button>
              </div>
            )}

            {/* SubStep: Email Magic Link Input */}
            {authSubStep === 'magic-link' && (
              <div className="space-y-4">
                {!linkSent ? (
                  <form onSubmit={handleSendMagicLink} className="space-y-3">
                    <div>
                      <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                        <input
                          type="email"
                          required
                          autoFocus
                          placeholder="your.email@domain.com"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className={`w-full pl-10 pr-4 py-3 rounded-2xl text-xs font-medium outline-none transition ${
                            isDark 
                              ? 'bg-slate-950 border border-slate-800 text-white focus:border-indigo-500' 
                              : 'bg-slate-100 border border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white'
                          }`}
                        />
                      </div>
                      <p className={`text-[10px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        We'll send a passwordless magic link to your email to sign in instantly.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAuthSubStep('methods')}
                        className={`px-4 py-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
                          isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={isSendingLink}
                        className="flex-1 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        {isSendingLink ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Sending Link...</span>
                          </>
                        ) : (
                          <>
                            <span>Send Magic Link</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                      isDark ? 'bg-indigo-950/40 border-indigo-900/50 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-900'
                    }`}>
                      <p className="font-extrabold text-sm mb-1">Magic Link Sent!</p>
                      <p>{linkSentNotice || `A sign-in magic link has been sent to ${emailInput}. Check your inbox!`}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setLinkSent(false);
                        setAuthSubStep('methods');
                      }}
                      className={`w-full py-3 rounded-2xl font-bold text-xs border transition cursor-pointer ${
                        isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      Back to sign in options
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SubStep: Guest Name Input */}
            {(authSubStep === 'guest-name' || authSubStep === 'google-name') && (
              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div>
                  <label className={`block text-xs font-bold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Rivera"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className={`w-full px-4 py-3 rounded-2xl text-xs font-medium outline-none transition ${
                      isDark 
                        ? 'bg-slate-950 border border-slate-800 text-white focus:border-indigo-500' 
                        : 'bg-slate-100 border border-slate-300 text-slate-900 focus:border-indigo-600 focus:bg-white'
                    }`}
                  />
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthSubStep('methods')}
                    className={`px-4 py-3 rounded-2xl font-bold text-xs transition cursor-pointer ${
                      isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs shadow-md transition cursor-pointer"
                  >
                    Enter App
                  </button>
                </div>
              </form>
            )}

            <div className="text-center pt-2">
              <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                By continuing, you agree to Viadia Terms & Privacy.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
