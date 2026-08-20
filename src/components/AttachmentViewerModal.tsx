import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Download, FileText, Image as ImageIcon, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { AttachmentItem } from '../types';
import { useBackButton } from '../lib/backButtonHandler';
import { downloadOrShareBase64 } from '../lib/nativeShareDownload';

interface AttachmentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  fileName?: string;
  fileData?: string;
  attachments?: AttachmentItem[];
  initialIndex?: number;
  onDeleteAttachment?: (attachmentId?: string, index?: number) => void;
}

export function AttachmentViewerModal({
  isOpen,
  onClose,
  title = 'View Attachment',
  fileName,
  fileData,
  attachments = [],
  initialIndex = 0,
  onDeleteAttachment,
}: AttachmentViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useBackButton('attachment-viewer-modal', isOpen, onClose, 100);

  // Normalize single file prop vs attachments array
  const activeList: AttachmentItem[] = attachments.length > 0
    ? attachments
    : fileData
    ? [{ id: 'single', name: fileName || 'Attachment', data: fileData }]
    : [];

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const currentItem = activeList[currentIndex] || activeList[0];

  const currentData = currentItem?.data || fileData || '';
  const currentName = currentItem?.name || fileName || 'Attachment';

  const isPdf = Boolean(
    currentData &&
      (currentData.startsWith('data:application/pdf') ||
        currentData.startsWith('data:application/x-pdf') ||
        currentData.includes('JVBERi') ||
        currentName?.toLowerCase().endsWith('.pdf'))
  );

  useEffect(() => {
    if (!isOpen || !currentData || !isPdf) {
      setBlobUrl(null);
      return;
    }

    try {
      let base64 = currentData;
      let mimeType = 'application/pdf';

      if (currentData.startsWith('data:')) {
        const parts = currentData.split(',');
        const meta = parts[0];
        base64 = parts[1] || '';
        const match = meta.match(/:(.*?);/);
        if (match && match[1]) {
          mimeType = match[1];
        }
      }

      base64 = base64.replace(/\s/g, '');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (err) {
      console.warn('Failed to parse PDF blob URL:', err);
      setBlobUrl(null);
    }
  }, [isOpen, currentData, isPdf, currentIndex]);

  if (!isOpen || !currentData) return null;

  const handleDownload = async () => {
    const filename = currentName || (isPdf ? 'attachment.pdf' : 'attachment.jpg');
    await downloadOrShareBase64(currentData, filename, {
      dialogTitle: `Save or Share ${filename}`
    });
  };

  const handleOpenNewTab = () => {
    if (blobUrl) {
      window.open(blobUrl, '_blank');
    } else {
      const newTab = window.open();
      if (newTab) {
        if (isPdf) {
          newTab.document.write(
            `<iframe src="${currentData}" style="width:100%; height:100vh; border:none;"></iframe>`
          );
        } else {
          newTab.document.write(
            `<img src="${currentData}" style="max-width:100%; height:auto; display:block; margin:auto;" />`
          );
        }
      }
    }
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : activeList.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < activeList.length - 1 ? prev + 1 : 0));
  };

  const handleDeleteCurrent = () => {
    if (onDeleteAttachment) {
      onDeleteAttachment(currentItem?.id, currentIndex);
      if (activeList.length <= 1) {
        onClose();
      } else {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200 text-left">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-6 max-w-4xl w-full shadow-2xl relative flex flex-col max-h-[92vh] space-y-4 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-3 min-w-0 pr-2">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-2xl shrink-0">
              {isPdf ? <FileText className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white truncate">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate max-w-xs sm:max-w-md">
                {currentName} {activeList.length > 1 && `(${currentIndex + 1} of ${activeList.length})`}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {onDeleteAttachment && (
              <button
                onClick={handleDeleteCurrent}
                title="Delete attachment"
                className="p-2 text-rose-600 hover:text-rose-700 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 rounded-xl transition cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleOpenNewTab}
              title="Open in new tab"
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={handleDownload}
              title="Download file"
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition cursor-pointer"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer with Prev/Next Navigation if multiple */}
        <div className="relative flex-1 min-h-0 flex items-center justify-center bg-slate-50 dark:bg-slate-950/70 rounded-2xl p-3 border border-slate-200/80 dark:border-slate-800/80 overflow-hidden">
          {activeList.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-3 z-10 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white shadow-lg backdrop-blur-md transition cursor-pointer"
                title="Previous attachment"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-3 z-10 p-2.5 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white shadow-lg backdrop-blur-md transition cursor-pointer"
                title="Next attachment"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {isPdf ? (
            <object
              data={blobUrl || currentData}
              type="application/pdf"
              className="w-full h-[65vh] rounded-xl border-0 bg-white"
            >
              <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                <div className="p-4 bg-indigo-100 dark:bg-indigo-950/60 rounded-full text-indigo-600 dark:text-indigo-400">
                  <FileText className="h-10 w-10" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">PDF Document</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{currentName || 'Document.pdf'}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={handleOpenNewTab}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition cursor-pointer"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>Open PDF in New Tab</span>
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>
            </object>
          ) : (
            <img
              src={currentData}
              alt={currentName || 'Attachment preview'}
              className="max-h-[65vh] max-w-full object-contain rounded-xl shadow-md"
            />
          )}
        </div>

        {/* Thumbnails list if multiple */}
        {activeList.length > 1 && (
          <div className="flex items-center justify-center space-x-2 overflow-x-auto py-1">
            {activeList.map((att, idx) => {
              const isPdfThumb = att.data.includes('pdf') || att.name.toLowerCase().endsWith('.pdf');
              return (
                <button
                  key={att.id || idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer max-w-[150px] truncate ${
                    idx === currentIndex
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {isPdfThumb ? <FileText className="h-3.5 w-3.5 shrink-0" /> : <ImageIcon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{att.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-1">
          <span className="text-xs text-slate-400 font-medium">
            JPG, JPEG, PNG, PDF (Auto-compressed &lt; 500KB)
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold rounded-xl text-xs transition cursor-pointer"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
