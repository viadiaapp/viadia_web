import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, Loader2, ArrowRight, ArrowLeft, Moon, Sun, AlertCircle, Globe, Mail, Coins, ChevronRight } from 'lucide-react';
import { ViadiaLogo, ViadiaWordmark, ViadiaPunchline } from './BrandComponents';
import { splashBgImage, onboardingPlanImage, onboardingTrackImage, onboardingShareImage } from '../assets/splash';
import { CurrencyPickerBottomSheet } from './CurrencyPickerBottomSheet';
import { getDefaultCurrency, setUserPreferences } from '../lib/userPreferences';
import { staticCurrenciesSeed } from '../data/staticCurrencies';

interface SplashScreenProps {
  onLoginWithGoogle: () => void;
  onLoginWithApple?: () => void;
  onContinueAsGuest: (name: string, defaultCurrency?: string) => void;
  onRegisterGoogleName: (name: string, defaultCurrency?: string) => void;
  onSendMagicLink?: (email: string) => Promise<{ success: boolean; message: string }>;
  isLoggingIn: boolean;
  isLoggedInUser?: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  loginError?: string | null;
  googleUserNeedName: boolean;
}

type OnboardingPage = 1 | 2 | 3 | 4 | 5;
type AuthSubStep = 'methods' | 'magic-link' | 'guest-name' | 'google-name';

const getCurrencyFlagAndInfo = (code: string) => {
  const match = staticCurrenciesSeed.find(c => c.currencyCode.toUpperCase() === code.toUpperCase());
  return {
    code: code.toUpperCase(),
    name: match?.currencyName || code,
    symbol: match?.currencySymbol || '$',
    flag: match?.flagEmoji || '🌐',
  };
};

