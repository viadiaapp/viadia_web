import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Trip, Expense, Split, AttachmentItem } from "../types";
import { compressImageFile, validateAttachmentFile, getItemAttachments } from "../lib/imageUtils";
import { getSetupExchangeRate } from "../lib/tripUtils";
import { AddExpenseModal } from "./AddExpenseModal";
import { AttachmentViewerModal } from "./AttachmentViewerModal";
import { useBackButton } from "../lib/backButtonHandler";
import { downloadOrShareBase64 } from "../lib/nativeShareDownload";
import emptyTripsImage from "../assets/images/no_money.png";
import {
  DollarSign,
  Plus,
  Trash2,
  Edit,
  CheckSquare,
  AlertTriangle,
  Coins,
  ArrowRight,
  CreditCard,
  PieChart as PieIcon,
  BarChart2,
  List,
  Users,
  Search,
  X,
  Check,
  Eye,
  HelpCircle,
  ArrowUpRight,
  Wallet,
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
  Maximize2,
  FileText,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface ExpenseTrackerProps {
  trips: { [id: string]: Trip };
  onUpdateTrips: (updatedTrips: { [id: string]: Trip }) => void;
  activeTripId: string | null;
  onSetActiveTripId: (id: string | null) => void;
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

const CATEGORY_COLORS: { [key: string]: string } = {
  Food: "#f59e0b", // Warm Amber
  "Airline Tickets": "#3b82f6", // Bright Blue
  Accommodation: "#6366f1", // Royal Indigo
  "Visa Fee": "#8b5cf6", // Purple
  Shopping: "#ec4899", // Pink
  Activities: "#10b981", // Emerald Green
  Transport: "#06b6d4", // Cyan
  Lodging: "#6366f1", // Indigo
  Other: "#64748b", // Slate
};

const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
};

export default function ExpenseTracker({
  trips,
  onUpdateTrips: originalOnUpdateTrips,
  activeTripId,
  onSetActiveTripId,
  isReadOnly,
}: ExpenseTrackerProps) {
  const onUpdateTrips = (updatedTrips: { [id: string]: Trip }) => {
    if (isReadOnly) {
      console.warn("Attempted to update a read-only trip.");
      return;
    }
    originalOnUpdateTrips(updatedTrips);
  };
  const activeTrip = activeTripId ? trips[activeTripId] : null;

  // Layout tabs / sub-views: 'log' | 'balances' | 'analytics'
  const [activeSubView, setActiveSubView] = useState<
    "log" | "balances" | "analytics"
  >("log");

  // Add/Edit modal state
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  // Search and filter state for transaction logs
  const [logSearchQuery, setLogSearchQuery] = useState("");
  const [logSelectedCategory, setLogSelectedCategory] = useState("All");

  // Expense form fields
  const [transactionType, setTransactionType] = useState<
    "expense" | "forex" | "peer_transfer"
  >("expense");
  const [forexToCurrency, setForexToCurrency] = useState("");
  const [forexToAmount, setForexToAmount] = useState("");
  const [transferTo, setTransferTo] = useState("");

  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseSpendAmount, setExpenseSpendAmount] = useState("");
  const [expenseSpendCurrency, setExpenseSpendCurrency] = useState("");
  const [expenseExchangeRate, setExpenseExchangeRate] = useState("1.0");
  const [isFetchingForex, setIsFetchingForex] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState("Food");
  const [expensePaymentType, setExpensePaymentType] = useState("Cash");
  const [expensePaidBy, setExpensePaidBy] = useState("");
  const [expenseSplitType, setExpenseSplitType] = useState<"equal" | "custom">(
    "equal",
  );
  const [expensePlaceId, setExpensePlaceId] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState(formatToDateTimeLocal());

  // Receipt attachment states
  const [receiptAttachmentName, setReceiptAttachmentName] = useState("");
  const [receiptAttachmentData, setReceiptAttachmentData] = useState("");

  // Lightbox Preview Image modal state
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);

  // Attachment Modal Viewer state
  const [attachmentViewer, setAttachmentViewer] = useState<{
    isOpen: boolean;
    fileName?: string;
    fileData?: string;
    attachments?: AttachmentItem[];
    initialIndex?: number;
    title?: string;
    expenseId?: string;
  }>({ isOpen: false });

  // Remove attachment from an existing expense card
  const handleRemoveExpenseAttachment = (expenseId: string, attachmentId?: string) => {
    if (isReadOnly) return;
    const updatedExpenses = (activeTrip.expenses || []).map((exp) => {
      if (exp.id === expenseId) {
        const atts = getItemAttachments(exp);
        const filtered = attachmentId ? atts.filter((a) => a.id !== attachmentId) : [];
        const firstAtt = filtered[0];
        return {
          ...exp,
          attachments: filtered,
          receiptAttachment: firstAtt?.name || undefined,
          receiptAttachmentData: firstAtt?.data || undefined,
          receiptName: firstAtt?.name || undefined,
          receiptData: firstAtt?.data || undefined,
        };
      }
      return exp;
    });
    onUpdateTrips({
      ...trips,
      [activeTrip.id]: {
        ...activeTrip,
        expenses: updatedExpenses,
      },
    });
  };

  const isImageData = (data?: string, filename?: string): boolean => {
    if (data && (data.startsWith('data:image/') || data.startsWith('blob:') || data.startsWith('http://') || data.startsWith('https://'))) {
      return true;
    }
    if (filename) {
      if (filename.startsWith('data:image/') || filename.startsWith('blob:') || filename.startsWith('http://') || filename.startsWith('https://')) return true;
      const ext = filename.toLowerCase().split('.').pop() || '';
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext);
    }
    return false;
  };

  const getImageSrc = (data?: string, filename?: string): string | null => {
    if (data && (data.startsWith('data:image/') || data.startsWith('blob:') || data.startsWith('http://') || data.startsWith('https://'))) {
      return data;
    }
    if (filename && (filename.startsWith('data:image/') || filename.startsWith('blob:') || filename.startsWith('http://') || filename.startsWith('https://'))) {
      return filename;
    }
    return null;
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const val = validateAttachmentFile(file);
      if (!val.valid) {
        alert(val.error || "Invalid file selection.");
        return;
      }
      try {
        const compressed = await compressImageFile(file);
        setReceiptAttachmentName(compressed.name);
        setReceiptAttachmentData(compressed.data);
      } catch (err) {
        console.error('Error compressing receipt file:', err);
      }
    }
  };

  // For custom splits tracking
  const [selectedSplitTravelers, setSelectedSplitTravelers] = useState<
    string[]
  >([]);
  const [customSplits, setCustomSplits] = useState<{
    [travelerName: string]: string;
  }>({});

  // Custom alert / confirmation modal states
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const [settlingDebt, setSettlingDebt] = useState<{
    from: string;
    to: string;
    amount: number;
  } | null>(null);
  const [showSettleSuccess, setShowSettleSuccess] = useState(false);

  // Sub-overlays & modals back button handlers
  useBackButton('expense-preview-image', previewImage !== null, () => setPreviewImage(null), 110);
  useBackButton('expense-attachment-viewer', attachmentViewer.isOpen, () => setAttachmentViewer({ isOpen: false }), 110);
  useBackButton('expense-deleting', deletingExpense !== null, () => { setDeletingExpense(null); setDeletionError(null); }, 110);
  useBackButton('expense-settling-debt', settlingDebt !== null, () => setSettlingDebt(null), 110);

  // Collapsed/Expanded Expense Groups tracker (groupId: boolean)
  const [collapsedExpenseGroups, setCollapsedExpenseGroups] = useState<
    Record<string, boolean>
  >({});

  // Collapsed/Expanded individual Expense logs tracker (expenseId: boolean)
  const [expandedExpenses, setExpandedExpenses] = useState<
    Record<string, boolean>
  >({});

  const toggleExpenseGroupCollapsed = (groupId: string) => {
    setCollapsedExpenseGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const expandAllExpenseGroups = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15);
    }
    setCollapsedExpenseGroups({});
  };

  const collapseAllExpenseGroups = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(15);
    }
    const res = getGroupedExpenses();
    const newCollapsed: Record<string, boolean> = {};
    res.groups.forEach((g) => {
      newCollapsed[g.id] = true;
    });
    setCollapsedExpenseGroups(newCollapsed);
  };

  const toggleExpenseExpanded = (expenseId: string) => {
    setExpandedExpenses((prev) => ({
      ...prev,
      [expenseId]: !prev[expenseId],
    }));
  };

  const getNormalizedSplits = (splits: any, travelers: string[], baseAmount: number): Split[] => {
    if (Array.isArray(splits) && splits.length > 0) {
      return splits.map((s) => {
        if (typeof s === 'object' && s !== null && 'traveler' in s) {
          return { traveler: String(s.traveler), amount: Number(s.amount || 0) };
        }
        return { traveler: String(s), amount: 0 };
      });
    }
    if (splits && typeof splits === 'object' && !Array.isArray(splits)) {
      const keys = Object.keys(splits).filter((k) => splits[k]);
      if (keys.length > 0) {
        const perPerson = Number((baseAmount / keys.length).toFixed(2));
        return keys.map((k) => ({
          traveler: k,
          amount: typeof splits[k] === 'number' ? splits[k] : perPerson,
        }));
      }
    }
    if (travelers && travelers.length > 0) {
      const perPerson = Number((baseAmount / travelers.length).toFixed(2));
      return travelers.map((t) => ({ traveler: t, amount: perPerson }));
    }
    return [];
  };

  // Reset form inputs
  const resetExpenseForm = () => {
    setValidationError(null);
    if (activeTrip) {
      setTransactionType("expense");
      setExpenseTitle("");
      setExpenseSpendAmount("");
      const defaultCurrency = activeTrip.baseCurrency || "USD";
      const pTypes = activeTrip.paymentTypes || ["Cash", "Credit Card"];
      const defaultPType = pTypes[0] || "Cash";
      setExpensePaymentType(defaultPType);

      let nextCurrency = defaultCurrency;
      if (defaultPType.startsWith("Forex in ")) {
        const targetCurr = defaultPType.substring(9).trim();
        if (targetCurr) {
          nextCurrency = targetCurr;
        }
      }
      setExpenseSpendCurrency(nextCurrency);
      setExpensePaidBy(activeTrip.travelers?.[0] || "");
      setSelectedSplitTravelers(activeTrip.travelers || []);

      const fallbackRate = getSetupExchangeRate(activeTrip, nextCurrency);
      setExpenseExchangeRate(fallbackRate.toString());

      const cats = activeTrip.categories || [
        "Food",
        "Transport",
        "Lodging",
        "Activities",
        "Other",
      ];
      setExpenseCategory(cats[0] || "Food");

      setExpenseSplitType("equal");
      setExpensePlaceId("");

      setExpenseDate(formatToDateTimeLocal());

      setCustomSplits({});
      setEditingExpenseId(null);
      setReceiptAttachmentName("");
      setReceiptAttachmentData("");

      // Forex and Transfer defaults
      const otherCurr =
        (activeTrip.currencies || []).find((c) => c !== defaultCurrency) || "";
      setForexToCurrency(otherCurr);
      setForexToAmount("");
      setTransferTo(
        activeTrip.travelers?.find(
          (t) => t !== (activeTrip.travelers?.[0] || ""),
        ) || "",
      );
    }
  };

  // Prepopulate form when opening add/edit
  useEffect(() => {
    if (activeTrip && !editingExpenseId) {
      resetExpenseForm();
    }
  }, [activeTripId, editingExpenseId]);

  // Scroll lock background when expense modal is open
  useEffect(() => {
    if (showExpenseModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showExpenseModal]);

  const handleCloseModal = () => {
    setShowExpenseModal(false);
    resetExpenseForm();
  };

  // Auto-resolve equal currencies in Forex mode to ensure live rates and conversion work perfectly
  useEffect(() => {
    if (activeTrip && transactionType === "forex") {
      if (expenseSpendCurrency && expenseSpendCurrency === forexToCurrency) {
        const base = activeTrip.baseCurrency || "USD";
        const other =
          (activeTrip.currencies || []).find(
            (c) => c !== expenseSpendCurrency,
          ) || (expenseSpendCurrency === base ? "EUR" : base);
        if (other !== forexToCurrency) {
          setForexToCurrency(other);
        }
      }
    }
  }, [expenseSpendCurrency, forexToCurrency, transactionType, activeTrip?.baseCurrency, (activeTrip?.currencies || []).join(',')]);

  // Sync rates when form parameters change
  useEffect(() => {
    if (activeTrip) {
      if (transactionType === "forex") {
        const src = expenseSpendCurrency;
        const tgt = forexToCurrency;
        if (src && tgt) {
          if (src === tgt) {
            setExpenseExchangeRate("1.0");
          } else {
            const base = activeTrip.baseCurrency || "USD";
            const srcRateInBase = getSetupExchangeRate(activeTrip, src, base);
            const tgtRateInBase = getSetupExchangeRate(activeTrip, tgt, base);
            const derivedRate = tgtRateInBase / srcRateInBase;
            setExpenseExchangeRate(derivedRate.toFixed(4));
          }
        }
      } else if (expenseSpendCurrency) {
        const base = activeTrip.baseCurrency || "USD";
        if (expenseSpendCurrency === base) {
          setExpenseExchangeRate("1.0");
        } else {
          const rate = getSetupExchangeRate(activeTrip, expenseSpendCurrency, base);
          setExpenseExchangeRate(rate.toString());
        }
      }
    }
  }, [expenseSpendCurrency, forexToCurrency, transactionType, activeTripId]);

  // Auto dismiss settlement success notification after 5 seconds
  useEffect(() => {
    if (showSettleSuccess) {
      const timer = setTimeout(() => {
        setShowSettleSuccess(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showSettleSuccess]);

  if (!activeTrip) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-[32px] text-center max-w-lg mx-auto shadow-sm space-y-4 transition-colors duration-300">
        <DollarSign className="h-10 w-10 text-indigo-500 mx-auto animate-pulse" />
        <h3 className="text-base font-bold text-slate-800 dark:text-white">
          No Active Trip Selected
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Please select or create a trip in the <strong>Home</strong> tab first
          to launch the Expense Tracker.
        </p>
      </div>
    );
  }

  // Budget calculations
  const totalSpent =
    activeTrip.expenses
      ?.filter(
        (e) =>
          e.type !== "forex" &&
          e.type !== "peer_transfer" &&
          e.category !== "Forex Conversion" &&
          e.category !== "Peer Transfer" &&
          e.category !== "forex conversion" &&
          e.category !== "peer_transfer",
      )
      .reduce((sum, e) => sum + (e.amount || 0), 0) || 0;
  const budgetLimit =
    activeTrip.budgetLimit !== undefined ? activeTrip.budgetLimit : 2500;
  const percentSpent =
    budgetLimit > 0 ? Math.round((totalSpent / budgetLimit) * 100) : 0;

  // Forex / pocket budget calculations
  const forexExpenses = (activeTrip.expenses || []).filter(
    (e) => e.type === "forex",
  );
  const hasForex = forexExpenses.length > 0;
  const baseCurrency = activeTrip.baseCurrency || "USD";

  // 1. Initial base currency converted away
  const totalBaseConverted = forexExpenses
    .filter((e) => e.spendCurrency === baseCurrency)
    .reduce((sum, e) => sum + (e.spendAmount || e.amount), 0);

  // 2. Base currency budget starting amount
  const baseInitialBudget = budgetLimit - totalBaseConverted;

  // 3. Spends in base currency (excluding forex conversions and peer transfers, and excluding those paid with Forex wallet categories)
  const totalBaseSpent = (activeTrip.expenses || [])
    .filter(
      (e) =>
        e.type !== "forex" &&
        e.type !== "peer_transfer" &&
        !(e.paymentType && e.paymentType.startsWith("Forex in ")),
    )
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const baseRemainingBalance = baseInitialBudget - totalBaseSpent;

  // Now other currencies pocket balances
  const currencyBalances: {
    [curr: string]: { initial: number; spent: number; remaining: number };
  } = {};

  // Accumulate target currencies from forex conversions
  forexExpenses.forEach((e) => {
    if (e.forexToCurrency && e.forexToCurrency !== baseCurrency) {
      if (!currencyBalances[e.forexToCurrency]) {
        currencyBalances[e.forexToCurrency] = {
          initial: 0,
          spent: 0,
          remaining: 0,
        };
      }
      currencyBalances[e.forexToCurrency].initial += e.forexToAmount || 0;
    }
  });

  // Accumulate expenditures in those currencies (Only those paid with 'Forex in {CurrencyCode}' category)
  (activeTrip.expenses || []).forEach((e) => {
    if (
      e.type !== "forex" &&
      e.type !== "peer_transfer" &&
      e.paymentType &&
      e.paymentType.startsWith("Forex in ")
    ) {
      const targetCurrency = e.paymentType.replace("Forex in ", "").trim();
      if (targetCurrency) {
        if (!currencyBalances[targetCurrency]) {
          currencyBalances[targetCurrency] = {
            initial: 0,
            spent: 0,
            remaining: 0,
          };
        }
        currencyBalances[targetCurrency].spent +=
          e.spendAmount || e.amount || 0;
      }
    }
  });

  // Compute final balances
  Object.keys(currencyBalances).forEach((curr) => {
    currencyBalances[curr].remaining =
      currencyBalances[curr].initial - currencyBalances[curr].spent;
  });

  // Debt & Balances engine
  const calculateDebtsAndBalances = () => {
    const travelers = activeTrip.travelers || [];
    const expenses = activeTrip.expenses || [];

    const netBalances: { [name: string]: number } = {};
    travelers.forEach((t) => {
      netBalances[t] = 0;
    });

    expenses.forEach((exp) => {
      if (netBalances[exp.paidBy] !== undefined) {
        netBalances[exp.paidBy] += exp.amount;
      }
      (exp.splits || []).forEach((s) => {
        if (netBalances[s.traveler] !== undefined) {
          netBalances[s.traveler] -= s.amount;
        }
      });
    });

    const solvedDebts: { from: string; to: string; amount: number }[] = [];

    const debtors = Object.keys(netBalances)
      .map((name) => ({ name, balance: netBalances[name] }))
      .filter((x) => x.balance < -0.01)
      .sort((a, b) => a.balance - b.balance);

    const creditors = Object.keys(netBalances)
      .map((name) => ({ name, balance: netBalances[name] }))
      .filter((x) => x.balance > 0.01)
      .sort((a, b) => b.balance - a.balance);

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const amountToPay = Math.min(-debtor.balance, creditor.balance);
      if (amountToPay > 0.01) {
        solvedDebts.push({
          from: debtor.name,
          to: creditor.name,
          amount: Math.round(amountToPay * 100) / 100,
        });
      }

      debtor.balance += amountToPay;
      creditor.balance -= amountToPay;

      if (Math.abs(debtor.balance) < 0.01) dIdx++;
      if (Math.abs(creditor.balance) < 0.01) cIdx++;
    }

    return { netBalances, solvedDebts };
  };

  const { netBalances, solvedDebts } = calculateDebtsAndBalances();

  // Fetch live Forex for current form currency
  const handleFetchExchangeRate = async () => {
    const isForex = transactionType === "forex";
    const base = isForex
      ? expenseSpendCurrency
      : activeTrip.baseCurrency || "USD";
    const target = isForex ? forexToCurrency : expenseSpendCurrency;

    if (!base || !target || target === base) {
      setExpenseExchangeRate("1.0");
      if (isForex) {
        if (expenseSpendAmount) {
          setForexToAmount(expenseSpendAmount);
        } else if (forexToAmount) {
          setExpenseSpendAmount(forexToAmount);
        }
      }
      return;
    }

    setIsFetchingForex(true);
    try {
      const res = await fetch(`/api/forex/${encodeURIComponent(base)}`);
      if (!res.ok) throw new Error("API request failed");
      const data = await res.json();
      if (data && data.rates && data.rates[target]) {
        const fetchedRate = Number(data.rates[target]);
        if (!isNaN(fetchedRate) && fetchedRate > 0) {
          let dateAdjustment = 1.0;
          if (expenseDate) {
            let hash = 0;
            for (let i = 0; i < expenseDate.length; i++) {
              hash = expenseDate.charCodeAt(i) + ((hash << 5) - hash);
            }
            const percentVar = (hash % 20) / 1000; // -2% to +2%
            dateAdjustment = 1.0 + percentVar;
          }
          const finalRate =
            Math.round(fetchedRate * dateAdjustment * 10000) / 10000;
          setExpenseExchangeRate(finalRate.toString());
          if (isForex) {
            const amt = Number(expenseSpendAmount);
            if (!isNaN(amt) && amt > 0) {
              setForexToAmount((amt * finalRate).toFixed(2));
            } else {
              const toAmt = Number(forexToAmount);
              if (!isNaN(toAmt) && toAmt > 0 && finalRate > 0) {
                setExpenseSpendAmount((toAmt / finalRate).toFixed(2));
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Forex fetch failed, falling back:", err);
      const fallback = getSetupExchangeRate(activeTrip, target, base);
      setExpenseExchangeRate(fallback.toString());
      if (isForex) {
        const amt = Number(expenseSpendAmount);
        if (!isNaN(amt) && amt > 0) {
          setForexToAmount((amt * fallback).toFixed(2));
        } else {
          const toAmt = Number(forexToAmount);
          if (!isNaN(toAmt) && toAmt > 0 && fallback > 0) {
            setExpenseSpendAmount((toAmt / fallback).toFixed(2));
          }
        }
      }
    } finally {
      setIsFetchingForex(false);
    }
  };

  const handleSpendCurrencyChange = (newCurr: string) => {
    setExpenseSpendCurrency(newCurr);
    const rate = getSetupExchangeRate(activeTrip, newCurr);
    setExpenseExchangeRate(String(rate));
  };

  // Submit add or edit expense
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isReadOnly) {
      setValidationError(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }

    try {
      if (transactionType === "expense" && !expenseTitle.trim()) {
        setValidationError("Please enter an expense title.");
        return;
      }
      if (
        !expenseSpendAmount ||
        isNaN(Number(expenseSpendAmount)) ||
        Number(expenseSpendAmount) <= 0
      ) {
        setValidationError("Please enter a valid positive spend amount.");
        return;
      }
      if (!expensePaidBy) {
        setValidationError(
          "Please select who paid / handled this transaction.",
        );
        return;
      }

      const totalSpendAmount = Number(expenseSpendAmount);
      if (isNaN(totalSpendAmount) || totalSpendAmount <= 0) {
        setValidationError("Spend amount must be a valid positive number.");
        return;
      }

      const spendCurrency =
        expenseSpendCurrency || activeTrip.baseCurrency || "USD";
      const rateInput = Number(expenseExchangeRate);
      const rate =
        isNaN(rateInput) || rateInput <= 0
          ? activeTrip.exchangeRates?.[spendCurrency] || 1.0
          : rateInput;
      const totalBaseAmount = Math.round((totalSpendAmount / rate) * 100) / 100;

      const travelers = activeTrip.travelers || [];
      let computedSplits: Split[] = [];
      let payload: Expense;

      if (transactionType === "forex") {
        const toAmt = Number(forexToAmount);
        if (isNaN(toAmt) || toAmt <= 0) {
          setValidationError("Please enter a valid target Forex amount.");
          return;
        }
        if (!forexToCurrency) {
          setValidationError("Please select a target Forex currency.");
          return;
        }
        if (forexToCurrency === spendCurrency) {
          setValidationError(
            "Source and target currency must be different for forex conversion.",
          );
          return;
        }

        payload = {
          id: editingExpenseId || `forex-${Date.now()}`,
          type: "forex",
          title:
            expenseTitle.trim() ||
            `Exchanged ${totalSpendAmount} ${spendCurrency} to ${toAmt} ${forexToCurrency}`,
          amount: 0, // Forex conversion is an asset transfer, not a budget spend
          spendAmount: totalSpendAmount,
          spendCurrency: spendCurrency,
          exchangeRate: rate,
          forexToAmount: toAmt,
          forexToCurrency: forexToCurrency,
          category: "Forex Conversion",
          paymentType: expensePaymentType,
          paidBy: expensePaidBy,
          splitType: "equal",
          splits: [],
          placeId: expensePlaceId || null,
          date: expenseDate,
        };
      } else if (transactionType === "peer_transfer") {
        if (!transferTo) {
          setValidationError(
            "Please select a recipient for this peer money transfer.",
          );
          return;
        }
        if (transferTo === expensePaidBy) {
          setValidationError("Sender and Recipient cannot be the same person.");
          return;
        }

        computedSplits = travelers.map((name) => ({
          traveler: name,
          amount: name === transferTo ? totalBaseAmount : 0,
        }));

        payload = {
          id: editingExpenseId || `peer-${Date.now()}`,
          type: "peer_transfer",
          title:
            expenseTitle.trim() ||
            `Transfer: ${expensePaidBy} paid ${transferTo}`,
          amount: totalBaseAmount,
          spendAmount: totalSpendAmount,
          spendCurrency: spendCurrency,
          exchangeRate: rate,
          category: "Peer Transfer",
          paymentType: expensePaymentType,
          paidBy: expensePaidBy,
          splitType: "custom",
          splits: computedSplits,
          placeId: expensePlaceId || null,
          date: expenseDate,
        };
      } else {
        if (expenseSplitType === "equal") {
          const shareInBase = totalBaseAmount / travelers.length;
          computedSplits = travelers.map((name) => ({
            traveler: name,
            amount: Math.round(shareInBase * 100) / 100,
          }));
        } else {
          if (selectedSplitTravelers.length === 0) {
            setValidationError(
              "Please select at least one companion who owes for this expense!",
            );
            return;
          }

          let explicitSpendSum = 0;
          const explicitAmtTravelers: string[] = [];
          const equalSplitTravelers: string[] = [];

          selectedSplitTravelers.forEach((name) => {
            const valStr = customSplits[name];
            const val = valStr ? parseFloat(valStr) : 0;
            if (val > 0) {
              explicitSpendSum += val;
              explicitAmtTravelers.push(name);
            } else {
              equalSplitTravelers.push(name);
            }
          });

          if (explicitSpendSum > totalSpendAmount + 0.01) {
            setValidationError(
              `The sum of explicit amounts (${explicitSpendSum}) cannot exceed the total amount (${totalSpendAmount})!`,
            );
            return;
          }

          const spendRemainder = totalSpendAmount - explicitSpendSum;
          let spendShare = 0;
          if (equalSplitTravelers.length > 0) {
            spendShare = spendRemainder / equalSplitTravelers.length;
          } else if (Math.abs(spendRemainder) > 0.01) {
            setValidationError(
              `The sum of custom amounts (${explicitSpendSum}) does not equal the total expense amount (${totalSpendAmount})!`,
            );
            return;
          }

          computedSplits = travelers.map((name) => {
            if (!selectedSplitTravelers.includes(name)) {
              return { traveler: name, amount: 0 };
            }

            let individualSpendAmount = 0;
            if (explicitAmtTravelers.includes(name)) {
              individualSpendAmount = parseFloat(customSplits[name]) || 0;
            } else {
              individualSpendAmount = spendShare;
            }

            const individualBaseAmount =
              Math.round((individualSpendAmount / rate) * 100) / 100;
            return {
              traveler: name,
              amount: individualBaseAmount,
            };
          });
        }

        payload = {
          id: editingExpenseId || `exp-${Date.now()}`,
          title: expenseTitle.trim(),
          amount: totalBaseAmount,
          spendAmount: totalSpendAmount,
          spendCurrency: spendCurrency,
          category: expenseCategory,
          paymentType: expensePaymentType,
          paidBy: expensePaidBy,
          splitType: expenseSplitType,
          splits: computedSplits,
          placeId: expensePlaceId || null,
          date: expenseDate,
          exchangeRate: rate,
          receiptAttachment: receiptAttachmentName || undefined,
          receiptAttachmentData: receiptAttachmentData || undefined,
        };
      }

      let nextExpenses = [...(activeTrip.expenses || [])];
      if (editingExpenseId) {
        nextExpenses = nextExpenses.map((item) =>
          item.id === editingExpenseId ? payload : item,
        );
      } else {
        nextExpenses.push(payload);
      }

      const updated = { ...trips };
      if (updated[activeTrip.id]) {
        const t = updated[activeTrip.id];
        const currentPaymentTypes = t.paymentTypes || ["Cash", "Credit Card"];
        let nextPaymentTypes = [...currentPaymentTypes];
        if (transactionType === "forex" && forexToCurrency) {
          const categoryName = `Forex in ${forexToCurrency}`;
          if (
            !nextPaymentTypes.some(
              (pt) => pt.toLowerCase() === categoryName.toLowerCase(),
            )
          ) {
            nextPaymentTypes.push(categoryName);
          }
        }
        updated[activeTrip.id] = {
          ...t,
          expenses: nextExpenses,
          paymentTypes: nextPaymentTypes,
        };
      }

      onUpdateTrips(updated);
      setShowExpenseModal(false);
      resetExpenseForm();
    } catch (err: any) {
      console.error("Error logging transaction:", err);
      setValidationError(
        err.message ||
          "An unexpected error occurred while saving the transaction.",
      );
    }
  };

  // Open add expense modal for a specific date
  const handleOpenAddExpenseForDate = (dateStr: string) => {
    resetExpenseForm();
    setExpenseDate(formatToDateTimeLocal(dateStr));
    setShowExpenseModal(true);
  };

  // Edit Expense trigger
  const handleInitiateEdit = (exp: Expense) => {
    setEditingExpenseId(exp.id);
    setExpenseTitle(exp.title);
    setExpenseSpendAmount(String(exp.spendAmount || exp.amount));
    const spendCurr = exp.spendCurrency || activeTrip.baseCurrency || "USD";
    setExpenseSpendCurrency(spendCurr);
    const baseCurr = activeTrip.baseCurrency || "USD";
    if (
      exp.exchangeRate &&
      Number(exp.exchangeRate) > 0 &&
      !(spendCurr === baseCurr && Number(exp.exchangeRate) !== 1.0)
    ) {
      setExpenseExchangeRate(String(exp.exchangeRate));
    } else {
      setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, spendCurr)));
    }
    setExpenseCategory(exp.category || "Food");
    setExpensePaymentType(exp.paymentType || "Cash");
    setExpensePaidBy(exp.paidBy);
    setExpenseSplitType(exp.splitType || "equal");
    setExpensePlaceId(exp.placeId || "");
    setExpenseDate(formatToDateTimeLocal(exp.date));
    setReceiptAttachmentName(exp.receiptAttachment || "");
    setReceiptAttachmentData(exp.receiptAttachmentData || "");

    const txType = exp.type || "expense";
    setTransactionType(txType);

    if (txType === "forex") {
      setForexToCurrency(exp.forexToCurrency || "");
      setForexToAmount(String(exp.forexToAmount || ""));
    } else if (txType === "peer_transfer") {
      const activeSplits = exp.splits || [];
      const receiver =
        activeSplits.find((s) => s.amount > 0.01)?.traveler || "";
      setTransferTo(receiver);
    }

    if (exp.splitType === "custom" && txType !== "peer_transfer") {
      const activeSplits = exp.splits || [];
      const checked: string[] = [];
      const splitsObj: { [traveler: string]: string } = {};

      activeSplits.forEach((s) => {
        if (s.amount > 0) {
          checked.push(s.traveler);
          // Convert back to spend currency for editing
          const rate = exp.exchangeRate || 1.0;
          const originalShare = Math.round(s.amount * rate * 100) / 100;
          splitsObj[s.traveler] = String(originalShare);
        }
      });
      setSelectedSplitTravelers(checked);
      setCustomSplits(splitsObj);
    } else {
      setSelectedSplitTravelers(activeTrip.travelers || []);
      setCustomSplits({});
    }

    setShowExpenseModal(true);
  };

  // Delete Expense
  const handleDeleteExpense = (expenseId: string) => {
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }
    const target = (activeTrip.expenses || []).find((e) => e.id === expenseId);
    if (target) {
      setDeletionError(null);
      setDeletingExpense(target);
    }
  };

  const confirmDeleteExpense = () => {
    if (!deletingExpense) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }

    if (deletingExpense.type === "forex" && deletingExpense.forexToCurrency) {
      const targetCurrency = deletingExpense.forexToCurrency;
      const categoryName = `Forex in ${targetCurrency}`;
      const hasAssociatedExpenses = (activeTrip.expenses || []).some(
        (e) =>
          e.type !== "forex" &&
          e.paymentType &&
          e.paymentType.toLowerCase() === categoryName.toLowerCase(),
      );

      if (hasAssociatedExpenses) {
        const errorMsg =
          "the forex conversion record couldn't be deleted as there is an associated expense.";
        console.log(errorMsg);
        setDeletionError(errorMsg);
        return;
      }
    }

    const nextExpenses = (activeTrip.expenses || []).filter(
      (e) => e.id !== deletingExpense.id,
    );
    const updated = { ...trips };
    if (updated[activeTrip.id]) {
      const t = updated[activeTrip.id];
      let nextPaymentTypes = t.paymentTypes || ["Cash", "Credit Card"];
      if (deletingExpense.type === "forex" && deletingExpense.forexToCurrency) {
        const targetCurrency = deletingExpense.forexToCurrency;
        const categoryName = `Forex in ${targetCurrency}`;
        nextPaymentTypes = nextPaymentTypes.filter(
          (pt) => pt.toLowerCase() !== categoryName.toLowerCase(),
        );
      }
      updated[activeTrip.id] = {
        ...t,
        expenses: nextExpenses,
        paymentTypes: nextPaymentTypes,
      };
    }
    onUpdateTrips(updated);
    setDeletingExpense(null);
    setDeletionError(null);
  };

  // Peer-to-peer Settle Balance trigger
  const handleSettleDebt = (debt: {
    from: string;
    to: string;
    amount: number;
  }) => {
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }
    setSettlingDebt(debt);
  };

  const confirmSettleDebt = () => {
    if (!settlingDebt) return;
    if (isReadOnly) {
      throw new Error(
        "Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.",
      );
    }
    const { from, to, amount } = settlingDebt;

    // Build the double-entry offset transaction
    const baseCurrency = activeTrip.baseCurrency || "USD";
    const settlementExpense: Expense = {
      id: `settle-${Date.now()}`,
      type: "peer_transfer",
      title: `Settle: ${from} paid ${to}`,
      amount: amount,
      spendAmount: amount,
      spendCurrency: baseCurrency,
      category: "Peer Transfer",
      paymentType: "Cash",
      paidBy: from,
      splitType: "custom",
      splits: (activeTrip.travelers || []).map((name) => ({
        traveler: name,
        amount: name === to ? amount : 0,
      })),
      placeId: null,
      date: formatToDateTimeLocal(),
      exchangeRate: 1.0,
    };

    const nextExpenses = [...(activeTrip.expenses || []), settlementExpense];
    const updated = { ...trips };
    if (updated[activeTrip.id]) {
      updated[activeTrip.id] = {
        ...updated[activeTrip.id],
        expenses: nextExpenses,
      };
    }
    onUpdateTrips(updated);
    setSettlingDebt(null);
    setShowSettleSuccess(true);
  };

  // Helper selectors toggle
  const toggleTravelerSplitCheckbox = (name: string) => {
    if (selectedSplitTravelers.includes(name)) {
      setSelectedSplitTravelers(
        selectedSplitTravelers.filter((t) => t !== name),
      );
    } else {
      setSelectedSplitTravelers([...selectedSplitTravelers, name]);
    }
  };

  // Analytics helper functions
  const getCategoryData = () => {
    const categories: { [cat: string]: number } = {};
    const allowedCats = activeTrip.categories || [
      "Food",
      "Transport",
      "Lodging",
      "Activities",
      "Other",
    ];

    allowedCats.forEach((cat) => {
      categories[cat] = 0;
    });

    const expenses = (activeTrip.expenses || []).filter(
      (exp) =>
        exp.type !== "peer_transfer" &&
        exp.category !== "Peer Transfer" &&
        exp.category !== "peer_transfer"
    );
    expenses.forEach((exp) => {
      let cat = exp.category || "Other";
      if (exp.type === "forex" || cat === "Forex Conversion" || cat === "forex conversion") {
        cat = exp.forexToCurrency ? `Forex in ${exp.forexToCurrency}` : "Forex Conversion";
      }
      if (categories[cat] !== undefined) {
        categories[cat] += exp.amount;
      } else {
        categories[cat] = exp.amount;
      }
    });

    return Object.keys(categories)
      .map((name) => ({
        name,
        value: Math.round(categories[name] * 100) / 100,
        color: CATEGORY_COLORS[name] || stringToColor(name),
      }))
      .filter((item) => item.value > 0);
  };

  const getPayerData = () => {
    const payers: { [name: string]: number } = {};
    (activeTrip.travelers || []).forEach((t) => {
      payers[t] = 0;
    });

    (activeTrip.expenses || []).forEach((exp) => {
      if (
        exp.type !== "forex" &&
        exp.type !== "peer_transfer" &&
        exp.category !== "Forex Conversion" &&
        exp.category !== "Peer Transfer" &&
        exp.category !== "forex conversion" &&
        exp.category !== "peer_transfer"
      ) {
        if (payers[exp.paidBy] !== undefined) {
          payers[exp.paidBy] += exp.amount;
        }
      }
    });

    return Object.keys(payers).map((name) => ({
      name,
      Spent: Math.round(payers[name] * 100) / 100,
    }));
  };

  const categoryData = getCategoryData();
  const payerData = getPayerData();

  // Helper to generate dates between startDate and endDate
  const getDatesInRangeLocal = (
    startDateStr: string,
    endDateStr: string,
  ): string[] => {
    const dates: string[] = [];
    if (!startDateStr) return dates;

    const start = new Date(startDateStr);
    const end = endDateStr ? new Date(endDateStr) : new Date(startDateStr);

    const current = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );

    let safetyCounter = 0;
    while (current <= last && safetyCounter < 100) {
      dates.push(current.toISOString().split("T")[0]);
      current.setUTCDate(current.getUTCDate() + 1);
      safetyCounter++;
    }
    return dates;
  };

  interface ExpenseGroup {
    id: string;
    title: string;
    subtitle: string;
    dateString?: string;
    dayNumber?: number;
    expenses: Expense[];
    type: "before" | "day" | "after";
  }

  const getGroupedExpenses = (): {
    groups: ExpenseGroup[];
    totalCount: number;
  } => {
    const expenses = (activeTrip.expenses || []).filter((exp) => {
      const matchesSearch =
        exp.title.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        exp.paidBy.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
        (exp.paymentType || "")
          .toLowerCase()
          .includes(logSearchQuery.toLowerCase());

      const matchesCategory =
        logSelectedCategory === "All" || exp.category === logSelectedCategory;

      return matchesSearch && matchesCategory;
    });

    expenses.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const startStr = activeTrip.startDate;
    const endStr = activeTrip.endDate;

    const beforeGroup: ExpenseGroup = {
      id: "before",
      title: "Before Trip",
      subtitle: "Pre-departure preparations and bookings",
      expenses: [],
      type: "before",
    };

    const afterGroup: ExpenseGroup = {
      id: "after",
      title: "After Trip",
      subtitle: "Post-trip settlements and expenses",
      expenses: [],
      type: "after",
    };

    const dayGroups: ExpenseGroup[] = [];
    if (startStr) {
      const dates = getDatesInRangeLocal(startStr, endStr);
      dates.forEach((date, index) => {
        dayGroups.push({
          id: `day-${index + 1}`,
          title: `Day ${index + 1}`,
          subtitle: new Date(date + "T00:00:00").toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
          dateString: date,
          dayNumber: index + 1,
          expenses: [],
          type: "day",
        });
      });
    }

    expenses.forEach((exp) => {
      const expDateOnly = exp.date ? exp.date.split("T")[0] : "";
      if (!startStr) {
        beforeGroup.expenses.push(exp);
        return;
      }

      if (expDateOnly < startStr) {
        beforeGroup.expenses.push(exp);
      } else if (endStr && expDateOnly > endStr) {
        afterGroup.expenses.push(exp);
      } else {
        const match = dayGroups.find((dg) => dg.dateString === expDateOnly);
        if (match) {
          match.expenses.push(exp);
        } else {
          beforeGroup.expenses.push(exp);
        }
      }
    });

    const isFiltering =
      logSearchQuery.trim() !== "" || logSelectedCategory !== "All";

    if (isFiltering) {
      const allGroups: ExpenseGroup[] = [];
      if (beforeGroup.expenses.length > 0) allGroups.push(beforeGroup);
      dayGroups.forEach((dg) => {
        if (dg.expenses.length > 0) allGroups.push(dg);
      });
      if (afterGroup.expenses.length > 0) allGroups.push(afterGroup);
      return { groups: allGroups, totalCount: expenses.length };
    } else {
      const allGroups: ExpenseGroup[] = [];
      if (beforeGroup.expenses.length > 0) {
        allGroups.push(beforeGroup);
      }
      if (dayGroups.length > 0) {
        allGroups.push(...dayGroups);
      } else {
        if (
          beforeGroup.expenses.length === 0 &&
          afterGroup.expenses.length === 0 &&
          expenses.length > 0
        ) {
          beforeGroup.expenses = expenses;
          allGroups.push(beforeGroup);
        }
      }
      if (afterGroup.expenses.length > 0) {
        allGroups.push(afterGroup);
      }
      return { groups: allGroups, totalCount: expenses.length };
    }
  };

  const groupedResult = getGroupedExpenses();

  return (
    <div className="w-full space-y-6 text-left">
      {/* 1. BUDGET TRACKER ON THE TOP */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs text-left">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-baseline space-x-2">
              <h2 className="text-3xl font-black font-sans text-slate-900 dark:text-white">
                {activeTrip.baseCurrency || "USD"}{" "}
                {totalSpent.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                spent of {activeTrip.baseCurrency || "USD"} {budgetLimit} limit
              </span>
            </div>
          </div>

          {!isReadOnly && (
            <button
              onClick={() => {
                resetExpenseForm();
                setShowExpenseModal(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-2xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:indigo-900 text-xs font-bold transition shadow-sm cursor-pointer self-start md:self-center"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Expense</span>
            </button>
          )}
        </div>

        {/* Progress gauge bar */}
        <div className="mt-5 space-y-2">
          <div className="w-full bg-slate-100 dark:bg-slate-950 h-3.5 rounded-full overflow-hidden border border-slate-200/60 dark:border-slate-800 shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentSpent >= 100
                  ? "bg-rose-500"
                  : percentSpent >= 80
                    ? "bg-amber-500"
                    : "bg-indigo-600"
              }`}
              style={{ width: `${Math.min(percentSpent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500">
            <span>{percentSpent}% consumed</span>
            <span>
              {activeTrip.baseCurrency || "USD"}{" "}
              {Math.max(0, budgetLimit - totalSpent).toFixed(2)} remaining
            </span>
          </div>
        </div>

        {/* Currency-wise pockets/wallets (Only visible if forex conversion has occurred) */}
        {hasForex && (
          <div className="mt-4 pt-3.5 border-t border-slate-150 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center space-x-2 mb-2">
              <Wallet className="h-3.5 w-3.5 text-indigo-500" />
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Pocket Balances
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {/* Base Currency balance pocket */}
              {(() => {
                const baseSpentPercent =
                  baseInitialBudget > 0
                    ? Math.round((totalBaseSpent / baseInitialBudget) * 100)
                    : 0;
                return (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-400">
                      <span>{baseCurrency} Pocket</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200">
                        {baseCurrency}{" "}
                        {baseRemainingBalance.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/60 shadow-inner">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          baseSpentPercent >= 100
                            ? "bg-rose-500"
                            : baseSpentPercent >= 80
                              ? "bg-amber-500"
                              : "bg-indigo-600"
                        }`}
                        style={{ width: `${Math.min(baseSpentPercent, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500">
                      <span>{baseSpentPercent}% consumed</span>
                      <span>
                        {baseRemainingBalance < 0
                          ? "Overspent!"
                          : `${baseCurrency} ${Math.max(0, baseRemainingBalance).toFixed(2)} remaining`}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Target Currencies pockets */}
              {Object.keys(currencyBalances).map((curr, cIdx) => {
                const bal = currencyBalances[curr];
                const targetSpentPercent =
                  bal.initial > 0
                    ? Math.round((bal.spent / bal.initial) * 100)
                    : 0;
                return (
                  <div key={`curr-pocket-${curr}-${cIdx}`} className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-400">
                      <span>{curr} Pocket</span>
                      <span
                        className={`font-mono ${bal.remaining < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"}`}
                      >
                        {curr}{" "}
                        {bal.remaining.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/60 shadow-inner">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          targetSpentPercent >= 100
                            ? "bg-rose-500"
                            : targetSpentPercent >= 80
                              ? "bg-amber-500"
                              : "bg-indigo-600"
                        }`}
                        style={{
                          width: `${Math.min(targetSpentPercent, 100)}%`,
                        }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500">
                      <span>{targetSpentPercent}% consumed</span>
                      <span>
                        {bal.remaining < 0
                          ? "Overspent!"
                          : `${curr} ${Math.max(0, bal.remaining).toFixed(2)} remaining`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* System boundary warning tags */}
        {percentSpent >= 100 && (
          <div className="mt-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-400 p-3.5 rounded-2xl flex items-start space-x-3 text-xs leading-normal">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <strong>Limit boundary exceeded!</strong> You have spent{" "}
              <strong>
                {activeTrip.baseCurrency || "USD"}{" "}
                {(totalSpent - budgetLimit).toFixed(2)}
              </strong>{" "}
              more than your customized boundary limit of{" "}
              <strong>
                {activeTrip.baseCurrency || "USD"} {budgetLimit}
              </strong>
              . Consider auditing miscellaneous costs.
            </div>
          </div>
        )}
        {percentSpent >= 80 && percentSpent < 100 && (
          <div className="mt-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-400 p-3.5 rounded-2xl flex items-start space-x-3 text-xs leading-normal">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>Approaching budget threshold.</strong> You have reached{" "}
              <strong>{percentSpent}%</strong> of your designated limit. We
              recommend monitoring costs.
            </div>
          </div>
        )}
      </div>

      {/* 2. DYNAMIC ICON-DRIVEN NAVIGATION GRID (Style inspired by reference mockup!) */}
      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={() => setActiveSubView("log")}
          className={`p-4 rounded-3xl border text-center transition flex flex-col items-center justify-center space-y-2 cursor-pointer shadow-sm group ${
            activeSubView === "log"
              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-slate-700"
          }`}
        >
          <div
            className={`p-2.5 rounded-2xl transition ${
              activeSubView === "log"
                ? "bg-indigo-550 text-white"
                : "bg-slate-50 dark:bg-slate-950 text-slate-500"
            }`}
          >
            <List className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-bold tracking-tight">
            Transaction Log
          </span>
        </button>

        <button
          onClick={() => setActiveSubView("balances")}
          className={`p-4 rounded-3xl border text-center transition flex flex-col items-center justify-center space-y-2 cursor-pointer shadow-sm group ${
            activeSubView === "balances"
              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-slate-700"
          }`}
        >
          <div
            className={`p-2.5 rounded-2xl transition ${
              activeSubView === "balances"
                ? "bg-indigo-550 text-white"
                : "bg-slate-50 dark:bg-slate-950 text-slate-500"
            }`}
          >
            <Users className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-bold tracking-tight">
            Balances & Settle
          </span>
        </button>

        <button
          onClick={() => setActiveSubView("analytics")}
          className={`p-4 rounded-3xl border text-center transition flex flex-col items-center justify-center space-y-2 cursor-pointer shadow-sm group ${
            activeSubView === "analytics"
              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-slate-350 dark:hover:border-slate-700"
          }`}
        >
          <div
            className={`p-2.5 rounded-2xl transition ${
              activeSubView === "analytics"
                ? "bg-indigo-550 text-white"
                : "bg-slate-50 dark:bg-slate-950 text-slate-500"
            }`}
          >
            <BarChart2 className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-bold tracking-tight">
            Spend Analytics
          </span>
        </button>
      </div>

      {/* 3. CONDITIONAL VIEWS */}
      <div className="space-y-6 w-full text-left">
        {/* SUBVIEW A: TRANSACTION LOG */}
        {activeSubView === "log" && (
          <div className="space-y-6 text-left w-full">
            <div className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4 text-left w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-white">
                    Transaction Log
                  </h3>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-1.5 w-full sm:w-44 text-[11px] font-medium bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                    />
                    {logSearchQuery && (
                      <button
                        onClick={() => setLogSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <select
                    value={logSelectedCategory}
                    onChange={(e) => setLogSelectedCategory(e.target.value)}
                    className="px-2 py-1.5 text-[11px] font-bold bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  >
                    <option value="All">All Categories</option>
                    {Array.from(
                      new Set([
                        ...(activeTrip.categories || [
                          "Food",
                          "Transport",
                          "Lodging",
                          "Activities",
                          "Other",
                        ]),
                        ...((activeTrip.expenses || [])
                          .map((e) => e.category)
                          .filter(Boolean) as string[]),
                      ]),
                    )
                      .filter((cat) => cat !== "Forex Conversion" && !cat.startsWith("Forex in ") && cat !== "Settlement" && cat !== "Peer Transfer")
                      .map((cat, catIdx) => (
                        <option key={`cat-filter-opt-${cat}-${catIdx}`} value={cat}>
                          {cat}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-1 pt-1">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={expandAllExpenseGroups}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline transition font-bold cursor-pointer"
                  >
                    Expand All
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={collapseAllExpenseGroups}
                    className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline transition font-bold cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
            </div>

            {/* Grouped Transaction Log list - Separate card for each day */}
            {groupedResult.groups.length === 0 ? (
              <div className="w-full aspect-[35/9] min-h-[90px] rounded-3xl border border-dashed border-slate-200/90 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/50 backdrop-blur-xs flex items-center justify-start gap-4 sm:gap-6 px-5 sm:px-8 py-3 overflow-hidden select-none">
                <img
                  src={emptyTripsImage}
                  alt="No transactions"
                  className="h-full max-h-[85%] w-auto object-contain drop-shadow-xs pointer-events-none shrink-0"
                  loading="lazy"
                />
                <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 tracking-tight">
                  No matching transactions logged for this trip.
                </span>
              </div>
            ) : (
              <div className="space-y-6 w-full">
                {groupedResult.groups.map((group, grpIdx) => {
                  const hasExpenses = group.expenses.length > 0;
                  if (!hasExpenses && group.type !== "day") return null;

                  return (
                    <motion.div
                      key={`exp-group-${group.id || 'noid'}-${grpIdx}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3.5 text-left w-full transition-all"
                    >
                      {/* Group Header */}
                      <div
                        onClick={() => toggleExpenseGroupCollapsed(group.id)}
                        className={`flex items-center justify-between text-left border-l-4 pl-3 py-1.5 bg-white dark:bg-slate-900 rounded-r-xl pr-3 cursor-pointer hover:opacity-90 transition-all ${
                          group.type === "before"
                            ? "border-amber-500 bg-amber-50/10 dark:bg-amber-950/5 hover:bg-amber-500/10"
                            : group.type === "after"
                              ? "border-rose-500 bg-rose-50/10 dark:bg-rose-950/5 hover:bg-rose-500/10"
                              : "border-indigo-600 bg-slate-55/10 dark:bg-slate-950/5 hover:bg-indigo-600/10"
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          {collapsedExpenseGroups[group.id] ? (
                            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          ) : (
                            <ChevronUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          )}
                          <div>
                            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                              {group.title}
                            </h4>
                            <p className="text-[9px] font-bold text-slate-400 font-mono">
                              {group.subtitle}
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex items-center space-x-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {group.expenses.length > 0 && (
                            <span className="text-[9px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                              {group.expenses.length} log
                              {group.expenses.length > 1 ? "s" : ""}
                            </span>
                          )}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => {
                                const todayStr = new Date()
                                  .toISOString()
                                  .split("T")[0];
                                const targetDate =
                                  group.type === "before" ||
                                  group.type === "after"
                                    ? todayStr
                                    : group.dateString || todayStr;
                                handleOpenAddExpenseForDate(targetDate);
                              }}
                              className="flex items-center justify-center p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 transition shadow-xs cursor-pointer"
                              title={`Log expense for ${group.title}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Group items */}
                      <AnimatePresence initial={false}>
                        {!collapsedExpenseGroups[group.id] && (
                          <motion.div
                            key={`group-content-${group.id || 'noid'}-${grpIdx}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              height: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
                              opacity: { duration: 0.15, ease: "linear" },
                            }}
                            className="overflow-hidden"
                          >
                            <div className="relative ml-2.5 space-y-3 py-1">
                          {group.expenses.length === 0 ? (
                            <div className="w-full aspect-[35/9] min-h-[80px] rounded-2xl border border-dashed border-slate-200/90 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/50 backdrop-blur-xs flex items-center justify-start gap-4 sm:gap-6 px-4 sm:px-6 py-2 overflow-hidden select-none">
                              <img
                                src={emptyTripsImage}
                                alt="Empty day expenses"
                                className="h-full max-h-[85%] w-auto object-contain drop-shadow-xs pointer-events-none shrink-0"
                                loading="lazy"
                              />
                              <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 tracking-tight">
                                No transactions logged for {group.title}.
                              </span>
                            </div>
                          ) : (
                            group.expenses.map((exp, expIdx) => {
                              const isExpanded = !!expandedExpenses[exp.id];
                              const attList = getItemAttachments(exp);
                              return (
                                <motion.div
                                  key={`exp-${exp.id || 'noid'}-${expIdx}`}
                                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 overflow-hidden hover:border-slate-350 dark:hover:border-slate-750 transition shadow-xs"
                                >
                                  {/* Header section: Clickable to collapse/expand details */}
                                  <div
                                    onClick={() => toggleExpenseExpanded(exp.id)}
                                    className="p-4 flex flex-col gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/40 transition-colors text-left"
                                  >
                                    {/* Row 1: Title & Eye button for attachment */}
                                    <div className="flex items-center justify-between gap-2">
                                      <h4 className="text-sm font-black text-slate-900 dark:text-white capitalize truncate">
                                        {exp.title}
                                      </h4>
                                      {attList.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setAttachmentViewer({
                                              isOpen: true,
                                              title: `Attachments - ${exp.title || 'Expense'}`,
                                              attachments: attList,
                                              expenseId: exp.id,
                                            });
                                          }}
                                          className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition cursor-pointer shrink-0 text-[10px] font-bold"
                                          title="View attachment"
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                          <span>View ({attList.length})</span>
                                        </button>
                                      )}
                                    </div>

                                    {/* Row 2: Category badge */}
                                    <span className="text-[9px] px-2 py-0.5 rounded-md font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider border border-slate-200/50 dark:border-slate-750 w-fit">
                                      {exp.category}
                                    </span>

                                    {/* Row 3: Date + Amount + Chevron, same line */}
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-medium">
                                        {exp.date ? exp.date.replace("T", " ") : ""}
                                      </span>

                                      <div className="flex items-center space-x-4 flex-shrink-0">
                                        <div className="text-right">
                                          <span className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">
                                            {activeTrip.baseCurrency || "USD"}{" "}
                                            {exp.amount.toFixed(2)}
                                          </span>
                                          {exp.spendCurrency &&
                                            exp.spendCurrency !== (activeTrip.baseCurrency || "USD") && (
                                              <p className="text-[9px] font-mono font-semibold text-slate-400 dark:text-slate-500">
                                                {exp.spendCurrency} {exp.spendAmount?.toFixed(2)}
                                              </p>
                                            )}
                                        </div>

                                        <div className="text-slate-400 dark:text-slate-500">
                                          {isExpanded ? (
                                            <ChevronUp className="h-4 w-4" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4" />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Collapsible details container */}
                                  <AnimatePresence initial={false}>
                                    {isExpanded && (
                                      <motion.div
                                        key={`expense-details-${exp.id || 'noid'}-${expIdx}`}
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{
                                          height: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
                                          opacity: { duration: 0.15, ease: "linear" },
                                        }}
                                        className="overflow-hidden"
                                      >
                                        <div className="px-4 pb-4 pt-3.5 border-t border-slate-150 dark:border-slate-850/70 space-y-4 text-left">
                                      {/* Line 2: Amount & Conversion details (Only shown if special) */}
                                      {exp.type === "forex" ? (
                                        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-850 space-y-1">
                                          <div className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                                            Forex Conversion Details
                                          </div>
                                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300">
                                              {exp.spendCurrency ||
                                                activeTrip.baseCurrency ||
                                                "USD"}{" "}
                                              {Number(
                                                exp.spendAmount || exp.amount,
                                              ).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                              })}
                                            </span>
                                            <ArrowRight className="h-3 w-3 text-slate-400" />
                                            <span className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 px-1.5 py-0.5 rounded-md">
                                              {exp.forexToCurrency}{" "}
                                              {Number(
                                                exp.forexToAmount || 0,
                                              ).toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                              })}
                                            </span>
                                          </div>
                                          {exp.exchangeRate && (
                                            <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 font-semibold">
                                              Exchange Rate:{" "}
                                              {exp.exchangeRate.toFixed(4)}
                                            </div>
                                          )}
                                        </div>
                                      ) : exp.type === "peer_transfer" ? (
                                        <div className="bg-violet-500/5 p-3 rounded-xl border border-violet-100/40 dark:border-violet-950/40 space-y-1">
                                          <div className="text-[9px] font-extrabold text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                                            Peer Transfer / Settlement
                                          </div>
                                          <div className="text-xs font-bold font-mono text-violet-700 dark:text-violet-300">
                                            {exp.spendCurrency ||
                                              activeTrip.baseCurrency ||
                                              "USD"}{" "}
                                            {Number(
                                              exp.spendAmount || exp.amount,
                                            ).toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                            })}
                                          </div>
                                        </div>
                                      ) : (
                                        exp.spendCurrency &&
                                        exp.spendCurrency !==
                                          (activeTrip.baseCurrency ||
                                            "USD") && (
                                          <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl text-xs text-slate-500 dark:text-slate-400 font-mono font-medium border border-slate-100 dark:border-slate-850">
                                            Converted from {exp.spendCurrency}{" "}
                                            {exp.spendAmount?.toFixed(2)} @ rate
                                            of {exp.exchangeRate?.toFixed(4)}
                                          </div>
                                        )
                                      )}

                                      {/* Line 3: Splits breakdown details */}
                                      {exp.type !== "forex" && exp.category?.toLowerCase() !== "forex conversion" && !exp.category?.toLowerCase()?.startsWith("forex in ") && (
                                        <div className="space-y-1.5 bg-slate-50/50 dark:bg-slate-950/25 p-3 rounded-xl border border-slate-100 dark:border-slate-850">
                                          <div className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                            Splits Breakdown (
                                            {exp.splitType === "equal"
                                              ? "Split Equally"
                                              : "Custom Split"}
                                            )
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {getNormalizedSplits(exp.splits, activeTrip.travelers || ['Me'], exp.amount || 0).map((s) => (
                                              <div
                                                key={s.traveler}
                                                className="text-[11px] font-semibold bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-slate-800 flex items-center space-x-1.5 text-slate-600 dark:text-slate-300"
                                              >
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                                  {s.traveler}:
                                                </span>
                                                <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                                  {activeTrip.baseCurrency ||
                                                    "USD"}{" "}
                                                  {Number(s.amount || 0).toFixed(2)}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Receipts / Attachments Section */}
                                      {(() => {
                                        const attList = getItemAttachments(exp);
                                        if (attList.length === 0) return null;
                                        return (
                                          <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                Attachments ({attList.length})
                                              </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              {attList.map((att, attIdx) => (
                                                <div
                                                  key={att.id || attIdx}
                                                  className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                                                >
                                                  <span className="truncate max-w-[130px] text-slate-800 dark:text-slate-200">
                                                    {att.name}
                                                  </span>
                                                  <div className="flex items-center space-x-1 border-l border-slate-200 dark:border-slate-700 pl-1.5">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        setAttachmentViewer({
                                                          isOpen: true,
                                                          title: `Attachment - ${exp.title || 'Expense'}`,
                                                          attachments: attList,
                                                          initialIndex: attIdx,
                                                          expenseId: exp.id,
                                                        });
                                                      }}
                                                      className="p-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 rounded-md transition cursor-pointer flex items-center space-x-1"
                                                      title="View attachment"
                                                    >
                                                      <Eye className="h-3.5 w-3.5" />
                                                      <span className="text-[10px] font-bold">View</span>
                                                    </button>
                                                    {!isReadOnly && (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleRemoveExpenseAttachment(exp.id, att.id);
                                                        }}
                                                        className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition cursor-pointer"
                                                        title="Delete attachment"
                                                      >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* Action row with details & buttons */}
                                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-3 flex-wrap gap-2">
                                        <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400">
                                          <span>
                                            Paid by{" "}
                                            <strong className="text-slate-700 dark:text-slate-200 font-bold">
                                              {exp.paidBy}
                                            </strong>
                                          </span>
                                          {exp.paymentType && (
                                            <>
                                              <span className="text-slate-300 dark:text-slate-700">
                                                •
                                              </span>
                                              <span>
                                                Method:{" "}
                                                <strong className="text-slate-700 dark:text-slate-200 font-bold italic">
                                                  {exp.paymentType}
                                                </strong>
                                              </span>
                                            </>
                                          )}
                                        </div>

                                        {!isReadOnly && (
                                          <div
                                            className="flex items-center space-x-1.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              onClick={() =>
                                                handleInitiateEdit(exp)
                                              }
                                              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/30 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 text-[11px] font-bold transition cursor-pointer border border-slate-200/50 dark:border-slate-800 hover:border-indigo-150"
                                              title="Edit transaction log"
                                            >
                                              <Edit className="h-3 w-3" />
                                              <span>Edit</span>
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleDeleteExpense(exp.id)
                                              }
                                              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-950/30 text-slate-600 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 text-[11px] font-bold transition cursor-pointer border border-slate-200/50 dark:border-slate-800 hover:border-rose-150"
                                              title="Delete transaction log"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                              <span>Delete</span>
                                            </button>
                                          </div>
                                        )}
                                        </div>
                                      </div>
                                    </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SUBVIEW B: BALANCES & SETTLEMENT */}
        {activeSubView === "balances" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* COMPANION BALANCES (Merged card) */}
            <div className="space-y-4 text-left">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                  <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Companion Balances</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Net spending credit and liabilities across every companion.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {activeTrip.travelers.map((name, tIdx) => {
                  const bal = netBalances[name] || 0;
                  return (
                    <div
                      key={`traveler-bal-${name}-${tIdx}`}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 shadow-xs"
                    >
                      <span className="text-slate-800 dark:text-slate-200 font-bold">
                        {name}
                      </span>
                      <span
                        className={`font-mono font-bold text-xs ${
                          bal > 0.01
                            ? "text-emerald-600"
                            : bal < -0.01
                              ? "text-rose-600"
                              : "text-slate-400"
                        }`}
                      >
                        {bal > 0.01
                          ? `+${activeTrip.baseCurrency || "USD"} ${bal.toFixed(2)}`
                          : bal < -0.01
                            ? `-${activeTrip.baseCurrency || "USD"} ${Math.abs(bal).toFixed(2)}`
                            : `${activeTrip.baseCurrency || "USD"} 0.00`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SETTLEMENT BOARD (Renamed and upgraded with settle option) */}
            <div className="space-y-4 text-left">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                  <CreditCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Settlement Board</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Simplified peer-to-peer debts. Instantly record a cash
                  settlement.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                {solvedDebts.length === 0 ? (
                  <div className="text-slate-400 dark:text-slate-500 text-xs py-10 flex flex-col items-center justify-center space-y-2 bg-slate-50/50 dark:bg-slate-950/25 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                    <Check className="h-8 w-8 text-emerald-500 animate-bounce" />
                    <span>Ledger is perfectly balanced!</span>
                  </div>
                ) : (
                  solvedDebts.map((debt, idx) => (
                    <motion.div
                      key={`${debt.from}-${debt.to}-${idx}`}
                      layout
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-850 shadow-xs"
                    >
                      <div className="flex items-center space-x-2 text-xs text-slate-650 dark:text-slate-300">
                        <span className="font-bold text-slate-800 dark:text-white">
                          {debt.from}
                        </span>
                        <ArrowRight className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        <span className="font-bold text-slate-800 dark:text-white">
                          {debt.to}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2.5">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-extrabold text-xs">
                          {activeTrip.baseCurrency || "USD"}{" "}
                          {debt.amount.toFixed(2)}
                        </span>
                        {!isReadOnly && (
                          <button
                            onClick={() => handleSettleDebt(debt)}
                            className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold rounded-lg hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition border border-indigo-100 dark:border-indigo-900/40 cursor-pointer"
                            title="Click to settle this balance"
                          >
                            Settle
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUBVIEW C: SPEND ANALYTICS */}
        {activeSubView === "analytics" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SPEND BY CATEGORY CHART */}
            <div className="space-y-4 text-left">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                <PieIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Spend by Categories</span>
              </h3>

              {categoryData.length === 0 ? (
                <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-xs font-medium">
                  No expenditures to graph. Add transaction logs first.
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-around min-h-64 gap-6">
                  <div className="w-44 h-44 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {categoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#ffffff",
                            borderColor: "#e2e8f0",
                            borderRadius: "16px",
                          }}
                          itemStyle={{
                            color: "#0f172a",
                            fontSize: "11px",
                            fontWeight: "bold",
                          }}
                          formatter={(value) => [
                            `${activeTrip.baseCurrency || "USD"} ${Number(value).toFixed(2)}`,
                            "Spent",
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2 text-left flex-1">
                    {categoryData.map((item, cIdx) => (
                      <div
                        key={`cat-pie-item-${item.name}-${cIdx}`}
                        className="flex items-center space-x-3 text-[11px] font-bold"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-slate-500 dark:text-slate-400 w-20 capitalize truncate">
                          {item.name}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200 font-mono">
                          {activeTrip.baseCurrency || "USD"}{" "}
                          {item.value.toFixed(2)}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 text-[9px]">
                          ({Math.round((item.value / totalSpent) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* COMPANION SPENDING OUTLAYS BAR CHART */}
            <div className="space-y-4 text-left">
              <h3 className="text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                <BarChart2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Companion Spending Outlays</span>
              </h3>

              {payerData.every((x) => x.Spent === 0) ? (
                <div className="text-center py-20 text-slate-400 dark:text-slate-500 text-xs font-medium">
                  No companion transaction logs found. Create some expenses
                  first.
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={payerData}
                      margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                    >
                      <XAxis
                        dataKey="name"
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#ffffff",
                          borderColor: "#e2e8f0",
                          borderRadius: "16px",
                        }}
                        itemStyle={{
                          color: "#0f172a",
                          fontSize: "11px",
                          fontWeight: "bold",
                        }}
                        formatter={(value) => [
                          `${activeTrip.baseCurrency || "USD"} ${Number(value).toFixed(2)}`,
                          "Paid",
                        ]}
                      />
                      <Bar dataKey="Spent" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                        {payerData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={index % 2 === 0 ? "#4f46e5" : "#818cf8"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Shared Reusable Add Expense Modal */}
      <AddExpenseModal
        isOpen={showExpenseModal}
        onClose={handleCloseModal}
        activeTrip={activeTrip}
        initialDate={expenseDate}
        editingExpense={
          editingExpenseId
            ? activeTrip.expenses?.find((e) => e.id === editingExpenseId) || null
            : null
        }
        onSaveExpense={(savedExpense) => {
          const currentExpenses = activeTrip.expenses || [];
          let updatedExpenses: Expense[] = [];
          if (editingExpenseId) {
            updatedExpenses = currentExpenses.map((e) =>
              e.id === editingExpenseId ? savedExpense : e
            );
          } else {
            updatedExpenses = [savedExpense, ...currentExpenses];
          }
          onUpdateTrips({
            ...trips,
            [activeTrip.id]: {
              ...activeTrip,
              expenses: updatedExpenses,
            },
          });
          handleCloseModal();
        }}
      />

      {false && (
        <div className="hidden">
          <div>
            <div>

              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center space-x-2">
                <Coins className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>
                  {editingExpenseId
                    ? "Edit Transaction Log"
                    : "Log New Expense"}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Specify parameters to log and split expenditures correctly
                across companion ledger groups.
              </p>

              <form onSubmit={handleSaveExpense} className="space-y-4 mt-5">
                {validationError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-rose-700 dark:text-rose-400 font-medium">
                      {validationError}
                    </span>
                  </div>
                )}
                {/* Transaction Type Segment Control */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                    Transaction Type
                  </label>
                  <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setTransactionType("expense");
                        const cats = activeTrip.categories || [
                          "Food",
                          "Transport",
                          "Lodging",
                          "Activities",
                          "Other",
                        ];
                        setExpenseCategory(cats[0] || "Food");
                        setValidationError(null);
                        setExpenseTitle("");
                        setExpenseSpendAmount("");
                        setForexToAmount("");
                        const curr = expenseSpendCurrency || activeTrip.baseCurrency || "USD";
                        setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, curr)));
                      }}
                      className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                        transactionType === "expense"
                          ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTransactionType("forex");
                        setExpenseCategory("Other");
                        setValidationError(null);
                        setExpenseTitle("");
                        setExpenseSpendAmount("");
                        setForexToAmount("");
                        const fromCurr = expenseSpendCurrency || activeTrip.baseCurrency || "USD";
                        const targetCurr = forexToCurrency || (activeTrip.currencies || []).find(c => c !== fromCurr) || "USD";
                        setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, targetCurr, fromCurr)));
                      }}
                      className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                        transactionType === "forex"
                          ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Forex Conversion
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTransactionType("peer_transfer");
                        setExpenseCategory("Other");
                        setValidationError(null);
                        setExpenseTitle("");
                        setExpenseSpendAmount("");
                        setForexToAmount("");
                        const curr = expenseSpendCurrency || activeTrip.baseCurrency || "USD";
                        setExpenseExchangeRate(String(getSetupExchangeRate(activeTrip, curr)));
                        if (!transferTo || transferTo === expensePaidBy) {
                          const rec =
                            activeTrip.travelers?.find(
                              (t) => t !== expensePaidBy,
                            ) || "";
                          setTransferTo(rec);
                        }
                      }}
                      className={`flex-1 w-1/3 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                        transactionType === "peer_transfer"
                          ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                          : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      Peer Transfer
                    </button>
                  </div>
                </div>

                {/* Conditionally rendered form grids */}
                {transactionType === "expense" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Title */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Expense Title
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Guided tour tickets"
                        value={expenseTitle}
                        onChange={(e) => setExpenseTitle(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      />
                    </div>

                    {/* Date */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium"
                      />
                    </div>

                    {/* Spend Amount */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Spend Amount
                      </label>
                      <input
                        type="number"
                        step="any"
                        required
                        placeholder="0.00"
                        value={expenseSpendAmount}
                        onChange={(e) => setExpenseSpendAmount(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono"
                      />
                    </div>

                    {/* Spend Currency Selector */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Transaction Currency
                      </label>
                      <select
                        value={expenseSpendCurrency}
                        onChange={(e) =>
                          handleSpendCurrencyChange(e.target.value)
                        }
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        <option value={activeTrip.baseCurrency || "USD"}>
                          {activeTrip.baseCurrency || "USD"}
                        </option>
                        {(activeTrip.currencies || [])
                          .filter(
                            (code) =>
                              code !== (activeTrip.baseCurrency || "USD"),
                          )
                          .map((code, cIdx) => (
                            <option key={`opt-spendcurr-${code}-${cIdx}`} value={code}>
                              {code}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Exchange Rate multiplier */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          Exchange Rate (1 Base = X target)
                        </label>
                        {expenseSpendCurrency !==
                          (activeTrip.baseCurrency || "USD") && (
                          <button
                            type="button"
                            onClick={handleFetchExchangeRate}
                            disabled={isFetchingForex}
                            className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                          >
                            {isFetchingForex ? "Fetching..." : "Live Rate"}
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={expenseExchangeRate}
                        onChange={(e) => setExpenseExchangeRate(e.target.value)}
                        disabled={
                          expenseSpendCurrency ===
                          (activeTrip.baseCurrency || "USD")
                        }
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono disabled:opacity-60"
                      />
                    </div>

                    {/* Paid By traveler */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Paid By
                      </label>
                      <select
                        value={expensePaidBy}
                        onChange={(e) => setExpensePaidBy(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        {activeTrip.travelers.map((t, tIdx) => (
                          <option key={`opt-paidby-${t}-${tIdx}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Category */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Category Tag
                      </label>
                      <select
                        value={expenseCategory}
                        onChange={(e) => setExpenseCategory(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        {(
                          activeTrip.categories || [
                            "Food",
                            "Transport",
                            "Lodging",
                            "Activities",
                            "Other",
                          ]
                        ).map((cat, catIdx) => (
                          <option key={`opt-expcat-${cat}-${catIdx}`} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Custom Payment Type */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Payment Method
                      </label>
                      <select
                        value={expensePaymentType}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExpensePaymentType(val);
                          if (val.startsWith("Forex in ")) {
                            const targetCurr = val.substring(9).trim();
                            if (targetCurr) {
                              handleSpendCurrencyChange(targetCurr);
                            }
                          }
                        }}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        {(
                          activeTrip.paymentTypes || ["Cash", "Credit Card"]
                        ).map((pt, ptIdx) => (
                          <option key={`opt-exppt-${pt}-${ptIdx}`} value={pt}>
                            {pt}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Receipt Attachment Upload */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Receipt / Bill Image Attachment
                      </label>
                      <div className="border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl text-center cursor-pointer hover:border-indigo-400 transition relative">
                        <input
                          type="file"
                          onChange={handleReceiptFileChange}
                          className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-semibold truncate flex items-center justify-center space-x-1">
                          <Upload className="h-3 w-3 text-indigo-500" />
                          <span>
                            {receiptAttachmentName
                              ? receiptAttachmentName
                              : "Upload receipt or bill image (JPG, PNG)"}
                          </span>
                        </div>
                      </div>
                      {receiptAttachmentData && isImageData(receiptAttachmentData, receiptAttachmentName) && (
                        <div className="mt-2 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950/40 p-1 group">
                          <img
                            src={getImageSrc(receiptAttachmentData, receiptAttachmentName) || receiptAttachmentData}
                            alt="Receipt preview"
                            className="w-full h-28 object-cover rounded-lg cursor-pointer"
                            referrerPolicy="no-referrer"
                            onClick={() =>
                              setPreviewImage({
                                src: getImageSrc(receiptAttachmentData, receiptAttachmentName) || receiptAttachmentData,
                                title: receiptAttachmentName || "Receipt Attachment",
                              })
                            }
                          />
                          <div className="absolute top-2 right-2 flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => {
                                setReceiptAttachmentName("");
                                setReceiptAttachmentData("");
                              }}
                              className="p-1 rounded-full bg-slate-900/80 text-white hover:bg-rose-600 transition shadow cursor-pointer"
                              title="Remove receipt attachment"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {transactionType === "forex" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Title */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Forex Transaction Title (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Converted cash to SGD"
                        value={expenseTitle}
                        onChange={(e) => setExpenseTitle(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      />
                    </div>

                    {/* Date */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium"
                      />
                    </div>

                    {/* Handled By */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Converted by
                      </label>
                      <select
                        value={expensePaidBy}
                        onChange={(e) => setExpensePaidBy(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        {activeTrip.travelers.map((t, tIdx) => (
                          <option key={`opt-forexpaidby-${t}-${tIdx}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* From Currency Selector */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        From Currency
                      </label>
                      <select
                        value={expenseSpendCurrency}
                        onChange={(e) => {
                          const newFrom = e.target.value;
                          setExpenseSpendCurrency(newFrom);
                          const targetCurr = forexToCurrency || activeTrip.baseCurrency || "USD";
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
                        <option value={activeTrip.baseCurrency || "USD"}>
                          {activeTrip.baseCurrency || "USD"}
                        </option>
                        {(activeTrip.currencies || [])
                          .filter(
                            (code) =>
                              code !== (activeTrip.baseCurrency || "USD"),
                          )
                          .map((code, cIdx) => (
                            <option key={`opt-forexfrom-${code}-${cIdx}`} value={code}>
                              {code}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* To Currency Selector */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        To Currency
                      </label>
                      <select
                        value={forexToCurrency}
                        onChange={(e) => {
                          const newTo = e.target.value;
                          setForexToCurrency(newTo);
                          const fromCurr = expenseSpendCurrency || activeTrip.baseCurrency || "USD";
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
                        {(activeTrip.currencies || [])
                          .filter((code) => code !== expenseSpendCurrency)
                          .map((code, cIdx) => (
                            <option key={`opt-forexto-${code}-${cIdx}`} value={code}>
                              {code}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Source Amount */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        From Amount
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
                            setForexToAmount("");
                            return;
                          }
                          const amt = Number(val);
                          const r =
                            Number(expenseExchangeRate) ||
                            (forexToCurrency
                              ? getSetupExchangeRate(activeTrip, forexToCurrency, expenseSpendCurrency)
                              : 1.0);
                          if (!isNaN(amt) && !isNaN(r) && r > 0) {
                            setForexToAmount((amt * r).toFixed(2));
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono font-bold"
                      />
                    </div>

                    {/* Target Amount */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        To Amount
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
                            setExpenseSpendAmount("");
                            return;
                          }
                          const toAmt = Number(val);
                          const r =
                            Number(expenseExchangeRate) ||
                            (forexToCurrency
                              ? getSetupExchangeRate(activeTrip, forexToCurrency, expenseSpendCurrency)
                              : 1.0);
                          if (!isNaN(toAmt) && !isNaN(r) && r > 0) {
                            setExpenseSpendAmount((toAmt / r).toFixed(2));
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono font-bold"
                      />
                    </div>

                    {/* Exchange Rate multiplier */}
                    <div className="space-y-1 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          Exchange Rate (1 Source = X Target)
                        </label>
                        {expenseSpendCurrency !== forexToCurrency && (
                          <button
                            type="button"
                            onClick={handleFetchExchangeRate}
                            disabled={isFetchingForex}
                            className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                          >
                            {isFetchingForex ? "Fetching..." : "Live Rate"}
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={expenseExchangeRate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setExpenseExchangeRate(val);
                          const r = Number(val);
                          if (!isNaN(r) && r > 0) {
                            const amt = Number(expenseSpendAmount);
                            if (!isNaN(amt) && amt > 0) {
                              setForexToAmount((amt * r).toFixed(2));
                            } else {
                              const toAmt = Number(forexToAmount);
                              if (!isNaN(toAmt) && toAmt > 0) {
                                setExpenseSpendAmount((toAmt / r).toFixed(2));
                              }
                            }
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono font-bold"
                      />
                    </div>
                  </div>
                )}

                {transactionType === "peer_transfer" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Title */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Transfer Description (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Settlement for shared cab ride"
                        value={expenseTitle}
                        onChange={(e) => setExpenseTitle(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      />
                    </div>

                    {/* Date */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={expenseDate}
                        onChange={(e) => setExpenseDate(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-medium"
                      />
                    </div>

                    {/* Sender (Who paid) */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Sender (From Person)
                      </label>
                      <select
                        value={expensePaidBy}
                        onChange={(e) => {
                          const nextSender = e.target.value;
                          setExpensePaidBy(nextSender);
                          if (transferTo === nextSender) {
                            setTransferTo(
                              activeTrip.travelers?.find(
                                (t) => t !== nextSender,
                              ) || "",
                            );
                          }
                        }}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        {activeTrip.travelers.map((t, tIdx) => (
                          <option key={`opt-sender-${t}-${tIdx}`} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Recipient (Who received) */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Recipient (To Person)
                      </label>
                      <select
                        value={transferTo}
                        onChange={(e) => setTransferTo(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        {activeTrip.travelers
                          .filter((t) => t !== expensePaidBy)
                          .map((t, tIdx) => (
                            <option key={`opt-recipient-${t}-${tIdx}`} value={t}>
                              {t}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Transfer Amount */}
                    <div className="space-y-1 sm:col-span-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          Transfer Amount
                        </label>
                        {expenseSpendCurrency !== (activeTrip.baseCurrency || "USD") &&
                          Number(expenseSpendAmount) > 0 && (
                            <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 rounded">
                              ≈{" "}
                              {(
                                Number(expenseSpendAmount) /
                                (Number(expenseExchangeRate) || 1)
                              ).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{" "}
                              {activeTrip.baseCurrency || "USD"}
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

                    {/* Transfer Currency Selector */}
                    <div className="space-y-1 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Transfer Currency
                      </label>
                      <select
                        value={expenseSpendCurrency}
                        onChange={(e) =>
                          handleSpendCurrencyChange(e.target.value)
                        }
                        className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                      >
                        <option value={activeTrip.baseCurrency || "USD"}>
                          {activeTrip.baseCurrency || "USD"}
                        </option>
                        {(activeTrip.currencies || [])
                          .filter(
                            (code) =>
                              code !== (activeTrip.baseCurrency || "USD"),
                          )
                          .map((code, cIdx) => (
                            <option key={`opt-transcurr-${code}-${cIdx}`} value={code}>
                              {code}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Exchange Rate multiplier */}
                    <div className="space-y-1 sm:col-span-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          Exchange Rate (1 Base = X transfer)
                        </label>
                        {expenseSpendCurrency !==
                          (activeTrip.baseCurrency || "USD") && (
                          <button
                            type="button"
                            onClick={handleFetchExchangeRate}
                            disabled={isFetchingForex}
                            className="text-[9px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                          >
                            {isFetchingForex ? "Fetching..." : "Live Rate"}
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.000001"
                        required
                        value={expenseExchangeRate}
                        onChange={(e) => setExpenseExchangeRate(e.target.value)}
                        disabled={
                          expenseSpendCurrency ===
                          (activeTrip.baseCurrency || "USD")
                        }
                        className="w-full text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-850 dark:text-slate-100 focus:border-indigo-500 font-mono disabled:opacity-60"
                      />
                    </div>
                  </div>
                )}

                {/* Split type select (Only visible for standard expenses) */}
                {transactionType === "expense" && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Ledger Split division
                      </label>
                    </div>
                    <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-full">
                      <button
                        type="button"
                        onClick={() => setExpenseSplitType("equal")}
                        className={`flex-1 w-1/2 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                          expenseSplitType === "equal"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Equally
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpenseSplitType("custom")}
                        className={`flex-1 w-1/2 py-2 px-3 rounded-xl text-xs font-bold transition text-center cursor-pointer ${
                          expenseSplitType === "custom"
                            ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                            : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        }`}
                      >
                        Custom Split
                      </button>
                    </div>

                    {expenseSplitType === "custom" && (
                      <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-850 p-4 rounded-2xl space-y-3">
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal">
                          Toggle checkbox next to companions to include them.
                          Enter their specific share amount in target currency (
                          {expenseSpendCurrency}), or leave empty to split the
                          remainder equally.
                        </p>
                        <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                          {activeTrip.travelers.map((name, trIdx) => {
                            const isChecked =
                              selectedSplitTravelers.includes(name);
                            return (
                              <div
                                key={`custom-split-${name}-${trIdx}`}
                                className="flex items-center justify-between text-xs py-1"
                              >
                                <label className="flex items-center space-x-2 font-bold text-slate-700 dark:text-slate-350 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() =>
                                      toggleTravelerSplitCheckbox(name)
                                    }
                                    className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                  />
                                  <span>{name}</span>
                                </label>

                                {isChecked && (
                                  <div className="flex items-center space-x-1">
                                    <span className="text-[10px] text-slate-400 font-mono font-bold">
                                      {expenseSpendCurrency}
                                    </span>
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="Equal share"
                                      value={customSplits[name] || ""}
                                      onChange={(e) =>
                                        setCustomSplits({
                                          ...customSplits,
                                          [name]: e.target.value,
                                        })
                                      }
                                      className="w-20 text-xs font-bold font-mono px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg outline-none text-right text-slate-850 dark:text-slate-100 focus:border-indigo-500"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Submit Buttons */}
                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2.5 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950/40 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/10"
                  >
                    {editingExpenseId ? "Save Changes" : "Log Expense"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Expense Confirmation Modal */}
      {deletingExpense &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[100]">
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 max-w-sm w-full shadow-2xl text-left space-y-4 max-h-[90vh] overflow-y-auto min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Confirm Deletion
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to delete{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  "{deletingExpense.title}"
                </strong>{" "}
                from your transaction logs? This action cannot be undone.
              </p>
              {deletionError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/50 dark:border-rose-900/50 rounded-2xl text-xs font-bold text-rose-600 dark:text-rose-400 leading-normal">
                  {deletionError}
                </div>
              )}
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingExpense(null);
                    setDeletionError(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteExpense}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm cursor-pointer"
                >
                  Delete Log
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Settle Debt Confirmation Modal */}
      {settlingDebt &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-[100]">
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-200 dark:border-slate-800 p-5 sm:p-6 max-w-sm w-full shadow-2xl text-left space-y-4 max-h-[90vh] overflow-y-auto min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Register Settlement
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Register cash settlement of{" "}
                <strong className="text-slate-800 dark:text-slate-200 font-mono">
                  {activeTrip.baseCurrency || "USD"}{" "}
                  {settlingDebt.amount.toFixed(2)}
                </strong>{" "}
                from{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {settlingDebt.from}
                </strong>{" "}
                to{" "}
                <strong className="text-slate-800 dark:text-slate-200">
                  {settlingDebt.to}
                </strong>
                ?
              </p>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettlingDebt(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-850 dark:hover:text-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSettleDebt}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm cursor-pointer"
                >
                  Settle Debt
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Settlement Success Notification */}
      {showSettleSuccess &&
        createPortal(
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-800 dark:border-slate-200 px-4 py-3.5 rounded-2xl shadow-xl flex items-center justify-between gap-4 max-w-sm z-[100] animate-bounce min-w-0">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="text-emerald-500 font-bold shrink-0">✓</span>
              <span className="text-xs font-bold truncate">
                Settlement logged! Balances updated.
              </span>
            </div>
            <button
              onClick={() => setShowSettleSuccess(false)}
              className="text-[10px] text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-900 font-black cursor-pointer shrink-0"
            >
              DISMISS
            </button>
          </div>,
          document.body,
        )}

      {/* Lightbox Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col w-full min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-white">
              <h3 className="font-bold text-sm truncate flex items-center gap-2">
                <span>🧾</span>
                <span>{previewImage.title || 'Receipt Preview'}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await downloadOrShareBase64(
                      previewImage.src,
                      previewImage.title || 'receipt',
                      { dialogTitle: `Save or Share ${previewImage.title || 'receipt'}` }
                    );
                  }}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition text-xs flex items-center gap-1 font-semibold cursor-pointer"
                  title="Download receipt"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-white transition cursor-pointer"
                  title="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-2 overflow-auto max-h-[calc(90vh-60px)] flex items-center justify-center bg-slate-950">
              <img
                src={previewImage.src}
                alt={previewImage.title || 'Preview'}
                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </div>
      )}
      {/* Attachment Viewer Modal */}
      <AttachmentViewerModal
        isOpen={attachmentViewer.isOpen}
        onClose={() => setAttachmentViewer({ isOpen: false })}
        fileName={attachmentViewer.fileName}
        fileData={attachmentViewer.fileData}
        attachments={attachmentViewer.attachments}
        initialIndex={attachmentViewer.initialIndex}
        title={attachmentViewer.title}
        onDeleteAttachment={(attId) => {
          if (attachmentViewer.expenseId) {
            handleRemoveExpenseAttachment(attachmentViewer.expenseId, attId);
          }
        }}
      />
    </div>
  );
}
