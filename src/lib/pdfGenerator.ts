import { Trip, Place, Expense } from '../types';
import { Capacitor } from '@capacitor/core';
import { downloadOrShareBlob } from './nativeShareDownload';

export interface PdfExportOptions {
  includePlanner?: boolean;
  includeExpenses?: boolean;
  includeBudget?: boolean;
  includeChecklist?: boolean;
}

const CATEGORY_COLORS: { [key: string]: string } = {
  Food: '#f59e0b',
  'Airline Tickets': '#3b82f6',
  Accommodation: '#6366f1',
  Lodging: '#6366f1',
  'Visa Fee': '#8b5cf6',
  Shopping: '#ec4899',
  Activities: '#10b981',
  Transport: '#06b6d4',
  Other: '#64748b',
};

const getCategoryColor = (cat: string) => CATEGORY_COLORS[cat] || '#6366f1';

// Helper to load html2pdf script dynamically
const loadHtml2Pdf = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if ((window as any).html2pdf) {
      resolve((window as any).html2pdf);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = () => resolve((window as any).html2pdf);
    script.onerror = reject;
    document.body.appendChild(script);
  });
};

/**
 * Generates a high-definition PDF workbook with SVG branding,
 * visual itinerary timeline of stops, category expense charts, and transaction logs.
 */
