import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, Zap } from 'lucide-react';
import { AppProvider, useApp } from './app-context';
import { CommandPalette } from './components/CommandPalette';
import { ItemDialog } from './components/ItemDialog';
import { MergeDialog } from './components/MergeDialog';
import { ReminderDialog } from './components/ReminderDialog';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ArchiveView } from './views/Archive';
import { Dashboard } from './views/Dashboard';
import { LinksView } from './views/Links';
import { MatchesView } from './views/Matches';
import { NotesView } from './views/Notes';
import { PlanDetail } from './views/PlanDetail';
import { PlansView } from './views/Plans';
import { RemindersView } from './views/Reminders';
import { ReviewView } from './views/Review';
import { SettingsView } from './views/Settings';
import { TasksView } from './views/Tasks';

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { view, loading, toasts, dismissToast, highlightId, clearHighlight } = useApp();

  useEffect(() => {
    if (!highlightId) return;
    const element = document.querySelector(`[data-item-id="${highlightId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('is-highlighted');
    }
    const timer = window.setTimeout(() => {
      element?.classList.remove('is-highlighted');
      clearHighlight();
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [highlightId, clearHighlight, view.name]);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TopBar />
        <main className="content">{loading ? <Loading /> : renderView(view.name)}</main>
      </div>

      <CommandPalette />
      <ItemDialog />
      <MergeDialog />
      <ReminderDialog />

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <span className="toast__icon">
              {toast.tone === 'success' ? (
                <CheckCircle2 size={16} />
              ) : toast.tone === 'error' ? (
                <AlertTriangle size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <span className="toast__message">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  dismissToast(toast.id);
                  void toast.action?.perform();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button type="button" className="toast__close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderView(name: ReturnType<typeof useApp>['view']['name']) {
  switch (name) {
    case 'links':
      return <LinksView />;
    case 'plans':
      return <PlansView />;
    case 'plan':
      return <PlanDetail />;
    case 'tasks':
      return <TasksView />;
    case 'notes':
      return <NotesView />;
    case 'reminders':
      return <RemindersView />;
    case 'matches':
      return <MatchesView />;
    case 'review':
      return <ReviewView />;
    case 'archive':
      return <ArchiveView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <Dashboard />;
  }
}

function Loading() {
  return (
    <div className="loading">
      <div className="loading__mark">
        <Zap size={26} />
      </div>
      <p>Opening your workspace…</p>
    </div>
  );
}
