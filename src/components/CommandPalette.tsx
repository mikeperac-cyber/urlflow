import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  Bell,
  CheckSquare,
  ClipboardCheck,
  Download,
  GitMerge,
  HardDrive,
  LayoutDashboard,
  Link2,
  NotebookPen,
  Plus,
  Redo2,
  Search,
  Settings,
  Sparkles,
  Target,
  Undo2,
  Upload,
} from 'lucide-react';
import { ITEM_KIND_LABEL, type AnyItem, type ItemKind } from '../../shared/types';
import { useApp } from '../app-context';
import type { ViewName } from '../lib/navigation';

type Group = 'Items' | 'Go to' | 'Create' | 'Actions';

interface Result {
  id: string;
  group: Group;
  label: string;
  hint?: string;
  icon: ReactNode;
  perform: () => void;
}

const VIEW_ICONS: Record<ViewName, ReactNode> = {
  dashboard: <LayoutDashboard size={15} />,
  links: <Link2 size={15} />,
  plans: <Target size={15} />,
  plan: <Target size={15} />,
  tasks: <CheckSquare size={15} />,
  notes: <NotebookPen size={15} />,
  reminders: <Bell size={15} />,
  matches: <GitMerge size={15} />,
  review: <ClipboardCheck size={15} />,
  archive: <Archive size={15} />,
  settings: <Settings size={15} />,
};

const NAV_ORDER: ViewName[] = [
  'dashboard',
  'links',
  'plans',
  'tasks',
  'notes',
  'reminders',
  'matches',
  'review',
  'archive',
  'settings',
];

const KIND_ICONS: Record<ItemKind, ReactNode> = {
  link: <Link2 size={15} />,
  plan: <Target size={15} />,
  task: <CheckSquare size={15} />,
  note: <NotebookPen size={15} />,
};

