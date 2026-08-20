import React, { useState, useEffect, useRef } from 'react';
import { Plane, Train, MapPin, Loader2, Search } from 'lucide-react';
import { SUGGESTED_LOCATIONS, SuggestedLocation } from '../data/suggestedLocations';
import { searchLocationsOnline } from '../lib/apiUtils';

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  filterType?: 'airport' | 'all';
  required?: boolean;
  className?: string;
  disabled?: boolean;
  id?: string;
}

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  value,
  onChange,
  placeholder = "Enter location name...",
  filterType = 'all',
  required = false,
  className = "",
  disabled = false,
  id
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<SuggestedLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // For flight/airport mode: filter local dataset instantly
  const filterAirportsLocal = (searchTerm: string) => {
    const clean = searchTerm.trim().toLowerCase();
    const localMatches = SUGGESTED_LOCATIONS.filter(item => {
      if (item.type !== 'airport') return false;
      return (
        item.name.toLowerCase().includes(clean) ||
        (item.code && item.code.toLowerCase().includes(clean))
      );
    }).sort((a, b) => {
      if (a.code.toLowerCase() === clean) return -1;
      if (b.code.toLowerCase() === clean) return 1;
      return 0;
    });

    setSuggestions(localMatches.slice(0, 8));
    setIsOpen(localMatches.length > 0);
  };

  // Perform remote place search on demand (when Search button is clicked or Enter key pressed)
  const executeSearch = async (searchTerm: string) => {
    const clean = searchTerm.trim();
    if (!clean) return;

    setIsLoading(true);
    setHasSearched(true);
    setIsOpen(true);

    // Filter local airport/station suggestions matching search term
    const localMatches = SUGGESTED_LOCATIONS.filter(item =>
      item.name.toLowerCase().includes(clean.toLowerCase()) ||
      (item.code && item.code.toLowerCase().includes(clean.toLowerCase()))
    );

    try {
      const osmData = await searchLocationsOnline(clean, 6);
      if (osmData && osmData.length > 0) {
        const formattedOsm: SuggestedLocation[] = osmData.map((d) => ({
          name: d.display_name,
          code: '',
          type: 'osm' as const,
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
        }));

        const combined = [...localMatches.slice(0, 3), ...formattedOsm];
        setSuggestions(combined);
      } else {
        setSuggestions(localMatches.slice(0, 8));
      }
    } catch (err) {
      setSuggestions(localMatches.slice(0, 8));
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setHasSearched(false);

    if (filterType === 'airport') {
      if (val.trim().length > 0) {
        filterAirportsLocal(val);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    } else {
      // Non-airport: DO NOT search automatically as typed. Close dropdown if user changes text.
      setIsOpen(false);
    }
  };

  const handleFocus = () => {
    if (filterType === 'airport') {
      filterAirportsLocal(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filterType === 'airport') {
        filterAirportsLocal(query);
      } else {
        executeSearch(query);
      }
    }
  };

  const handleSearchClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (filterType === 'airport') {
      filterAirportsLocal(query);
    } else {
      executeSearch(query);
    }
  };

  const handleSelect = (item: SuggestedLocation) => {
    const selectedName = (item.type === 'osm' || item.name.includes(','))
      ? item.name.split(',')[0].trim()
      : item.name;
    setQuery(selectedName);
    onChange(selectedName, item.lat, item.lng);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          id={id}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className={`${className || "w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none font-medium text-slate-800 dark:text-slate-100 focus:border-indigo-500"} ${filterType !== 'airport' ? 'pr-20' : 'pr-9'}`}
        />

        <div className="absolute right-1.5 flex items-center space-x-1">
          {isLoading ? (
            <div className="px-2 py-1 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : filterType !== 'airport' ? (
            <button
              type="button"
              onClick={handleSearchClick}
              disabled={disabled || !query.trim()}
              className="px-2.5 py-1 text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 text-white rounded-lg transition flex items-center space-x-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
              title="Search place name"
            >
              <Search className="h-3 w-3 stroke-[2.5]" />
              <span>Search</span>
            </button>
          ) : (
            <div className="p-1.5 text-slate-400">
              <Plane className="h-3.5 w-3.5 text-indigo-500" />
            </div>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100">
          {suggestions.length > 0 ? (
            suggestions.map((item, idx) => (
              <button
                key={`${item.name}-${idx}`}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  {item.type === 'airport' && <Plane className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                  {item.type === 'station' && <Train className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                  {item.type === 'osm' && <MapPin className="h-3.5 w-3.5 text-indigo-500 shrink-0" />}
                  
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {item.name}
                    </p>
                  </div>
                </div>

                {item.code && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded shrink-0">
                    {item.code}
                  </span>
                )}
              </button>
            ))
          ) : hasSearched ? (
            <div className="p-3 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                No matching places found for "<span className="font-bold text-slate-700 dark:text-slate-200">{query}</span>"
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                Try a different search term or keep custom input.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

