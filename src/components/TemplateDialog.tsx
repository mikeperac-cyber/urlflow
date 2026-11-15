import { useState } from 'react';
import { LayoutTemplate, Trash2 } from 'lucide-react';
import { useApp } from '../app-context';
import { Button, Field, IconButton, Modal } from './ui';

function dateInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function TemplateDialog({ onClose }: { onClose: () => void }) {
  const { state, api, run, navigate, pushToast } = useApp();
  const templates = state.planTemplates;
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '');
  const selected = templates.find((entry) => entry.id === selectedId) ?? templates[0];

  const today = new Date();
  const weekAhead = new Date(today.getTime() + 7 * 86_400_000);
  const [title, setTitle] = useState(selected?.name ?? '');
  const [startDate, setStartDate] = useState(dateInput(today));
  const [endDate, setEndDate] = useState(dateInput(weekAhead));
  const [saving, setSaving] = useState(false);

  async function removeTemplate(templateId: string) {
    const saved = await run(api.deletePlanTemplate(templateId), { success: 'Template deleted' });
    if (saved) {
      const remaining = saved.planTemplates;
      if (selectedId === templateId) {
        setSelectedId(remaining[0]?.id ?? '');
        setTitle(remaining[0]?.name ?? '');
      }
    }
  }

  async function createPlan() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const result = await run(api.createPlanFromTemplate(selected.id, { title, startDate, endDate }));
      if (!result) return;
      pushToast('Plan created from template', 'success');
      navigate('plan', result.planId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New plan from template"
      subtitle="Template steps and tasks are dated backwards from the end date."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <span className="modal__spacer" />
          <Button
            variant="primary"
            icon={<LayoutTemplate size={14} />}
            disabled={!selected || saving || !title.trim()}
            onClick={() => void createPlan()}
          >
            {saving ? 'Creating...' : 'Create plan'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {templates.length === 0 ? (
          <p className="muted">Save a plan as a template first, then it appears here.</p>
        ) : (
          <ul className="template-list">
            {templates.map((template) => (
              <li key={template.id} className={`template-row ${template.id === selected?.id ? 'is-selected' : ''}`}>
                <button
                  type="button"
                  className="template-row__pick"
                  aria-pressed={template.id === selected?.id}
                  onClick={() => {
                    setSelectedId(template.id);
                    setTitle(template.name);
                  }}
                >
                  <strong>{template.name}</strong>
                  <span>
                    {template.steps.length} {template.steps.length === 1 ? 'step' : 'steps'} ·{' '}
                    {template.tasks.length} {template.tasks.length === 1 ? 'task' : 'tasks'} ·{' '}
                    {template.linkIds.length} {template.linkIds.length === 1 ? 'link' : 'links'}
                  </span>
                </button>
                <IconButton label={`Delete template ${template.name}`} onClick={() => void removeTemplate(template.id)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {selected ? (
          <>
            <Field label="Plan title">
              <input
                className="input"
                value={title}
                maxLength={300}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={selected.name}
                autoFocus
              />
            </Field>
            <div className="field-row field-row--two">
              <Field label="Start date">
                <input
                  className="input"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </Field>
              <Field label="End date" hint="Steps and tasks are scheduled before this date.">
                <input
                  className="input"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </Field>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
