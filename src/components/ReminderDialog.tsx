import { useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { REPEAT_LABEL, type RepeatRule } from '../../shared/types';
import { useApp } from '../app-context';
import { daysFromNowAt, defaultReminderValue, fromInputValue, toInputValue, tomorrowAt } from '../lib/dates';
import { Button, Field, Modal } from './ui';

export function ReminderDialog() {
  const { reminderOpen, reminderItem } = useApp();
  if (!reminderOpen) return null;
  return <ReminderDialogInner key={reminderItem?.id ?? 'any'} />;
}

function ReminderDialogInner() {
  const { reminderItem, closeReminder, activeItems, remindersById, api, run } = useApp();
  const [itemId, setItemId] = useState(reminderItem?.id ?? '');
  const [when, setWhen] = useState(() => {
    const scheduled = reminderItem ? remindersById.get(reminderItem.id) : undefined;
    return scheduled ? toInputValue(scheduled.remindAt) : defaultReminderValue(60);
  });
  const [repeat, setRepeat] = useState<RepeatRule>(() => {
    const scheduled = reminderItem ? remindersById.get(reminderItem.id) : undefined;
    return scheduled?.repeat ?? 'none';
  });

  const selected = activeItems.find((item) => item.id === itemId);
  const scheduled = itemId ? remindersById.get(itemId) : undefined;
  const sortedItems = [...activeItems].sort((a, b) => a.title.localeCompare(b.title));

  async function save() {
    if (!selected) return;
    const iso = fromInputValue(when);
    if (!iso) return;
    const saved = await run(api.setReminder(selected.id, iso, selected.title, repeat), {
      success: repeat === 'none' ? 'Reminder scheduled' : `${REPEAT_LABEL[repeat]} reminder scheduled`,
    });
    if (saved) closeReminder();
  }

  return (
    <Modal
      title="Set a reminder"
      subtitle="A Windows notification will appear when it is due."
      size="sm"
      onClose={closeReminder}
      footer={
        <>
          {scheduled ? (
            <Button
              variant="ghost"
              icon={<Trash2 size={14} />}
              onClick={() => void run(api.removeReminder(scheduled.id), { success: 'Reminder removed' })}
            >
              Remove
            </Button>
          ) : null}
          <span className="modal__spacer" />
          <Button variant="ghost" onClick={closeReminder}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!selected || !when}>
            Schedule
          </Button>
        </>
      }
    >
      <div className="form">
        {reminderItem ? (
          <div className="reminder-target">
            <Bell size={15} />
            <div>
              <strong>{reminderItem.title}</strong>
              <span>{reminderItem.kind}</span>
            </div>
          </div>
        ) : (
          <Field label="Item">
            <select className="input" value={itemId} onChange={(event) => setItemId(event.target.value)} autoFocus>
              <option value="">Choose a link, plan, task or note…</option>
              {sortedItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.kind} · {item.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Remind me at" hint={scheduled ? 'Scheduling again replaces the current reminder.' : undefined}>
          <input
            className="input"
            type="datetime-local"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
          />
        </Field>

        <Field label="Repeat" hint="Repeating reminders reschedule themselves after they fire.">
          <select
            className="input"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value as RepeatRule)}
          >
            {(Object.keys(REPEAT_LABEL) as RepeatRule[]).map((rule) => (
              <option key={rule} value={rule}>
                {REPEAT_LABEL[rule]}
              </option>
            ))}
          </select>
        </Field>

        <div className="reminder-presets">
          <Button size="sm" variant="subtle" onClick={() => setWhen(defaultReminderValue(60))}>
            In 1 hour
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setWhen(tomorrowAt(9))}>
            Tomorrow 9:00
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setWhen(daysFromNowAt(7, 9))}>
            Next week
          </Button>
        </div>
      </div>
    </Modal>
  );
}
