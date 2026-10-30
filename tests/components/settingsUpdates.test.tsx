import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../../shared/types';
import { SettingsView } from '../../src/views/Settings';

const boundary = vi.hoisted(() => ({
  status: { state: 'idle', enabled: false, message: 'Automatic updates are not configured for this local build.' } as UpdateStatus,
  listener: null as ((status: UpdateStatus) => void) | null,
  check: vi.fn(), install: vi.fn(), unsubscribe: vi.fn(),
}));
const context = vi.hoisted(() => ({
  api: {
    listBackups: async () => [],
    onUpdateStatus: (listener: (status: UpdateStatus) => void) => { boundary.listener = listener; listener(boundary.status); return boundary.unsubscribe; },
    checkForUpdates: boundary.check, installUpdate: boundary.install,
  },
  prefs: { closeToTray: true, captureShortcut: 'Control+Shift+Space', reminderSound: true, quietHoursStart: '', quietHoursEnd: '' },
  run: vi.fn(), setPref: vi.fn(), pushToast: vi.fn(), links: [], plans: [], tasks: [], notes: [], archivedItems: [], state: { reminders: [] },
}));
vi.mock('../../src/app-context', () => ({ useApp: () => context }));
vi.mock('../../src/lib/api', () => ({ isDesktop: true }));
beforeEach(() => { boundary.check.mockReset().mockResolvedValue(undefined); boundary.install.mockReset().mockResolvedValue(undefined); });
afterEach(() => { cleanup(); boundary.listener = null; });
function panel() { return within(screen.getByRole('region', { name: 'Application updates' })); }

describe('Settings update status', () => {
  it('showsLocalBuildAvailabilityWithoutOfferingUpdateActions', async () => {
    boundary.status = { state: 'idle', enabled: false, message: 'Automatic updates are not configured for this local build.' };
    render(<SettingsView />); await act(async () => {});
    expect(panel().getByText(/not configured for this local build/)).toBeTruthy();
    expect(panel().queryByRole('button')).toBeNull();
  });

  it('checksManuallyAndOffersRestartOnlyAfterDownload', async () => {
    boundary.status = { state: 'idle', enabled: true };
    render(<SettingsView />); await act(async () => {});
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Check for updates' })); });
    expect(boundary.check).toHaveBeenCalledTimes(1);
    act(() => boundary.listener!({ state: 'downloading', enabled: true, version: '1.2.0', percent: 42.3 }));
    expect(panel().getByText('Downloading 1.2.0 · 42%')).toBeTruthy();
    expect((panel().getByRole('button') as HTMLButtonElement).disabled).toBe(true);
    act(() => boundary.listener!({ state: 'downloaded', enabled: true, version: '1.2.0' }));
    await act(async () => { fireEvent.click(panel().getByRole('button', { name: 'Restart to install' })); });
    expect(boundary.install).toHaveBeenCalledTimes(1);
    act(() => boundary.listener!({ state: 'not-available', enabled: true, version: '1.1.0' }));
    expect(panel().getByText('You’re up to date.')).toBeTruthy();
    act(() => boundary.listener!({ state: 'error', enabled: true, message: 'Feed unavailable' }));
    expect(panel().getByText('Feed unavailable')).toBeTruthy();
    expect((panel().getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });
});
