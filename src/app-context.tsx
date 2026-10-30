import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { findMatches } from '../shared/matching';
import { buildReviewQueue, type ReviewEntry } from '../shared/review';
import {
  emptyState,
  type AnyItem,
  type AppState,
  type ItemDraft,
  type FlowApi,
  type HistoryStatus,
  type ItemKind,
  type LinkItem,
  type NoteItem,
  type PlanItem,
  type Preferences,
  type Reminder,
  type TaskItem,
} from '../shared/types';
import { api, errorMessage } from './lib/api';
import type { View, ViewName } from './lib/navigation';

export interface EditorRequest {
  kind: ItemKind;
  item?: AnyItem;
  preset?: Partial<ItemDraft>;
}

export interface ToastAction {
  label: string;
  perform: () => Promise<unknown> | void;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
  action?: ToastAction;
}

interface AppContextValue {
  api: FlowApi;
  state: AppState;
  loading: boolean;
  prefs: Preferences;
  activeItems: AnyItem[];
  archivedItems: AnyItem[];
  plans: PlanItem[];
  links: LinkItem[];
  tasks: TaskItem[];
  notes: NoteItem[];
  remindersById: Map<string, Reminder>;
  matches: ReturnType<typeof findMatches>;
  reviewQueue: ReviewEntry[];
  view: View;
  navigate: (name: ViewName, id?: string) => void;
  search: string;
  setSearch: (value: string) => void;
  highlightId: string | null;
  clearHighlight: () => void;
  toasts: ToastItem[];
  pushToast: (message: string, tone?: ToastItem['tone'], action?: ToastAction) => void;
  dismissToast: (id: number) => void;
  showUndoToast: (message: string) => void;
  history: HistoryStatus;
  undo: () => Promise<AppState | null>;
  redo: () => Promise<AppState | null>;
  archiveItem: (id: string, success: string) => Promise<AppState | null>;
  restoreItem: (id: string, success: string) => Promise<AppState | null>;
  run: <T>(promise: Promise<T>, options?: { success?: string }) => Promise<T | null>;
  setPref: (key: keyof Preferences, value: boolean) => Promise<void>;
  editor: EditorRequest | null;
  openEditor: (request: EditorRequest) => void;
  closeEditor: () => void;
  mergeIds: string[] | null;
  openMerge: (ids: string[]) => void;
  closeMerge: () => void;
  reminderItem: AnyItem | null;
  reminderOpen: boolean;
  openReminder: (item?: AnyItem) => void;
  closeReminder: () => void;
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>({ closeToTray: true });
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [search, setSearch] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [mergeIds, setMergeIds] = useState<string[] | null>(null);
  const [reminderItem, setReminderItem] = useState<AnyItem | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [history, setHistory] = useState<HistoryStatus>({ canUndo: false, canRedo: false });
  const toastSeq = useRef(0);
  const timers = useRef<number[]>([]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastItem['tone'] = 'info', action?: ToastAction) => {
      toastSeq.current += 1;
      const id = toastSeq.current;
      setToasts((current) => [...current.slice(-3), { id, message, tone, action }]);
      const ttl = action ? 8000 : tone === 'error' ? 6000 : 3600;
      const timer = window.setTimeout(() => dismissToast(id), ttl);
      timers.current.push(timer);
    },
    [dismissToast],
  );

  const undo = useCallback(async (): Promise<AppState | null> => {
    try {
      const result = await api.undo();
      if (!result) {
        pushToast('Nothing to undo yet', 'info');
        return null;
      }
      setState(result);
      pushToast('Change undone', 'success');
      return result;
    } catch (error) {
      pushToast(errorMessage(error), 'error');
      return null;
    }
  }, [pushToast]);

  const redo = useCallback(async (): Promise<AppState | null> => {
    try {
      const result = await api.redo();
      if (!result) {
        pushToast('Nothing to redo', 'info');
        return null;
      }
      setState(result);
      pushToast('Change reapplied', 'success');
      return result;
    } catch (error) {
      pushToast(errorMessage(error), 'error');
      return null;
    }
  }, [pushToast]);

  const showUndoToast = useCallback(
    (message: string) => {
      pushToast(message, 'success', { label: 'Undo', perform: () => undo() });
    },
    [pushToast, undo],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .load()
      .then((loaded) => {
        if (!alive) return;
        setState(loaded);
        setLoading(false);
      })
      .catch((error) => {
        if (!alive) return;
        setLoading(false);
        pushToast(errorMessage(error), 'error');
      });
    api
      .getPreferences()
      .then((value) => {
        if (alive) setPrefs(value);
      })
      .catch(() => undefined);
    api
      .historyStatus()
      .then((value) => {
        if (alive) setHistory(value);
      })
      .catch(() => undefined);
    const offState = api.onState((next) => setState(next));
    const offHistory = api.onHistory((next) => setHistory(next));
    const offFocus = api.onFocusItem((itemId) => {
      setState((current) => {
        const item = current.items.find((entry) => entry.id === itemId);
        if (item) {
          setView(item.kind === 'plan' ? { name: 'plan', id: item.id } : mapKindToView(item.kind));
          setHighlightId(item.id);
        }
        return current;
      });
    });
    return () => {
      alive = false;
      offState();
      offHistory();
      offFocus();
    };
  }, [pushToast]);

  // App-wide shortcuts: undo/redo and the command palette.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (typing) return;
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) void redo();
        else void undo();
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [redo, undo]);

  // The tray and the global shortcut hand us a URL from the clipboard.
  useEffect(() => {
    return api.onCapture(({ url }) => {
      if (!url) {
        pushToast('Copy a link first, then try again', 'error');
        return;
      }
      void (async () => {
        try {
          const title = await api.fetchTitle(url);
          const next = await api.create({ kind: 'link', url, title: title ?? '' });
          setState(next);
          showUndoToast('Link saved from clipboard');
        } catch (error) {
          pushToast(errorMessage(error), 'error');
        }
      })();
    });
  }, [pushToast, showUndoToast]);

  const run = useCallback(
    async <T,>(promise: Promise<T>, options?: { success?: string }): Promise<T | null> => {
      try {
        const result = await promise;
        if (result && typeof result === 'object' && 'items' in (result as Record<string, unknown>)) {
          setState(result as unknown as AppState);
        }
        // An older Undo action no longer describes the most recent change.
        setToasts((current) => current.filter((toast) => !toast.action));
        if (options?.success) pushToast(options.success, 'success');
        return result;
      } catch (error) {
        pushToast(errorMessage(error), 'error');
        return null;
      }
    },
    [pushToast],
  );

  const archiveItem = useCallback(
    async (id: string, success: string) => {
      const result = await run(api.archive(id));
      if (result) showUndoToast(success);
      return result;
    },
    [api, run, showUndoToast],
  );

  const restoreItem = useCallback(
    async (id: string, success: string) => {
      const result = await run(api.restore(id));
      if (result) showUndoToast(success);
      return result;
    },
    [api, run, showUndoToast],
  );

  const setPref = useCallback(
    async (key: keyof Preferences, value: boolean) => {
      try {
        const next = await api.setPreference(key, value);
        setPrefs(next);
      } catch (error) {
        pushToast(errorMessage(error), 'error');
      }
    },
    [pushToast],
  );

  const navigate = useCallback((name: ViewName, id?: string) => {
    setView({ name, id });
    setSearch('');
    setHighlightId(null);
    window.scrollTo({ top: 0 });
  }, []);

  const clearHighlight = useCallback(() => setHighlightId(null), []);

  const activeItems = useMemo(() => state.items.filter((item) => !item.archivedAt), [state.items]);
  const archivedItems = useMemo(() => state.items.filter((item) => item.archivedAt), [state.items]);
  const plans = useMemo(
    () => activeItems.filter((item): item is PlanItem => item.kind === 'plan'),
    [activeItems],
  );
  const links = useMemo(
    () => activeItems.filter((item): item is LinkItem => item.kind === 'link'),
    [activeItems],
  );
  const tasks = useMemo(
    () => activeItems.filter((item): item is TaskItem => item.kind === 'task'),
    [activeItems],
  );
  const notes = useMemo(
    () => activeItems.filter((item): item is NoteItem => item.kind === 'note'),
    [activeItems],
  );

  const remindersById = useMemo(() => {
    const map = new Map<string, Reminder>();
    for (const reminder of state.reminders) {
      if (reminder.notifiedAt) continue;
      if (!map.has(reminder.itemId)) map.set(reminder.itemId, reminder);
    }
    return map;
  }, [state.reminders]);

  const matches = useMemo(
    () => findMatches(state.items, state.ignoredMatches),
    [state.items, state.ignoredMatches],
  );

  const reviewQueue = useMemo(() => buildReviewQueue(state, matches), [state, matches]);

  const value: AppContextValue = {
    api,
    state,
    loading,
    prefs,
    activeItems,
    archivedItems,
    plans,
    links,
    tasks,
    notes,
    remindersById,
    matches,
    reviewQueue,
    view,
    navigate,
    search,
    setSearch,
    highlightId,
    clearHighlight,
    toasts,
    pushToast,
    dismissToast,
    showUndoToast,
    history,
    undo,
    redo,
    archiveItem,
    restoreItem,
    run,
    setPref,
    editor,
    openEditor: (request) => setEditor(request),
    closeEditor: () => setEditor(null),
    mergeIds,
    openMerge: (ids) => setMergeIds(ids),
    closeMerge: () => setMergeIds(null),
    reminderItem,
    reminderOpen,
    openReminder: (item) => {
      setReminderItem(item ?? null);
      setReminderOpen(true);
    },
    closeReminder: () => {
      setReminderOpen(false);
      setReminderItem(null);
    },
    paletteOpen,
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function mapKindToView(kind: ItemKind): View {
  switch (kind) {
    case 'link':
      return { name: 'links' };
    case 'plan':
      return { name: 'plans' };
    case 'task':
      return { name: 'tasks' };
    default:
      return { name: 'notes' };
  }
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
