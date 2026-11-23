import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChooseSourceStepProps = {
  onCamera: () => void;
  onLibrary: () => void;
  onDocument: () => void;
  /** Shown as "Try that file again" after a file failed to import. */
  onRetryFile?: () => void;
};

export function ChooseSourceStep({ onCamera, onLibrary, onDocument, onRetryFile }: ChooseSourceStepProps) {
  return (
    <>
      <Text variant="body" color="textSecondary">
        Add your script and we’ll pick out every character and line. Photos work best flat, well lit, one page at a time.
      </Text>
      <SourceOption
        icon="camera.fill"
        title="Photograph pages"
        description="Snap each page with the camera"
        onPress={onCamera}
      />
      <SourceOption
        icon="photo.on.rectangle"
        title="Choose photos"
        description="Pick page photos from your library, in order"
        onPress={onLibrary}
      />
      <SourceOption
        icon="doc.text"
        title="Upload PDF or Word"
        description="A .pdf or .docx file from Files"
        onPress={onDocument}
      />
      {onRetryFile ? <Button title="Try that file again" variant="secondary" onPress={onRetryFile} /> : null}
    </>
  );
}

function SourceOption({
  icon,
  title,
  description,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  description: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${description}`} style={styles.option}>
      <View style={[styles.optionIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={22} color={theme.primary} />
      </View>
      <View style={styles.flex}>
        <Text variant="heading">{title}</Text>
        <Text variant="callout" color="textSecondary">
          {description}
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color={theme.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  optionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
