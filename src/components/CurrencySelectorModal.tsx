import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, X, Globe, Coins, Sparkles } from 'lucide-react';
import { staticCurrenciesSeed, StaticCurrency } from '../data/staticCurrencies';
import { useBackButton } from '../lib/backButtonHandler';

export interface CurrencyItem {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  country: string;
}

export const POPULAR_CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'SGD',
  'CHF', 'CNY', 'AED', 'MXN', 'BRL', 'NZD', 'THB', 'KRW',
  'HKD', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR', 'SAR', 'TRY',
  'IDR', 'MYR', 'PHP', 'VND'
];

export function getUniqueCurrenciesList(): CurrencyItem[] {
  const map = new Map<string, CurrencyItem>();

  // Add primary curated mappings
  staticCurrenciesSeed.forEach((item) => {
    if (!item.currencyCode || item.currencyCode === 'XXX') return;
    const code = item.currencyCode.toUpperCase();
    if (!map.has(code)) {
      map.set(code, {
        code,
        name: item.currencyName,
        symbol: item.currencySymbol || code,
        flag: item.flagEmoji || '🌐',
        country: item.countryName,
      });
    }
  });

  // Ensure USD, EUR, GBP have standard flags if needed
  const list = Array.from(map.values());
  return list.sort((a, b) => a.code.localeCompare(b.code));
}

export function getCurrencyInfo(code: string): CurrencyItem {
  const upper = (code || 'USD').toUpperCase().trim();
  const match = staticCurrenciesSeed.find(
    (c) => c.currencyCode.toUpperCase() === upper
  );
  if (match) {
    return {
      code: upper,
      name: match.currencyName,
      symbol: match.currencySymbol || upper,
      flag: match.flagEmoji || '🌐',
      country: match.countryName,
    };
  }
  return {
    code: upper,
    name: upper,
    symbol: upper,
    flag: '🌐',
    country: 'International',
  };
}

interface CurrencySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCurrency: string;
  onSelectCurrency: (currencyCode: string) => void;
  title?: string;
  subtitle?: string;
}

export default function CurrencySelectorModal({
  isOpen,
  onClose,
  selectedCurrency,
  onSelectCurrency,
  title = 'Select Default Currency',
  subtitle = 'Used as the default base currency when creating new trips.',
}: CurrencySelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useBackButton('currency-selector-modal', isOpen, onClose, 120);

  const allCurrencies = useMemo(() => getUniqueCurrenciesList(), []);

  const popularCurrencies = useMemo(() => {
    return POPULAR_CURRENCY_CODES.map((code) => {
      const found = allCurrencies.find((c) => c.code === code);
      return found || getCurrencyInfo(code);
    });
  }, [allCurrencies]);

  const filteredCurrencies = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allCurrencies;
    return allCurrencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [allCurrencies, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentUpper = (selectedCurrency || 'USD').toUpperCase();

  const handleSelect = (code: string) => {
    onSelectCurrency(code.toUpperCase());
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Coins className="w-4.5 h-4.5" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                {title}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by currency code, symbol, or country..."
              className="w-full h-10 pl-10 pr-9 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {/* Popular Currencies (Shown when not actively searching) */}
          {!searchQuery && (
            <div>
              <div className="flex items-center space-x-1.5 mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Popular Currencies</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {popularCurrencies.map((c) => {
                  const isSelected = c.code === currentUpper;
                  return (
                    <button
                      key={`pop-${c.code}`}
                      type="button"
                      onClick={() => handleSelect(c.code)}
                      className={`p-2.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-base shrink-0">{c.flag}</span>
                        <div className="truncate">
                          <span className="text-xs font-black block font-mono">
                            {c.code}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold block truncate">
                            {c.symbol}
                          </span>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* All / Filtered Currencies */}
          <div>
            <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {searchQuery ? `Search Results (${filteredCurrencies.length})` : 'All Currencies'}
            </div>

            {filteredCurrencies.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">No currencies matching "{searchQuery}"</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCurrencies.map((c) => {
                  const isSelected = c.code === currentUpper;
                  return (
                    <button
                      key={`all-${c.code}`}
                      type="button"
                      onClick={() => handleSelect(c.code)}
                      className={`w-full p-2.5 rounded-xl flex items-center justify-between border transition cursor-pointer ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200 font-bold'
                          : 'border-transparent hover:border-slate-200 dark:hover:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <span className="text-lg shrink-0">{c.flag}</span>
                        <div className="text-left truncate">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                              {c.code}
                            </span>
                            <span className="text-xs text-slate-400 font-bold">
                              ({c.symbol})
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                            {c.name} {c.country ? `• ${c.country}` : ''}
                          </span>
                        </div>
                      </div>

                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono font-bold pr-1">
                          {c.symbol}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">
            Currently selected: <strong className="text-indigo-600 dark:text-indigo-400 font-mono">{currentUpper}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
