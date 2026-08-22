import React, { useState, useEffect } from 'react';
import { Compass, Map, Calendar, DollarSign, CheckSquare, BarChart2, Settings, Home, Sparkles } from 'lucide-react';
import { User } from 'firebase/auth';
import { ViadiaLogo, ViadiaWordmark } from './BrandComponents';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: User | null;
  syncStatus: 'synced' | 'syncing' | 'local' | 'error';
  onOpenSettings: () => void;
  appMode?: 'splash' | 'google-sync' | 'joined-trip';
  joinedTripCode?: string | null;
  onExitJoinedTrip?: () => void;
  activeTripId: string | null;
  onExitTrip: () => void;
  scrollY?: number;
}

export default function Navbar({
  currentTab,
  setCurrentTab,
  user,
  syncStatus,
  onOpenSettings,
  appMode,
  joinedTripCode,
  onExitJoinedTrip,
  activeTripId,
  onExitTrip,
  scrollY,
}: NavbarProps) {
  const [internalScrollY, setInternalScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && typeof target.scrollTop === 'number') {
        setInternalScrollY(target.scrollTop);
      } else {
        setInternalScrollY(window.scrollY || 0);
      }
    };

    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  const activeScrollY = scrollY !== undefined ? scrollY : internalScrollY;
  const isScrolled = activeScrollY > 20;

  if (activeTripId === null) {
    return null;
  }

  const tabs = [
    { id: 'summary', label: 'Summary', icon: Sparkles },
    { id: 'planner', label: 'Itinerary', icon: Calendar },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'checklist', label: 'Lists', icon: CheckSquare },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* FLOATING BOTTOM NAVIGATION BAR */}
      <motion.div 
        initial={false}
        animate={{
          width: isScrolled ? '75%' : '88%',
          maxWidth: isScrolled ? '250px' : '490px',
          height: isScrolled ? '44px' : '58px',
        }}
        transition={{
          type: 'spring',
          stiffness: 450,
          damping: 32,
        }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/80 dark:bg-neutral-800/80 backdrop-blur-md rounded-full border border-slate-200/80 dark:border-neutral-700/80 shadow-[0_12px_36px_rgba(0,0,0,0.14)] px-2.5 flex items-center justify-around"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              id={`nav-tab-${tab.id}`}
              onClick={() => setCurrentTab(tab.id)}
              whileTap={{ scale: 0.92 }}
              animate={{
                width: isScrolled ? '42px' : '76px',
                height: isScrolled ? '36px' : '46px',
              }}
              transition={{
                type: 'spring',
                stiffness: 450,
                damping: 32,
              }}
              className={`flex flex-col items-center justify-center rounded-full transition-all relative cursor-pointer select-none ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400 font-extrabold opacity-100'
                  : 'text-slate-500 dark:text-[#AAAAAA] opacity-70 hover:opacity-100 hover:text-slate-800 dark:hover:text-white font-medium'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabPill"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                  className="absolute -inset-0.5 bg-slate-50 dark:bg-neutral-700 rounded-full"
                />
              )}

              <Icon className={`h-4.5 w-4.5 z-10 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
              
              <AnimatePresence initial={false}>
                {!isScrolled && (
                  <motion.span
                    initial={{ opacity: 0, height: 0, y: -2 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ 
                      opacity: 0, 
                      height: 0, 
                      y: 2,
                      transition: { duration: 0.1, ease: 'easeOut' }
                    }}
                    transition={{ duration: 0.15, ease: 'easeInOut' }}
                    className="text-[10px] tracking-tight uppercase leading-none font-sans font-bold mt-1 z-10 block overflow-hidden whitespace-nowrap"
                  >
                    {tab.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </motion.div>
    </>
  );
}
