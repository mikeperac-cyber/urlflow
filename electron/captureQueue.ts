import { randomUUID } from 'node:crypto';
import type { CapturePayload } from '../shared/types';

/** Holds captures across window startup/reload until a renderer subscribes. */
export class CaptureQueue {
  private pending: CapturePayload[] = [];
  private deliver: ((payload: CapturePayload) => void) | null = null;
  private flushing = false;

  enqueue(payload: CapturePayload): void {
    this.pending.push({ ...payload, mode: payload.mode ?? 'clipboard', requestId: randomUUID() });
    this.flush();
  }

  setDelivery(deliver: ((payload: CapturePayload) => void) | null): void {
    this.deliver = deliver;
    this.flush();
  }

  private flush(): void {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.deliver && this.pending.length > 0) {
        this.deliver(this.pending[0]);
        this.pending.shift();
      }
    } finally {
      this.flushing = false;
    }
  }
}
