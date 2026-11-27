import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type PaletteId = 'emerald' | 'ocean' | 'teal' | 'indigo' | 'plum';

export interface ColorPaletteOption {
  id: PaletteId;
  name: string;
  description: string;
  primaryHex: string;
  secondaryHex: string;
  softHex: string;
}

export const COLOR_PALETTES: ColorPaletteOption[] = [
  {
    id: 'emerald',
    name: 'Clinical Green',
    description: 'Calm, classic healthcare green with crisp readability.',
    primaryHex: '#059669',
    secondaryHex: '#047857',
    softHex: '#ECFDF5',
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    description: 'Clear, trustworthy medical blue with high contrast.',
    primaryHex: '#0284C7',
    secondaryHex: '#0369A1',
    softHex: '#F0F9FF',
  },
  {
    id: 'teal',
    name: 'Calm Teal',
    description: 'Balanced blue-green tone designed for comfortable viewing.',
    primaryHex: '#0D9488',
    secondaryHex: '#0F766E',
    softHex: '#F0FDFA',
  },
  {
    id: 'indigo',
    name: 'Royal Indigo',
    description: 'Deep, colorblind-friendly indigo with strong focus contrast.',
    primaryHex: '#4F46E5',
    secondaryHex: '#4338CA',
    softHex: '#EEF2FF',
  },
  {
    id: 'plum',
    name: 'Warm Plum',
    description: 'Accessible violet-plum accent that stands out cleanly.',
    primaryHex: '#7C3AED',
    secondaryHex: '#6D28D9',
    softHex: '#F5F3FF',
  },
];

interface ThemeContextValue {
  darkMode: boolean;
  toggleDark: () => void;
  setDarkMode: (dark: boolean) => void;
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
  activePalette: ColorPaletteOption;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_KEY = 'med_dark';
const PALETTE_KEY = 'med_palette';

function isValidPalette(val: string | null): val is PaletteId {
  return COLOR_PALETTES.some((p) => p.id === val);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    const saved = localStorage.getItem(DARK_KEY);
    if (saved !== null) return saved === 'true';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const [palette, setPaletteState] = useState<PaletteId>(() => {
    const saved = localStorage.getItem(PALETTE_KEY);
    return isValidPalette(saved) ? saved : 'emerald';
  });

  const setDarkMode = (dark: boolean) => {
    localStorage.setItem(DARK_KEY, String(dark));
    setDarkModeState(dark);
  };

  const toggleDark = () => {
    setDarkMode(!darkMode);
  };

  const setPalette = (next: PaletteId) => {
    localStorage.setItem(PALETTE_KEY, next);
    setPaletteState(next);
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
  }, [palette]);

  const activePalette = COLOR_PALETTES.find((p) => p.id === palette) ?? COLOR_PALETTES[0];

  return (
    <ThemeContext.Provider
      value={{
        darkMode,
        toggleDark,
        setDarkMode,
        palette,
        setPalette,
        activePalette,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return ctx;
}

