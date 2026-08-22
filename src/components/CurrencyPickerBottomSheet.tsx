import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBackButton } from '../lib/backButtonHandler';
import { staticCurrenciesSeed } from '../data/staticCurrencies';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  flag?: string;
}

interface CurrencyPickerBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currencies?: CurrencyOption[];
  selectedCurrency: string;
  onSelectCurrency: (currencyCode: string) => void;
  title?: string;
  subtitle?: string;
}

// Robust lookup map from currencyCode (e.g., 'USD', 'EUR', 'GBP', 'INR') to flagEmoji from staticCurrenciesSeed
const CURRENCY_FLAG_MAP = new Map<string, string>();

// Prioritize iconic country matches for multi-country currencies (e.g., EUR -> 🇪🇺 or 🇩🇪, USD -> 🇺🇸, GBP -> 🇬🇧, INR -> 🇮🇳)
const PRIORITY_CURRENCY_FLAGS: { [code: string]: string } = {
  USD: '🇺🇸',
  EUR: '🇪🇺',
  GBP: '🇬🇧',
  INR: '🇮🇳',
  AUD: '🇦🇺',
  CAD: '🇨🇦',
  JPY: '🇯🇵',
  CNY: '🇨🇳',
  CHF: '🇨🇭',
  NZD: '🇳🇿',
  SGD: '🇸🇬',
  HKD: '🇭🇰',
  SEK: '🇸🇪',
  KRW: '🇰🇷',
  NOK: '🇳🇴',
  MXN: '🇲🇽',
  BRL: '🇧🇷',
  ZAR: '🇿🇦',
  AED: '🇦🇪',
  THB: '🇹🇭',
};

// Populate map from seed data
staticCurrenciesSeed.forEach((c) => {
  if (c.currencyCode && c.flagEmoji) {
    const code = c.currencyCode.toUpperCase();
    if (!CURRENCY_FLAG_MAP.has(code)) {
      CURRENCY_FLAG_MAP.set(code, c.flagEmoji);
    }
  }
});

// Override with priority primary flags
Object.entries(PRIORITY_CURRENCY_FLAGS).forEach(([code, flag]) => {
  CURRENCY_FLAG_MAP.set(code, flag);
});

// Default list of currencies derived from staticCurrenciesSeed with correct flags
const DEFAULT_CURRENCY_OPTIONS: CurrencyOption[] = (() => {
  const map = new Map<string, CurrencyOption>();
  staticCurrenciesSeed.forEach((c) => {
    const code = c.currencyCode.toUpperCase();
    if (!map.has(code) && code !== 'XXX') {
      map.set(code, {
        code,
        name: c.currencyName,
        symbol: c.currencySymbol,
        flag: CURRENCY_FLAG_MAP.get(code) || c.flagEmoji || '🌐',
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
})();

export const CurrencyPickerBottomSheet: React.FC<CurrencyPickerBottomSheetProps> = ({
  isOpen,
  onClose,
  currencies,
  selectedCurrency,
  onSelectCurrency,
  title = 'Select Base Currency',
  subtitle = "Choose your trip's primary accounting currency",
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  useBackButton('currency-picker-bottom-sheet', isOpen, onClose, 200);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const currencyList = useMemo(() => {
    const baseList = currencies && currencies.length > 0 ? currencies : DEFAULT_CURRENCY_OPTIONS;
    return baseList.map((c) => {
      const upperCode = c.code.toUpperCase();
      return {
        ...c,
        flag: CURRENCY_FLAG_MAP.get(upperCode) || c.flag || '🌐',
      };
    });
  }, [currencies]);

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return currencyList;
    return currencyList.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [currencyList, searchQuery]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center pointer-events-auto">
          {/* Dimmed Scrim Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Modal Bottom Sheet Container */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden text-left"
          >
            {/* Drag Handle Indicator */}
            <div className="w-full flex items-center justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 sm:px-6 pt-2 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <DollarSign className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                    {title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {subtitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-4 sm:p-5 pb-2">
              <div className="relative flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-3.5 py-2.5 focus-within:border-indigo-500 transition shadow-inner">
                <Search className="h-4 w-4 text-slate-400 shrink-0 mr-2" />
                <input
                  type="text"
                  placeholder="Search currency by code or country (e.g. USD, EUR, Yen)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs bg-transparent outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable Currency Selection List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 pb-8 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/40">
              {filteredCurrencies.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">
                  No currencies matching "{searchQuery}"
                </div>
              ) : (
                filteredCurrencies.map((c) => {
                  const isSelected = selectedCurrency.toUpperCase() === c.code.toUpperCase();
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => {
                        onSelectCurrency(c.code);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200/80 dark:border-indigo-800/60'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        {/* First Column: Correct Flag Emoji */}
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-indigo-600/10 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-700'
                              : 'bg-slate-150 dark:bg-slate-800'
                          }`}
                        >
                          <span>{c.flag}</span>
                        </div>

                        {/* Currency Code & Name */}
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-xs sm:text-sm font-mono tracking-tight">
                              {c.code}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({c.symbol})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {c.name}
                          </p>
                        </div>
                      </div>

                      {/* Selection Check Indicator */}
                      {isSelected && (
                        <div className="h-6 w-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};