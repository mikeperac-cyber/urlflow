import { describe, expect, it } from 'vitest';
import { decodeBatchPayload, parseBatchRequest } from '../../shared/batch';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

describe('batch request validation', () => {
  it('rejectsOversizedAndMalformedBatches', () => {
    const tooMany = { kind: 'links', entries: Array.from({ length: 201 }, () => ({ url: 'https://example.com' })) };
    expect(parseBatchRequest(tooMany)).toBeNull();
    expect(parseBatchRequest({ kind: 'plan', entries: [{ url: 'https://example.com' }] })).toBeNull();
    expect(parseBatchRequest({ kind: 'links', entries: [] })).toBeNull();
    expect(parseBatchRequest({ kind: 'other', entries: [{ url: 'https://example.com' }] })).toBeNull();
    expect(parseBatchRequest({ kind: 'links', entries: [{ url: '   ' }] })).toBeNull();
    expect(parseBatchRequest(null)).toBeNull();
  });

  it('clampsTitlesAndKeepsSafeTagsAndBatchId', () => {
    const parsed = parseBatchRequest({
      kind: 'links',
      entries: [{ url: 'https://example.com', title: 'x'.repeat(301) }],
      tags: ['Docs', 'docs', '#reading'],
      batchId: 'abcdefgh',
    });
    expect(parsed?.entries[0].title).toHaveLength(300);
    expect(parsed?.tags).toEqual(['Docs', 'reading']);
    expect(parsed?.batchId).toBe('abcdefgh');
  });

  it('decodesAnEncodedBatch', () => {
    const batch = {
      kind: 'links',
      entries: [{ url: 'https://example.com/a', title: 'A' }],
      tags: ['tabs'],
      batchId: 'abcdefgh',
    };
    expect(decodeBatchPayload(encode(batch))).toEqual(batch);
  });

  it('rejectsCorruptOrOversizedPayloads', () => {
    expect(decodeBatchPayload('')).toBeNull();
    expect(decodeBatchPayload('not base64!')).toBeNull();
    expect(decodeBatchPayload(encode({ kind: 'links', entries: [] }))).toBeNull();
    expect(decodeBatchPayload('A'.repeat(256_001))).toBeNull();
  });
});
