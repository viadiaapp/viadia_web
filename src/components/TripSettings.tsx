import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Trip, Expense, ColorTheme } from '../types';
import { Coins, Users, Layers, Wallet, ArrowRight, Plus, Trash2, Globe, ShieldCheck, Compass, DollarSign, HelpCircle, RefreshCw, FileText, FileSpreadsheet, Download, Check, X, Info, Calendar, ChevronDown, ChevronUp, CheckSquare, Building2 } from 'lucide-react';
import DateRangePicker from './DateRangePicker';
import { getStaticCurrencies, getUserDetails } from '../lib/db';
import { isOwnerOfTrip } from '../lib/auth';
import { StaticCurrency } from '../data/staticCurrencies';
import { getTripTimingState, getAllowedStatuses, computeAutoStatus, isStatusValidForDates } from '../lib/tripUtils';
import { generateTripPdf } from '../lib/pdfGenerator';
import { generateDataPdf } from '../lib/dataPdfGenerator';
import { downloadExpensesCSV } from '../lib/csvExport';
import { reconcileDailyHotelStops } from '../lib/hotelStopsUtils';
import { useBackButton } from '../lib/backButtonHandler';
import { fetchLiveForexRates } from '../lib/apiUtils';

interface TripSettingsProps {
  trips: { [id: string]: Trip };
  onUpdateTrips: (updatedTrips: { [id: string]: Trip }) => void;
  activeTripId: string | null;
  onSetActiveTripId: (id: string | null) => void;
  isReadOnly?: boolean;
  user?: any;
  colorTheme?: ColorTheme;
}

