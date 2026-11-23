import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChooseSourceStep } from '@/components/import/choose-source-step';
import { ImportErrorCard } from '@/components/import/import-error-card';
import { PagesStep } from '@/components/import/pages-step';
import { ProcessingStep } from '@/components/import/processing-step';
import { ReviewStep } from '@/components/import/review-step';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useScriptImport } from '@/hooks/use-script-import';
import { useTheme } from '@/hooks/use-theme';
import { goBack } from '@/lib/navigation';

export default function NewScriptScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const flow = useScriptImport();
  const { stage, doc, error } = flow;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Button title="Cancel" variant="ghost" size="small" onPress={goBack} disabled={flow.saving} />
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.seven }]}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.inner}>
          {error ? <ImportErrorCard message={error} needsSignIn={flow.needsSignIn} /> : null}

          {stage.kind === 'choose' ? (
            <ChooseSourceStep
              onCamera={flow.addFromCamera}
              onLibrary={flow.addFromLibrary}
              onDocument={flow.pickDoc}
              onRetryFile={doc && error ? () => flow.readDocAgain(doc) : undefined}
            />
          ) : null}

          {stage.kind === 'pages' ? (
            <PagesStep
              pages={flow.pages}
              onRemovePage={flow.removePage}
              onCamera={flow.addFromCamera}
              onLibrary={flow.addFromLibrary}
              onRead={flow.readPages}
            />
          ) : null}

          {stage.kind === 'processing' ? (
            <ProcessingStep progress={stage.progress} onCancel={flow.cancelProcessing} />
          ) : null}

          {stage.kind === 'review' ? (
            <ReviewStep
              result={stage.result}
              title={flow.title}
              setTitle={flow.setTitle}
              character={flow.character}
              setCharacter={flow.setCharacter}
              saving={flow.saving}
              onSave={() => flow.saveScript(stage.result)}
              onStartOver={flow.startOver}
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
});
