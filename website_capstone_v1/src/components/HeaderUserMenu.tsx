import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Moon, Sun, User as UserIcon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface HeaderUserMenuProps {
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
  onOpenAccount: () => void;
  onLogout: () => void;
  accountActive?: boolean;
}

export default function HeaderUserMenu({
  userName,
  userEmail,
  roleLabel,
  onOpenAccount,
  onLogout,
  accountActive = false,
}: HeaderUserMenuProps) {
  const { darkMode: dm, toggleDark, activePalette } = useTheme();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const initial = (userName?.trim().charAt(0) || 'U').toUpperCase();
  const displayName = userName?.trim() || 'Account';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-sm font-medium transition-all ${
          accountActive || open
            ? dm
              ? 'bg-gray-800 border-gray-600 text-white'
              : 'bg-white border-gray-300 text-gray-900 shadow-sm'
            : dm
              ? 'bg-gray-800/80 border-gray-700 text-gray-200 hover:bg-gray-800'
              : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-white hover:border-gray-300 shadow-xs'
        }`}
      >
        <span className="w-7 h-7 rounded-lg accent-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initial}
        </span>
        <span className="hidden sm:inline max-w-[130px] truncate">{displayName}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''} ${dm ? 'text-gray-400' : 'text-gray-600'}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 mt-2 w-64 rounded-2xl border overflow-hidden z-40 ${
            dm
              ? 'bg-gray-900 border-gray-700 shadow-2xl shadow-black/50'
              : 'bg-white border-gray-200 shadow-xl shadow-slate-900/10'
          }`}
        >
          {/* User summary header */}
          <div className={`px-4 py-3 border-b ${dm ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm font-bold truncate ${dm ? 'text-white' : 'text-gray-900'}`}>
                {displayName}
              </p>
              {roleLabel && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full accent-soft flex-shrink-0">
                  {roleLabel}
                </span>
              )}
            </div>
            {userEmail && (
              <p className={`text-xs truncate mt-0.5 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
                {userEmail}
              </p>
            )}
          </div>

          <div className="p-1.5 space-y-0.5">
            {/* 1. Account */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenAccount();
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                accountActive
                  ? 'accent-soft'
                  : dm
                    ? 'text-gray-200 hover:bg-gray-800'
                    : 'text-gray-800 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <UserIcon className="w-4 h-4 accent-text" />
                Account
              </span>
              <span
                className="w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                style={{ backgroundColor: activePalette.primaryHex }}
                title={`Palette: ${activePalette.name}`}
              />
            </button>

            {/* 2. Theme (Dark / Light) */}
            <button
              type="button"
              role="menuitem"
              onClick={() => toggleDark()}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                dm ? 'text-gray-200 hover:bg-gray-800' : 'text-gray-800 hover:bg-slate-100'
              }`}
            >
              <span className="flex items-center gap-2.5">
                {dm ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600" />
                )}
                Theme
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  dm
                    ? 'bg-gray-800 text-amber-300 border border-gray-700'
                    : 'bg-slate-100 text-gray-700 border border-gray-200'
                }`}
              >
                {dm ? 'Dark' : 'Light'}
              </span>
            </button>
          </div>

          {/* 3. Log-out */}
          <div className={`p-1.5 border-t ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                dm
                  ? 'text-red-400 hover:bg-red-950/40'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <LogOut className="w-4 h-4" />
              Log-out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

