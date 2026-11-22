/**
 * Design tokens for Places, Please.
 * Palette is Carnegie Mellon's brand colors: Carnegie Red, Iron Gray, Steel Gray,
 * plus the secondary "thread" colors for result states.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Brand = {
  carnegieRed: '#C41230',
  scotsRose: '#EF3A47',
  ironGray: '#6D6E71',
  steelGray: '#E0E0E0',
  goldThread: '#FDB515',
  greenThread: '#009647',
  tealThread: '#008F91',
  blueThread: '#043673',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export const Colors = {
  light: {
    text: '#111111',
    textSecondary: Brand.ironGray,
    textTertiary: '#9A9B9E',
    background: '#FFFFFF',
    surface: '#F7F6F4',
    surfaceRaised: '#FFFFFF',
    border: Brand.steelGray,
    primary: Brand.carnegieRed,
    primaryPressed: '#A10E27',
    onPrimary: Brand.white,
    primarySoft: '#FBE7EA',
    perfect: Brand.greenThread,
    perfectSoft: '#E3F4EA',
    close: '#B37F00',
    closeSoft: '#FFF4D6',
    miss: Brand.carnegieRed,
    missSoft: '#FBE7EA',
    accent: Brand.tealThread,
  },
  dark: {
    text: '#F4F4F5',
    textSecondary: '#A7A8AA',
    textTertiary: '#737477',
    background: '#0D0D0E',
    surface: '#18181A',
    surfaceRaised: '#202023',
    border: '#2E2E32',
    primary: Brand.scotsRose,
    primaryPressed: '#D52F3C',
    onPrimary: Brand.white,
    primarySoft: '#3A1419',
    perfect: '#2DBE6C',
    perfectSoft: '#123222',
    close: Brand.goldThread,
    closeSoft: '#3A2E0C',
    miss: Brand.scotsRose,
    missSoft: '#3A1419',
    accent: '#22B5B7',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

export const Radius = {
  small: 8,
  medium: 12,
  large: 18,
  pill: 999,
} as const;

export const MaxContentWidth = 720;
