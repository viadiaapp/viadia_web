import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBackButton } from '../lib/backButtonHandler';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: string;
}

interface SelectionBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: SelectOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  searchPlaceholder?: string;
  enableSearch?: boolean;
}

export const SelectionBottomSheet: React.FC<SelectionBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  options,
  selectedValue,
  onSelect,
  searchPlaceholder = 'Search options...',
  enableSearch = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  useBackButton('custom-selection-bottom-sheet', isOpen, onClose, 220);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
    }
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999999] flex items-end justify-center pointer-events-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Modal Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 rounded-t-[32px] shadow-2xl flex flex-col max-h-[80vh] overflow-hidden text-left"
          >
            {/* Drag Handle */}
            <div className="w-full flex items-center justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header */}
            <div className="px-5 sm:px-6 pt-2 pb-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input */}
            {(enableSearch || options.length > 7) && (
              <div className="p-4 sm:p-5 pb-2 shrink-0">
                <div className="relative flex items-center bg-slate-100 dark:bg-slate-950/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-3.5 py-2 focus-within:border-indigo-500 transition shadow-inner">
                  <Search className="h-4 w-4 text-slate-400 shrink-0 mr-2" />
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
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
            )}

            {/* Options List */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3 pb-8 space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/40">
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                  No options matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = selectedValue === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onSelect(opt.value);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        {opt.icon && (
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {opt.icon}
                          </div>
                        )}

                        <div className="min-w-0">
                          <span className="font-extrabold text-xs sm:text-sm tracking-tight block truncate">
                            {opt.label}
                          </span>
                          {opt.sublabel && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 block truncate mt-0.5">
                              {opt.sublabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {opt.badge && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold uppercase">
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <div className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
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