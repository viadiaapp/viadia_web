import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Trip, Place, Expense, ChecklistItem } from '../types';
import { downloadOrSharePdf } from './nativeShareDownload';

// Rasterized Viadia logo mark (from BrandComponents' ViadiaLogo SVG),
// embedded as a base64 PNG. jsPDF can't render arbitrary SVG paths
// natively, so the mark is pre-rasterized once here rather than at
// generation time — keeps the generator free of any runtime rendering
// dependency (canvas, puppeteer, etc.).
const VIADIA_LOGO_PNG =
  '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';

export interface DataPdfExportOptions {
  includePlanner?: boolean;
  includeExpenses?: boolean;
  includeBudget?: boolean;
  includeChecklist?: boolean;
}

/**
 * Data-based Vector PDF Generator
 *
 * Builds the PDF directly from the raw trip data model using jsPDF's native
 * drawing primitives (rects, circles, lines, text) — no HTML DOM, no
 * html2canvas screenshotting. Everything is real vector output, so it's
 * crisp at any zoom/print size and renders identically regardless of which
 * device/browser generated it.
 *
 * The itinerary is drawn as an actual visual timeline (colored day bars,
 * connected bullet markers, type-coded stops) rather than a plain table.
 * The budget section includes a spend-vs-budget progress bar and a
 * category breakdown bar chart.
 */

// ---------------------------------------------------------------------------
// Layout constants & palette
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 210;
const MARGIN_X = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2; // 182
const FOOTER_Y = 285;
const BOTTOM_SAFE_Y = 272; // last Y a new block may start at before forcing a page break

const COLOR = {
  primary: [79, 70, 229] as [number, number, number], // Indigo-600
  primaryDark: [67, 56, 202] as [number, number, number], // Indigo-700
  text: [30, 41, 59] as [number, number, number], // Slate-800
  muted: [100, 116, 139] as [number, number, number], // Slate-500
  faint: [148, 163, 184] as [number, number, number], // Slate-400
  border: [226, 232, 240] as [number, number, number], // Slate-200
  lightBg: [248, 250, 252] as [number, number, number], // Slate-50
  white: [255, 255, 255] as [number, number, number],
  success: [16, 185, 129] as [number, number, number], // Emerald-500
  warning: [245, 158, 11] as [number, number, number], // Amber-500
  danger: [239, 68, 68] as [number, number, number], // Red-500
};

// Type-coded stop colors: [ring/dot color, light tint bg, dark text-on-tint]
const STOP_TYPE_STYLE: Record<'transport' | 'stay' | 'activity', { dot: [number, number, number]; tintBg: [number, number, number]; tintText: [number, number, number] }> = {
  transport: { dot: [59, 130, 246], tintBg: [219, 234, 254], tintText: [29, 78, 216] }, // Blue
  stay: { dot: [245, 158, 11], tintBg: [254, 243, 199], tintText: [180, 83, 9] }, // Amber
  activity: { dot: [16, 185, 129], tintBg: [209, 250, 229], tintText: [4, 120, 87] }, // Emerald
};

// Rotating palette for arbitrary expense/checklist categories
const CATEGORY_PALETTE: [number, number, number][] = [
  [79, 70, 229], // Indigo
  [16, 185, 129], // Emerald
  [245, 158, 11], // Amber
  [236, 72, 153], // Pink
  [59, 130, 246], // Blue
  [168, 85, 247], // Purple
  [20, 184, 166], // Teal
  [239, 68, 68], // Red
];

function colorForCategory(category: string, seenOrder: string[]): [number, number, number] {
  let idx = seenOrder.indexOf(category);
  if (idx === -1) {
    seenOrder.push(category);
    idx = seenOrder.length - 1;
  }
  return CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length];
}

// ---------------------------------------------------------------------------
// Small drawing helpers
// ---------------------------------------------------------------------------

function ensureSpace(doc: jsPDF, currentY: number, neededHeight: number): number {
  if (currentY + neededHeight > 278) {
    doc.addPage();
    return 18;
  }
  return currentY;
}

