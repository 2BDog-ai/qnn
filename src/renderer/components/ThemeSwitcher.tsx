import React, { useState } from 'react';
import { themes, useThemeStore } from '../store/themeStore';

const swatches: Record<string, string> = {
  white: 'bg-white border-gray-300',
  dark: 'bg-gray-900 border-gray-700',
  pink: 'bg-pink-300 border-pink-400',
  lightCoffee: 'bg-amber-100 border-amber-300',
  coffee: 'bg-stone-700 border-stone-800',
  lightGreen: 'bg-green-200 border-green-300',
  blue: 'bg-blue-300 border-blue-400'
};

export const ThemeSwitcher: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { currentTheme, setTheme } = useThemeStore();
  const current = themes.find(theme => theme.id === currentTheme) || themes[0];

  return (
    <div className="relative" style={{ ['WebkitAppRegion' as any]: 'no-drag' }}>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 border border-gray-200 text-gray-700 hover:bg-white hover:shadow-sm transition-all"
        title="切换颜色"
      >
        <span className={`w-4 h-4 rounded-full border ${swatches[current.id] || 'bg-blue-300 border-blue-400'}`} />
        <span className="text-sm font-medium">颜色</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[9998] cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div className="absolute right-0 top-full mt-2 z-[9999] w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
            {themes.map(theme => (
              <button
                key={theme.id}
                type="button"
                onClick={() => {
                  setTheme(theme.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                  currentTheme === theme.id ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border ${swatches[theme.id] || 'bg-blue-300 border-blue-400'}`} />
                <span>{theme.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
