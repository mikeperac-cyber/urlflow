// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  deleteSnapshot,
  pruneOrphanSnapshots,
  readSnapshot,
  snapshotFileName,
  writeSnapshot,
} from '../../electron/snapshots';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'url-flow-snapshots-'));
});

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('snapshot file store', () => {
  it('roundTripsMarkdownWithMetadata', async () => {
    const saved = await writeSnapshot(directory, 'link_1', {
      sourceUrl: 'https://example.com/a',
      title: 'A "quoted" title',
      markdown: '# Head\n\nBody',
    });

    expect(saved.bytes).toBeGreaterThan(0);
    expect(await readSnapshot(directory, 'link_1')).toEqual({
      sourceUrl: 'https://example.com/a',
      title: 'A "quoted" title',
      savedAt: saved.savedAt,
      markdown: '# Head\n\nBody',
    });
  });

  it('refusesIdsThatCouldEscapeTheSnapshotDirectory', async () => {
    for (const id of ['../../prefs', '..\\..\\x', 'a/b', 'a b', '', 'x'.repeat(65)]) {
      expect(snapshotFileName(id), id).toBeNull();
      expect(await readSnapshot(directory, id), id).toBeNull();
    }
  });

  it('prunesOnlyOrphanedSnapshotFiles', async () => {
    await writeSnapshot(directory, 'keep', { sourceUrl: 'https://example.com', title: 'K', markdown: 'k' });
    await writeSnapshot(directory, 'drop', { sourceUrl: 'https://example.com', title: 'D', markdown: 'd' });
    await writeFile(path.join(directory, 'notes.txt'), 'ignore me', 'utf8');

    expect(await pruneOrphanSnapshots(directory, new Set(['keep']))).toBe(1);
    expect(await readSnapshot(directory, 'drop')).toBeNull();
    await deleteSnapshot(directory, 'keep');
    expect(await readSnapshot(directory, 'keep')).toBeNull();
    expect(await readdir(path.join(directory, 'snapshots'))).toEqual([]);
    expect((await readdir(directory)).sort()).toEqual(['notes.txt', 'snapshots']);
  });

  it('returnsNullForCorruptOrOversizedFiles', async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'broken.md'), 'no front matter', 'utf8');
    expect(await readSnapshot(directory, 'broken')).toBeNull();

    await writeFile(
      path.join(directory, 'wrong-source.md'),
      '---\nsource: "file:///secret"\ntitle: "T"\ncaptured: "2026-11-15T00:00:00.000Z"\n---\ntext',
      'utf8',
    );
    expect(await readSnapshot(directory, 'wrong-source')).toBeNull();
  });
});
