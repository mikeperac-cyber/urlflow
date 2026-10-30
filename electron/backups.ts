import fs from 'node:fs';
import path from 'node:path';
import { normalizeState } from '../shared/core';
import type { AppState, BackupInfo } from '../shared/types';

const KEEP = 7;
const NAME = /^url-flow-\d{4}-\d{2}-\d{2}\.json$/;

export function backupDirectory(userData: string): string {
  return path.join(userData, 'backups');
}

function fileFor(userData: string, date: Date): string {
  const stamp = date.toISOString().slice(0, 10);
  return path.join(backupDirectory(userData), `url-flow-${stamp}.json`);
}

function describe(file: string): BackupInfo | null {
  try {
    const stats = fs.statSync(file);
    const parsed = normalizeState(JSON.parse(fs.readFileSync(file, 'utf8')));
    return {
      file: path.basename(file),
      createdAt: stats.mtime.toISOString(),
      items: parsed.items.length,
      bytes: stats.size,
    };
  } catch {
    return null;
  }
}

function prune(userData: string): void {
  try {
    const dir = backupDirectory(userData);
    const files = fs
      .readdirSync(dir)
      .filter((name) => NAME.test(name))
      .sort()
      .reverse();
    for (const name of files.slice(KEEP)) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  } catch {
    /* best effort */
  }
}

export function createBackup(userData: string, state: AppState, date: Date = new Date()): BackupInfo | null {
  try {
    const dir = backupDirectory(userData);
    fs.mkdirSync(dir, { recursive: true });
    const file = fileFor(userData, date);
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
    prune(userData);
    return describe(file);
  } catch (error) {
    console.error('[backup] Could not write a backup:', error);
    return null;
  }
}

/** Writes at most one snapshot per calendar day. */
export function ensureDailyBackup(userData: string, state: AppState): BackupInfo | null {
  const file = fileFor(userData, new Date());
  if (fs.existsSync(file)) return null;
  if (state.items.length === 0 && state.reminders.length === 0) return null;
  return createBackup(userData, state);
}

export function listBackups(userData: string): BackupInfo[] {
  try {
    const dir = backupDirectory(userData);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => NAME.test(name))
      .sort()
      .reverse()
      .map((name) => describe(path.join(dir, name)))
      .filter((entry): entry is BackupInfo => Boolean(entry));
  } catch {
    return [];
  }
}

export function readBackup(userData: string, file: string): AppState {
  const name = path.basename(String(file ?? ''));
  if (!NAME.test(name)) throw new Error('That backup could not be found.');
  const full = path.join(backupDirectory(userData), name);
  if (!fs.existsSync(full)) throw new Error('That backup could not be found.');
  return normalizeState(JSON.parse(fs.readFileSync(full, 'utf8')));
}
