import { useEffect, useState } from 'react';
import { Activity, ExternalLink } from 'lucide-react';
import { isBrokenHealthCheck, type LinkItem } from '../../shared/types';
import { useApp } from '../app-context';
import { Button, Modal } from './ui';

export function LinkHealthDialog() {
  const {
    healthDialog,
    closeHealthDialog,
    links,
    healthResults,
    healthRunning,
    runHealthCheck,
    api,
    run,
  } = useApp();
  const [checkedIds, setCheckedIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (healthDialog !== null) setCheckedIds(null);
  }, [healthDialog]);

  if (healthDialog === null) return null;

  const selectedScope = healthDialog.length > 0;
  const targets: LinkItem[] = selectedScope
    ? links.filter((link) => healthDialog.includes(link.id))
    : links;
  const reported = checkedIds
    ? checkedIds
      .map((id) => links.find((link) => link.id === id))
      .filter((link): link is LinkItem => Boolean(link))
    : [];
  const brokenCount = reported.filter((link) => {
    const result = healthResults[link.id];
    return result ? isBrokenHealthCheck(result) : false;
  }).length;
  const finished = checkedIds !== null && !healthRunning;

  async function start(ids: string[]) {
    setCheckedIds(ids);
    await runHealthCheck(ids);
  }

  const prompt = selectedScope
    ? targets.length === 1 ? 'Check 1 selected link' : `Check ${targets.length} selected links`
    : targets.length === 1 ? 'Check 1 link' : `Check ${targets.length} links`;

  return (
    <Modal
      title="Check link health"
      subtitle={
        healthRunning
          ? 'Checking links...'
          : finished
            ? `Checked ${reported.length} ${reported.length === 1 ? 'link' : 'links'} · ${brokenCount} ${brokenCount === 1 ? 'looks' : 'look'} broken`
            : 'URL Flow sends one request per link. Nothing is downloaded or saved.'
      }
      onClose={closeHealthDialog}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={closeHealthDialog}>
            {checkedIds ? 'Close' : 'Cancel'}
          </Button>
          <span className="modal__spacer" />
          {checkedIds ? (
            <Button variant="subtle" disabled={healthRunning} onClick={() => void start(checkedIds)}>
              {healthRunning ? 'Checking...' : 'Check again'}
            </Button>
          ) : (
            <>
              {selectedScope && targets.length < links.length ? (
                <Button
                  variant="subtle"
                  disabled={links.length === 0}
                  onClick={() => void start(links.map((link) => link.id))}
                >
                  Check all {links.length}
                </Button>
              ) : null}
              <Button
                variant="primary"
                icon={<Activity size={14} />}
                disabled={targets.length === 0}
                onClick={() => void start(targets.map((link) => link.id))}
              >
                {prompt}
              </Button>
            </>
          )}
        </>
      }
    >
      {links.length === 0 ? (
        <p className="muted">Save a link first, then URL Flow can check whether it still opens.</p>
      ) : !checkedIds ? (
        <p className="muted">
          {selectedScope
            ? `This checks ${targets.length} of your ${links.length} links.`
            : `This checks all ${links.length} links in your library.`}{' '}
          Unreachable pages are listed first so you can fix or archive them.
        </p>
      ) : (
        <ul className="health-list">
          {reported
            .slice()
            .sort((a, b) => {
              const left = healthResults[a.id];
              const right = healthResults[b.id];
              const leftBroken = left ? isBrokenHealthCheck(left) : false;
              const rightBroken = right ? isBrokenHealthCheck(right) : false;
              if (leftBroken !== rightBroken) return leftBroken ? -1 : 1;
              return a.title.localeCompare(b.title);
            })
            .map((link) => {
              const result = healthResults[link.id];
              const broken = result ? isBrokenHealthCheck(result) : false;
              return (
                <li
                  key={link.id}
                  className={`health-row ${result ? (broken ? 'is-broken' : 'is-ok') : ''}`}
                >
                  <span className="health-row__status">
                    {result
                      ? broken
                        ? result.status === 'error' ? 'Unreachable' : `Error ${result.status}`
                        : `OK ${result.status}`
                      : healthRunning ? 'Checking' : 'Not checked'}
                  </span>
                  <div className="health-row__main">
                    <strong>{link.title}</strong>
                    <span title={result?.message ?? link.url}>{result?.message ?? link.url}</span>
                    {result?.finalUrl && result.finalUrl !== link.url ? (
                      <em className="health-row__moved">Moved to {result.finalUrl}</em>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ExternalLink size={13} />}
                    onClick={() => void run(api.openLink(link.id))}
                  >
                    Open
                  </Button>
                </li>
              );
            })}
        </ul>
      )}
    </Modal>
  );
}
