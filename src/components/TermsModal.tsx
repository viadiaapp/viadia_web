import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText } from 'lucide-react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsModal({ isOpen, onClose }: TermsModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-left space-y-4 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
          title="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">Terms & Privacy Policy</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">User Rights & Data Integrity</p>
          </div>
        </div>

        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-3 max-h-64 overflow-y-auto pr-1">
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100">1. Data Privacy & Storage</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Your travel itineraries, expense ledgers, and profile configurations are stored securely using cloud database infrastructure. We do not sell your personal information.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100">2. Account Control & Deletion</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              You retain full ownership of your data. You may export database backups or delete your account and all corresponding trip records permanently at any time via Account Settings.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-100">3. Fair Usage</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              viadia is provided for personal, non-commercial travel planning and collaborative group organization.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
}
