import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, appleSignIn, sendMagicLink, logout, auth, getLoginProvider, isOwnerOfTrip, getAuthErrorMessage } from './lib/auth';
import { 
  getUserDetails, 
  getUserDetailsByEmail, 
  saveUserDetails, 
  generateNextUserCode, 
  getUserConfig, 
  saveUserConfig, 
  getTripFromDB, 
  saveTripToDB, 
  deleteTripFromDB,
  deleteTripGclistStyling,
  getUserTripcodeMaster,
  saveUserTripcodeMaster,
  getTripMaster,
  saveTripMaster,
  deleteTripMaster,
  getTripMastersByOwnerUid,
  getTripsByOwnerUid,
  deleteUserAccountData,
  reactivateAccountIfDeleted
} from './lib/db';
import { AppData, Trip, ChecklistItem, ColorTheme } from './types';
import { getCountryBannerUrl, getFallbackBannerUrl } from './lib/countryBanners';
import { DEFAULT_APP_DATA } from './data/seedData';
import { reconcileTripStatuses } from './lib/tripUtils';
import Navbar from './components/Navbar';
import WorldMap from './components/WorldMap';
import Planner from './components/Planner';
import TripSummary from './components/TripSummary';
import ExpenseTracker from './components/ExpenseTracker';
import TripSettings from './components/TripSettings';
import Checklist from './components/Checklist';
import SettingsModal from './components/SettingsModal';
import GlobalSettingsScreen from './components/GlobalSettingsScreen';
import SplashScreen from './components/SplashScreen';
import WebLanding from './components/WebLanding';
import { getActivePlatform } from './lib/platform';
import { copyToClipboard } from './lib/clipboardUtils';
import { shareContent } from './lib/nativeShareDownload';
import FullScreenTripMapModal from './components/FullScreenTripMapModal';
import AdBanner from './components/AdBanner';
import NotFoundPage from './components/NotFoundPage';
import LifetimePassModal from './components/LifetimePassModal';
import { getUserTier, subscribeToTierChange, setUserSubscription, isSubscriptionActive, getSubscriptionStartDate, getSubscriptionEndDate, UserTier } from './lib/userSubscription';
import { initBackButtonListener, useBackButton } from './lib/backButtonHandler';
import { Compass, ShieldCheck, ShieldAlert, Globe, AlertCircle, Sparkles, RefreshCw, ArrowLeft, Share2, Loader2, Home, Calendar, Users, ArrowRight, Map, CheckSquare, Sun, Moon, Palette, LogOut, Settings, Check, ChevronDown } from 'lucide-react';
import GlobalChecklistModal from './components/GlobalChecklistModal';
import { ViadiaLogo } from './components/BrandComponents';
import { motion, AnimatePresence } from 'motion/react';
import homepageConfig from './config/homepage.json';
import { fallbackPosterImage } from './assets/homepage';
import heroVideoAsset from './assets/video/viadia_hero.mp4';

const ACCENT_COLORS: { id: ColorTheme; name: string; hex: string }[] = [
  { id: 'indigo', name: 'Indigo', hex: '#4f46e5' },
  { id: 'ocean', name: 'Royal Blue', hex: '#3661b6' },
  { id: 'teal', name: 'Teal', hex: '#4bc0b0' },
  { id: 'rose', name: 'Rose', hex: '#e11d48' },
  { id: 'monalisa', name: 'Monalisa', hex: '#EA9489' },
  { id: 'bright-lilac', name: 'Bright Lilac', hex: '#CB96EC' },
  { id: 'persian-pink', name: 'Persian Pink', hex: '#EB8AC9' },
];

function migrateAppData(data: any): AppData {
  if (!data) return DEFAULT_APP_DATA;
  const migrated = { ...data };
  if (!migrated.trips) {
    migrated.trips = {};
  } else if (Array.isArray(migrated.trips)) {
    const dict: { [id: string]: Trip } = {};
    migrated.trips.forEach((t: any) => {
      if (t && t.id) {
        dict[t.id] = t;
      }
    });
    migrated.trips = dict;
  }
  if (!migrated.globalChecklist) {
    migrated.globalChecklist = DEFAULT_APP_DATA.globalChecklist || [];
  }
  return migrated as AppData;
}

