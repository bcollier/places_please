import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PageImage } from '@/lib/script-import';

type PagesStepProps = {
  pages: PageImage[];
  onRemovePage: (index: number) => void;
  onCamera: () => void;
  onLibrary: () => void;
  onRead: () => void;
};

function pageCountLabel(count: number): string {
  return `${count} page${count === 1 ? '' : 's'}`;
}

/** The photographed pages so far, with buttons to add more and to start reading them. */
export function PagesStep({ pages, onRemovePage, onCamera, onLibrary, onRead }: PagesStepProps) {
  return (
    <>
      <Text variant="overline">{pageCountLabel(pages.length)}</Text>
      <View style={styles.grid}>
        {pages.map((p, i) => (
          <PageThumbnail key={`${p.uri}-${i}`} page={p} pageNumber={i + 1} onRemove={() => onRemovePage(i)} />
        ))}
      </View>
      <View style={styles.row}>
        <Button title="Camera" icon="camera.fill" variant="secondary" size="medium" onPress={onCamera} style={styles.flex} />
        <Button title="Library" icon="photo.on.rectangle" variant="secondary" size="medium" onPress={onLibrary} style={styles.flex} />
      </View>
      <Button
        title={`Read ${pageCountLabel(pages.length)}`}
        icon="sparkles"
        disabled={pages.length === 0}
        onPress={onRead}
      />
    </>
  );
}

function PageThumbnail({ page, pageNumber, onRemove }: { page: PageImage; pageNumber: number; onRemove: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.thumbWrap, { borderColor: theme.border }]}>
      <Image source={{ uri: page.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={`Page ${pageNumber}`} />
      <View style={[styles.pageNum, { backgroundColor: theme.background }]}>
        <Text variant="caption" style={{ fontWeight: '700' }}>
          {pageNumber}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove page ${pageNumber}`}
        hitSlop={8}
        onPress={onRemove}
        style={[styles.remove, { backgroundColor: theme.text }]}>
        <Icon name="xmark" size={10} color={theme.background} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.three },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  thumbWrap: { width: 96, height: 128, borderRadius: Radius.small, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: '100%', height: '100%' },
  pageNum: { position: 'absolute', left: 4, bottom: 4, borderRadius: 8, paddingHorizontal: 6 },
  remove: { position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
