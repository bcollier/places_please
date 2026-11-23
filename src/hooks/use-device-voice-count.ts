import { useEffect, useState } from 'react';

import { getVoices } from '@/lib/audio/tts';

/** How many on-device voices are installed; `null` until known, 0 if they can't be listed. */
export function useDeviceVoiceCount() {
  const [voiceCount, setVoiceCount] = useState<number | null>(null);
  useEffect(() => {
    getVoices()
      .then((v) => setVoiceCount(v.length))
      .catch(() => setVoiceCount(0));
  }, []);
  return voiceCount;
}
