import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, LogOut, Trash2, X } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'primary' | 'info';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  iconType?: 'alert' | 'trash' | 'logout' | 'check';
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children, darkMode = false }: { children: ReactNode; darkMode?: boolean }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setOptions(opts);
      setIsOpen(true);
    });
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel]);

  const variant = options?.variant || 'danger';

  const getIcon = () => {
    if (options?.iconType === 'logout') return <LogOut className="w-6 h-6 text-red-500" />;
    if (options?.iconType === 'trash') return <Trash2 className="w-6 h-6 text-red-500" />;
    if (variant === 'danger') return <AlertTriangle className="w-6 h-6 text-red-500" />;
    if (variant === 'warning') return <AlertCircle className="w-6 h-6 text-amber-500" />;
    return <CheckCircle className="w-6 h-6 text-green-500" />;
  };

  const getIconBg = () => {
    if (variant === 'danger' || options?.iconType === 'logout' || options?.iconType === 'trash') {
      return darkMode ? 'bg-red-950/50 border-red-900/50' : 'bg-red-50 border-red-100';
    }
    if (variant === 'warning') {
      return darkMode ? 'bg-amber-950/50 border-amber-900/50' : 'bg-amber-50 border-amber-100';
    }
    return darkMode ? 'bg-green-950/50 border-green-900/50' : 'bg-green-50 border-green-100';
  };

  const getConfirmBtnClass = () => {
    if (variant === 'danger' || options?.iconType === 'logout' || options?.iconType === 'trash') {
      return 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20';
    }
    if (variant === 'warning') {
      return 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20';
    }
    return 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20';
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {isOpen && options && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={handleCancel}
        >
          <div
            className={`w-full max-w-md rounded-2xl p-6 shadow-2xl border transition-all transform scale-100 ${
              darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-100 text-gray-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className={`p-3 rounded-2xl border ${getIconBg()} flex-shrink-0`}>
                {getIcon()}
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className={`p-1.5 rounded-xl transition-colors ${
                  darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-bold leading-6">
                {options.title || 'Are you sure?'}
              </h3>
              <p className={`mt-2 text-sm leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {options.message}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                {options.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                autoFocus
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${getConfirmBtnClass()}`}
              >
                {options.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside a ConfirmProvider');
  }
  return ctx;
}

