import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sun, Moon, Download, Upload, ShieldAlert, Sparkles, CheckCircle2, 
  Cloud, HelpCircle, X, Check, Loader2, Info, UserX, Heart, FileText, ChevronRight, AlertTriangle,
  Edit2, User, Share2, Mail, MessageSquare, Send, Code2, LogOut
} from 'lucide-react';
import { AppData, ColorTheme } from '../types';
import { APP_VERSION } from '../lib/version';
import { SUPPORT_EMAIL } from '../config/appConfig';
import { ViadiaWordmark } from './BrandComponents';
import OpenSourceLicensesModal from './OpenSourceLicensesModal';
import { isLifetimePass, isSubscriptionActive, getSubscriptionEndDate, getUserTier, subscribeToTierChange, UserTier } from '../lib/userSubscription';
import { useBackButton } from '../lib/backButtonHandler';
import {
  exportSanitizedAppData,
  validateAndPrepareImport,
  executeImportPlan,
  PreparedImport
} from '../lib/importExportUtils';
import { copyToClipboard } from '../lib/clipboardUtils';
import { shareContent } from '../lib/nativeShareDownload';

interface SettingsModalProps {
  key?: React.Key;
  isOpen: boolean;
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
  isJoinedTrip?: boolean;
  onOpenLifetimePassModal?: () => void;
}

