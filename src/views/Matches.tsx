import { useState } from 'react';
import { Check, GitMerge, RotateCcw, Sparkles } from 'lucide-react';
import type { AnyItem } from '../../shared/types';
import { matchKey } from '../../shared/types';
import { displayUrl } from '../../shared/url';
import { useApp } from '../app-context';
import { Button, EmptyState, KindIcon } from '../components/ui';
import { relativeTime } from '../lib/dates';

export function MatchesView() {
  const { matches, state, openMerge, openEditor, navigate, api, run } = useApp();
  const [showIgnored, setShowIgnored] = useState(false);
  const total = matches.duplicates.length + matches.related.length;

  function openItem(item: AnyItem) {
    if (item.kind === 'plan') navigate('plan', item.id);
    else openEditor({ kind: item.kind, item });
  }

  const ignoredPairs = state.ignoredMatches
    .map((key) => {
      const [aId, bId] = key.split('|');
      const a = state.items.find((item) => item.id === aId);
      const b = state.items.find((item) => item.id === bId);
      return a && b ? { key, a, b } : null;
    })
    .filter((pair): pair is { key: string; a: AnyItem; b: AnyItem } => Boolean(pair));

  return (
    <div className="stack">
      <section className="panel matches-intro">
        <div className="matches-intro__icon">
          <Sparkles size={18} />
        </div>
        <div>
          <h3>Look for overlap, merge what is the same</h3>
          <p>
            URL Flow compares addresses, titles and note text locally. Merging keeps one item and folds in
            the notes, tags, checklist steps and reminders of the others.
          </p>
        </div>
        <div className="matches-intro__stats">
          <span>
            <strong>{matches.duplicates.length}</strong> duplicate {matches.duplicates.length === 1 ? 'group' : 'groups'}
          </span>
          <span>
            <strong>{matches.related.length}</strong> related {matches.related.length === 1 ? 'pair' : 'pairs'}
          </span>
        </div>
      </section>

      {total === 0 ? (
        <EmptyState
          icon={<Check size={24} />}
          title="Nothing to review"
          hint="No probable duplicates or closely related items right now. Save more links and notes — anything that looks repeated will show up here."
        />
      ) : null}

      {matches.duplicates.length > 0 ? (
        <div className="stack stack--tight">
          <h2 className="section-title">Possible duplicates</h2>
          {matches.duplicates.map((group) => {
            const items = group.ids
              .map((id) => state.items.find((item) => item.id === id))
              .filter((item): item is AnyItem => Boolean(item));
            return (
              <section className="panel match-cluster" key={group.ids.join('|')}>
                <header className="panel__head">
                  <div>
                    <h3>
                      {group.ids.length} {group.kind}s · {Math.round(group.score * 100)}% similar
                    </h3>
                    <p>{group.reason}</p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<GitMerge size={13} />}
                    onClick={() => openMerge(group.ids)}
                  >
                    Merge…
                  </Button>
                </header>
                <div className="panel__body panel__body--flush">
                  {items.map((item) => (
                    <button key={item.id} type="button" className="match-item" onClick={() => openItem(item)}>
                      <span className="match-item__icon">
                        <KindIcon kind={item.kind} size={14} />
                      </span>
                      <span className="match-item__body">
                        <strong>{item.title}</strong>
                        <span>
                          {item.kind === 'link' ? displayUrl(item.url) : item.notes.slice(0, 100) || 'No notes'}
                        </span>
                      </span>
                      <span className="match-item__meta">updated {relativeTime(item.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {matches.related.length > 0 ? (
        <div className="stack stack--tight">
          <h2 className="section-title">Related items</h2>
          {matches.related.slice(0, 6).map((pair) => {
            const a = state.items.find((item) => item.id === pair.aId);
            const b = state.items.find((item) => item.id === pair.bId);
            if (!a || !b) return null;
            const key = matchKey(a.id, b.id);
            return (
              <section className="panel match-pair" key={key}>
                <div className="match-pair__items">
                  {[a, b].map((item) => (
                    <button key={item.id} type="button" className="match-item match-item--plain" onClick={() => openItem(item)}>
                      <span className="match-item__icon">
                        <KindIcon kind={item.kind} size={14} />
                      </span>
                      <span className="match-item__body">
                        <strong>{item.title}</strong>
                        <span>
                          {item.kind === 'link' ? displayUrl(item.url) : item.notes.slice(0, 70) || 'No notes'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="match-pair__side">
                  <span className="match-score">{Math.round(pair.score * 100)}%</span>
                  <span className="match-reason">{pair.reason}</span>
                  <div className="match-pair__actions">
                    <Button size="sm" variant="subtle" icon={<GitMerge size={13} />} onClick={() => openMerge([a.id, b.id])}>
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void run(api.ignoreMatch(key), { success: 'Marked as not a match' })}
                    >
                      Not a match
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {ignoredPairs.length > 0 ? (
        <section className="panel">
          <header className="panel__head">
            <div>
              <h3>Dismissed matches</h3>
              <p>{ignoredPairs.length} pairs you marked as different.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowIgnored((value) => !value)}>
              {showIgnored ? 'Hide' : 'Show'}
            </Button>
          </header>
          {showIgnored ? (
            <div className="panel__body panel__body--flush">
              {ignoredPairs.map(({ key, a, b }) => (
                <div key={key} className="match-item match-item--static">
                  <span className="match-item__icon">
                    <KindIcon kind={a.kind} size={14} />
                  </span>
                  <span className="match-item__body">
                    <strong>
                      {a.title} <span className="muted">↔</span> {b.title}
                    </strong>
                    <span>{relativeTime(a.updatedAt)}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RotateCcw size={12} />}
                    onClick={() => void run(api.unignoreMatch(key), { success: 'Match restored' })}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
