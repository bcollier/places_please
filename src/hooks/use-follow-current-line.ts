import { useEffect, useRef } from 'react';
import type { FlatList } from 'react-native';

import type { ScriptLine } from '@/lib/types';

const VIEW_POSITION = 0.3;

/** Keeps the line being read scrolled into view. Pass `listRef` and `onScrollToIndexFailed` to the FlatList. */
export function useFollowCurrentLine(index: number, lineCount: number) {
  const listRef = useRef<FlatList<ScriptLine>>(null);

  useEffect(() => {
    if (lineCount > 0) {
      listRef.current?.scrollToIndex({ index: Math.min(index, lineCount - 1), viewPosition: VIEW_POSITION, animated: true });
    }
  }, [index, lineCount]);

  // The row may not be measured yet; try again once it has rendered.
  const onScrollToIndexFailed = ({ index: failedIndex }: { index: number }) => {
    setTimeout(() => listRef.current?.scrollToIndex({ index: failedIndex, viewPosition: VIEW_POSITION, animated: false }), 100);
  };

  return { listRef, onScrollToIndexFailed };
}
