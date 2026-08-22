import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Sun, Moon, Download, Upload, ShieldAlert, Sparkles, CheckCircle2, 
  Cloud, ArrowLeft, Check, LogOut, Briefcase, Receipt, Award, 
  Users, Headphones, Star, Share2, Info, ArrowRight, Settings, Chrome,
  Loader2, UserX, Heart, FileText, ChevronRight, AlertTriangle, X, HelpCircle,
  Edit2, User, Mail, MessageSquare, Send, Code2, CheckSquare, Smartphone, Globe, Coins, ChevronDown
} from 'lucide-react';
import { AppData, ColorTheme, ChecklistItem, Trip, SubscriptionTransaction } from '../types';
import { getFormattedPrice } from '../config/pricingConfig';
import { APP_VERSION } from '../lib/version';
import { SUPPORT_EMAIL } from '../config/appConfig';
import { ViadiaWordmark } from './BrandComponents';
import OpenSourceLicensesModal from './OpenSourceLicensesModal';
import GlobalChecklistModal from './GlobalChecklistModal';
import { CurrencyPickerBottomSheet } from './CurrencyPickerBottomSheet';
import { SelectionBottomSheet, SelectOption } from './SelectionBottomSheet';
import { TermsModal } from './TermsModal';
import { getDefaultCurrency, setUserPreferences, PREF_EVENTS } from '../lib/userPreferences';
import { staticCurrenciesSeed } from '../data/staticCurrencies';
import { getStoredPlatform, setStoredPlatform, TargetPlatform } from '../lib/platform';
import {
  exportSanitizedAppData,
  validateAndPrepareImport,
  executeImportPlan,
  PreparedImport
} from '../lib/importExportUtils';
import { sendInboundMessage, getTransactionsByUserCode } from '../lib/db';
import { copyToClipboard } from '../lib/clipboardUtils';
import { shareContent } from '../lib/nativeShareDownload';
import { 
  isSubscriptionActive, 
  getSubscriptionEndDate, 
  getSubscriptionStartDate, 
  getUserTier as getActiveUserTier,
  subscribeToTierChange,
  UserTier 
} from '../lib/userSubscription';
import { useBackButton } from '../lib/backButtonHandler';

interface GlobalSettingsScreenProps {
  key?: React.Key;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  user: any;
  onLogin: () => void;
  onLogout: () => void;
  onDeleteAccount?: () => Promise<void> | void;
  onUpdateDisplayName?: (newName: string) => Promise<void> | void;
  syncStatus: 'synced' | 'syncing' | 'local' | 'error';
  appData: AppData;
  onImportData: (newData: AppData) => void;
  colorTheme: ColorTheme;
  onSelectColorTheme: (theme: ColorTheme) => void;
  userTier?: UserTier;
  onOpenLifetimePassModal?: () => void;
  onUpdateGlobalChecklist?: (updatedChecklist: ChecklistItem[]) => void;
  onUpdateTrips?: (updatedTrips: { [id: string]: Trip }) => void;
}

const CURRENCY_FLAG_MAP = new Map<string, string>();
const PRIORITY_CURRENCY_FLAGS: { [code: string]: string } = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', INR: '🇮🇳', AUD: '🇦🇺', CAD: '🇨🇦',
  JPY: '🇯🇵', CNY: '🇨🇳', CHF: '🇨🇭', NZD: '🇳🇿', SGD: '🇸🇬', HKD: '🇭🇰',
  SEK: '🇸🇪', KRW: '🇰🇷', NOK: '🇳🇴', MXN: '🇲🇽', BRL: '🇧🇷', ZAR: '🇿🇦',
  AED: '🇦🇪', THB: '🇹🇭',
};

staticCurrenciesSeed.forEach((c) => {
  if (c.currencyCode && c.flagEmoji) {
    const code = c.currencyCode.toUpperCase();
    if (!CURRENCY_FLAG_MAP.has(code)) {
      CURRENCY_FLAG_MAP.set(code, c.flagEmoji);
    }
  }
});

Object.entries(PRIORITY_CURRENCY_FLAGS).forEach(([code, flag]) => {
  CURRENCY_FLAG_MAP.set(code, flag);
});