export default function SettingsModal({
  isOpen,
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
  isJoinedTrip = false,
  onOpenLifetimePassModal
}: SettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subStatusVersion, setSubStatusVersion] = useState(0);

  // Subscribe to tier changes so settings reload immediately after payment
  useEffect(() => {
    const unsub = subscribeToTierChange(() => {
      setSubStatusVersion((v) => v + 1);
    });
    return unsub;
  }, []);
  const [importError, setImportError] = useState<string | null>(null);
  const [preparedImport, setPreparedImport] = useState<PreparedImport | null>(null);
  const [isAnalyzingImport, setIsAnalyzingImport] = useState<boolean>(false);
  const [isExecutingImport, setIsExecutingImport] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showLicensesModal, setShowLicensesModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactCategory, setContactCategory] = useState<'support' | 'feature' | 'bug' | 'other'>('support');
  const [contactMessage, setContactMessage] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  // Sub-modals back handlers
  useBackButton('sm-logout-confirm', showLogoutConfirm, () => setShowLogoutConfirm(false), 110);
  useBackButton('sm-delete-confirm', showDeleteConfirm, () => setShowDeleteConfirm(false), 110);
  useBackButton('sm-about-modal', showAboutModal, () => setShowAboutModal(false), 110);
  useBackButton('sm-licenses-modal', showLicensesModal, () => setShowLicensesModal(false), 110);
  useBackButton('sm-terms-modal', showTermsModal, () => setShowTermsModal(false), 110);
  useBackButton('sm-contact-modal', showContactModal, () => setShowContactModal(false), 110);
  useBackButton('sm-prepared-import', preparedImport !== null, () => setPreparedImport(null), 110);
  useBackButton('sm-modal-main', isOpen, onClose, 100);

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactMessage.trim()) return;
    setContactSubmitted(true);
    setTimeout(() => {
      setContactSubmitted(false);
      setShowContactModal(false);
      setContactMessage('');
    }, 2000);
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

  if (!isOpen) return null;

  // Export App Data
  const handleExport = () => {
    exportSanitizedAppData(appData, user);
  };

  // Handle file select, parse, and validate
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

  // Perform the import execution (appending new trips, applying choices)
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

  return createPortal(
    <>
      <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
          <motion.div
            key="settings-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
          />
          <motion.div
            key="settings-modal"
            initial={{ opacity: 0, scale: 0.93, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: 18 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.8 }}
            className="relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 rounded-[32px] max-w-lg w-full space-y-6 shadow-2xl text-left max-h-[90vh] overflow-y-auto"
          >
            {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Title */}
        <div className="space-y-1">
          <h3 className="font-sans text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Settings</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Configure your application appearance, cloud sync, and database backups.</p>
        </div>

        {/* Section 1: Theme Selection */}
        <div className="space-y-3">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Theme / Interface style</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => theme !== 'light' && onToggleTheme()}
              className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                theme === 'light'
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 font-bold ring-1 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Sun className={`h-4.5 w-4.5 ${theme === 'light' ? 'text-indigo-600' : 'text-slate-500'}`} />
                <span className="text-xs">Light Mode</span>
              </div>
              {theme === 'light' && <Check className="h-4 w-4 text-indigo-600" />}
            </button>

            <button
              onClick={() => theme !== 'dark' && onToggleTheme()}
              className={`flex items-center justify-between p-4 rounded-2xl border text-left transition-all ${
                theme === 'dark'
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-400 font-bold ring-1 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Moon className={`h-4.5 w-4.5 ${theme === 'dark' ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span className="text-xs">Dark Mode</span>
              </div>
              {theme === 'dark' && <Check className="h-4 w-4 text-indigo-400" />}
            </button>
          </div>
        </div>

        {/* Section 1b: Accent Highlight Color Selection */}
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/60 text-left">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Accent Highlight Color</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: 'indigo', name: 'Indigo', colorClass: 'bg-[#4f46e5]' },
              { id: 'ocean', name: 'Royal Blue', colorClass: 'bg-[#3661b6]' },
              { id: 'teal', name: 'Teal', colorClass: 'bg-[#4bc0b0]' },
              { id: 'rose', name: 'Rose', colorClass: 'bg-[#e11d48]' },
              { id: 'monalisa', name: 'Monalisa', colorClass: 'bg-[#EA9489]' },
              { id: 'bright-lilac', name: 'Bright Lilac', colorClass: 'bg-[#CB96EC]' },
              { id: 'persian-pink', name: 'Persian Pink', colorClass: 'bg-[#EB8AC9]' }
            ].map((col, cIdx) => {
              const isSelected = colorTheme === col.id;
              return (
                <button
                  type="button"
                  key={`settings-theme-${col.id}-${cIdx}`}
                  onClick={() => onSelectColorTheme(col.id as ColorTheme)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold ring-1 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full ${col.colorClass} shadow-sm mb-1 flex items-center justify-center text-white`}>
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <span className="text-[10px] font-medium">{col.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Account Settings */}
        {!isJoinedTrip && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Account Settings</label>
            
            {user ? (
              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName} className="h-9 w-9 rounded-full border border-slate-200/80 dark:border-slate-800" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-950/60 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-sm">{user.displayName?.[0] || 'U'}</div>
                    )}
                    <div className="text-left">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{user.displayName}</div>
                      {user.email && <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{user.email}</div>}
                    </div>
                  </div>
                  {user.email && (
                    <span className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-[9px] font-bold bg-emerald-55 border border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400">
                      <Cloud className="h-3 w-3" />
                      <span>Synced</span>
                    </span>
                  )}
                </div>

                {/* Display Name Edit inside Account Settings */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
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
                          className="px-3 py-1.5 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-medium transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-400">Display Name: <strong className="text-slate-800 dark:text-slate-200">{user.displayName || 'Travel Explorer'}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditedName(user?.displayName || '');
                          setIsEditingName(true);
                        }}
                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer flex items-center space-x-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    onClick={() => setShowLogoutConfirm(true)}
                    className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-950/60 rounded-xl font-bold transition text-xs flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
                  >
                    <span>Logout</span>
                  </button>

                  {/* Delete Account button */}
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-extrabold transition text-xs flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>Delete Account</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-950/60 p-4 rounded-2xl border border-slate-250 dark:border-slate-800 space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Sync Status: Local Storage Only</span>
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">Play Mode</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                  Your data is stored temporarily in this browser cache. If you clear your history, or wish to edit plans across multiple computers, you can sync immediately to your personal cloud database.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={onLogin}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-md text-xs cursor-pointer"
                  >
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 fill-current">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" className="no-referrer"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" className="no-referrer"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" className="no-referrer"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" className="no-referrer"></path>
                      <path fill="none" d="M0 0h48v48H0z" className="no-referrer"></path>
                    </svg>
                    <span>Connect Google Account</span>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/40 dark:text-rose-400 rounded-xl font-bold transition text-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <UserX className="h-3.5 w-3.5" />
                    <span>Delete Account & Data</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* APP INFORMATION SECTION */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-left">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">App Information</label>
          
          {/* Share App Callout Card */}
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

          <div className="space-y-2 pt-0.5 text-xs">
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
            {onOpenLifetimePassModal && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    onOpenLifetimePassModal();
                  }}
                  className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer font-extrabold inline-flex items-center space-x-1"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  <span>{isSubscriptionActive() ? 'You are a Pro Member' : 'Upgrade to Pro Pass (Remove Ads)'}</span>
                </button>
              </div>
            )}
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

        {/* CONTACT US SECTION */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800/60 text-left">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Contact Us</label>
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

        {/* Section 3: Import/Export Database */}
        {!isJoinedTrip && (
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Database Import & Export</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Export */}
              <button
                onClick={handleExport}
                className="flex items-center justify-center space-x-2 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold transition shadow-sm"
                title="Download backup file"
              >
                <Download className="h-4 w-4" />
                <span>Export Database</span>
              </button>

              {/* Import Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center space-x-2 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-bold transition shadow-sm"
                title="Upload backup file"
              >
                <Upload className="h-4 w-4" />
                <span>Import Database</span>
              </button>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Import Status Messages */}
            {isAnalyzingImport && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border border-indigo-150 dark:border-indigo-900/40 text-[10px] rounded-xl font-bold flex items-center space-x-2 mt-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                <span>Validating backup file & checking permissions...</span>
              </div>
            )}

            {importError && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-950/40 text-[10px] rounded-xl font-medium mt-2">
                ❌ {importError}
              </div>
            )}

            {importSuccess && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-950/40 text-[10px] rounded-xl font-bold flex items-center space-x-1.5 mt-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Database imported and updated successfully!</span>
              </div>
            )}

            {preparedImport && (
              <div className="bg-indigo-50/70 dark:bg-slate-900/90 p-4 rounded-2xl border border-indigo-150 dark:border-indigo-900/60 space-y-3.5 text-left shadow-xs mt-2">
                <div className="flex items-start space-x-2">
                  <Info className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-black text-indigo-900 dark:text-indigo-200">Import Summary</h4>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-normal">
                      Found <strong>{preparedImport.newTrips.length}</strong> new trip(s)
                      {preparedImport.conflictingTrips.length > 0 && (
                        <span> and <strong>{preparedImport.conflictingTrips.length}</strong> trip(s) already in your account</span>
                      )}.
                      Data will be appended to your existing trips.
                    </p>
                  </div>
                </div>

                {/* Conflicting Trips Options */}
                {preparedImport.conflictingTrips.length > 0 && (
                  <div className="space-y-2.5 pt-2 border-t border-indigo-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Existing Trips Prompt
                      </span>
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleSetAllChoices('overwrite')}
                          className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200"
                        >
                          Overwrite All
                        </button>
                        <button
                          onClick={() => handleSetAllChoices('keep')}
                          className="px-2 py-0.5 text-[9px] font-bold rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300"
                        >
                          Keep All
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {preparedImport.conflictingTrips.map((ct, ctIdx) => (
                        <div key={`settings-conflict-${ct.code}-${ctIdx}`} className="p-2 bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                              {ct.title}
                            </span>
                            <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                              {ct.code}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 text-[10px]">
                            <button
                              onClick={() => handleToggleConflictChoice(ct.code, 'overwrite')}
                              className={`flex-1 py-1 px-1.5 rounded-md text-center font-bold transition ${
                                ct.choice === 'overwrite'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                              }`}
                            >
                              Overwrite
                            </button>
                            <button
                              onClick={() => handleToggleConflictChoice(ct.code, 'keep')}
                              className={`flex-1 py-1 px-1.5 rounded-md text-center font-bold transition ${
                                ct.choice === 'keep'
                                  ? 'bg-indigo-600 text-white'
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

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setPreparedImport(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={isExecutingImport}
                    className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmImport}
                    disabled={isExecutingImport}
                    className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-extrabold transition cursor-pointer flex items-center justify-center space-x-1 shadow-xs"
                  >
                    {isExecutingImport ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <span>Confirm & Append</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* FOOTER SVG WORDMARK WITH RED HEART */}
        <div className="flex items-center justify-center space-x-2 pt-6 pb-2 border-t border-slate-200/60 dark:border-slate-800/60 mt-6">
          <Heart className="w-[20px] h-[20px] text-red-500 fill-red-500 shrink-0" />
          <ViadiaWordmark className="h-[20px] w-auto text-slate-800 dark:text-white" />
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>

      {/* ACCOUNT DELETION CONFIRMATION MODAL */}
      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-[28px] sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 max-h-[90vh] overflow-y-auto min-w-0">
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

      {/* ABOUT US MODAL */}
      {showAboutModal && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 relative max-h-[90vh] overflow-y-auto min-w-0">
            <button
              onClick={() => setShowAboutModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
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

      {/* TERMS & PRIVACY POLICY MODAL */}
      {showTermsModal && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 relative max-h-[90vh] overflow-y-auto min-w-0">
            <button
              onClick={() => setShowTermsModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 pr-8">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Terms & Privacy Policy</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">User Rights & Data Integrity</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-3 max-h-64 overflow-y-auto pr-1">
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">1. Data Privacy & Storage</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Your travel itineraries, expense ledgers, and profile configurations are stored securely using cloud database infrastructure. We do not sell your personal information.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">2. Account Control & Deletion</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  You retain full ownership of your data. You may export database backups or delete your account and all corresponding trip records permanently at any time via Account Settings.
                </p>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100">3. Fair Usage</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  viadia is provided for personal, non-commercial travel planning and collaborative group organization.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowTermsModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* CONTACT US MODAL */}
      {showContactModal && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 relative max-h-[90vh] overflow-y-auto min-w-0">
            <button
              onClick={() => setShowContactModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 pr-8">
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
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Message Sent!</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">Thank you for reaching out. We will get back to you shortly.</p>
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
                  <select
                    value={contactCategory}
                    onChange={(e) => setContactCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="support">General Support / Question</option>
                    <option value="feature">Feature Request</option>
                    <option value="bug">Report a Bug</option>
                    <option value="other">Other</option>
                  </select>
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
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Message</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* OPEN SOURCE LICENSES MODAL */}
      <OpenSourceLicensesModal
        isOpen={showLicensesModal}
        onClose={() => setShowLicensesModal(false)}
      />

      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirm && createPortal(
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-center max-h-[90vh] overflow-y-auto min-w-0">
            <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-500 mb-4">
              <LogOut className="h-5 w-5" />
            </div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Confirm Logout</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Are you sure you want to log out of your profile?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
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
    </>,
    document.body
  );
}
