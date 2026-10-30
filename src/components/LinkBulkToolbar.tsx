import { useState } from 'react';
import { Archive, ExternalLink, Tags } from 'lucide-react';
import type { LinkBulkAction, PlanItem } from '../../shared/types';
import { Button } from './ui';

export function LinkBulkToolbar({
  count, visibleCount, plans, busy, canIgnore, onSelectVisible, onClear, onTriage, onOpen,
}: {
  count: number;
  visibleCount: number;
  plans: PlanItem[];
  busy: boolean;
  canIgnore: boolean;
  onSelectVisible: () => void;
  onClear: () => void;
  onTriage: (action: LinkBulkAction) => Promise<boolean>;
  onOpen: () => Promise<void>;
}) {
  const [tagsInput, setTagsInput] = useState('');
  const [planId, setPlanId] = useState('');
  const seenTags = new Set<string>();
  const tags = tagsInput.split(',')
    .map((tag) => tag.trim().replace(/^#+/, '').trim().slice(0, 32))
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seenTags.has(key)) return false;
      seenTags.add(key);
      return true;
    });

  return (
    <section className="link-bulk" aria-label="Bulk link actions" aria-busy={busy}>
      <div className="link-bulk__selection">
        <span className="link-bulk__count" role="status">{count} selected</span>
        <Button size="sm" variant="subtle" disabled={busy || visibleCount === 0} onClick={onSelectVisible}>
          Select visible
        </Button>
        <Button size="sm" variant="ghost" disabled={busy || count === 0} onClick={onClear}>
          Clear selection
        </Button>
      </div>
      {count > 0 ? (
        <div className="link-bulk__actions">
          <form className="link-bulk__group" onSubmit={(event) => {
            event.preventDefault();
            if (!busy && tags.length > 0) {
              void onTriage({ type: 'add-tags', tags }).then((success) => {
                if (success) setTagsInput('');
              });
            }
          }}>
            <input className="input" aria-label="Tags to add" placeholder="Tags, separated by commas"
              value={tagsInput} disabled={busy} onChange={(event) => setTagsInput(event.target.value)} />
            <Button type="submit" size="sm" icon={<Tags size={14} />} disabled={busy || tags.length === 0}>Add tags</Button>
          </form>
          <div className="link-bulk__group">
            <select className="input input--select" aria-label="Plan for selected links" value={planId}
              disabled={busy} onChange={(event) => setPlanId(event.target.value)}>
              <option value="">Choose a plan…</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.title}</option>)}
            </select>
            <Button size="sm" disabled={busy || !plans.some((plan) => plan.id === planId)}
              onClick={() => void onTriage({ type: 'assign-plan', planId })}>Assign plan</Button>
            <Button size="sm" variant="ghost" disabled={busy}
              onClick={() => void onTriage({ type: 'assign-plan', planId: null })}>Clear plan</Button>
          </div>
          <div className="link-bulk__group">
            <Button size="sm" icon={<Archive size={14} />} disabled={busy}
              onClick={() => void onTriage({ type: 'archive' })}>Archive</Button>
            <Button size="sm" icon={<ExternalLink size={14} />} disabled={busy} onClick={() => void onOpen()}>Open</Button>
            <Button size="sm" disabled={busy || !canIgnore}
              title="Ignore every pair in duplicate groups containing selected links"
              onClick={() => void onTriage({ type: 'ignore-matches', keys: [] })}>Ignore matches</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
