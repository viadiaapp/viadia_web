import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Coins, AlertTriangle, Upload, DollarSign, Check, RefreshCw, Trash2, Eye } from 'lucide-react';
import { Trip, Expense, Split, AttachmentItem } from '../types';
import { compressImageFile, validateAttachmentFile, getItemAttachments } from '../lib/imageUtils';
import { DEFAULT_USD_RATES } from '../data/staticCurrencies';
import { getSetupExchangeRate } from '../lib/tripUtils';
import { fetchLiveForexRates } from '../lib/apiUtils';
import { AttachmentViewerModal } from './AttachmentViewerModal';
import { AttachmentManager } from './AttachmentManager';
import { useBackButton } from '../lib/backButtonHandler';

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

  // Sub-modal attachment viewer (priority 110) & main modal (priority 100)
  useBackButton('add-expense-viewer', isViewerOpen, () => setIsViewerOpen(false), 110);
  useBackButton('add-expense-modal', isOpen && !isViewerOpen, onClose, 100);

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

    // Find the expense to edit if any
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
      // New expense defaults
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const val = validateAttachmentFile(file);
    if (!val.valid) {
      setValidationError(val.error || 'Invalid file.');
      return;
    }
    setValidationError(null);
    try {
      const compressed = await compressImageFile(file);
      setAttachmentName(compressed.name);
      setAttachmentData(compressed.data);
    } catch (err) {
      console.error('Error compressing file:', err);
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
      baseAmountNum = 0; // Asset transfer between wallets, not a expense budget hit
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

          {/* Form Fields */}
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

              {/* Currency Restricted strictly to trip currencies list */}
              <div className="space-y-1 min-w-0">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Transaction Currency
                </label>
                <select
                  value={expenseSpendCurrency}
                  onChange={(e) => handleSpendCurrencyChange(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 min-w-0 truncate"
                >
                  <option value={activeTrip.baseCurrency || 'USD'}>
                    {activeTrip.baseCurrency || 'USD'}
                  </option>
                  {(activeTrip.currencies || [])
                    .filter((code) => code !== (activeTrip.baseCurrency || 'USD'))
                    .map((code, cIdx) => (
                      <option key={`modal-spendcurr-${code}-${cIdx}`} value={code}>
                        {code}
                      </option>
                    ))}
                </select>
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
                {expenseSpendCurrency !== (activeTrip.baseCurrency || 'USD') && (
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Pre-populated from trip setup rate ({getSetupExchangeRate(activeTrip, expenseSpendCurrency)}). Click "Live Rate" to fetch market rates.
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Paid By
                </label>
                <select
                  value={expensePaidBy}
                  onChange={(e) => setExpensePaidBy(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                >
                  {(activeTrip.travelers || ['Me']).map((t, tIdx) => (
                    <option key={`modal-paidby-${t}-${tIdx}`} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Category Tag
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                >
                  {Array.from(new Set([
                    ...(activeTrip.categories || ['Food', 'Transport', 'Lodging', 'Activities', 'Other']),
                    ...((activeTrip.expenses || []).map(e => e.category).filter(Boolean) as string[])
                  ]))
                  .filter((cat) => cat !== 'Forex Conversion' && !cat.startsWith('Forex in ') && cat !== 'Settlement' && cat !== 'Peer Transfer')
                  .map((cat, catIdx) => (
                    <option key={`modal-cat-${cat}-${catIdx}`} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                  Payment Method
                </label>
                <select
                  value={expensePaymentType}
                  onChange={(e) => setExpensePaymentType(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                >
                  {availablePaymentMethods.map((pm, pmIdx) => (
                    <option key={`modal-pm-${pm}-${pmIdx}`} value={pm}>
                      {pm}
                    </option>
                  ))}
                  {Array.from(new Set(
                    (activeTrip.expenses || [])
                      .filter((e) => (e.type === 'forex' || e.category === 'Forex Conversion') && e.forexToCurrency)
                      .map((e) => `Forex in ${e.forexToCurrency}`)
                  )).map((forexPt) => (
                    !availablePaymentMethods.includes(forexPt) && (
                      <option key={`forex-${forexPt}`} value={forexPt}>
                        {forexPt}
                      </option>
                    )
                  ))}
                  {expensePaymentType &&
                    !availablePaymentMethods.includes(expensePaymentType) &&
                    !((activeTrip.expenses || []).some(e => (e.type === 'forex' || e.category === 'Forex Conversion') && `Forex in ${e.forexToCurrency}` === expensePaymentType)) && (
                      <option value={expensePaymentType}>{expensePaymentType}</option>
                    )}
                </select>
              </div>
            </div>
          )}

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

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Converted By
                  </label>
                  <select
                    value={expensePaidBy}
                    onChange={(e) => setExpensePaidBy(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                  >
                    {(activeTrip.travelers || ['Me']).map((t, tIdx) => (
                      <option key={`forex-modal-paidby-${t}-${tIdx}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    From Currency
                  </label>
                  <select
                    value={expenseSpendCurrency}
                    onChange={(e) => {
                      const newFrom = e.target.value;
                      setExpenseSpendCurrency(newFrom);
                      const targetCurr = forexToCurrency || activeTrip.baseCurrency || 'USD';
                      const newRate = getSetupExchangeRate(activeTrip, targetCurr, newFrom);
                      setExpenseExchangeRate(String(newRate));
                      const fromNum = parseFloat(expenseSpendAmount);
                      if (!isNaN(fromNum) && fromNum > 0 && newRate > 0) {
                        setForexToAmount((fromNum * newRate).toFixed(2));
                      } else {
                        const toNum = parseFloat(forexToAmount);
                        if (!isNaN(toNum) && toNum > 0 && newRate > 0) {
                          setExpenseSpendAmount((toNum / newRate).toFixed(2));
                        }
                      }
                    }}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                  >
                    <option value={activeTrip.baseCurrency || 'USD'}>{activeTrip.baseCurrency || 'USD'}</option>
                    {(activeTrip.currencies || [])
                      .filter((c) => c !== (activeTrip.baseCurrency || 'USD'))
                      .map((c, cIdx) => (
                        <option key={`forex-modal-fromcurr-${c}-${cIdx}`} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
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

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    To Currency
                  </label>
                  <select
                    value={forexToCurrency}
                    onChange={(e) => {
                      const newTo = e.target.value;
                      setForexToCurrency(newTo);
                      const fromCurr = expenseSpendCurrency || activeTrip.baseCurrency || 'USD';
                      const newRate = getSetupExchangeRate(activeTrip, newTo, fromCurr);
                      setExpenseExchangeRate(String(newRate));
                      const fromNum = parseFloat(expenseSpendAmount);
                      if (!isNaN(fromNum) && fromNum > 0 && newRate > 0) {
                        setForexToAmount((fromNum * newRate).toFixed(2));
                      } else {
                        const toNum = parseFloat(forexToAmount);
                        if (!isNaN(toNum) && toNum > 0 && newRate > 0) {
                          setExpenseSpendAmount((toNum / newRate).toFixed(2));
                        }
                      }
                    }}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                  >
                    {(activeTrip.currencies || [activeTrip.baseCurrency || 'USD']).map((c, cIdx) => (
                      <option key={`forex-modal-tocurr-${c}-${cIdx}`} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
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

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Sender (From Person)
                  </label>
                  <select
                    value={expensePaidBy}
                    onChange={(e) => {
                      const sender = e.target.value;
                      setExpensePaidBy(sender);
                      if (transferTo === sender) {
                        const other = (activeTrip.travelers || []).find((t) => t !== sender) || '';
                        setTransferTo(other);
                      }
                    }}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                  >
                    {(activeTrip.travelers || ['Me']).map((t, tIdx) => (
                      <option key={`transfer-modal-paidby-${t}-${tIdx}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Recipient (To Person)
                  </label>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                  >
                    {(activeTrip.travelers || ['Me'])
                      .filter((t) => t !== expensePaidBy)
                      .map((t, tIdx) => (
                        <option key={`transfer-modal-recipient-${t}-${tIdx}`} value={t}>
                          {t}
                        </option>
                      ))}
                  </select>
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

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Transfer Currency
                  </label>
                  <select
                    value={expenseSpendCurrency}
                    onChange={(e) => handleSpendCurrencyChange(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                  >
                    <option value={activeTrip.baseCurrency || 'USD'}>{activeTrip.baseCurrency || 'USD'}</option>
                    {(activeTrip.currencies || [])
                      .filter((c) => c !== (activeTrip.baseCurrency || 'USD'))
                      .map((c, cIdx) => (
                        <option key={`transfer-modal-curr-${c}-${cIdx}`} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Exchange Rate for Peer Transfer when foreign currency selected */}
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
                  {expenseSpendCurrency !== (activeTrip.baseCurrency || 'USD') && (
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Pre-populated from trip setup rate ({getSetupExchangeRate(activeTrip, expenseSpendCurrency)}). Click "Live Rate" to fetch market rates.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Companion Split Section */}
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

                  {(() => {
                    const totalSpend = parseFloat(expenseSpendAmount) || 0;
                    const customSum: number = (Object.values(customSplitAmounts) as string[]).reduce(
                      (sum: number, val: string) => sum + (parseFloat(val) || 0),
                      0
                    );
                    const diff = Number((totalSpend - customSum).toFixed(2));
                    return (
                      <div className="flex items-center justify-between text-[11px] font-bold px-1 text-slate-500">
                        <span>
                          Custom Total: <span className="font-mono text-slate-800 dark:text-slate-200">{customSum.toFixed(2)} {expenseSpendCurrency}</span>
                        </span>
                        {Math.abs(diff) > 0.01 ? (
                          <span className={diff > 0 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-rose-500 font-semibold'}>
                            {diff > 0 ? `${diff.toFixed(2)} unallocated` : `${Math.abs(diff).toFixed(2)} over limit`}
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center space-x-0.5">
                            <Check className="h-3 w-3 inline" />
                            <span>Balanced</span>
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Receipts / Invoices / Photos Attachments */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <AttachmentManager
              attachments={attachments}
              onChange={setAttachments}
              title="Receipts & Attachments"
            />
          </div>

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
      </div>
    </div>,
    document.body
  );
};
