import { useEffect, useRef } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { useApp } from '../app-context';
import { VIEW_META, type ViewName } from '../lib/navigation';
import type { ItemKind } from '../../shared/types';
import { Button } from './ui';

const PRIMARY: Partial<Record<ViewName, { label: string; kind: ItemKind }>> = {
  dashboard: { label: 'New link', kind: 'link' },
  links: { label: 'New link', kind: 'link' },
  sites: { label: 'New link', kind: 'link' },
  plans: { label: 'New plan', kind: 'plan' },
  tasks: { label: 'New task', kind: 'task' },
  notes: { label: 'New note', kind: 'note' },
  plan: { label: 'Add task', kind: 'task' },
};

const SEARCHABLE: ViewName[] = ['links', 'sites', 'plans', 'tasks', 'notes', 'archive', 'reminders'];

export function TopBar() {
  const { view, search, setSearch, openEditor, plans } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const primary = PRIMARY[view.name];
  const meta = VIEW_META[view.name === 'plan' ? 'plans' : view.name];
  const currentPlan = view.name === 'plan' ? plans.find((plan) => plan.id === view.id) : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n' && !typing) {
        event.preventDefault();
        if (primary) openEditor({ kind: primary.kind, preset: view.name === 'plan' ? { planId: view.id } : {} });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openEditor, primary, view.id, view.name]);

  return (
    <header className="topbar">
      <div className="topbar__titles">
        <h1>{currentPlan ? currentPlan.title : meta.title}</h1>
        <p>{currentPlan ? 'Steps, attached tasks, links and notes.' : meta.subtitle}</p>
      </div>

      <div className="topbar__tools">
        {SEARCHABLE.includes(view.name) ? (
          <div className="search">
            <Search size={15} />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search this view…"
              aria-label="Search"
              spellCheck={false}
            />
            {search ? (
              <button
                type="button"
                className="search__clear"
                onClick={() => {
                  setSearch('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                title="Clear search"
              >
                <X size={11} />
              </button>
            ) : (
              <kbd>Ctrl K</kbd>
            )}
          </div>
        ) : null}
        {primary ? (
          <Button
            variant="primary"
            icon={<Plus size={15} />}
            onClick={() =>
              openEditor({ kind: primary.kind, preset: view.name === 'plan' ? { planId: view.id } : {} })
            }
          >
            {primary.label}
          </Button>
        ) : null}
      </div>
    </header>
  );
}