/** Draws a small colored accent bar + section title + divider line. Returns the new Y. */
function drawSectionHeader(doc: jsPDF, label: string, y: number, accent: [number, number, number] = COLOR.primary): number {
  doc.setFillColor(...accent);
  doc.roundedRect(MARGIN_X, y - 3.2, 2.4, 5, 1, 1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...COLOR.text);
  doc.text(label.toUpperCase(), MARGIN_X + 6, y + 1);

  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.4);
  doc.line(MARGIN_X, y + 4.5, PAGE_WIDTH - MARGIN_X, y + 4.5);

  return y + 11;
}

function wrapText(doc: jsPDF, text: string, maxWidth: number, fontSize: number, font: 'normal' | 'bold' = 'normal'): string[] {
  doc.setFont('helvetica', font);
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(text || '', maxWidth) as string[];
}

/** Draws a horizontal rounded progress bar. */
function drawProgressBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  percent: number,
  color: [number, number, number]
) {
  const clamped = Math.max(0, Math.min(1, percent));
  doc.setFillColor(...COLOR.border);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, 'F');
  if (clamped > 0.02) {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, Math.max(width * clamped, height), height, height / 2, height / 2, 'F');
  }
}

/** Draws a small filled/outline checkbox, with a checkmark if checked. */
function drawCheckbox(doc: jsPDF, x: number, y: number, size: number, checked: boolean) {
  if (checked) {
    doc.setFillColor(...COLOR.success);
    doc.setDrawColor(...COLOR.success);
    doc.roundedRect(x, y, size, size, 1, 1, 'FD');
    doc.setDrawColor(...COLOR.white);
    doc.setLineWidth(0.55);
    doc.line(x + size * 0.2, y + size * 0.52, x + size * 0.42, y + size * 0.75);
    doc.line(x + size * 0.42, y + size * 0.75, x + size * 0.82, y + size * 0.22);
  } else {
    doc.setDrawColor(...COLOR.faint);
    doc.setLineWidth(0.4);
    doc.roundedRect(x, y, size, size, 1, 1, 'D');
  }
}

/**
 * Draws a small filled heart using two circles + a rotated square — the
 * classic vector-heart technique. Used instead of the ♥ unicode glyph,
 * which (like → and emoji) isn't in jsPDF's standard font encoding.
 */
function drawHeart(doc: jsPDF, cx: number, cy: number, size: number, color: [number, number, number]) {
  doc.setFillColor(...color);
  const r = size * 0.28;
  doc.circle(cx - r, cy - r * 0.6, r, 'F');
  doc.circle(cx + r, cy - r * 0.6, r, 'F');
  doc.triangle(cx - r * 1.85, cy - r * 0.3, cx + r * 1.85, cy - r * 0.3, cx, cy + r * 1.7, 'F');
}

// ---------------------------------------------------------------------------
// Field-access helpers (kept defensive since the data model has a few
// alternate/legacy field names in the wild, matching the original file)
// ---------------------------------------------------------------------------

function getStopType(place: Place): 'transport' | 'stay' | 'activity' {
  if ((place as any).isTransportation || (place as any).isTransport) return 'transport';
  if ((place as any).isStay || (place as any).isDailyHotelStop) return 'stay';
  return 'activity';
}

function getStopTypeLabel(place: Place): string {
  if ((place as any).isTransportation || (place as any).isTransport) {
    return `TRANSIT · ${(place.transportType || 'TRANSFER').toString().toUpperCase()}`;
  }
  if ((place as any).isStay) return 'STAY / LODGING';
  if ((place as any).isDailyHotelStop) {
    return (place as any).hotelStopType === 'end' ? 'HOTEL · CHECK-OUT' : 'HOTEL · CHECK-IN';
  }
  return ((place as any).category || 'ACTIVITY').toString().toUpperCase();
}

function cleanTime(raw?: string): string {
  if (!raw) return '';
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    return raw.replace('T', ' ');
  }
  return raw;
}

