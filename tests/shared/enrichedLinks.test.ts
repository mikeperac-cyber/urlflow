import { describe, expect, it } from 'vitest';
import { createItem, mergeItems, normalizeState, updateItem } from '../../shared/core';
import { emptyState, type LinkItem } from '../../shared/types';

const enrichment = { description: 'Page description', siteName: 'Example', faviconKey: 'a'.repeat(64) };
describe('enriched links', () => {
  it('mergeKeepsEnrichmentWhenPrimaryLacksIt', () => {
    const primary = createItem(emptyState(), { kind: 'link', title: 'Primary', url: 'https://example.com' });
    const other = createItem(primary.state, { kind: 'link', title: 'Other', url: 'https://example.com', ...enrichment });
    const merged = mergeItems(other.state, primary.id, other.id);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]).toMatchObject(enrichment);
  });

  it('preservesEnrichmentThroughCreateNormalizeAndUpdate', () => {
    const created = createItem(emptyState(), { kind: 'link', title: 'Page', url: 'https://example.com', ...enrichment });
    expect(created.state.items[0]).toMatchObject(enrichment);
    const normalized = normalizeState(JSON.parse(JSON.stringify(created.state)));
    expect(normalized.items[0]).toMatchObject(enrichment);
    expect(updateItem(normalized, created.id, { description: 'New description', siteName: null, faviconKey: null }).items[0])
      .toMatchObject({ description: 'New description', siteName: null, faviconKey: null });
  });

  it('keepsAbsentLegacyMetadataAbsent', () => {
    const created = createItem(emptyState(), { kind: 'link', title: 'Old', url: 'https://example.com' });
    for (const link of [created.state.items[0], normalizeState(created.state).items[0]]) {
      for (const field of ['description', 'siteName', 'faviconKey']) expect(link).not.toHaveProperty(field);
    }
  });

  it('capsMetadataAndRejectsInvalidKeysAcrossPersistencePaths', () => {
    const invalid = { description: ' d'.repeat(600), siteName: ' s'.repeat(200), faviconKey: '../escape' };
    const created = createItem(emptyState(), { kind: 'link', title: 'Page', url: 'https://example.com', ...invalid });
    const raw = { ...created.state, items: [{ ...created.state.items[0], ...invalid }] };
    for (const link of [created.state.items[0], normalizeState(raw).items[0], updateItem(created.state, created.id, invalid).items[0]] as LinkItem[]) {
      expect(link.description).toHaveLength(500);
      expect(link.siteName).toHaveLength(120);
      expect(link.faviconKey).toBeNull();
    }
  });

  it('keepsExistingPrimaryMetadataAndFallsBackIndependently', () => {
    const primary = createItem(emptyState(), { kind: 'link', title: 'Primary', url: 'https://example.com', description: 'Keep', siteName: null });
    const other = createItem(primary.state, { kind: 'link', title: 'Other', url: 'https://example.com', ...enrichment });
    expect(mergeItems(other.state, primary.id, other.id).items[0]).toMatchObject({ ...enrichment, description: 'Keep' });
  });
});
