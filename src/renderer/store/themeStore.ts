import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ThemeColors {
  id: string;
  name: string;
  description: string;
  topBarBg: string;
  topBarBorder: string;
  moduleContainerBg: string;
  moduleContainerRing: string;
  activeModuleBg: string;
  activeModuleIndicator: string;
  activeModuleText: string;
  activeModuleIcon: string;
  inactiveModuleText: string;
  inactiveModuleIcon: string;
  hoverModuleBg: string;
  hoverModuleText: string;
  activeShadow: string;
}

export const themes: ThemeColors[] = [
  {
    id: 'blue',
    name: '蓝色',
    description: '清新的蓝色主题',
    topBarBg: 'bg-gradient-to-b from-blue-50 to-blue-100',
    topBarBorder: 'border-blue-200',
    moduleContainerBg: 'bg-blue-100/90',
    moduleContainerRing: 'ring-blue-200',
    activeModuleBg: 'bg-blue-300/80',
    activeModuleIndicator: 'bg-blue-400',
    activeModuleText: 'text-blue-900',
    activeModuleIcon: 'text-blue-800',
    inactiveModuleText: 'text-gray-800',
    inactiveModuleIcon: 'text-gray-600',
    hoverModuleBg: 'hover:bg-blue-200/60',
    hoverModuleText: 'hover:text-blue-900',
    activeShadow: 'shadow-lg shadow-blue-300'
  },
  {
    id: 'white',
    name: '白色',
    description: '简洁的白色主题',
    topBarBg: 'bg-white',
    topBarBorder: 'border-gray-100',
    moduleContainerBg: 'bg-white/95',
    moduleContainerRing: 'ring-gray-200',
    activeModuleBg: 'bg-gray-100',
    activeModuleIndicator: 'bg-gray-400',
    activeModuleText: 'text-gray-900',
    activeModuleIcon: 'text-gray-700',
    inactiveModuleText: 'text-gray-700',
    inactiveModuleIcon: 'text-gray-500',
    hoverModuleBg: 'hover:bg-gray-50',
    hoverModuleText: 'hover:text-gray-900',
    activeShadow: 'shadow-lg shadow-gray-200'
  },
  {
    id: 'dark',
    name: '黑色',
    description: '深色主题',
    topBarBg: 'bg-gradient-to-b from-gray-800 to-gray-900',
    topBarBorder: 'border-gray-700',
    moduleContainerBg: 'bg-gray-700/90',
    moduleContainerRing: 'ring-gray-600',
    activeModuleBg: 'bg-gray-600/80',
    activeModuleIndicator: 'bg-gray-500',
    activeModuleText: 'text-white',
    activeModuleIcon: 'text-gray-200',
    inactiveModuleText: 'text-gray-300',
    inactiveModuleIcon: 'text-gray-400',
    hoverModuleBg: 'hover:bg-gray-600/60',
    hoverModuleText: 'hover:text-white',
    activeShadow: 'shadow-lg shadow-gray-600'
  },
  {
    id: 'pink',
    name: '粉色',
    description: '温柔的粉色主题',
    topBarBg: 'bg-gradient-to-b from-pink-50 to-rose-100',
    topBarBorder: 'border-pink-200',
    moduleContainerBg: 'bg-pink-100/90',
    moduleContainerRing: 'ring-pink-200',
    activeModuleBg: 'bg-pink-300/80',
    activeModuleIndicator: 'bg-pink-400',
    activeModuleText: 'text-pink-900',
    activeModuleIcon: 'text-pink-800',
    inactiveModuleText: 'text-gray-800',
    inactiveModuleIcon: 'text-gray-600',
    hoverModuleBg: 'hover:bg-pink-200/60',
    hoverModuleText: 'hover:text-pink-900',
    activeShadow: 'shadow-lg shadow-pink-300'
  },
  {
    id: 'lightCoffee',
    name: '浅咖',
    description: '柔和的浅咖主题',
    topBarBg: 'bg-gradient-to-b from-amber-50 to-stone-100',
    topBarBorder: 'border-amber-200',
    moduleContainerBg: 'bg-amber-100/90',
    moduleContainerRing: 'ring-amber-200',
    activeModuleBg: 'bg-amber-300/80',
    activeModuleIndicator: 'bg-amber-400',
    activeModuleText: 'text-stone-900',
    activeModuleIcon: 'text-stone-800',
    inactiveModuleText: 'text-stone-800',
    inactiveModuleIcon: 'text-stone-600',
    hoverModuleBg: 'hover:bg-amber-200/70',
    hoverModuleText: 'hover:text-stone-900',
    activeShadow: 'shadow-lg shadow-amber-300'
  },
  {
    id: 'coffee',
    name: '深咖',
    description: '沉稳的深咖主题',
    topBarBg: 'bg-gradient-to-b from-stone-700 to-stone-900',
    topBarBorder: 'border-stone-700',
    moduleContainerBg: 'bg-stone-700/90',
    moduleContainerRing: 'ring-stone-600',
    activeModuleBg: 'bg-amber-800/80',
    activeModuleIndicator: 'bg-amber-700',
    activeModuleText: 'text-amber-50',
    activeModuleIcon: 'text-amber-100',
    inactiveModuleText: 'text-stone-200',
    inactiveModuleIcon: 'text-stone-300',
    hoverModuleBg: 'hover:bg-stone-600/70',
    hoverModuleText: 'hover:text-amber-50',
    activeShadow: 'shadow-lg shadow-stone-700'
  },
  {
    id: 'lightGreen',
    name: '浅绿',
    description: '清爽的浅绿主题',
    topBarBg: 'bg-gradient-to-b from-emerald-50 to-green-100',
    topBarBorder: 'border-green-200',
    moduleContainerBg: 'bg-green-100/90',
    moduleContainerRing: 'ring-green-200',
    activeModuleBg: 'bg-green-300/80',
    activeModuleIndicator: 'bg-green-400',
    activeModuleText: 'text-green-900',
    activeModuleIcon: 'text-green-800',
    inactiveModuleText: 'text-gray-800',
    inactiveModuleIcon: 'text-gray-600',
    hoverModuleBg: 'hover:bg-green-200/60',
    hoverModuleText: 'hover:text-green-900',
    activeShadow: 'shadow-lg shadow-green-300'
  }
];

interface ThemeState {
  currentTheme: string;
  setTheme: (themeId: string) => void;
  getCurrentThemeColors: () => ThemeColors;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: 'blue',
      setTheme: (themeId: string) => {
        set({ currentTheme: themeId });
      },
      getCurrentThemeColors: () => {
        const { currentTheme } = get();
        return themes.find(theme => theme.id === currentTheme) || themes[0];
      }
    }),
    {
      name: 'theme-storage',
      version: 2,
      migrate: (persistedState: any) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        const validThemeIds = new Set(themes.map(theme => theme.id));
        if (!validThemeIds.has(persistedState.currentTheme)) {
          return { ...persistedState, currentTheme: 'blue' };
        }
        return persistedState;
      }
    }
  )
);
