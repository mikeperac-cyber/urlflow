import { useMemo, useState } from 'react';
import { Archive, Search } from 'lucide-react';
import type { ItemKind } from '../../shared/types';
import { useApp } from '../app-context';
import { ArchivedRow } from '../components/items';
import { EmptyState, Segmented } from '../components/ui';

type Filter = 'all' | ItemKind;

export function ArchiveView() {
  const { archivedItems, search } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const counts = useMemo(
    () => ({
      all: archivedItems.length,
      link: archivedItems.filter((item) => item.kind === 'link').length,
      plan: archivedItems.filter((item) => item.kind === 'plan').length,
      task: archivedItems.filter((item) => item.kind === 'task').length,
      note: archivedItems.filter((item) => item.kind === 'note').length,
    }),
    [archivedItems],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return archivedItems
      .filter((item) => {
        if (filter !== 'all' && item.kind !== filter) return false;
        if (!query) return true;
        return [item.title, item.notes, item.kind === 'link' ? item.url : '']
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''));
  }, [archivedItems, filter, search]);

  return (
    <div className="stack">
      <div className="toolbar">
        <Segmented
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'link', label: 'Links', count: counts.link },
            { value: 'plan', label: 'Plans', count: counts.plan },
            { value: 'task', label: 'Tasks', count: counts.task },
            { value: 'note', label: 'Notes', count: counts.note },
          ]}
          value={filter}
          onChange={(next) => setFilter(next)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={search.trim() ? <Search size={22} /> : <Archive size={22} />}
          title={search.trim() ? 'No archived items match' : 'Nothing archived'}
          hint="Archiving keeps an item out of the way without deleting it. Everything you archive appears here, ready to restore."
        />
      ) : (
        <section className="panel">
          <div className="panel__body panel__body--flush">
            {filtered.map((item) => (
              <ArchivedRow key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
