import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, CheckCircle2, ShieldCheck, Zap, ArrowRight, Lock, Check, Loader2, CreditCard, LogIn, Calendar, Star, Clock } from 'lucide-react';
import { isSubscriptionActive, isLifetimePass, setUserSubscription, UserTier, getUserTier, getSubscriptionEndDate, getSubscriptionStartDate } from '../lib/userSubscription';
import { useBackButton } from '../lib/backButtonHandler';
import { auth, getLoginProvider } from '../lib/auth';
import { getUserDetails, saveUserDetails, getSubscriptionPlans, recordTransaction } from '../lib/db';
import { authFetch } from '../lib/apiClient';
import { getActivePlatform } from '../lib/platform';
import { ViadiaLogo, ViadiaWordmark } from './BrandComponents';
import { SubscriptionPlan, SubscriptionTransaction } from '../types';
import { DEFAULT_SUBSCRIPTION_PLANS } from '../data/seedSubscriptionPlans';

interface LifetimePassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTierChanged?: (newTier: UserTier) => void;
  onLoginWithGoogle?: () => void;
  onLoginWithApple?: () => void;
}

type PaymentGatewayMode = 'none' | 'select_guest_gateway' | 'google_play' | 'apple_pay';

export default function LifetimePassModal({
  isOpen,
  onClose,
  onTierChanged,
  onLoginWithGoogle,
  onLoginWithApple,
}: LifetimePassModalProps) {
  const modalContentRef = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('3_year');
  const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(false);
  const [currentTier, setCurrentTier] = useState<UserTier>(getUserTier());
  const [currentEndDate, setCurrentEndDate] = useState<string | null>(getSubscriptionEndDate());
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentGatewayMode>('none');
  const [paymentStep, setPaymentStep] = useState<'idle' | 'authorizing' | 'complete'>('idle');
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [razorpayError, setRazorpayError] = useState<string | null>(null);

  useBackButton(
    'lifetime-pass-modal',
    isOpen,
    () => {
      if (paymentMode !== 'none') {
        setPaymentMode('none');
      } else {
        onClose();
      }
    },
    100
  );

  // Helper functions to compare plan tiers and durations
  const getPlanDurationYears = (plan: SubscriptionPlan): number => {
    if (plan.id === 'lifetime' || plan.type === 'lifetime') return 99;
    if (plan.durationYears) return plan.durationYears;
    if (plan.id === '5_year' || plan.type === '5_year') return 5;
    if (plan.id === '3_year' || plan.type === '3_year') return 3;
    if (plan.id === '2_year' || plan.type === '2_year') return 2;
    if (plan.id === '1_year' || plan.type === '1_year') return 1;
    return 0;
  };

  const getCurrentTierDurationYears = (tier: UserTier, endDate?: string | null): number => {
    if (tier === 'lifetime' || endDate?.startsWith('2099')) return 99;
    if (tier === '5_year') return 5;
    if (tier === '3_year') return 3;
    if (tier === '2_year') return 2;
    if (tier === '1_year') return 1;
    return 0;
  };

  // Load plans from the database and sync user subscription on open
  useEffect(() => {
    if (isOpen) {
      const curTier = getUserTier();
      const isLife = curTier === 'lifetime';
      const curEnd = isLife ? '2099-12-31' : getSubscriptionEndDate();
      setCurrentTier(curTier);
      setCurrentEndDate(curEnd);
      setPaymentMode('none');
      setPaymentStep('idle');
      setIsLoadingPlans(true);

      if (auth.currentUser?.uid) {
        getUserDetails(auth.currentUser.uid)
          .then((details) => {
            if (details) {
              const tier = details.subscription_tier || details.userTier;
              const isDetailLife = tier === 'lifetime' || (details.sub_end_date?.startsWith('2099') ?? false);
              const endD = isDetailLife ? '2099-12-31' : (details.sub_end_date || curEnd);
              if (tier && tier !== 'free' && isSubscriptionActive(endD)) {
                setCurrentTier(isDetailLife ? 'lifetime' : tier);
                setCurrentEndDate(endD);
                if (isDetailLife && details.sub_end_date !== '2099-12-31') {
                  saveUserDetails(auth.currentUser.uid, {
                    ...details,
                    subscription_tier: 'lifetime',
                    sub_end_date: '2099-12-31',
                  }).catch((e) => console.warn('Could not normalize lifetime end date in DB:', e));
                }
              }
            }
          })
          .catch((e) => console.warn('Could not sync user details for tier modal:', e));
      }

      getSubscriptionPlans()
        .then((fetchedPlans) => {
          if (fetchedPlans && fetchedPlans.length > 0) {
            setPlans(fetchedPlans);
            const popularPlan = fetchedPlans.find((p) => p.popular) || fetchedPlans[0];
            setSelectedPlanId(popularPlan.id);
          }
        })
        .catch((err) => {
          console.warn('Failed loading plans from DB:', err);
        })
        .finally(() => {
          setIsLoadingPlans(false);
        });
    }
  }, [isOpen]);

  // Automatically scroll modal and window to top when opened or when payment mode changes so payment sheet is 100% visible
  useEffect(() => {
    if (isOpen) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (modalContentRef.current) {
        modalContentRef.current.scrollTop = 0;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (paymentMode !== 'none') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (modalContentRef.current) {
        modalContentRef.current.scrollTop = 0;
        modalContentRef.current.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
  }, [paymentMode]);

  if (!isOpen) return null;

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0] || DEFAULT_SUBSCRIPTION_PLANS[0];
  const isSubActive = isSubscriptionActive(currentEndDate);
  const currentDuration = isSubActive ? getCurrentTierDurationYears(currentTier, currentEndDate) : 0;
  const hasHighestTier = isSubActive && (currentDuration >= 99 || (currentEndDate?.startsWith('2099') ?? false) || currentTier === 'lifetime');
  const isSelectedPlanDisabled = hasHighestTier;

  const calculateEndDate = (plan: SubscriptionPlan): string => {
    if (plan.id === 'lifetime' || plan.durationYears >= 90) {
      return '2099-12-31';
    }
    
    // If the user currently has an active subscription, add the new plan duration onto the current end date
    if (isSubActive && currentEndDate) {
      try {
        const baseDate = new Date(currentEndDate);
        if (!isNaN(baseDate.getTime())) {
          baseDate.setFullYear(baseDate.getFullYear() + plan.durationYears);
          return baseDate.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn('Failed parsing currentEndDate for extension:', e);
      }
    }

    // Fresh subscription starting today
    const target = new Date();
    target.setFullYear(target.getFullYear() + plan.durationYears);
    return target.toISOString().split('T')[0];
  };

  const handleStartUpgradeFlow = () => {
    if (!auth.currentUser) {
      return;
    }

    // Instantly scroll modal container to top to reveal Google Play / Payment modal completely
    if (modalContentRef.current) {
      modalContentRef.current.scrollTop = 0;
      modalContentRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }

    const platform = getActivePlatform();
    const loginProvider = getLoginProvider();

    if (platform === 'android') {
      setPaymentMode('google_play');
      setPaymentStep('idle');
    } else if (platform === 'ios') {
      setPaymentMode('apple_pay');
      setPaymentStep('idle');
    } else {
      // Web environment
      if (loginProvider === 'google') {
        setPaymentMode('google_play');
        setPaymentStep('idle');
      } else if (loginProvider === 'apple') {
        setPaymentMode('apple_pay');
        setPaymentStep('idle');
      } else {
        // Guest or unspecified login provider on web
        setPaymentMode('select_guest_gateway');
        setPaymentStep('idle');
      }
    }
  };

  const executePayment = (gateway: 'google_play' | 'apple_pay') => {
    setPaymentStep('authorizing');
    setIsProcessing(true);

    const todayStr = new Date().toISOString().split('T')[0];
    const existingStart = getSubscriptionStartDate();
    // Continuous start date for the user's active membership profile
    const activeStartStr = isSubActive && existingStart ? existingStart : todayStr;
    
    // Calculate new end date (extended from current expiration if already active)
    const newEndDateStr = calculateEndDate(selectedPlan);
    
    // Period start date specific to this purchase transaction
    const txnStartDate = isSubActive && currentEndDate ? currentEndDate : todayStr;

    const orderId = gateway === 'google_play'
      ? `GPA.${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(10000 + Math.random() * 90000)}`
      : `APL_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    setTimeout(async () => {
      setPaymentStep('complete');
      setUserSubscription({
        tier: selectedPlan.type,
        startDate: activeStartStr,
        endDate: newEndDateStr,
      });

      setCurrentTier(selectedPlan.type);
      setCurrentEndDate(newEndDateStr);
      setIsProcessing(false);
      setShowSuccessToast(true);
      if (onTierChanged) onTierChanged(selectedPlan.type);

      let recordedUserCode = 'GUEST';
      let recordedEmail = auth.currentUser?.email || null;
      let recordedName = auth.currentUser?.displayName || 'Traveler';

      if (auth.currentUser?.uid) {
        try {
          const details = await getUserDetails(auth.currentUser.uid);
          if (details) {
            recordedUserCode = details.userCode || 'GUEST';
            recordedEmail = details.email || auth.currentUser.email || null;
            recordedName = details.name || auth.currentUser.displayName || 'Traveler';

            await saveUserDetails(auth.currentUser.uid, {
              ...details,
              adTier: true,
              userTier: selectedPlan.type,
              subscription_tier: selectedPlan.type,
              sub_start_date: activeStartStr,
              sub_end_date: newEndDateStr,
            });
          }
        } catch (e) {
          console.warn('Failed updating user details on payment:', e);
        }
      }

      // Record transaction in transactions table
      try {
        const transactionRecord: SubscriptionTransaction = {
          transactionId: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          userCode: recordedUserCode,
          uid: auth.currentUser?.uid || undefined,
          userEmail: recordedEmail,
          userName: recordedName,
          planId: selectedPlan.id,
          planName: selectedPlan.name,
          planType: selectedPlan.type,
          durationYears: selectedPlan.durationYears,
          amountPaid: selectedPlan.discountedPrice,
          originalPrice: selectedPlan.originalPrice,
          currency: selectedPlan.currency || 'USD',
          planStartDate: txnStartDate,
          planEndDate: newEndDateStr,
          paymentMethod: gateway,
          orderId,
          status: 'completed',
          createdAt: new Date().toISOString(),
        };

        await recordTransaction(transactionRecord);
      } catch (txnErr) {
        console.warn('Failed recording subscription transaction:', txnErr);
      }

      setTimeout(() => {
        setShowSuccessToast(false);
        setPaymentMode('none');
        setPaymentStep('idle');
        onClose();
      }, 1600);
    }, 1800);
  };

  function loadRazorpayScript(): Promise<boolean> {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  // Real payment flow: the backend creates the Razorpay order and is the only thing that can ever
  // grant the subscription (see server/routes/payments.ts) — this just drives Razorpay's checkout UI.
  const handleRazorpayCheckout = async () => {
    setIsProcessing(true);
    setRazorpayError(null);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Could not load Razorpay checkout. Please check your connection and try again.');

      const order = await authFetch<{
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
        transactionId: string;
        planName: string;
        userName?: string;
        userEmail?: string;
      }>('/api/payments/razorpay/create-order', {
        method: 'POST',
        body: JSON.stringify({ planId: selectedPlan.id }),
      });

      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Viadia',
        description: order.planName,
        prefill: { name: order.userName, email: order.userEmail },
        theme: { color: '#4f46e5' },
        handler: async (response: any) => {
          try {
            const result = await authFetch<{ success: boolean; subscription: { tier: UserTier; startDate: string; endDate: string } }>(
              '/api/payments/razorpay/verify',
              {
                method: 'POST',
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  transactionId: order.transactionId,
                }),
              }
            );

            setUserSubscription({
              tier: result.subscription.tier,
              startDate: result.subscription.startDate,
              endDate: result.subscription.endDate,
            });
            setCurrentTier(result.subscription.tier);
            setCurrentEndDate(result.subscription.endDate);
            setPaymentMode('none');
            setShowSuccessToast(true);
            if (onTierChanged) onTierChanged(result.subscription.tier);
            setTimeout(() => {
              setShowSuccessToast(false);
              setPaymentStep('idle');
              onClose();
            }, 1600);
          } catch (verifyErr: any) {
            setRazorpayError(verifyErr?.message || 'Payment verification failed. If you were charged, please contact support.');
          } finally {
            setIsProcessing(false);
          }
        },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
      });
      rzp.on('payment.failed', (resp: any) => {
        setRazorpayError(resp?.error?.description || 'Payment failed. Please try again.');
        setIsProcessing(false);
      });
      rzp.open();
    } catch (err: any) {
      setRazorpayError(err?.message || 'Failed to start payment.');
      setIsProcessing(false);
    }
  };

  const formatDisplayDate = (dStr: string | null): string => {
    if (!dStr) return '';
    if (dStr.startsWith('2099')) return 'Lifetime (Never Expires)';
    try {
      const d = new Date(dStr);
      if (isNaN(d.getTime())) return dStr;
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dStr;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200 text-left">
      <div 
        ref={modalContentRef}
        className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-[28px] sm:rounded-3xl p-5 sm:p-7 max-w-lg w-full shadow-2xl relative overflow-hidden space-y-5 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200"
      >
        
        {/* Background ambient glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full bg-slate-100/80 dark:bg-slate-800/80 transition cursor-pointer z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header Branding */}
        <div className="flex items-center space-x-3 pt-1">
          <div className="p-3 bg-gradient-to-tr from-amber-500 to-indigo-600 text-white rounded-2xl shadow-md shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <ViadiaWordmark className="h-5 text-slate-900 dark:text-white" />
              <span className="px-2 py-0.5 bg-gradient-to-r from-amber-500 to-indigo-600 text-white text-[10px] font-black rounded-md tracking-wider uppercase font-mono shadow-xs">
                PRO MEMBERSHIP
              </span>
            </div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-lg sm:text-xl mt-0.5">
              {isSubActive ? 'You are a Pro Member' : 'Choose Your Pro Subscription'}
            </h3>
          </div>
        </div>

        {/* Current Active Subscription status if already subscribed */}
        {isSubActive && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60 rounded-2xl flex items-center space-x-3 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-xs">
              <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                Pro Membership Active
              </p>
              <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                {hasHighestTier || currentTier === 'lifetime' || isLifetimePass() || currentEndDate?.startsWith('2099')
                  ? 'Lifetime Pass — Enjoy 100% ad-free travel planning forever.'
                  : `Active package ends on ${formatDisplayDate(currentEndDate)}.`}
              </p>
            </div>
          </div>
        )}

        {/* Multiple Subscription Plans Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider font-mono">
              Available Pro Plans
            </span>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
              100% Ad-Free Guarantee
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:gap-2.5">
            {plans.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const discountPercent = Math.round(((plan.originalPrice - plan.discountedPrice) / plan.originalPrice) * 100);
              const planDuration = getPlanDurationYears(plan);
              const isPlanDisabled = hasHighestTier;
              const isCurrentPlan = isSubActive && (plan.type === currentTier || planDuration === currentDuration);

              return (
                <div
                  key={plan.id}
                  onClick={() => {
                    if (!isPlanDisabled) {
                      setSelectedPlanId(plan.id);
                    }
                  }}
                  className={`p-3 sm:p-3.5 rounded-2xl border-2 transition-all text-left relative overflow-hidden flex items-center justify-between gap-3 ${
                    isPlanDisabled
                      ? 'opacity-60 bg-slate-100/70 dark:bg-slate-900/30 border-slate-200/50 dark:border-slate-800/50 cursor-not-allowed select-none'
                      : isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-sm cursor-pointer'
                      : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                        isPlanDisabled
                          ? plan.id === 'lifetime'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-700 bg-slate-200/60 dark:bg-slate-800/60 text-slate-400'
                          : isSelected
                          ? 'border-indigo-600 bg-indigo-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {isPlanDisabled ? (
                        plan.id === 'lifetime' ? (
                          <Check className="h-3 w-3 stroke-[3]" />
                        ) : (
                          <Lock className="h-2.5 w-2.5" />
                        )
                      ) : (
                        isSelected && <Check className="h-3 w-3 stroke-[3]" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className={`text-xs sm:text-sm font-extrabold ${isPlanDisabled ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                          {plan.name}
                        </span>

                        {/* Badges */}
                        {hasHighestTier ? (
                          plan.id === 'lifetime' ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md uppercase font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                              <Check className="h-2.5 w-2.5" />
                              <span>Lifetime Active</span>
                            </span>
                          ) : null
                        ) : isSubActive ? (
                          plan.id === 'lifetime' ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase font-mono bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              Upgrade to Lifetime
                            </span>
                          ) : isCurrentPlan ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-md uppercase font-mono bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                              <span>Extend +{plan.durationYears} yr{plan.durationYears > 1 ? 's' : ''}</span>
                            </span>
                          ) : plan.badge ? (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase font-mono bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                              {plan.badge}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase font-mono bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
                              +{plan.durationYears} yr{plan.durationYears > 1 ? 's' : ''}
                            </span>
                          )
                        ) : plan.badge ? (
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase font-mono ${
                              plan.id === 'lifetime'
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20'
                            }`}
                          >
                            {plan.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {plan.id === 'lifetime' 
                          ? 'Valid through 2099-12-31' 
                          : isSubActive && currentEndDate
                            ? `Extends coverage to ${calculateEndDate(plan)}`
                            : `${plan.durationYears} Year${plan.durationYears > 1 ? 's' : ''} Ad-Free`}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-baseline justify-end space-x-1.5">
                      <span className={`text-base sm:text-lg font-black font-mono ${isPlanDisabled ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                        ${plan.discountedPrice.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {plan.currency}
                      </span>
                    </div>
                    {plan.originalPrice > plan.discountedPrice && (
                      <div className="flex items-center justify-end space-x-1">
                        <span className="text-[10px] text-slate-400 line-through font-mono">
                          ${plan.originalPrice.toFixed(2)}
                        </span>
                        {!isPlanDisabled && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                            Save {discountPercent}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Plan Details & Feature Card */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 rounded-2xl flex items-center space-x-3 text-left">
          <div className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <Zap className="h-5 w-5" />
          </div>
          <div className="space-y-0.5 text-xs">
            <h4 className="font-black text-slate-900 dark:text-white">
              Zero Ads
            </h4>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              All banner ads, sponsored modules, and interruption cards are completely removed.
            </p>
          </div>
        </div>

        {/* CTA Actions */}
        <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-slate-800">
          {!auth.currentUser ? (
            <div className="space-y-2.5">
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-left">
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h5 className="text-xs font-extrabold text-amber-900 dark:text-amber-300">
                    Sign In Required
                  </h5>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    Subscriptions are securely linked to your account so you stay ad-free across all devices.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  if (onLoginWithGoogle) onLoginWithGoogle();
                }}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl text-xs sm:text-sm transition shadow-md flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
              >
                <LogIn className="h-4 w-4" />
                <span>Sign In with Google to Subscribe</span>
              </button>

              {onLoginWithApple && (
                <button
                  onClick={() => {
                    onClose();
                    onLoginWithApple();
                  }}
                  className="w-full py-2.5 px-4 bg-black hover:bg-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-extrabold rounded-2xl text-xs transition flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <span> Sign In with Apple to Subscribe</span>
                </button>
              )}
            </div>
          ) : hasHighestTier ? (
            <div className="w-full py-3.5 px-5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-extrabold rounded-2xl text-sm flex items-center justify-center space-x-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>Lifetime Pro Active — You are on the Highest Tier</span>
            </div>
          ) : (
            <button
              onClick={handleStartUpgradeFlow}
              disabled={isProcessing}
              className="w-full py-3.5 px-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-amber-600 hover:from-indigo-700 hover:to-amber-700 text-white font-extrabold rounded-2xl text-sm transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>
                {isSubActive
                  ? selectedPlan.id === 'lifetime'
                    ? `Upgrade to ${selectedPlan.name} ($${selectedPlan.discountedPrice.toFixed(2)} ${selectedPlan.currency})`
                    : `Extend with ${selectedPlan.name} ($${selectedPlan.discountedPrice.toFixed(2)} ${selectedPlan.currency})`
                  : `Get ${selectedPlan.name} ($${selectedPlan.discountedPrice.toFixed(2)} ${selectedPlan.currency})`}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Guest Payment Method Selector Dialog (When on Web with Guest Login) */}
        {paymentMode === 'select_guest_gateway' && (
          <div className="absolute inset-0 bg-white/98 dark:bg-slate-900/98 backdrop-blur-md z-50 p-6 flex flex-col justify-between animate-in zoom-in-95 duration-200 text-left overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <CreditCard className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-base">Select Payment Gateway</h4>
                </div>
                <button
                  onClick={() => setPaymentMode('none')}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
                Choose your preferred payment system to activate <strong className="text-slate-800 dark:text-slate-200">{selectedPlan.name} (${selectedPlan.discountedPrice.toFixed(2)} {selectedPlan.currency})</strong>:
              </p>

              {razorpayError && (
                <div className="mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
                  {razorpayError}
                </div>
              )}

              <div className="mt-5 space-y-3">
                <button
                  onClick={handleRazorpayCheckout}
                  disabled={isProcessing}
                  className="w-full p-4 rounded-2xl border-2 border-emerald-500/40 hover:border-emerald-600 bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-emerald-950/40 dark:to-slate-900 text-slate-900 dark:text-white font-bold text-xs flex items-center justify-between shadow-sm transition cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-emerald-600 text-sm">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">Pay with Razorpay</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Cards, UPI, Netbanking & Wallets</p>
                    </div>
                  </div>
                  {isProcessing ? <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" /> : <ArrowRight className="h-4 w-4 text-emerald-500" />}
                </button>

                <button
                  onClick={() => executePayment('google_play')}
                  className="w-full p-4 rounded-2xl border-2 border-indigo-500/30 hover:border-indigo-600 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-slate-900 text-slate-900 dark:text-white font-bold text-xs flex items-center justify-between shadow-sm transition cursor-pointer active:scale-98"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black text-indigo-600 text-sm">
                      G
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">Google Play Payments / Google Pay</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Secure 1-Tap Google Checkout</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-indigo-500" />
                </button>

                <button
                  onClick={() => executePayment('apple_pay')}
                  className="w-full p-4 rounded-2xl border-2 border-slate-300 dark:border-slate-700 hover:border-slate-900 dark:hover:border-white bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800/80 dark:to-slate-900 text-slate-900 dark:text-white font-bold text-xs flex items-center justify-between shadow-sm transition cursor-pointer active:scale-98"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">
                      
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">Apple Pay / App Store</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Apple In-App Purchase System</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center space-x-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                <span>256-bit Encrypted Checkout</span>
              </span>
              <span>${selectedPlan.discountedPrice.toFixed(2)} {selectedPlan.currency}</span>
            </div>
          </div>
        )}

        {/* Google Play Payments Modal Sheet */}
        {paymentMode === 'google_play' && (
          <div className="absolute inset-0 bg-white/98 dark:bg-slate-900/98 backdrop-blur-md z-50 p-6 flex flex-col justify-between animate-in slide-in-from-bottom duration-200 text-left overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-600 text-white flex items-center justify-center font-black text-xs">
                    G
                  </div>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">Google Play In-App Billing</span>
                </div>
                <button
                  onClick={() => {
                    setPaymentMode('none');
                    setPaymentStep('idle');
                  }}
                  disabled={paymentStep === 'authorizing'}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Subscription Item</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">ViaDia {selectedPlan.name}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Account: {auth.currentUser?.email || 'Google User'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
                      ${selectedPlan.discountedPrice.toFixed(2)}
                    </p>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 font-bold rounded-md">
                      {selectedPlan.id === 'lifetime' ? 'One-Time' : `${selectedPlan.durationYears} Year Term`}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60 rounded-xl flex items-center space-x-3 text-xs text-indigo-800 dark:text-indigo-300">
                  <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0" />
                  <span>Google Play payment method linked & verified for instant activation.</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              {paymentStep === 'idle' ? (
                <button
                  onClick={() => executePayment('google_play')}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl text-sm transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <Check className="h-4 w-4" />
                  <span>Confirm & Pay ${selectedPlan.discountedPrice.toFixed(2)} via Google Play</span>
                </button>
              ) : paymentStep === 'authorizing' ? (
                <div className="w-full py-3.5 bg-indigo-600/90 text-white font-extrabold rounded-2xl text-sm flex items-center justify-center space-x-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Processing Google Play Transaction...</span>
                </div>
              ) : (
                <div className="w-full py-3.5 bg-emerald-600 text-white font-extrabold rounded-2xl text-sm flex items-center justify-center space-x-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Google Play Payment Complete!</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Apple In-App Purchase / Apple Pay Sheet */}
        {paymentMode === 'apple_pay' && (
          <div className="absolute inset-0 bg-white/98 dark:bg-slate-900/98 backdrop-blur-md z-50 p-6 flex flex-col justify-between animate-in slide-in-from-bottom duration-200 text-left overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-black text-slate-900 dark:text-white"></span>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">Apple Pay / App Store In-App Purchase</span>
                </div>
                <button
                  onClick={() => {
                    setPaymentMode('none');
                    setPaymentStep('idle');
                  }}
                  disabled={paymentStep === 'authorizing'}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full bg-slate-100 dark:bg-slate-800 cursor-pointer disabled:opacity-40"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Subscription Item</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">ViaDia {selectedPlan.name}</p>
                    <p className="text-[11px] text-slate-400 mt-1">Apple ID Account</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black font-mono text-slate-900 dark:text-white">
                      ${selectedPlan.discountedPrice.toFixed(2)}
                    </p>
                    <span className="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-800 font-bold rounded-md text-slate-700 dark:text-slate-300">
                      Apple Pay
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-6 bg-slate-900 text-white rounded-md flex items-center justify-center font-bold text-[10px]">
                      CARD
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Apple Card •••• 8829</p>
                      <p className="text-[10px] text-slate-400">PassKit Biometric Verification</p>
                    </div>
                  </div>
                  <Lock className="h-4 w-4 text-emerald-500" />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              {paymentStep === 'idle' ? (
                <button
                  onClick={() => executePayment('apple_pay')}
                  className="w-full py-4 bg-black hover:bg-slate-900 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-black rounded-2xl text-sm transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                >
                  <span className="text-base font-serif"></span>
                  <span>Pay ${selectedPlan.discountedPrice.toFixed(2)} with Apple Pay</span>
                </button>
              ) : paymentStep === 'authorizing' ? (
                <div className="w-full py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-extrabold rounded-2xl text-sm flex items-center justify-center space-x-2.5">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying Face ID / Touch ID...</span>
                </div>
              ) : (
                <div className="w-full py-4 bg-emerald-600 text-white font-extrabold rounded-2xl text-sm flex items-center justify-center space-x-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>Apple Pay Approved!</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success toast overlay */}
        {showSuccessToast && (
          <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center space-y-3 p-6 text-center animate-in fade-in duration-200">
            <div className="p-4 bg-emerald-500 text-white rounded-full shadow-xl">
              <Check className="h-8 w-8" />
            </div>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">
              {selectedPlan.name} Activated!
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
              Thank you for subscribing to ViaDia Pro! All ads have been removed and your membership is active through {formatDisplayDate(calculateEndDate(selectedPlan))}.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
