// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CaptureBatchAssembler, claimBatch } from '../../electron/captureBatches';

const batch = { kind: 'links' as const, entries: [{ url: 'https://example.com/a', title: 'A' }] };

function payload(): string {
  return Buffer.from(JSON.stringify(batch), 'utf8').toString('base64url');
}

function chunk(index: number, total: number, data: string) {
  return { batchId: 'abcdefgh', index, total, data };
}

describe('browser batch assembly', () => {
  it('assemblesOutOfOrderChunksOnceAndIgnoresDuplicates', () => {
    const data = payload();
    const half = Math.ceil(data.length / 2);
    const assembler = new CaptureBatchAssembler();

    expect(assembler.add(chunk(1, 2, data.slice(half)))).toBeNull();
    expect(assembler.add(chunk(1, 2, data.slice(half)))).toBeNull();
    const assembled = assembler.add(chunk(0, 2, data.slice(0, half)));
    expect(assembled?.batchId).toBe('abcdefgh');
    expect(assembled?.batch.entries).toHaveLength(1);
    expect(assembler.add(chunk(0, 2, data.slice(0, half)))).toBeNull();
  });

  it('dropsAStalledBatchAfterTheTtl', () => {
    const data = payload();
    const half = Math.ceil(data.length / 2);
    const assembler = new CaptureBatchAssembler();

    expect(assembler.add(chunk(0, 2, data.slice(0, half)), new Date(0))).toBeNull();
    expect(assembler.add(chunk(1, 2, data.slice(half)), new Date(61_000))).toBeNull();
    expect(assembler.add(chunk(0, 2, data.slice(0, half)), new Date(62_000))).toBeNull();
  });

  it('ignoresAnInconsistentChunkCount', () => {
    const data = payload();
    const assembler = new CaptureBatchAssembler();
    expect(assembler.add(chunk(0, 2, data))).toBeNull();
    expect(assembler.add(chunk(1, 3, data))).toBeNull();
  });

  it('doesNotApplyTheSameBatchTwiceInsideTheWindow', () => {
    const applied = new Map<string, number>();
    expect(claimBatch(applied, 'batch-1', 1000)).toBe(true);
    expect(claimBatch(applied, 'batch-1', 2000)).toBe(false);
    expect(claimBatch(applied, 'batch-1', 1000 + 600_001)).toBe(true);
    expect(claimBatch(applied, undefined, 3000)).toBe(true);
  });
});
