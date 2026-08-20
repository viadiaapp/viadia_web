import { Trip } from '../types';
import { downloadOrShareText } from './nativeShareDownload';

/**
 * Generates a standard RFC 4180 compliant CSV string for a trip's expense sheet.
 * Includes UTF-8 BOM so Excel and Google Sheets properly render international currencies,
 * accents, and traveler names.
 */
export function generateExpensesCSV(trip: Trip): string {
  const baseCurrency = trip.baseCurrency || 'USD';
  const expenses = trip.expenses || [];

  // Build map of timeline stop IDs to place titles
  const placeMap = new Map<string, string>();
  (trip.timeline || []).forEach(p => {
    if (p.id) {
      placeMap.set(p.id, p.title || p.address || 'Itinerary Stop');
    }
  });

  const headers = [
    'Date',
    'Title / Description',
    'Transaction Type',
    'Category',
    'Paid By',
    'Payment Method',
    'Original Amount',
    'Original Currency',
    'Exchange Rate',
    `Amount (${baseCurrency})`,
    'Split Type',
    'Split Breakdown',
    'Tagged Itinerary Stop',
    'Forex / Transfer Details',
    'Has Attachments'
  ];

  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = expenses.map(exp => {
    const txType = exp.type === 'forex'
      ? 'Forex Conversion'
      : exp.type === 'peer_transfer'
        ? 'Peer Transfer'
        : 'Expense';

    const origAmount = exp.spendAmount !== undefined && exp.spendAmount !== null
      ? Number(exp.spendAmount).toFixed(2)
      : Number(exp.amount || 0).toFixed(2);
    const origCurrency = exp.spendCurrency || baseCurrency;
    const rate = exp.exchangeRate !== undefined && exp.exchangeRate !== null
      ? exp.exchangeRate.toString()
      : '1.0';
    const baseAmount = Number(exp.amount || 0).toFixed(2);

    let splitSummary = '';
    if (exp.splits && exp.splits.length > 0) {
      splitSummary = exp.splits
        .filter(s => s.amount > 0)
        .map(s => `${s.traveler}: ${s.amount.toFixed(2)} ${baseCurrency}`)
        .join('; ');
    }

    const placeName = exp.placeId ? (placeMap.get(exp.placeId) || 'Linked Stop') : '';

    let details = '';
    if (exp.type === 'forex') {
      const toAmt = exp.forexToAmount !== undefined && exp.forexToAmount !== null ? Number(exp.forexToAmount).toFixed(2) : '';
      const toCurr = exp.forexToCurrency || '';
      details = `Converted to ${toAmt} ${toCurr}`.trim();
    } else if (exp.type === 'peer_transfer') {
      details = exp.transferTo ? `Transferred to ${exp.transferTo}` : '';
    }

    const hasAttachments = (exp.attachments && exp.attachments.length > 0) || exp.receiptAttachment || exp.receiptAttachmentData || exp.receiptData
      ? 'Yes'
      : 'No';

    return [
      exp.date || '',
      exp.title || '',
      txType,
      exp.category || 'Uncategorized',
      exp.paidBy || '',
      exp.paymentType || 'Default',
      origAmount,
      origCurrency,
      rate,
      baseAmount,
      exp.splitType === 'custom' ? 'Custom' : 'Equal',
      splitSummary,
      placeName,
      details,
      hasAttachments
    ].map(escapeCSV).join(',');
  });

  // Include UTF-8 BOM so Excel opens non-ASCII characters seamlessly
  const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
  return csvContent;
}

/**
 * Downloads or shares the generated CSV file directly on Android or Web.
 */
export async function downloadExpensesCSV(trip: Trip): Promise<void> {
  const csv = generateExpensesCSV(trip);
  const safeTripName = (trip.title || 'Trip').trim().replace(/[^a-zA-Z0-9_\-]/g, '_') || 'Trip';
  const filename = `${safeTripName}_expenses.csv`;
  await downloadOrShareText(csv, filename, 'text/csv;charset=utf-8;', {
    dialogTitle: `Share or Save ${trip.title} Expenses CSV`
  });
}
