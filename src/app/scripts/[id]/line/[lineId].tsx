import { useLocalSearchParams } from 'expo-router';

import { EditLineForm } from '@/components/line-editor/edit-line-form';
import { ErrorView } from '@/components/ui/state-views';
import { useLineDraft } from '@/hooks/use-line-draft';
import { goBack } from '@/lib/navigation';
import { useData } from '@/providers/data-provider';

/** Fix a line the AI misread: edit text or speaker, delete it, or insert a missing line after it. */
export default function EditLineScreen() {
  const { id, lineId } = useLocalSearchParams<{ id: string; lineId: string }>();
  const { getScript } = useData();
  const script = getScript(id);
  const line = script?.lines.find((l) => l.id === lineId);
  const draft = useLineDraft(line);

  if (!script || !line) {
    return <ErrorView message="That line no longer exists." onRetry={goBack} retryLabel="Close" />;
  }
  return <EditLineForm script={script} line={line} draft={draft} />;
}
