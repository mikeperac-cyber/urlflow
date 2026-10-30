import { useMemo, useState } from 'react';
import { CheckSquare, Plus, Search } from 'lucide-react';
import type { Priority, TaskItem } from '../../shared/types';
import { useApp } from '../app-context';
import { TaskRow } from '../components/items';
import { Button, EmptyState, Segmented } from '../components/ui';
import { isBeforeToday, isDueToday } from '../lib/dates';

type Filter = 'open' | 'done' | 'all';

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export function TasksView() {
  const { tasks, plans, search, openEditor, api, run } = useApp();
  const [filter, setFilter] = useState<Filter>('open');
  const [planFilter, setPlanFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [quick, setQuick] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filter === 'open' && task.done) return false;
      if (filter === 'done' && !task.done) return false;
      if (planFilter === 'none' && task.planId) return false;
      if (planFilter !== 'all' && planFilter !== 'none' && task.planId !== planFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (!query) return true;
      return [task.title, task.notes, task.tags.join(' ')].join(' ').toLowerCase().includes(query);
    });
  }, [tasks, filter, planFilter, priorityFilter, search]);

  const openTasks = tasks.filter((task) => !task.done);
  const overdue = openTasks.filter((task) => isBeforeToday(task.dueAt));
  const dueToday = openTasks.filter((task) => !isBeforeToday(task.dueAt) && isDueToday(task.dueAt));

  const groups = useMemo(() => {
    const sortTasks = (list: TaskItem[]) =>
      [...list].sort((a, b) => {
        if (a.done !== b.done) return Number(a.done) - Number(b.done);
        const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDelta !== 0) return priorityDelta;
        return (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999');
      });

    if (filter === 'done') {
      return [{ key: 'done', label: 'Completed', tasks: sortTasks(filtered) }];
    }

    const overdueList = filtered.filter((task) => !task.done && isBeforeToday(task.dueAt));
    const todayList = filtered.filter(
      (task) => !task.done && !isBeforeToday(task.dueAt) && isDueToday(task.dueAt),
    );
    const laterList = filtered.filter((task) => !task.done && Boolean(task.dueAt) && !isDueToday(task.dueAt));
    const noneList = filtered.filter((task) => !task.done && !task.dueAt);
    const doneList = filtered.filter((task) => task.done);

    const result = [
      { key: 'overdue', label: 'Overdue', tasks: sortTasks(overdueList) },
      { key: 'today', label: 'Today', tasks: sortTasks(todayList) },
      { key: 'later', label: 'Next', tasks: sortTasks(laterList) },
      { key: 'none', label: 'No due date', tasks: sortTasks(noneList) },
      { key: 'done', label: 'Completed', tasks: sortTasks(doneList) },
    ];
    return result.filter((group) => group.tasks.length > 0);
  }, [filtered, filter]);

  async function quickAdd() {
    const text = quick.trim();
    if (!text) return;
    const saved = await run(
      api.create({
        kind: 'task',
        title: text,
        planId: planFilter !== 'all' && planFilter !== 'none' ? planFilter : null,
      }),
    );
    if (saved) setQuick('');
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <Segmented
          options={[
            { value: 'open', label: 'Open', count: openTasks.length },
            { value: 'done', label: 'Completed', count: tasks.length - openTasks.length },
            { value: 'all', label: 'All', count: tasks.length },
          ]}
          value={filter}
          onChange={(next) => setFilter(next)}
        />
        <div className="toolbar__right">
          <select className="input input--select" value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
            <option value="all">All plans</option>
            <option value="none">No plan</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.title}
              </option>
            ))}
          </select>
          <select
            className="input input--select"
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as 'all' | Priority)}
          >
            <option value="all">Any priority</option>
            <option value="high">High priority</option>
            <option value="normal">Normal priority</option>
            <option value="low">Low priority</option>
          </select>
        </div>
      </div>

      <div className="quick-add panel">
        <Plus size={15} />
        <input
          value={quick}
          onChange={(event) => setQuick(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void quickAdd();
            }
          }}
          placeholder="Add a task and press Enter…"
          aria-label="Quick add task"
        />
        <Button size="sm" variant="ghost" onClick={() => openEditor({ kind: 'task' })}>
          Add details
        </Button>
      </div>

      <div className="summary-strip">
        <span>
          <strong>{openTasks.length}</strong> open
        </span>
        <span className={overdue.length > 0 ? 'text-danger' : ''}>
          <strong>{overdue.length}</strong> overdue
        </span>
        <span>
          <strong>{dueToday.length}</strong> due today
        </span>
        {search.trim() ? <span>Filtered by “{search.trim()}”</span> : null}
      </div>

      {filtered.length === 0 ? (
        search.trim() || priorityFilter !== 'all' || planFilter !== 'all' ? (
          <EmptyState
            icon={<Search size={22} />}
            title="No tasks match"
            hint="Adjust the filters or clear the search to see more."
            action={
              <Button
                size="sm"
                variant="subtle"
                onClick={() => {
                  setPriorityFilter('all');
                  setPlanFilter('all');
                }}
              >
                Reset filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<CheckSquare size={22} />}
            title={filter === 'done' ? 'Nothing completed yet' : 'No tasks yet'}
            hint="Tasks are the single actions that move a plan forward. Add one above, or give it a due date and a reminder."
            action={
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'task' })}>
                Create a task
              </Button>
            }
          />
        )
      ) : (
        <div className="stack stack--tight">
          {groups.map((group) => (
            <section className="panel" key={group.key}>
              <header className="panel__head panel__head--compact">
                <h3 className={group.key === 'overdue' ? 'text-danger' : ''}>
                  {group.label} <span className="panel__count">{group.tasks.length}</span>
                </h3>
              </header>
              <div className="panel__body panel__body--flush">
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
