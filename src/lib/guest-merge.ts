import { importGuestData, type GuestSnapshot } from '@/lib/api';
import { clearPendingMerge, loadPendingMerge, savePendingMerge, type PendingMerge } from '@/lib/local-store';

/**
 * Copying a guest's scripts into the account they just signed in to.
 *
 * The guest's data is saved on the device as a "pending merge" BEFORE copying starts, and progress
 * is saved after every script, so if copying fails (network drop, app closed) nothing is lost: the
 * copy resumes the next time the app loads that account, without duplicating what already copied.
 */

const inFlight = new Set<string>();

async function run(userId: string, pending: PendingMerge): Promise<number> {
  let current = pending;
  const copied = await importGuestData(current.snapshot, current.progress, async (progress) => {
    current = { ...current, progress };
    try {
      await savePendingMerge(userId, current);
    } catch (err) {
      console.warn('[merge] could not save progress', err);
    }
  });
  await clearPendingMerge(userId);
  return copied;
}

/** Starts copying a guest snapshot into `userId`'s account. Throws if it doesn't finish. */
export async function startGuestMerge(userId: string, snapshot: GuestSnapshot): Promise<number> {
  if (snapshot.scripts.length === 0 && snapshot.history.length === 0) return 0;
  inFlight.add(userId);
  try {
    const pending: PendingMerge = {
      snapshot,
      progress: { scriptIds: {}, historyChunksDone: 0 },
      createdAt: new Date().toISOString(),
    };
    await savePendingMerge(userId, pending);
    return await run(userId, pending);
  } finally {
    inFlight.delete(userId);
  }
}

/** Finishes an interrupted copy for this account, if there is one. Returns scripts copied, or null. */
export async function resumeGuestMerge(userId: string): Promise<number | null> {
  if (inFlight.has(userId)) return null;
  const pending = await loadPendingMerge(userId);
  if (!pending) return null;
  inFlight.add(userId);
  try {
    return await run(userId, pending);
  } catch (err) {
    console.warn('[merge] resume failed; will try again next time', err);
    return null;
  } finally {
    inFlight.delete(userId);
  }
}
