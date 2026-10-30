import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Bookmark,
  Download,
  FolderOpen,
  HardDrive,
  History,
  Info,
  RotateCcw,
  Upload,
} from 'lucide-react';
import type { BackupInfo, BookmarkFile, UpdateStatus } from '../../shared/types';
import { useApp } from '../app-context';
import { BookmarkDialog } from '../components/BookmarkDialog';
import { Button, Confirm, Modal } from '../components/ui';
import { isDesktop } from '../lib/api';

export function SettingsView() {
  const {
    api,
    run,
    prefs,
    setPref,
    pushToast,
    links,
    plans,
    tasks,
    notes,
    archivedItems,
    state,
  } = useApp();
  const [confirmImport, setConfirmImport] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const [bookmarkFile, setBookmarkFile] = useState<BookmarkFile | null>(null);
  const [picking, setPicking] = useState(false);
  const [captureShortcut, setCaptureShortcut] = useState(prefs.captureShortcut);
  const [savingShortcut, setSavingShortcut] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle', enabled: false });
  const [updateActionPending, setUpdateActionPending] = useState(false);

  useEffect(() => api.onUpdateStatus(setUpdateStatus), [api]);

  async function updateAction(install: boolean) {
    if (updateActionPending) return;
    setUpdateActionPending(true);
    try { await (install ? api.installUpdate() : api.checkForUpdates()); }
    catch { pushToast('Could not contact the update service.', 'error'); }
    finally { setUpdateActionPending(false); }
  }

  const updateMessage = updateStatus.state === 'idle'
    ? updateStatus.message ?? 'Check for a newer version of URL Flow.'
    : updateStatus.state === 'checking' ? 'Checking for updates…'
    : updateStatus.state === 'available' ? `Version ${updateStatus.version ?? ''} is available. Starting download…`
    : updateStatus.state === 'downloading' ? `Downloading ${updateStatus.version ?? 'update'} · ${Math.round(updateStatus.percent)}%`
    : updateStatus.state === 'downloaded' ? `Version ${updateStatus.version ?? ''} is ready. It will install when you quit.`
    : updateStatus.state === 'not-available' ? 'You’re up to date.'
    : updateStatus.message;

  useEffect(() => {
    setCaptureShortcut(prefs.captureShortcut);
  }, [prefs.captureShortcut]);

  const loadBackups = useCallback(async () => {
    if (!isDesktop) return;
    try {
      setBackups(await api.listBackups());
    } catch {
      /* the list is informational */
    }
  }, [api]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  async function exportBackup() {
    const path = await run(api.exportData());
    if (typeof path === 'string') pushToast('Backup saved', 'success');
  }

  async function importBackup() {
    const result = await run(api.importData());
    if (result) pushToast('Backup imported', 'success');
  }

  async function backUpNow() {
    const info = await run(api.backupNow());
    if (info) {
      pushToast(`Backup saved · ${info.items} items`, 'success');
      await loadBackups();
    }
  }

  async function pickBookmarks() {
    setPicking(true);
    try {
      const file = await run(api.pickBookmarks());
      if (file) {
        if (file.entries.length === 0) {
          pushToast('No bookmarks found in that file', 'error');
        } else {
          setBookmarkFile(file);
        }
      }
    } finally {
      setPicking(false);
    }
  }

  async function restoreSelected() {
    if (!restoring) return;
    const restored = await run(api.restoreBackup(restoring.file));
    if (restored) {
      pushToast('Backup restored', 'success');
      await loadBackups();
    }
    setRestoring(null);
  }

  function formatBackupDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  return (
    <div className="stack settings">
      <section className="panel panel--data">
        <header className="panel__head">
          <div>
            <h3>
              <HardDrive size={16} /> Data &amp; backup
            </h3>
            <p>Everything lives in a single JSON file on this computer.</p>
          </div>
        </header>
        <div className="panel__body">
          <div className="settings-row">
            <div>
              <strong>Workspace contents</strong>
              <span>
                {links.length} links · {plans.length} plans · {tasks.length} tasks · {notes.length} notes ·{' '}
                {state.reminders.length} reminders · {archivedItems.length} archived
              </span>
            </div>
            {isDesktop ? (
              <Button variant="subtle" icon={<FolderOpen size={14} />} onClick={() => void api.revealDataFile()}>
                Show data folder
              </Button>
            ) : (
              <span className="muted">Browser preview stores data in local storage.</span>
            )}
          </div>

          {isDesktop ? (
            <>
              <div className="settings-row">
                <div>
                  <strong>Automatic backups</strong>
                  <span>
                    {backups[0]
                      ? `Last snapshot ${formatBackupDate(backups[0].createdAt)} · ${backups[0].items} items. The last 7 days are kept.`
                      : 'One snapshot is written each day into a backups folder next to your data.'}
                  </span>
                </div>
                <div className="settings-row__actions">
                  <Button variant="subtle" size="sm" icon={<Download size={13} />} onClick={() => void backUpNow()}>
                    Back up now
                  </Button>
                  <Button
                    variant="subtle"
                    size="sm"
                    icon={<History size={13} />}
                    onClick={() => setBackupOpen(true)}
                  >
                    Restore…
                  </Button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <strong>Snapshot history</strong>
                  <span>
                    Daily copies stay on this computer even if the workspace file is replaced. Restoring one is
                    a normal change, so Undo brings the current workspace back.
                  </span>
                </div>
                <span className="settings-badge">{backups.length} saved</span>
              </div>
            </>
          ) : null}

          <div className="settings-row">
            <div>
              <strong>Export a backup</strong>
              <span>Download a JSON file you can keep or move to another computer.</span>
            </div>
            <Button variant="subtle" icon={<Download size={14} />} onClick={() => void exportBackup()}>
              Export
            </Button>
          </div>
          <div className="settings-row">
            <div>
              <strong>Import a backup</strong>
              <span>Replaces the current workspace with the contents of a backup file.</span>
            </div>
            <Button variant="subtle" icon={<Upload size={14} />} onClick={() => setConfirmImport(true)}>
              Import
            </Button>
          </div>
          <div className="settings-row">
            <div>
              <strong>Import browser bookmarks</strong>
              <span>
                Read a Chrome, Edge or Firefox HTML export, tag links by folder, and skip addresses you already
                saved.
              </span>
            </div>
            <Button
              variant="subtle"
              icon={<Bookmark size={14} />}
              onClick={() => void pickBookmarks()}
              disabled={picking}
            >
              {picking ? 'Choosing…' : 'Choose file'}
            </Button>
          </div>
        </div>
      </section>

      <section className="panel panel--alerts">
        <header className="panel__head">
          <div>
            <h3>
              <Bell size={16} /> Capture, reminders &amp; window
            </h3>
            <p>Choose how you capture links and receive reminders.</p>
          </div>
        </header>
        <div className="panel__body">
          <div className="settings-row">
            <div>
              <strong>Keep running in the system tray</strong>
              <span>
                Closing the window hides it instead of quitting, so scheduled reminders still fire. Turn this
                off to quit when you close the window.
              </span>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                aria-label="Keep running in the system tray"
                checked={prefs.closeToTray}
                onChange={(event) => void setPref('closeToTray', event.target.checked)}
              />
              <span className="switch__track">
                <span className="switch__thumb" />
              </span>
            </label>
          </div>
          <div className="settings-row">
            <div>
              <strong>Capture shortcut</strong>
              <span>Save the link on your clipboard from any app. For example, Control+Alt+K.</span>
            </div>
            <form className="settings-row__actions" onSubmit={async (event) => {
              event.preventDefault();
              if (savingShortcut || !captureShortcut.trim()) return;
              setSavingShortcut(true);
              try { await setPref('captureShortcut', captureShortcut.trim()); }
              finally { setSavingShortcut(false); }
            }}>
              <input className="input" aria-label="Capture shortcut" value={captureShortcut}
                maxLength={100} disabled={savingShortcut}
                onChange={(event) => setCaptureShortcut(event.target.value)} />
              <Button type="submit" variant="subtle" size="sm"
                disabled={savingShortcut || !captureShortcut.trim() || captureShortcut.trim() === prefs.captureShortcut}>
                {savingShortcut ? 'Saving…' : 'Save shortcut'}
              </Button>
            </form>
          </div>
          <div className="settings-row">
            <div>
              <strong>Reminder sound</strong>
              <span>Play a sound with reminder notifications.</span>
            </div>
            <label className="switch">
              <input type="checkbox" aria-label="Reminder sound" checked={prefs.reminderSound}
                onChange={(event) => void setPref('reminderSound', event.target.checked)} />
              <span className="switch__track"><span className="switch__thumb" /></span>
            </label>
          </div>
          <div className="settings-row">
            <div>
              <strong>Quiet hours</strong>
              <span>Use this computer’s local time. Due reminders wait until quiet hours end. Leave either time empty to turn this off.</span>
            </div>
            <form className="settings-row__actions" aria-label="Quiet hours" onSubmit={(event) => event.preventDefault()}>
              <label>From <input className="input" type="time" aria-label="Quiet hours start"
                value={prefs.quietHoursStart} onChange={(event) => void setPref('quietHoursStart', event.target.value)} /></label>
              <label>Until <input className="input" type="time" aria-label="Quiet hours end"
                value={prefs.quietHoursEnd} onChange={(event) => void setPref('quietHoursEnd', event.target.value)} /></label>
              <Button variant="ghost" size="sm" disabled={!prefs.quietHoursStart && !prefs.quietHoursEnd}
                onClick={async () => {
                  await setPref('quietHoursStart', '');
                  await setPref('quietHoursEnd', '');
                }}>Turn off</Button>
            </form>
          </div>
          <div className="settings-row">
            <div>
              <strong>Test a notification</strong>
              <span>Check that Windows notifications are allowed for URL Flow.</span>
            </div>
            <Button variant="subtle" size="sm" onClick={() => void api.testNotification()}>
              Send test
            </Button>
          </div>
          {!isDesktop ? (
            <p className="muted">
              Global capture shortcuts, tray behaviour and Windows notifications are available in the installed desktop app.
            </p>
          ) : null}
        </div>
      </section>

      <section className="panel" aria-label="Application updates">
        <header className="panel__head"><div>
          <h3><Download size={16} /> Updates</h3>
          <p>URL Flow 1.1.0</p>
        </div></header>
        <div className="panel__body"><div className="settings-row">
          <div><strong>Application updates</strong><span role="status">{updateMessage}</span></div>
          {isDesktop && updateStatus.enabled ? (
            updateStatus.state === 'downloaded' ? (
              <Button variant="subtle" disabled={updateActionPending} onClick={() => void updateAction(true)}>Restart to install</Button>
            ) : (
              <Button variant="subtle" disabled={updateActionPending || ['checking', 'available', 'downloading'].includes(updateStatus.state)}
                onClick={() => void updateAction(false)}>Check for updates</Button>
            )
          ) : null}
        </div></div>
      </section>

      <section className="panel panel--about">
        <header className="panel__head">
          <div>
            <h3>
              <Info size={16} /> About
            </h3>
            <p>URL Flow 1.1.0 — a local-first desktop workspace.</p>
          </div>
        </header>
        <div className="panel__body">
          <div className="shortcuts">
            <div>
              <kbd>Ctrl</kbd> + <kbd>N</kbd>
              <span>New item for the current view</span>
            </div>
            <div>
              <kbd>Ctrl</kbd> + <kbd>K</kbd>
              <span>Command palette — jump or act</span>
            </div>
            <div>
              <kbd>Ctrl</kbd> + <kbd>Z</kbd>
              <span>Undo the last change</span>
            </div>
            <div>
              <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>
              <span>Redo</span>
            </div>
            {isDesktop ? (
              <div>
                <kbd>{prefs.captureShortcut}</kbd>
                <span>Save the link on your clipboard from anywhere</span>
              </div>
            ) : null}
            <div>
              <kbd>Esc</kbd>
              <span>Close a dialog</span>
            </div>
            <div>
              <kbd>Enter</kbd>
              <span>Add a quick task or step</span>
            </div>
          </div>
          <p className="muted settings__footnote">
            No account, no telemetry. Your links, plans and notes never leave this computer unless you export
            them.
          </p>
        </div>
      </section>

      {confirmImport ? (
        <Confirm
          title="Import a backup?"
          message="Importing replaces everything currently in URL Flow. Export a backup first if you are unsure."
          confirmLabel="Import"
          onConfirm={() => void importBackup()}
          onClose={() => setConfirmImport(false)}
        />
      ) : null}

      {backupOpen ? (
        <Modal
          title="Restore a snapshot"
          subtitle="Daily copies of this workspace. Restoring is undoable."
          onClose={() => setBackupOpen(false)}
          size="md"
        >
          {backups.length === 0 ? (
            <p className="muted">
              No snapshots yet. They are written once a day when the app is open, and “Back up now” creates one
              immediately.
            </p>
          ) : (
            <ul className="backup-list">
              {backups.map((backup) => (
                <li key={backup.file} className="backup-row">
                  <span className="backup-row__icon">
                    <RotateCcw size={14} />
                  </span>
                  <div className="backup-row__main">
                    <strong>{formatBackupDate(backup.createdAt)}</strong>
                    <span>
                      {backup.items} items · {(backup.bytes / 1024).toFixed(0)} KB · {backup.file}
                    </span>
                  </div>
                  <Button variant="subtle" size="sm" onClick={() => setRestoring(backup)}>
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}

      {restoring ? (
        <Confirm
          title="Restore this snapshot?"
          message={`This replaces the current workspace with the snapshot from ${formatBackupDate(
            restoring.createdAt,
          )}. You can undo the restore.`}
          confirmLabel="Restore"
          onConfirm={() => void restoreSelected()}
          onClose={() => setRestoring(null)}
        />
      ) : null}

      {bookmarkFile ? (
        <BookmarkDialog file={bookmarkFile} onClose={() => setBookmarkFile(null)} />
      ) : null}
    </div>
  );
}