export default function TripSettings({
  trips,
  onUpdateTrips,
  activeTripId,
  onSetActiveTripId,
  isReadOnly,
  user,
  colorTheme = 'ocean'
}: TripSettingsProps) {
  const activeTrip = activeTripId ? trips[activeTripId] : null;

  const timing = activeTrip ? getTripTimingState(activeTrip.startDate, activeTrip.endDate) : 'future';
  const allowedStatuses = activeTrip ? getAllowedStatuses(activeTrip.startDate, activeTrip.endDate) : ['planned', 'cancelled'];

  const [currenciesList, setCurrenciesList] = useState<StaticCurrency[]>([]);

  useEffect(() => {
    async function load() {
      const data = await getStaticCurrencies();
      setCurrenciesList(data);
    }
    load();
  }, []);

  // Auto-reconcile status if trip dates require it (unless explicitly cancelled or read-only)
  useEffect(() => {
    if (!activeTrip || isReadOnly) return;
    if (activeTrip.status === 'cancelled') return;
    const targetStatus = computeAutoStatus(activeTrip.startDate, activeTrip.endDate, activeTrip.status);
    if (activeTrip.status !== targetStatus) {
      updateActiveTrip({ status: targetStatus });
    }
  }, [activeTrip?.startDate, activeTrip?.endDate, activeTrip?.status, isReadOnly]);

  const [ownerInfo, setOwnerInfo] = useState<{ email?: string; name?: string }>({});

  useEffect(() => {
    let isMounted = true;
    const fetchOwnerDetails = async () => {
      if (!activeTrip?.ownerUid || isOwnerOfTrip(activeTrip, user)) {
        if (isMounted) setOwnerInfo({});
        return;
      }
      if (activeTrip.ownerUid.includes('@')) {
        if (isMounted) setOwnerInfo({ email: activeTrip.ownerUid });
        return;
      }
      try {
        const details = await getUserDetails(activeTrip.ownerUid);
        if (isMounted && details) {
          setOwnerInfo({ email: details.email || undefined, name: details.name || undefined });
        }
      } catch (err) {
        console.warn('Failed resolving owner info in settings:', err);
      }
    };
    fetchOwnerDetails();
    return () => { isMounted = false; };
  }, [activeTrip?.ownerUid, user?.uid]);

  const defaultUSDExchangeRates = useMemo(() => {
    const rates: { [currency: string]: number } = {};
    currenciesList.forEach(c => {
      rates[c.currencyCode] = c.defaultExchangeRate || 1.0;
    });
    rates['USD'] = 1.0;
    return rates;
  }, [currenciesList]);

  const CURRENCIES = useMemo(() => {
    const map = new Map<string, { code: string; name: string; symbol: string }>();
    currenciesList.forEach(c => {
      if (!map.has(c.currencyCode)) {
        map.set(c.currencyCode, {
          code: c.currencyCode,
          name: c.currencyName,
          symbol: c.currencySymbol
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [currenciesList]);

  const getOfflineFallbackRate = (from: string, to: string): number => {
    const fFrom = defaultUSDExchangeRates[from.toUpperCase()] || 1.0;
    const fTo = defaultUSDExchangeRates[to.toUpperCase()] || 1.0;
    return Number((fTo / fFrom).toFixed(6));
  };

  const getThemeTextClass = () => {
    switch (colorTheme) {
      case 'emerald': return 'text-emerald-600 dark:text-emerald-400';
      case 'amber': return 'text-amber-600 dark:text-amber-400';
      case 'rose': return 'text-rose-600 dark:text-rose-400';
      default: return 'text-indigo-600 dark:text-indigo-400';
    }
  };

  const getThemeCheckboxClass = () => {
    switch (colorTheme) {
      case 'emerald': return 'text-emerald-600 focus:ring-emerald-500';
      case 'amber': return 'text-amber-600 focus:ring-amber-500';
      case 'rose': return 'text-rose-600 focus:ring-rose-500';
      default: return 'text-indigo-600 focus:ring-indigo-500';
    }
  };

  const getThemeBgClass = () => {
    switch (colorTheme) {
      case 'emerald': return 'bg-emerald-600';
      case 'amber': return 'bg-amber-600';
      case 'rose': return 'bg-rose-600';
      default: return 'bg-indigo-600';
    }
  };

  const getThemeFocusBorderClass = () => {
    switch (colorTheme) {
      case 'emerald': return 'focus:border-emerald-500';
      case 'amber': return 'focus:border-amber-500';
      case 'rose': return 'focus:border-rose-500';
      default: return 'focus:border-indigo-500';
    }
  };

  const updateActiveTrip = (fields: Partial<Trip>) => {
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error("Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.");
    }
    const updated = { ...trips };
    if (updated[activeTrip.id]) {
      updated[activeTrip.id] = {
        ...updated[activeTrip.id],
        ...fields
      };
    }
    onUpdateTrips(updated);
  };

  // Form input states
  const [newTravelerName, setNewTravelerName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newPaymentTypeName, setNewPaymentTypeName] = useState('');
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [budgetValue, setBudgetValue] = useState<string>('');
  const [companionError, setCompanionError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Collapsible sections state
  const [isTripStatusCollapsed, setIsTripStatusCollapsed] = useState(true);
  const [isTravelDatesCollapsed, setIsTravelDatesCollapsed] = useState(true);
  const [isTravelersCollapsed, setIsTravelersCollapsed] = useState(true);
  const [isBudgetCollapsed, setIsBudgetCollapsed] = useState(true);
  const [isCurrencyCollapsed, setIsCurrencyCollapsed] = useState(true);
  const [isExpenseCategoriesCollapsed, setIsExpenseCategoriesCollapsed] = useState(true);
  const [isPaymentCategoriesCollapsed, setIsPaymentCategoriesCollapsed] = useState(true);
  const [isHotelScheduleCollapsed, setIsHotelScheduleCollapsed] = useState(true);
  const [isCsvExportCollapsed, setIsCsvExportCollapsed] = useState(false);
  const [csvExportSuccess, setCsvExportSuccess] = useState(false);
  const [isPdfExportCollapsed, setIsPdfExportCollapsed] = useState(true);

  const handleExportCSV = () => {
    if (!activeTrip) return;
    downloadExpensesCSV(activeTrip);
    setCsvExportSuccess(true);
    setTimeout(() => {
      setCsvExportSuccess(false);
    }, 2500);
  };

  // PDF Workbook Export States (Moved to the very last of TripSettings!)
  const [exportIncludePlanner, setExportIncludePlanner] = useState(true);
  const [exportIncludeExpenses, setExportIncludeExpenses] = useState(true);
  const [exportIncludeBudget, setExportIncludeBudget] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isCompilingDataPdf, setIsCompilingDataPdf] = useState(false);

  const handleExportPDF = async () => {
    if (!activeTrip) return;
    setIsCompiling(true);
    try {
      await generateTripPdf(activeTrip, {
        includePlanner: exportIncludePlanner,
        includeExpenses: exportIncludeExpenses,
        includeBudget: exportIncludeBudget,
        includeChecklist: true,
      });
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleExportDataPDF = async () => {
    if (!activeTrip) return;
    setIsCompilingDataPdf(true);
    try {
      await generateDataPdf(activeTrip, {
        includePlanner: exportIncludePlanner,
        includeExpenses: exportIncludeExpenses,
        includeBudget: exportIncludeBudget,
        includeChecklist: true,
      });
    } catch (err) {
      console.error("Failed to generate Data PDF:", err);
    } finally {
      setIsCompilingDataPdf(false);
    }
  };

  // States for currency toggle and interactive date editing
  const [showCurrenciesList, setShowCurrenciesList] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingDates, setPendingDates] = useState<{ start: string; end: string } | null>(null);
  const [showShortenWarning, setShowShortenWarning] = useState(false);
  const [shortenedItemsCount, setShortenedItemsCount] = useState({ stops: 0, expenses: 0 });

  // Sub-overlays & modals back button handlers
  useBackButton('trip-settings-shorten-warning', showShortenWarning, () => setShowShortenWarning(false), 110);
  useBackButton('trip-settings-date-picker', showDatePicker, () => setShowDatePicker(false), 110);
  useBackButton('trip-settings-currencies-list', showCurrenciesList, () => setShowCurrenciesList(false), 110);

  // States for Daily Hotel Start & End Stops
  const [hotelStopsEnabled, setHotelStopsEnabled] = useState(false);
  const [hotelStartTimeInput, setHotelStartTimeInput] = useState('09:00');
  const [hotelEndTimeInput, setHotelEndTimeInput] = useState('21:00');

  useEffect(() => {
    if (activeTrip) {
      setBudgetValue(activeTrip.budgetLimit !== undefined ? String(activeTrip.budgetLimit) : '2500');
      setHotelStopsEnabled(!!activeTrip.enableHotelDailyStops);
      setHotelStartTimeInput(activeTrip.hotelDailyStartTime || '09:00');
      setHotelEndTimeInput(activeTrip.hotelDailyEndTime || '21:00');
    }
  }, [activeTripId, activeTrip?.budgetLimit, activeTrip?.enableHotelDailyStops, activeTrip?.hotelDailyStartTime, activeTrip?.hotelDailyEndTime]);

  const handleToggleHotelStops = (enabled: boolean) => {
    if (!activeTrip || isReadOnly) return;
    setHotelStopsEnabled(enabled);
    const updatedTripObj: Trip = {
      ...activeTrip,
      enableHotelDailyStops: enabled,
      hotelDailyStartTime: hotelStartTimeInput,
      hotelDailyEndTime: hotelEndTimeInput,
    };
    const reconciled = reconcileDailyHotelStops(updatedTripObj);
    updateActiveTrip(reconciled);
  };

  const handleApplyHotelStopsTimes = (startT: string, endT: string) => {
    if (!activeTrip || isReadOnly) return;
    setHotelStartTimeInput(startT);
    setHotelEndTimeInput(endT);
    if (!hotelStopsEnabled) return;

    const updatedTripObj: Trip = {
      ...activeTrip,
      enableHotelDailyStops: true,
      hotelDailyStartTime: startT,
      hotelDailyEndTime: endT,
    };

    const reconciled = reconcileDailyHotelStops(updatedTripObj);
    updateActiveTrip(reconciled);
  };

  if (!activeTrip) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-[32px] text-center max-w-lg mx-auto shadow-sm space-y-4">
        <Compass className="h-10 w-10 text-indigo-500 mx-auto animate-pulse" />
        <h3 className="text-base font-bold text-slate-800 dark:text-white">No Active Trip Selected</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Please select or create a trip in the <strong>Home</strong> tab first to manage settings.
        </p>
      </div>
    );
  }

  const budgetLimit = activeTrip.budgetLimit !== undefined ? activeTrip.budgetLimit : 2500;

  const handleBudgetLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setBudgetValue(rawVal);
    const parsed = rawVal === '' ? 0 : Number(rawVal);
    if (!isNaN(parsed)) {
      updateActiveTrip({ budgetLimit: parsed });
    }
  };

  const checkDateShortening = (newStart: string, newEnd: string) => {
    if (!activeTrip) return;
    
    const oldStart = activeTrip.startDate || '';
    const oldEnd = activeTrip.endDate || '';
    
    const isShortened = (newStart > oldStart) || (newEnd < oldEnd);
    
    if (isShortened) {
      const stopsToDelete = (activeTrip.timeline || []).filter(p => {
        if (!p.time) return false;
        const d = p.time.split('T')[0];
        return d < newStart || d > newEnd;
      }).length;
      
      const expensesToMove = (activeTrip.expenses || []).filter(e => {
        if (!e.date) return false;
        return e.date < newStart || e.date > newEnd;
      }).length;
      
      setShortenedItemsCount({ stops: stopsToDelete, expenses: expensesToMove });
      setPendingDates({ start: newStart, end: newEnd });
      setShowShortenWarning(true);
    } else {
      // Extended or unchanged duration
      applyNewDates(newStart, newEnd);
    }
  };

  const applyNewDates = (newStart: string, newEnd: string) => {
    if (!activeTrip) return;
    
    // Keep unscheduled timeline stops, delete scheduled stops that are outside the new range
    const updatedTimeline = (activeTrip.timeline || []).filter(p => {
      if (!p.time) return true;
      const d = p.time.split('T')[0];
      return d >= newStart && d <= newEnd;
    });
    
    // Retain all expenses; those outside the new range will naturally move to before/after groups
    const updatedExpenses = activeTrip.expenses || [];
    
    const autoStatus = computeAutoStatus(newStart, newEnd, activeTrip.status);

    const tempTripObj: Trip = {
      ...activeTrip,
      startDate: newStart,
      endDate: newEnd,
      status: autoStatus,
      timeline: updatedTimeline,
      expenses: updatedExpenses
    };

    const finalTripObj = activeTrip.enableHotelDailyStops
      ? reconcileDailyHotelStops(tempTripObj)
      : tempTripObj;

    updateActiveTrip(finalTripObj);
    
    setPendingDates(null);
    setShowShortenWarning(false);
  };

  const handleBaseCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextBase = e.target.value.toUpperCase();
    if (!activeTrip) return;
    const oldBase = (activeTrip.baseCurrency || 'USD').toUpperCase();
    if (nextBase === oldBase) return;

    // Build the updated list of currencies.
    // We want the new base currency, the old base currency (since it becomes a target/foreign currency),
    // and any other foreign currencies currently selected (excluding the new base).
    const currentCurrencies = activeTrip.currencies || [];
    const targetCurrencies = currentCurrencies.filter(c => c !== nextBase && c !== oldBase);
    const nextCurrencies = Array.from(new Set([nextBase, oldBase, ...targetCurrencies]));

    const nextRates: { [currency: string]: number } = { [nextBase]: 1.0 };
    
    // Recalculate offline fallback exchange rates relative to the new base
    nextCurrencies.forEach(c => {
      if (c !== nextBase) {
        nextRates[c] = getOfflineFallbackRate(nextBase, c);
      }
    });

    updateActiveTrip({
      baseCurrency: nextBase,
      currencies: nextCurrencies,
      exchangeRates: nextRates
    });
  };

  const handleAddTargetCurrency = (currencyCode: string) => {
    const upper = currencyCode.toUpperCase();
    if (!activeTrip || upper === activeTrip.baseCurrency) return;
    const currentCurrencies = activeTrip.currencies || [];
    if (currentCurrencies.includes(upper)) return;

    const nextCurrencies = [...currentCurrencies, upper];
    const nextRates = { ...activeTrip.exchangeRates };
    nextRates[upper] = getOfflineFallbackRate(activeTrip.baseCurrency || 'USD', upper);

    updateActiveTrip({
      currencies: nextCurrencies,
      exchangeRates: nextRates
    });
  };

  const handleRemoveTargetCurrency = (currencyCode: string) => {
    if (!activeTrip) return;
    const currentCurrencies = activeTrip.currencies || [];
    const nextCurrencies = currentCurrencies.filter(c => c !== currencyCode);
    const nextRates = { ...activeTrip.exchangeRates };
    delete nextRates[currencyCode];

    updateActiveTrip({
      currencies: nextCurrencies,
      exchangeRates: nextRates
    });
  };

  const handleExchangeRateChange = (currency: string, value: string) => {
    if (!activeTrip) return;
    const num = parseFloat(value) || 0;
    const nextRates = { ...activeTrip.exchangeRates, [currency]: num };
    updateActiveTrip({ exchangeRates: nextRates });
  };

  const handleFetchRatesLive = async () => {
    if (!activeTrip) return;
    const base = activeTrip.baseCurrency || 'USD';
    setIsFetchingRates(true);
    setFetchError(null);
    try {
      const data = await fetchLiveForexRates(base);
      if (data && data.rates) {
        const nextRates = { ...activeTrip.exchangeRates };
        const targets = activeTrip.currencies || [];
        targets.forEach(c => {
          if (data.rates[c]) {
            nextRates[c] = Number(Number(data.rates[c]).toFixed(6));
          }
        });
        updateActiveTrip({ exchangeRates: nextRates });
      } else {
        throw new Error('Invalid rate response format.');
      }
    } catch (err: any) {
      console.warn('Live rate fetch warning:', err);
      setFetchError('Failed to fetch live rates. Using current rates.');
    } finally {
      setIsFetchingRates(false);
    }
  };

  // Companions Management
  const handleAddTraveler = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !newTravelerName.trim()) return;
    const name = newTravelerName.trim();
    if (activeTrip.travelers.includes(name)) {
      setCompanionError('Companion is already in the list!');
      setTimeout(() => setCompanionError(null), 4000);
      return;
    }
    updateActiveTrip({ travelers: [...activeTrip.travelers, name] });
    setNewTravelerName('');
  };

  const handleDeleteTraveler = (name: string) => {
    if (!activeTrip) return;
    const isUsed = (activeTrip.expenses || []).some(exp =>
      exp.paidBy === name || (exp.splits || []).some(s => s.traveler === name)
    );
    if (isUsed) {
      setCompanionError(`Cannot delete ${name} because they are linked to expenses.`);
      setTimeout(() => setCompanionError(null), 5000);
      return;
    }
    updateActiveTrip({ travelers: activeTrip.travelers.filter(p => p !== name) });
  };

  // Categories Management
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !newCategoryName.trim()) return;
    const clean = newCategoryName.trim();
    const categoriesList = activeTrip.categories || ['Food', 'Transport', 'Lodging', 'Activities', 'Other'];
    if (categoriesList.includes(clean)) {
      setCategoryError('Category already exists!');
      setTimeout(() => setCategoryError(null), 4000);
      return;
    }
    updateActiveTrip({ categories: [...categoriesList, clean] });
    setNewCategoryName('');
  };

  const handleDeleteCategory = (catName: string) => {
    if (!activeTrip) return;
    const isUsed = (activeTrip.expenses || []).some(exp => exp.category === catName);
    if (isUsed) {
      setCategoryError(`Cannot delete "${catName}" because it is linked to expenses.`);
      setTimeout(() => setCategoryError(null), 5000);
      return;
    }
    const categoriesList = activeTrip.categories || ['Food', 'Transport', 'Lodging', 'Activities', 'Other'];
    if (categoriesList.length <= 1) {
      setCategoryError('Must maintain at least one category!');
      setTimeout(() => setCategoryError(null), 4000);
      return;
    }
    updateActiveTrip({ categories: categoriesList.filter(c => c !== catName) });
  };

  // Payment Types Management
  const handleAddPaymentType = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !newPaymentTypeName.trim()) return;
    const clean = newPaymentTypeName.trim();
    const paymentTypesList = activeTrip.paymentTypes || ['Cash', 'Credit Card'];
    if (paymentTypesList.includes(clean)) {
      setPaymentError('Payment type already exists!');
      setTimeout(() => setPaymentError(null), 4000);
      return;
    }
    updateActiveTrip({ paymentTypes: [...paymentTypesList, clean] });
    setNewPaymentTypeName('');
  };

  const handleDeletePaymentType = (ptName: string) => {
    if (!activeTrip) return;
    const isUsed = (activeTrip.expenses || []).some(exp => exp.paymentType === ptName);
    if (isUsed) {
      setPaymentError(`Cannot delete "${ptName}" because it is linked to expenses.`);
      setTimeout(() => setPaymentError(null), 5000);
      return;
    }
    const paymentTypesList = activeTrip.paymentTypes || ['Cash', 'Credit Card'];
    if (paymentTypesList.length <= 1) {
      setPaymentError('Must maintain at least one payment type!');
      setTimeout(() => setPaymentError(null), 4000);
      return;
    }
    updateActiveTrip({ paymentTypes: paymentTypesList.filter(p => p !== ptName) });
  };

  const parsedCurrencies = (activeTrip.currencies || []).filter(c => c !== (activeTrip.baseCurrency || 'USD'));

  return (
    <div className="w-full space-y-6 text-left">
      {/* 1. Trip Share Settings Card (Only for signed in users) */}
      {user && user.email && (
        <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Trip Share Settings</span>
          </h3>
          {user && isOwnerOfTrip(activeTrip, user) ? (
            <div className="pt-1">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="space-y-0.5 pr-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">
                    Allow others to modify trip
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={!!activeTrip.allowOthersToModify}
                    onChange={(e) => {
                      updateActiveTrip({ allowOthersToModify: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-1">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 block">
                  Sharing Mode: <span className="text-indigo-600 dark:text-indigo-400 uppercase font-extrabold">{activeTrip.allowOthersToModify ? 'Read-Write (rw)' : 'Read-Only (r)'}</span>
                </span>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  You are not the owner of this trip. Only the owner {(ownerInfo.email || ownerInfo.name) ? `(${ownerInfo.email || ownerInfo.name})` : ''} can change write permissions.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Read Only Notice before Trip Status */}
      {isReadOnly && (
        <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50 rounded-2xl text-amber-800 dark:text-amber-300 text-xs text-left space-y-1">
          <p className="font-medium">
            This trip is currently read-only. Please ask the owner to provide permission if you want to modify it.
          </p>
        </div>
      )}

      {/* 2. Trip Status Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsTripStatusCollapsed(!isTripStatusCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Compass className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Trip Status</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isTripStatusCollapsed && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                {activeTrip.status || 'planned'}
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Trip Status"
            >
              {isTripStatusCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isTripStatusCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Trip status depends directly on your trip travel dates. Active is automatically assigned when the current date falls within trip dates.
            </p>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Current Status</label>
              <select
                value={activeTrip.status || 'planned'}
                onChange={(e) => {
                  const val = e.target.value as any;
                  if (isStatusValidForDates(val, activeTrip.startDate, activeTrip.endDate)) {
                    updateActiveTrip({ status: val });
                  }
                }}
                disabled={isReadOnly}
                className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                {allowedStatuses.includes('planned') && <option value="planned">Planned</option>}
                {allowedStatuses.includes('active') && <option value="active">Active</option>}
                {allowedStatuses.includes('completed') && <option value="completed">Completed</option>}
                {allowedStatuses.includes('cancelled') && <option value="cancelled">Cancelled</option>}
              </select>

              <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 text-xs space-y-1">
                {timing === 'ongoing' && (
                  <p className="text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></span>
                    <span><strong>Active Trip:</strong> Today's date is within travel dates ({activeTrip.startDate} to {activeTrip.endDate}). Status is automatically assigned as Active.</span>
                  </p>
                )}
                {timing === 'future' && (
                  <p className="text-indigo-700 dark:text-indigo-400 font-medium">
                    <strong>Upcoming Trip:</strong> Start date ({activeTrip.startDate}) is in the future. Status can be set to Planned or Cancelled.
                  </p>
                )}
                {timing === 'past' && (
                  <p className="text-slate-600 dark:text-slate-400 font-medium">
                    <strong>Past Trip:</strong> End date ({activeTrip.endDate}) has passed. Status can be set to Completed or Cancelled.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 3. Travel Dates Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left relative">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsTravelDatesCollapsed(!isTravelDatesCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Trip Travel Dates</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isTravelDatesCollapsed && (
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                {activeTrip.startDate} ➜ {activeTrip.endDate}
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Travel Dates"
            >
              {isTravelDatesCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isTravelDatesCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Modify the start and end dates of your journey. Extending the duration keeps all entries intact, while shortening will prune out-of-range plans.
            </p>
            
            <div className="space-y-1 relative">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Active Trip Schedule</label>
              <button
                type="button"
                onClick={() => !isReadOnly && setShowDatePicker(true)}
                disabled={isReadOnly}
                className="w-full flex items-center justify-between text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 text-left cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-900/55 transition shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-indigo-500 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300 font-mono font-bold">
                    {activeTrip.startDate}   ➜   {activeTrip.endDate}
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
              </button>

              {showDatePicker && (
                <>
                  <div className="fixed inset-0 bg-slate-950/15 backdrop-blur-xs z-40" onClick={() => setShowDatePicker(false)} />
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-full max-w-[280px] sm:max-w-[300px]">
                    <div className="z-50 relative">
                      <DateRangePicker
                        initialStartDate={activeTrip.startDate}
                        initialEndDate={activeTrip.endDate}
                        onApply={(start, end) => {
                          checkDateShortening(start, end);
                          setShowDatePicker(false);
                        }}
                        onClose={() => setShowDatePicker(false)}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 4. Travellers Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsTravelersCollapsed(!isTravelersCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Travelers</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isTravelersCollapsed && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                {(activeTrip.travelers || []).length} traveler{(activeTrip.travelers || []).length === 1 ? '' : 's'}
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Travelers"
            >
              {isTravelersCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isTravelersCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">Add or manage travellers sharing this adventure. Balances are recalculated accordingly.</p>

            {companionError && (
              <div className="text-[10px] bg-rose-50 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 p-2.5 rounded-xl font-bold border border-rose-100 dark:border-rose-900/30">
                ⚠️ {companionError}
              </div>
            )}

            <form onSubmit={handleAddTraveler} className="flex gap-2">
              <input
                type="text"
                required
                disabled={isReadOnly}
                placeholder={isReadOnly ? "Read-Only Mode" : "Companion Name (e.g., Emily)"}
                value={newTravelerName}
                onChange={e => setNewTravelerName(e.target.value)}
                className="flex-1 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isReadOnly}
                className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 justify-start max-h-36 overflow-y-auto pr-1">
              {(activeTrip.travelers || []).map(name => (
                <span
                  key={name}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-800"
                >
                  <span>{name}</span>
                  <button
                    type="button"
                    onClick={() => !isReadOnly && handleDeleteTraveler(name)}
                    disabled={isReadOnly}
                    className="text-slate-400 dark:text-slate-500 hover:text-rose-600 font-extrabold pl-1.5 transition text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={`Remove ${name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 5. Trip Budget Limit Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsBudgetCollapsed(!isBudgetCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Coins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Trip Budget Limit</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isBudgetCollapsed && (
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                {activeTrip.baseCurrency || 'USD'} {budgetValue || '0'}
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Trip Budget Limit"
            >
              {isBudgetCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isBudgetCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">Specify your total budget. Exceeding this will show warnings in dashboards.</p>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Limit Boundary ({activeTrip.baseCurrency || 'USD'})</label>
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 dark:text-slate-500 font-mono text-sm font-bold">{activeTrip.baseCurrency || 'USD'}</span>
                <input
                  type="number"
                  value={budgetValue}
                  onChange={handleBudgetLimitChange}
                  disabled={isReadOnly}
                  className="block w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-mono shadow-sm disabled:opacity-50"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* 6. Currency & Forex Settings Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsCurrencyCollapsed(!isCurrencyCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Globe className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Currency & Forex Settings</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isCurrencyCollapsed && (
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                Base: {activeTrip.baseCurrency || 'USD'}
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Currency Settings"
            >
              {isCurrencyCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isCurrencyCollapsed && (
          <>
            {/* Base Currency Selection */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Quote Currency</label>
              <select
                value={activeTrip.baseCurrency || 'USD'}
                onChange={handleBaseCurrencyChange}
                disabled={isReadOnly}
                className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name} ({c.symbol})</option>
                ))}
              </select>
              <p className="text-[9px] text-slate-400 dark:text-slate-500">Changing base currency will recalculate other rates dynamically.</p>
            </div>

            {/* Add Target Currencies - Collapsed by Default */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Required Currencies</label>
                <button
                  type="button"
                  onClick={() => !isReadOnly && setShowCurrenciesList(!showCurrenciesList)}
                  disabled={isReadOnly}
                  className="px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center space-x-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <span>{showCurrenciesList ? 'Hide List' : 'Configure'}</span>
                  {showCurrenciesList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {showCurrenciesList && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-950/40 max-h-44 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150">
                  {CURRENCIES.filter(c => c.code !== (activeTrip.baseCurrency || 'USD')).map(c => {
                    const isSelected = (activeTrip.currencies || []).includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          if (isReadOnly) return;
                          isSelected ? handleRemoveTargetCurrency(c.code) : handleAddTargetCurrency(c.code);
                        }}
                        disabled={isReadOnly}
                        className={`flex flex-col items-start px-2.5 py-1.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-400 font-semibold'
                            : 'bg-white dark:bg-slate-900 border-slate-150 dark:border-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        } disabled:opacity-50`}
                      >
                        <span className="text-[10px] font-bold font-mono">{c.code} ({c.symbol})</span>
                        <span className="text-[8px] text-slate-400 dark:text-slate-500 truncate w-full">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Configured Rates & Live Fetch */}
            {parsedCurrencies.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Forex Multipliers</span>
                  <button
                    onClick={handleFetchRatesLive}
                    disabled={isFetchingRates || isReadOnly}
                    className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-extrabold hover:bg-indigo-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-3 w-3 ${isFetchingRates ? 'animate-spin' : ''}`} />
                    <span>Fetch Live Exchange Rates</span>
                  </button>
                </div>

                {fetchError && (
                  <p className="text-[9px] text-rose-500 font-medium">{fetchError}</p>
                )}

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {parsedCurrencies.map(currency => (
                    <div key={currency} className="flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">1 {activeTrip.baseCurrency || 'USD'} =</span>
                      <div className="flex items-center space-x-2">
                        <input
                          type="number"
                          step="0.000001"
                          required
                          disabled={isReadOnly}
                          value={activeTrip.exchangeRates?.[currency] !== undefined ? activeTrip.exchangeRates[currency] : getOfflineFallbackRate(activeTrip.baseCurrency || 'USD', currency)}
                          onChange={e => handleExchangeRateChange(currency, e.target.value)}
                          className="w-24 text-xs font-bold px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-slate-800 dark:text-slate-100 font-mono text-right disabled:opacity-50"
                        />
                        <span className="text-[10px] text-slate-700 dark:text-slate-300 font-bold w-10">{currency}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 7. Expense Categories Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsExpenseCategoriesCollapsed(!isExpenseCategoriesCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Expense Categories</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isExpenseCategoriesCollapsed && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                {(activeTrip.categories || ['Food', 'Transport', 'Lodging', 'Activities', 'Other']).length} categories
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Expense Categories"
            >
              {isExpenseCategoriesCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isExpenseCategoriesCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">Manage categories to tag your transactions. </p>

            {categoryError && (
              <div className="text-[10px] bg-rose-50 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 p-2.5 rounded-xl font-bold border border-rose-100 dark:border-rose-900/30">
                ⚠️ {categoryError}
              </div>
            )}

            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input
                type="text"
                required
                disabled={isReadOnly}
                placeholder={isReadOnly ? "Read-Only Mode" : "Category Name (e.g., Souvenirs)"}
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                className="flex-1 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isReadOnly}
                className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 justify-start max-h-36 overflow-y-auto pr-1">
              {(activeTrip.categories || ['Food', 'Transport', 'Lodging', 'Activities', 'Other']).map(cat => (
                <span
                  key={cat}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200/80 dark:border-slate-800"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => !isReadOnly && handleDeleteCategory(cat)}
                    disabled={isReadOnly}
                    className="text-slate-400 dark:text-slate-500 hover:text-rose-600 font-extrabold pl-1.5 transition text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={`Delete category ${cat}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 8. Payment Categories Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsPaymentCategoriesCollapsed(!isPaymentCategoriesCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Wallet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Payment Categories</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isPaymentCategoriesCollapsed && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400">
                {(activeTrip.paymentTypes || ['Cash', 'Credit Card']).length} types
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Payment Categories"
            >
              {isPaymentCategoriesCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isPaymentCategoriesCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">Add payment categories (credit cards, cash accounts, online wallets etc.).</p>

            {paymentError && (
              <div className="text-[10px] bg-rose-50 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 p-2.5 rounded-xl font-bold border border-rose-100 dark:border-rose-900/30">
                ⚠️ {paymentError}
              </div>
            )}

            <form onSubmit={handleAddPaymentType} className="flex gap-2">
              <input
                type="text"
                required
                disabled={isReadOnly}
                placeholder={isReadOnly ? "Read-Only Mode" : "Payment channel (e.g. Sapphire Preferred)"}
                value={newPaymentTypeName}
                onChange={e => setNewPaymentTypeName(e.target.value)}
                className="flex-1 text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isReadOnly}
                className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="flex flex-wrap gap-1.5 justify-start max-h-36 overflow-y-auto pr-1">
              {(activeTrip.paymentTypes || ['Cash', 'Credit Card']).map(pt => (
                <span
                  key={pt}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200/80 dark:border-slate-800"
                >
                  <span>{pt}</span>
                  <button
                    type="button"
                    onClick={() => !isReadOnly && handleDeletePaymentType(pt)}
                    disabled={isReadOnly}
                    className="text-slate-400 dark:text-slate-500 hover:text-rose-600 font-extrabold pl-1.5 transition text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title={`Delete payment method ${pt}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 10. Daily Hotel Start & End Schedule Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsHotelScheduleCollapsed(!isHotelScheduleCollapsed)}
        >
          <h3 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <span>Daily Hotel Start & End Schedule</span>
          </h3>
          <div className="flex items-center space-x-2">
            {isHotelScheduleCollapsed && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                hotelStopsEnabled 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {hotelStopsEnabled ? `Enabled (${hotelStartTimeInput} - ${hotelEndTimeInput})` : 'Disabled'}
              </span>
            )}
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle Daily Hotel Schedule"
            >
              {isHotelScheduleCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isHotelScheduleCollapsed && (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatically add "Start at Hotel" and "End at Hotel" entries to your daily itinerary timeline based on your active stay/hotel accommodation for each day.
            </p>

            <div className="pt-2 space-y-4">
              <label className="flex items-center space-x-3 cursor-pointer p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl hover:bg-slate-100/60 dark:hover:bg-slate-900 transition">
                <input
                  type="checkbox"
                  checked={hotelStopsEnabled}
                  onChange={(e) => handleToggleHotelStops(e.target.checked)}
                  disabled={isReadOnly}
                  className={`h-4.5 w-4.5 rounded border-slate-300 dark:border-slate-800 ${getThemeCheckboxClass()}`}
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Start & End at Hotel Daily
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                    Creates 2 timeline entries per day matching your hotel/stay location for that period.
                  </span>
                </div>
              </label>

              {hotelStopsEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">
                      Daily Hotel Start Time
                    </label>
                    <input
                      type="time"
                      value={hotelStartTimeInput}
                      onChange={(e) => setHotelStartTimeInput(e.target.value)}
                      onBlur={(e) => handleApplyHotelStopsTimes(e.target.value, hotelEndTimeInput)}
                      disabled={isReadOnly}
                      className="block w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">
                      Daily Hotel End Time
                    </label>
                    <input
                      type="time"
                      value={hotelEndTimeInput}
                      onChange={(e) => setHotelEndTimeInput(e.target.value)}
                      onBlur={(e) => handleApplyHotelStopsTimes(hotelStartTimeInput, e.target.value)}
                      disabled={isReadOnly}
                      className="block w-full text-xs font-bold px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 11. Export Expenses Sheet (CSV) Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer select-none"
          onClick={() => setIsCsvExportCollapsed(!isCsvExportCollapsed)}
        >
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">Spreadsheet & Accounting</span>
            <h3 className="font-sans text-xl font-black text-slate-800 dark:text-white flex items-center space-x-2">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              <span>Export Expenses Sheet (CSV)</span>
            </h3>
          </div>
          <div className="flex items-center space-x-2 self-end sm:self-center">
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle CSV Export Section"
            >
              {isCsvExportCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isCsvExportCollapsed && (
          <div className="pt-1 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export all logged transactions, categories, payer splits, currencies, exchange rates, and tagged stops into a standardized CSV spreadsheet.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                    {(activeTrip?.expenses || []).length} {((activeTrip?.expenses || []).length === 1) ? 'Transaction' : 'Transactions'}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    Total: {((activeTrip?.expenses || [])
                      .filter(e => e.type !== 'forex' && e.type !== 'peer_transfer' && e.category !== 'Forex Conversion' && e.category !== 'Peer Transfer')
                      .reduce((sum, e) => sum + (e.amount || 0), 0))
                      .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeTrip?.baseCurrency || 'USD'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportCSV();
                }}
                className={`px-6 py-3 rounded-2xl font-bold text-xs transition shadow-md flex items-center justify-center space-x-2 cursor-pointer self-start md:self-center shrink-0 ${
                  csvExportSuccess
                    ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10'
                }`}
              >
                {csvExportSuccess ? (
                  <>
                    <Check className="h-4.5 w-4.5" />
                    <span>CSV Downloaded!</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4.5 w-4.5" />
                    <span>Export Expenses (CSV)</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80">
                <strong className="block text-slate-700 dark:text-slate-200 font-semibold mb-0.5">Compatible with Apps</strong>
                Opens natively in Excel, Google Sheets, Apple Numbers & Notion.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80">
                <strong className="block text-slate-700 dark:text-slate-200 font-semibold mb-0.5">Includes Currency Rates</strong>
                Preserves original spend currency, conversion rate, and base amount.
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80">
                <strong className="block text-slate-700 dark:text-slate-200 font-semibold mb-0.5">Detailed Splits</strong>
                Full traveler split breakdowns, peer transfers, and forex conversions.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 12. PDF Workbook Export Card (Collapsible) */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 w-full text-left">
        <div 
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer select-none"
          onClick={() => setIsPdfExportCollapsed(!isPdfExportCollapsed)}
        >
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">Document Package Center</span>
            <h3 className="font-sans text-xl font-black text-slate-800 dark:text-white flex items-center space-x-2">
              <FileText className="h-6 w-6 text-rose-600 dark:text-rose-400" />
              <span>Export Trip Workbook (PDF)</span>
            </h3>
          </div>
          <div className="flex items-center space-x-2 self-end sm:self-center">
            <button 
              type="button" 
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Toggle PDF Export Section"
            >
              {isPdfExportCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {!isPdfExportCollapsed && (
          <>
            {/* Vector PDF Export */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 pt-1">
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Export your entire travel itinerary, expense ledger, and budget analytics into a portable PDF report.
                </p>
              </div>
              <button
                type="button"
                disabled={isCompilingDataPdf}
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportDataPDF();
                }}
                className={`px-6 py-3 rounded-2xl font-bold text-xs transition shadow-md flex items-center justify-center space-x-2 cursor-pointer self-start md:self-center shrink-0 ${
                  isCompilingDataPdf
                    ? 'bg-indigo-400 dark:bg-indigo-950 text-indigo-100 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/10'
                }`}
              >
                {isCompilingDataPdf ? (
                  <>
                    <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4.5 w-4.5" />
                    <span>Generate PDF</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Modules to Package</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center space-x-3 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition">
                  <input
                    type="checkbox"
                    checked={exportIncludePlanner}
                    onChange={e => setExportIncludePlanner(e.target.checked)}
                    className={`rounded-md border-slate-300 dark:border-slate-800 ${getThemeCheckboxClass()} h-4.5 w-4.5`}
                  />
                  <span>Itinerary Timeline</span>
                </label>

                <label className="flex items-center space-x-3 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition">
                  <input
                    type="checkbox"
                    checked={exportIncludeExpenses}
                    onChange={e => setExportIncludeExpenses(e.target.checked)}
                    className={`rounded-md border-slate-300 dark:border-slate-800 ${getThemeCheckboxClass()} h-4.5 w-4.5`}
                  />
                  <span>Expense Ledger Logs</span>
                </label>

                <label className="flex items-center space-x-3 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition">
                  <input
                    type="checkbox"
                    checked={exportIncludeBudget}
                    onChange={e => setExportIncludeBudget(e.target.checked)}
                    className={`rounded-md border-slate-300 dark:border-slate-800 ${getThemeCheckboxClass()} h-4.5 w-4.5`}
                  />
                  <span>Budget Analytics Index</span>
                </label>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Shorten Dates Warning Modal */}
      {showShortenWarning && pendingDates && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-left space-y-4 animate-in zoom-in-95 duration-150">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center border border-amber-200 dark:border-amber-900/50">
              <Info className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Shorten Trip Duration?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                You are about to shorten your trip dates to <strong className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">{pendingDates.start}   ➜   {pendingDates.end}</strong>.
              </p>
            </div>
            
            {(shortenedItemsCount.stops > 0 || shortenedItemsCount.expenses > 0) ? (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-2xl space-y-2 text-xs">
                <p className="font-semibold text-rose-700 dark:text-rose-400">
                  This modification falls outside existing plan dates:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-rose-600 dark:text-rose-400 font-semibold font-mono text-[10px]">
                  {shortenedItemsCount.stops > 0 && (
                    <li>{shortenedItemsCount.stops} travel stops / timeline places will be deleted.</li>
                  )}
                  {shortenedItemsCount.expenses > 0 && (
                    <li>{shortenedItemsCount.expenses} expense records will be safely retained and moved to "Before Trip" / "After Trip" groups.</li>
                  )}
                </ul>
                <p className="text-[10px] text-rose-500 font-normal leading-normal">
                  Note: Travel stop deletions are permanent, but your financial history and expenses will be fully preserved.
                </p>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded-2xl text-xs text-slate-500 leading-normal">
                No active plan items currently fall on the pruned dates, so no records will be affected.
              </div>
            )}
            
            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowShortenWarning(false);
                  setPendingDates(null);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-950 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyNewDates(pendingDates.start, pendingDates.end)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Yes, Shorten
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
