import { useEffect, useState } from 'react';

import { getAiUsageSummary } from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import type { AiUsageSummary } from '@/lib/types';

/** Loads the last 30 days of AI usage and cost once. */
export function useAiUsage() {
  const [usage, setUsage] = useState<AiUsageSummary | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  useEffect(() => {
    getAiUsageSummary()
      .then(setUsage)
      .catch((err) => setUsageError(toUserMessage(err)));
  }, []);
  return { usage, usageError };
}