export default function SplashScreen({
  onLoginWithGoogle,
  onLoginWithApple,
  onContinueAsGuest,
  onRegisterGoogleName,
  onSendMagicLink,
  isLoggingIn,
  isLoggedInUser = false,
  theme,
  onToggleTheme,
  loginError,
  googleUserNeedName,
}: SplashScreenProps) {
  const [currentPage, setCurrentPage] = useState<OnboardingPage>(1);
  const [authSubStep, setAuthSubStep] = useState<AuthSubStep>('methods');
  const [guestName, setGuestName] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState<string>(() => getDefaultCurrency());
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSentNotice, setLinkSentNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Swipe Gesture State
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        if (currentPage < 5) {
          setCurrentPage((prev) => (prev + 1) as OnboardingPage);
        }
      } else {
        if (currentPage > 1) {
          if (currentPage === 5 && authSubStep !== 'methods') {
            return;
          }
          setCurrentPage((prev) => (prev - 1) as OnboardingPage);
        }
      }
    }
    setTouchStartX(null);
    setTouchStartY(null);
  };

  useEffect(() => {
    if (googleUserNeedName) {
      setCurrentPage(5);
      setAuthSubStep('google-name');
    }
  }, [googleUserNeedName]);

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
      setError(err?.message || 'Failed to send sign-in link.');
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError('Please enter your display name to continue.');
      return;
    }
    setError(null);

    const currencyToSave = (selectedCurrency || 'USD').toUpperCase().trim();
    setUserPreferences({ defaultCurrency: currencyToSave });

    if (authSubStep === 'guest-name') {
      onContinueAsGuest(guestName.trim(), currencyToSave);
    } else if (authSubStep === 'google-name') {
      onRegisterGoogleName(guestName.trim(), currencyToSave);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300 relative overflow-hidden font-sans select-none flex flex-col justify-between"
    >
      {/* Dedicated Top Utility Bar */}
      {currentPage > 1 && (
        <div className="w-full max-w-md mx-auto pt-[max(env(safe-area-inset-top,0px)+0.75rem,2.75rem)] px-6 flex items-center justify-between z-30 shrink-0">
          {currentPage > 2 ? (
            <button
              onClick={() => {
                if (currentPage === 5 && authSubStep !== 'methods') {
                  setAuthSubStep('methods');
                  setError(null);
                } else {
                  setCurrentPage((p) => (p - 1) as OnboardingPage);
                }
              }}
              className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 hover:text-[#3661B6] dark:hover:text-[#3661B6] transition-all shadow-sm backdrop-blur-md cursor-pointer"
              title="Go back"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}

          <div className="flex-1" />

          {/* Theme Switcher Button */}
          <button
            onClick={onToggleTheme}
            className="p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-400 hover:text-[#3661B6] dark:hover:text-[#3661B6] transition-all shadow-sm backdrop-blur-md cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
          </button>
        </div>
      )}

      {/* Main Page Container */}
      <AnimatePresence mode="wait">
        {/* ==================== PAGE 1 ==================== */}
        {currentPage === 1 && (
          <motion.div
            key="page-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => {
              if (!isLoggedInUser) {
                setCurrentPage(2);
              }
            }}
            className={`fixed inset-0 z-50 w-full h-full flex flex-col items-center justify-center overflow-hidden bg-slate-900 ${isLoggedInUser ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <img
              src={splashBgImage}
              alt="Splash Background"
              className="absolute inset-0 w-full h-full object-cover scale-105 transition-transform duration-1000"
              referrerPolicy="no-referrer"
            />

            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="relative z-10 flex flex-col items-center justify-center space-y-4"
            >
              <ViadiaLogo className="w-[100px] h-[100px] filter drop-shadow-2xl" animateRoad={false} />
              <ViadiaWordmark className="w-[100px] h-auto drop-shadow-md" />
              <ViadiaPunchline className="w-[280px] sm:w-[320px] h-auto drop-shadow-md mt-1" />
            </motion.div>

            <div className="absolute bottom-10 left-0 right-0 text-center z-10">
              <span className="text-white/80 text-xs font-bold tracking-widest uppercase animate-pulse drop-shadow-md">
                {isLoggedInUser ? 'Loading your trips' : 'Tap to continue'}
              </span>
            </div>
          </motion.div>
        )}

        {/* ==================== PAGE 2 ==================== */}
        {currentPage === 2 && (
          <motion.div
            key="page-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex-1 w-full max-w-md mx-auto flex flex-col justify-between px-6 pt-2 pb-8 sm:pb-10 z-10"
          >
            <div className="w-full pt-2">
              <div className="w-full aspect-[4/3.5] mx-auto relative rounded-2xl overflow-hidden shadow-sm">
                <img
                  src={onboardingPlanImage}
                  alt="Plan trips your way"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            <div className="text-center my-auto py-5 space-y-2 max-w-sm mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Plan trips
              </h2>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-[#3661B6] dark:text-[#3661B6] tracking-tight">
                your way
              </h3>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium pt-2 leading-relaxed">
                Create itineraries, add places, bookings and notes in one place.
              </p>
            </div>

            <div className="w-full flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentPage(5)}
                className="text-sm font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer px-2 py-1"
              >
                Skip
              </button>

              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-[#3661B6] rounded-full transition-all" />
                <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-800 rounded-full" />
                <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-800 rounded-full" />
              </div>

              <button
                onClick={() => setCurrentPage(3)}
                className="w-12 h-12 rounded-full bg-[#3661B6] hover:bg-[#2C5199] text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ==================== PAGE 3 ==================== */}
        {currentPage === 3 && (
          <motion.div
            key="page-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex-1 w-full max-w-md mx-auto flex flex-col justify-between px-6 pt-2 pb-8 sm:pb-10 z-10"
          >
            <div className="w-full pt-2">
              <div className="w-full aspect-[4/3.5] mx-auto relative rounded-2xl overflow-hidden shadow-sm">
                <img
                  src={onboardingTrackImage}
                  alt="Track everything in real-time"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            <div className="text-center my-auto py-5 space-y-2 max-w-sm mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Track everything
              </h2>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-[#3661B6] dark:text-[#3661B6] tracking-tight">
                in real-time
              </h3>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium pt-2 leading-relaxed">
                Get updates, track expenses and stay on top of your journey.
              </p>
            </div>

            <div className="w-full flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentPage(5)}
                className="text-sm font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer px-2 py-1"
              >
                Skip
              </button>

              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-800 rounded-full" />
                <div className="w-2.5 h-2.5 bg-[#3661B6] rounded-full transition-all" />
                <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-800 rounded-full" />
              </div>

              <button
                onClick={() => setCurrentPage(4)}
                className="w-12 h-12 rounded-full bg-[#3661B6] hover:bg-[#2C5199] text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ==================== PAGE 4 ==================== */}
        {currentPage === 4 && (
          <motion.div
            key="page-4"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex-1 w-full max-w-md mx-auto flex flex-col justify-between px-6 pt-2 pb-8 sm:pb-10 z-10"
          >
            <div className="w-full pt-2">
              <div className="w-full aspect-[4/3.5] mx-auto relative rounded-2xl overflow-hidden shadow-sm">
                <img
                  src={onboardingShareImage}
                  alt="Share your trip with anyone"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            <div className="text-center my-auto py-5 space-y-2 max-w-sm mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Share your trip
              </h2>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-[#3661B6] dark:text-[#3661B6] tracking-tight">
                with anyone
              </h3>
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-medium pt-2 leading-relaxed">
                Invite friends, share live itineraries, and collaborate on trip memories together.
              </p>
            </div>

            <div className="w-full flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentPage(5)}
                className="text-sm font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer px-2 py-1"
              >
                Skip
              </button>

              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-800 rounded-full" />
                <div className="w-2.5 h-2.5 bg-slate-300 dark:bg-slate-800 rounded-full" />
                <div className="w-2.5 h-2.5 bg-[#3661B6] rounded-full transition-all" />
              </div>

              <button
                onClick={() => setCurrentPage(5)}
                className="w-12 h-12 rounded-full bg-[#3661B6] hover:bg-[#2C5199] text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ==================== PAGE 5 ==================== */}
        {currentPage === 5 && (
          <motion.div
            key="page-5"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="flex-1 w-full max-w-md mx-auto flex flex-col justify-center px-6 pb-10 pt-4 z-10"
          >
            <div className="flex flex-col items-center justify-center space-y-3 mb-8">
              <ViadiaLogo className="w-[100px] h-[100px] filter drop-shadow-md" animateRoad={false} />
              <ViadiaWordmark className="w-[100px] h-auto text-[#170C52] dark:text-white drop-shadow-sm" />
            </div>

            <AnimatePresence mode="wait">
              {authSubStep === 'methods' ? (
                <motion.div
                  key="methods-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-6 w-full"
                >
                  <div className="text-center space-y-1.5">
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                      Let's get you started
                    </h2>
                    <p className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                      Sign in or create an account to continue
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <button
                      onClick={() => {
                        setError(null);
                        setAuthSubStep('magic-link');
                      }}
                      className="w-full h-13 bg-[#3661B6] hover:bg-[#2C5199] text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-3 shadow-md hover:shadow-lg transition-all cursor-pointer"
                    >
                      <Mail className="w-5 h-5 shrink-0" />
                      <span>Sign in with Email</span>
                    </button>

                    {isLoggingIn ? (
                      <button
                        disabled
                        className="w-full h-13 bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 border border-slate-200 dark:border-slate-800"
                      >
                        <Loader2 className="w-5 h-5 animate-spin text-[#3661B6]" />
                        <span>Connecting account...</span>
                      </button>
                    ) : (
                      <button
                        onClick={onLoginWithGoogle}
                        className="w-full h-13 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-100 rounded-2xl font-bold text-sm flex items-center justify-center space-x-3 shadow-sm transition-all cursor-pointer"
                      >
                        <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" referrerPolicy="no-referrer"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" referrerPolicy="no-referrer"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" referrerPolicy="no-referrer"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" referrerPolicy="no-referrer"></path>
                            <path fill="none" d="M0 0h48v48H0z" referrerPolicy="no-referrer"></path>
                          </svg>
                        </div>
                        <span>Continue with Google</span>
                      </button>
                    )}

                    <div className="flex items-center space-x-3 py-1">
                      <div className="flex-grow h-[1px] bg-slate-200 dark:bg-slate-800" />
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">or</span>
                      <div className="flex-grow h-[1px] bg-slate-200 dark:bg-slate-800" />
                    </div>

                    <button
                      onClick={() => {
                        setError(null);
                        setAuthSubStep('guest-name');
                      }}
                      className="w-full h-13 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-100 rounded-2xl font-bold text-sm flex items-center justify-center space-x-3 shadow-sm transition-all cursor-pointer"
                    >
                      <User className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      <span>Continue as Guest</span>
                    </button>
                  </div>

                  {loginError && (
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-left space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-start space-x-2 text-xs font-semibold leading-relaxed">
                        <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0 mt-0.5" />
                        <span>{loginError}</span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-6 max-w-xs mx-auto leading-relaxed font-medium">
                    By continuing, you agree to our{' '}
                    <span className="text-[#3661B6] dark:text-[#3661B6] font-semibold cursor-pointer hover:underline">
                      Terms & Privacy Policy
                    </span>
                  </p>
                </motion.div>
              ) : authSubStep === 'magic-link' ? (
                <motion.div
                  key="magic-link-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5 w-full text-left"
                >
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthSubStep('methods');
                        setLinkSent(false);
                        setError(null);
                      }}
                      className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 transition cursor-pointer"
                    >
                      <ArrowLeft className="w-4.5 h-4.5" />
                    </button>
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                        {linkSent ? 'Check Your Email' : 'Sign in with Email'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {linkSent ? `Link sent to ${emailInput}` : 'Enter your email to receive a passwordless sign-in link'}
                      </p>
                    </div>
                  </div>

                  {!linkSent ? (
                    <form onSubmit={handleSendMagicLink} className="space-y-4 pt-1">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Email Address <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-4 h-4 w-4 text-slate-400" />
                          <input
                            type="email"
                            required
                            autoFocus
                            placeholder="your.email@domain.com"
                            value={emailInput}
                            onChange={(e) => {
                              setEmailInput(e.target.value);
                              setError(null);
                            }}
                            className="w-full h-13 pl-11 pr-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-semibold text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#3661B6] transition-all"
                          />
                        </div>
                      </div>

                      {error && (
                        <p className="text-xs text-rose-500 font-semibold px-1">{error}</p>
                      )}

                      <button
                        type="submit"
                        disabled={isSendingLink}
                        className="w-full h-13 bg-[#3661B6] hover:bg-[#2C5199] text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isSendingLink ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Sending Link...</span>
                          </>
                        ) : (
                          <>
                            <span>Send Link</span>
                            <ArrowRight className="w-4.5 h-4.5" />
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-4 pt-1">
                      {linkSentNotice && (
                        <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl text-xs font-semibold leading-relaxed">
                          <p className="font-extrabold text-sm mb-1">Link Sent!</p>
                          <p>{linkSentNotice}</p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setLinkSent(false);
                          setError(null);
                        }}
                        className="w-full h-12 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-2xl font-bold text-xs transition-all cursor-pointer"
                      >
                        Send to a different email
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="name-input-view"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5 w-full text-left"
                >
                  <div className="flex items-center space-x-3">
                    {authSubStep === 'guest-name' && (
                      <button
                        type="button"
                        onClick={() => {
                          setAuthSubStep('methods');
                          setError(null);
                        }}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-850 transition cursor-pointer"
                      >
                        <ArrowLeft className="w-4.5 h-4.5" />
                      </button>
                    )}
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                        {authSubStep === 'google-name' ? 'Complete Profile' : "What's your name?"}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {authSubStep === 'google-name'
                          ? 'Set your display name for cloud sync profile'
                          : 'Enter your display name to start planning trips'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleNameSubmit} className="space-y-4 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Display Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={guestName}
                        onChange={(e) => {
                          setGuestName(e.target.value);
                          setError(null);
                        }}
                        placeholder="e.g. Alex Rivera"
                        className="w-full h-13 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-semibold text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#3661B6] transition-all shadow-inner"
                      />
                    </div>

                    {/* Default Currency Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Default Trip Currency
                      </label>
                      {(() => {
                        const curInfo = getCurrencyFlagAndInfo(selectedCurrency);
                        return (
                          <button
                            type="button"
                            onClick={() => setShowCurrencyModal(true)}
                            className="w-full p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-2xl flex items-center justify-between transition-all cursor-pointer shadow-inner text-left"
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0">
                                {curInfo.flag}
                              </div>
                              <div className="truncate">
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                                    {curInfo.code}
                                  </span>
                                  <span className="text-xs text-slate-400 font-bold">
                                    ({curInfo.symbol})
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                                  {curInfo.name}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 pl-2 shrink-0">
                              <span>Change</span>
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </button>
                        );
                      })()}
                    </div>

                    {error && (
                      <p className="text-xs text-rose-500 font-semibold px-1">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full h-13 bg-[#3661B6] hover:bg-[#2C5199] text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isLoggingIn ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <span>Continue to App</span>
                          <ArrowRight className="w-4.5 h-4.5" />
                        </>
                      )}
                    </button>
                  </form>

                  {/* Currency Picker Modal Bottom Sheet */}
                  <CurrencyPickerBottomSheet
                    isOpen={showCurrencyModal}
                    onClose={() => setShowCurrencyModal(false)}
                    selectedCurrency={selectedCurrency}
                    onSelectCurrency={(code) => setSelectedCurrency(code)}
                    title="Select Preferred Currency"
                    subtitle="Default base currency used when creating new travel plans."
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}