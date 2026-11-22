import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getAiUsageSummary } from '@/lib/api';
import { Cancellation } from '@/lib/audio/cancel';
import { castVoices, getVoices, speak, stopSpeaking } from '@/lib/audio/tts';
import { showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import type { AiUsageSummary, PauseLength, PauseOnMistake, Settings } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

const RATES: { label: string; value: number }[] = [
  { label: 'Slower', value: 0.8 },
  { label: 'Normal', value: 1 },
  { label: 'Faster', value: 1.2 },
];

const MISTAKE_OPTIONS: { label: string; value: PauseOnMistake; detail: string }[] = [
  { label: 'Stop', value: 'all', detail: 'After any mistake' },
  { label: 'Stop', value: 'missed', detail: 'Only after a missed line' },
  { label: 'Keep going', value: 'never', detail: 'Hands-free, screen off' },
];

const PAUSES: { label: string; value: PauseLength; detail: string }[] = [
  { label: 'Short', value: 'short', detail: 'Snappy dialogue' },
  { label: 'Medium', value: 'medium', detail: 'Most scenes' },
  { label: 'Long', value: 'long', detail: 'Dramatic pauses' },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, updateSettings } = useData();
  const { account } = useAuth();
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [voiceCount, setVoiceCount] = useState<number | null>(null);

  useEffect(() => {
    getAiUsageSummary()
      .then(setUsage)
      .catch((err) => setUsageError(toUserMessage(err)));
    getVoices()
      .then((v) => setVoiceCount(v.length))
      .catch(() => setVoiceCount(0));
  }, []);

  const sample = async (gender: 'female' | 'male') => {
    stopSpeaking();
    const cast = await castVoices({
      characters: ['SAMPLE'],
      me: null,
      genders: { SAMPLE: gender },
      engine: settings.voiceEngine,
    });
    await speak(
      gender === 'female'
        ? 'Places, please. Act one beginners, this is your call.'
        : 'Good my lord, how does your honour for this many a day?',
      cast.forCharacter('SAMPLE'),
      settings.speechRate,
      new Cancellation(),
    ).catch(() => {});
  };

  const set = (patch: Partial<Settings>) => {
    updateSettings(patch).catch((err) => showAlert('Not saved', toUserMessage(err)));
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.inner}>
        <Section title="Account">
          <Card onPress={() => router.push('/account')} accessibilityLabel="Account" style={styles.accountRow}>
            <Icon
              name={account.isGuest ? 'person.fill' : 'checkmark.circle.fill'}
              size={22}
              color={account.isGuest ? theme.primary : theme.perfect}
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{account.isGuest ? 'Guest' : (account.email ?? 'Signed in')}</Text>
              <Text variant="caption">
                {account.isGuest ? 'Sign in with email to save your scripts across devices' : 'Signed in with email'}
              </Text>
            </View>
            <Icon name="chevron.right" size={14} color={theme.textTertiary} />
          </Card>
        </Section>

        <Section
          title="Scene partner voices"
          subtitle={
            Platform.OS === 'web'
              ? 'Microsoft voices play in the iPhone app. In a browser, your browser’s voices are used.'
              : 'Microsoft voices sound natural and need an internet connection. iPhone voices work offline.'
          }>
          <View style={styles.chips}>
            <Chip label="Microsoft" detail="Natural" selected={settings.voiceEngine === 'microsoft'} onPress={() => set({ voiceEngine: 'microsoft' })} />
            <Chip label="iPhone" detail="Offline" selected={settings.voiceEngine === 'device'} onPress={() => set({ voiceEngine: 'device' })} />
          </View>
          <View style={styles.chips}>
            {RATES.map((r) => (
              <Chip key={r.value} label={r.label} selected={settings.speechRate === r.value} onPress={() => set({ speechRate: r.value })} />
            ))}
          </View>
          <View style={styles.chips}>
            <Button title="Hear a woman" icon="speaker.wave.2.fill" variant="ghost" size="small" onPress={() => void sample('female')} />
            <Button title="Hear a man" icon="speaker.wave.2.fill" variant="ghost" size="small" onPress={() => void sample('male')} />
          </View>
          {settings.voiceEngine === 'device' && voiceCount !== null && voiceCount < 3 ? (
            <Text variant="caption">
              Tip: for better iPhone voices, download Enhanced or Premium voices in iOS Settings › Accessibility › Spoken Content › Voices.
            </Text>
          ) : null}
        </Section>

        <Section title="When I've finished my line" subtitle="How long a silence means you're done speaking in Run Lines.">
          <View style={styles.chips}>
            {PAUSES.map((p) => (
              <Chip key={p.value} label={p.label} detail={p.detail} selected={settings.pauseLength === p.value} onPress={() => set({ pauseLength: p.value })} />
            ))}
          </View>
        </Section>

        <Section
          title="After a mistake"
          subtitle="Stop so you can see what you said, then Try again or Keep going. Choose Keep going for hands-free practice with the screen off.">
          <View style={styles.chips}>
            {MISTAKE_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                detail={o.detail}
                selected={settings.pauseOnMistake === o.value}
                onPress={() => set({ pauseOnMistake: o.value })}
              />
            ))}
          </View>
        </Section>

        <Section title="Run Lines">
          <ToggleRow label="Read the line to me after a miss" value={settings.promptOnMiss} onChange={(v) => set({ promptOnMiss: v })} />
          <ToggleRow label="Play a tick when it's my turn" value={settings.cueSound} onChange={(v) => set({ cueSound: v })} />
        </Section>

        <Section title="Listen">
          <ToggleRow
            label="Read my lines aloud too"
            detail="Off leaves a pause so you can say them."
            value={settings.listenReadsMyLines}
            onChange={(v) => set({ listenReadsMyLines: v })}
          />
        </Section>

        <Section title="AI usage" subtitle="Every AI call is logged with its cost. Last 30 days.">
          {usage ? (
            <View style={styles.usageRow}>
              <Usage label="Calls" value={String(usage.calls)} />
              <Usage label="30-day cost" value={`$${usage.costUsd.toFixed(usage.costUsd < 1 ? 4 : 2)}`} />
              <Usage label="Today" value={`$${usage.todayCostUsd.toFixed(usage.todayCostUsd < 1 ? 4 : 2)}`} />
            </View>
          ) : (
            <Text variant="caption">{usageError ?? 'Loading…'}</Text>
          )}
        </Section>

        <Text variant="caption" style={styles.footer}>
          Places, Please · Recordings of your lines are sent for checking and deleted from your phone right away; they are never stored.
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline">{title}</Text>
      {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <Text variant="body">{label}</Text>
        {detail ? <Text variant="caption">{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.primary }} accessibilityLabel={label} />
    </View>
  );
}

function Usage({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.usage}>
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.five },
  section: { gap: Spacing.two },
  card: { gap: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  left: { alignSelf: 'flex-start' },
  usageRow: { flexDirection: 'row', gap: Spacing.three },
  usage: { flex: 1, gap: 2 },
  footer: { textAlign: 'center', marginTop: Spacing.four },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: 0, borderWidth: 0 },
});