function ensureTripsHaveCodes(trips: { [id: string]: Trip }): { updatedTrips: { [id: string]: Trip }; hasChanges: boolean } {
  let hasChanges = false;
  if (!trips) return { updatedTrips: {}, hasChanges };
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const tripsList = Object.values(trips);
  
  const updatedTrips = { ...trips };
  Object.keys(trips).forEach(id => {
    const trip = trips[id];
    if (!trip.code) {
      hasChanges = true;
      let code = '';
      do {
        code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
      } while (tripsList.some(t => t.code === code) || code === 'EUROPE' || code === 'TOKYO8');
      updatedTrips[id] = { ...trip, code };
    }
  });
  
  return { updatedTrips, hasChanges };
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('map');
  const [user, setUser] = useState<any | null>(null);
  const userRef = useRef<any | null>(null);
  const signOutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);
  const [appData, setAppData] = useState<AppData>(DEFAULT_APP_DATA);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'local' | 'error'>('local');
  const [isInitializing, setIsInitializing] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showAccentPicker, setShowAccentPicker] = useState(false);
  const [showQuickGlobalChecklist, setShowQuickGlobalChecklist] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const quickMenuContainerRef = useRef<HTMLDivElement>(null);
  const quickMenuButtonRef = useRef<HTMLButtonElement>(null);
  const quickMenuPanelRef = useRef<HTMLDivElement>(null);
  const [quickMenuPosition, setQuickMenuPosition] = useState<{ top: number; left: number; width?: number } | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => (localStorage.getItem('color-theme') as any) || 'ocean');
  const [userTier, setUserTier] = useState<UserTier>(getUserTier);
  const [showLifetimePassModal, setShowLifetimePassModal] = useState(false);
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0);
  const [appMode, setAppMode] = useState<'splash' | 'google-sync' | 'joined-trip' | 'local'>('splash');

  useEffect(() => {
    const unsub = subscribeToTierChange((newTier) => {
      setUserTier(newTier);
      setSettingsRefreshKey((k) => k + 1);
    });
    return unsub;
  }, []);
  const [isNotFound, setIsNotFound] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const validKnownPaths = ['/', '', '/app', '/index.html'];
      // Accept root paths, hash routes (/#...), search queries (?...)
      if (!validKnownPaths.includes(path) && !path.startsWith('/join/') && !path.startsWith('/trip/')) {
        return true;
      }
    }
    return false;
  });

  const [joinedTripCode, setJoinedTripCode] = useState<string | null>(null);
  const [heroVideoError, setHeroVideoError] = useState(false);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = heroVideoRef.current;
    if (videoEl) {
      videoEl.defaultMuted = true;
      videoEl.muted = true;
      videoEl.play().catch(() => {});
    }
  }, [heroVideoError]);

  // Split-JSON and sequential UserCode states
  const [userCode, setUserCode] = useState<string | null>(null);
  const [googleUserNeedName, setGoogleUserNeedName] = useState(false);
  const [tempGoogleUser, setTempGoogleUser] = useState<User | null>(null);
  const [guestUser, setGuestUser] = useState<{ uid: string; name: string } | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [isTripMapOpen, setIsTripMapOpen] = useState(false);
  const [mapFocusPlaceId, setMapFocusPlaceId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollY(0);
  }, [currentTab, activeTripId]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Close the profile quick menu when clicking outside of it (button or portaled panel)
  useEffect(() => {
    if (!showQuickMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedButton = quickMenuContainerRef.current?.contains(target);
      const clickedPanel = quickMenuPanelRef.current?.contains(target);
      if (!clickedButton && !clickedPanel) {
        setShowQuickMenu(false);
        setShowAccentPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showQuickMenu]);

  // Keep the portaled dropdown anchored under the pill (recompute on open + resize)
  useEffect(() => {
    if (!showQuickMenu) return;
    const updatePosition = () => {
      if (quickMenuButtonRef.current) {
        const rect = quickMenuButtonRef.current.getBoundingClientRect();
        const isMobile = window.innerWidth < 640; // Tailwind's `sm` breakpoint
        setQuickMenuPosition({ top: rect.bottom + 12, left: rect.left, width: isMobile ? rect.width : undefined });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [showQuickMenu]);

  // Close the quick menu immediately on ANY scroll, anywhere on the page.
  // `capture: true` on window catches scroll events from nested scrollable
  // elements too (the main content container, the horizontal trip-card
  // rows, etc.) since 'scroll' doesn't bubble but capture-phase listeners
  // on an ancestor still see it. This is the reliable belt-and-braces fix —
  // the overflow-hidden scroll lock alone isn't airtight (mobile momentum
  // scroll can still slip through), so this closes the menu the instant
  // any scroll is detected instead of trying to prevent scroll perfectly.
  useEffect(() => {
    if (!showQuickMenu) return;
    const closeOnScroll = () => {
      setShowQuickMenu(false);
      setShowAccentPicker(false);
    };
    window.addEventListener('scroll', closeOnScroll, true);
    return () => window.removeEventListener('scroll', closeOnScroll, true);
  }, [showQuickMenu]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-indigo', 'theme-emerald', 'theme-amber', 'theme-rose', 'theme-ocean', 'theme-teal', 'theme-violet', 'theme-midnight', 'theme-monalisa', 'theme-bright-lilac', 'theme-persian-pink');
    root.classList.add(`theme-${colorTheme}`);
    localStorage.setItem('color-theme', colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    // Trigger haptic feedback when tab changes or active trip changes
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (e) {
        // Ignored
      }
    }
  }, [currentTab, activeTripId]);

  const handleToggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const [permissionErrorModal, setPermissionErrorModal] = useState<{
    show: boolean;
    tripTitle: string;
    ownerUid: string;
    ownerEmail?: string;
    ownerName?: string;
  } | null>(null);

  const isTripReadOnly = (trip: Trip | null): boolean => {
    if (!trip) return false;
    if (trip.ownerUid) {
      const isOwner = isOwnerOfTrip(trip, user, userCode);
      if (!isOwner) {
        return !trip.allowOthersToModify;
      }
    }
    return false;
  };

  // Helper to find the default trip: closest upcoming one, or fallback to latest overall
  const getDefaultTripId = (trips: { [id: string]: Trip }) => {
    const tripsList = Object.values(trips);
    if (tripsList.length === 0) return null;
    const nowStr = new Date().toISOString().split('T')[0];
    // upcoming trips are those starting today/future OR are currently active/planned
    const upcoming = tripsList.filter(t => t.status === 'active' || t.status === 'planned' || t.startDate >= nowStr);
    if (upcoming.length > 0) {
      // nearest upcoming first
      return upcoming.sort((a, b) => a.startDate.localeCompare(b.startDate))[0].id;
    }
    // fallback to latest start date overall
    return [...tripsList].sort((a, b) => b.startDate.localeCompare(a.startDate))[0]?.id || null;
  };

  const activeTripIdToUse = activeTripId;
  const handleSetActiveTripId = (id: string | null) => {
    setActiveTripId(id);
    if (id) {
      setCurrentTab('summary');
    } else {
      setCurrentTab('map');
    }
  };

  // Initialize native / Android hardware back button listener
  useEffect(() => {
    const cleanup = initBackButtonListener();
    return cleanup;
  }, []);

  // Top-level modal back handlers (Priority 100)
  useBackButton('app-logout-confirm', showLogoutConfirmModal, () => setShowLogoutConfirmModal(false), 100);
  useBackButton('app-lifetime-pass', showLifetimePassModal, () => setShowLifetimePassModal(false), 100);
  useBackButton('app-quick-global-checklist', showQuickGlobalChecklist, () => setShowQuickGlobalChecklist(false), 100);
  useBackButton('app-settings-modal', showSettingsModal, () => setShowSettingsModal(false), 100);
  useBackButton('app-auth-modal', showAuthModal, () => setShowAuthModal(false), 100);
  useBackButton('app-trip-map-modal', isTripMapOpen, () => setIsTripMapOpen(false), 100);
  useBackButton('app-permission-error', permissionErrorModal !== null, () => setPermissionErrorModal(null), 100);
  useBackButton('app-quick-menu', showQuickMenu, () => { setShowQuickMenu(false); setShowAccentPicker(false); }, 90);
  useBackButton('app-accent-picker', showAccentPicker && !showQuickMenu, () => setShowAccentPicker(false), 90);

  // Global Settings screen back handler (Priority 50) -> returns user to home screen
  useBackButton('app-global-settings', showGlobalSettings, () => setShowGlobalSettings(false), 50);

  // Active Trip screen back handler (Planner, Expense Tracker, Lists, Summary, Settings) (Priority 30) -> returns user to home screen
  useBackButton('app-active-trip', activeTripId !== null && !showGlobalSettings, () => handleSetActiveTripId(null), 30);

  // Helper to load cloud data from split-JSON Firestore structure
  const loadCloudData = async (userCodeToUse: string, localTripsToMerge?: { [id: string]: Trip }) => {
    try {
      setSyncStatus('syncing');
      const currentUid = auth.currentUser?.uid || user?.uid;
      const config = await getUserConfig(userCodeToUse);
      
      // Fetch user tripcode master list (trips created or joined by user)
      const userTripcodes = await getUserTripcodeMaster(userCodeToUse);
      const tripCodeSet = new Set<string>(userTripcodes);

      // ALSO query trip_masters and trips directly by ownerUid if available
      if (currentUid) {
        const ownerMasters = await getTripMastersByOwnerUid(currentUid);
        ownerMasters.forEach(m => {
          if (m.tripCode) tripCodeSet.add(m.tripCode);
        });
        const ownerTrips = await getTripsByOwnerUid(currentUid);
        ownerTrips.forEach(t => {
          const code = t.code || t.id;
          if (code) tripCodeSet.add(code);
        });
      }

      const allTripCodes = Array.from(tripCodeSet);
      const loadedTrips: { [id: string]: Trip } = {};
      let updatedTripcodes = Array.from(new Set([...userTripcodes, ...allTripCodes]));

      if (allTripCodes.length > 0) {
        // Fetch all trips in parallel
        const tripPromises = allTripCodes.map(code => getTripFromDB(code));
        const tripsResult = await Promise.all(tripPromises);
        
        // Fetch trip masters in parallel
        const masterPromises = allTripCodes.map(code => getTripMaster(code));
        const mastersResult = await Promise.all(masterPromises);
        
        tripsResult.forEach((trip, index) => {
          if (trip && (trip.id || trip.code)) {
            const tripId = trip.id || trip.code;
            const master = mastersResult[index];
            if (master) {
              trip.ownerUid = master.ownerUid;
              trip.allowOthersToModify = master.allowOthersToModify;
            } else {
              // Fallback for legacy trips
              trip.ownerUid = trip.ownerUid || currentUid || undefined;
              trip.allowOthersToModify = trip.allowOthersToModify !== undefined ? trip.allowOthersToModify : false;
            }
            loadedTrips[tripId] = trip;
          }
        });
      }

      // Merge any local custom trips that are not on the cloud yet
      if (localTripsToMerge) {
        for (const id of Object.keys(localTripsToMerge)) {
          if (!loadedTrips[id]) {
            const localTrip = { ...localTripsToMerge[id] };
            const ownerUid = currentUid || '';
            localTrip.ownerUid = ownerUid;
            
            const tripCode = localTrip.code || id;
            localTrip.code = tripCode;
            localTrip.id = id;

            // Save to trip_master with default allowOthersToModify as false
            await saveTripMaster(tripCode, ownerUid, false);
            localTrip.allowOthersToModify = false;

            // Append to user_tripcode_master
            if (!updatedTripcodes.includes(tripCode)) {
              updatedTripcodes.push(tripCode);
            }

            // Save the trip
            await saveTripToDB(tripCode, localTrip);
            loadedTrips[id] = localTrip;
          }
        }
      }

      // Save user_tripcode_master if updated
      if (JSON.stringify(userTripcodes) !== JSON.stringify(updatedTripcodes)) {
        await saveUserTripcodeMaster(userCodeToUse, updatedTripcodes);
      }

      // Save user config
      if (!config) {
        await saveUserConfig(userCodeToUse, {
          userCode: userCodeToUse,
          globalChecklist: config?.globalChecklist || DEFAULT_APP_DATA.globalChecklist
        });
      }

      const { updatedTrips: reconciledTrips } = reconcileTripStatuses(loadedTrips);
      setAppData({
        trips: reconciledTrips,
        globalChecklist: config?.globalChecklist || DEFAULT_APP_DATA.globalChecklist
      });
      setSyncStatus('synced');
    } catch (err) {
      console.error('Error loading cloud configuration:', err);
      setSyncStatus('error');
    }
  };

  // Initialize auth state
  useEffect(() => {
    initAuth(
      async (firebaseUser) => {
        // A sign-in event just arrived — if we had a pending debounced
        // "sign out" from a transient auth blip, cancel it.
        if (signOutTimeoutRef.current) {
          clearTimeout(signOutTimeoutRef.current);
          signOutTimeoutRef.current = null;
        }
        if (firebaseUser?.email) {
          setSyncStatus('syncing');
          try {
            let details = await getUserDetails(firebaseUser.uid);
            if (!details && firebaseUser.email) {
              details = await getUserDetailsByEmail(firebaseUser.email);
            }
            if (!details && firebaseUser.email) {
              const reactivated = await reactivateAccountIfDeleted(firebaseUser.email, firebaseUser.uid);
              if (reactivated) {
                details = reactivated;
              }
            }
            if (details && details.userCode) {
              // Sync membership tier accurately
              const rawTier = details.subscription_tier || details.userTier;
              const isLife = rawTier === 'lifetime' || (details.sub_end_date?.startsWith('2099') ?? false);
              const subEnd = isLife ? '2099-12-31' : details.sub_end_date;
              const isSubActive = isLife || isSubscriptionActive(subEnd);
              const resolvedTier: UserTier = isSubActive
                ? (isLife ? 'lifetime' : ((rawTier && rawTier !== 'free' ? rawTier : 'lifetime') as UserTier))
                : 'free';

              setUserSubscription({
                tier: resolvedTier,
                startDate: details.sub_start_date,
                endDate: isLife ? '2099-12-31' : details.sub_end_date,
              });
              setUserTier(resolvedTier);

              // Existing or Reactivated User!
              setUser({
                uid: firebaseUser.uid,
                displayName: details.name || firebaseUser.displayName,
                email: firebaseUser.email,
                photoURL: firebaseUser.photoURL
              });
              setUserCode(details.userCode);
              setGoogleUserNeedName(false);
              setAppMode('google-sync');
              await loadCloudData(details.userCode);
            } else {
              // First time Google user, needs registration form
              setTempGoogleUser(firebaseUser);
              setGoogleUserNeedName(true);
              setAppMode('splash');
              setSyncStatus('local'); // Ensure we are not stuck in 'syncing' mode on the registration form
            }
          } catch (err) {
            console.error('Error checking user profile on init:', err);
            setSyncStatus('error');
          }
        } else {
          setSyncStatus('error');
        }
        setIsInitializing(false);
      },
      () => {
        const runSignedOutFlow = async () => {
          // Check if user previously logged in via Email OTP
          const savedLoginProvider = localStorage.getItem('viadia_login_provider');
          const savedEmailUserStr = localStorage.getItem('viadia_email_user');

          if (savedLoginProvider === 'email-otp' && savedEmailUserStr) {
            try {
              const savedEmailUser = JSON.parse(savedEmailUserStr);
              if (savedEmailUser && savedEmailUser.uid) {
                let details = await getUserDetails(savedEmailUser.uid);
                if (!details && savedEmailUser.email) {
                  details = await getUserDetailsByEmail(savedEmailUser.email);
                }
                let codeToUse = details?.userCode || (savedEmailUser.uid.startsWith('email_') ? savedEmailUser.uid.replace('email_', 'E') : savedEmailUser.uid);
                setUser({
                  uid: savedEmailUser.uid,
                  displayName: details?.name || savedEmailUser.name || savedEmailUser.email.split('@')[0],
                  email: savedEmailUser.email,
                  photoURL: null
                });
                setUserCode(codeToUse);
                setAppMode('google-sync');
                await loadCloudData(codeToUse);
                setIsInitializing(false);
                return;
              }
            } catch (err) {
              console.warn('Failed restoring email OTP session:', err);
            }
          }

        // Not logged in to Google or Email OTP. Check if they have a guest session.
        const savedGuest = localStorage.getItem('nomadsync_guest_user');
        if (savedGuest) {
          try {
            const guest = JSON.parse(savedGuest);
            setGuestUser(guest);
            setUser({
              uid: guest.uid,
              displayName: guest.name,
              email: null,
              photoURL: null
            });
            setAppMode('local');
            setSyncStatus('local');
          } catch (e) {
            console.error('Failed to parse saved guest user', e);
            setAppMode('splash');
            setSyncStatus('local');
          }
        } else {
          setUser(null);
          setUserCode(null);
          setSyncStatus('local');
          setAppMode('splash');
        }

        // Load local/seed appData
        const localSaved = localStorage.getItem('viadia_local_data');
        if (localSaved) {
          try {
            const rawParsed = JSON.parse(localSaved);
            const parsed = migrateAppData(rawParsed);
            if (parsed && parsed.trips) {
              const { updatedTrips, hasChanges } = ensureTripsHaveCodes(parsed.trips);
              const { updatedTrips: statusReconciled, hasChanges: statusChanges } = reconcileTripStatuses(updatedTrips);
              if (hasChanges || statusChanges) {
                parsed.trips = statusReconciled;
                localStorage.setItem('viadia_local_data', JSON.stringify(parsed));
              } else {
                parsed.trips = statusReconciled;
              }
              setAppData(parsed);
            } else {
              setAppData(parsed);
            }
          } catch (e) {
            console.error('Failed to parse local cached state', e);
          }
        }
        setIsInitializing(false);
        };

        if (userRef.current) {
          // We already have an authenticated session running in this app
          // instance. Auth providers can transiently report "signed out"
          // during token refresh, network reconnects, or the tab regaining
          // visibility — treating that as a real sign-out immediately used
          // to flash the whole app to the splash/landing screen (making the
          // "Hi {name}" greeting look like it randomly vanished). Wait
          // briefly instead; a follow-up real sign-in event cancels this.
          if (signOutTimeoutRef.current) clearTimeout(signOutTimeoutRef.current);
          signOutTimeoutRef.current = setTimeout(runSignedOutFlow, 700);
        } else {
          // Nothing signed in yet this session — run immediately so first
          // load isn't artificially delayed.
          runSignedOutFlow();
        }
      }
    );
  }, []);

  // Sign in trigger with Google
  const handleLogin = async () => {
    try {
      setLoginError(null);
      setSyncStatus('syncing');
      const result = await googleSignIn();
      if (result && result.user) {
        const firebaseUser = result.user;
        if (firebaseUser.email) {
          let details = await getUserDetails(firebaseUser.uid);
          if (!details && firebaseUser.email) {
            details = await getUserDetailsByEmail(firebaseUser.email);
          }
          if (!details && firebaseUser.email) {
            const reactivated = await reactivateAccountIfDeleted(firebaseUser.email, firebaseUser.uid);
            if (reactivated) {
              details = reactivated;
            }
          }
          if (details && details.userCode) {
            // Existing or Reactivated Google User!
            setUser({
              uid: firebaseUser.uid,
              displayName: details.name || firebaseUser.displayName,
              email: firebaseUser.email,
              photoURL: firebaseUser.photoURL
            });
            setUserCode(details.userCode);
            setGoogleUserNeedName(false);
            setAppMode('google-sync');
            await loadCloudData(details.userCode, appData.trips);
          } else {
            // First time Google user, needs display name
            setTempGoogleUser(firebaseUser);
            setGoogleUserNeedName(true);
            setAppMode('splash');
            setSyncStatus('local'); // Reset syncStatus so button is not stuck in "Setting up..." on the registration screen
          }
        }
      }
    } catch (err: any) {
      console.error('Sign in failed:', err);
      setSyncStatus('local');
      setLoginError(getAuthErrorMessage(err));
    }
  };

  // Sign in trigger with Apple
  const handleAppleLogin = async () => {
    try {
      setLoginError(null);
      setSyncStatus('syncing');
      const result = await appleSignIn();
      if (result && result.user) {
        const firebaseUser = result.user;
        const userEmail = firebaseUser.email || `${firebaseUser.uid}@privaterelay.appleid.com`;
        let details = await getUserDetails(firebaseUser.uid);
        if (!details && userEmail) {
          details = await getUserDetailsByEmail(userEmail);
        }
        if (!details && userEmail) {
          const reactivated = await reactivateAccountIfDeleted(userEmail, firebaseUser.uid);
          if (reactivated) {
            details = reactivated;
          }
        }
        if (details && details.userCode) {
          // Existing or Reactivated Apple User!
          setUser({
            uid: firebaseUser.uid,
            displayName: details.name || firebaseUser.displayName || 'Apple User',
            email: userEmail,
            photoURL: firebaseUser.photoURL
          });
          setUserCode(details.userCode);
          setGoogleUserNeedName(false);
          setAppMode('google-sync');
          await loadCloudData(details.userCode, appData.trips);
        } else {
          // First time Apple user, needs display name
          setTempGoogleUser({
            ...firebaseUser,
            email: userEmail
          } as any);
          setGoogleUserNeedName(true);
          setAppMode('splash');
          setSyncStatus('local');
        }
      }
    } catch (err: any) {
      console.error('Apple Sign in failed:', err);
      setSyncStatus('local');
      setLoginError(getAuthErrorMessage(err));
    }
  };

  // First time Google User registration callback
  const handleRegisterGoogleName = async (name: string) => {
    if (!tempGoogleUser || !tempGoogleUser.email) return;
    try {
      setSyncStatus('syncing');

      // Check if user was previously in deleted_users table to preserve userCode and license
      let reactivated = await reactivateAccountIfDeleted(tempGoogleUser.email, tempGoogleUser.uid);
      let nextCode = reactivated?.userCode || null;

      if (!nextCode) {
        nextCode = await generateNextUserCode();
        const currentTier = getUserTier();
        const currentEnd = getSubscriptionEndDate();
        const isAdFree = isSubscriptionActive(currentEnd);
        const provider = getLoginProvider();
        const details = {
          uid: tempGoogleUser.uid,
          email: tempGoogleUser.email,
          name,
          userCode: nextCode,
          authProvider: provider,
          adTier: isAdFree,
          userTier: isAdFree ? currentTier : ('free' as const),
          subscription_tier: isAdFree && currentTier !== 'free' ? currentTier : undefined,
          sub_start_date: getSubscriptionStartDate() || undefined,
          sub_end_date: currentEnd || undefined
        };
        await saveUserDetails(tempGoogleUser.uid, details);
      } else {
        // Updated name if provided
        const rawTier = reactivated?.subscription_tier || reactivated?.userTier;
        const isLife = rawTier === 'lifetime' || (reactivated?.sub_end_date?.startsWith('2099') ?? false);
        const subEnd = isLife ? '2099-12-31' : reactivated?.sub_end_date;
        const isSubActive = isLife || isSubscriptionActive(subEnd);
        const resolvedTier: UserTier = isSubActive
          ? (isLife ? 'lifetime' : ((rawTier && rawTier !== 'free' ? rawTier : 'lifetime') as UserTier))
          : 'free';
        const provider = reactivated?.authProvider || getLoginProvider();
        setUserTier(resolvedTier);
        setUserSubscription({
          tier: resolvedTier,
          startDate: reactivated?.sub_start_date,
          endDate: isLife ? '2099-12-31' : reactivated?.sub_end_date
        });
        await saveUserDetails(tempGoogleUser.uid, {
          uid: tempGoogleUser.uid,
          email: tempGoogleUser.email,
          name: name || reactivated?.name || 'Traveler',
          userCode: nextCode,
          authProvider: provider,
          adTier: isSubActive,
          userTier: resolvedTier,
          subscription_tier: (rawTier as any) || resolvedTier,
          sub_start_date: reactivated?.sub_start_date,
          sub_end_date: isLife ? '2099-12-31' : reactivated?.sub_end_date
        });
      }

      const existingConfig = await getUserConfig(nextCode);
      const existingTripcodes = await getUserTripcodeMaster(nextCode);

      const initialConfig = {
        userCode: nextCode,
        globalChecklist: existingConfig?.globalChecklist || DEFAULT_APP_DATA.globalChecklist
      };
      await saveUserConfig(nextCode, initialConfig);
      await saveUserTripcodeMaster(nextCode, existingTripcodes || []);

      setUser({
        uid: tempGoogleUser.uid,
        displayName: name,
        email: tempGoogleUser.email,
        photoURL: tempGoogleUser.photoURL
      });
      setUserCode(nextCode);
      setGoogleUserNeedName(false);
      setTempGoogleUser(null);
      setAppMode('google-sync');
      await loadCloudData(nextCode, appData.trips);
    } catch (err: any) {
      console.error('Failed to register Google name:', err);
      setLoginError(err?.message || 'Failed to complete registration.');
      setSyncStatus('local'); // Reset sync status so the loading state gets cleared and user can correct or retry
    }
  };

  // Guest Continuation callback
  const handleContinueAsGuest = (name: string) => {
    const guestUid = 'guest_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const guestObj = { uid: guestUid, name };
    localStorage.setItem('nomadsync_guest_user', JSON.stringify(guestObj));
    setGuestUser(guestObj);
    setUser({
      uid: guestUid,
      displayName: name,
      email: null,
      photoURL: null
    });
    setAppMode('local');
    setSyncStatus('local');
  };

  // Logout trigger
  const handleLogout = async () => {
    await logout();
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('nomadsync_') || key.startsWith('viadia_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('LocalStorage cleanup error during logout:', e);
    }
    setUser(null);
    setUserCode(null);
    setGuestUser(null);
    setTempGoogleUser(null);
    setGoogleUserNeedName(false);
    setSyncStatus('local');
    setAppMode('splash');
    setJoinedTripCode(null);
    setActiveTripId(null);
    setAppData(DEFAULT_APP_DATA);
    setCurrentTab('map');
  };

  // Delete Account trigger
  const handleDeleteAccount = async () => {
    try {
      const uidToDelete = user?.uid || guestUser?.uid || '';
      if (uidToDelete || userCode) {
        await deleteUserAccountData(uidToDelete, userCode);
      }
    } catch (err) {
      console.error("Failed deleting user account data:", err);
    }

    try {
      localStorage.removeItem('nomadsync_guest_user');
      localStorage.removeItem('viadia_local_data');
      localStorage.removeItem('viadia_user_code');
      localStorage.removeItem('viadia_login_provider');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('nomadsync_') || key.startsWith('viadia_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.warn('LocalStorage cleanup error during account deletion:', e);
    }

    setUser(null);
    setUserCode(null);
    setGuestUser(null);
    setTempGoogleUser(null);
    setGoogleUserNeedName(false);
    setSyncStatus('local');
    setAppMode('splash');
    setJoinedTripCode(null);
    setActiveTripId(null);
    setAppData(DEFAULT_APP_DATA);
    setCurrentTab('map');
  };

  // Modify display name trigger
  const handleUpdateDisplayName = async (newName: string) => {
    if (!user) return;
    const updatedUser = { ...user, displayName: newName };
    setUser(updatedUser);
    if (guestUser) {
      const updatedGuest = { ...guestUser, name: newName };
      localStorage.setItem('nomadsync_guest_user', JSON.stringify(updatedGuest));
      setGuestUser(updatedGuest);
    }
    if (user.uid) {
      await saveUserDetails(user.uid, {
        uid: user.uid,
        email: user.email || null,
        name: newName,
        userCode: userCode || null
      });
    }
  };

  // Join shared trip code trigger
  const handleJoinTrip = async (code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const fetchedTrip = await getTripFromDB(code);
      if (!fetchedTrip) {
        return { success: false, error: 'This is not a valid Trip Code.' };
      }
      fetchedTrip.code = code;

      // Retrieve owner and write permissions from trip_master
      const tripMaster = await getTripMaster(code);
      if (tripMaster) {
        fetchedTrip.ownerUid = tripMaster.ownerUid;
        fetchedTrip.allowOthersToModify = tripMaster.allowOthersToModify;
      }
      
      if (appMode === 'google-sync' && userCode) {
        // Append joined trip code to user_tripcode_master if not present
        const currentTripcodes = await getUserTripcodeMaster(userCode);
        if (!currentTripcodes.includes(code)) {
          await saveUserTripcodeMaster(userCode, [...currentTripcodes, code]);
        }
        await loadCloudData(userCode);
      } else {
        // For guest/local modes
        fetchedTrip.isJoined = true;
        const updatedTrips = { ...appData.trips, [fetchedTrip.id]: fetchedTrip };
        const updatedData = {
          trips: updatedTrips,
          globalChecklist: appData.globalChecklist
        };
        setAppData(updatedData);
        localStorage.setItem('viadia_local_data', JSON.stringify(updatedData));
        setActiveTripId(fetchedTrip.id);
        setJoinedTripCode(code);
      }
      
      setCurrentTab('summary'); // Switch to summary tab
      return { success: true };
    } catch (err) {
      console.error('Error joining trip:', err);
      return { success: false, error: 'Connection failed. Please verify your internet connection.' };
    }
  };

  // Exit joined trip session
  const handleExitJoinedTrip = () => {
    setActiveTripId(null);
    setJoinedTripCode(null);
    setAppMode(guestUser ? 'local' : 'splash');
    
    // Restore from localStorage if any, otherwise fallback to DEFAULT_APP_DATA
    const localSaved = localStorage.getItem('viadia_local_data');
    if (localSaved) {
      try {
        const rawParsed = JSON.parse(localSaved);
        const parsed = migrateAppData(rawParsed);
        if (parsed) {
          setAppData(parsed);
          return;
        }
      } catch (e) {
        console.error('Failed to parse local cached state on exit', e);
      }
    }
    setAppData(DEFAULT_APP_DATA);
  };

  // Save changes helper
  const handleUpdateAppData = async (newData: AppData) => {
    const oldTrips = appData.trips;
    const newTrips = newData.trips;

    // Check if any existing trip was modified without write permission (synchronous check)
    let hasForbiddenModification = false;
    let forbiddenTripTitle = '';
    let forbiddenTripOwner = '';

    for (const id of Object.keys(newTrips)) {
      const oldTrip = oldTrips[id];
      const newTrip = newTrips[id];

      if (oldTrip && JSON.stringify(oldTrip) !== JSON.stringify(newTrip)) {
        if (appMode !== 'local' && oldTrip.ownerUid) {
          const isOwner = isOwnerOfTrip(oldTrip, user, userCode);
          const isAllowed = oldTrip.allowOthersToModify === true;

          if (!isOwner && !isAllowed) {
            hasForbiddenModification = true;
            forbiddenTripTitle = oldTrip.title;
            forbiddenTripOwner = oldTrip.ownerUid;
            break;
          }
        }
      }
    }

    if (hasForbiddenModification) {
      let ownerEmail = '';
      let ownerName = '';
      if (forbiddenTripOwner) {
        if (forbiddenTripOwner.includes('@')) {
          ownerEmail = forbiddenTripOwner;
        } else {
          try {
            const ownerDetails = await getUserDetails(forbiddenTripOwner);
            if (ownerDetails) {
              ownerEmail = ownerDetails.email || '';
              ownerName = ownerDetails.name || '';
            }
          } catch (e) {
            console.warn('Could not resolve owner details for modal:', e);
          }
        }
      }

      setPermissionErrorModal({
        show: true,
        tripTitle: forbiddenTripTitle,
        ownerUid: forbiddenTripOwner,
        ownerEmail,
        ownerName
      });
      const displayOwner = ownerEmail || ownerName || forbiddenTripOwner;
      throw new Error(`Action is unauthorized. Please seek permission from the trip owner (${displayOwner}) to allow modification of this trip.`);
    }

    localStorage.setItem('viadia_local_data', JSON.stringify(newData));

    setAppData(newData);

    if (appMode === 'google-sync' && userCode) {
      setSyncStatus('syncing');
      try {
        const globalChecklistChanged = JSON.stringify(appData.globalChecklist) !== JSON.stringify(newData.globalChecklist);

        // Added/Modified trips
        for (const id of Object.keys(newTrips)) {
          const newTrip = { ...newTrips[id] };
          const oldTrip = oldTrips[id];
          
          if (!oldTrip || JSON.stringify(oldTrip) !== JSON.stringify(newTrip)) {
            let tripCode = newTrip.code || newTrip.id || id;
            if (!tripCode) {
              const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
              tripCode = '';
              for (let i = 0; i < 6; i++) {
                tripCode += chars.charAt(Math.floor(Math.random() * chars.length));
              }
            }
            newTrip.code = tripCode;
            newTrip.id = tripCode;

            const ownerUid = newTrip.ownerUid || oldTrip?.ownerUid || auth.currentUser?.uid || user?.uid || auth.currentUser?.email || user?.email || userCode || '';
            newTrip.ownerUid = ownerUid;

            // Create or update trip_master
            if (!oldTrip) {
              // Brand new trip created: owner is current logged in user. Default allowOthersToModify is false.
              await saveTripMaster(tripCode, ownerUid, false);
              newTrip.allowOthersToModify = false;

              // Append new trip to user_tripcode_master
              const currentTripcodes = await getUserTripcodeMaster(userCode);
              if (!currentTripcodes.includes(tripCode)) {
                const updatedTripcodes = [...currentTripcodes, tripCode];
                await saveUserTripcodeMaster(userCode, updatedTripcodes);
              }
            } else {
              // Existing trip being modified. Check if allowOthersToModify changed
              const hasFlagChanged = newTrip.allowOthersToModify !== oldTrip?.allowOthersToModify;
              if (hasFlagChanged && newTrip.allowOthersToModify !== undefined) {
                const tripMaster = await getTripMaster(tripCode);
                const masterOwnerUid = tripMaster?.ownerUid || ownerUid;
                await saveTripMaster(tripCode, masterOwnerUid, newTrip.allowOthersToModify);
              }
            }

            // Save the trip to the trips table
            await saveTripToDB(tripCode, newTrip);
          }
        }

        // Deleted trips
        for (const id of Object.keys(oldTrips)) {
          if (!newTrips[id]) {
            const deletedTrip = oldTrips[id];
            if (deletedTrip.code) {
              // Remove the tripcode from user_tripcode_master
              const currentTripcodes = await getUserTripcodeMaster(userCode);
              const updatedTripcodes = currentTripcodes.filter(c => c !== deletedTrip.code);
              await saveUserTripcodeMaster(userCode, updatedTripcodes);

              // Delete the trip master entry
              await deleteTripMaster(deletedTrip.code);

              // Delete the trip_gclist_styling entry
              await deleteTripGclistStyling(deletedTrip.code);

              // Delete from the trips table
              await deleteTripFromDB(deletedTrip.code);
            }
          }
        }

        if (globalChecklistChanged) {
          await saveUserConfig(userCode, {
            userCode,
            globalChecklist: newData.globalChecklist
          });
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Error syncing to Firestore:', err);
        setSyncStatus('error');
      }
    } else {
      // Guest / Local mode: sync joined trips to DB if modified, keep locally created trips local
      setSyncStatus('syncing');
      try {
        for (const id of Object.keys(newTrips)) {
          const newTrip = newTrips[id];
          const oldTrip = oldTrips[id];

          const isJoinedTrip = newTrip.isJoined === true || (newTrip.ownerUid && !newTrip.ownerUid.startsWith('guest_') && !isOwnerOfTrip(newTrip, user, userCode));

          if (isJoinedTrip) {
            if (!oldTrip || JSON.stringify(oldTrip) !== JSON.stringify(newTrip)) {
              const tripCode = newTrip.code || newTrip.id || id;
              await saveTripToDB(tripCode, newTrip);
            }
          }
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to sync joined trip(s):', err);
        setSyncStatus('error');
      }
    }
  };

  // Individual callbacks for components
  const handleUpdateTrips = (updatedTrips: { [id: string]: Trip }) => {
    handleUpdateAppData({
      ...appData,
      trips: updatedTrips
    });
  };

  const handleUpdateGlobalChecklist = (updatedChecklist: ChecklistItem[]) => {
    handleUpdateAppData({
      ...appData,
      globalChecklist: updatedChecklist
    });
  };

  // Sync button override trigger
  const handleManualSync = async () => {
    if (appMode === 'google-sync' && userCode) {
      await loadCloudData(userCode);
    } else {
      setShowAuthModal(true);
    }
  };

  const [sharingTripId, setSharingTripId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const handleShareTrip = async () => {
    const activeTrip = activeTripIdToUse ? appData.trips[activeTripIdToUse] : null;
    if (!activeTrip) return;
    
    setSharingTripId(activeTrip.id);
    let codeToShare = activeTrip.code || (activeTrip.id === activeTripIdToUse ? joinedTripCode : null);
    
    try {
      if (!codeToShare) {
        // Register the trip on the server to get a real 6-char trip code
        try {
          const response = await fetch('/api/trips', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-User-Id': user?.uid || ''
            },
            body: JSON.stringify({ trip: activeTrip, code: activeTrip.code })
          });
          
          if (response.ok) {
            const data = await response.json();
            codeToShare = data.code;
            setJoinedTripCode(data.code);
            
            // Save the newly generated code back to this trip in local state
            const updatedTrips = { ...appData.trips };
            if (updatedTrips[activeTrip.id]) {
              updatedTrips[activeTrip.id] = { ...updatedTrips[activeTrip.id], code: data.code };
            }
            handleUpdateTrips(updatedTrips);
          } else {
            // Fallback: generate a local 6-char code
            codeToShare = activeTrip.id.substring(0, 6).toUpperCase();
          }
        } catch (fetchErr) {
          console.warn('Network failed to contact viadia server, using offline code fallback:', fetchErr);
          codeToShare = activeTrip.id.substring(0, 6).toUpperCase();
        }
      } else {
        // If we already have a code, let's register/update it on the server anyway to make sure others can join it
        try {
          await fetch('/api/trips', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-User-Id': user?.uid || ''
            },
            body: JSON.stringify({ trip: activeTrip, code: codeToShare })
          });
        } catch (fetchErr) {
          console.warn('Network failed to register existing code on server:', fetchErr);
        }
      }
      
      const tripName = activeTrip.title || (activeTrip as any).destination || 'My Trip';
      const message = `✈️ Join me on ViaDia for the trip "${tripName}"!\n\nUse trip code: ${codeToShare}\n\nOpen ViaDia, tap "Join a Shared Trip", and enter code ${codeToShare} to view and plan our itinerary, checklist, and expenses together. \n\nwww.viadia.in`;

      const shareResult = await shareContent({
        title: 'ViaDia Trip Invitation',
        text: message,
        url: window.location.origin,
        dialogTitle: `Share "${tripName}" Trip Code`
      });

      if (shareResult.method === 'clipboard' && shareResult.success) {
        setShareToast(`Invitation message copied! Share code "${codeToShare}" with your friends.`);
        setTimeout(() => setShareToast(null), 4000);
      }
    } catch (err: any) {
      const isCancel = err && (
        err.name === 'AbortError' || 
        err.message?.toLowerCase().includes('cancel') ||
        err.message?.toLowerCase().includes('abort')
      );
      if (!isCancel) {
        console.error('Error sharing trip:', err);
      } else {
        console.log('Share invitation dismissed by user');
      }
    } finally {
      setSharingTripId(null);
    }
  };

  if (isNotFound) {
    return (
      <NotFoundPage
        onGoHome={() => {
          setIsNotFound(false);
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/');
          }
        }}
        theme={theme}
      />
    );
  }

  if (isInitializing) {
    const targetPlatform = getActivePlatform();
    if (targetPlatform !== 'web') {
      return (
        <SplashScreen
          onLoginWithGoogle={handleLogin}
          onLoginWithApple={handleAppleLogin}
          onSendMagicLink={sendMagicLink}
          onContinueAsGuest={handleContinueAsGuest}
          onRegisterGoogleName={handleRegisterGoogleName}
          isLoggingIn={true}
          isLoggedInUser={true}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          loginError={null}
          googleUserNeedName={false}
        />
      );
    }
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center text-slate-800 dark:text-slate-200">
        <div className="mb-4 relative">
          <ViadiaLogo className="h-16 w-16" animateRoad={true} />
          <div className="absolute inset-0 bg-[#4F46E5]/10 rounded-full blur-md -z-10 animate-pulse" />
        </div>
        <p className="font-sans font-bold text-sm tracking-wide text-slate-500 dark:text-slate-400">Loading viadia...</p>
      </div>
    );
  }

  if (appMode === 'splash') {
    const targetPlatform = getActivePlatform();
    if (targetPlatform === 'web') {
      return (
        <WebLanding
          onLoginWithGoogle={handleLogin}
          onLoginWithApple={handleAppleLogin}
          onSendMagicLink={sendMagicLink}
          onContinueAsGuest={handleContinueAsGuest}
          onRegisterGoogleName={handleRegisterGoogleName}
          isLoggingIn={syncStatus === 'syncing'}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          loginError={loginError}
          googleUserNeedName={googleUserNeedName}
        />
      );
    }

    return (
      <SplashScreen
        onLoginWithGoogle={handleLogin}
        onLoginWithApple={handleAppleLogin}
        onSendMagicLink={sendMagicLink}
        onContinueAsGuest={handleContinueAsGuest}
        onRegisterGoogleName={handleRegisterGoogleName}
        isLoggingIn={syncStatus === 'syncing'}
        isLoggedInUser={Boolean(user && syncStatus === 'syncing')}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        loginError={loginError}
        googleUserNeedName={googleUserNeedName}
      />
    );
  }



  const getVisibleTrips = (): { [id: string]: Trip } => {
    if (appMode === 'joined-trip' && joinedTripCode) {
      const tripsArray = Object.values(appData.trips) as Trip[];
      const joinedTrip = tripsArray.find(t => t.code === joinedTripCode);
      if (joinedTrip) {
        return { [joinedTrip.id]: joinedTrip };
      }
    }
    return appData.trips;
  };

  const visibleTrips = getVisibleTrips();
  const activeTrip = activeTripIdToUse ? visibleTrips[activeTripIdToUse] : null;

  const safeTopPadding = windowWidth < 640 ? 32 : 0;
  const headerExpandedHeight = windowWidth >= 768 ? 228 : (windowWidth >= 640 ? 200 : 190);
  const collapsedHeaderHeight = windowWidth >= 640 ? 58 : 84;
  const maxScrollHeight = headerExpandedHeight - collapsedHeaderHeight;
  const progress = maxScrollHeight > 0 ? Math.min(1, Math.max(0, scrollY / maxScrollHeight)) : 1;

  // Cropped header height and constant 12px curve radius
  const currentHeaderHeight = Math.max(collapsedHeaderHeight, headerExpandedHeight - scrollY);
  const curveRadius = 12;

  // Dynamically position the title and date subtitle below camera cutout
  const expandedTitleTop = windowWidth >= 768 ? 82 : (windowWidth >= 640 ? 76 : 82);
  const expandedDateTop = expandedTitleTop + 36;

  // When progress = 1 (collapsed), aligns with the back button below camera cutout
  const collapsedTitleTop = windowWidth >= 640 ? 11 : 40;
  const currentTitleTop = expandedTitleTop - (expandedTitleTop - collapsedTitleTop) * progress;

  // Calculate maximum visual width dynamically to allow the title to grow as long as possible before truncating with three dots
  const containerWidth = Math.min(windowWidth, 1280);
  const titleMargin = windowWidth >= 1024 ? 32 : (windowWidth >= 640 ? 24 : 16);
  const expandedMaxW = containerWidth - titleMargin * 2;
  const collapsedMaxW = containerWidth - titleMargin * 2 - 92;
  const currentMaxW = expandedMaxW - (expandedMaxW - collapsedMaxW) * progress;
  const titleScale = 1 - progress * 0.22;
  const titleMaxWidth = currentMaxW / titleScale;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 selection:bg-indigo-500/20 font-sans transition-colors duration-300 ${activeTripIdToUse ? 'h-screen overflow-hidden' : ''}`}>
      
      {/* 1. TOP NAV BAR & BANNER FOR ACTIVE WORKSPACES */}
      {activeTripIdToUse && (
        <>
          {/* Dynamic Background Image Banner with Curved Bottom Corners and Strong Shadow */}
          <div 
            style={{ 
              height: `${currentHeaderHeight}px`,
              borderBottomLeftRadius: `${curveRadius}px`,
              borderBottomRightRadius: `${curveRadius}px`,
            }}
            className="fixed top-0 left-0 right-0 z-30 bg-slate-900 overflow-hidden select-none shadow-[0_12px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_14px_40px_rgba(0,0,0,0.35)]"
          >
            <img
              className="w-full h-full object-cover opacity-100 transition-opacity duration-300"
              src={getCountryBannerUrl(activeTrip?.countries, activeTrip?.title)}
              alt={activeTrip?.title || 'Trip Banner'}
              onError={(e) => {
                (e.target as HTMLImageElement).src = getFallbackBannerUrl();
              }}
              referrerPolicy="no-referrer"
            />
            {/* Soft dark gradient overlay for typographic legibility */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-black/65 pointer-events-none" />
          </div>

          {/* Fixed Controls Layer on Top (Back button, Title, Date, and Share button) */}
          <div 
            style={{ height: `${currentHeaderHeight}px` }}
            className="fixed top-0 left-0 right-0 z-40 max-w-7xl mx-auto pointer-events-none select-none"
          >
            {/* Back Button Container */}
            <div 
              style={{ top: `${safeTopPadding}px` }}
              className="absolute left-0 h-14 px-4 sm:px-6 lg:px-8 flex items-center"
            >
              <button
                onClick={() => handleSetActiveTripId(null)}
                className="pointer-events-auto p-1.5 text-white hover:text-indigo-300 transition-colors duration-150 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"
                title="Back to Home Map"
              >
                <ArrowLeft className="h-6 w-6" />
              </button>
            </div>

            {/* Share Button Container (Right aligned) */}
            <div 
              style={{ top: `${safeTopPadding}px` }}
              className="absolute right-0 h-14 px-4 sm:px-6 lg:px-8 flex items-center"
            >
              <button
                onClick={handleShareTrip}
                disabled={sharingTripId !== null}
                className="pointer-events-auto p-1.5 text-white hover:text-indigo-300 transition-colors duration-150 cursor-pointer flex items-center justify-center hover:scale-105 active:scale-95 shrink-0 disabled:opacity-50"
                title="Share Trip Invite"
              >
                {sharingTripId ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Share2 className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Title Text Layer with animated translation and scaling */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: windowWidth >= 1024 ? '32px' : (windowWidth >= 640 ? '24px' : '16px'),
                transform: `translate(${progress * 44}px, ${currentTitleTop}px) scale(${titleScale})`,
                transformOrigin: 'left center',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                maxWidth: `${titleMaxWidth}px`,
              }}
              className="font-black text-white tracking-tight drop-shadow-lg leading-9 text-2xl sm:text-3xl min-w-0 pointer-events-none"
            >
              <span className="truncate block w-full">{activeTrip?.title}</span>
            </div>

            {/* Date Subtitle Layer with vertical displacement and rapid fading */}
            {activeTrip?.startDate && (
              <div
                style={{
                  position: 'absolute',
                  top: `${expandedDateTop}px`,
                  left: windowWidth >= 1024 ? '32px' : (windowWidth >= 640 ? '24px' : '16px'),
                  opacity: Math.max(0, 1 - progress * 2.5),
                  transform: `translateY(${-scrollY * 0.4}px)`,
                }}
                className="text-xs sm:text-sm text-slate-200 font-semibold tracking-wide uppercase drop-shadow-md pointer-events-none"
              >
                {activeTrip.startDate} {activeTrip.endDate ? `— ${activeTrip.endDate}` : ''}
              </div>
            )}
          </div>
        </>
      )}

      {/* 2. BOTTOM FLOATING BAR */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={user}
        syncStatus={syncStatus}
        onOpenSettings={() => setShowGlobalSettings(true)}
        appMode={appMode}
        joinedTripCode={joinedTripCode}
        onExitJoinedTrip={handleExitJoinedTrip}
        activeTripId={activeTripIdToUse}
        onExitTrip={() => handleSetActiveTripId(null)}
        scrollY={scrollY}
      />

      {/* 3. HOME SCREEN HERO VIDEO BACKDROP & PROFILE BAR */}
      {!activeTripIdToUse && (
        <div className="relative w-full h-[220px] sm:h-[280px] md:h-[340px] lg:h-[380px] bg-slate-900 overflow-hidden select-none">
          {!heroVideoError ? (
            <video
              ref={heroVideoRef}
              key="viadia-hero-video"
              className="absolute inset-0 w-full h-full object-cover opacity-85 scale-105"
              src={heroVideoAsset || homepageConfig.heroVideo.url || "/assets/video/viadia_hero.mp4"}
              autoPlay
              loop
              muted
              playsInline
              poster={fallbackPosterImage}
              onError={() => {
                console.warn("Hero video failed to load, switching to fallback image");
                setHeroVideoError(true);
              }}
            />
          ) : (
            <img
              src={fallbackPosterImage}
              alt="Hero Backdrop"
              className="absolute inset-0 w-full h-full object-cover opacity-85 scale-105"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/85" />

          <div className="absolute inset-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-between py-5 z-30">
            <div ref={quickMenuContainerRef} className="absolute top-[max(env(safe-area-inset-top,0px)+0.75rem,2.25rem)] sm:top-6 left-4 sm:left-6 lg:left-8 z-30 pointer-events-none">
              <div className="relative pointer-events-auto">
                <button
                  ref={quickMenuButtonRef}
                  onClick={() => setShowQuickMenu((prev) => !prev)}
                  className={`flex items-center gap-3 pl-1.5 pr-4 sm:pr-5 py-1.5 rounded-full backdrop-blur-md border shadow-lg transition-all duration-300 cursor-pointer hover:brightness-110 active:scale-[0.98] ${
                    theme === 'dark' ? 'bg-black/35 border-white/10' : 'bg-white/10 border-white/20'
                  }`}
                >
                  <span className="h-11 w-11 rounded-full bg-gradient-to-tr from-indigo-500 to-teal-500 text-white flex items-center justify-center font-black text-base shadow-md overflow-hidden border border-white/30 flex-shrink-0">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'User'}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span>{user?.displayName?.[0]?.toUpperCase() || 'U'}</span>
                    )}
                  </span>
                  <span className="flex flex-col leading-tight text-left">
                    <span className="text-base sm:text-lg font-black tracking-tight text-white select-none">
                      Hi {user?.displayName ? user.displayName.split(' ')[0] : 'Traveler'}!
                    </span>
                    <span className="text-[11px] font-semibold text-white/70 select-none">
                      Ready for your next adventure?
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-white/80 shrink-0 transition-transform duration-300 ${showQuickMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Quick Access Dropdown — portaled to document.body so the hero's overflow-hidden can't clip it */}
                {createPortal(
                  <AnimatePresence>
                    {showQuickMenu && quickMenuPosition && (
                      <React.Fragment key="quick-menu-portal">
                        {/* Dimming scrim behind the dropdown; also closes the menu on click */}
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => {
                            setShowQuickMenu(false);
                            setShowAccentPicker(false);
                          }}
                          className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[190]"
                        />
                        <motion.div
                          ref={quickMenuPanelRef}
                          initial={{ opacity: 0, scale: 0.8, y: -10, rotate: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.85, y: -6, rotate: 3 }}
                          transition={{ type: 'spring', stiffness: 420, damping: 22, mass: 0.7 }}
                          style={{
                            position: 'fixed',
                            top: quickMenuPosition.top,
                            left: quickMenuPosition.left,
                            width: quickMenuPosition.width,
                          }}
                        className={`w-72 rounded-3xl border shadow-2xl overflow-hidden origin-top-left backdrop-blur-xl z-[200] ${
                          theme === 'dark' ? 'bg-slate-900/85 border-white/10' : 'bg-white/85 border-slate-200'
                        }`}
                      >
                        <div className="p-2">
                        {/* Global Checklist */}
                        <motion.button
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setShowQuickGlobalChecklist(true);
                            setShowQuickMenu(false);
                            setShowAccentPicker(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-sm font-bold transition-colors cursor-pointer ${
                            theme === 'dark' ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            theme === 'dark' ? 'bg-indigo-400/25 text-indigo-200' : 'bg-indigo-100 text-indigo-600'
                          }`}>
                            <CheckSquare className="h-[18px] w-[18px]" />
                          </span>
                          <span>Global Checklist</span>
                        </motion.button>

                        {/* Theme */}
                        <motion.button
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            handleToggleTheme();
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-sm font-bold transition-colors cursor-pointer ${
                            theme === 'dark' ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            theme === 'dark' ? 'bg-amber-400/25 text-amber-200' : 'bg-amber-100 text-amber-600'
                          }`}>
                            {theme === 'light' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                          </span>
                          <span className="flex-1">Theme</span>
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${
                            theme === 'dark' ? 'bg-white/15 text-white/90' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {theme === 'light' ? 'Light' : 'Dark'}
                          </span>
                        </motion.button>

                        {/* Accent Color (expands inline swatch picker) */}
                        <div>
                          <motion.button
                            whileHover={{ x: 3 }}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setShowAccentPicker((prev) => !prev)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-sm font-bold transition-colors cursor-pointer ${
                              theme === 'dark' ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                              theme === 'dark' ? 'bg-fuchsia-400/25 text-fuchsia-200' : 'bg-fuchsia-100 text-fuchsia-600'
                            }`}>
                              <Palette className="h-[18px] w-[18px]" />
                            </span>
                            <span className="flex-1">Accent Color</span>
                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${showAccentPicker ? 'rotate-180' : ''} ${
                              theme === 'dark' ? 'text-white/70' : 'text-slate-400'
                            }`} />
                          </motion.button>

                          <AnimatePresence>
                            {showAccentPicker && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: 'easeInOut' }}
                                className="overflow-hidden"
                              >
                                {/* Wraps to a second row automatically if the (mobile-matched) pill width is too narrow to fit all swatches in one line */}
                                <div className="flex flex-wrap gap-2 px-3 pt-1 pb-2.5">
                                  {ACCENT_COLORS.map((c, cIdx) => {
                                    const isSelected = colorTheme === c.id;
                                    return (
                                      <motion.button
                                        key={`accent-theme-${c.id}-${cIdx}`}
                                        whileHover={{ scale: 1.15, rotate: -6 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => setColorTheme(c.id)}
                                        title={c.name}
                                        className={`h-7 w-7 rounded-full border-2 flex items-center justify-center transition-shadow cursor-pointer ${
                                          isSelected ? (theme === 'dark' ? 'border-white shadow-lg' : 'border-slate-800 shadow-lg') : (theme === 'dark' ? 'border-white/30' : 'border-slate-300')
                                        }`}
                                        style={{ backgroundColor: c.hex }}
                                      >
                                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className={`my-1 border-t ${theme === 'dark' ? 'border-white/15' : 'border-slate-200'}`} />

                        {/* Full Settings */}
                        <motion.button
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setShowGlobalSettings(true);
                            setShowQuickMenu(false);
                            setShowAccentPicker(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-sm font-bold transition-colors cursor-pointer ${
                            theme === 'dark' ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            theme === 'dark' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Settings className="h-[18px] w-[18px]" />
                          </span>
                          <span>Settings</span>
                        </motion.button>

                        {/* Logout */}
                        <motion.button
                          whileHover={{ x: 3 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setShowQuickMenu(false);
                            setShowAccentPicker(false);
                            setShowLogoutConfirmModal(true);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-sm font-bold transition-colors cursor-pointer ${
                            theme === 'dark' ? 'text-rose-300 hover:bg-rose-500/15' : 'text-rose-600 hover:bg-rose-50'
                          }`}
                        >
                          <span className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                            theme === 'dark' ? 'bg-rose-400/25 text-rose-300' : 'bg-rose-100 text-rose-600'
                          }`}>
                            <LogOut className="h-[18px] w-[18px]" />
                          </span>
                          <span>Log Out</span>
                        </motion.button>
                        </div>
                      </motion.div>
                      </React.Fragment>
                    )}
                  </AnimatePresence>,
                  document.body
                )}
              </div>
            </div>

            <div className="h-4" />
          </div>
        </div>
      )}

      {/* 4. MAIN PAGE & WORKSPACE LAYOUT (Page starts behind image curve and scrolls underneath image header) */}
      <AnimatePresence mode="wait">
        {activeTripIdToUse ? (
          <motion.div 
            key={`trip-workspace-view-${activeTripIdToUse}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            ref={scrollContainerRef}
            onScroll={(e) => {
              const scrollTop = e.currentTarget.scrollTop;
              requestAnimationFrame(() => setScrollY(scrollTop));
              if (showQuickMenu) {
                setShowQuickMenu(false);
                setShowAccentPicker(false);
              }
            }}
            className={`fixed inset-0 overscroll-y-contain scroll-smooth scroll-bounce z-20 ${
              showQuickMenu ? 'overflow-hidden' : 'overflow-y-auto'
            }`}
          >
            {/* Spacer: page starts behind where image curved bottom begins */}
            <div style={{ height: `${headerExpandedHeight - 12}px` }} className="w-full pointer-events-none select-none" />
            
            {/* Main workspace page content container */}
            <div className="bg-slate-50 dark:bg-slate-950 relative z-20 transition-colors duration-300 min-h-full">
              <main className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 pb-28 pt-11">
                {shareToast && (
                  <div className="mb-6 p-3.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-900/45 text-xs rounded-2xl font-bold flex items-center space-x-2 animate-in fade-in duration-200">
                    <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{shareToast}</span>
                  </div>
                )}

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeTripIdToUse}-${currentTab}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full"
                  >
                    {currentTab === 'map' && (
                      <WorldMap
                        trips={visibleTrips}
                        activeTripId={activeTripIdToUse}
                        onSetActiveTripId={handleSetActiveTripId}
                        onUpdateTrips={handleUpdateTrips}
                        onNewTripAdded={() => setCurrentTab('planner')}
                        appMode={appMode}
                        onJoinTrip={handleJoinTrip}
                        user={user}
                        globalChecklist={appData.globalChecklist || []}
                      />
                    )}
                    
                    {currentTab === 'summary' && activeTrip && (
                      <TripSummary
                        trip={activeTrip}
                        trips={visibleTrips}
                        onUpdateTrips={handleUpdateTrips}
                        activeTripId={activeTripIdToUse}
                        onSetActiveTripId={handleSetActiveTripId}
                        isReadOnly={isTripReadOnly(activeTrip)}
                        onSwitchToTab={(tab) => setCurrentTab(tab)}
                        onOpenMap={(placeId) => {
                          setMapFocusPlaceId(typeof placeId === 'string' ? placeId : null);
                          setIsTripMapOpen(true);
                        }}
                        onOpenUpgradeModal={() => setShowLifetimePassModal(true)}
                      />
                    )}

                    {currentTab === 'planner' && (
                      <Planner
                        trips={visibleTrips}
                        onUpdateTrips={handleUpdateTrips}
                        activeTripId={activeTripIdToUse}
                        onSetActiveTripId={handleSetActiveTripId}
                        isReadOnly={isTripReadOnly(activeTrip)}
                        onOpenMap={(placeId) => {
                          setMapFocusPlaceId(typeof placeId === 'string' ? placeId : null);
                          setIsTripMapOpen(true);
                        }}
                        onOpenUpgradeModal={() => setShowLifetimePassModal(true)}
                      />
                    )}
                    
                    {currentTab === 'expenses' && (
                      <ExpenseTracker
                        trips={visibleTrips}
                        onUpdateTrips={handleUpdateTrips}
                        activeTripId={activeTripIdToUse}
                        onSetActiveTripId={handleSetActiveTripId}
                        isReadOnly={isTripReadOnly(activeTrip)}
                      />
                    )}
                    
                    {currentTab === 'checklist' && (
                      <Checklist
                        trips={visibleTrips}
                        globalChecklist={appData.globalChecklist}
                        onUpdateTrips={handleUpdateTrips}
                        onUpdateGlobalChecklist={handleUpdateGlobalChecklist}
                        activeTripId={activeTripIdToUse}
                        onSetActiveTripId={handleSetActiveTripId}
                        isReadOnly={isTripReadOnly(activeTrip)}
                        user={user}
                      />
                    )}

                    {currentTab === 'settings' && (
                      <TripSettings
                        trips={visibleTrips}
                        onUpdateTrips={handleUpdateTrips}
                        activeTripId={activeTripIdToUse}
                        onSetActiveTripId={handleSetActiveTripId}
                        isReadOnly={isTripReadOnly(activeTrip)}
                        user={user}
                        colorTheme={colorTheme}
                      />
                    )}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="home-workspace-view"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="bg-slate-50 dark:bg-slate-950 rounded-t-[24px] -mt-6 relative z-20 shadow-none border-t-0 transition-colors duration-300 min-h-full"
          >
            <main className="w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 pb-28 py-10">
              {shareToast && (
                <div className="mb-6 p-3.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border border-emerald-150 dark:border-emerald-900/45 text-xs rounded-2xl font-bold flex items-center space-x-2 animate-in fade-in duration-200">
                  <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{shareToast}</span>
                </div>
              )}

              <AnimatePresence mode="wait">
                <motion.div
                  key="home-dashboard"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full"
                >
                  <WorldMap
                    trips={visibleTrips}
                    activeTripId={activeTripIdToUse}
                    onSetActiveTripId={handleSetActiveTripId}
                    onUpdateTrips={handleUpdateTrips}
                    onNewTripAdded={() => setCurrentTab('planner')}
                    appMode={appMode}
                    onJoinTrip={handleJoinTrip}
                    user={user}
                    globalChecklist={appData.globalChecklist || []}
                  />
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Auth Prompt Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white border border-slate-200 p-8 rounded-[32px] max-w-md w-full space-y-6 shadow-xl relative text-center">
            <button
              onClick={() => {
                setShowAuthModal(false);
                setLoginError(null);
              }}
              className="absolute right-5 top-5 text-slate-500 hover:text-slate-800"
            >
              <span className="text-2xl">×</span>
            </button>

            <div className="bg-indigo-50 p-4 rounded-full text-indigo-600 w-max mx-auto">
              <Globe className="h-10 w-10" />
            </div>

            <div className="space-y-2">
              <h3 className="font-sans text-2xl font-bold tracking-tight text-slate-900">Secure Cloud Sync</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Log in with your Google account to automatically load, sync, and persist your customized travel plans, Splitwise expense divisions, and task checklists securely in the cloud!
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-left space-y-2">
              <div className="flex items-start space-x-2.5 text-[11px] text-slate-600">
                <ShieldCheck className="h-4 w-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                <span>We use secure Google Authentication to protect your data. Your database syncs by default unless the connection is interrupted or authentication is revoked.</span>
              </div>
            </div>

            {loginError && (
              <div className="bg-rose-50 dark:bg-rose-950/20 p-4 rounded-2xl border border-rose-200 dark:border-rose-900 text-left space-y-2 text-rose-700 dark:text-rose-400">
                <div className="flex items-start space-x-2.5 text-[11px] font-medium leading-relaxed">
                  <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-450 flex-shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
                <div className="pt-2 text-center">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-sm"
                  >
                    Open App in New Tab
                  </a>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-md text-sm"
              >
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4 fill-current">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" className="no-referrer"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" className="no-referrer"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" className="no-referrer"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" className="no-referrer"></path>
                  <path fill="none" d="M0 0h48v48H0z" className="no-referrer"></path>
                </svg>
                <span>Sign in with Google</span>
              </button>
              
              {!loginError && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center px-4 py-2 text-xs font-bold text-slate-500 hover:text-indigo-600 transition"
                >
                  🚀 Running in Iframe? Open in New Tab
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Trip Interactive Map Modal */}
      {activeTrip && (
        <FullScreenTripMapModal
          isOpen={isTripMapOpen}
          onClose={() => setIsTripMapOpen(false)}
          trip={activeTrip}
          theme={theme}
          initialSelectedPlaceId={mapFocusPlaceId}
        />
      )}

      {/* Settings Panel Modal */}
      <SettingsModal
        key={`settings-modal-${settingsRefreshKey}`}
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        user={user}
        onLogin={() => {
          setShowSettingsModal(false);
          setShowAuthModal(true);
        }}
        onLogout={() => {
          handleLogout();
          setShowSettingsModal(false);
        }}
        onDeleteAccount={async () => {
          await handleDeleteAccount();
          setShowSettingsModal(false);
        }}
        onUpdateDisplayName={handleUpdateDisplayName}
        syncStatus={syncStatus}
        appData={appData}
        onImportData={handleUpdateAppData}
        colorTheme={colorTheme}
        onSelectColorTheme={setColorTheme}
        isJoinedTrip={!!joinedTripCode}
        onOpenLifetimePassModal={() => {
          setShowLifetimePassModal(true);
        }}
      />

      {/* Global Settings Full Screen View */}
      <AnimatePresence>
        {showGlobalSettings && (
          <motion.div
            key="global-settings-screen"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
            className="fixed inset-0 z-[170] bg-slate-50 dark:bg-slate-950 overflow-y-auto"
          >
            <GlobalSettingsScreen
              key={`global-settings-${settingsRefreshKey}`}
              onClose={() => setShowGlobalSettings(false)}
              theme={theme}
              onToggleTheme={handleToggleTheme}
              user={user}
              onLogin={() => {
                setShowGlobalSettings(false);
                setShowAuthModal(true);
              }}
              onLogout={() => {
                handleLogout();
                setShowGlobalSettings(false);
              }}
              onDeleteAccount={async () => {
                await handleDeleteAccount();
                setShowGlobalSettings(false);
              }}
              onUpdateDisplayName={handleUpdateDisplayName}
              syncStatus={syncStatus}
              appData={appData}
              onImportData={handleUpdateAppData}
              colorTheme={colorTheme}
              onSelectColorTheme={setColorTheme}
              userTier={userTier}
              onOpenLifetimePassModal={() => setShowLifetimePassModal(true)}
              onUpdateGlobalChecklist={handleUpdateGlobalChecklist}
              onUpdateTrips={handleUpdateTrips}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Access: Global Checklist Modal (opened directly from the profile pill dropdown) */}
      <GlobalChecklistModal
        isOpen={showQuickGlobalChecklist}
        onClose={() => setShowQuickGlobalChecklist(false)}
        globalChecklist={appData.globalChecklist || []}
        trips={appData.trips || {}}
        onUpdateGlobalChecklist={handleUpdateGlobalChecklist}
        onUpdateTrips={handleUpdateTrips}
      />

      {/* Permission Error Modal */}
      {permissionErrorModal && permissionErrorModal.show && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-md flex items-center justify-center z-[110] p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-[32px] max-w-md w-full space-y-6 shadow-xl relative text-center">
            <button
              onClick={() => setPermissionErrorModal(null)}
              className="absolute right-5 top-5 text-slate-400 dark:text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              <span className="text-2xl">×</span>
            </button>

            <div className="bg-rose-50 dark:bg-rose-950/30 p-4 rounded-full text-rose-600 dark:text-rose-450 w-max mx-auto border border-rose-100 dark:border-rose-900/40">
              <ShieldAlert className="h-10 w-10 animate-bounce" />
            </div>

            <div className="space-y-2">
              <h3 className="font-sans text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Permission Denied</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                The trip <strong className="text-slate-800 dark:text-slate-200">"{permissionErrorModal.tripTitle}"</strong> is currently in <strong className="text-rose-600 dark:text-rose-400">Read-Only (r)</strong> mode.
              </p>
              {(permissionErrorModal.ownerEmail || permissionErrorModal.ownerName) && (
                <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium">
                  Trip Owner: <strong className="text-indigo-600 dark:text-indigo-400">{permissionErrorModal.ownerEmail || permissionErrorModal.ownerName}</strong>
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pt-1">
                You cannot add entries, edit itinerary items, alter expenses, or tick checklists. Only the trip owner can modify the trip, or enable "Trip share settings" to allow others to edit.
              </p>
            </div>

            <button
              onClick={() => setPermissionErrorModal(null)}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-xl font-bold transition shadow-md text-xs cursor-pointer"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Lifetime Pass Upgrade Modal */}
      <LifetimePassModal
        isOpen={showLifetimePassModal}
        onClose={() => {
          setShowLifetimePassModal(false);
          setUserTier(getUserTier());
          setSettingsRefreshKey((k) => k + 1);
        }}
        onTierChanged={(newTier) => {
          setUserTier(newTier);
          setSettingsRefreshKey((k) => k + 1);
        }}
        onLoginWithGoogle={handleLogin}
        onLoginWithApple={handleAppleLogin}
      />

      {/* Sticky Bottom Ad Banner for Free Users */}
      {userTier === 'free' && activeTripId !== null && (
        <AdBanner
          type="sticky-bottom"
          onOpenUpgradeModal={() => setShowLifetimePassModal(true)}
        />
      )}

      {/* QUICK ACCESS MENU LOGOUT CONFIRMATION MODAL */}
      {showLogoutConfirmModal && createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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
                type="button"
                onClick={() => setShowLogoutConfirmModal(false)}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirmModal(false);
                  handleLogout();
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
    </div>
  );
}
