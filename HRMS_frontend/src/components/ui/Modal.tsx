import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalAnimation } from '../../hooks/useModalAnimation';
import { cn } from '../../utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Buttons, right-aligned at the bottom. */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/** Shared dialog: title, body, footer actions. Closes on Escape and on backdrop click. */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, description, children, footer, size = 'md' }) => {
  const { isMounted, handleClose, backdropClass, cardClass } = useModalAnimation({ isOpen, onClose });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && handleClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  if (!isMounted || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn('fixed inset-0 z-[9999] bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4 overflow-y-auto', backdropClass)}
      onMouseDown={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-xl sm:rounded-xl shadow-xl w-full sm:my-auto max-h-[92vh] flex flex-col',
          WIDTHS[size],
          cardClass
        )}
      >
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-1 -m-1 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
