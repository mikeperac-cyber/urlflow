import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SnapshotContent } from '../shared/types';

const SNAPSHOT_DIRECTORY = 'snapshots';
const MAX_FILE_BYTES = 2_000_000;
const MAX_MARKDOWN_CHARS = 400_000;
const FILE_NAME = /^([A-Za-z0-9_-]{1,64})\.md$/;
const WEB_SOURCE = /^https?:\/\//i;

/** Snapshot files are named after the link id; anything else could escape the folder. */
export function snapshotFileName(id: string): string | null {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return `${id}.md`;
}

function snapshotDirectory(root: string): string {
  return path.join(root, SNAPSHOT_DIRECTORY);
}

export interface SnapshotInput {
  sourceUrl: string;
  title: string;
  markdown: string;
}

function parseSnapshot(text: string): SnapshotContent | null {
  if (!text.startsWith('---\n')) return null;
  const frontMatterEnd = text.indexOf('\n---\n', 4);
  if (frontMatterEnd < 0) return null;

  const meta = new Map<string, string>();
  for (const line of text.slice(4, frontMatterEnd).split('\n')) {
    const separator = line.indexOf(': ');
    if (separator < 0) return null;
    const key = line.slice(0, separator);
    if (key !== 'source' && key !== 'title' && key !== 'captured') return null;
    try {
      meta.set(key, String(JSON.parse(line.slice(separator + 2))));
    } catch {
      return null;
    }
  }

  const sourceUrl = meta.get('source') ?? '';
  const title = meta.get('title') ?? '';
  const savedAt = meta.get('captured') ?? '';
  if (!WEB_SOURCE.test(sourceUrl) || Number.isNaN(new Date(savedAt).getTime())) return null;

  return {
    sourceUrl,
    title: title.slice(0, 300),
    savedAt,
    markdown: text.slice(frontMatterEnd + 5).replace(/^\n/, ''),
  };
}

/** Writes one UTF-8 Markdown snapshot atomically and returns its timestamp and size. */
export async function writeSnapshot(
  root: string,
  linkId: string,
  snapshot: SnapshotInput,
): Promise<{ savedAt: string; bytes: number }> {
  const fileName = snapshotFileName(linkId);
  if (!fileName) throw new Error('That link cannot store a snapshot.');

  const markdown = String(snapshot.markdown ?? '');
  if (!markdown.trim()) throw new Error('This page had no readable text to snapshot.');
  if (markdown.length > MAX_MARKDOWN_CHARS) throw new Error('This page is too long to snapshot.');

  const savedAt = new Date().toISOString();
  const contents = [
    '---',
    `source: ${JSON.stringify(String(snapshot.sourceUrl ?? ''))}`,
    `title: ${JSON.stringify(String(snapshot.title ?? '').slice(0, 300))}`,
    `captured: ${JSON.stringify(savedAt)}`,
    '---',
    '',
    markdown,
  ].join('\n');

  const directory = snapshotDirectory(root);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, fileName);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, target);
  return { savedAt, bytes: Buffer.byteLength(contents, 'utf8') };
}

export async function readSnapshot(root: string, linkId: string): Promise<SnapshotContent | null> {
  const fileName = snapshotFileName(linkId);
  if (!fileName) return null;
  try {
    const file = await readFile(path.join(snapshotDirectory(root), fileName));
    if (file.length > MAX_FILE_BYTES) return null;
    return parseSnapshot(file.toString('utf8'));
  } catch {
    return null;
  }
}

export async function deleteSnapshot(root: string, linkId: string): Promise<void> {
  const fileName = snapshotFileName(linkId);
  if (!fileName) return;
  try {
    await unlink(path.join(snapshotDirectory(root), fileName));
  } catch {
    // Missing files are already in the desired state.
  }
}

/** Removes snapshot files whose link was deleted, merged away or never restored. */
export async function pruneOrphanSnapshots(root: string, keepIds: Set<string>): Promise<number> {
  let entries;
  try {
    entries = await readdir(snapshotDirectory(root), { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = FILE_NAME.exec(entry.name);
    if (!match || keepIds.has(match[1])) continue;
    try {
      await unlink(path.join(snapshotDirectory(root), entry.name));
      removed += 1;
    } catch {
      // A file already gone needs no further cleanup.
    }
  }
  return removed;
}