export async function generateTripPdf(trip: Trip, options: PdfExportOptions = {}): Promise<void> {
  const {
    includePlanner = true,
    includeExpenses = true,
    includeBudget = true,
    includeChecklist = true,
  } = options;

  const html2pdf = await loadHtml2Pdf();

  // Calculate Financial Metrics
  const baseCurr = trip.baseCurrency || 'USD';
  const totalSpent = (trip.expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);
  const budgetLimit = trip.budgetLimit || 0;
  const remainingBudget = budgetLimit - totalSpent;

  // Calculate Trip Days
  let tripDays = 1;
  if (trip.startDate && trip.endDate) {
    const start = new Date(trip.startDate).getTime();
    const end = new Date(trip.endDate).getTime();
    if (!isNaN(start) && !isNaN(end) && end >= start) {
      tripDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    }
  }
  const dailyAverage = totalSpent / tripDays;

  // Calculate Category Totals
  const categoryTotals: { [cat: string]: number } = {};
  (trip.expenses || []).forEach((exp) => {
    const cat = exp.category || 'Other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + (exp.amount || 0);
  });

  const categoryEntries = Object.entries(categoryTotals)
    .map(([cat, amount]) => ({
      cat,
      amount,
      pct: totalSpent > 0 ? (amount / totalSpent) * 100 : 0,
      color: getCategoryColor(cat),
    }))
    .sort((a, b) => b.amount - a.amount);

  // SVG Brand Assets
  const logoSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="42" height="42" style="flex-shrink: 0;">
      <defs>
        <linearGradient id="via_pdf_g1" x1="268.4" y1="608.9" x2="898.8" y2="229.7" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#3661B6"/>
          <stop offset="0.6" stop-color="#7C53E5"/>
        </linearGradient>
        <linearGradient id="via_pdf_g2" x1="321.0" y1="175.4" x2="654.9" y2="840.9" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#4BC0B1"/>
          <stop offset="0.6" stop-color="#3661B6"/>
        </linearGradient>
        <linearGradient id="via_pdf_g3" x1="148.2" y1="109.3" x2="559.9" y2="953.9" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#4BC0B1"/>
          <stop offset="0.6" stop-color="#3661B6"/>
        </linearGradient>
      </defs>
      <g>
        <path fill="url(#via_pdf_g1)" d="M372.76,834.73c-17.98-35.52-34.91-71.15-52.77-106.68c-2.09-4.19-2.03-7.65-0.2-11.73c25.69-53.1,73.33-91.97,123.55-121.08c74.23-42.02,161.55-53.97,231.69-103.96c5.08-5.31,21.62-10.4,16.41-19.14c-39.23-96.63-126.6-193.23-87.03-302.93c112.64-259.86,459.26-65.7,305.49,178.4c-65.41,124.07-78.04,192.51-216.38,255.78C576.2,659.15,409.02,689.84,372.76,834.73z M771.09,327.34c138.66-2.29,136.25-205.36,3.17-211.05C636.36,113.64,626.98,325.04,771.09,327.34z M567.38,601.65c0.03-6.81-4.83-10.25-11.36-7.81c-10.93,4.07-21.73,8.5-32.55,12.86c-7.21,3.23-22.43,6.83-17.43,17.31c1.89,3.92,6.07,5.35,11.11,3.32c15.09-6.1,30.11-12.35,45.14-18.6C565.52,607.39,567.63,605.12,567.38,601.65z M420.97,668.66c2.02,7.9,8.71,10.53,14.66,6.03c12.92-8.55,25.89-17.04,38.86-25.51c11.2-6.02,1.09-20.99-8.61-14.35C457.48,641.76,420.88,660.08,420.97,668.66z M398.75,688.62c-8.26-0.9-28.71,32.05-36.05,39.52c-6.38,8.48,6.19,18.74,12.9,9.2c8.41-12.29,18.68-23.16,28.19-34.61C407.63,697.49,407.02,691.7,398.75,688.62z M594.62,584.36c1.58,15.97,21.22,1.45,29.66-0.94c8.6-3.65,17.23-7.24,25.7-11.18c9.71-4.24,2.86-18.03-6.27-13.81c-14.61,5.99-29.18,12.05-43.75,18.13C596.56,577.98,594.54,580.48,594.62,584.36z M682.73,554.18c3.33,0.25,2.66,0.23,5.32-1.4c12-7.13,24.02-14.25,35.87-21.61c4.26-2.54,2.45-9.07-0.97-10.97c-10.87-2.46-21.64,10.06-31.34,14.24C682.71,539.13,669.23,544.5,682.73,554.18z M747.2,510.45c6.83-0.04,22.33-20.73,28.8-26.18c5.53-5.39-4.65-13.58-9.52-8.07c-7.8,7.56-15.68,15.05-23.13,22.93C740.05,503.6,742.23,508.15,747.2,510.45z"/>
        <path fill="url(#via_pdf_g2)" d="M795.94,568.5c-5.75,11.28-11.45,22.6-17.27,33.85c-14.37,27.82-28.8,55.6-43.19,83.41c-22.03,42.58-44.07,85.15-66.07,127.75c-14.6,28.26-29.5,56.37-43.58,84.89c-10.87,22.01-27.2,38.45-47.92,50.93c-56.55,34.07-131.86,16.03-165.74-39.98c-11.1-18.34-17.8-38.14-15.01-60.09c2.18-17.17,8.23-33.02,16.8-47.94c20.65-35.94,51.21-61.6,86.1-82.74c31.61-19.15,65.49-33.56,99.45-47.84c40.19-16.89,80.31-33.96,119-54.19c25.92-13.55,50.32-29.48,73.99-46.59c0.93-0.67,1.91-1.29,2.86-1.94C795.55,568.18,795.74,568.34,795.94,568.5z"/>
        <path fill="url(#via_pdf_g3)" d="M449.05,449.51c-22.07-45.12-44.1-90.21-66.15-135.31c-22.05-45.09-44.87-89.82-66.26-135.28c-32.75-69.62-62.91-86.64-111.51-92c-48.61-5.36-98.96,16.46-121.95,71.07c-16.59,43.68-4.99,85.52,14.45,126.2s178.73,359.48,202.91,401.3c20.69-36.54,49.61-66.17,82.9-90.38s70.95-42.98,109.12-57.82c-7.1-14.75-14.16-29.47-21.35-44.11C464.01,478.54,456.69,463.97,449.05,449.51"/>
      </g>
    </svg>
  `;

  const wordmarkSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 540" width="120" height="32" style="display: inline-block; vertical-align: middle;">
      <path fill="#0f172a" d="M1262.27,466.62c-165.72,150.97-372.25-80.24-244.53-236.74c50.08-61.75,166.03-91.59,245.23-13.65c0.03-49.32-0.18-97.42,0.11-146.6c1.97-49.79,77.49-41.46,70.67,7.28c0.15,131.3,0.24,262.6,0.26,393.9c0,24.82-12.86,39.44-34.73,39.98C1274.39,512.05,1263.42,492.51,1262.27,466.62z M1154.62,449.29c139.01-1.88,142.99-208,5.84-214.42C1019.98,230.8,1013.91,448.54,1154.62,449.29z"/>
      <path fill="#0f172a" d="M1806.1,304.26c8.18-79.13-96.34-83.81-144.4-47.76c-18.6,12.61-48.4,13.59-55.05-12.94c-10.7-34.32,32.91-47.01,56.33-58.71c47.65-18.16,96.41-21.66,144.31-1.49c72.7,26.23,74.46,105.64,72.26,171.35c0.38,38.37,0.12,76.75,0.11,115.13c3.08,51.3-66.71,56.24-71.17,4.45c-66.93,64.25-215.63,55.2-224.22-53.47c-2.72-39.79,12.26-71.53,46.68-92.6C1683.75,295.28,1746.59,305.95,1806.1,304.26z M1805.62,361.58c-41.54,2.26-84.55-7.37-123.53,8.85c-38.75,14.55-33.71,70.66,5.2,79.54C1742,465.61,1819.06,434.56,1805.62,361.58z"/>
      <path fill="#0f172a" d="M831.46,473.95c-108.83,106.37-314.28-14.08-184.92-140.9c53.04-38.53,120.51-27.23,181.89-28.79c15.09-76.64-97.83-85.18-143.6-47.1c-17.94,15.5-49.09,10.77-54.05-14.79c-3.19-14.85,1.96-27.97,14.52-35.28c54.67-34.36,122.42-50.34,184.13-24.97c110.05,40.96,62.63,202.25,72.52,295.47C898.83,524.05,833.51,520.62,831.46,473.95z M829.61,361.97c-46.9,4.16-150.59-20.33-150.7,50.93C683.97,478.02,841.61,469.9,829.61,361.97z"/>
      <path fill="#0f172a" d="M200.12,416.18c35.22-75.54,67.38-147.4,102.03-222.42c11.98-25.93,45.73-31.25,63.35-10.13c8.85,10.61,11.47,22.52,5.12,35.67c-43.5,90.12-86.84,180.32-130.44,270.39c-8.01,16.55-23.25,22.1-40.31,22.15c-18.37,0.06-34.02-6.05-42.76-23.97C124.64,421.26,92.05,354.7,59.55,288.1c-10.22-20.94-19.57-42.34-30.67-62.81c-12.22-22.52-2.01-42.82,14.59-50.78c54.97-22.92,64.78,54.89,85.03,88.72C152.83,314.47,174.2,365.55,200.12,416.18z"/>
      <path fill="#0f172a" d="M454.11,339.67c0-44-0.03-88.01,0.01-132.01c0.02-21.41,13.11-35.54,34.22-37.11c24.01-2.33,41.45,17.36,40.05,40.86c-0.06,86.5-0.05,173-0.29,259.5c-0.07,25.72-13.53,39.8-37.21,39.94c-21.25,0.12-36.62-14.55-36.72-35.78C453.98,429.94,454.12,384.8,454.11,339.67z"/>
      <path fill="#0f172a" d="M1430.9,339.63c0-43.23-0.02-86.47,0.01-129.7c0.02-24.28,14.12-39.27,36.74-39.15c22.85,0.11,37.92,15.04,37.96,38.43c0.13,87.22,0.18,174.44-0.04,261.66c-0.08,32.34-30.07,50.47-57.07,34.9c-12.68-7.31-17.62-18.86-17.61-33.05C1430.93,428.36,1430.9,384,1430.9,339.63z"/>
      <path fill="#4BC0B1" d="M489.36,117.37c-66.69,0.05-62.3-100.88,2.37-98.37C556.5,21.16,553.47,118.6,489.36,117.37z"/>
      <path fill="#7C53E5" d="M1466.97,115.91c-60.16,0.56-57.12-92.73,0.84-91C1529.6,22.73,1530.24,118.5,1466.97,115.91z"/>
    </svg>
  `;

  const punchlineSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 135" width="220" height="15" style="display: block; margin-top: 3px;">
      <g>
        <path fill="#4BC0B1" d="M39.75,101.03V18.76h29.15c5.45,0,10.23,1.03,14.35,3.09c4.12,2.06,7.34,5.01,9.66,8.83c2.32,3.83,3.48,8.36,3.48,13.58c0,5.15-1.16,9.63-3.48,13.42c-2.32,3.79-5.52,6.72-9.61,8.78c-4.09,2.06-8.89,3.09-14.41,3.09H50.69v31.47H39.75z M50.69,59.62h18.55c3.24,0,6.07-0.62,8.5-1.88c2.43-1.25,4.32-3.05,5.69-5.41c1.36-2.36,2.04-5.08,2.04-8.17c0-3.16-0.68-5.91-2.04-8.23c-1.36-2.32-3.26-4.1-5.69-5.36c-2.43-1.25-5.26-1.88-8.5-1.88H50.69V59.62z"/>
        <path fill="#4BC0B1" d="M109.76,101.03V17.44h10.38v83.59H109.76z"/>
        <path fill="#4BC0B1" d="M153.49,102.36c-3.9,0-7.36-0.72-10.38-2.15c-3.02-1.44-5.37-3.42-7.07-5.96c-1.69-2.54-2.54-5.47-2.54-8.78c0-3.16,0.7-6.02,2.1-8.56c1.4-2.54,3.55-4.69,6.46-6.46c2.91-1.77,6.57-3.02,10.99-3.75l21.97-3.64v8.61l-19.66,3.42c-3.83,0.66-6.61,1.86-8.34,3.59c-1.73,1.73-2.6,3.88-2.6,6.46c0,2.43,0.98,4.46,2.93,6.07c1.95,1.62,4.4,2.43,7.34,2.43c3.75,0,7.01-0.79,9.77-2.37c2.76-1.58,4.91-3.74,6.46-6.46c1.55-2.72,2.32-5.7,2.32-8.94V60.62c0-3.24-1.18-5.87-3.53-7.9c-2.36-2.02-5.49-3.04-9.39-3.04c-3.39,0-6.39,0.88-9,2.65c-2.61,1.77-4.55,4.05-5.8,6.85l-8.94-4.64c1.1-2.72,2.87-5.17,5.3-7.34c2.43-2.17,5.26-3.88,8.5-5.13c3.24-1.25,6.63-1.88,10.16-1.88c4.56,0,8.58,0.87,12.04,2.59c3.46,1.73,6.16,4.14,8.12,7.23c1.95,3.09,2.93,6.63,2.93,10.6v40.42h-10.05V89.77l1.88,0.77c-1.25,2.28-2.96,4.33-5.13,6.13c-2.17,1.8-4.68,3.2-7.51,4.2C159.99,101.86,156.88,102.36,153.49,102.36z"/>
        <path fill="#4BC0B1" d="M199.43,101.03V41.51h10.16v11.59l-1.66-0.99c1.47-3.75,3.85-6.68,7.12-8.78c3.27-2.1,7.12-3.15,11.54-3.15c4.27,0,8.08,0.96,11.43,2.87c3.35,1.92,6,4.57,7.95,7.95c1.95,3.39,2.93,7.22,2.93,11.48v38.54h-10.38V65.81c0-3.31-0.59-6.11-1.77-8.39c-1.18-2.28-2.85-4.05-5.02-5.3c-2.17-1.25-4.66-1.88-7.45-1.88c-2.8,0-5.28,0.63-7.45,1.88c-2.17,1.25-3.88,3.04-5.13,5.36c-1.25,2.32-1.88,5.1-1.88,8.34v35.23H199.43z"/>
        <path fill="#4BC0B1" d="M267.78,101.03V87.78h10.71v13.25H267.78z"/>
        <path fill="#3661B6" d="M385.5,101.03V28.7h-22.31v-9.94h55.21v9.94h-21.97v72.33H385.5z"/>
        <path fill="#3661B6" d="M427.46,101.03V41.51h10.16v10.93l-1.1-1.55c1.4-3.39,3.53-5.91,6.4-7.56s6.37-2.48,10.49-2.48h3.64v9.83h-5.19c-4.2,0-7.58,1.29-10.16,3.86c-2.58,2.58-3.86,6.26-3.86,11.04v35.45H427.46z"/>
        <path fill="#3661B6" d="M483.66,102.36c-3.9,0-7.36-0.72-10.38-2.15c-3.02-1.44-5.37-3.42-7.07-5.96c-1.69-2.54-2.54-5.47-2.54-8.78c0-3.16,0.7-6.02,2.1-8.56c1.4-2.54,3.55-4.69,6.46-6.46c2.91-1.77,6.57-3.02,10.99-3.75l21.97-3.64v8.61l-19.66,3.42c-3.83,0.66-6.61,1.86-8.34,3.59c-1.73,1.73-2.6,3.88-2.6,6.46c0,2.43,0.98,4.46,2.93,6.07c1.95,1.62,4.4,2.43,7.34,2.43c3.75,0,7.01-0.79,9.77-2.37c2.76-1.58,4.91-3.74,6.46-6.46c1.55-2.72,2.32-5.7,2.32-8.94V60.62c0-3.24-1.18-5.87-3.53-7.9c-2.36-2.02-5.49-3.04-9.39-3.04c-3.39,0-6.39,0.88-9,2.65c-2.61,1.77-4.55,4.05-5.8,6.85l-8.94-4.64c1.1-2.72,2.87-5.17,5.3-7.34c2.43-2.17,5.26-3.88,8.5-5.13c3.24-1.25,6.63-1.88,10.16-1.88c4.56,0,8.58,0.87,12.04,2.59c3.46,1.73,6.16,4.14,8.12,7.23c1.95,3.09,2.93,6.63,2.93,10.6v40.42h-10.05V89.77l1.88,0.77c-1.25,2.28-2.96,4.33-5.13,6.13c-2.17,1.8-4.68,3.2-7.51,4.2C490.16,101.86,487.05,102.36,483.66,102.36z"/>
        <path fill="#3661B6" d="M557.31,102.36c-5.89,0-11.08-1.36-15.57-4.09c-4.49-2.72-8.04-6.44-10.66-11.15c-2.61-4.71-3.92-10.01-3.92-15.9c0-5.96,1.29-11.26,3.87-15.9c2.58-4.64,6.13-8.32,10.66-11.04c4.53-2.72,9.73-4.08,15.62-4.08c3.9,0,7.55,0.7,10.93,2.1c3.39,1.4,6.37,3.3,8.94,5.69c2.58,2.39,4.45,5.13,5.63,8.23l-9.17,4.53c-1.4-3.17-3.53-5.7-6.4-7.62c-2.87-1.91-6.18-2.87-9.94-2.87c-3.61,0-6.87,0.9-9.77,2.71c-2.91,1.8-5.21,4.31-6.9,7.51c-1.69,3.2-2.54,6.83-2.54,10.88c0,3.98,0.85,7.56,2.54,10.77c1.69,3.2,3.99,5.72,6.9,7.56c2.91,1.84,6.17,2.76,9.77,2.76c3.75,0,7.05-0.97,9.88-2.93c2.83-1.95,4.99-4.54,6.46-7.79l9.17,4.64c-1.18,3.09-3.06,5.83-5.63,8.23c-2.58,2.39-5.56,4.29-8.94,5.69C564.86,101.66,561.21,102.36,557.31,102.36z"/>
        <path fill="#3661B6" d="M596.18,101.03V17.44h10.38v57.31l-4.2-0.99l31.58-32.24h13.14l-22.86,23.96l24.4,35.56h-12.15l-22.31-32.24l6.4-0.33l-17.34,18.22l3.31-7.62v21.97H596.18z"/>
        <path fill="#3661B6" d="M662.11,101.03V87.78h10.71v13.25H662.11z"/>
        <path fill="#7C53E5" d="M785.79,102.36c-5.15,0-9.9-0.98-14.25-2.93c-4.34-1.95-8.02-4.62-11.04-8.01c-3.02-3.38-5.23-7.18-6.63-11.37l9.5-3.87c1.99,5.3,4.95,9.37,8.89,12.2c3.94,2.83,8.56,4.25,13.86,4.25c3.24,0,6.07-0.51,8.5-1.55c2.43-1.03,4.32-2.48,5.69-4.36c1.36-1.88,2.04-4.07,2.04-6.57c0-3.46-0.98-6.18-2.93-8.17c-1.95-1.99-4.8-3.53-8.56-4.64l-15.13-4.64c-5.96-1.84-10.55-4.73-13.75-8.67c-3.2-3.94-4.8-8.52-4.8-13.75c0-4.49,1.1-8.45,3.31-11.87s5.25-6.11,9.11-8.06c3.86-1.95,8.26-2.93,13.2-2.93c4.93,0,9.4,0.88,13.42,2.65c4.01,1.77,7.42,4.14,10.21,7.12c2.8,2.98,4.86,6.39,6.18,10.21l-9.39,3.86c-1.69-4.56-4.33-8.06-7.9-10.49c-3.57-2.43-7.71-3.64-12.42-3.64c-2.95,0-5.54,0.5-7.79,1.49c-2.25,0.99-3.98,2.45-5.19,4.36c-1.21,1.92-1.82,4.12-1.82,6.62c0,3.02,0.96,5.71,2.87,8.06c1.91,2.36,4.82,4.16,8.72,5.41l13.8,4.09c6.48,1.99,11.37,4.82,14.69,8.5c3.31,3.68,4.97,8.25,4.97,13.69c0,4.49-1.16,8.47-3.48,11.93c-2.32,3.46-5.52,6.17-9.61,8.12C796,101.38,791.23,102.36,785.79,102.36z"/>
        <path fill="#7C53E5" d="M827.64,101.03V17.44h10.38v35.67l-1.88-0.99c1.47-3.75,3.85-6.68,7.12-8.78c3.27-2.1,7.12-3.15,11.54-3.15c4.27,0,8.08,0.96,11.43,2.87c3.35,1.92,6,4.57,7.95,7.95c1.95,3.39,2.93,7.22,2.93,11.48v38.54h-10.38V65.81c0-3.31-0.61-6.11-1.82-8.39c-1.21-2.28-2.89-4.05-5.02-5.3c-2.14-1.25-4.6-1.88-7.4-1.88c-2.72,0-5.19,0.63-7.4,1.88c-2.21,1.25-3.94,3.04-5.19,5.36c-1.25,2.32-1.88,5.1-1.88,8.34v35.23H827.64z"/>
        <path fill="#7C53E5" d="M909.24,102.36c-3.9,0-7.36-0.72-10.38-2.15c-3.02-1.44-5.37-3.42-7.07-5.96c-1.69-2.54-2.54-5.47-2.54-8.78c0-3.16,0.7-6.02,2.1-8.56c1.4-2.54,3.55-4.69,6.46-6.46c2.91-1.77,6.57-3.02,10.99-3.75l21.97-3.64v8.61l-19.66,3.42c-3.83,0.66-6.61,1.86-8.34,3.59c-1.73,1.73-2.6,3.88-2.6,6.46c0,2.43,0.98,4.46,2.93,6.07c1.95,1.62,4.4,2.43,7.34,2.43c3.75,0,7.01-0.79,9.77-2.37c2.76-1.58,4.91-3.74,6.46-6.46c1.55-2.72,2.32-5.7,2.32-8.94V60.62c0-3.24-1.18-5.87-3.53-7.9c-2.36-2.02-5.49-3.04-9.39-3.04c-3.39,0-6.39,0.88-9,2.65c-2.61,1.77-4.55,4.05-5.8,6.85l-8.94-4.64c1.1-2.72,2.87-5.17,5.3-7.34c2.43-2.17,5.26-3.88,8.5-5.13c3.24-1.25,6.63-1.88,10.16-1.88c4.56,0,8.58,0.87,12.04,2.59c3.46,1.73,6.16,4.14,8.12,7.23c1.95,3.09,2.93,6.63,2.93,10.6v40.42h-10.05V89.77l1.88,0.77c-1.25,2.28-2.96,4.33-5.13,6.13c-2.17,1.8-4.68,3.2-7.51,4.2C915.73,101.86,912.62,102.36,909.24,102.36z"/>
        <path fill="#7C53E5" d="M955.18,101.03V41.51h10.16v10.93l-1.11-1.55c1.4-3.39,3.54-5.91,6.41-7.56s6.37-2.48,10.49-2.48h3.64v9.83h-5.19c-4.2,0-7.58,1.29-10.16,3.86c-2.58,2.58-3.87,6.26-3.87,11.04v35.45H955.18z"/>
        <path fill="#7C53E5" d="M1021.32,102.36c-5.74,0-10.88-1.36-15.4-4.09c-4.53-2.72-8.08-6.46-10.66-11.21c-2.58-4.75-3.86-10.07-3.86-15.96c0-5.96,1.29-11.26,3.86-15.9c2.58-4.64,6.04-8.3,10.38-10.99c4.34-2.69,9.28-4.03,14.8-4.03c4.42,0,8.34,0.79,11.76,2.37c3.42,1.58,6.33,3.72,8.72,6.4c2.39,2.69,4.23,5.74,5.52,9.17c1.29,3.42,1.93,6.98,1.93,10.66c0,0.88-0.05,1.8-0.17,2.76c-0.11,0.96-0.24,1.92-0.39,2.87h-48.81v-8.94h42.84l-4.97,3.98c0.73-3.83,0.4-7.25-0.99-10.27c-1.4-3.02-3.46-5.41-6.18-7.18c-2.72-1.77-5.82-2.65-9.28-2.65c-3.46,0-6.62,0.9-9.5,2.71c-2.87,1.8-5.1,4.33-6.68,7.56c-1.58,3.24-2.23,7.11-1.93,11.59c-0.29,4.34,0.39,8.15,2.04,11.43c1.66,3.28,4.01,5.82,7.07,7.62c3.05,1.8,6.39,2.71,9.99,2.71c3.98,0,7.32-0.92,10.05-2.76c2.72-1.84,4.93-4.2,6.62-7.07l8.61,4.42c-1.18,2.72-3,5.21-5.47,7.45c-2.47,2.25-5.39,4.03-8.78,5.36C1029.08,101.69,1025.37,102.36,1021.32,102.36z"/>
        <path fill="#7C53E5" d="M1065.93,101.03V87.78h10.71v13.25H1065.93z"/>
        <path fill="#170C52" d="M1144,101.03V18.76h53.67v9.94h-42.73v26.06h40.53v10.05h-40.53v26.28h42.73v9.94H1144z"/>
        <path fill="#170C52" d="M1226.38,101.03l-23.3-59.52h11.48l18.66,50.35h-3.97l18.77-50.35h11.48l-23.41,59.52H1226.38z"/>
        <path fill="#170C52" d="M1296.06,102.36c-5.74,0-10.88-1.36-15.4-4.09c-4.53-2.72-8.08-6.46-10.66-11.21c-2.58-4.75-3.86-10.07-3.86-15.96c0-5.96,1.29-11.26,3.86-15.9c2.58-4.64,6.04-8.3,10.38-10.99c4.34-2.69,9.28-4.03,14.8-4.03c4.42,0,8.34,0.79,11.76,2.37c3.42,1.58,6.33,3.72,8.72,6.4c2.39,2.69,4.23,5.74,5.52,9.17c1.29,3.42,1.93,6.98,1.93,10.66c0,0.88-0.05,1.8-0.17,2.76c-0.11,0.96-0.24,1.92-0.39,2.87h-48.81v-8.94h42.84l-4.97,3.98c0.73-3.83,0.4-7.25-0.99-10.27c-1.4-3.02-3.46-5.41-6.18-7.18c-2.72-1.77-5.82-2.65-9.28-2.65c-3.46,0-6.62,0.9-9.5,2.71c-2.87,1.8-5.1,4.33-6.68,7.56c-1.58,3.24-2.23,7.11-1.93,11.59c-0.29,4.34,0.39,8.15,2.04,11.43c1.66,3.28,4.01,5.82,7.07,7.62c3.05,1.8,6.39,2.71,9.99,2.71c3.98,0,7.32-0.92,10.05-2.76c2.72-1.84,4.93-4.2,6.62-7.07l8.61,4.42c-1.18,2.72-3,5.21-5.47,7.45c-2.47,2.25-5.39,4.03-8.78,5.36C1303.82,101.69,1300.1,102.36,1296.06,102.36z"/>
        <path fill="#170C52" d="M1336.36,101.03V41.51h10.16v10.93l-1.1-1.55c1.4-3.39,3.53-5.91,6.41-7.56s6.37-2.48,10.49-2.48h3.64v9.83h-5.19c-4.2,0-7.58,1.29-10.16,3.86c-2.58,2.58-3.87,6.26-3.87,11.04v35.45H1336.36z"/>
        <path fill="#170C52" d="M1378.32,125.33c-1.33,0-2.65-0.11-3.98-0.33s-2.58-0.59-3.75-1.1v-9.17c0.81,0.15,1.82,0.31,3.04,0.5c1.21,0.18,2.41,0.28,3.59,0.28c3.46,0,6.09-0.76,7.9-2.26c1.8-1.51,3.51-4.1,5.13-7.79l3.75-8.94l-0.22,8.94l-25.4-63.94h11.15l19.77,50.79h-3.31l19.66-50.79h11.37l-26.83,66.59c-1.25,3.16-2.85,6.07-4.8,8.72c-1.95,2.65-4.33,4.73-7.12,6.24C1385.46,124.57,1382.15,125.33,1378.32,125.33z"/>
        <path fill="#170C52" d="M1452.75,101.03V90.54h4.64c3.9,0,6.99-1.16,9.28-3.48c2.28-2.32,3.42-5.47,3.42-9.44V18.76h10.93V77.4c0,4.79-0.98,8.94-2.93,12.48c-1.95,3.53-4.69,6.28-8.23,8.23c-3.53,1.95-7.69,2.93-12.48,2.93H1452.75z"/>
        <path fill="#170C52" d="M1526.07,102.36c-5.67,0-10.82-1.34-15.46-4.03c-4.64-2.69-8.34-6.39-11.1-11.1c-2.76-4.71-4.14-10.05-4.14-16.01s1.36-11.26,4.08-15.9c2.72-4.64,6.41-8.32,11.04-11.04c4.64-2.72,9.83-4.08,15.57-4.08c5.81,0,11.04,1.34,15.68,4.03c4.64,2.69,8.3,6.35,10.99,10.99c2.69,4.64,4.03,9.98,4.03,16.01c0,6.04-1.4,11.39-4.2,16.07c-2.8,4.68-6.5,8.36-11.1,11.04C1536.87,101.01,1531.73,102.36,1526.07,102.36z M1526.07,92.42c3.75,0,7.12-0.92,10.1-2.76c2.98-1.84,5.34-4.38,7.07-7.62c1.73-3.24,2.59-6.85,2.59-10.82c0-3.98-0.87-7.54-2.59-10.71c-1.73-3.16-4.09-5.67-7.07-7.51c-2.98-1.84-6.35-2.76-10.1-2.76c-3.68,0-7.01,0.92-9.99,2.76c-2.98,1.84-5.36,4.34-7.12,7.51c-1.77,3.17-2.65,6.74-2.65,10.71c0,3.97,0.88,7.58,2.65,10.82c1.77,3.24,4.14,5.78,7.12,7.62C1519.05,91.5,1522.38,92.42,1526.07,92.42z"/>
        <path fill="#170C52" d="M1591.22,102.36c-4.34,0-8.21-0.99-11.59-2.98c-3.39-1.99-6.04-4.77-7.95-8.34c-1.92-3.57-2.87-7.67-2.87-12.31V41.51h10.38v36.11c0,2.95,0.61,5.52,1.82,7.73c1.21,2.21,2.91,3.94,5.08,5.19c2.17,1.25,4.66,1.88,7.45,1.88c2.8,0,5.28-0.62,7.45-1.88c2.17-1.25,3.87-3.05,5.08-5.41c1.21-2.35,1.82-5.15,1.82-8.39V41.51h10.38v59.52h-10.05V89.44l1.55,0.99c-1.4,3.75-3.75,6.68-7.07,8.78C1599.39,101.31,1595.56,102.36,1591.22,102.36z"/>
        <path fill="#170C52" d="M1634.06,101.03V41.51h10.16v10.93l-1.1-1.55c1.4-3.39,3.53-5.91,6.41-7.56s6.37-2.48,10.49-2.48h3.64v9.83h-5.19c-4.2,0-7.58,1.29-10.16,3.86c-2.58,2.58-3.87,6.26-3.87,11.04v35.45H1634.06z"/>
        <path fill="#170C52" d="M1672.71,101.03V41.51h10.16v11.59l-1.66-0.99c1.47-3.75,3.85-6.68,7.12-8.78c3.28-2.1,7.12-3.15,11.54-3.15c4.27,0,8.08,0.96,11.43,2.87c3.35,1.92,6,4.57,7.95,7.95c1.95,3.39,2.93,7.22,2.93,11.48v38.54h-10.38V65.81c0-3.31-0.59-6.11-1.77-8.39c-1.18-2.28-2.85-4.05-5.02-5.3c-2.17-1.25-4.66-1.88-7.45-1.88c-2.8,0-5.28,0.63-7.45,1.88c-2.17,1.25-3.88,3.04-5.13,5.36c-1.25,2.32-1.88,5.1-1.88,8.34v35.23H1672.71z"/>
        <path fill="#170C52" d="M1764.25,102.36c-5.74,0-10.88-1.36-15.4-4.09c-4.53-2.72-8.08-6.46-10.66-11.21c-2.58-4.75-3.86-10.07-3.86-15.96c0-5.96,1.29-11.26,3.86-15.9c2.58-4.64,6.04-8.3,10.38-10.99c4.34-2.69,9.28-4.03,14.8-4.03c4.42,0,8.34,0.79,11.76,2.37c3.42,1.58,6.33,3.72,8.72,6.4c2.39,2.69,4.23,5.74,5.52,9.17c1.29,3.42,1.93,6.98,1.93,10.66c0,0.88-0.05,1.8-0.17,2.76c-0.11,0.96-0.24,1.92-0.39,2.87h-48.81v-8.94h42.84l-4.97,3.98c0.73-3.83,0.4-7.25-0.99-10.27c-1.4-3.02-3.46-5.41-6.18-7.18c-2.72-1.77-5.82-2.65-9.28-2.65c-3.46,0-6.62,0.9-9.5,2.71c-2.87,1.8-5.1,4.33-6.68,7.56c-1.58,3.24-2.23,7.11-1.93,11.59c-0.29,4.34,0.39,8.15,2.04,11.43c1.66,3.28,4.01,5.82,7.07,7.62c3.05,1.8,6.39,2.71,9.99,2.71c3.98,0,7.32-0.92,10.05-2.76c2.72-1.84,4.93-4.2,6.62-7.07l8.61,4.42c-1.18,2.72-3,5.21-5.47,7.45c-2.47,2.25-5.39,4.03-8.78,5.36C1772.01,101.69,1768.3,102.36,1764.25,102.36z"/>
        <path fill="#170C52" d="M1807.87,125.33c-1.33,0-2.65-0.11-3.98-0.33s-2.58-0.59-3.75-1.1v-9.17c0.81,0.15,1.82,0.31,3.04,0.5c1.21,0.18,2.41,0.28,3.59,0.28c3.46,0,6.09-0.76,7.9-2.26c1.8-1.51,3.51-4.1,5.13-7.79l3.75-8.94l-0.22,8.94l-25.4-63.94h11.15l19.77,50.79h-3.31l19.66-50.79h11.37l-26.83,66.59c-1.25,3.16-2.85,6.07-4.8,8.72c-1.95,2.65-4.33,4.73-7.12,6.24C1815.01,124.57,1811.69,125.33,1807.87,125.33z"/>
        <path fill="#170C52" d="M1869.92,101.03V87.78h10.71v13.25H1869.92z"/>
      </g>
    </svg>
  `;

  // Helper to extract YYYY-MM-DD string from place time or date
  const getPlaceDateStr = (place: Place): string | null => {
    if (!place.time) return null;
    const datePart = place.time.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
    const parsed = new Date(place.time);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return null;
  };

  // Helper to get array of dates YYYY-MM-DD in range
  const getDatesInRangeList = (startStr?: string, endStr?: string): string[] => {
    if (!startStr || !endStr) return [];
    const dates: string[] = [];
    const cur = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(cur.getTime()) || isNaN(end.getTime()) || end < cur) return [];
    
    let guard = 0;
    while (cur <= end && guard < 60) {
      dates.push(cur.toISOString().split('T')[0]);
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return dates;
  };

  // Group timeline stops by day
  interface DayGroup {
    title: string;
    formattedDate?: string;
    places: Place[];
  }

  const allTimelinePlaces = trip.timeline || [];
  const rangeDates = getDatesInRangeList(trip.startDate, trip.endDate);
  
  const dayGroupsMap = new Map<string, DayGroup>();
  const unscheduledPlaces: Place[] = [];

  if (rangeDates.length > 0) {
    rangeDates.forEach((dStr, idx) => {
      const dObj = new Date(dStr + 'T00:00:00');
      const formattedDate = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : dStr;
      
      dayGroupsMap.set(dStr, {
        title: `Day ${idx + 1}`,
        formattedDate,
        places: [],
      });
    });

    allTimelinePlaces.forEach((place) => {
      const pDate = getPlaceDateStr(place);
      if (pDate && dayGroupsMap.has(pDate)) {
        dayGroupsMap.get(pDate)!.places.push(place);
      } else {
        unscheduledPlaces.push(place);
      }
    });
  } else {
    const datesFound = Array.from(new Set(
      allTimelinePlaces.map(p => getPlaceDateStr(p)).filter((d): d is string => d !== null)
    )).sort();

    datesFound.forEach((dStr, idx) => {
      const dObj = new Date(dStr + 'T00:00:00');
      const formattedDate = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : dStr;

      dayGroupsMap.set(dStr, {
        title: `Day ${idx + 1}`,
        formattedDate,
        places: [],
      });
    });

    allTimelinePlaces.forEach((place) => {
      const pDate = getPlaceDateStr(place);
      if (pDate && dayGroupsMap.has(pDate)) {
        dayGroupsMap.get(pDate)!.places.push(place);
      } else {
        unscheduledPlaces.push(place);
      }
    });
  }

  const activeDayGroups = Array.from(dayGroupsMap.values());
  if (unscheduledPlaces.length > 0) {
    activeDayGroups.push({
      title: 'Flexible & Unscheduled Stops',
      places: unscheduledPlaces,
    });
  }

  // Build Day-Separated Timeline Items HTML
  const timelineHtml = activeDayGroups
    .map((group) => {
      const hasPlaces = group.places.length > 0;

      const placesHtml = hasPlaces
        ? group.places
            .map((stop, idx) => {
              let iconColor = '#10b981'; // Emerald activity
              let badgeLabel = 'Activity';
              let iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

              if (stop.isTransportation || stop.isTransport) {
                iconColor = '#06b6d4'; // Cyan transit
                badgeLabel = `Transit (${stop.transportType || 'Transport'})`;
                iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7c-.5-.1-1 .1-1.3.5l-.8.8c-.4.4-.3 1.1.2 1.4l5.3 3.5-3.2 3.2-2.3-.8c-.4-.1-.9 0-1.2.3l-.4.4c-.3.3-.3.8 0 1.1l3.5 3.5c.3.3.8.3 1.1 0l.4-.4c.3-.3.4-.8.3-1.2l-.8-2.3 3.2-3.2 3.5 5.3c.3.5 1 .6 1.4.2l.8-.8c.4-.3.6-.8.5-1.3z"/></svg>`;
              } else if (stop.isStay) {
                iconColor = '#6366f1'; // Indigo stay
                badgeLabel = 'Stay / Lodging';
                iconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h20v-8a2 2 0 0 0-2-2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`;
              }

              let formattedTime = 'Time TBD';
              if (stop.time) {
                const timeObj = new Date(stop.time);
                if (!isNaN(timeObj.getTime())) {
                  formattedTime = timeObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                } else {
                  formattedTime = stop.time.replace('T', ' ');
                }
              }

              // Detail fields
              let extendedDetails = '';
              if (stop.isTransportation || stop.isTransport) {
                const detailsParts = [];
                if (stop.carrier) detailsParts.push(`<strong>Carrier:</strong> ${stop.carrier}`);
                if (stop.refNumber) detailsParts.push(`<strong>Ref #:</strong> ${stop.refNumber}`);
                if (stop.from && stop.to) detailsParts.push(`<strong>Route:</strong> ${stop.from} &rarr; ${stop.to}`);
                
                const cleanTime = (t?: string) => t ? t.replace('T', ' ') : '--';
                if (stop.boardingTime || stop.arrivalTime) {
                  detailsParts.push(`<strong>Times:</strong> Depart ${cleanTime(stop.boardingTime)} | Arrive ${cleanTime(stop.arrivalTime)}`);
                }
                if (stop.transportDesc) detailsParts.push(`<strong>Notes:</strong> ${stop.transportDesc}`);
                if (detailsParts.length) {
                  extendedDetails = `<div style="font-size: 10px; color: #475569; margin-top: 6px; padding: 6px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; word-break: break-word;">${detailsParts.join(' &bull; ')}</div>`;
                }
              } else if (stop.isStay) {
                const detailsParts = [];
                if (stop.hotelName) detailsParts.push(`<strong>Hotel:</strong> ${stop.hotelName}`);
                if (stop.stayAddress) detailsParts.push(`<strong>Address:</strong> ${stop.stayAddress}`);
                const cleanTime = (t?: string) => t ? t.replace('T', ' ') : '--';
                if (stop.checkInTime || stop.checkOutTime) {
                  detailsParts.push(`<strong>Schedule:</strong> Check-In: ${cleanTime(stop.checkInTime)} | Check-Out: ${cleanTime(stop.checkOutTime)}`);
                }
                if (stop.stayDesc) detailsParts.push(`<strong>Notes:</strong> ${stop.stayDesc}`);
                if (detailsParts.length) {
                  extendedDetails = `<div style="font-size: 10px; color: #475569; margin-top: 6px; padding: 6px 10px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; word-break: break-word;">${detailsParts.join(' &bull; ')}</div>`;
                }
              }

              return `
                <div style="position: relative; padding-left: 36px; padding-bottom: 16px; page-break-inside: avoid;">
                  <!-- Node Icon -->
                  <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; border-radius: 50%; background-color: ${iconColor}; display: flex; align-items: center; justify-content: center; z-index: 2; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    ${iconSvg}
                  </div>
                  <!-- Stop Card -->
                  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
                      <div style="font-size: 12px; font-weight: 800; color: #0f172a; word-break: break-word; flex: 1;">Stop #${idx + 1} &bull; ${stop.title || 'Untitled Spot'}</div>
                      <span style="font-size: 9px; font-weight: 700; color: ${iconColor}; background: #f1f5f9; padding: 2px 7px; border-radius: 6px; text-transform: uppercase; white-space: nowrap; flex-shrink: 0;">${badgeLabel}</span>
                    </div>
                    <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-weight: 600; word-break: break-word;">
                      <span>⏰ ${formattedTime}</span>
                      ${stop.address ? `<span style="margin-left: 8px;">📍 ${stop.address}</span>` : ''}
                    </div>
                    ${stop.description ? `<div style="font-size: 10px; color: #334155; margin-top: 6px; line-height: 1.4; word-break: break-word;">${stop.description}</div>` : ''}
                    ${extendedDetails}
                  </div>
                </div>
              `;
            })
            .join('')
        : `
          <div style="font-size: 10px; color: #94a3b8; font-style: italic; padding: 10px 14px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 10px; margin-bottom: 12px;">
            No scheduled stops for this day (Free Day / Open Exploration)
          </div>
        `;

      return `
        <div style="margin-bottom: 22px;">
          <!-- Day Section Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; background: #f1f5f9; border-left: 4px solid #4f46e5; padding: 8px 12px; border-radius: 0 10px 10px 0; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 12px; font-weight: 900; color: #1e1b4b; text-transform: uppercase; letter-spacing: 0.5px;">${group.title}</span>
              ${group.formattedDate ? `<span style="font-size: 11px; font-weight: 700; color: #475569;">&bull; ${group.formattedDate}</span>` : ''}
            </div>
            <span style="font-size: 9.5px; font-weight: 800; color: #4f46e5; background: #e0e7ff; padding: 2px 8px; border-radius: 12px;">
              ${group.places.length} ${group.places.length === 1 ? 'Stop' : 'Stops'}
            </span>
          </div>

          <!-- Vertical Connecting Line + Day Places -->
          <div style="position: relative; padding-top: 4px;">
            ${hasPlaces ? `<div style="position: absolute; left: 11px; top: 12px; bottom: 20px; width: 2px; background-color: #cbd5e1; z-index: 1;"></div>` : ''}
            ${placesHtml}
          </div>
        </div>
      `;
    })
    .join('');

  // Build Expenses Table Rows
  const expensesHtml = (trip.expenses || [])
    .map((exp, idx) => {
      const catColor = getCategoryColor(exp.category || 'Other');
      let origSpendStr = `${exp.spendCurrency || baseCurr} ${(exp.spendAmount ?? exp.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (exp.spendCurrency && exp.spendCurrency !== baseCurr && exp.exchangeRate) {
        origSpendStr += ` <span style="font-size: 8px; color: #94a3b8;">(Rate: ${exp.exchangeRate})</span>`;
      }

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; page-break-inside: avoid;">
          <td style="padding: 8px 6px; font-size: 10px; color: #64748b; font-family: monospace; word-break: break-word;">${exp.date || 'N/A'}</td>
          <td style="padding: 8px 6px; font-size: 10px; font-weight: 700; color: #0f172a; word-break: break-word;">${exp.title || 'Expense'}</td>
          <td style="padding: 8px 6px; font-size: 10px;">
            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 6px; background: #f1f5f9; color: #1e293b; font-weight: 600; font-size: 9px; white-space: nowrap;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${catColor}; display: inline-block;"></span>
              ${exp.category || 'General'}
            </span>
          </td>
          <td style="padding: 8px 6px; font-size: 10px; color: #475569; font-weight: 600; word-break: break-word;">${exp.paidBy || 'Me'}</td>
          <td style="padding: 8px 6px; font-size: 10px; color: #64748b; word-break: break-word;">${exp.paymentType || 'Cash'}</td>
          <td style="padding: 8px 6px; font-size: 10px; color: #475569; font-family: monospace; word-break: break-word;">${origSpendStr}</td>
          <td style="padding: 8px 6px; font-size: 10px; font-weight: 800; color: #0f172a; text-align: right; font-family: monospace; word-break: break-word;">
            ${baseCurr} ${(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </td>
        </tr>
      `;
    })
    .join('');

  // Category Charts & Bars Component HTML
  const categoryBarsHtml = categoryEntries
    .map((item) => `
      <div style="margin-bottom: 10px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-bottom: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #1e293b;">
            <span style="width: 10px; height: 10px; border-radius: 50%; background: ${item.color}; display: inline-block;"></span>
            <span>${item.cat}</span>
          </div>
          <div style="font-weight: 800; color: #0f172a; font-family: monospace;">
            ${baseCurr} ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style="font-size: 10px; color: #64748b; font-weight: 600; margin-left: 4px;">(${item.pct.toFixed(1)}%)</span>
          </div>
        </div>
        <div style="width: 100%; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
          <div style="width: ${Math.min(100, item.pct)}%; height: 100%; background: ${item.color}; border-radius: 4px;"></div>
        </div>
      </div>
    `)
    .join('');

  // Multi-colored rainbow progress bar
  const rainbowBarSegments = categoryEntries
    .map((item) => `<div style="width: ${item.pct}%; height: 100%; background: ${item.color};"></div>`)
    .join('');

  // Build Full HTML Content
  const htmlContent = `
    <!-- HEADER BRANDING WITH EXPLICIT SVG BRAND ASSETS -->
    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        ${logoSvg}
        <div style="display: flex; flex-direction: column; justify-content: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            ${wordmarkSvg}
          </div>
          ${punchlineSvg}
        </div>
      </div>

      <div style="text-align: right;">
        <div style="font-size: 11px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.8px; background: #eef2ff; padding: 4px 10px; border-radius: 8px; display: inline-block;">
          Official Trip Workbook
        </div>
        <div style="font-size: 10px; color: #64748b; margin-top: 4px; font-weight: 600;">
          Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
        </div>
      </div>
    </div>

    <!-- TRIP HERO CARD -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%); color: #ffffff; border-radius: 16px; padding: 20px 24px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(79,70,229,0.15); page-break-inside: avoid;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; tracking: 1px; color: #a5b4fc; letter-spacing: 1px;">VIADIA ITINERARY & LEDGER REPORT</span>
          <h1 style="font-size: 24px; font-weight: 900; margin: 4px 0 0 0; color: #ffffff;">${trip.title}</h1>
        </div>
        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; background: rgba(255,255,255,0.2); color: #ffffff; padding: 4px 10px; border-radius: 20px; backdrop-filter: blur(4px);">
          ${(trip.status || 'PLANNED').toUpperCase()}
        </span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2); font-size: 11px;">
        <div>
          <div style="font-size: 9px; text-transform: uppercase; color: #c7d2fe; font-weight: 700;">Dates of Travel</div>
          <div style="font-weight: 800; margin-top: 2px;">${trip.startDate || 'TBD'} &rarr; ${trip.endDate || 'TBD'}</div>
        </div>
        <div>
          <div style="font-size: 9px; text-transform: uppercase; color: #c7d2fe; font-weight: 700;">Base Currency</div>
          <div style="font-weight: 800; margin-top: 2px;">${baseCurr}</div>
        </div>
        <div>
          <div style="font-size: 9px; text-transform: uppercase; color: #c7d2fe; font-weight: 700;">Countries</div>
          <div style="font-weight: 800; margin-top: 2px;">${trip.countries?.length ? trip.countries.join(', ') : 'Not set'}</div>
        </div>
        <div>
          <div style="font-size: 9px; text-transform: uppercase; color: #c7d2fe; font-weight: 700;">Travelers (${trip.travelers?.length || 0})</div>
          <div style="font-weight: 800; margin-top: 2px;">${trip.travelers?.length ? trip.travelers.join(', ') : 'Me'}</div>
        </div>
      </div>

      ${trip.description ? `
        <div style="margin-top: 14px; font-size: 11px; color: #e0e7ff; font-style: italic; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 8px;">
          Notes: ${trip.description}
        </div>
      ` : ''}
    </div>

    <!-- MODULE 1: BUDGET ANALYTICS & EXPENSE CHARTS -->
    ${includeBudget ? `
      <div style="margin-bottom: 28px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px;">
          <h2 style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 14px; background: #4f46e5; border-radius: 4px; display: inline-block;"></span>
            Financial Overview & Budget Analytics
          </h2>
          <span style="font-size: 11px; font-weight: 700; color: #64748b;">Summary Currency: ${baseCurr}</span>
        </div>

        <!-- Metric Cards -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; page-break-inside: avoid;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 8px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Total Spent</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 4px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${baseCurr} ${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 8px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Budget Limit</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 4px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${budgetLimit > 0 ? `${baseCurr} ${budgetLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Unset'}
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 8px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Remaining</div>
            <div style="font-size: 13px; font-weight: 900; color: ${budgetLimit > 0 ? (remainingBudget >= 0 ? '#10b981' : '#ef4444') : '#0f172a'}; margin-top: 4px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${budgetLimit > 0 ? `${baseCurr} ${remainingBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'}
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 8px;">
            <div style="font-size: 8.5px; font-weight: 800; color: #64748b; text-transform: uppercase;">Daily Avg (${tripDays}d)</div>
            <div style="font-size: 13px; font-weight: 900; color: #0f172a; margin-top: 4px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${baseCurr} ${dailyAverage.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <!-- Stacked Rainbow Progress Bar -->
        ${totalSpent > 0 ? `
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">Expense Category Breakdown</div>
            <div style="width: 100%; height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; display: flex; margin-bottom: 12px;">
              ${rainbowBarSegments}
            </div>
            <div>
              ${categoryBarsHtml}
            </div>
          </div>
        ` : `
          <div style="font-size: 11px; color: #64748b; font-style: italic; text-align: center; padding: 16px; background: #f8fafc; border-radius: 12px;">
            No expenses recorded yet for budget analysis.
          </div>
        `}
      </div>
    ` : ''}

    <!-- MODULE 2: VISUAL ITINERARY TIMELINE (STOPS) -->
    ${includePlanner ? `
      <div style="margin-bottom: 28px;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px;">
          <h2 style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 14px; background: #10b981; border-radius: 4px; display: inline-block;"></span>
            Travel Itinerary Timeline & Stops (${trip.timeline?.length || 0} Places)
          </h2>
        </div>

        ${(!trip.timeline || trip.timeline.length === 0) ? `
          <div style="font-size: 11px; color: #64748b; font-style: italic; text-align: center; padding: 16px; background: #f8fafc; border-radius: 12px;">
            No itinerary stops scheduled for this trip.
          </div>
        ` : `
          <div style="padding-top: 4px;">
            ${timelineHtml}
          </div>
        `}
      </div>
    ` : ''}

    <!-- MODULE 3: TRANSACTION LOGS (EXPENSE LEDGER) -->
    ${includeExpenses ? `
      <div style="margin-bottom: 28px;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 14px; background: #3b82f6; border-radius: 4px; display: inline-block;"></span>
            Transaction Logs & Expense Ledger (${trip.expenses?.length || 0} Transactions)
          </h2>
          <span style="font-size: 11px; font-weight: 800; color: #0f172a; font-family: monospace;">
            Total: ${baseCurr} ${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        ${(!trip.expenses || trip.expenses.length === 0) ? `
          <div style="font-size: 11px; color: #64748b; font-style: italic; text-align: center; padding: 16px; background: #f8fafc; border-radius: 12px;">
            No transaction records logged in the expense ledger.
          </div>
        ` : `
          <table style="width: 100%; border-collapse: collapse; text-align: left; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; table-layout: fixed; page-break-inside: auto;">
            <colgroup>
              <col style="width: 13%;" />
              <col style="width: 25%;" />
              <col style="width: 15%;" />
              <col style="width: 11%;" />
              <col style="width: 10%;" />
              <col style="width: 13%;" />
              <col style="width: 13%;" />
            </colgroup>
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 2px solid #cbd5e1; color: #0f172a; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">
                <th style="padding: 8px 6px;">Date</th>
                <th style="padding: 8px 6px;">Title / Expense</th>
                <th style="padding: 8px 6px;">Category</th>
                <th style="padding: 8px 6px;">Paid By</th>
                <th style="padding: 8px 6px;">Method</th>
                <th style="padding: 8px 6px;">Original Spend</th>
                <th style="padding: 8px 6px; text-align: right;">Converted (${baseCurr})</th>
              </tr>
            </thead>
            <tbody>
              ${expensesHtml}
            </tbody>
            <tfoot>
              <tr style="background: #eef2ff; font-weight: 900; font-size: 10px; color: #1e1b4b; border-top: 2px solid #4f46e5;">
                <td colspan="6" style="padding: 8px 6px; text-transform: uppercase;">Total Aggregate Expenditure</td>
                <td style="padding: 8px 6px; text-align: right; font-family: monospace; font-size: 11px;">
                  ${baseCurr} ${totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        `}
      </div>
    ` : ''}

    <!-- MODULE 4: PRE-TRAVEL CHECKLIST -->
    ${includeChecklist && trip.checklist && trip.checklist.length > 0 ? `
      <div style="margin-bottom: 28px;">
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 14px;">
          <h2 style="font-size: 14px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; display: flex; align-items: center; gap: 8px;">
            <span style="width: 8px; height: 14px; background: #ec4899; border-radius: 4px; display: inline-block;"></span>
            Packing & Preparation Checklist
          </h2>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${trip.checklist
            .map(
              (item) => `
            <div style="width: calc(50% - 4px); box-sizing: border-box; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; page-break-inside: avoid;">
              <span style="font-weight: 600; color: ${item.checked ? '#64748b' : '#0f172a'}; text-decoration: ${item.checked ? 'line-through' : 'none'}; word-break: break-word;">
                ${item.checked ? '☑' : '☐'} ${item.task}
              </span>
              <span style="font-size: 9px; color: #64748b; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">
                ${item.category || 'General'}
              </span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    ` : ''}

    <!-- FOOTER -->
    <div style="margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; font-weight: 600;">
      viadia &bull; Plan. Track. Share. Everywhere. &bull; Official Travel Document
    </div>
  `;

  // Create an isolated hidden iframe so html2canvas is not affected by parent Tailwind v4 oklch styles or offscreen z-index issues
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '0';
  iframe.style.width = '720px';
  iframe.style.height = '1000px';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) throw new Error('Could not initialize export document frame.');

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Trip Workbook</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: Helvetica, Arial, 'Helvetica Neue', 'Segoe UI', Roboto, sans-serif;
              background: #ffffff;
              color: #0f172a;
              padding: 16px;
              width: 680px;
              margin: 0 auto;
            }
          </style>
        </head>
        <body>
          <div id="pdf-root">
            ${htmlContent}
          </div>
        </body>
      </html>
    `);
    iframeDoc.close();

    // Give SVGs and layout 100ms to evaluate
    await new Promise((res) => setTimeout(res, 100));

    const pdfTarget = iframeDoc.getElementById('pdf-root') || iframeDoc.body;

    const filename = `${trip.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}_Workbook.pdf`;
    const opt = {
      margin: [8, 8, 8, 8],
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: 720 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    };

    if (Capacitor.isNativePlatform()) {
      const pdfBlob = await html2pdf().set(opt).from(pdfTarget).outputPdf('blob');
      await downloadOrShareBlob(pdfBlob, filename, {
        dialogTitle: `Share or Save ${trip.title} Workbook PDF`
      });
    } else {
      await html2pdf().set(opt).from(pdfTarget).save();
    }
  } finally {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }
}
