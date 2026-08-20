import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { copyToClipboard } from './clipboardUtils';
import type { jsPDF } from 'jspdf';

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export interface FileShareOptions {
  dialogTitle?: string;
}

/**
 * Universal Share function supporting Android Native (via Capacitor Share plugin)
 * and Web (via Web Share API or Clipboard fallback).
 */
export async function shareContent(options: ShareOptions): Promise<{ success: boolean; method: 'native' | 'web-share' | 'clipboard' }> {
  const { title = 'viadia', text = '', url = '', dialogTitle } = options;

  // 1. Android / iOS Native via Capacitor
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({
        title,
        text,
        url: url || undefined,
        dialogTitle: dialogTitle || title,
      });
      return { success: true, method: 'native' };
    } catch (err: any) {
      if (err?.message?.includes('canceled') || err?.message?.includes('cancelled') || err?.name === 'AbortError') {
        return { success: false, method: 'native' };
      }
      console.warn('Capacitor native share error, attempting fallback:', err);
    }
  }

  // 2. Web Share API (Desktop / Mobile browsers with share support)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      const shareData: ShareData = {};
      if (title) shareData.title = title;
      if (text) shareData.text = text;
      if (url) shareData.url = url;

      await navigator.share(shareData);
      return { success: true, method: 'web-share' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { success: false, method: 'web-share' };
      }
      console.warn('Web share failed, falling back to clipboard:', err);
    }
  }

  // 3. Fallback: Copy to clipboard
  const fallbackMessage = [text, url].filter(Boolean).join('\n\n') || title;
  const copied = await copyToClipboard(fallbackMessage);
  return { success: copied, method: 'clipboard' };
}

/**
 * Converts a Blob to a base64 encoded string.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Universal File Download / Save / Share mechanism.
 * In Android Native: writes the file to device cache directory and presents
 * the native Android Action Sheet so the user can save to Files/Drive or share to any app.
 * In Web Browser: triggers standard browser file download via temporary anchor element.
 */
export async function downloadOrShareBlob(
  blob: Blob,
  filename: string,
  options?: FileShareOptions
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(blob);
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      await Share.share({
        title: filename,
        url: writeResult.uri,
        dialogTitle: options?.dialogTitle || `Save or Share ${filename}`
      });
      return;
    } catch (err) {
      console.error('Failed to write and share file on native platform:', err);
      // Fall through to browser download as fallback
    }
  }

  // Web Browser fallback
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Universal text/csv/json/gpx downloader & sharer.
 */
export async function downloadOrShareText(
  textContent: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8;',
  options?: FileShareOptions
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: textContent,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true
      });

      await Share.share({
        title: filename,
        url: writeResult.uri,
        dialogTitle: options?.dialogTitle || `Save or Share ${filename}`
      });
      return;
    } catch (err) {
      console.error('Failed to write and share text file on native platform:', err);
    }
  }

  const blob = new Blob([textContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Universal Base64 / DataURI downloader & sharer (e.g. for receipts, photos, attachments).
 */
export async function downloadOrShareBase64(
  dataUriOrBase64: string,
  filename: string,
  options?: FileShareOptions
): Promise<void> {
  if (!dataUriOrBase64) return;

  const isDataUri = dataUriOrBase64.startsWith('data:');
  const base64Data = isDataUri ? dataUriOrBase64.split(',')[1] : dataUriOrBase64;

  if (Capacitor.isNativePlatform()) {
    try {
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      await Share.share({
        title: filename,
        url: writeResult.uri,
        dialogTitle: options?.dialogTitle || `Save or Share ${filename}`
      });
      return;
    } catch (err) {
      console.error('Failed to write and share base64 file on native platform:', err);
    }
  }

  // Web Browser fallback
  if (isDataUri) {
    const link = document.createElement('a');
    link.href = dataUriOrBase64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    // Decode base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Universal jsPDF Document downloader & sharer.
 */
export async function downloadOrSharePdf(
  doc: jsPDF,
  filename: string,
  options?: FileShareOptions
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const blob = doc.output('blob');
      await downloadOrShareBlob(blob, filename, options);
      return;
    } catch (err) {
      console.error('Failed to export PDF natively on Capacitor:', err);
    }
  }

  doc.save(filename);
}
