import { useState } from 'react';
import { GitMerge } from 'lucide-react';
import type { AnyItem, MergeFieldChoices } from '../../shared/types';
import { formatDate } from '../lib/dates';
import { planProgress } from '../../shared/core';
import { displayUrl } from '../../shared/url';
import { useApp } from '../app-context';
import { relativeTime } from '../lib/dates';
import { Button, KindIcon, Modal } from './ui';

export function MergeDialog() {
  const { mergeIds } = useApp();
  if (!mergeIds || mergeIds.length < 2) return null;
  return <MergeInner key={mergeIds.join('|')} ids={mergeIds} />;
}

function MergeInner({ ids }: { ids: string[] }) {
  const { state, closeMerge, api, run, showUndoToast } = useApp();
  const items = ids
    .map((id) => state.items.find((item) => item.id === id))
    .filter((item): item is AnyItem => Boolean(item));

  const richness = (item: AnyItem) =>
    item.notes.length +
    item.tags.length * 20 +
    (item.planId ? 50 : 0) +
    (item.kind === 'plan' ? item.steps.length * 30 : 0) +
    (item.kind === 'link' && item.favorite ? 10 : 0);
  const [keeperId, setKeeperId] = useState(
    [...items].sort((a, b) => richness(b) - richness(a))[0]?.id ?? '',
  );
  const [merging, setMerging] = useState(false);
  const [titleFrom, setTitleFrom] = useState(keeperId);
  const [notesChoice, setNotesChoice] = useState('merge');
  const [dateChoice, setDateChoice] = useState('merge');
  const primary = items.find((item) => item.id === keeperId) ?? items[0];
  const others = items.filter((item) => item.id !== primary?.id);

  if (!primary || items.length < 2) {
    return (
      <Modal title="Nothing to merge" onClose={closeMerge} size="sm">
        <p className="muted">These items are no longer available.</p>
      </Modal>
    );
  }

  const tags = [...new Set(items.flatMap((item) => item.tags))];
  const notesLength = items.reduce((total, item) => total + item.notes.trim().length, 0);
  const stepCount = items.reduce(
    (total, item) => total + (item.kind === 'plan' ? item.steps.length : 0),
    0,
  );
  const reminderCount = state.reminders.filter((reminder) => ids.includes(reminder.itemId)).length;
  const dateField = primary.kind === 'plan' ? 'Target date' : primary.kind === 'task' ? 'Due' : null;
  const dateValue = (item: AnyItem) =>
    item.kind === 'plan' ? item.targetDate : item.kind === 'task' ? item.dueAt : null;
  const pairwise = items.length === 2;

  function fieldChoices(): MergeFieldChoices | undefined {
    if (!pairwise || !primary) return undefined;
    const other = others[0];
    return {
      titleFromId: titleFrom === other.id ? other.id : primary.id,
      notesMode:
        notesChoice === 'merge'
          ? 'merge'
          : notesChoice === other.id
            ? 'other'
            : 'primary',
      dateMode:
        dateChoice === 'merge'
          ? 'merge'
          : dateChoice === 'none'
            ? 'none'
            : dateChoice === other.id
              ? 'other'
              : 'primary',
    };
  }

  async function merge() {
    setMerging(true);
    try {
      const result = await run(
        api.mergeMany(
          primary.id,
          others.map((other) => other.id),
          pairwise ? fieldChoices() : undefined,
        ),
      );
      if (!result) return;
      showUndoToast(`Merged ${items.length} ${primary.kind}s into one`);
      closeMerge();
    } finally {
      setMerging(false);
    }
  }

  return (
    <Modal
      title={`Merge ${items.length} ${primary.kind}s`}
      subtitle="Data from every item is combined into the one you keep."
      onClose={closeMerge}
      size="md"
      footer={
        <>
          <span className="modal__footer-note">
            {others.length} {others.length === 1 ? 'item' : 'items'} will be removed after merging.
          </span>
          <span className="modal__spacer" />
          <Button variant="ghost" onClick={closeMerge}>
            Cancel
          </Button>
          <Button variant="primary" icon={<GitMerge size={14} />} onClick={() => void merge()} disabled={merging}>
            {merging ? 'Merging…' : 'Merge and keep one'}
          </Button>
        </>
      }
    >
      <div className="form">
        <span className="field__label">Keep this item</span>
        <div className="merge-options">
          {items.map((item) => (
            <label key={item.id} className={`merge-option ${keeperId === item.id ? 'is-selected' : ''}`}>
              <input
                type="radio"
                name="merge-keeper"
                value={item.id}
                checked={keeperId === item.id}
                onChange={() => setKeeperId(item.id)}
              />
              <span className="merge-option__icon">
                <KindIcon kind={item.kind} size={15} />
              </span>
              <span className="merge-option__body">
                <strong>{item.title}</strong>
                <span>
                  {item.kind === 'link'
                    ? displayUrl(item.url)
                    : item.kind === 'plan'
                      ? `${planProgress(item).done}/${planProgress(item).total} steps · ${item.summary || 'No summary'}`
                      : item.notes
                        ? item.notes.slice(0, 90)
                        : 'No notes'}
                </span>
                <span className="merge-option__meta">
                  updated {relativeTime(item.updatedAt)} · {item.tags.length} tags
                  {item.notes ? ` · ${item.notes.length} chars of notes` : ''}
                </span>
              </span>
              {keeperId === item.id ? <span className="merge-option__badge">Keep</span> : null}
            </label>
          ))}
        </div>

        {pairwise ? (
          <div className="merge-fields">
            <h4>Choose what survives</h4>
            <div className="merge-field">
              <span className="merge-field__label">Title</span>
              <div className="merge-choice">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`merge-choice__item ${titleFrom === item.id ? 'is-active' : ''}`}
                    onClick={() => setTitleFrom(item.id)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="merge-field">
              <span className="merge-field__label">Notes</span>
              <div className="merge-choice">
                <button
                  type="button"
                  className={`merge-choice__item ${notesChoice === 'merge' ? 'is-active' : ''}`}
                  onClick={() => setNotesChoice('merge')}
                >
                  Both, joined
                </button>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`merge-choice__item ${notesChoice === item.id ? 'is-active' : ''}`}
                    onClick={() => setNotesChoice(item.id)}
                  >
                    Only “{item.title}”
                  </button>
                ))}
              </div>
            </div>
            {dateField ? (
              <div className="merge-field">
                <span className="merge-field__label">{dateField}</span>
                <div className="merge-choice">
                  <button
                    type="button"
                    className={`merge-choice__item ${dateChoice === 'merge' ? 'is-active' : ''}`}
                    onClick={() => setDateChoice('merge')}
                  >
                    Earliest available
                  </button>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`merge-choice__item ${dateChoice === item.id ? 'is-active' : ''}`}
                      onClick={() => setDateChoice(item.id)}
                    >
                      {dateValue(item) ? formatDate(dateValue(item)) : 'No date'}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`merge-choice__item ${dateChoice === 'none' ? 'is-active' : ''}`}
                    onClick={() => setDateChoice('none')}
                  >
                    No date
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="merge-preview">
          <h4>What the merged item keeps</h4>
          <ul>
            <li>
              Title: <strong>{primary.title}</strong>
            </li>
            <li>Notes from all items, joined ({notesLength} characters)</li>
            <li>
              {tags.length} {tags.length === 1 ? 'tag' : 'tags'} combined
            </li>
            {primary.kind === 'plan' ? <li>{stepCount} checklist steps in total</li> : null}
            {reminderCount > 0 ? <li>{reminderCount} reminder(s) moved to the kept item</li> : null}
            <li>Any attached tasks, links or notes stay linked to the kept item</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}
