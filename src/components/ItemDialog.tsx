import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Star, Trash2 } from 'lucide-react';
import {
  PLAN_COLORS,
  type ItemDraft,
  type ItemKind,
  type ItemPatch,
  type PlanItem,
  type Priority,
  type Step,
  type TaskItem,
} from '../../shared/types';
import { hostOf, isSafeExternalUrl, normalizeUrl } from '../../shared/url';
import { useApp } from '../app-context';
import { defaultReminderValue, fromDateInput, fromInputValue, toInputValue, tomorrowAt } from '../lib/dates';
import { Button, Field, IconButton, Modal, Segmented } from './ui';
import { Favicon } from './Favicon';
import { usePageMetadata } from './usePageMetadata';

const KIND_OPTIONS: { value: ItemKind; label: string }[] = [
  { value: 'link', label: 'Link' },
  { value: 'plan', label: 'Plan' },
  { value: 'task', label: 'Task' },
  { value: 'note', label: 'Note' },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

export function ItemDialog() {
  const { editor } = useApp();
  if (!editor) return null;
  return <ItemDialogInner key={editor.item?.id ?? `new-${editor.kind}`} />;
}

function ItemDialogInner() {
  const { editor, closeEditor, plans, api, run, remindersById, archiveItem } = useApp();
  const request = editor!;
  const item = request.item;
  const preset = request.preset ?? {};
  const scheduled = item ? remindersById.get(item.id) : undefined;

  const [kind, setKind] = useState<ItemKind>(request.kind);
  const [title, setTitle] = useState(item?.title ?? preset.title ?? '');
  const [url, setUrl] = useState(item?.kind === 'link' ? item.url : preset.url ?? '');
  const [notes, setNotes] = useState(item?.notes ?? preset.notes ?? '');
  const [tagText, setTagText] = useState((item?.tags ?? preset.tags ?? []).join(', '));
  const [planId, setPlanId] = useState<string>(item?.planId ?? preset.planId ?? '');
  const [favorite, setFavorite] = useState(item?.kind === 'link' ? item.favorite : Boolean(preset.favorite));
  const [summary, setSummary] = useState(item?.kind === 'plan' ? item.summary : preset.summary ?? '');
  const [status, setStatus] = useState<'active' | 'paused' | 'done'>(
    item?.kind === 'plan' ? item.status : preset.status ?? 'active',
  );
  const [targetDate, setTargetDate] = useState(
    item?.kind === 'plan' && item.targetDate
      ? new Date(item.targetDate).toISOString().slice(0, 10)
      : preset.targetDate
        ? new Date(preset.targetDate).toISOString().slice(0, 10)
        : '',
  );
  const [color, setColor] = useState(
    item?.kind === 'plan' ? item.color : preset.color ?? PLAN_COLORS[0],
  );
  const [steps, setSteps] = useState<Step[]>(
    item?.kind === 'plan' ? item.steps : preset.steps ?? [],
  );
  const [stepText, setStepText] = useState('');
  const [priority, setPriority] = useState<Priority>(
    item?.kind === 'task' ? item.priority : preset.priority ?? 'normal',
  );
  const [dueAt, setDueAt] = useState(
    item?.kind === 'task' ? toInputValue(item.dueAt) : toInputValue(preset.dueAt ?? null),
  );
  const [done, setDone] = useState(item?.kind === 'task' ? item.done : Boolean(preset.done));
  const [pinned, setPinned] = useState(item?.kind === 'note' ? item.pinned : Boolean(preset.pinned));
  const [reminderAt, setReminderAt] = useState(
    scheduled ? toInputValue(scheduled.remindAt) : toInputValue(preset.reminderAt ?? null),
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const titleEdited = useRef(Boolean(item?.title || (request.metadata === undefined && preset.title)));
  const normalizedUrl = normalizeUrl(url).url;
  const initialUrl = normalizeUrl(item?.kind === 'link' ? item.url : preset.url ?? '').url;
  const usingPrefetched = request.metadata !== undefined && normalizedUrl === initialUrl;
  const preview = usePageMetadata(kind === 'link' && !usingPrefetched ? url : '', api.fetchMetadata);
  const metadata = kind !== 'link' ? null : usingPrefetched ? request.metadata ?? null : preview.metadata ?? (
    normalizedUrl === initialUrl && item?.kind === 'link'
      ? { title: item.title, description: item.description ?? null, siteName: item.siteName ?? null, faviconKey: item.faviconKey ?? null }
      : null
  );
  const fetching = kind === 'link' && !usingPrefetched && preview.fetching;

  useEffect(() => {
    if (kind === 'link' && !titleEdited.current) setTitle(metadata?.title ?? '');
  }, [kind, metadata?.title]);

  const planOptions = useMemo(
    () => plans.filter((plan) => plan.id !== item?.id),
    [plans, item?.id],
  );
  const attachedPlan = item?.planId ? plans.find((plan) => plan.id === item.planId) : null;

  const dialogTitle = item
    ? `Edit ${item.kind}`
    : kind === 'link'
      ? 'Save a link'
      : kind === 'plan'
        ? 'New plan'
        : kind === 'task'
          ? 'New task'
          : 'New note';

  function addStep() {
    const text = stepText.trim();
    if (!text) return;
    setSteps((current) => [...current, { id: `step_${Date.now()}_${current.length}`, text, done: false }]);
    setStepText('');
  }

  async function handleSave() {
    setError('');
    const cleanTitle = title.trim();
    const urlInput = url.trim();
    if (kind === 'link' || item?.kind === 'link') {
      const normalized = normalizeUrl(urlInput);
      if (!normalized.url || !isSafeExternalUrl(normalized.url)) {
        setError('Enter a valid web address, for example https://example.com.');
        return;
      }
    }
    if (item && !cleanTitle) {
      setError('Give this item a title.');
      return;
    }

    const tags = tagText
      .split(',')
      .map((tag) => tag.trim().replace(/^#/, ''))
      .filter(Boolean);
    const reminderIso = fromInputValue(reminderAt);
    setSaving(true);

    try {
      if (item) {
        const patch: ItemPatch = {
          title: cleanTitle || item.title,
          notes,
          tags,
          planId: planId || null,
        };
        if (item.kind === 'link') {
          patch.url = normalizeUrl(urlInput).url;
          patch.favorite = favorite;
          patch.description = metadata?.description ?? null;
          patch.siteName = metadata?.siteName ?? null;
          patch.faviconKey = metadata?.faviconKey ?? null;
        }
        if (item.kind === 'plan') {
          patch.summary = summary;
          patch.status = status;
          patch.targetDate = fromDateInput(targetDate);
          patch.steps = steps;
          patch.color = color;
        }
        if (item.kind === 'task') {
          patch.priority = priority;
          patch.dueAt = fromInputValue(dueAt);
          patch.done = done;
        }
        if (item.kind === 'note') patch.pinned = pinned;

        const updated = await run(api.update(item.id, patch));
        if (!updated) return;

        const previous = scheduled ? toInputValue(scheduled.remindAt) : '';
        if (reminderIso !== fromInputValue(previous)) {
          if (reminderIso) {
            const saved = await run(api.setReminder(item.id, reminderIso, cleanTitle || item.title));
            if (!saved) return;
          } else if (scheduled) {
            const saved = await run(api.removeReminder(scheduled.id));
            if (!saved) return;
          }
        }
        closeEditor();
        return;
      }

      const draft: ItemDraft = {
        kind,
        title: cleanTitle,
        notes,
        tags,
        planId: kind === 'plan' ? null : planId || null,
        reminderAt: reminderIso,
        reminderText: cleanTitle,
      };
      if (kind === 'link') {
        draft.url = normalizeUrl(urlInput).url;
        draft.favorite = favorite;
        draft.description = metadata?.description ?? null;
        draft.siteName = metadata?.siteName ?? null;
        draft.faviconKey = metadata?.faviconKey ?? null;
        if (!cleanTitle) draft.title = hostOf(urlInput) || normalizedFallback(urlInput);
      }
      if (kind === 'plan') {
        draft.title = cleanTitle || 'Untitled plan';
        draft.summary = summary;
        draft.status = status;
        draft.targetDate = fromDateInput(targetDate);
        draft.steps = steps;
        draft.color = color;
      }
      if (kind === 'task') {
        draft.title = cleanTitle || 'Untitled task';
        draft.priority = priority;
        draft.dueAt = fromInputValue(dueAt);
        draft.done = done;
      }
      if (kind === 'note') {
        draft.title = cleanTitle || 'Untitled note';
        draft.pinned = pinned;
      }

      const created = await run(api.create(draft), { success: `${labelFor(kind)} created` });
      if (created) closeEditor();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={dialogTitle}
      subtitle={
        item
          ? `Last updated ${new Date(item.updatedAt).toLocaleString()}`
          : 'Everything is saved locally on this computer.'
      }
      onClose={closeEditor}
      size="lg"
      footer={
        <>
          {item && item.kind !== 'plan' ? (
            <Button
              variant="ghost"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                const result = await archiveItem(item.id, 'Moved to archive');
                if (result) closeEditor();
              }}
            >
              Archive
            </Button>
          ) : null}
          <span className="modal__spacer" />
          <Button variant="ghost" onClick={closeEditor}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save changes' : `Create ${labelFor(kind).toLowerCase()}`}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        {!item ? (
          <Segmented
            options={KIND_OPTIONS}
            value={kind}
            onChange={(next) => {
              setKind(next);
              setError('');
            }}
          />
        ) : null}

        {kind === 'link' ? (
          <div className="field-row">
            <Field label="Web address" hint="Paste any URL — the protocol is added automatically.">
              <input
                className="input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/article"
                autoFocus
                spellCheck={false}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Title" hint={kind === 'link' ? 'Leave empty to use the site name.' : undefined}>
          <input
            className="input"
            value={title}
            onChange={(event) => {
              titleEdited.current = true;
              setTitle(event.target.value);
            }}
            placeholder={
              kind === 'plan'
                ? 'What are you working towards?'
                : kind === 'task'
                  ? 'What needs doing?'
                  : kind === 'note'
                    ? 'Note title'
                    : 'Readable name for this link'
            }
            autoFocus={kind !== 'link'}
          />
        </Field>

        {kind === 'plan' ? (
          <>
            <Field label="Summary" hint="One or two lines about the outcome.">
              <input
                className="input"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Launch a personal site with three case studies"
              />
            </Field>
            <div className="field-row field-row--two">
              <Field label="Status">
                <select
                  className="input"
                  value={status}
                  onChange={(event) => setStatus(event.target.value as 'active' | 'paused' | 'done')}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="done">Done</option>
                </select>
              </Field>
              <Field label="Target date">
                <input
                  className="input"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </Field>
            </div>
            <div className="field">
              <span className="field__label">Plan colour</span>
              <div className="swatches">
                {PLAN_COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`swatch ${color === option ? 'is-active' : ''}`}
                    style={{ background: option }}
                    aria-label={`Colour ${option}`}
                    onClick={() => setColor(option)}
                  >
                    {color === option ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field__label">Actionable steps</span>
              <div className="step-editor">
                {steps.map((step, index) => (
                  <div className="step-editor__row" key={step.id}>
                    <button
                      type="button"
                      className={`step-check ${step.done ? 'is-done' : ''}`}
                      onClick={() =>
                        setSteps((current) =>
                          current.map((entry) =>
                            entry.id === step.id ? { ...entry, done: !entry.done } : entry,
                          ),
                        )
                      }
                      aria-label={step.done ? 'Mark step open' : 'Mark step done'}
                    >
                      {step.done ? <Check size={11} /> : <span>{index + 1}</span>}
                    </button>
                    <input
                      className="input input--bare"
                      value={step.text}
                      onChange={(event) =>
                        setSteps((current) =>
                          current.map((entry) =>
                            entry.id === step.id ? { ...entry, text: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <IconButton
                      label="Remove step"
                      onClick={() => setSteps((current) => current.filter((entry) => entry.id !== step.id))}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                ))}
                <div className="step-editor__add">
                  <input
                    className="input input--bare"
                    value={stepText}
                    onChange={(event) => setStepText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addStep();
                      }
                    }}
                    placeholder="Add a step and press Enter"
                  />
                  <Button size="sm" variant="subtle" icon={<Plus size={13} />} onClick={addStep}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {kind === 'task' ? (
          <>
            <div className="field-row field-row--two">
              <Field label="Due">
                <input
                  className="input"
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </Field>
              <div className="field">
                <span className="field__label">Priority</span>
                <Segmented
                  options={PRIORITIES}
                  value={priority}
                  onChange={(next) => setPriority(next)}
                  size="sm"
                />
              </div>
            </div>
            {item ? (
              <label className="checkbox">
                <input type="checkbox" checked={done} onChange={(event) => setDone(event.target.checked)} />
                <span>Task is completed</span>
              </label>
            ) : null}
          </>
        ) : null}

        {kind === 'note' ? (
          <label className="checkbox">
            <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} />
            <span>Pin this note to the top</span>
          </label>
        ) : null}

        {kind !== 'plan' ? (
          <Field label="Attach to plan" hint={attachedPlan ? `Currently in ${attachedPlan.title}` : undefined}>
            <select className="input" value={planId} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">No plan</option>
              {planOptions.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {kind === 'link' && normalizedUrl && isSafeExternalUrl(normalizedUrl) ? (
          <section className="link-preview" aria-label="Link preview" aria-live="polite" aria-busy={fetching}>
            <Favicon url={url} faviconKey={metadata?.faviconKey} />
            <div className="link-preview__body">
              <span className="link-preview__site">{metadata?.siteName || hostOf(url)}</span>
              {metadata?.description ? <p className="link-preview__description">{metadata.description}</p> : null}
              {fetching ? <p className="field__hint" role="status">Reading page preview…</p> : !metadata ? (
                <p className="field__hint" role="status">Preview unavailable. You can still save this link.</p>
              ) : null}
            </div>
          </section>
        ) : null}

        <Field label={kind === 'note' ? 'Note' : 'Notes'}>
          <textarea
            className="input textarea"
            rows={kind === 'note' ? 10 : 4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              kind === 'note'
                ? 'Write freely — this is your space for details, quotes and ideas.'
                : 'Context, decisions, follow-ups…'
            }
          />
        </Field>

        <Field label="Tags" hint="Comma separated, e.g. design, reading, client">
          <input
            className="input"
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            placeholder="reading, research"
          />
        </Field>

        <div className="field">
          <span className="field__label">Reminder</span>
          <div className="reminder-field-row">
            <input
              className="input"
              type="datetime-local"
              value={reminderAt}
              onChange={(event) => setReminderAt(event.target.value)}
            />
            <div className="reminder-presets">
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setReminderAt(defaultReminderValue(60))}
                type="button"
              >
                In 1 hour
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => setReminderAt(tomorrowAt(9))}
                type="button"
              >
                Tomorrow 9:00
              </Button>
              {reminderAt ? (
                <Button size="sm" variant="ghost" onClick={() => setReminderAt('')} type="button">
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
          <span className="field__hint">Windows shows a notification when it is due.</span>
        </div>

        {kind === 'link' ? (
          <label className="checkbox">
            <input type="checkbox" checked={favorite} onChange={(event) => setFavorite(event.target.checked)} />
            <span className="checkbox__inline">
              <Star size={14} /> Mark as favourite
            </span>
          </label>
        ) : null}

        {error ? <div className="form-error">{error}</div> : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function labelFor(kind: ItemKind): string {
  return kind === 'link' ? 'Link' : kind === 'plan' ? 'Plan' : kind === 'task' ? 'Task' : 'Note';
}

function normalizedFallback(raw: string): string {
  return raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function planTaskCount(plan: PlanItem, tasks: TaskItem[]): number {
  return tasks.filter((task) => task.planId === plan.id).length;
}
