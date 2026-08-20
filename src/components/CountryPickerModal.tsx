import React, { useState, useMemo, useEffect } from 'react';
import { Globe, Search, X, Check } from 'lucide-react';
import { StaticCurrency } from '../data/staticCurrencies';

interface CountryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedCountries: string;
  currenciesList: StaticCurrency[];
  onConfirm: (selectedCountries: string[]) => void;
}

export default function CountryPickerModal({
  isOpen,
  onClose,
  initialSelectedCountries,
  currenciesList,
  onConfirm,
}: CountryPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegionTab, setSelectedRegionTab] = useState<string>('ALL');

  // Parse initial selected countries from the comma-separated string
  const initialSelectedList = useMemo(() => {
    return initialSelectedCountries
      ? initialSelectedCountries.split(',').map(c => c.trim()).filter(Boolean)
      : [];
  }, [initialSelectedCountries, isOpen]);

  const [tempSelected, setTempSelected] = useState<string[]>(initialSelectedList);

  // Extract unique regions list for top filter bar
  const regionList = useMemo(() => {
    const regions = new Set<string>();
    currenciesList.forEach(c => {
      if (c.region) regions.add(c.region);
    });
    return Array.from(regions).sort((a, b) => a.localeCompare(b));
  }, [currenciesList]);

  // Sync selection when modal reopens & reset filters
  useEffect(() => {
    if (isOpen) {
      setTempSelected(initialSelectedList);
      setSearchQuery('');
      setSelectedRegionTab('ALL');
    }
  }, [isOpen, initialSelectedCountries]);

  // Extract unique countries
  const uniqueCountries = useMemo(() => {
    const map = new Map<string, StaticCurrency>();
    currenciesList.forEach(c => {
      if (!map.has(c.countryName)) {
        map.set(c.countryName, c);
      }
    });
    return Array.from(map.values());
  }, [currenciesList]);

  // Filter and sort countries alphabetically ascending (A-Z)
  const filteredCountries = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return uniqueCountries
      .filter(c => {
        if (selectedRegionTab !== 'ALL' && c.region !== selectedRegionTab) {
          return false;
        }
        if (query) {
          const matchName = c.countryName.toLowerCase().includes(query);
          const matchRegion = c.region && c.region.toLowerCase().includes(query);
          const matchCurrency = c.currencyCode.toLowerCase().includes(query);
          return matchName || matchRegion || matchCurrency;
        }
        return true;
      })
      .sort((a, b) => a.countryName.localeCompare(b.countryName));
  }, [uniqueCountries, selectedRegionTab, searchQuery]);

  if (!isOpen) return null;

  const handleToggleCountry = (countryName: string) => {
    if (tempSelected.includes(countryName)) {
      setTempSelected(tempSelected.filter(c => c !== countryName));
    } else {
      setTempSelected([...tempSelected, countryName]);
    }
  };

  const handleClearAll = () => {
    setTempSelected([]);
  };

  const handleResetFilters = () => {
    setSelectedRegionTab('ALL');
    setSearchQuery('');
  };

  const handleConfirm = () => {
    onConfirm(tempSelected);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 animate-in fade-in duration-150" 
        onClick={onClose} 
      />
      
      {/* Centered Popup Card - Fully Bounded & Screen Safe */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-1rem)] sm:w-full max-w-2xl md:max-w-3xl lg:max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[85dvh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Compact Header */}
        <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-950/50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Globe className="h-4 w-4 text-indigo-500 shrink-0" />
            <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Select Destination Countries
            </h4>
            {tempSelected.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                {tempSelected.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Continent Filter Bar */}
        <div className="p-2.5 sm:px-4 sm:py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/60 space-y-2 shrink-0">
          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search country name, continent, or currency (e.g. France, Asia, EUR)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-12 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition cursor-pointer"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Continent Filter Tabs */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pt-0.5">
            <div className="flex items-center space-x-1 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedRegionTab('ALL')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition shrink-0 cursor-pointer ${
                  selectedRegionTab === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All ({uniqueCountries.length})
              </button>

              {regionList.map(region => {
                const count = uniqueCountries.filter(c => c.region === region).length;
                const isSelected = selectedRegionTab === region;
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => setSelectedRegionTab(region)}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg transition shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {region} ({count})
                  </button>
                );
              })}
            </div>

            {(selectedRegionTab !== 'ALL' || searchQuery !== '') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 px-1 cursor-pointer whitespace-nowrap"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* Selection Pane - 2 Columns (Mobile) up to 4 Columns (Desktop) sorted A-Z */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 min-h-0">
          {filteredCountries.length === 0 ? (
            <div className="text-center py-10">
              <Globe className="h-8 w-8 text-slate-300 dark:text-slate-700 mx-auto mb-2 stroke-1" />
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                No countries match your search or filter.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Show all countries
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-2">
              {filteredCountries.map(c => {
                const isSelected = tempSelected.includes(c.countryName);
                return (
                  <button
                    key={c.id || c.countryName}
                    type="button"
                    onClick={() => handleToggleCountry(c.countryName)}
                    className={`flex items-center justify-between py-2 px-2.5 rounded-xl text-left transition-all duration-100 cursor-pointer select-none border ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500/80 text-indigo-900 dark:text-indigo-200 font-semibold shadow-2xs ring-1 ring-indigo-500/30'
                        : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <span className="text-lg shrink-0 leading-none" role="img" aria-label={c.countryName}>
                        {c.flagEmoji || '🌍'}
                      </span>
                      <span className="text-xs truncate font-medium leading-tight">
                        {c.countryName}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-1 ml-1.5 shrink-0">
                      {isSelected ? (
                        <div className="h-4 w-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </div>
                      ) : (
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono font-bold tracking-wider opacity-60">
                          {c.currencyCode}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-950/50 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
              {tempSelected.length} {tempSelected.length === 1 ? 'country' : 'countries'} selected
            </span>
            {tempSelected.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 underline transition cursor-pointer shrink-0"
              >
                Clear Selection
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-2xs hover:shadow-xs cursor-pointer"
            >
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


