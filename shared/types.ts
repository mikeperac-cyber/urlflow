export type ItemKind = 'link' | 'plan' | 'task' | 'note';

export type Priority = 'low' | 'normal' | 'high';

export type PlanStatus = 'active' | 'paused' | 'done';

export type RepeatRule = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface Step {
  id: string;
  text: string;
  done: boolean;
  dueAt?: string | null;
  notes?: string;
}

export interface Reminder {
  id: string;
  itemId: string;
  text: string;
  remindAt: string;
  notifiedAt: string | null;
  createdAt: string;
  repeat: RepeatRule;
  lastFiredAt?: string | null;
}

export interface BaseItem {
  id: string;
  kind: ItemKind;
  title: string;
  notes: string;
  tags: string[];
  planId: string | null;
  archivedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkItem extends BaseItem {
  kind: 'link';
  url: string;
  favorite: boolean;
  lastOpenedAt: string | null;
}

export interface PlanItem extends BaseItem {
  kind: 'plan';
  summary: string;
  status: PlanStatus;
  targetDate: string | null;
  steps: Step[];
  color: string;
}

export interface TaskItem extends BaseItem {
  kind: 'task';
  done: boolean;
  dueAt: string | null;
  priority: Priority;
  completedAt: string | null;
}

export interface NoteItem extends BaseItem {
  kind: 'note';
  pinned: boolean;
}

export type AnyItem = LinkItem | PlanItem | TaskItem | NoteItem;

export interface AppState {
  version: number;
  items: AnyItem[];
  reminders: Reminder[];
  ignoredMatches: string[];
}

export interface ItemDraft {
  kind: ItemKind;
  title: string;
  notes?: string;
  tags?: string[];
  planId?: string | null;
  url?: string;
  favorite?: boolean;
  summary?: string;
  status?: PlanStatus;
  targetDate?: string | null;
  steps?: Step[];
  color?: string;
  done?: boolean;
  dueAt?: string | null;
  priority?: Priority;
  pinned?: boolean;
  reminderAt?: string | null;
  reminderText?: string;
  reminderRepeat?: RepeatRule;
}

export type ItemPatch = Partial<
  Omit<LinkItem, 'id' | 'kind'> &
    Omit<PlanItem, 'id' | 'kind'> &
    Omit<TaskItem, 'id' | 'kind'> &
    Omit<NoteItem, 'id' | 'kind'>
>;

export interface Preferences {
  closeToTray: boolean;
}

/** How a pairwise merge should resolve fields that differ between the two items. */
export interface MergeFieldChoices {
  titleFromId?: string;
  notesMode?: 'merge' | 'primary' | 'other';
  dateMode?: 'merge' | 'primary' | 'other' | 'none';
}

export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
}

export interface BookmarkEntry {
  url: string;
  title: string;
  folder: string;
}

export interface BookmarkFile {
  fileName: string;
  entries: BookmarkEntry[];
}

export interface BookmarkImportResult {
  state: AppState;
  added: number;
  skipped: number;
}

export interface BackupInfo {
  file: string;
  createdAt: string;
  items: number;
  bytes: number;
}

export interface CapturePayload {
  url: string | null;
}

export interface FlowApi {
  load: () => Promise<AppState>;
  getPreferences: () => Promise<Preferences>;
  setPreference: (key: keyof Preferences, value: boolean) => Promise<Preferences>;
  create: (draft: ItemDraft) => Promise<AppState>;
  update: (id: string, patch: ItemPatch) => Promise<AppState>;
  remove: (id: string) => Promise<AppState>;
  archive: (id: string) => Promise<AppState>;
  restore: (id: string) => Promise<AppState>;
  markReviewed: (id: string) => Promise<AppState>;
  merge: (primaryId: string, otherId: string, choices?: MergeFieldChoices) => Promise<AppState>;
  mergeMany: (
    primaryId: string,
    otherIds: string[],
    choices?: MergeFieldChoices,
  ) => Promise<AppState>;
  toggleStep: (planId: string, stepId: string) => Promise<AppState>;
  setReminder: (
    itemId: string,
    remindAt: string,
    text?: string,
    repeat?: RepeatRule,
  ) => Promise<AppState>;
  snoozeReminder: (id: string, minutes: number) => Promise<AppState>;
  dismissReminder: (id: string) => Promise<AppState>;
  removeReminder: (id: string) => Promise<AppState>;
  ignoreMatch: (key: string) => Promise<AppState>;
  unignoreMatch: (key: string) => Promise<AppState>;
  openLink: (id: string) => Promise<AppState>;
  copyText: (text: string) => Promise<void>;
  readClipboard: () => Promise<string>;
  fetchTitle: (url: string) => Promise<string | null>;
  exportData: () => Promise<string | null>;
  importData: () => Promise<AppState | null>;
  revealDataFile: () => Promise<void>;
  testNotification: () => Promise<void>;
  undo: () => Promise<AppState | null>;
  redo: () => Promise<AppState | null>;
  historyStatus: () => Promise<HistoryStatus>;
  pickBookmarks: () => Promise<BookmarkFile | null>;
  importBookmarks: (entries: BookmarkEntry[], tagFolders: boolean) => Promise<BookmarkImportResult>;
  listBackups: () => Promise<BackupInfo[]>;
  restoreBackup: (file: string) => Promise<AppState>;
  backupNow: () => Promise<BackupInfo | null>;
  onState: (cb: (state: AppState) => void) => () => void;
  onHistory: (cb: (status: HistoryStatus) => void) => () => void;
  onFocusItem: (cb: (itemId: string) => void) => () => void;
  onCapture: (cb: (payload: CapturePayload) => void) => () => void;
}

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  link: 'Link',
  plan: 'Plan',
  task: 'Task',
  note: 'Note',
};

export const REPEAT_LABEL: Record<RepeatRule, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekdays: 'Every weekday',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const PLAN_COLORS = ['#6d8bff', '#a06bff', '#3ecf8e', '#f5a524', '#f2607a', '#2fc9d6'];

export function emptyState(): AppState {
  return { version: 1, items: [], reminders: [], ignoredMatches: [] };
}

export function matchKey(aId: string, bId: string): string {
  return [aId, bId].sort().join('|');
}
