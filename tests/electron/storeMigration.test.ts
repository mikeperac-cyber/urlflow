// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../../electron/store';

let directory = '';

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = '';
});

describe('store migration', () => {
  it('rewritesAVersionOneFileAsVersionTwoWithoutHistory', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'url-flow-store-'));
    const file = path.join(directory, 'url-flow-data.json');
    await writeFile(
      file,
      JSON.stringify({ version: 1, items: [], reminders: [], ignoredMatches: [] }),
      'utf8',
    );

    const store = new Store(directory);

    expect(store.get().version).toBe(2);
    expect(store.status()).toEqual({ canUndo: false, canRedo: false });
    const persisted = JSON.parse(await readFile(file, 'utf8'));
    expect(persisted.version).toBe(2);
    expect(persisted.tagRules).toEqual([]);
    expect(persisted.planTemplates).toEqual([]);
  });
});
