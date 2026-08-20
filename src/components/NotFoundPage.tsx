import React from 'react';
import { motion } from 'motion/react';
import { Compass, Home, MapPin, ArrowLeft, Globe } from 'lucide-react';
import { ViadiaLogo } from './BrandComponents';

interface NotFoundPageProps {
  onGoHome: () => void;
  theme?: 'light' | 'dark';
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onGoHome, theme = 'light' }) => {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-6 relative overflow-hidden transition-colors duration-300">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-teal-500/10 via-indigo-500/5 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Logo */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10 pt-2">
        <div className="flex items-center space-x-2 cursor-pointer" onClick={onGoHome}>
          <ViadiaLogo className="h-8 sm:h-9 w-auto" />
        </div>
      </header>

      {/* Main 404 Visual Content */}
      <main className="flex-1 flex flex-col items-center justify-center text-center max-w-lg z-10 my-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative mb-6"
        >
          <div className="relative flex items-center justify-center">
            {/* 404 Large Display */}
            <span className="text-8xl sm:text-9xl font-black tracking-tighter text-slate-200 dark:text-slate-800 select-none">
              404
            </span>
            
            {/* Floating Floating Compass */}
            <motion.div
              animate={{ rotate: [0, 15, -15, 0], y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
              className="absolute p-4 rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-200 dark:border-slate-800 text-teal-600 dark:text-teal-400"
            >
              <Compass className="w-12 h-12 stroke-[1.75]" />
            </motion.div>
          </div>
        </motion.div>

        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-3"
        >
          Lost on the Map?
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed mb-8 max-w-sm"
        >
          The page or trip link you're looking for doesn't exist, may have been moved, or the link has expired.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs"
        >
          <button
            id="not-found-home-btn"
            onClick={onGoHome}
            className="w-full inline-flex items-center justify-center space-x-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            <span>Return to Viadia Home</span>
          </button>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-4xl text-center text-xs text-slate-400 dark:text-slate-600 py-4 z-10 border-t border-slate-200/60 dark:border-slate-800/60">
        <p>© {new Date().getFullYear()} Viadia. Plan. Track. Share. Every Trip.</p>
      </footer>
    </div>
  );
};
export default NotFoundPage;
