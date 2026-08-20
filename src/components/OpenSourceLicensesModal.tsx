import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Code2, X, ExternalLink, Heart, Maximize2 } from 'lucide-react';
import { useBackButton } from '../lib/backButtonHandler';

export interface LicenseItem {
  name: string;
  category: 'Framework & Core' | 'Maps & Geodata' | 'Weather & Services' | 'UI & Styling' | 'AI & Database' | 'Utilities';
  license: string;
  author: string;
  url: string;
  description: string;
  citation: string;
}

export const LICENSES: LicenseItem[] = [
  {
    name: 'React',
    category: 'Framework & Core',
    license: 'MIT License',
    author: 'Meta Platforms, Inc. & React Contributors',
    url: 'https://react.dev',
    description: 'A JavaScript library for building user interfaces with declarative component structure.',
    citation: 'Copyright (c) Meta Platforms, Inc. and affiliates.'
  },
  {
    name: 'Leaflet',
    category: 'Maps & Geodata',
    license: 'BSD 2-Clause License',
    author: 'Vladimir Agafonkin & Leaflet Contributors',
    url: 'https://leafletjs.com',
    description: 'Leading open-source JavaScript library for mobile-friendly interactive maps.',
    citation: 'Copyright (c) Vladimir Agafonkin, CloudMade.'
  },
  {
    name: 'OpenStreetMap Data & Nominatim API',
    category: 'Maps & Geodata',
    license: 'Open Database License (ODbL) v1.0',
    author: 'OpenStreetMap Foundation & Contributors',
    url: 'https://www.openstreetmap.org/copyright',
    description: 'Open spatial map tiles, geocoding services, and global address search database.',
    citation: '© OpenStreetMap contributors. Data available under the Open Database License.'
  },
  {
    name: 'CARTO Basemaps',
    category: 'Maps & Geodata',
    license: 'CC BY 3.0 / OpenStreetMap',
    author: 'CARTO (CartoDB Inc.)',
    url: 'https://carto.com/attributions',
    description: 'High-performance raster basemap tiles (Voyager & Dark Matter styling).',
    citation: '© CARTO, © OpenStreetMap contributors.'
  },
  {
    name: 'Open-Meteo Weather API',
    category: 'Weather & Services',
    license: 'CC BY 4.0 / Non-Commercial Attribution',
    author: 'Open-Meteo.com (ZAMG / DWD data sources)',
    url: 'https://open-meteo.com',
    description: 'Open-source weather forecast API providing real-time temperature, precipitation, and WMO climate codes.',
    citation: 'Weather data provided by Open-Meteo.com under Creative Commons Attribution 4.0.'
  },
  {
    name: 'Lucide Icons',
    category: 'UI & Styling',
    license: 'ISC License',
    author: 'Lucide Contributors & Feather Icons',
    url: 'https://lucide.dev',
    description: 'Beautiful, consistent open-source vector icon set designed for modern web applications.',
    citation: 'Copyright (c) Lucide Contributors.'
  },
  {
    name: 'Motion (Framer Motion)',
    category: 'UI & Styling',
    license: 'MIT License',
    author: 'Framer B.V.',
    url: 'https://motion.dev',
    description: 'Production-ready motion library for React powering fluid gestures and layout animations.',
    citation: 'Copyright (c) Framer B.V.'
  },
  {
    name: 'Tailwind CSS',
    category: 'UI & Styling',
    license: 'MIT License',
    author: 'Tailwind Labs Inc.',
    url: 'https://tailwindcss.com',
    description: 'Utility-first CSS framework for rapid custom user interface development.',
    citation: 'Copyright (c) Tailwind Labs Inc.'
  },
  {
    name: 'Google Gemini SDK (@google/genai)',
    category: 'AI & Database',
    license: 'Apache License 2.0',
    author: 'Google LLC',
    url: 'https://github.com/google-gemini/deprecations',
    description: 'Official TypeScript SDK for Google GenAI services powering AI travel planning.',
    citation: 'Copyright 2025 Google LLC. Licensed under Apache License 2.0.'
  },
  {
    name: 'Firebase Web SDK',
    category: 'AI & Database',
    license: 'Apache License 2.0',
    author: 'Google LLC',
    url: 'https://firebase.google.com',
    description: 'Cloud Firestore real-time database and secure authentication framework.',
    citation: 'Copyright Google LLC. Licensed under Apache License 2.0.'
  },
  {
    name: 'Recharts',
    category: 'UI & Styling',
    license: 'MIT License',
    author: 'Recharts Group',
    url: 'https://recharts.org',
    description: 'Redefined chart library built with React and D3 components for expense analytics.',
    citation: 'Copyright (c) 2015-present Recharts.'
  },
  {
    name: 'jsPDF & jsPDF-AutoTable',
    category: 'Utilities',
    license: 'MIT License',
    author: 'James Hall (MrRio), Simon Tenggren & Contributors',
    url: 'https://github.com/parallax/jsPDF',
    description: 'Client-side HTML and table PDF document generation library for printing itineraries.',
    citation: 'Copyright (c) 2010-2025 James Hall.'
  },
  {
    name: 'Vite & Express.js',
    category: 'Framework & Core',
    license: 'MIT License',
    author: 'Yuxi (Evan) You & Express Contributors',
    url: 'https://vitejs.dev',
    description: 'Next-generation frontend build tooling and robust Node.js web server runtime.',
    citation: 'Copyright (c) 2019-present Yuxi (Evan) You & contributors.'
  }
];

