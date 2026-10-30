import fs from 'node:fs';
import path from 'node:path';
import { emptyState, type AppState, type HistoryStatus } from '../shared/types';
import { normalizeState } from '../shared/core';

interface HistorySnapshot {
  state: AppState;
  label: string;
}

const HISTORY_LIMIT = 40;

export interface HistoryResult {
  state: AppState;
  label: string;
}

export class Store {
  readonly filePath: string;
  private state: AppState;
  private past: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];

  constructor(directory: string) {
    fs.mkdirSync(directory, { recursive: true });
    this.filePath = path.join(directory, 'url-flow-data.json');
    this.state = this.read();
  }

  private read(): AppState {
    try {
      if (!fs.existsSync(this.filePath)) return emptyState();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      if (!raw.trim()) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.error('[store] Could not read data file, starting fresh:', error);
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${stamp}.bak`);
      } catch {
        /* best effort */
      }
      return emptyState();
    }
  }

  get(): AppState {
    return this.state;
  }

  /** Writes a state without touching undo history (used by undo/redo themselves). */
  set(next: AppState): AppState {
    this.state = next;
    this.persist();
    return this.state;
  }

  /** Applies a user change and records the state it replaced. */
  commit(next: AppState, label = 'Change'): AppState {
    if (next === this.state) return this.state;
    if (JSON.stringify(next) === JSON.stringify(this.state)) return this.state;
    this.past.push({ state: this.state, label });
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    return this.set(next);
  }

  undo(): HistoryResult | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push({ state: this.state, label: entry.label });
    this.set(entry.state);
    return { state: entry.state, label: entry.label };
  }

  redo(): HistoryResult | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push({ state: this.state, label: entry.label });
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.set(entry.state);
    return { state: entry.state, label: entry.label };
  }

  status(): HistoryStatus {
    return { canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
  }

  private persist(): void {
    const payload = JSON.stringify(this.state, null, 2);
    const temp = `${this.filePath}.tmp`;
    try {
      fs.writeFileSync(temp, payload, 'utf8');
      try {
        // Atomic swap: a crash mid-write can never truncate the existing data file.
        fs.renameSync(temp, this.filePath);
      } catch (renameError) {
        // Windows refuses the replace-rename while a virus scanner or the indexer still has
        // the freshly written file open (EPERM/EACCES). Writing in place needs no delete
        // access, so fall back to it rather than losing the user's change.
        console.warn('[store] Atomic replace unavailable, writing in place:', renameError);
        fs.writeFileSync(this.filePath, payload, 'utf8');
      }
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* best effort */
      }
    } catch (error) {
      console.error('[store] Failed to persist data:', error);
      try {
        fs.rmSync(temp, { force: true });
      } catch {
        /* best effort */
      }
      throw new Error('Could not save to disk. Check that the data folder is writable.');
    }
  }
}
