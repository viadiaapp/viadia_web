import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Coins, AlertTriangle, Upload, DollarSign, Check, RefreshCw, Trash2, Eye, ChevronDown, User, Tag, CreditCard, ArrowRightLeft } from 'lucide-react';
import { Trip, Expense, Split, AttachmentItem } from '../types';
import { compressImageFile, validateAttachmentFile, getItemAttachments } from '../lib/imageUtils';
import { DEFAULT_USD_RATES, staticCurrenciesSeed } from '../data/staticCurrencies';
import { getSetupExchangeRate } from '../lib/tripUtils';
import { fetchLiveForexRates } from '../lib/apiUtils';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { AttachmentManager } from './AttachmentManager';
import { useBackButton } from '../lib/backButtonHandler';
import { SelectionBottomSheet, SelectOption } from './SelectionBottomSheet';

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrip: Trip;
  editingExpense?: Expense | null;
  editingExpenseId?: string | null;
  initialExpenseData?: Partial<Expense> | null;
  initialDate?: string;
  onSaveExpense: (expense: Expense) => void;
  isReadOnly?: boolean;
}

const formatToDateTimeLocal = (dateStr?: string) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  if (!dateStr) {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${currentTime}`;
  }
  if (dateStr.includes('T')) {
    return dateStr.slice(0, 16);
  }
  return `${dateStr}T${currentTime}`;
};

const getDatePart = (dtStr: string) => {
  if (!dtStr) return new Date().toISOString().slice(0, 10);
  if (dtStr.includes('T')) return dtStr.split('T')[0];
  return dtStr.slice(0, 10);
};

const getTimePart = (dtStr: string) => {
  if (!dtStr) return '12:00';
  if (dtStr.includes('T')) return dtStr.split('T')[1]?.slice(0, 5) || '12:00';
  return '12:00';
};

const CURRENCY_FLAG_MAP = new Map<string, string>();
staticCurrenciesSeed.forEach((c) => {
  if (c.currencyCode && c.flagEmoji && !CURRENCY_FLAG_MAP.has(c.currencyCode.toUpperCase())) {
    CURRENCY_FLAG_MAP.set(c.currencyCode.toUpperCase(), c.flagEmoji);
  }
});

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  activeTrip,
  editingExpense,
  editingExpenseId: propEditingExpenseId,
  initialExpenseData,
  initialDate,
  onSaveExpense,
  isReadOnly,
}) => {
  const [transactionType, setTransactionType] = useState<'expense' | 'forex' | 'peer_transfer'>('expense');
  const [currentEditingId, setCurrentEditingId] = useState<string | null>(null);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseSpendAmount, setExpenseSpendAmount] = useState('');
  const [expenseSpendCurrency, setExpenseSpendCurrency] = useState(activeTrip.baseCurrency || 'USD');
  const [expenseExchangeRate, setExpenseExchangeRate] = useState('1.0');
  const [expensePaidBy, setExpensePaidBy] = useState(activeTrip.travelers?.[0] || 'Me');
  const [expenseCategory, setExpenseCategory] = useState(activeTrip.categories?.[0] || 'Food');
  const [expensePaymentType, setExpensePaymentType] = useState('Card / Digital');
  const [expenseDate, setExpenseDate] = useState(formatToDateTimeLocal());
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [expenseSplits, setExpenseSplits] = useState<{ [key: string]: boolean }>({});
  const [customSplitAmounts, setCustomSplitAmounts] = useState<{ [key: string]: string }>({});
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentData, setAttachmentData] = useState('');
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  // Active Bottom Sheet picker type
  const [activePicker, setActivePicker] = useState<
    'spendCurrency' | 'paidBy' | 'category' | 'paymentType' | 'fromCurrency' | 'toCurrency' | 'transferTo' | null
  >(null);

  // Sub-modal attachment viewer (priority 110) & main modal (priority 100)
  useBackButton('add-expense-viewer', isViewerOpen, () => setIsViewerOpen(false), 110);
  useBackButton('add-expense-modal', isOpen && !isViewerOpen && activePicker === null, onClose, 100);

  // Forex Specifics
  const [forexToAmount, setForexToAmount] = useState('');
  const [forexToCurrency, setForexToCurrency] = useState('');

  // Peer Transfer Specifics
  const [transferTo, setTransferTo] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFetchingForex, setIsFetchingForex] = useState(false);

  const handleDateChange = (newDate: string) => {
    const time = getTimePart(expenseDate);
    setExpenseDate(`${newDate}T${time}`);
  };

  const handleTimeChange = (newTime: string) => {
    const date = getDatePart(expenseDate);
    setExpenseDate(`${date}T${newTime}`);
  };

  const availablePaymentMethods =
    activeTrip.paymentTypes && activeTrip.paymentTypes.length > 0
      ? activeTrip.paymentTypes
      : ['Cash', 'Credit Card', 'Card / Digital'];

  useEffect(() => {
    if (!isOpen) return;

    const idToFind = propEditingExpenseId || editingExpense?.id || initialExpenseData?.id;
    const expenseToEdit =
      editingExpense ||
      (idToFind ? activeTrip.expenses?.find((e) => e.id === idToFind) : null) ||
      (initialExpenseData && (initialExpenseData.title || initialExpenseData.amount) ? initialExpenseData : null);

    if (expenseToEdit) {
      setCurrentEditingId(expenseToEdit.id || idToFind || null);
      setExpenseTitle(expenseToEdit.title || '');
      setExpenseSpendAmount(
        expenseToEdit.spendAmount !== undefined
          ? String(expenseToEdit.spendAmount)
          : String(expenseToEdit.amount || '')
      );
      const spendCurr = expenseToEdit.spendCurrency || activeTrip.baseCurrency || 'USD';
      setExpenseSpendCurrency(spendCurr);
      const baseCurr = activeTrip.baseCurrency || 'USD';
      if (
        expenseToEdit.exchangeRate &&
        Number(expenseToEdit.exchangeRate) > 0 &&
        !(spendCurr === baseCurr && Number(expenseToEdit.exchangeRate) !== 1.0)
      ) {
        setExpenseExchangeRate(String(expenseToEdit.exchangeRate));
      } else {
        setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, spendCurr)));
      }
      setExpensePaidBy(expenseToEdit.paidBy || activeTrip.travelers?.[0] || 'Me');
      setExpenseCategory(expenseToEdit.category || 'Food');
      setExpensePaymentType(expenseToEdit.paymentType || availablePaymentMethods[0]);
      setExpenseDate(formatToDateTimeLocal(expenseToEdit.date || initialDate));
      setAttachmentName(expenseToEdit.receiptName || (expenseToEdit as any).receiptAttachment || '');
      setAttachmentData(expenseToEdit.receiptData || (expenseToEdit as any).receiptAttachmentData || '');
      setAttachments(getItemAttachments(expenseToEdit));
      setForexToCurrency((expenseToEdit as any).forexToCurrency || '');
      setForexToAmount(
        (expenseToEdit as any).forexToAmount !== undefined ? String((expenseToEdit as any).forexToAmount) : ''
      );
      setTransferTo(expenseToEdit.transferTo || '');

      if (expenseToEdit.type === 'forex' || expenseToEdit.category === 'Forex Conversion') {
        setTransactionType('forex');
      } else if (
        expenseToEdit.type === 'peer_transfer' ||
        expenseToEdit.category === 'Settlement' ||
        expenseToEdit.transferTo
      ) {
        setTransactionType('peer_transfer');
      } else {
        setTransactionType('expense');
      }

      setSplitType(expenseToEdit.splitType === 'custom' ? 'custom' : 'equal');

      if (expenseToEdit.splits && Array.isArray(expenseToEdit.splits)) {
        const splitsObj: { [key: string]: boolean } = {};
        const customObj: { [key: string]: string } = {};
        const rate = expenseToEdit.exchangeRate || 1.0;

        (activeTrip.travelers || ['Me']).forEach((t) => {
          const found = expenseToEdit.splits.find((s: any) => s.traveler === t);
          splitsObj[t] = !!found;
          if (found) {
            const localVal = Math.round(found.amount * rate * 100) / 100;
            customObj[t] = String(localVal);
          } else {
            customObj[t] = '0';
          }
        });
        setExpenseSplits(splitsObj);
        setCustomSplitAmounts(customObj);
      } else {
        const initSplits: { [key: string]: boolean } = {};
        (activeTrip.travelers || ['Me']).forEach((t) => (initSplits[t] = true));
        setExpenseSplits(initSplits);
        setCustomSplitAmounts({});
      }
    } else {
      setCurrentEditingId(null);
      setTransactionType('expense');
      setExpenseTitle('');
      setExpenseSpendAmount('');
      const defaultCurrency = activeTrip.baseCurrency || 'USD';
      const initSpendCurr = initialExpenseData?.spendCurrency || defaultCurrency;
      setExpenseSpendCurrency(initSpendCurr);
      setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, initSpendCurr)));
      setExpensePaidBy(activeTrip.travelers?.[0] || 'Me');
      setExpenseCategory(activeTrip.categories?.[0] || 'Food');
      setExpensePaymentType(availablePaymentMethods[0]);
      setExpenseDate(formatToDateTimeLocal(initialDate || initialExpenseData?.date));
      setAttachmentName('');
      setAttachmentData('');
      setAttachments(getItemAttachments(initialExpenseData));
      setValidationError(null);

      const secondCurr = (activeTrip.currencies || []).find((c) => c !== defaultCurrency) || defaultCurrency;
      setForexToCurrency(secondCurr);
      setForexToAmount('');

      const firstTraveler = activeTrip.travelers?.[0] || 'Me';
      const secondTraveler = (activeTrip.travelers || []).find((t) => t !== firstTraveler) || 'Companion';
      setTransferTo(secondTraveler);

      setSplitType('equal');
      const initSplits: { [key: string]: boolean } = {};
      (activeTrip.travelers || ['Me']).forEach((t) => (initSplits[t] = true));
      setExpenseSplits(initSplits);
      setCustomSplitAmounts({});
    }
  }, [
    isOpen,
    propEditingExpenseId,
    editingExpense?.id,
    initialExpenseData?.id,
    initialDate,
    activeTrip?.id,
    activeTrip?.baseCurrency,
    (activeTrip?.currencies || []).join(','),
    (activeTrip?.travelers || []).join(','),
  ]);

  // Options Generators for BottomSheet
  const currencyOptions: SelectOption[] = useMemo(() => {
    const list = Array.from(new Set([activeTrip.baseCurrency || 'USD', ...(activeTrip.currencies || [])]));
    return list.map((code) => {
      const flag = CURRENCY_FLAG_MAP.get(code.toUpperCase()) || '🌐';
      return {
        value: code,
        label: code,
        sublabel: code === activeTrip.baseCurrency ? 'Base Currency' : 'Secondary Currency',
        icon: <span>{flag}</span>,
      };
    });
  }, [activeTrip.baseCurrency, activeTrip.currencies]);

  const travelerOptions: SelectOption[] = useMemo(() => {
    return (activeTrip.travelers || ['Me']).map((t) => ({
      value: t,
      label: t,
      icon: <User className="h-4 w-4" />,
    }));
  }, [activeTrip.travelers]);

  const categoryOptions: SelectOption[] = useMemo(() => {
    const base = Array.from(
      new Set([
        ...(activeTrip.categories || ['Food', 'Transport', 'Lodging', 'Activities', 'Other']),
        ...((activeTrip.expenses || []).map((e) => e.category).filter(Boolean) as string[]),
      ])
    ).filter((cat) => cat !== 'Forex Conversion' && !cat.startsWith('Forex in ') && cat !== 'Settlement' && cat !== 'Peer Transfer');

    return base.map((cat) => ({
      value: cat,
      label: cat,
      icon: <Tag className="h-4 w-4" />,
    }));
  }, [activeTrip.categories, activeTrip.expenses]);

  const paymentMethodOptions: SelectOption[] = useMemo(() => {
    const list = Array.from(
      new Set([
        ...availablePaymentMethods,
        ...(activeTrip.expenses || [])
          .filter((e) => (e.type === 'forex' || e.category === 'Forex Conversion') && e.forexToCurrency)
          .map((e) => `Forex in ${e.forexToCurrency}`),
      ])
    );
    return list.map((pm) => ({
      value: pm,
      label: pm,
      icon: <CreditCard className="h-4 w-4" />,
    }));
  }, [availablePaymentMethods, activeTrip.expenses]);

  if (!isOpen) return null;

  const handleSpendCurrencyChange = (newCurr: string) => {
    setExpenseSpendCurrency(newCurr);
    const rate = getSetupExchangeRate(activeTrip, newCurr);
    setExpenseExchangeRate(String(rate));
  };

  const handleFetchExchangeRate = async () => {
    setIsFetchingForex(true);
    try {
      const isForex = transactionType === 'forex';
      const base = isForex ? expenseSpendCurrency : (activeTrip.baseCurrency || 'USD');
      const target = isForex
        ? forexToCurrency || (activeTrip.currencies || []).find((c) => c !== base) || 'USD'
        : expenseSpendCurrency;

      if (base === target) {
        setExpenseExchangeRate('1.0');
        if (isForex) {
          if (expenseSpendAmount) {
            setForexToAmount(expenseSpendAmount);
          } else if (forexToAmount) {
            setExpenseSpendAmount(forexToAmount);
          }
        }
        return;
      }

      let rate: number | undefined = undefined;
      try {
        const forexResult = await fetchLiveForexRates(base);
        if (forexResult && forexResult.rates && forexResult.rates[target]) {
          rate = Number(forexResult.rates[target]);
        }
      } catch (err) {
        console.warn('Could not fetch forex rate, using local fallback:', err);
      }

      if (!rate || isNaN(rate)) {
        rate = getSetupExchangeRate(activeTrip, target, base);
      }

      if (rate && !isNaN(rate)) {
        setExpenseExchangeRate(String(rate));
        if (isForex) {
          const num = parseFloat(expenseSpendAmount);
          if (!isNaN(num) && num > 0) {
            setForexToAmount((num * rate).toFixed(2));
          } else {
            const toNum = parseFloat(forexToAmount);
            if (!isNaN(toNum) && toNum > 0 && rate > 0) {
              setExpenseSpendAmount((toNum / rate).toFixed(2));
            }
          }
        }
      }
    } catch (err) {
      console.warn('Error during exchange rate calculation:', err);
    } finally {
      setIsFetchingForex(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      setValidationError('Trip is read-only.');
      return;
    }

    const spendAmountNum = parseFloat(expenseSpendAmount);
    if (isNaN(spendAmountNum) || spendAmountNum <= 0) {
      setValidationError('Please enter a valid positive spend amount.');
      return;
    }

    const exRateNum = parseFloat(expenseExchangeRate) || 1.0;
    let baseAmountNum = spendAmountNum;

    if (transactionType === 'forex') {
      baseAmountNum = 0;
    } else if (expenseSpendCurrency === (activeTrip.baseCurrency || 'USD')) {
      baseAmountNum = spendAmountNum;
    } else {
      baseAmountNum = spendAmountNum / exRateNum;
    }

    let finalTitle = expenseTitle.trim();
    let finalCategory = expenseCategory;

    if (transactionType === 'forex') {
      finalTitle = finalTitle || `Exchanged ${spendAmountNum} ${expenseSpendCurrency} to ${forexToAmount || 0} ${forexToCurrency}`;
      finalCategory = 'Forex Conversion';
    } else if (transactionType === 'peer_transfer') {
      finalTitle = finalTitle || `Transfer: ${expensePaidBy} -> ${transferTo || 'Companion'}`;
      finalCategory = 'Settlement';
    } else if (!finalTitle) {
      finalTitle = 'General Expense';
    }

    let finalSplitType: 'equal' | 'custom' | 'none' = 'equal';
    let formattedSplits: Split[] = [];

    if (transactionType === 'forex') {
      finalSplitType = 'none';
      formattedSplits = [];
    } else if (transactionType === 'peer_transfer') {
      finalSplitType = 'custom';
      formattedSplits = (activeTrip.travelers || ['Me']).map((t) => ({
        traveler: t,
        amount: t === transferTo ? Number(baseAmountNum.toFixed(2)) : 0,
      }));
    } else if (splitType === 'custom') {
      finalSplitType = 'custom';
      formattedSplits = (activeTrip.travelers || ['Me']).map((t) => {
        const localVal = parseFloat(customSplitAmounts[t] || '0') || 0;
        const baseVal = expenseSpendCurrency === (activeTrip.baseCurrency || 'USD') ? localVal : localVal / exRateNum;
        return {
          traveler: t,
          amount: Number(baseVal.toFixed(2)),
        };
      });
    } else {
      finalSplitType = 'equal';
      const splitTravelers = Object.keys(expenseSplits).filter((k) => expenseSplits[k]);
      const perPersonAmount = splitTravelers.length > 0 ? Number((baseAmountNum / splitTravelers.length).toFixed(2)) : 0;
      formattedSplits = splitTravelers.map((t) => ({ traveler: t, amount: perPersonAmount }));
    }

    const firstAtt = attachments[0];

    const expenseObj: Expense = {
      id: currentEditingId || `exp-${Date.now()}`,
      type: transactionType,
      title: finalTitle,
      amount: Number(baseAmountNum.toFixed(2)),
      spendAmount: spendAmountNum,
      spendCurrency: expenseSpendCurrency,
      exchangeRate: exRateNum,
      category: finalCategory,
      paidBy: expensePaidBy,
      paymentType: expensePaymentType,
      date: expenseDate,
      splitType: finalSplitType as any,
      splits: formattedSplits,
      placeId: null,
      attachments: attachments,
      receiptName: firstAtt?.name || attachmentName || undefined,
      receiptData: firstAtt?.data || attachmentData || undefined,
      receiptAttachment: firstAtt?.name || undefined,
      receiptAttachmentData: firstAtt?.data || undefined,
      transferTo: transactionType === 'peer_transfer' ? transferTo : undefined,
      forexToCurrency: transactionType === 'forex' ? forexToCurrency : undefined,
      forexToAmount: transactionType === 'forex' && forexToAmount ? Number(forexToAmount) : undefined,
    } as Expense;

    onSaveExpense(expenseObj);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto flex justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-[28px] sm:rounded-[32px] shadow-2xl p-4 sm:p-6 w-full max-w-xl max-h-[92vh] overflow-y-auto text-left relative animate-in fade-in zoom-in-95 duration-200 my-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 p-1 rounded-xl bg-slate-50 dark:bg-slate-950 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 border border-slate-200/50 dark:border-slate-800 transition cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center space-x-2">
          <Coins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <span>{currentEditingId ? 'Edit Transaction Log' : 'Log New Expense'}</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Specify parameters to log and split expenditures correctly across companion ledger groups.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 mt-5">
          {validationError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">{validationError}</span>
            </div>
          )}

          {/* Segment Control */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
              Transaction Type
            </label>
            <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full">
              <button
                type="button"
                onClick={() => {
                  setTransactionType('expense');
                  setExpenseCategory(activeTrip.categories?.[0] || 'Food');
                  setValidationError(null);
                  const curr = expenseSpendCurrency || activeTrip.baseCurrency || 'USD';
                  setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, curr)));
                }}
                className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                  transactionType === 'expense'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setTransactionType('forex');
                  setExpenseCategory('Other');
                  setValidationError(null);
                  const fromCurr = expenseSpendCurrency || activeTrip.baseCurrency || 'USD';
                  const targetCurr = forexToCurrency || (activeTrip.currencies || []).find((c) => c !== fromCurr) || 'USD';
                  setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, targetCurr, fromCurr)));
                }}
                className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                  transactionType === 'forex'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Forex Conversion
              </button>
              <button
                type="button"
                onClick={() => {
                  setTransactionType('peer_transfer');
                  setExpenseCategory('Other');
                  setValidationError(null);
                  const curr = expenseSpendCurrency || activeTrip.baseCurrency || 'USD';
                  setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, curr)));
                }}
                className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                  transactionType === 'peer_transfer'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Peer Transfer
              </button>
            </div>
          </div>

          {/* Form Fields: Expense */}
          {transactionType === 'expense' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Expense Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Guided tour tickets"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 min-w-0"
                />
              </div>

              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Date & Time
                </label>
                <div className="flex items-center gap-1.5 w-full min-w-0">
                  <input
                    type="date"
                    required
                    value={getDatePart(expenseDate)}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium cursor-pointer"
                  />
                  <input
                    type="time"
                    required
                    value={getTimePart(expenseDate)}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium text-center cursor-pointer"
                  />
                </div>
              </div>

              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Spend Amount *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={expenseSpendAmount}
                  onChange={(e) => setExpenseSpendAmount(e.target.value)}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono min-w-0"
                />
              </div>

              {/* Transaction Currency Picker */}
              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Transaction Currency
                </label>
                <button
                  type="button"
                  onClick={() => setActivePicker('spendCurrency')}
                  className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                >
                  <span className="flex items-center space-x-2 truncate">
                    <span>{CURRENCY_FLAG_MAP.get(expenseSpendCurrency.toUpperCase()) || '🌐'}</span>
                    <span>{expenseSpendCurrency}</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Exchange Rate (1 Base = X target)
                  </label>
                  {expenseSpendCurrency !== (activeTrip.baseCurrency || 'USD') && (
                    <button
                      type="button"
                      onClick={handleFetchExchangeRate}
                      disabled={isFetchingForex}
                      className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                      title="Fetch live market rate"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isFetchingForex ? 'animate-spin' : ''}`} />
                      {isFetchingForex ? 'Fetching...' : 'Live Rate'}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.000001"
                  required
                  value={expenseExchangeRate}
                  onChange={(e) => setExpenseExchangeRate(e.target.value)}
                  disabled={expenseSpendCurrency === (activeTrip.baseCurrency || 'USD')}
                  className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono disabled:opacity-60"
                />
              </div>

              {/* Paid By Picker */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Paid By
                </label>
                <button
                  type="button"
                  onClick={() => setActivePicker('paidBy')}
                  className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                >
                  <span className="truncate">{expensePaidBy}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              </div>

              {/* Category Picker */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Category Tag
                </label>
                <button
                  type="button"
                  onClick={() => setActivePicker('category')}
                  className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                >
                  <span className="truncate">{expenseCategory}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              </div>

              {/* Payment Method Picker */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Payment Method
                </label>
                <button
                  type="button"
                  onClick={() => setActivePicker('paymentType')}
                  className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                >
                  <span className="truncate">{expensePaymentType}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>
          )}

          {/* Form Fields: Forex */}
          {transactionType === 'forex' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div className="space-y-1 sm:col-span-2 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Transaction Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cash exchange SGD -> JPY"
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 min-w-0"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Date & Time
                  </label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      required
                      value={getDatePart(expenseDate)}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium cursor-pointer"
                    />
                    <input
                      type="time"
                      required
                      value={getTimePart(expenseDate)}
                      onChange={(e) => handleTimeChange(e.target.value)}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium text-center cursor-pointer"
                    />
                  </div>
                </div>

                {/* Converted By Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Converted By
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePicker('paidBy')}
                    className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="truncate">{expensePaidBy}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                {/* From Currency Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    From Currency
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePicker('fromCurrency')}
                    className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2 truncate">
                      <span>{CURRENCY_FLAG_MAP.get(expenseSpendCurrency.toUpperCase()) || '🌐'}</span>
                      <span>{expenseSpendCurrency}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    From Amount *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={expenseSpendAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExpenseSpendAmount(val);
                      if (!val) {
                        setForexToAmount('');
                        return;
                      }
                      const num = parseFloat(val);
                      const rate =
                        parseFloat(expenseExchangeRate) ||
                        (forexToCurrency
                          ? getSetupExchangeRate(activeTrip, forexToCurrency, expenseSpendCurrency)
                          : 1.0);
                      if (!isNaN(num) && !isNaN(rate) && rate > 0) {
                        setForexToAmount((num * rate).toFixed(2));
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono"
                  />
                </div>

                {/* To Currency Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    To Currency
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePicker('toCurrency')}
                    className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2 truncate">
                      <span>{CURRENCY_FLAG_MAP.get(forexToCurrency.toUpperCase()) || '🌐'}</span>
                      <span>{forexToCurrency}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    To Amount *
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={forexToAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForexToAmount(val);
                      if (!val) {
                        setExpenseSpendAmount('');
                        return;
                      }
                      const toNum = parseFloat(val);
                      const rate =
                        parseFloat(expenseExchangeRate) ||
                        (forexToCurrency
                          ? getSetupExchangeRate(activeTrip, forexToCurrency, expenseSpendCurrency)
                          : 1.0);
                      if (!isNaN(toNum) && !isNaN(rate) && rate > 0) {
                        setExpenseSpendAmount((toNum / rate).toFixed(2));
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      Exchange Rate (1 From = X To)
                    </label>
                    {expenseSpendCurrency !== forexToCurrency && (
                      <button
                        type="button"
                        onClick={handleFetchExchangeRate}
                        disabled={isFetchingForex}
                        className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                      >
                        {isFetchingForex ? 'Fetching...' : 'Live Rate'}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={expenseExchangeRate}
                    onChange={(e) => {
                      const rateStr = e.target.value;
                      setExpenseExchangeRate(rateStr);
                      const rate = parseFloat(rateStr);
                      if (!isNaN(rate) && rate > 0) {
                        const fromNum = parseFloat(expenseSpendAmount);
                        if (!isNaN(fromNum) && fromNum > 0) {
                          setForexToAmount((fromNum * rate).toFixed(2));
                        } else {
                          const toNum = parseFloat(forexToAmount);
                          if (!isNaN(toNum) && toNum > 0) {
                            setExpenseSpendAmount((toNum / rate).toFixed(2));
                          }
                        }
                      }
                    }}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Form Fields: Peer Transfer */}
          {transactionType === 'peer_transfer' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
                <div className="space-y-1 sm:col-span-2 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Transfer Title / Note (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cab ride settlement"
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 min-w-0"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Date & Time
                  </label>
                  <div className="flex items-center gap-1.5 w-full min-w-0">
                    <input
                      type="date"
                      required
                      value={getDatePart(expenseDate)}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="flex-1 min-w-0 text-xs px-2.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium cursor-pointer"
                    />
                    <input
                      type="time"
                      required
                      value={getTimePart(expenseDate)}
                      onChange={(e) => handleTimeChange(e.target.value)}
                      className="w-24 sm:w-28 shrink-0 min-w-0 text-xs px-2 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium text-center cursor-pointer"
                    />
                  </div>
                </div>

                {/* Sender Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Sender (From Person)
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePicker('paidBy')}
                    className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="truncate">{expensePaidBy}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                {/* Recipient Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Recipient (To Person)
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePicker('transferTo')}
                    className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="truncate">{transferTo || 'Select recipient'}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      Transfer Amount *
                    </label>
                    {expenseSpendCurrency !== (activeTrip.baseCurrency || 'USD') &&
                      Number(expenseSpendAmount) > 0 && (
                        <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                          ≈{' '}
                          {(
                            Number(expenseSpendAmount) /
                            (Number(expenseExchangeRate) || 1)
                          ).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          {activeTrip.baseCurrency || 'USD'}
                        </span>
                      )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={expenseSpendAmount}
                    onChange={(e) => setExpenseSpendAmount(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono font-bold"
                  />
                </div>

                {/* Transfer Currency Picker */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Transfer Currency
                  </label>
                  <button
                    type="button"
                    onClick={() => setActivePicker('spendCurrency')}
                    className="w-full flex items-center justify-between text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 font-bold hover:bg-slate-100 dark:hover:bg-slate-900 transition cursor-pointer"
                  >
                    <span className="flex items-center space-x-2 truncate">
                      <span>{CURRENCY_FLAG_MAP.get(expenseSpendCurrency.toUpperCase()) || '🌐'}</span>
                      <span>{expenseSpendCurrency}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  </button>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                      Exchange Rate (1 Base = X transfer)
                    </label>
                    {expenseSpendCurrency !== (activeTrip.baseCurrency || 'USD') && (
                      <button
                        type="button"
                        onClick={handleFetchExchangeRate}
                        disabled={isFetchingForex}
                        className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer flex items-center gap-1"
                        title="Fetch live market rate"
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${isFetchingForex ? 'animate-spin' : ''}`} />
                        {isFetchingForex ? 'Fetching...' : 'Live Rate'}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={expenseExchangeRate}
                    onChange={(e) => setExpenseExchangeRate(e.target.value)}
                    disabled={expenseSpendCurrency === (activeTrip.baseCurrency || 'USD')}
                    className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Split Section */}
          {transactionType === 'expense' && (activeTrip.travelers || []).length > 1 && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Split Amongst
                </label>
                <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSplitType('equal')}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      splitType === 'equal'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Equal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitType('custom');
                      const totalNum = parseFloat(expenseSpendAmount) || 0;
                      const travelers = activeTrip.travelers || ['Me'];
                      if (Object.keys(customSplitAmounts).length === 0 && travelers.length > 0) {
                        const equalShare = (totalNum / travelers.length).toFixed(2);
                        const initObj: { [key: string]: string } = {};
                        travelers.forEach((t) => (initObj[t] = equalShare));
                        setCustomSplitAmounts(initObj);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      splitType === 'custom'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Custom Split
                  </button>
                </div>
              </div>

              {splitType === 'equal' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(activeTrip.travelers || ['Me']).map((traveler, trIdx) => {
                    const isChecked = expenseSplits[traveler] !== false;
                    return (
                      <button
                        key={`equal-split-btn-${traveler}-${trIdx}`}
                        type="button"
                        onClick={() =>
                          setExpenseSplits((prev) => ({
                            ...prev,
                            [traveler]: !isChecked,
                          }))
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between border transition cursor-pointer ${
                          isChecked
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-400'
                        }`}
                      >
                        <span className="truncate">{traveler}</span>
                        {isChecked && <Check className="h-3.5 w-3.5 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(activeTrip.travelers || ['Me']).map((traveler, trIdx) => (
                      <div
                        key={`custom-split-item-${traveler}-${trIdx}`}
                        className="flex items-center justify-between space-x-2 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800"
                      >
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px]">
                          {traveler}
                        </span>
                        <div className="flex items-center space-x-1 shrink-0">
                          <span className="text-[10px] text-slate-400 font-mono">{expenseSpendCurrency}</span>
                          <input
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={customSplitAmounts[traveler] || ''}
                            onChange={(e) =>
                              setCustomSplitAmounts((prev) => ({
                                ...prev,
                                [traveler]: e.target.value,
                              }))
                            }
                            className="w-20 text-xs px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none font-mono text-right text-slate-800 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Attachments */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <AttachmentManager
              attachments={attachments}
              onChange={setAttachments}
              title="Receipts & Attachments"
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              {currentEditingId ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>

        <AttachmentViewerModal
          isOpen={isViewerOpen}
          onClose={() => setIsViewerOpen(false)}
          fileName={attachmentName}
          fileData={attachmentData}
          title={attachmentName ? `Attachment - ${attachmentName}` : 'View Attachment'}
        />

        {/* Custom Selection Bottom Sheets */}
        <SelectionBottomSheet
          isOpen={activePicker === 'spendCurrency'}
          onClose={() => setActivePicker(null)}
          title="Select Currency"
          options={currencyOptions}
          selectedValue={expenseSpendCurrency}
          onSelect={handleSpendCurrencyChange}
        />

        <SelectionBottomSheet
          isOpen={activePicker === 'paidBy'}
          onClose={() => setActivePicker(null)}
          title="Select Traveler"
          options={travelerOptions}
          selectedValue={expensePaidBy}
          onSelect={(val) => {
            setExpensePaidBy(val);
            if (transactionType === 'peer_transfer' && transferTo === val) {
              const other = (activeTrip.travelers || []).find((t) => t !== val) || '';
              setTransferTo(other);
            }
          }}
        />

        <SelectionBottomSheet
          isOpen={activePicker === 'category'}
          onClose={() => setActivePicker(null)}
          title="Select Expense Category"
          options={categoryOptions}
          selectedValue={expenseCategory}
          onSelect={(val) => setExpenseCategory(val)}
        />

        <SelectionBottomSheet
          isOpen={activePicker === 'paymentType'}
          onClose={() => setActivePicker(null)}
          title="Select Payment Method"
          options={paymentMethodOptions}
          selectedValue={expensePaymentType}
          onSelect={(val) => setExpensePaymentType(val)}
        />

        <SelectionBottomSheet
          isOpen={activePicker === 'fromCurrency'}
          onClose={() => setActivePicker(null)}
          title="Select Source Currency"
          options={currencyOptions}
          selectedValue={expenseSpendCurrency}
          onSelect={(newFrom) => {
            setExpenseSpendCurrency(newFrom);
            const targetCurr = forexToCurrency || activeTrip.baseCurrency || 'USD';
            const newRate = getSetupExchangeRate(activeTrip, targetCurr, newFrom);
            setExpenseExchangeRate(String(newRate));
            const fromNum = parseFloat(expenseSpendAmount);
            if (!isNaN(fromNum) && fromNum > 0 && newRate > 0) {
              setForexToAmount((fromNum * newRate).toFixed(2));
            }
          }}
        />

        <SelectionBottomSheet
          isOpen={activePicker === 'toCurrency'}
          onClose={() => setActivePicker(null)}
          title="Select Destination Currency"
          options={currencyOptions}
          selectedValue={forexToCurrency}
          onSelect={(newTo) => {
            setForexToCurrency(newTo);
            const fromCurr = expenseSpendCurrency || activeTrip.baseCurrency || 'USD';
            const newRate = getSetupExchangeRate(activeTrip, newTo, fromCurr);
            setExpenseExchangeRate(String(newRate));
            const fromNum = parseFloat(expenseSpendAmount);
            if (!isNaN(fromNum) && fromNum > 0 && newRate > 0) {
              setForexToAmount((fromNum * newRate).toFixed(2));
            }
          }}
        />

        <SelectionBottomSheet
          isOpen={activePicker === 'transferTo'}
          onClose={() => setActivePicker(null)}
          title="Select Recipient"
          options={travelerOptions.filter((opt) => opt.value !== expensePaidBy)}
          selectedValue={transferTo}
          onSelect={(val) => setTransferTo(val)}
        />
      </div>
    </div>,
    document.body
  );
};