function formatDateLabel(raw?: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function generateDataPdf(trip: Trip, options: DataPdfExportOptions = {}): Promise<void> {
  const {
    includePlanner = true,
    includeExpenses = true,
    includeBudget = true,
    includeChecklist = true,
  } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const baseCurr = (trip.baseCurrency || 'USD').toUpperCase();
  const title = trip.title || 'Travel Itinerary';

  const timeline: Place[] = trip.timeline || (trip as any).places || [];
  const expenses: Expense[] = trip.expenses || [];
  const checklist: ChecklistItem[] = trip.checklist || [];

  let currentY = 18;

  // =========================================================================
  // 1. HEADER / COVER BLOCK
  // =========================================================================
  doc.setFillColor(...COLOR.primary);
  doc.rect(0, 0, PAGE_WIDTH, 5, 'F');

  // Figure out the traveler list first, since it can wrap to multiple lines
  // and the card height needs to grow to fit that instead of clipping it.
  const dateStr = trip.startDate && trip.endDate
    ? `${trip.startDate}  to  ${trip.endDate}`
    : (trip.startDate ? `Starts ${trip.startDate}` : 'Dates not set');
  const countriesStr = (trip as any).destination || (trip.countries?.length ? trip.countries.join(', ') : 'Not set');
  const travelersRaw = (trip as any).travelers;
  const travelersStr = Array.isArray(travelersRaw) && travelersRaw.length > 0
    ? travelersRaw.map((t: any) => (typeof t === 'string' ? t : t?.name || 'Traveler')).join(', ')
    : 'Solo trip';

  const travelerLines = wrapText(doc, travelersStr, CONTENT_WIDTH - 12, 9.5, 'bold');
  const travelerBlockH = Math.max(travelerLines.length, 1) * 4.4;

  // Layout math (top to bottom within the card):
  //   6  padding
  //   6  brand row (logo + report label)
  //  10  title
  //   9  gap before meta
  //   8  meta row 1 (dates / destination)
  //   5  gap
  //   -  meta row 2 (travelers — dynamic height)
  //   5  bottom padding
  const coverH = 6 + 6 + 10 + 9 + 8 + 5 + travelerBlockH + 5;

  // Solid indigo cover card (a flat two-tone block stands in for a gradient —
  // jsPDF has no native gradient fill, and a clean solid block reads better
  // in print than a faked/banded gradient would anyway)
  doc.setFillColor(...COLOR.primaryDark);
  doc.roundedRect(MARGIN_X, currentY, CONTENT_WIDTH, coverH, 4, 4, 'F');
  doc.setFillColor(...COLOR.primary);
  doc.roundedRect(MARGIN_X, currentY, CONTENT_WIDTH, coverH * 0.55, 4, 4, 'F');
  doc.rect(MARGIN_X, currentY + coverH * 0.55 - 4, CONTENT_WIDTH, 4, 'F'); // squares off the seam

  // Brand row: logo mark + report label
  const logoSize = 7;
  doc.addImage(VIADIA_LOGO_PNG, 'PNG', MARGIN_X + 6, currentY + 5, logoSize, logoSize);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(224, 231, 255); // Indigo-100
  doc.text('VIADIA ITINERARY & LEDGER REPORT', MARGIN_X + 6 + logoSize + 3, currentY + 9.5);

  // Status pill (top-right of cover)
  const statusLabel = ((trip as any).status || 'PLANNED').toString().toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const pillW = doc.getTextWidth(statusLabel) + 8;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(PAGE_WIDTH - MARGIN_X - pillW - 4, currentY + 5, pillW, 6.5, 3.25, 3.25, 'F');
  doc.setTextColor(...COLOR.primaryDark);
  doc.text(statusLabel, PAGE_WIDTH - MARGIN_X - pillW - 4 + pillW / 2, currentY + 9.3, { align: 'center' });

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(...COLOR.white);
  doc.text(title, MARGIN_X + 6, currentY + 22, { maxWidth: CONTENT_WIDTH - 12 });

  // Meta row 1: Dates | Destination (two even columns)
  const metaColW = CONTENT_WIDTH / 2;
  const metaRow1Y = currentY + 31;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(199, 210, 254); // Indigo-200
  doc.text('DATES OF TRAVEL', MARGIN_X + 6, metaRow1Y);
  doc.text('DESTINATION', MARGIN_X + 6 + metaColW, metaRow1Y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR.white);
  doc.text(dateStr, MARGIN_X + 6, metaRow1Y + 4.5, { maxWidth: metaColW - 6 });
  doc.text(countriesStr, MARGIN_X + 6 + metaColW, metaRow1Y + 4.5, { maxWidth: metaColW - 8 });

  // Meta row 2: Travelers — full width, its own row, wraps as many lines as needed
  const metaRow2Y = metaRow1Y + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(199, 210, 254);
  doc.text('TRAVELERS', MARGIN_X + 6, metaRow2Y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR.white);
  let travelerY = metaRow2Y + 4.4;
  travelerLines.forEach((line) => {
    doc.text(line, MARGIN_X + 6, travelerY);
    travelerY += 4.4;
  });

  currentY += coverH + 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.faint);
  doc.text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Currency: ${baseCurr}`, MARGIN_X, currentY);
  currentY += 8;

  // =========================================================================
  // 2. TRIP OVERVIEW STAT ROW (Duration / Stops / Countries / Travelers)
  // =========================================================================
  let totalDays = 1;
  if (trip.startDate && trip.endDate) {
    const start = new Date(trip.startDate).getTime();
    const end = new Date(trip.endDate).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }
  }

  const overviewStats: [string, string][] = [
    ['DURATION', `${totalDays} Day${totalDays > 1 ? 's' : ''}`],
    ['STOPS', `${timeline.length} Saved`],
    ['EXPENSES', `${expenses.length} Logged`],
    ['CHECKLIST', `${checklist.filter(c => c.checked || (c as any).completed).length}/${checklist.length} Done`],
  ];

  currentY = drawStatRow(doc, currentY, overviewStats);
  currentY += 6;

  // =========================================================================
  // 3. ITINERARY TIMELINE (real vector timeline, not a table)
  // =========================================================================
  if (includePlanner && timeline.length > 0) {
    currentY = ensureSpace(doc, currentY, 20);
    currentY = drawSectionHeader(doc, `1. Itinerary Timeline (${timeline.length} stops)`, currentY);
    currentY = drawItineraryTimeline(doc, timeline, currentY, trip.startDate);
    currentY += 6;
  }

  // =========================================================================
  // 4. BUDGET OVERVIEW — progress bar + category breakdown chart
  // =========================================================================
  if (includeBudget) {
    currentY = ensureSpace(doc, currentY, 40);
    currentY = drawSectionHeader(doc, '2. Financial Overview & Budget Analytics', currentY, COLOR.success);
    currentY = drawBudgetSection(doc, trip, expenses, baseCurr, currentY);
    currentY += 6;
  }

  // =========================================================================
  // 5. EXPENSE LEDGER (table — tabular data genuinely suits a table)
  // =========================================================================
  if (includeExpenses && expenses.length > 0) {
    currentY = ensureSpace(doc, currentY, 30);
    currentY = drawSectionHeader(doc, '3. Expense Ledger Logs', currentY, COLOR.success);

    const sortedExpenses = [...expenses].sort(
      (a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime()
    );

    const expenseHead = [['Date', 'Description / Title', 'Category', 'Paid By', `Amount (${baseCurr})`]];
    const expenseData = sortedExpenses.map((exp: Expense) => {
      const d = exp.date ? new Date(exp.date) : null;
      const dateLabel = d && !isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) +
          (exp.date!.includes('T') ? `\n${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '')
        : '-';
      return [
        dateLabel,
        exp.title || (exp as any).description || 'Expense',
        exp.category || 'General',
        exp.paidBy || 'Self',
        `${exp.amount ? exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}`,
      ];
    });

    autoTable(doc, {
      startY: currentY,
      head: expenseHead,
      body: expenseData,
      theme: 'striped',
      headStyles: {
        fillColor: COLOR.text,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 65, 85],
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 68 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: MARGIN_X, right: MARGIN_X },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // =========================================================================
  // 6. CHECKLIST — vector checkboxes grouped by category, with progress
  // =========================================================================
  if (includeChecklist && checklist.length > 0) {
    currentY = ensureSpace(doc, currentY, 24);
    currentY = drawSectionHeader(doc, '4. Packing & Preparation Checklist', currentY, [236, 72, 153]);
    currentY = drawChecklist(doc, checklist, currentY);
  }

  // =========================================================================
  // FOOTERS
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, FOOTER_Y, PAGE_WIDTH - MARGIN_X, FOOTER_Y);

    // Centered footer brand line: [logo]  Crafted with [heart] by Viadia
    const footerLogoSize = 4;
    const preText = 'Crafted with';
    const postText = 'by Viadia';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const preW = doc.getTextWidth(preText);
    const postW = doc.getTextWidth(postText);
    const heartW = 3.5;
    const gap = 2;

    const totalW = footerLogoSize + gap + preW + gap + heartW + gap + postW;
    let footerX = (PAGE_WIDTH - totalW) / 2;
    const footerTextY = FOOTER_Y + 5.5;

    doc.addImage(VIADIA_LOGO_PNG, 'PNG', footerX, footerTextY - footerLogoSize + 1, footerLogoSize, footerLogoSize);
    footerX += footerLogoSize + gap;

    doc.setTextColor(...COLOR.muted);
    doc.text(preText, footerX, footerTextY);
    footerX += preW + gap;

    drawHeart(doc, footerX + heartW / 2, footerTextY - 1.3, heartW, [239, 68, 68]);
    footerX += heartW + gap;

    doc.text(postText, footerX, footerTextY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.faint);
    doc.text(`Page ${i} of ${totalPages}`, PAGE_WIDTH - MARGIN_X, footerTextY, { align: 'right' });
  }

  const sanitizeFilename = title.replace(/[^a-zA-Z0-9_\-]/g, '_');
  await downloadOrSharePdf(doc, `${sanitizeFilename}_Trip_Report.pdf`, {
    dialogTitle: `Share or Save ${title} Trip Report PDF`
  });
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

