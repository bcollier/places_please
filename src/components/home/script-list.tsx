import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Script } from '@/lib/types';

/** "Your scripts": every script, with the current one first. */
export function ScriptList({ scripts, currentScript }: { scripts: Script[]; currentScript: Script | null }) {
  const otherScripts = scripts.filter((s) => s.id !== currentScript?.id);
  const ordered = currentScript ? [currentScript, ...otherScripts] : otherScripts;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="overline">Your scripts</Text>
        <Button title="Add" icon="plus" size="small" variant="ghost" onPress={() => router.push('/scripts/new')} />
      </View>
      {ordered.map((s) => (
        <ScriptRow key={s.id} script={s} current={s.id === currentScript?.id} />
      ))}
    </View>
  );
}

function ScriptRow({ script, current }: { script: Script; current: boolean }) {
  const theme = useTheme();
  return (
    <Card
      onPress={() => router.push({ pathname: '/scripts/[id]', params: { id: script.id } })}
      accessibilityLabel={`${script.title}${current ? ', current script' : ''}`}
      style={styles.scriptRow}>
      <View style={[styles.dot, { backgroundColor: current ? theme.primary : theme.border }]} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {script.title}
        </Text>
        <Text variant="caption">
          {script.my_character ? `${script.my_character} · ` : ''}
          {script.lines.length} lines
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color={theme.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scriptRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: 4 },
  flex: { flex: 1 },
});
