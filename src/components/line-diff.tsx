import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import type { DiffToken } from '@/lib/scoring';
import { useTheme } from '@/hooks/use-theme';

/** Shows the scripted line with missed words struck through and substitutions highlighted. */
export function LineDiff({ diff }: { diff: DiffToken[] }) {
  const theme = useTheme();
  return (
    <Text variant="script" style={styles.text}>
      {diff.map((t, i) => {
        const space = i === 0 ? '' : ' ';
        // "are" from "What're" is already shown as part of "What're".
        if (t.kind === 'ok' && t.joined) return null;
        if (t.kind === 'ok') return <Text key={i} variant="script">{space + t.word}</Text>;
        if (t.kind === 'missing') {
          return (
            <Text key={i} variant="script" style={[styles.missing, { color: theme.miss }]}>
              {space + t.word}
            </Text>
          );
        }
        if (t.kind === 'wrong') {
          return (
            <Text key={i} variant="script">
              {space}
              <Text variant="script" style={[styles.wrong, { color: theme.close, backgroundColor: theme.closeSoft }]}>
                {t.word}
              </Text>
              <Text variant="caption" color="textSecondary">{` (said “${t.said}”)`}</Text>
            </Text>
          );
        }
        return (
          <Text key={i} variant="caption" color="textSecondary" style={styles.extra}>
            {`${space}+${t.word}`}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {},
  missing: { textDecorationLine: 'line-through' },
  wrong: { fontWeight: '600' },
  extra: { fontStyle: 'italic' },
});
