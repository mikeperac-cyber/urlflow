import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from '../../src/views/Settings';

const context = vi.hoisted(() => ({
  api: {
    listBackups: async () => [],
    onUpdateStatus: () => () => undefined,
    saveTagRules: vi.fn(),
  },
  run: vi.fn(async (promise: unknown) => promise),
  setPref: vi.fn().mockResolvedValue(undefined),
  pushToast: vi.fn(),
  prefs: {
    closeToTray: false,
    captureShortcut: 'Control+Alt+K',
    reminderSound: true,
    quietHoursStart: '',
    quietHoursEnd: '',
  },
  links: [],
  plans: [],
  tasks: [],
  notes: [],
  archivedItems: [],
  state: {
    reminders: [],
    tagRules: [{ id: 'r1', pattern: 'github.com', matchType: 'domain', tags: ['code'], enabled: true }],
  },
}));

vi.mock('../../src/app-context', () => ({ useApp: () => context }));
vi.mock('../../src/lib/api', () => ({ isDesktop: true }));

afterEach(() => {
  cleanup();
  context.api.saveTagRules.mockClear();
});

describe('auto-tag rules settings', () => {
  it('edits, saves and tests a domain rule', async () => {
    render(<SettingsView />);
    await act(async () => {});

    expect(screen.getByRole('heading', { name: 'Auto-tag rules' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Tags for rule 1'), { target: { value: 'code, docs' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save rules' }));
    });

    expect(context.api.saveTagRules).toHaveBeenCalledWith([
      { id: 'r1', pattern: 'github.com', matchType: 'domain', tags: ['code', 'docs'], enabled: true },
    ]);

    fireEvent.change(screen.getByLabelText('Test a URL'), { target: { value: 'https://github.com/x' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test' }));
    });
    expect(screen.getAllByRole('status').map((node) => node.textContent)).toContain('code, docs');
  });
});
