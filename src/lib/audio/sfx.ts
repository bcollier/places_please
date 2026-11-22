import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

export type SoundName = 'perfect' | 'close' | 'miss' | 'cue';

const SOURCES: Record<SoundName, number> = {
  perfect: require('@/assets/sounds/perfect.wav'),
  close: require('@/assets/sounds/close.wav'),
  miss: require('@/assets/sounds/miss.wav'),
  cue: require('@/assets/sounds/cue.wav'),
};

const MAX_WAIT_MS: Record<SoundName, number> = { perfect: 1400, close: 1000, miss: 1100, cue: 400 };

const players = new Map<SoundName, AudioPlayer>();

function getPlayer(name: SoundName): AudioPlayer {
  let p = players.get(name);
  if (!p) {
    p = createAudioPlayer(SOURCES[name], { keepAudioSessionActive: true });
    players.set(name, p);
  }
  return p;
}

/** Loads the sound effects ahead of time so the first "ding" isn't delayed. */
export function preloadSounds() {
  try {
    (Object.keys(SOURCES) as SoundName[]).forEach(getPlayer);
  } catch (err) {
    console.warn('[sfx] preload failed', err);
  }
}

/**
 * Plays a sound and resolves when it finishes. Never rejects: a sound effect failing must not
 * interrupt a rehearsal.
 */
export async function playSound(name: SoundName): Promise<void> {
  let player: AudioPlayer;
  try {
    player = getPlayer(name);
  } catch (err) {
    console.warn('[sfx] could not create player', err);
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sub?.remove();
      resolve();
    };
    const timer = setTimeout(done, MAX_WAIT_MS[name]);
    let sub: { remove: () => void } | undefined;
    try {
      sub = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) done();
      });
      void player.seekTo(0).catch(() => {});
      player.play();
    } catch (err) {
      console.warn('[sfx] play failed', err);
      done();
    }
  });
}
