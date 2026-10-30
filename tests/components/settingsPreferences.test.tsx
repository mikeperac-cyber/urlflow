import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from '../../src/views/Settings';

const context = vi.hoisted(() => ({
  api: { listBackups: async () => [], onUpdateStatus: () => () => undefined }, run: vi.fn(), setPref: vi.fn().mockResolvedValue(undefined), pushToast: vi.fn(),
  prefs: { closeToTray: false, captureShortcut: 'Control+Alt+K', reminderSound: true, quietHoursStart: '', quietHoursEnd: '' },
  links: [], plans: [], tasks: [], notes: [], archivedItems: [], state: { reminders: [] },
}));
vi.mock('../../src/app-context', () => ({ useApp: () => context }));
vi.mock('../../src/lib/api', () => ({ isDesktop: true }));
afterEach(() => { cleanup(); context.setPref.mockClear(); });

describe('settings preferences', () => {
  it('showsSavedPreferencesAndSubmitsTypedControlValues', async () => {
    render(<SettingsView />);
    await act(async () => {});
    const shortcut = screen.getByRole('textbox', { name: 'Capture shortcut' }) as HTMLInputElement;
    expect(shortcut.value).toBe('Control+Alt+K');
    expect((screen.getByRole('checkbox', { name: 'Keep running in the system tray' }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reminder sound' }));
    fireEvent.change(screen.getByLabelText('Quiet hours start'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Quiet hours end'), { target: { value: '07:00' } });
    fireEvent.change(shortcut, { target: { value: 'Control+Shift+J' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save shortcut' })); });
    expect(context.setPref.mock.calls).toEqual([
      ['reminderSound', false], ['quietHoursStart', '22:00'], ['quietHoursEnd', '07:00'], ['captureShortcut', 'Control+Shift+J'],
    ]);
  });
});
