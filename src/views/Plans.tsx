import { useMemo, useState } from 'react';
import { Plus, Search, Target } from 'lucide-react';
import { useApp } from '../app-context';
import { PlanCard } from '../components/items';
import { Button, EmptyState, Segmented } from '../components/ui';

type StatusFilter = 'active' | 'paused' | 'done' | 'all';

export function PlansView() {
  const { plans, search, openEditor } = useApp();
  const [status, setStatus] = useState<StatusFilter>('active');

  const counts = useMemo(
    () => ({
      active: plans.filter((plan) => plan.status === 'active').length,
      paused: plans.filter((plan) => plan.status === 'paused').length,
      done: plans.filter((plan) => plan.status === 'done').length,
      all: plans.length,
    }),
    [plans],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return plans
      .filter((plan) => {
        if (status !== 'all' && plan.status !== status) return false;
        if (!query) return true;
        return [plan.title, plan.summary, plan.notes, plan.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const order = { active: 0, paused: 1, done: 2 };
        const delta = order[a.status] - order[b.status];
        return delta !== 0 ? delta : b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [plans, status, search]);

  return (
    <div className="stack">
      <div className="toolbar">
        <Segmented
          options={[
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'paused', label: 'Paused', count: counts.paused },
            { value: 'done', label: 'Done', count: counts.done },
            { value: 'all', label: 'All', count: counts.all },
          ]}
          value={status}
          onChange={(next) => setStatus(next)}
        />
      </div>

      {filtered.length === 0 ? (
        search.trim() ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No plans match"
            hint="Try a different search term or status filter."
          />
        ) : (
          <EmptyState
            icon={<Target size={22} />}
            title={status === 'done' ? 'No completed plans yet' : 'Turn a goal into a plan'}
            hint="A plan holds the notes, checklist steps, links and tasks around one outcome — like “Plan a move” or “Launch a portfolio”."
            action={
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'plan' })}>
                Start a plan
              </Button>
            }
          />
        )
      ) : (
        <div className="card-grid card-grid--plans">
          {filtered.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}
