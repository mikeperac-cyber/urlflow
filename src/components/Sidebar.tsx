import { useEffect, useState } from 'react';
import {
  Archive,
  Bell,
  CheckSquare,
  ClipboardCheck,
  GitMerge,
  Globe,
  LayoutDashboard,
  Link2,
  Moon,
  NotebookPen,
  Settings,
  Sun,
  Target,
  Zap,
} from 'lucide-react';
import { useApp } from '../app-context';
import { isDueToday } from '../lib/dates';
import type { ViewName } from '../lib/navigation';

const NAV: { name: ViewName; label: string; icon: typeof Link2 }[] = [
  { name: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { name: 'links', label: 'Links', icon: Link2 },
  { name: 'sites', label: 'Sites', icon: Globe },
  { name: 'plans', label: 'Plans', icon: Target },
  { name: 'tasks', label: 'Tasks', icon: CheckSquare },
  { name: 'notes', label: 'Notes', icon: NotebookPen },
  { name: 'reminders', label: 'Reminders', icon: Bell },
  { name: 'matches', label: 'Matches', icon: GitMerge },
  { name: 'review', label: 'Review', icon: ClipboardCheck },
  { name: 'archive', label: 'Archive', icon: Archive },
];

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('url-flow:theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('url-flow:theme', theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((value) => (value === 'dark' ? 'light' : 'dark')) };
}

export function Sidebar() {
  const { view, navigate, links, plans, tasks, notes, matches, archivedItems, state, remindersById, reviewQueue } =
    useApp();
  const { theme, toggle } = useTheme();

  const openTasks = tasks.filter((task) => !task.done).length;
  const activePlans = plans.filter((plan) => plan.status === 'active').length;
  const dueTasks = tasks.filter((task) => !task.done && isDueToday(task.dueAt)).length;
  const upcoming = state.reminders.filter((reminder) => !reminder.notifiedAt).length;
  const reviewCount = matches.duplicates.length + matches.related.length;

  const counts: Partial<Record<ViewName, number>> = {
    links: links.length,
    plans: activePlans,
    tasks: openTasks,
    notes: notes.length,
    reminders: upcoming,
    matches: reviewCount,
    review: reviewQueue.length,
    archive: archivedItems.length,
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand__mark">
          <Zap size={18} />
        </div>
        <div>
          <div className="brand__name">URL Flow</div>
          <div className="brand__tag">Personal workspace</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((entry) => {
          const Icon = entry.icon;
          const isActive = view.name === entry.name || (view.name === 'plan' && entry.name === 'plans');
          const count = counts[entry.name];
          return (
            <button
              key={entry.name}
              type="button"
              className={`nav__item ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => navigate(entry.name)}
            >
              <Icon size={16} />
              <span className="nav__label">{entry.label}</span>
              {count ? (
                <span
                  className={`nav__count ${
                    entry.name === 'matches' || entry.name === 'review' ? 'nav__count--accent' : ''
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__stat">
          <span className="sidebar__stat-value">{dueTasks + remindersById.size}</span>
          <span className="sidebar__stat-label">need attention</span>
        </div>
        <div className="sidebar__actions">
          <button
            type="button"
            className={`nav__item nav__item--small ${view.name === 'settings' ? 'is-active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings size={16} />
            <span className="nav__label">Settings</span>
          </button>
          <button
            type="button"
            className="nav__item nav__item--small"
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
            aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'}
          >
            {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            <span className="nav__label">Appearance</span>
            <span className="nav__value">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
