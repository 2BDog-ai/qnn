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
    id: 'default',
    name: '浅紫色',
    description: '默认的浅紫色主题',
    topBarBg: 'bg-gradient-to-b from-white to-gray-50',
    topBarBorder: 'border-gray-200',
    moduleContainerBg: 'bg-purple-100/90',
    moduleContainerRing: 'ring-purple-200',
    activeModuleBg: 'bg-purple-300/80',
    activeModuleIndicator: 'bg-purple-400',
    activeModuleText: 'text-purple-900',
    activeModuleIcon: 'text-purple-800',
    inactiveModuleText: 'text-gray-800',
    inactiveModuleIcon: 'text-gray-600',
    hoverModuleBg: 'hover:bg-purple-200/60',
    hoverModuleText: 'hover:text-purple-900',
    activeShadow: 'shadow-lg shadow-purple-300'
  },
  {
    id: 'white',
    name: '纯白色',
    description: '简洁的纯白色主题',
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
    id: 'blue',
    name: '天空蓝',
    description: '清新的天空蓝主题',
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
    id: 'green',
    name: '清新绿',
    description: '自然的清新绿主题',
    topBarBg: 'bg-gradient-to-b from-green-50 to-green-100',
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
  },
  {
    id: 'pink',
    name: '浪漫粉',
    description: '温柔的浪漫粉主题',
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
    id: 'dark',
    name: '深色模式',
    description: '优雅的深色主题',
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
      currentTheme: 'default',
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
      version: 1
    }
  )
);