export interface OpenSourceLicensesListProps {
  maxHeightClass?: string;
  onExpandModal?: () => void;
}

export function OpenSourceLicensesList({ maxHeightClass = 'max-h-[420px]', onExpandModal }: OpenSourceLicensesListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Framework & Core', 'Maps & Geodata', 'Weather & Services', 'UI & Styling', 'AI & Database', 'Utilities'];

  const filteredLicenses = LICENSES.filter((item) => {
    return selectedCategory === 'All' || item.category === selectedCategory;
  });

  return (
    <div className="flex flex-col h-full min-h-0 space-y-3 text-left">
      {/* Filter Header - Single Line Scrollable */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-1 pr-1 max-w-full no-scrollbar text-xs font-medium">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {onExpandModal && (
          <button
            type="button"
            onClick={onExpandModal}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer shrink-0 flex items-center space-x-1 text-xs font-bold"
            title="Expand to Full Screen Modal"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Expand</span>
          </button>
        )}
      </div>

      {/* Main Large Scrollable License Cards View Pane */}
      <div className={`overflow-y-auto space-y-3 pr-1.5 ${maxHeightClass} border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/80 p-3 shadow-inner`}>
        {filteredLicenses.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs italic">
            No matching open source licenses found.
          </div>
        ) : (
          filteredLicenses.map((item) => (
            <div
              key={item.name}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/80 space-y-2.5 hover:border-indigo-300 dark:hover:border-indigo-700 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {item.name}
                  </span>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center text-xs font-bold"
                  >
                    <span>Site</span>
                    <ExternalLink className="h-3 w-3 ml-0.5" />
                  </a>
                </div>
                <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black uppercase tracking-wider">
                  {item.license}
                </span>
              </div>

              <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-normal">
                {item.description}
              </p>

              <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1">
                <div className="text-xs text-slate-800 dark:text-slate-200">
                  <span className="font-bold text-slate-900 dark:text-white">Author / Maintainer:</span> {item.author}
                </div>
                <div className="text-[11px] font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/90 p-2 rounded-lg border border-slate-200 dark:border-slate-800 break-words leading-relaxed">
                  <span className="font-sans font-bold text-slate-500 dark:text-slate-400 block mb-0.5 text-[10px] uppercase tracking-wider">Attribution / Copyright</span>
                  {item.citation}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

interface OpenSourceLicensesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OpenSourceLicensesModal({ isOpen, onClose }: OpenSourceLicensesModalProps) {
  useBackButton('open-source-licenses-modal', isOpen, onClose, 100);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left relative flex flex-col h-[88vh] max-h-[88vh] overflow-hidden space-y-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 pr-8 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 border border-indigo-100 dark:border-indigo-900/50">
            <Code2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>Open Source Licenses & Attributions</span>
            </h3>
          </div>
        </div>

        {/* Modal Body with OpenSourceLicensesList */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <OpenSourceLicensesList maxHeightClass="h-full min-h-0" />
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
            <Heart className="h-3.5 w-3.5 text-rose-500 shrink-0" />
            <span>Built with open-source software and open community data.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


