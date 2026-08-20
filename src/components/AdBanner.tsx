import React, { useEffect, useState, useRef } from 'react';
import { Sparkles, Zap, X } from 'lucide-react';
import { isSubscriptionActive, subscribeToTierChange, UserTier } from '../lib/userSubscription';
import { ADSENSE_CLIENT_ID, ADSENSE_SLOT_ID } from '../config/appConfig';

interface AdBannerProps {
  type?: 'sticky-bottom' | 'native-feed' | 'sidebar' | 'card';
  onOpenUpgradeModal: () => void;
  className?: string;
  adClient?: string;
  adSlot?: string;
}

export default function AdBanner({
  type = 'native-feed',
  onOpenUpgradeModal,
  className = '',
  adClient = ADSENSE_CLIENT_ID,
  adSlot = ADSENSE_SLOT_ID,
}: AdBannerProps) {
  const [isActivePro, setIsActivePro] = useState<boolean>(isSubscriptionActive());
  const [dismissed, setDismissed] = useState(false);
  const pushedRef = useRef(false);

  useEffect(() => {
    setIsActivePro(isSubscriptionActive());
    const unsub = subscribeToTierChange(() => {
      setIsActivePro(isSubscriptionActive());
    });
    return unsub;
  }, []);

  // Inject Google AdSense script and push ad request for live ads on free/expired tier
  useEffect(() => {
    if (!isActivePro && typeof window !== 'undefined' && !dismissed) {
      const scriptId = 'google-adsense-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }

      if (!pushedRef.current) {
        try {
          ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          pushedRef.current = true;
        } catch (e) {
          console.debug('AdSense init notice:', e);
        }
      }
    }
  }, [isActivePro, adClient, adSlot, dismissed]);

  // Don't render anything if user is active Pro subscriber (between sub_start_date & sub_end_date) or ad is manually dismissed
  if (isActivePro || dismissed) {
    return null;
  }

  // Live Google AdSense Banner
  if (type === 'sticky-bottom') {
    return (
      <div className={`w-full bg-slate-900/95 text-white backdrop-blur-md border-t border-slate-800 px-3 py-2 sm:px-4 shadow-xl text-left ${className}`}>
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="flex items-center justify-between w-full sm:w-auto text-[10px] uppercase font-mono tracking-wider text-slate-400 gap-2">
            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 font-black rounded">
              Live Sponsored Ad
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={onOpenUpgradeModal}
                className="text-indigo-400 font-bold hover:underline cursor-pointer flex items-center space-x-1"
              >
                <Zap className="h-3 w-3 text-amber-400" />
                <span>Remove Ads with Pro Pass</span>
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="p-1 text-slate-400 hover:text-white transition rounded-md hover:bg-slate-800 cursor-pointer"
                title="Close Ad"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="w-full max-w-xl overflow-hidden min-h-[50px] flex items-center justify-center bg-slate-950/60 rounded-xl p-1 border border-slate-800">
            <ins
              className="adsbygoogle"
              style={{ display: 'block', width: '100%', height: '50px' }}
              data-ad-client={adClient}
              data-ad-slot={adSlot}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative p-3.5 bg-slate-50 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden my-4 text-left shadow-xs ${className}`}>
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800 text-[10px] uppercase font-mono tracking-wider text-slate-400">
        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-black rounded-md">
          Live Sponsored Ad
        </span>
        <button
          onClick={onOpenUpgradeModal}
          className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center space-x-1"
        >
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>Remove Ads with Pro</span>
        </button>
      </div>

      <div className="w-full overflow-hidden flex items-center justify-center min-h-[90px] bg-white dark:bg-slate-950 rounded-xl p-2 border border-slate-100 dark:border-slate-850">
        <ins
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', minHeight: '90px' }}
          data-ad-client={adClient}
          data-ad-slot={adSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
}

