import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'script'
  | 'callout'
  | 'caption'
  | 'overline';

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: ThemeColor;
};

/** Typography: New York serif for titles and script text, San Francisco for interface text. */
export function Text({ variant = 'body', color, style, ...rest }: TextProps) {
  const theme = useTheme();
  const defaultColor: ThemeColor = variant === 'caption' || variant === 'overline' ? 'textSecondary' : 'text';
  return (
    <RNText
      maxFontSizeMultiplier={variant === 'display' ? 1.3 : 1.8}
      style={[styles[variant], { color: theme[color ?? defaultColor] }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  display: {
    fontFamily: Fonts.serif,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  heading: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 24,
  },
  bodyStrong: {
    fontFamily: Fonts.sans,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  script: {
    fontFamily: Fonts.serif,
    fontSize: 21,
    lineHeight: 30,
  },
  callout: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    lineHeight: 20,
  },
  caption: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  overline: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