const getCurrencyFlagAndInfo = (code: string) => {
  const upper = code.toUpperCase();
  const match = staticCurrenciesSeed.find(c => c.currencyCode.toUpperCase() === upper);
  return {
    code: upper,
    name: match?.currencyName || upper,
    symbol: match?.currencySymbol || '$',
    flag: CURRENCY_FLAG_MAP.get(upper) || match?.flagEmoji || '🌐',
  };
};

const CONTACT_TOPIC_OPTIONS: SelectOption[] = [
  { value: 'support', label: 'General Support / Question', icon: '💬' },
  { value: 'feature', label: 'Feature Request / Idea', icon: '💡' },
  { value: 'bug', label: 'Report a Bug / Issue', icon: '🐞' },
  { value: 'other', label: 'Other Inquiries', icon: '📝' },
];

export default function GlobalSettingsScreen({
  onClose,
  theme,
  onToggleTheme,
  user,
  onLogin,
  onLogout,
  onDeleteAccount,
  onUpdateDisplayName,
  syncStatus,
  appData,
  onImportData,
  colorTheme,
  onSelectColorTheme,
  userTier = 'free',
  onOpenLifetimePassModal,
  onUpdateGlobalChecklist,
  onUpdateTrips,
}: GlobalSettingsScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showGlobalChecklistModal, setShowGlobalChecklistModal] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [preparedImport, setPreparedImport] = useState<PreparedImport | null>(null);
  const [isAnalyzingImport, setIsAnalyzingImport] = useState<boolean>(false);
  const [isExecutingImport, setIsExecutingImport] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const isGuest = !user?.email || (Boolean(user?.uid && user.uid.startsWith('guest_'))) || syncStatus === 'local';
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showLicensesModal, setShowLicensesModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactCategory, setContactCategory] = useState<'support' | 'feature' | 'bug' | 'other'>('support');
  const [contactMessage, setContactMessage] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [subUpdateTrigger, setSubUpdateTrigger] = useState(0);
  const [userTransactions, setUserTransactions] = useState<SubscriptionTransaction[]>([]);
  const [showTransactionHistory, setShowTransactionHistory] = useState(false);

  const [isTopicPickerOpen, setIsTopicPickerOpen] = useState(false);

  const userCode = user?.userCode || localStorage.getItem('viadia_user_code') || '';

  useEffect(() => {
    const unsub = subscribeToTierChange(() => {
      setSubUpdateTrigger((v) => v + 1);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (userCode) {
      getTransactionsByUserCode(userCode).then((txns) => {
        setUserTransactions(txns || []);
      }).catch((e) => console.warn('Could not load user transactions:', e));
    }
  }, [userCode, subUpdateTrigger]);

  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(
    () => (localStorage.getItem('temp-unit') as 'C' | 'F') || 'C'
  );
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'miles'>(
    () => (localStorage.getItem('distance-unit') as 'km' | 'miles') || 'km'
  );
  const [defaultCurrency, setDefaultCurrency] = useState<string>(
    () => getDefaultCurrency()
  );
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);

  useEffect(() => {
    const handlePrefChange = () => {
      const storedCur = getDefaultCurrency();
      setDefaultCurrency(storedCur);
      const storedTemp = (localStorage.getItem('temp-unit') as 'C' | 'F') || 'C';
      setTempUnit(storedTemp);
      const storedDist = (localStorage.getItem('distance-unit') as 'km' | 'miles') || 'km';
      setDistanceUnit(storedDist);
    };

    window.addEventListener(PREF_EVENTS.PREFERENCES_CHANGED, handlePrefChange);
    window.addEventListener('storage', handlePrefChange);
    return () => {
      window.removeEventListener(PREF_EVENTS.PREFERENCES_CHANGED, handlePrefChange);
      window.removeEventListener('storage', handlePrefChange);
    };
  }, []);

  useBackButton('gs-logout-confirm', showLogoutConfirm, () => setShowLogoutConfirm(false), 110);
  useBackButton('gs-delete-confirm', showDeleteConfirm, () => setShowDeleteConfirm(false), 110);
  useBackButton('gs-about-modal', showAboutModal, () => setShowAboutModal(false), 110);
  useBackButton('gs-licenses-modal', showLicensesModal, () => setShowLicensesModal(false), 110);
  useBackButton('gs-terms-modal', showTermsModal, () => setShowTermsModal(false), 110);
  useBackButton('gs-contact-modal', showContactModal && !isTopicPickerOpen, () => setShowContactModal(false), 110);
  useBackButton('gs-global-checklist-modal', showGlobalChecklistModal, () => setShowGlobalChecklistModal(false), 110);
  useBackButton('gs-transaction-history', showTransactionHistory, () => setShowTransactionHistory(false), 110);
  useBackButton('gs-prepared-import', preparedImport !== null, () => setPreparedImport(null), 110);

  const handleToggleTempUnit = (unit: 'C' | 'F') => {
    setTempUnit(unit);
    localStorage.setItem('temp-unit', unit);
    setUserPreferences({ temperatureUnit: unit }, userCode);
  };

  const handleToggleDistanceUnit = (unit: 'km' | 'miles') => {
    setDistanceUnit(unit);
    localStorage.setItem('distance-unit', unit);
    setUserPreferences({ distanceUnit: unit }, userCode);
  };

  const handleSelectCurrency = (currencyCode: string) => {
    const code = currencyCode.toUpperCase();
    setDefaultCurrency(code);
    setUserPreferences({ defaultCurrency: code }, userCode);
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactMessage.trim()) return;

    setIsSubmittingContact(true);
    try {
      const userCode = localStorage.getItem('viadia_user_code') || '';
      await sendInboundMessage({
        name: user?.displayName || user?.name || '',
        email: contactEmail.trim() || user?.email || '',
        subject: contactCategory,
        message: contactMessage.trim(),
        userCode,
        uid: user?.uid || '',
        createdAt: new Date().toISOString()
      });

      setContactSubmitted(true);
      setTimeout(() => {
        setContactSubmitted(false);
        setShowContactModal(false);
        setContactMessage('');
      }, 3000);
    } catch (err) {
      console.error('Error submitting contact message:', err);
    } finally {
      setIsSubmittingContact(false);
    }
  };

  const [copiedShareApp, setCopiedShareApp] = useState(false);

  const handleShareApp = async () => {
    const res = await shareContent({
      title: 'viadia - Travel Tracker & Planner',
      text: 'Plan, track, and share your trips seamlessly with viadia!',
      url: window.location.origin,
      dialogTitle: 'Share viadia App'
    });
    if (res.method === 'clipboard' && res.success) {
      setCopiedShareApp(true);
      setTimeout(() => setCopiedShareApp(false), 2500);
    }
  };

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.displayName || '');
  const [isSavingName, setIsSavingName] = useState(false);

  const handleSaveName = async () => {
    if (!editedName.trim()) return;
    setIsSavingName(true);
    try {
      if (onUpdateDisplayName) {
        await onUpdateDisplayName(editedName.trim());
      }
      setIsEditingName(false);
    } catch (e) {
      console.error('Failed to update display name:', e);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleExport = () => {
    exportSanitizedAppData(appData, user);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(false);
    setPreparedImport(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingImport(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const res = await validateAndPrepareImport(parsed, user, appData.trips);
        if (!res.success) {
          setImportError(res.error || 'Failed to prepare import.');
          setPreparedImport(null);
        } else {
          setPreparedImport(res);
        }
      } catch (err: any) {
        setImportError(err.message || 'Failed to parse JSON backup file.');
        setPreparedImport(null);
      } finally {
        setIsAnalyzingImport(false);
      }
    };
    reader.onerror = () => {
      setImportError('Failed to read backup file.');
      setIsAnalyzingImport(false);
    };
    reader.readAsText(file);
  };

  const handleToggleConflictChoice = (code: string, choice: 'overwrite' | 'keep') => {
    if (!preparedImport) return;
    setPreparedImport({
      ...preparedImport,
      conflictingTrips: preparedImport.conflictingTrips.map(ct =>
        ct.code === code ? { ...ct, choice } : ct
      )
    });
  };

  const handleSetAllChoices = (choice: 'overwrite' | 'keep') => {
    if (!preparedImport) return;
    setPreparedImport({
      ...preparedImport,
      conflictingTrips: preparedImport.conflictingTrips.map(ct => ({ ...ct, choice }))
    });
  };

  const confirmImport = async () => {
    if (!preparedImport) return;
    setIsExecutingImport(true);
    try {
      const newAppData = await executeImportPlan(preparedImport, appData, user, null);
      onImportData(newAppData);
      setPreparedImport(null);
      setImportSuccess(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => {
        setImportSuccess(false);
      }, 4000);
    } catch (err: any) {
      console.error('Import execution failed:', err);
      setImportError(err.message || 'Failed to execute import.');
    } finally {
      setIsExecutingImport(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-300 font-sans">
      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 shadow-xs transition-all duration-300 pt-[max(env(safe-area-inset-top,0px),1.75rem)] sm:pt-0">
        <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 h-14 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 duration-150"
            title="Back to Map"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          
          <h2 className="font-sans font-black text-xs uppercase tracking-widest text-slate-950 dark:text-white">
            Profile & Settings
          </h2>

          <div className="w-8 h-8" />
        </div>
      </header>

      {/* SETTINGS CONTENT */}
      <main className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-8 pb-28 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-100 dark:border-slate-800/80 pb-6">
          <div className="flex items-center space-x-4">
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.displayName} 
                className="h-16 w-16 rounded-full border-2 border-white dark:border-slate-800 shadow-md object-cover" 
                referrerPolicy="no-referrer" 
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-500 to-teal-500 text-white flex items-center justify-center font-black text-2xl shadow-md">
                {user?.displayName?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
            
            <div className="text-left flex-1 min-w-0">
              <h3 className="text-lg font-black text-slate-900 dark:text-white truncate leading-tight">
                {user?.displayName || 'Travel Explorer'}
              </h3>
              {user?.email && (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                  {user.email}
                </p>
              )}
            </div>
          </div>
          <div className="text-left md:text-right">
            <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 dark:text-slate-500 block">User Account Focus</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Manage database sync status, backup profiles, and theme preferences.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8 text-left">
            {!isGuest && (() => {
              const subEndDate = getSubscriptionEndDate();
              const subStartDate = getSubscriptionStartDate();
              const isSubActive = isSubscriptionActive(subEndDate);
              const activeTier = userTier && userTier !== 'free' ? userTier : getActiveUserTier();
              const isLifetime = (activeTier === 'lifetime' || (subEndDate?.startsWith('2099') ?? false)) && !['1_year', '2_year', '3_year', '5_year'].includes(activeTier);

              const getTierBadgeText = () => {
                if (isLifetime) return 'PRO Lifetime';
                if (activeTier === '1_year') return 'PRO';
                if (activeTier === '2_year') return 'PRO';
                if (activeTier === '3_year') return 'PRO';
                if (activeTier === '5_year') return 'PRO';
                return 'PRO Active';
              };

              return (
                <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/50">
                    <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                      <Sparkles className="h-5 w-5 text-amber-500" />
                      <span>Membership & Tier</span>
                    </h3>
                    {isSubActive ? (
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-black rounded-lg uppercase tracking-wider font-mono">
                        {getTierBadgeText()}
                      </span>
                    ) : subEndDate ? (
                      <span className="px-2.5 py-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-black rounded-lg uppercase tracking-wider font-mono">
                        Expired (Ads Active)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-black rounded-lg uppercase tracking-wider font-mono">
                        Free Plan (Ads Active)
                      </span>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/60 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {isSubActive ? '✨ 100% Ad-Free Experience Active' : 'Free Tier with Sponsored Ads'}
                      </h4>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      {isSubActive
                        ? (isLifetime
                            ? 'You have lifetime access with zero advertisements across the entire application.'
                            : `You have an active ${getTierBadgeText().replace('PRO ', '')} subscription. All banner ads and sponsored placements are hidden across the entire application.`)
                        : 'Enjoy all of ViaDia\'s travel planning tools for free. Upgrade to a Pro subscription (1, 2, 3, 5 years or lifetime) to remove all ads.'}
                    </p>

                    {subEndDate && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          Subscription End Date:
                        </span>
                        <span className={`font-mono font-bold ${isSubActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                          {isLifetime ? '2099-12-31 (Lifetime)' : subEndDate}
                        </span>
                      </div>
                    )}

                    {subStartDate && (
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Subscription Start Date:</span>
                        <span className="font-mono">{subStartDate}</span>
                      </div>
                    )}
                  </div>

                  {userTransactions.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => setShowTransactionHistory(!showTransactionHistory)}
                        className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 py-1.5 transition cursor-pointer"
                      >
                        <span className="flex items-center space-x-1.5">
                          <Receipt className="h-3.5 w-3.5 text-indigo-500" />
                          <span>Billing & Purchase History ({userTransactions.length})</span>
                        </span>
                        <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                          {showTransactionHistory ? 'Hide' : 'View'}
                        </span>
                      </button>

                      {showTransactionHistory && (
                        <div className="mt-2.5 space-y-2 max-h-52 overflow-y-auto pr-1 text-xs">
                          {userTransactions.map((txn) => (
                            <div
                              key={txn.transactionId || txn.id}
                              className="p-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-200/70 dark:border-slate-800 rounded-xl space-y-1 text-slate-700 dark:text-slate-300"
                            >
                              <div className="flex items-center justify-between font-bold">
                                <span className="text-slate-900 dark:text-white font-sans">{txn.planName}</span>
                                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                                  ${txn.amountPaid.toFixed(2)} {txn.currency}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                                <span>Order: {txn.orderId || txn.transactionId}</span>
                                <span>{txn.paymentMethod === 'google_play' ? 'Google Play' : txn.paymentMethod === 'apple_pay' ? 'Apple Pay' : 'In-App'}</span>
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>Period: {txn.planStartDate} to {txn.planEndDate.startsWith('2099') ? 'Lifetime' : txn.planEndDate}</span>
                                <span className="text-emerald-500 font-bold uppercase">{txn.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {onOpenLifetimePassModal && (
                    <button
                      onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                        onOpenLifetimePassModal();
                      }}
                      className={`w-full py-3 px-4 rounded-xl text-xs font-extrabold transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer ${
                        isSubActive
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                          : 'bg-gradient-to-r from-indigo-600 to-amber-600 hover:from-indigo-700 hover:to-amber-700 text-white shadow-md'
                      }`}
                    >
                      <Sparkles className="h-4 w-4 text-amber-300" />
                      <span>
                        {isSubActive 
                          ? (isLifetime ? 'You are a Lifetime Pro Member' : 'Manage / Upgrade Pro Subscription') 
                          : 'Upgrade to Pro (Ad-Free Plans)'}
                      </span>
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                  <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <span>Global Checklists Manager</span>
                </h3>
                <span className="px-2.5 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-[10px] font-black rounded-lg uppercase tracking-wider font-mono">
                  {appData.globalChecklist?.length || 0} items
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize your master travel checklist and categories. Updates will apply to all upcoming trips while keeping completed trips preserved.
              </p>
              <button
                type="button"
                onClick={() => setShowGlobalChecklistModal(true)}
                className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
              >
                <CheckSquare className="h-4 w-4" />
                <span>Manage Global Checklists</span>
              </button>
            </div>

            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
              <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <Settings className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>App Preferences</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize the theme mode and the highlighted color accents used throughout viadia.
              </p>

              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/30">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Theme Mode</span>
                <button
                  onClick={onToggleTheme}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-extrabold cursor-pointer hover:scale-103 active:scale-97 transition duration-150"
                >
                  {theme === 'light' ? (
                    <>
                      <Sun className="h-3.5 w-3.5 text-amber-500" />
                      <span>Light</span>
                    </>
                  ) : (
                    <>
                      <Moon className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Dark</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-3 py-2 border-b border-slate-100 dark:border-slate-800/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Color Accent</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">{colorTheme}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'indigo', name: 'Indigo', color: 'bg-[#4f46e5]', border: 'border-[#4f46e5]' },
                    { id: 'ocean', name: 'Royal Blue', color: 'bg-[#3661b6]', border: 'border-[#3661b6]' },
                    { id: 'teal', name: 'Teal', color: 'bg-[#4bc0b0]', border: 'border-[#4bc0b0]' },
                    { id: 'rose', name: 'Rose', color: 'bg-[#e11d48]', border: 'border-[#e11d48]' },
                    { id: 'monalisa', name: 'Monalisa', color: 'bg-[#EA9489]', border: 'border-[#EA9489]' },
                    { id: 'bright-lilac', name: 'Bright Lilac', color: 'bg-[#CB96EC]', border: 'border-[#CB96EC]' },
                    { id: 'persian-pink', name: 'Persian Pink', color: 'bg-[#EB8AC9]', border: 'border-[#EB8AC9]' }
                  ].map((c, cIdx) => {
                    const isSelected = colorTheme === c.id;
                    return (
                      <button
                        key={`theme-btn-${c.id}-${cIdx}`}
                        onClick={() => onSelectColorTheme(c.id as ColorTheme)}
                        title={c.name}
                        className={`h-11 rounded-2xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                          isSelected 
                            ? `${c.border} bg-white dark:bg-slate-900 scale-105 shadow-md` 
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full ${c.color} shadow-xs flex items-center justify-center`}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/30">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Temperature Unit</span>
                  <span className="text-[10px] text-slate-400">Used for weather forecasts</span>
                </div>
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => handleToggleTempUnit('C')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer ${
                      tempUnit === 'C'
                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    °C
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleTempUnit('F')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer ${
                      tempUnit === 'F'
                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    °F
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/30">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Distance Unit</span>
                  <span className="text-[10px] text-slate-400">Used for maps and routes</span>
                </div>
                <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => handleToggleDistanceUnit('km')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer ${
                      distanceUnit === 'km'
                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    km
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleDistanceUnit('miles')}
                    className={`px-3 py-1 rounded-full transition cursor-pointer ${
                      distanceUnit === 'miles'
                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    miles
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/30">
                <div>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Default Trip Currency</span>
                  <span className="text-[10px] text-slate-400">Base currency when creating a new trip</span>
                </div>
                {(() => {
                  const curInfo = getCurrencyFlagAndInfo(defaultCurrency);
                  return (
                    <button
                      type="button"
                      onClick={() => setShowCurrencyModal(true)}
                      className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition cursor-pointer"
                    >
                      <span className="text-sm">{curInfo.flag}</span>
                      <span className="text-xs font-mono font-extrabold text-slate-900 dark:text-white">{curInfo.code}</span>
                      <span className="text-[10px] font-bold text-slate-400">({curInfo.symbol})</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  );
                })()}
              </div>

              {(!user || user.email) && (
                <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/30">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Google Sync</span>
                  {user ? (
                    <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-900/45">
                      <Cloud className="h-3 w-3" />
                      <span>Synced</span>
                    </span>
                  ) : (
                    <button 
                      onClick={onLogin}
                      className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Connect account
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
              <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <User className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Account Settings</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage your display name, personal account security, and session settings.
              </p>

              <div className="py-2 space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Display Name</span>
                {isEditingName ? (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') {
                          setIsEditingName(false);
                          setEditedName(user?.displayName || '');
                        }
                      }}
                      className="flex-1 min-w-0 px-3 py-1.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Enter display name"
                      autoFocus
                    />
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleSaveName}
                        disabled={isSavingName}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center space-x-1"
                      >
                        {isSavingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span>Save</span>}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditingName(false);
                          setEditedName(user?.displayName || '');
                        }}
                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {user?.displayName || 'Travel Explorer'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditedName(user?.displayName || '');
                        setIsEditingName(true);
                      }}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center space-x-1"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>Edit Name</span>
                    </button>
                  </div>
                )}
              </div>

              {user && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(true)}
                    className="w-full py-2.5 px-4 border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 hover:bg-rose-50/40 dark:bg-rose-950/10 text-xs font-black text-rose-600 dark:text-rose-400 rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}

              {!isGuest && (
                <div className="p-4 rounded-2xl bg-rose-50/40 dark:bg-rose-950/10 border border-rose-200/80 dark:border-rose-900/40 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">Delete Account</span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                        Permanently delete your user profile and remove all trip-related information, itineraries, packing checklists, and expense ledgers from the database.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="shrink-0 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition shadow-xs cursor-pointer flex items-center space-x-1.5"
                    >
                      <UserX className="h-3.5 w-3.5" />
                      <span>Delete Account</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8 text-left">
            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
              <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <Briefcase className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Data Backup & Overwrite</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                Export your current itineraries, Splitwise ledger divisions, and packing checklists as a portable JSON file, or restore them.
              </p>

              <div className="grid grid-cols-2 gap-3 py-1">
                <button
                  onClick={handleExport}
                  className="flex items-center justify-center space-x-1.5 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Download className="h-4 w-4 text-indigo-500" />
                  <span>Export DB</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center space-x-1.5 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Upload className="h-4 w-4 text-indigo-500" />
                  <span>Import DB</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />

              {isAnalyzingImport && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/40 text-[11px] rounded-xl font-bold flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  <span>Validating backup file & checking permissions...</span>
                </div>
              )}

              {importError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-950/45 text-[11px] rounded-xl font-semibold">
                  ❌ {importError}
                </div>
              )}

              {importSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-950/45 text-[11px] rounded-xl font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Database updated successfully!</span>
                </div>
              )}

              {preparedImport && (
                <div className="bg-indigo-50/70 dark:bg-slate-900/90 p-4 rounded-2xl border border-indigo-150 dark:border-indigo-900/60 space-y-4 text-left shadow-sm">
                  <div className="flex items-start space-x-2">
                    <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-200">Import Summary</h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
                        Found <strong>{preparedImport.newTrips.length}</strong> new trip(s)
                        {preparedImport.conflictingTrips.length > 0 && (
                          <span> and <strong>{preparedImport.conflictingTrips.length}</strong> trip(s) already in your account</span>
                        )}.
                        Data will be appended to your existing trips.
                      </p>
                    </div>
                  </div>

                  {preparedImport.conflictingTrips.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-indigo-100 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                          Existing Trips Prompt
                        </span>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => handleSetAllChoices('overwrite')}
                            className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200"
                          >
                            Overwrite All
                          </button>
                          <button
                            onClick={() => handleSetAllChoices('keep')}
                            className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                          >
                            Keep All
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {preparedImport.conflictingTrips.map((ct, ctIdx) => (
                          <div key={`conflict-trip-${ct.code}-${ctIdx}`} className="p-2.5 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                                {ct.title}
                              </span>
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                                {ct.code}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 text-[11px]">
                              <button
                                onClick={() => handleToggleConflictChoice(ct.code, 'overwrite')}
                                className={`flex-1 py-1 px-2 rounded-lg text-center font-bold transition ${
                                  ct.choice === 'overwrite'
                                    ? 'bg-amber-500 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                Overwrite
                              </button>
                              <button
                                onClick={() => handleToggleConflictChoice(ct.code, 'keep')}
                                className={`flex-1 py-1 px-2 rounded-lg text-center font-bold transition ${
                                  ct.choice === 'keep'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                                }`}
                              >
                                Keep Existing
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={() => {
                        setPreparedImport(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={isExecutingImport}
                      className="flex-1 py-2 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmImport}
                      disabled={isExecutingImport}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm"
                    >
                      {isExecutingImport ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Importing...</span>
                        </>
                      ) : (
                        <span>Confirm & Append Import</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!user && (
              <div className="pt-4">
                <button
                  onClick={onLogin}
                  className="w-full py-3 border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 hover:bg-indigo-50/50 text-xs font-black text-indigo-600 dark:text-indigo-400 rounded-2xl transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Cloud className="h-4 w-4" />
                  <span>Connect Google Profile</span>
                </button>
              </div>
            )}

            <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
              <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>App Information</span>
              </h3>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-blue-50/90 dark:from-indigo-950/40 dark:to-slate-900 border border-indigo-100/90 dark:border-indigo-900/40 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">Share viadia App</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Invite friends and fellow travelers</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleShareApp}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center space-x-1.5 shrink-0"
                >
                  {copiedShareApp ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                  <span>{copiedShareApp ? 'Copied!' : 'Share App'}</span>
                </button>
              </div>

              <div className="space-y-2.5 pt-1 text-xs">
                <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Version Number:</span>
                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400">{APP_VERSION}</span>
                </div>
                <div>
                  <a
                    href="https://viadia.app/about"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowAboutModal(true);
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-bold inline-block"
                  >
                    About Us
                  </a>
                </div>
                <div>
                  <a
                    href="https://viadia.app/licenses"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowLicensesModal(true);
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-bold inline-flex items-center space-x-1"
                  >
                    <Code2 className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Open Source Licenses & Attributions</span>
                  </a>
                </div>
                <div>
                  <a
                    href="https://viadia.app/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowTermsModal(true);
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-bold inline-block"
                  >
                    Terms & Privacy Policy
                  </a>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 dark:border-slate-800/60 space-y-3 text-left">
              <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/50">
                <Mail className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Contact Us</span>
              </h3>

              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Have questions, suggestions, or need assistance with your travel itineraries? We are here to help!
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowContactModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Send Us a Message</span>
                </button>

                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Mail className="h-3.5 w-3.5 text-slate-500" />
                  <span>{SUPPORT_EMAIL}</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center space-x-2 pt-10 pb-4 border-t border-slate-200/60 dark:border-slate-800/60 mt-12">
          <Heart className="w-[20px] h-[20px] text-red-500 fill-red-500 shrink-0" />
          <ViadiaWordmark className="h-[20px] w-auto text-slate-800 dark:text-white" />
        </div>
      </main>

      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-500 mb-4">
              <LogOut className="h-5 w-5" />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Confirm Logout</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to log out of your profile?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition cursor-pointer shadow-xs"
              >
                Logout
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Delete Account & All Data?</h3>
                <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">Irreversible Action</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-rose-50/60 dark:bg-rose-950/20 p-3.5 rounded-2xl border border-rose-100 dark:border-rose-900/30">
              <strong>Warning:</strong> Deleting your account will permanently wipe your profile record from the database and remove all trip itineraries, Splitwise ledgers, packing checklists, and saved locations corresponding to your account. You will be logged off automatically upon completion.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeletingAccount}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsDeletingAccount(true);
                  try {
                    if (onDeleteAccount) {
                      await onDeleteAccount();
                    }
                  } catch (err) {
                    console.error("Account deletion failed:", err);
                  } finally {
                    setIsDeletingAccount(false);
                    setShowDeleteConfirm(false);
                  }
                }}
                disabled={isDeletingAccount}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition cursor-pointer shadow-md flex items-center justify-center space-x-1.5"
              >
                {isDeletingAccount ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete Account</span>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showAboutModal && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 relative">
            <button
              onClick={() => setShowAboutModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">About viadia</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Your Next-Gen Travel Companion</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-2.5 max-h-60 overflow-y-auto pr-1">
              <p>
                <strong>viadia</strong> is an intuitive, modern travel planning suite built to streamline every phase of your journey — from initial destination mapping to active trip execution.
              </p>
              <p>
                Features include interactive global map visualizations, collaborative multi-user itineraries, automated Splitwise currency expense splitting, smart packing checklists, and offline-first database synchronization.
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                Crafted with care to ensure your travel memories remain seamless, secure, and accessible anywhere in the world.
              </p>
            </div>

            <button
              onClick={() => setShowAboutModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}

      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />

      {showContactModal && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 relative">
            <button
              onClick={() => setShowContactModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Contact Us</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">We'd love to hear from you</p>
              </div>
            </div>

            {contactSubmitted ? (
              <div className="py-8 text-center space-y-2">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Message Received!</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your message has been saved to our inbox and our support team has received it. Thank you for reaching out!
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Your Email</label>
                  <input
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Topic</label>
                  <button
                    type="button"
                    onClick={() => setIsTopicPickerOpen(true)}
                    className="w-full flex items-center justify-between text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white font-bold outline-none hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2 truncate">
                      <span>{CONTACT_TOPIC_OPTIONS.find(c => c.value === contactCategory)?.icon}</span>
                      <span>{CONTACT_TOPIC_OPTIONS.find(c => c.value === contactCategory)?.label}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Message</label>
                  <textarea
                    required
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="How can we help you?"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    disabled={isSubmittingContact}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingContact}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
                  >
                    {isSubmittingContact ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Send Message</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      <SelectionBottomSheet
        isOpen={isTopicPickerOpen}
        onClose={() => setIsTopicPickerOpen(false)}
        title="Select Message Topic"
        options={CONTACT_TOPIC_OPTIONS}
        selectedValue={contactCategory}
        onSelect={(val) => setContactCategory(val as any)}
      />

      <OpenSourceLicensesModal
        isOpen={showLicensesModal}
        onClose={() => setShowLicensesModal(false)}
      />

      <GlobalChecklistModal
        isOpen={showGlobalChecklistModal}
        onClose={() => setShowGlobalChecklistModal(false)}
        globalChecklist={appData.globalChecklist || []}
        trips={appData.trips || {}}
        onUpdateGlobalChecklist={(updated) => {
          if (onUpdateGlobalChecklist) {
            onUpdateGlobalChecklist(updated);
          } else {
            onImportData({
              ...appData,
              globalChecklist: updated
            });
          }
        }}
        onUpdateTrips={onUpdateTrips}
      />

      <CurrencyPickerBottomSheet
        isOpen={showCurrencyModal}
        onClose={() => setShowCurrencyModal(false)}
        selectedCurrency={defaultCurrency}
        onSelectCurrency={handleSelectCurrency}
        title="Select Default Currency"
        subtitle="This currency will be preselected when creating any new trip."
      />
    </div>
  );
}