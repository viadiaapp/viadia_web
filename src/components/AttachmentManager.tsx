import React, { useRef, useState } from 'react';
import { Paperclip, Eye, Trash2, Upload, Camera, FileText, Image as ImageIcon, AlertCircle, Loader2 } from 'lucide-react';
import { AttachmentItem } from '../types';
import { validateAttachmentFile, compressImageFile, ALLOWED_FILE_TYPES_NOTE } from '../lib/imageUtils';
import { capturePhotoDirectly } from '../lib/cameraUtils';
import { AttachmentViewerModal } from './AttachmentViewerModal';

interface AttachmentManagerProps {
  attachments: AttachmentItem[];
  onChange: (updatedAttachments: AttachmentItem[]) => void;
  title?: string;
  maxFiles?: number;
}

export function AttachmentManager({
  attachments = [],
  onChange,
  title = 'Attachments',
  maxFiles = 10,
}: AttachmentManagerProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErrorMsg(null);
    setIsProcessing(true);

    try {
      const newItems: AttachmentItem[] = [...attachments];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (newItems.length >= maxFiles) {
          setErrorMsg(`Maximum limit of ${maxFiles} attachments reached.`);
          break;
        }

        const validation = validateAttachmentFile(file);
        if (!validation.valid) {
          setErrorMsg(validation.error || 'Invalid file.');
          continue;
        }

        const compressed = await compressImageFile(file);
        if (compressed.data) {
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          newItems.push({
            id: `att-${Math.random().toString(36).substring(2, 9)}`,
            name: file.name,
            data: compressed.data,
            type: isPdf ? 'pdf' : 'image',
            size: compressed.size,
            createdAt: new Date().toISOString(),
          });
        }
      }

      onChange(newItems);
    } catch (err: any) {
      console.error('File upload error:', err);
      setErrorMsg('Failed to process file attachment.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDirectCamera = async () => {
    setErrorMsg(null);
    if (attachments.length >= maxFiles) {
      setErrorMsg(`Maximum limit of ${maxFiles} attachments reached.`);
      return;
    }

    try {
      setIsProcessing(true);
      const result = await capturePhotoDirectly('Receipt');
      if (result && result.data) {
        const newItem: AttachmentItem = {
          id: 'att_' + Math.random().toString(36).substring(2, 9),
          name: result.name,
          data: result.data,
          type: 'image',
          size: result.size,
          createdAt: new Date().toISOString(),
        };
        onChange([...attachments, newItem]);
      }
    } catch (err: any) {
      console.error('Camera capture error:', err);
      setErrorMsg('Failed to capture photo from camera.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = (id: string, index?: number) => {
    const updated = attachments.filter((item, idx) => item.id !== id && idx !== index);
    onChange(updated);
  };

  const handleView = (index: number) => {
    setSelectedIdx(index);
    setViewerOpen(true);
  };

  return (
    <div className="space-y-3 text-left">
      <div className="flex items-center justify-between">
        <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 uppercase tracking-wider">
          <Paperclip className="h-3.5 w-3.5 text-indigo-500" />
          <span>{title} ({attachments.length})</span>
        </label>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
          Max 500KB per file
        </span>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Attachment Items List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((att, idx) => {
            const isPdf = att.data?.includes('pdf') || att.type === 'pdf' || att.name.toLowerCase().endsWith('.pdf');
            return (
              <div
                key={att.id || `att-${idx}`}
                className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100/80 dark:hover:bg-slate-800 transition"
              >
                <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                  <div className="p-1.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0">
                    {isPdf ? <FileText className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                      {att.name}
                    </p>
                    {att.size && (
                      <p className="text-[10px] text-slate-400 font-mono">
                        {(att.size / 1024).toFixed(0)} KB
                      </p>
                    )}
                  </div>
                </div>

                {/* Eye (View) & Delete Buttons beside each attachment */}
                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleView(idx)}
                    title="View attachment"
                    className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/80 rounded-lg transition cursor-pointer flex items-center space-x-1 text-xs font-bold"
                  >
                    <Eye className="h-4 w-4" />
                    <span className="hidden sm:inline">View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(att.id, idx)}
                    title="Delete attachment"
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />

        <button
          type="button"
          disabled={isProcessing || attachments.length >= maxFiles}
          onClick={() => fileInputRef.current?.click()}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer flex items-center space-x-1.5 border border-slate-200 dark:border-slate-700 disabled:opacity-50 shadow-xs"
        >
          <Upload className="h-3.5 w-3.5 text-indigo-500" />
          <span>Upload File (JPG/PNG/PDF)</span>
        </button>

        <button
          type="button"
          disabled={isProcessing || attachments.length >= maxFiles}
          onClick={handleDirectCamera}
          className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 text-indigo-600 dark:text-indigo-400 font-bold rounded-xl text-xs transition cursor-pointer flex items-center space-x-1.5 border border-indigo-200 dark:border-indigo-800/60 disabled:opacity-50 shadow-xs"
        >
          {isProcessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
          ) : (
            <Camera className="h-3.5 w-3.5 text-indigo-500" />
          )}
          <span>Take Photo</span>
        </button>
      </div>

      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
        {ALLOWED_FILE_TYPES_NOTE}
      </p>

      {/* Viewer Modal */}
      <AttachmentViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        attachments={attachments}
        initialIndex={selectedIdx}
        title={title}
        onDeleteAttachment={(id, idx) => {
          if (id) handleDelete(id, idx);
        }}
      />
    </div>
  );
}
