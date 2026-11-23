import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/state-views';
import { Spacing } from '@/constants/theme';

/** Shown on the home screen before any script has been added. */
export function EmptyStageCard() {
  return (
    <Card>
      <EmptyState
        icon="theatermasks.fill"
        title="Your stage is empty"
        message="Photograph your script pages or upload a PDF or Word file. We'll find every character and line.">
        <Button title="Add your first script" icon="plus" onPress={() => router.push('/scripts/new')} style={styles.emptyButton} />
      </EmptyState>
    </Card>
  );
}

const styles = StyleSheet.create({
  emptyButton: { alignSelf: 'stretch', marginTop: Spacing.four },
});
