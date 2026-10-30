import { useMemo, useState } from 'react';
import { NotebookPen, Plus, Search } from 'lucide-react';
import { useApp } from '../app-context';
import { NoteCard } from '../components/items';
import { Button, EmptyState, Segmented } from '../components/ui';

type Filter = 'all' | 'pinned' | 'unfiled';

export function NotesView() {
  const { notes, search, openEditor } = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes
      .filter((note) => {
        if (filter === 'pinned' && !note.pinned) return false;
        if (filter === 'unfiled' && note.planId) return false;
        if (!query) return true;
        return [note.title, note.notes, note.tags.join(' ')].join(' ').toLowerCase().includes(query);
      })
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, filter, search]);

  return (
    <div className="stack">
      <div className="toolbar">
        <Segmented
          options={[
            { value: 'all', label: 'All', count: notes.length },
            { value: 'pinned', label: 'Pinned', count: notes.filter((note) => note.pinned).length },
            { value: 'unfiled', label: 'Unfiled', count: notes.filter((note) => !note.planId).length },
          ]}
          value={filter}
          onChange={(next) => setFilter(next)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={search.trim() ? <Search size={22} /> : <NotebookPen size={22} />}
          title={search.trim() ? 'No notes match' : filter === 'pinned' ? 'No pinned notes' : 'A blank page awaits'}
          hint={
            search.trim()
              ? 'Try another word, or clear the search.'
              : 'Capture research, meeting notes and ideas. Pin the important ones and attach the rest to a plan.'
          }
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'note' })}>
              New note
            </Button>
          }
        />
      ) : (
        <div className="card-grid card-grid--notes">
          {filtered.map((note) => (
            <NoteCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
