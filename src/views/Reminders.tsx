import { Bell, BellOff, Clock, Repeat, TriangleAlert } from 'lucide-react';
import { missedReminders } from '../../shared/core';
import { REPEAT_LABEL } from '../../shared/types';
import { useApp } from '../app-context';
import { Button, EmptyState, KindIcon } from '../components/ui';
import { fromInputValue, reminderInfo, tomorrowAt } from '../lib/dates';
import { isDesktop } from '../lib/api';

export function RemindersView() {
  const { state, openReminder, navigate, api, run, search } = useApp();
  const query = search.trim().toLowerCase();
  const matchesSearch = (itemId: string, text: string) => {
    if (!query) return true;
    const item = state.items.find((entry) => entry.id === itemId);
    return `${text} ${item?.title ?? ''} ${item?.notes ?? ''}`.toLowerCase().includes(query);
  };

  const missed = missedReminders(state).filter((reminder) =>
    matchesSearch(reminder.itemId, reminder.text),
  );
  const missedIds = new Set(missed.map((reminder) => reminder.id));
  const scheduled = state.reminders
    .filter(
      (reminder) =>
        !reminder.notifiedAt && !missedIds.has(reminder.id) && matchesSearch(reminder.itemId, reminder.text),
    )
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
  const fired = state.reminders
    .filter((reminder) => (reminder.notifiedAt || reminder.lastFiredAt) && matchesSearch(reminder.itemId, reminder.text))
    .sort((a, b) =>
      (b.notifiedAt ?? b.lastFiredAt ?? '').localeCompare(a.notifiedAt ?? a.lastFiredAt ?? ''),
    )
    .slice(0, 25);

  function openItem(itemId: string) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) return;
    if (item.kind === 'plan') navigate('plan', item.id);
    else navigate(item.kind === 'link' ? 'links' : item.kind === 'task' ? 'tasks' : 'notes');
  }

  async function snoozeUntilTomorrow(id: string) {
    const target = fromInputValue(tomorrowAt(9));
    if (!target) return;
    const minutes = Math.max(1, Math.round((new Date(target).getTime() - Date.now()) / 60_000));
    await run(api.snoozeReminder(id, minutes), { success: 'Snoozed until tomorrow 9:00' });
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <span className="toolbar__hint">
          {isDesktop
            ? 'URL Flow keeps running in the system tray so reminders fire even when the window is closed.'
            : 'Preview mode — reminders appear here and in the browser.'}
        </span>
        <div className="toolbar__right">
          <Button variant="primary" icon={<Bell size={14} />} onClick={() => openReminder()}>
            New reminder
          </Button>
        </div>
      </div>

      {missed.length > 0 ? (
        <section className="panel panel--missed">
          <header className="panel__head">
            <div>
              <h3>
                <TriangleAlert size={16} /> Missed
              </h3>
              <p>{missed.length} went past while notifications were unavailable.</p>
            </div>
          </header>
          <div className="panel__body panel__body--flush">
            <ul className="reminder-table">
              {missed.map((reminder) => {
                const item = state.items.find((entry) => entry.id === reminder.itemId);
                const info = reminderInfo(reminder.remindAt);
                return (
                  <li key={reminder.id} className="reminder-row is-missed">
                    <span className="reminder-dot is-due" />
                    <div className="reminder-row__main">
                      <button type="button" className="reminder-row__title" onClick={() => openItem(reminder.itemId)}>
                        {item ? item.title : reminder.text}
                      </button>
                      <span className="reminder-row__meta">
                        Was due {info.absolute}
                        {reminder.repeat !== 'none' ? ` · ${REPEAT_LABEL[reminder.repeat]}` : ''}
                      </span>
                    </div>
                    <span className="reminder-when is-due">Missed</span>
                    <div className="reminder-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(api.snoozeReminder(reminder.id, 60), { success: 'Snoozed 1 hour' })}
                      >
                        1h
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Clock size={12} />}
                        onClick={() => void snoozeUntilTomorrow(reminder.id)}
                      >
                        Tomorrow
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(api.dismissReminder(reminder.id), { success: 'Reminder dismissed' })}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <header className="panel__head">
          <div>
            <h3>Scheduled</h3>
            <p>{scheduled.length === 0 ? 'Nothing scheduled.' : `${scheduled.length} upcoming.`}</p>
          </div>
        </header>
        <div className="panel__body panel__body--flush">
          {scheduled.length === 0 ? (
            <EmptyState
              icon={<Bell size={22} />}
              title={search.trim() ? 'No reminders match' : 'No reminders yet'}
              hint={
                search.trim()
                  ? 'Try another search term, or clear the search.'
                  : 'Add a reminder to any link, plan, task or note and you will get a Windows notification when it is time.'
              }
              action={
                <Button variant="subtle" size="sm" onClick={() => openReminder()}>
                  Schedule one
                </Button>
              }
            />
          ) : (
            <ul className="reminder-table">
              {scheduled.map((reminder) => {
                const item = state.items.find((entry) => entry.id === reminder.itemId);
                const info = reminderInfo(reminder.remindAt);
                return (
                  <li key={reminder.id} className={`reminder-row ${info.due ? 'is-due' : ''}`}>
                    <span className={`reminder-dot ${info.due ? 'is-due' : ''}`} />
                    <div className="reminder-row__main">
                      <button type="button" className="reminder-row__title" onClick={() => openItem(reminder.itemId)}>
                        {item ? item.title : reminder.text}
                      </button>
                      <span className="reminder-row__meta">
                        {item ? (
                          <>
                            <KindIcon kind={item.kind} size={11} /> {item.kind} ·{' '}
                          </>
                        ) : (
                          'Item removed · '
                        )}
                        {info.absolute}
                        {reminder.repeat !== 'none' ? (
                          <span className="repeat-chip">
                            <Repeat size={10} /> {REPEAT_LABEL[reminder.repeat]}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <span className={`reminder-when ${info.due ? 'is-due' : ''}`}>{info.label}</span>
                    <div className="reminder-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(api.snoozeReminder(reminder.id, 10), { success: 'Snoozed 10 minutes' })}
                      >
                        10m
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(api.snoozeReminder(reminder.id, 60), { success: 'Snoozed 1 hour' })}
                      >
                        1h
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Clock size={12} />}
                        onClick={() => void snoozeUntilTomorrow(reminder.id)}
                      >
                        Tomorrow
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void run(api.dismissReminder(reminder.id), { success: 'Reminder dismissed' })}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {fired.length > 0 ? (
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Recently fired</h3>
              <p>Notifications that already happened.</p>
            </div>
          </header>
          <div className="panel__body panel__body--flush">
            <ul className="reminder-table">
              {fired.map((reminder) => {
                const item = state.items.find((entry) => entry.id === reminder.itemId);
                const firedAt = reminder.notifiedAt ?? reminder.lastFiredAt ?? null;
                return (
                  <li key={reminder.id} className="reminder-row reminder-row--past">
                    <BellOff size={15} className="muted-icon" />
                    <div className="reminder-row__main">
                      <button type="button" className="reminder-row__title" onClick={() => openItem(reminder.itemId)}>
                        {item ? item.title : reminder.text}
                      </button>
                      <span className="reminder-row__meta">
                        Fired {reminderInfo(firedAt).absolute}
                        {reminder.repeat !== 'none' ? ` · ${REPEAT_LABEL[reminder.repeat]}` : ''}
                      </span>
                    </div>
                    <div className="reminder-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          void run(api.dismissReminder(reminder.id), {
                            success: reminder.repeat === 'none' ? 'Cleared' : 'Repeat stopped',
                          })
                        }
                      >
                        {reminder.repeat === 'none' ? 'Clear' : 'Stop'}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
