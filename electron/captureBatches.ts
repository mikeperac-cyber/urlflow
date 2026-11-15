import { decodeBatchPayload } from '../shared/batch';
import type { BatchCaptureRequest } from '../shared/types';
import type { BatchChunk } from './deepLink';

const BATCH_TTL_MS = 60_000;
const MAX_CHUNKS = 60;
const DUPLICATE_WINDOW_MS = 10 * 60_000;

interface PendingBatch {
  chunks: Map<number, string>;
  total: number;
  updatedAt: number;
}

/** Collects chunked extension requests until each batch is complete or expires. */
export class CaptureBatchAssembler {
  private pending = new Map<string, PendingBatch>();
  private expired = new Map<string, number>();

  add(chunk: BatchChunk, now: Date = new Date()): { batchId: string; batch: BatchCaptureRequest } | null {
    const time = now.getTime();
    this.purge(time);
    // A chunk arriving after its batch expired must not mix with a newer upload.
    if (this.expired.has(chunk.batchId)) return null;
    if (chunk.total > MAX_CHUNKS || chunk.index >= chunk.total) return null;

    const current = this.pending.get(chunk.batchId)
      ?? { chunks: new Map<number, string>(), total: chunk.total, updatedAt: time };
    if (current.total !== chunk.total) {
      this.pending.delete(chunk.batchId);
      return null;
    }

    // A re-delivered protocol URL must not corrupt a partially assembled batch.
    if (!current.chunks.has(chunk.index)) current.chunks.set(chunk.index, chunk.data);
    current.updatedAt = time;
    this.pending.set(chunk.batchId, current);

    if (current.chunks.size !== current.total) return null;
    this.pending.delete(chunk.batchId);

    let combined = '';
    for (let index = 0; index < current.total; index += 1) {
      combined += current.chunks.get(index) ?? '';
    }
    const batch = decodeBatchPayload(combined);
    return batch ? { batchId: chunk.batchId, batch } : null;
  }

  private purge(now: number): void {
    for (const [batchId, entry] of this.pending) {
      if (now - entry.updatedAt > BATCH_TTL_MS) {
        this.pending.delete(batchId);
        this.expired.set(batchId, now);
      }
    }
    for (const [batchId, expiredAt] of this.expired) {
      if (now - expiredAt > BATCH_TTL_MS) this.expired.delete(batchId);
    }
  }
}

/**
 * Records a batch id and reports whether it should be applied. Empty ids always
 * apply, and a repeated id inside the window is treated as a retry, not a new batch.
 */
export function claimBatch(
  applied: Map<string, number>,
  batchId: string | undefined,
  now: number,
  windowMs = DUPLICATE_WINDOW_MS,
): boolean {
  const id = typeof batchId === 'string' ? batchId : '';
  if (!id) return true;
  const previous = applied.get(id);
  if (previous !== undefined && now - previous < windowMs) return false;
  applied.set(id, now);
  return true;
}
