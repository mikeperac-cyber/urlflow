export type ViewName =
  | 'dashboard'
  | 'links'
  | 'plans'
  | 'plan'
  | 'tasks'
  | 'notes'
  | 'reminders'
  | 'matches'
  | 'review'
  | 'archive'
  | 'settings';

export interface View {
  name: ViewName;
  id?: string;
}

export const VIEW_META: Record<Exclude<ViewName, 'plan'>, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Your links, plans and the next thing to do.' },
  links: { title: 'Links', subtitle: 'Every URL you saved, with notes and context.' },
  plans: { title: 'Plans', subtitle: 'Break bigger goals into steps you can actually finish.' },
  tasks: { title: 'Tasks', subtitle: 'One-off actions, due dates and priorities.' },
  notes: { title: 'Notes', subtitle: 'Research, snippets and thoughts worth keeping.' },
  reminders: { title: 'Reminders', subtitle: 'Scheduled nudges for anything in your workspace.' },
  matches: { title: 'Matches', subtitle: 'Duplicate and related items that could be merged.' },
  review: { title: 'Weekly review', subtitle: 'Decide what to keep, archive or clean up.' },
  archive: { title: 'Archive', subtitle: 'Everything you set aside, ready to restore.' },
  settings: { title: 'Settings', subtitle: 'Storage, backup and app behaviour.' },
};