/** Draws a row of N equal-width stat cards. Returns new Y. */
function drawStatRow(doc: jsPDF, y: number, stats: [string, string][]): number {
  const cardH = 18;
  const gap = 4;
  const cardW = (CONTENT_WIDTH - gap * (stats.length - 1)) / stats.length;

  stats.forEach(([label, value], i) => {
    const x = MARGIN_X + i * (cardW + gap);
    doc.setFillColor(...COLOR.lightBg);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOR.primary);
    doc.text(label, x + 4, y + 6.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...COLOR.text);
    doc.text(value, x + 4, y + 14, { maxWidth: cardW - 8 });
  });

  return y + cardH;
}

/**
 * Draws the itinerary as a real timeline: colored "DAY N" bars, a vertical
 * connector line, and circular type-coded bullet markers per stop — instead
 * of dumping rows into a table.
 */
function drawItineraryTimeline(doc: jsPDF, timeline: Place[], startY: number, tripStartDate?: string): number {
  let currentY = startY;

  // Pull the best available date/time string off a place, in priority order
  const getStopRawTime = (p: Place): string =>
    p.time || (p as any).boardingTime || (p as any).checkInTime || '';

  const sorted = [...timeline].sort((a, b) => {
    const timeA = getStopRawTime(a);
    const timeB = getStopRawTime(b);
    if (timeA && timeB) return timeA.localeCompare(timeB);
    if (timeA) return -1;
    if (timeB) return 1;
    return ((a as any).order || 0) - ((b as any).order || 0);
  });

  // Group by the actual calendar date embedded in each stop's time — the
  // data model's own `dayNumber` field isn't reliably populated, so deriving
  // the day from real dates (relative to the trip's start date) is what
  // actually produces correct, separated day groups instead of everything
  // collapsing into a single catch-all bucket.
  const startDateMs = tripStartDate ? new Date(tripStartDate).setHours(0, 0, 0, 0) : null;
  const groups = new Map<string, { label: string; dateLabel: string; stops: Place[] }>();
  const unscheduled: Place[] = [];

  sorted.forEach((p) => {
    const raw = getStopRawTime(p);
    const d = raw ? new Date(raw) : null;
    if (!d || isNaN(d.getTime())) {
      unscheduled.push(p);
      return;
    }
    const dayMs = new Date(d).setHours(0, 0, 0, 0);
    const dateKey = new Date(dayMs).toISOString().split('T')[0];
    let label: string;
    if (startDateMs !== null) {
      const dayNum = Math.round((dayMs - startDateMs) / 86400000) + 1;
      label = `DAY ${dayNum}`;
    } else {
      label = formatDateLabel(raw);
    }
    if (!groups.has(dateKey)) {
      groups.set(dateKey, { label, dateLabel: formatDateLabel(raw), stops: [] });
    }
    groups.get(dateKey)!.stops.push(p);
  });

  if (unscheduled.length > 0) {
    groups.set('unscheduled', { label: 'UNSCHEDULED', dateLabel: '', stops: unscheduled });
  }

  const timeColW = 17; // left column reserved for the time label
  const timelineX = MARGIN_X + timeColW + 3; // x position of the vertical connector / bullets
  const textX = timelineX + 8; // x position where stop content starts

  groups.forEach(({ label, dateLabel, stops }) => {
    // --- Day header bar ---
    currentY = ensureSpace(doc, currentY, 14);

    doc.setFillColor(...COLOR.lightBg);
    doc.roundedRect(MARGIN_X, currentY, CONTENT_WIDTH, 8.5, 2, 2, 'F');
    doc.setFillColor(...COLOR.primary);
    doc.rect(MARGIN_X, currentY, 1.6, 8.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR.text);
    doc.text(label + (dateLabel ? `  ·  ${dateLabel}` : ''), MARGIN_X + 5, currentY + 5.7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.muted);
    doc.text(`${stops.length} Stop${stops.length > 1 ? 's' : ''}`, PAGE_WIDTH - MARGIN_X - 3, currentY + 5.7, { align: 'right' });

    currentY += 8.5 + 5;

    // --- Stops within this day ---
    let prevBulletY: number | null = null;

    stops.forEach((place, idx) => {
      const type = getStopType(place);
      const style = STOP_TYPE_STYLE[type];
      const typeLabel = getStopTypeLabel(place);

      const timeRaw = getStopRawTime(place);
      const timeLabel = cleanTime(timeRaw);
      const locationLabel = place.address || (place as any).stayAddress || (place as any).from || '';

      // Sub-detail line (route / notes), built the same way as the label logic
      const subLines: string[] = [];
      if (type === 'transport') {
        const fromLoc = (place as any).from || (place as any).fromLocation;
        const toLoc = (place as any).to || (place as any).toLocation;
        if (fromLoc || toLoc) subLines.push(`${fromLoc || '?'}   to   ${toLoc || '?'}`);
      } else if (type === 'stay' && ((place as any).checkInTime || (place as any).checkOutTime)) {
        subLines.push(`Check-in: ${cleanTime((place as any).checkInTime) || '-'}   Check-out: ${cleanTime((place as any).checkOutTime) || '-'}`);
      }
      const desc = place.description || (place as any).notes || (place as any).transportDesc || (place as any).stayDesc;
      if (desc) subLines.push(desc);

      // Measure content height before drawing (title + meta + wrapped sublines)
      const titleLines = wrapText(doc, place.title || 'Untitled Stop', CONTENT_WIDTH - (textX - MARGIN_X) - 4, 9.5, 'bold');
      const subLineWrapped: string[] = [];
      subLines.forEach((line) => {
        subLineWrapped.push(...wrapText(doc, line, CONTENT_WIDTH - (textX - MARGIN_X) - 4, 7.5));
      });

      const blockH =
        6 + // stop-number/badge row
        titleLines.length * 4.6 +
        (locationLabel ? 4 : 0) +
        subLineWrapped.length * 3.8 +
        5; // bottom padding

      // Keep an individual stop atomic — if it doesn't fit, move the whole
      // stop (not the whole day) to the next page.
      if (currentY + blockH > BOTTOM_SAFE_Y) {
        doc.addPage();
        currentY = 18;
        prevBulletY = null; // connector line resets on a new page
      }

      const bulletY = currentY + 3;

      // Time label — its own column, to the left of the bullet
      if (timeLabel) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR.text);
        doc.text(timeLabel, MARGIN_X + timeColW - 2, bulletY + 1, { align: 'right' });
      }

      // Connector line from previous bullet to this one (same page only)
      if (prevBulletY !== null) {
        doc.setDrawColor(...COLOR.border);
        doc.setLineWidth(0.5);
        doc.line(timelineX, prevBulletY + 2.2, timelineX, bulletY - 2.2);
      }

      // Bullet: outer ring + inner dot
      doc.setDrawColor(...style.dot);
      doc.setLineWidth(0.6);
      doc.setFillColor(...COLOR.white);
      doc.circle(timelineX, bulletY, 2.2, 'FD');
      doc.setFillColor(...style.dot);
      doc.circle(timelineX, bulletY, 0.9, 'F');

      // Type badge (top-right of the stop block)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      const badgeW = doc.getTextWidth(typeLabel) + 5;
      doc.setFillColor(...style.tintBg);
      doc.roundedRect(PAGE_WIDTH - MARGIN_X - badgeW, currentY, badgeW, 4.6, 2.3, 2.3, 'F');
      doc.setTextColor(...style.tintText);
      doc.text(typeLabel, PAGE_WIDTH - MARGIN_X - badgeW / 2, currentY + 3.15, { align: 'center' });

      // Stop number
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...COLOR.muted);
      doc.text(`STOP #${idx + 1}`, textX, currentY + 3.6);

      let blockY = currentY + 8.5;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLOR.text);
      titleLines.forEach((line) => {
        doc.text(line, textX, blockY);
        blockY += 4.6;
      });

      // Location
      if (locationLabel) {
        // Small drawn pin marker instead of an emoji glyph — jsPDF's
        // standard fonts don't include emoji, they'd render as blank boxes.
        doc.setFillColor(...style.dot);
        doc.circle(textX + 1, blockY - 1.1, 0.8, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR.muted);
        doc.text(locationLabel, textX + 3.5, blockY, { maxWidth: CONTENT_WIDTH - (textX - MARGIN_X) - 8 });
        blockY += 4;
      }

      // Sub-details (route / notes) in a light box
      if (subLineWrapped.length > 0) {
        const boxH = subLineWrapped.length * 3.8 + 2.5;
        doc.setFillColor(...COLOR.lightBg);
        doc.roundedRect(textX, blockY - 2.8, CONTENT_WIDTH - (textX - MARGIN_X) - 2, boxH, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR.muted);
        subLineWrapped.forEach((line) => {
          doc.text(line, textX + 2.5, blockY);
          blockY += 3.8;
        });
      }

      prevBulletY = bulletY;
      currentY += blockH;
    });

    currentY += 3; // gap between days
  });

  return currentY;
}

