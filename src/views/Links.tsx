import { useMemo, useState } from 'react';
import { ClipboardPaste, Link2, Plus, Search } from 'lucide-react';
import { extractUrl } from '../../shared/url';
import { isReadingState } from '../../shared/core';
import type { ReadingState } from '../../shared/types';
import { useApp } from '../app-context';
import { LinkCard } from '../components/items';
import { Button, EmptyState, Segmented, TagPill } from '../components/ui';

type Filter = 'all' | 'favorites' | 'unfiled';
type Sort = 'newest' | 'title' | 'opened';

export function LinksView() {
  const { links, search, openEditor, api, pushToast } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [readingState, setReadingState] = useState<ReadingState | 'all'>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [tag, setTag] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of links) {
      for (const entry of link.tags) counts.set(entry, (counts.get(entry) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [links]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return links
      .filter((link) => {
        if (readingState !== 'all' && link.readingState !== readingState) return false;
        if (filter === 'favorites' && !link.favorite) return false;
        if (filter === 'unfiled' && link.planId) return false;
        if (tag && !link.tags.includes(tag)) return false;
        if (!query) return true;
        return [link.title, link.url, link.notes, ...link.tags]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (sort === 'title') return a.title.localeCompare(b.title);
        if (sort === 'opened') return (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? '');
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [links, filter, readingState, tag, search, sort]);

  const favorites = links.filter((link) => link.favorite).length;

  async function pasteFromClipboard() {
    setPasting(true);
    try {
      const text = await api.readClipboard();
      const url = extractUrl(text);
      if (!url) {
        pushToast('Your clipboard does not contain a link.', 'error');
        return;
      }
      const metadata = await api.fetchMetadata(url).catch(() => null);
      openEditor({ kind: 'link', preset: { url, title: metadata?.title ?? '' }, metadata });
    } catch {
      pushToast('Could not read the clipboard.', 'error');
    } finally {
      setPasting(false);
    }
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <Segmented
          options={[
            { value: 'all', label: 'All', count: links.length },
            { value: 'favorites', label: 'Favourites', count: favorites },
            { value: 'unfiled', label: 'Unfiled', count: links.filter((link) => !link.planId).length },
          ]}
          value={filter}
          onChange={(next) => setFilter(next)}
        />
        <div className="toolbar__right">
          <label className="reading-filter">
            Reading state
            <select
              aria-label="Filter by reading state"
              className="input input--select"
              value={readingState}
              onChange={(event) => {
                const next = event.target.value;
                if (next === 'all' || isReadingState(next)) setReadingState(next);
              }}
            >
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="later">Later</option>
              <option value="read">Read</option>
            </select>
          </label>
          <Button
            variant="subtle"
            icon={<ClipboardPaste size={14} />}
            onClick={() => void pasteFromClipboard()}
            disabled={pasting}
          >
            {pasting ? 'Reading clipboard…' : 'Paste from clipboard'}
          </Button>
          <select aria-label="Sort links" className="input input--select" value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
            <option value="newest">Newest first</option>
            <option value="title">Title A–Z</option>
            <option value="opened">Recently opened</option>
          </select>
        </div>
      </div>

      {allTags.length > 0 ? (
        <div className="tag-filter">
          <TagPill active={tag === null} onClick={() => setTag(null)}>
            All tags
          </TagPill>
          {allTags.map(([entry, count]) => (
            <TagPill key={entry} active={tag === entry} onClick={() => setTag(tag === entry ? null : entry)}>
              #{entry} <span className="tag__count">{count}</span>
            </TagPill>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        search.trim() || tag || filter !== 'all' || readingState !== 'all' ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No links match"
            hint="Try a different search, tag or filter."
            action={
              <Button
                size="sm"
                variant="subtle"
                onClick={() => {
                  setFilter('all');
                  setReadingState('all');
                  setTag(null);
                }}
              >
                Reset filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Link2 size={22} />}
            title="Your link library is empty"
            hint="Save the articles, tools and pages you want to come back to. URL Flow adds the title for you."
            action={
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'link' })}>
                Save a link
              </Button>
            }
          />
        )
      ) : (
        <div className="card-grid">
          {filtered.map((link) => (
            <LinkCard key={link.id} link={link} />
          ))}
        </div>
      )}

      {filtered.length > 0 ? (
        <p className="list-footnote">
          Showing {filtered.length} of {links.length} saved links
          {tag ? ` tagged #${tag}` : ''}.
        </p>
      ) : null}
    </div>
  );
}
