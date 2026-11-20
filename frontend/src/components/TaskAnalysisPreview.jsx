import { useState } from 'react';

function currentAssessment(task) {
  const assessment = task.assessment;
  if (assessment?.title === task.title.trim() && assessment.description === task.description.trim()) {
    return assessment;
  }
  return null;
}

export function taskAnalysisPayload(task) {
  const assessment = currentAssessment(task);
  if (!assessment) return {};
  return {
    analysis_receipt: assessment.receipt,
    estimated_points: assessment.points === '' ? undefined : Number(assessment.points),
  };
}

async function fetchAssessment(api, title, description) {
  const { analysis, receipt } = await api.post('/task-analysis', { title, description });
  return { title, description, analysis, receipt, points: String(analysis.estimated_points) };
}

export async function assessTaskBatch(api, tasks) {
  const assessed = [];
  for (const task of tasks) {
    const title = task.title.trim();
    const assessment = currentAssessment(task) || await fetchAssessment(api, title, task.description.trim());
    if (assessment.points !== '' && (!Number.isInteger(Number(assessment.points)) || assessment.points < 1 || assessment.points > 100)) {
      throw new Error(`Укажите целое число от 1 до 100 для задачи «${title}».`);
    }
    assessed.push({ ...task, assessment });
  }
  return assessed;
}

export default function TaskAnalysisPreview({ task, api, id, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assessment = currentAssessment(task);
  const title = task.title.trim();
  const description = task.description.trim();

  async function preview() {
    setBusy(true);
    setError('');
    try {
      onUpdate(await fetchAssessment(api, title, description));
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
      <button
        type="button"
        className="rounded-lg border border-blue-500 px-3 py-2 text-blue-700 disabled:opacity-50 dark:text-blue-300"
        onClick={preview}
        disabled={busy || !title || !description}
      >
        {busy ? 'Оцениваем задачу…' : assessment ? 'Оценить заново' : 'Оценить сложность'}
      </button>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {assessment && (
        <div className="space-y-1" aria-live="polite">
          <p>{assessment.analysis.explanation}</p>
          {assessment.analysis.model_used !== 'disabled' && (
            <p>Уверенность модели: {Math.round(assessment.analysis.confidence * 100)}%</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={id}>Баллы за задачу</label>
            <input
              id={id}
              type="number"
              min={1}
              max={100}
              step={1}
              value={assessment.points}
              onChange={(event) => onUpdate({ ...assessment, points: event.target.value })}
              className="w-24 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            />
          </div>
        </div>
      )}
    </div>
  );
}
