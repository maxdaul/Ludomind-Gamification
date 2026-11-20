const TaskDifficultyChart = ({ stats }) => {
  const { medium_difficulty_min = 25, medium_difficulty_max = 75 } = stats;
  const groups = [
    { label: `Лёгкие (< ${medium_difficulty_min} баллов)`, count: Number(stats.easy_tasks_count) || 0, color: '#0ea5e9' },
    { label: `Средние (${medium_difficulty_min}–${medium_difficulty_max} баллов)`, count: Number(stats.medium_tasks_count) || 0, color: '#f59e0b' },
    { label: `Сложные (> ${medium_difficulty_max} баллов)`, count: Number(stats.hard_tasks_count) || 0, color: '#8b5cf6' },
  ];
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  let start = 0;
  const segments = groups.map((group) => {
    const end = start + (total ? (group.count / total) * 100 : 0);
    const segment = `${group.color} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70" aria-labelledby="task-difficulty-title">
      <h2 id="task-difficulty-title" className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Выполненные задачи по сложности
      </h2>
      {total > 0 ? (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div role="img" aria-label={groups.map((group) => `${group.label}: ${group.count}`).join('; ')}
            className="h-44 w-44 shrink-0 self-center rounded-full"
            style={{ background: `conic-gradient(${segments.join(', ')})` }} />
          <dl className="space-y-3 text-base text-gray-700 dark:text-gray-200">
            {groups.map((group) => (
              <div key={group.label} className="flex items-center gap-3">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: group.color }} />
                <dt>{group.label}</dt><dd className="ml-auto font-semibold tabular-nums">{group.count}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : <p className="text-base text-gray-600 dark:text-gray-400">Нет выполненных задач для построения диаграммы.</p>}
    </section>
  );
};

export default TaskDifficultyChart;
