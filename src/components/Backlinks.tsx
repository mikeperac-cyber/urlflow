import { useMemo } from 'react';
import { backlinksFor } from '../../shared/wikiLinks';
import { useApp } from '../app-context';
import { useWikiItems } from './WikiText';

export function Backlinks({ itemId }: { itemId: string }) {
  const { navigate, openEditor } = useApp();
  const items = useWikiItems();
  const refs = useMemo(() => backlinksFor(itemId, items), [itemId, items]);
  if (refs.length === 0) return null;

  return (
    <section className="backlinks" aria-label="Referenced by">
      <h4>Referenced by</h4>
      <div className="backlinks__list">
        {refs.map((ref) => {
          const item = items.find((entry) => entry.id === ref.id);
          if (!item) return null;
          return (
            <button
              key={ref.id}
              type="button"
              className="wiki-link"
              onClick={(event) => {
                event.stopPropagation();
                if (item.kind === 'plan') navigate('plan', item.id);
                else openEditor({ kind: item.kind, item });
              }}
            >
              {ref.title}
            </button>
          );
        })}
      </div>
    </section>
  );
}
