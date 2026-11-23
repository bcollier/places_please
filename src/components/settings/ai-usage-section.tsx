import { StyleSheet, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useAiUsage } from '@/hooks/use-ai-usage';

export function AiUsageSection() {
  const { usage, usageError } = useAiUsage();
  return (
    <SettingsSection title="AI usage" subtitle="Every AI call is logged with its cost. Last 30 days.">
      {usage ? (
        <View style={styles.usageRow}>
          <UsageStat label="Calls" value={String(usage.calls)} />
          <UsageStat label="30-day cost" value={formatCost(usage.costUsd)} />
          <UsageStat label="Today" value={formatCost(usage.todayCostUsd)} />
        </View>
      ) : (
        <Text variant="caption">{usageError ?? 'Loading…'}</Text>
      )}
    </SettingsSection>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.usage}>
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

/** Dollars, with four decimals under $1 so small costs don't show as $0.00. */
function formatCost(usd: number) {
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`;
}

const styles = StyleSheet.create({
  usageRow: { flexDirection: 'row', gap: Spacing.three },
  usage: { flex: 1, gap: 2 },
});