function itemHint(item: AnyItem): string {
  if (item.kind === 'link') return `Link · ${item.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  if (item.kind === 'task') return item.done ? 'Task · completed' : 'Task · open';
  if (item.kind === 'plan') return `Plan · ${item.steps.filter((step) => step.done).length}/${item.steps.length} steps`;
  return `Note${item.notes ? ` · ${item.notes.slice(0, 60)}` : ''}`;
}

export function CommandPalette() {
  const {
    paletteOpen,
    closePalette,
    navigate,
    openEditor,
    links,
    plans,
    tasks,
    notes,
    history,
    undo,
    redo,
    api,
    pushToast,
    run,
  } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [paletteOpen]);

  const results = useMemo<Result[]>(() => {
    if (!paletteOpen) return [];
    const needle = query.trim().toLowerCase();
    const list: Result[] = [];

    const action = (id: string, label: string, icon: ReactNode, perform: () => void, hint?: string) => {
      list.push({ id, group: 'Actions', label, hint, icon, perform });
    };

    if (!needle || 'undo'.includes(needle)) {
      action('undo', 'Undo last change', <Undo2 size={15} />, () => void undo(), 'Ctrl Z');
    }
    if (!needle || 'redo'.includes(needle)) {
      action('redo', 'Redo', <Redo2 size={15} />, () => void redo(), 'Ctrl Shift Z');
    }
    if (!needle || 'export backup'.includes(needle)) {
      action(
        'export',
        'Export a backup',
        <Download size={15} />,
        () => {
          void (async () => {
            const path = await run(api.exportData());
            if (typeof path === 'string') pushToast('Backup saved', 'success');
          })();
        },
        'JSON file',
      );
    }
    if (!needle || 'import backup'.includes(needle)) {
      action('import', 'Import a backup', <Upload size={15} />, () => {
        void (async () => {
          const result = await run(api.importData());
          if (result) pushToast('Backup imported', 'success');
        })();
      });
    }
    if (!needle || 'back up now'.includes(needle)) {
      action('backup-now', 'Back up now', <HardDrive size={15} />, () => {
        void (async () => {
          const info = await run(api.backupNow());
          if (info) pushToast(`Backup saved · ${info.items} items`, 'success');
        })();
      });
    }

    for (const name of NAV_ORDER) {
      const metaName = name === 'plan' ? 'plans' : name;
      const label = name === 'review' ? 'Weekly review' : name.charAt(0).toUpperCase() + name.slice(1);
      const meta =
        name === 'review'
          ? 'Decide what to keep, archive or clean up'
          : name === 'dashboard'
            ? 'Today at a glance'
            : name === 'settings'
              ? 'Storage, backups and behaviour'
              : `${label} view`;
      if (
        !needle ||
        label.toLowerCase().includes(needle) ||
        meta.toLowerCase().includes(needle) ||
        metaName.includes(needle)
      ) {
        list.push({
          id: `nav:${name}`,
          group: 'Go to',
          label: label === 'Weekly review' ? 'Weekly review' : label,
          hint: meta,
          icon: VIEW_ICONS[name],
          perform: () => navigate(name),
        });
      }
    }

    const creators: { kind: ItemKind; label: string }[] = [
      { kind: 'link', label: 'New link' },
      { kind: 'plan', label: 'New plan' },
      { kind: 'task', label: 'New task' },
      { kind: 'note', label: 'New note' },
    ];
    for (const creator of creators) {
      if (!needle || creator.label.toLowerCase().includes(needle) || needle === creator.kind) {
        list.push({
          id: `new:${creator.kind}`,
          group: 'Create',
          label: creator.label,
          hint: ITEM_KIND_LABEL[creator.kind],
          icon: <Plus size={15} />,
          perform: () => openEditor({ kind: creator.kind }),
        });
      }
    }

    if (needle) {
      const pool: AnyItem[] = [...links, ...plans, ...tasks, ...notes];
      const scored = pool
        .map((item) => {
          const haystack = `${item.title} ${item.kind === 'link' ? item.url : ''} ${item.notes} ${item.tags.join(' ')}`.toLowerCase();
          const index = haystack.indexOf(needle);
          return { item, index };
        })
        .filter((entry) => entry.index >= 0)
        .sort((a, b) => a.index - b.index || a.item.title.length - b.item.title.length)
        .slice(0, 8);
      for (const { item } of scored) {
        list.push({
          id: `item:${item.id}`,
          group: 'Items',
          label: item.title,
          hint: itemHint(item),
          icon: KIND_ICONS[item.kind],
          perform: () => {
            if (item.kind === 'plan') navigate('plan', item.id);
            else openEditor({ kind: item.kind, item });
          },
        });
      }
    }

    const groups: Group[] = ['Items', 'Go to', 'Create', 'Actions'];
    return list.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group));
  }, [paletteOpen, query, links, plans, tasks, notes, undo, redo, api, pushToast, run, navigate, openEditor]);

  useEffect(() => {
    setActive((current) => Math.min(Math.max(current, 0), Math.max(0, results.length - 1)));
  }, [results]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!paletteOpen) return null;

  const choose = (result: Result | undefined) => {
    if (!result) return;
    closePalette();
    result.perform();
  };

  let lastGroup: Group | null = null;

  return (
    <div
      className="palette-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closePalette();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette__search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closePalette();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActive((current) => (results.length ? (current + 1) % results.length : 0));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(results[active]);
              }
            }}
            placeholder="Jump to anything, or type a command…"
            aria-label="Command palette search"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette__results" ref={listRef}>
          {results.length === 0 ? (
            <p className="palette__empty">No matches. Try a title, a tag or an action.</p>
          ) : (
            results.map((result, index) => {
              const showGroup = result.group !== lastGroup;
              lastGroup = result.group;
              return (
                <div key={result.id}>
                  {showGroup ? <div className="palette__group">{result.group}</div> : null}
                  <button
                    type="button"
                    data-index={index}
                    className={`palette__row ${index === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(result)}
                  >
                    <span className="palette__icon">{result.icon}</span>
                    <span className="palette__label">{result.label}</span>
                    {result.hint ? <span className="palette__hint">{result.hint}</span> : null}
                    {result.id === 'undo' && !history.canUndo ? (
                      <span className="palette__none">nothing yet</span>
                    ) : null}
                    {result.id === 'redo' && !history.canRedo ? (
                      <span className="palette__none">nothing yet</span>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <footer className="palette__footer">
          <span className="palette__brand">
            <Sparkles size={13} /> URL Flow
          </span>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open
          </span>
        </footer>
      </div>
    </div>
  );
}