/**
 * Draws the budget progress bar + category breakdown horizontal bar chart.
 */
function drawBudgetSection(doc: jsPDF, trip: Trip, expenses: Expense[], baseCurr: string, startY: number): number {
  let currentY = startY;

  const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const budgetLimit = (trip as any).budgetLimit || 0;
  const remaining = budgetLimit > 0 ? budgetLimit - totalSpent : null;

  let totalDays = 1;
  if (trip.startDate && trip.endDate) {
    const start = new Date(trip.startDate).getTime();
    const end = new Date(trip.endDate).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }
  }
  const dailyAvg = totalSpent / totalDays;

  const fmt = (n: number) => `${baseCurr} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const stats: [string, string][] = [
    ['TOTAL SPENT', fmt(totalSpent)],
    ['BUDGET LIMIT', budgetLimit > 0 ? fmt(budgetLimit) : 'Unset'],
    ['REMAINING', remaining !== null ? fmt(remaining) : 'N/A'],
    [`DAILY AVG (${totalDays}D)`, fmt(dailyAvg)],
  ];
  currentY = drawStatRow(doc, currentY, stats);
  currentY += 8;

  // --- Budget progress bar ---
  if (budgetLimit > 0) {
    const percent = totalSpent / budgetLimit;
    const barColor = percent >= 1 ? COLOR.danger : percent >= 0.8 ? COLOR.warning : COLOR.success;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.muted);
    doc.text('BUDGET USED', MARGIN_X, currentY);
    doc.setTextColor(...COLOR.text);
    doc.text(`${Math.min(999, Math.round(percent * 100))}%`, PAGE_WIDTH - MARGIN_X, currentY, { align: 'right' });
    currentY += 3;

    drawProgressBar(doc, MARGIN_X, currentY, CONTENT_WIDTH, 4.5, percent, barColor);
    currentY += 4.5 + 10;
  }

  // --- Category breakdown bar chart ---
  if (expenses.length === 0) {
    doc.setFillColor(...COLOR.lightBg);
    doc.roundedRect(MARGIN_X, currentY, CONTENT_WIDTH, 12, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.muted);
    doc.text('No expenses recorded yet for budget analysis.', PAGE_WIDTH / 2, currentY + 7.5, { align: 'center' });
    return currentY + 12;
  }

  const byCategory = new Map<string, number>();
  expenses.forEach((e) => {
    const cat = e.category || 'General';
    byCategory.set(cat, (byCategory.get(cat) || 0) + (e.amount || 0));
  });
  const catEntries = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxVal = Math.max(...catEntries.map(([, v]) => v), 1);
  const seenCategories: string[] = [];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.text);
  doc.text('SPEND BY CATEGORY', MARGIN_X, currentY);
  currentY += 5;

  const labelW = 32;
  const amountW = 26;
  const barAreaW = CONTENT_WIDTH - labelW - amountW;
  const barH = 4;

  catEntries.forEach(([cat, amount]) => {
    currentY = ensureSpace(doc, currentY, 7);
    const color = colorForCategory(cat, seenCategories);
    const pct = amount / maxVal;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.text);
    doc.text(cat, MARGIN_X, currentY + barH - 0.5, { maxWidth: labelW - 2 });

    doc.setFillColor(...COLOR.lightBg);
    doc.roundedRect(MARGIN_X + labelW, currentY, barAreaW, barH, 1, 1, 'F');
    doc.setFillColor(...color);
    doc.roundedRect(MARGIN_X + labelW, currentY, Math.max(barAreaW * pct, 2), barH, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.muted);
    doc.text(fmt(amount), PAGE_WIDTH - MARGIN_X, currentY + barH - 0.5, { align: 'right' });

    currentY += barH + 3.5;
  });

  return currentY;
}

/** Draws the checklist grouped by category, each item as a real vector checkbox row. */
function drawChecklist(doc: jsPDF, checklist: ChecklistItem[], startY: number): number {
  let currentY = startY;

  const doneCount = checklist.filter((c) => c.checked || (c as any).completed).length;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.muted);
  doc.text(`${doneCount} of ${checklist.length} items packed`, MARGIN_X, currentY);
  drawProgressBar(doc, PAGE_WIDTH - MARGIN_X - 50, currentY - 2.8, 50, 3, checklist.length ? doneCount / checklist.length : 0, COLOR.success);
  currentY += 6;

  const byCategory = new Map<string, ChecklistItem[]>();
  checklist.forEach((item) => {
    const cat = item.category || 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  });

  const colGap = 6;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const rowH = 7.5;

  byCategory.forEach((items, cat) => {
    currentY = ensureSpace(doc, currentY, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.primary);
    doc.text(cat.toUpperCase(), MARGIN_X, currentY);
    currentY += 4.5;

    for (let i = 0; i < items.length; i += 2) {
      currentY = ensureSpace(doc, currentY, rowH);
      const rowItems = [items[i], items[i + 1]];

      rowItems.forEach((item, colIdx) => {
        if (!item) return;
        const x = MARGIN_X + colIdx * (colW + colGap);
        const isChecked = item.checked || (item as any).completed || false;
        const taskName = item.task || (item as any).text || (item as any).title || 'Item';

        doc.setFillColor(...COLOR.lightBg);
        doc.roundedRect(x, currentY - 4.6, colW, rowH - 1.5, 1.5, 1.5, 'F');

        drawCheckbox(doc, x + 2.2, currentY - 3, 3.4, isChecked);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(isChecked ? COLOR.muted[0] : COLOR.text[0], isChecked ? COLOR.muted[1] : COLOR.text[1], isChecked ? COLOR.muted[2] : COLOR.text[2]);
        const taskLines = doc.splitTextToSize(taskName, colW - 10) as string[];
        doc.text(taskLines[0], x + 8, currentY - 1.3);
      });

      currentY += rowH;
    }
    currentY += 2;
  });

  return currentY;
}
