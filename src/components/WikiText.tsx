import { useMemo } from 'react';
import type { AnyItem } from '../../shared/types';
import { tokenizeWikiLinks } from '../../shared/wikiLinks';
import { useApp } from '../app-context';

/** All active and archived items, so old references keep resolving. */
export function useWikiItems(): AnyItem[] {
  const { links, plans, tasks, notes, archivedItems } = useApp();
  return useMemo(
    () => [...(links ?? []), ...(plans ?? []), ...(tasks ?? []), ...(notes ?? []), ...(archivedItems ?? [])],
    [links, plans, tasks, notes, archivedItems],
  );
}

export function WikiText({ text }: { text: string }) {
  const { navigate, openEditor } = useApp();
  const items = useWikiItems();
  const segments = useMemo(() => tokenizeWikiLinks(text, items), [text, items]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'text') return <span key={index}>{segment.text}</span>;
        const item = byId.get(segment.id);
        if (!segment.resolved || !item) {
          return (
            <span
              key={index}
              className="wiki-link wiki-link--missing"
              title="This item no longer exists"
            >
              {segment.label}
            </span>
          );
        }
        return (
          <button
            key={index}
            type="button"
            className="wiki-link"
            onClick={(event) => {
              event.stopPropagation();
              if (item.kind === 'plan') navigate('plan', item.id);
              else openEditor({ kind: item.kind, item });
            }}
          >
            {segment.label}
          </button>
        );
      })}
    </>
  );
}
