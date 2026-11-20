import { useState } from 'react';

const sortEntries = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

export default function OrganizationDirectory({ endpoint, title, label, entries, api, onChange }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function resetForm() {
    setEditingId(null);
    setName('');
    setError('');
  }

  async function saveEntry(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { name: name.trim() };
      const saved = editingId === null
        ? await api.post(endpoint, payload)
        : await api.put(`${endpoint}/${editingId}`, payload);
      onChange((current) => sortEntries([...current.filter((entry) => entry.id !== saved.id), saved]));
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`Удалить «${entry.name}» из справочника?`)) return;
    setError('');
    setBusy(true);
    try {
      await api.delete(`${endpoint}/${entry.id}`);
      onChange((current) => current.filter(({ id }) => id !== entry.id));
      if (editingId === entry.id) resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={title} className="min-w-0 rounded-xl bg-white p-4 shadow-lg dark:bg-gray-800 sm:p-6">
      <h2 className="mb-4 text-2xl font-bold text-gray-800 dark:text-gray-100">{title}</h2>
      <form onSubmit={saveEntry} className="space-y-2">
        <label className="block text-base text-gray-700 dark:text-gray-300">
          {label}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
            disabled={busy}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || !name.trim()} className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
            {editingId === null ? 'Добавить' : 'Сохранить название'}
          </button>
          {editingId !== null && (
            <button type="button" onClick={resetForm} disabled={busy} className="rounded bg-gray-600 px-3 py-2 text-white hover:bg-gray-700">
              Отмена
            </button>
          )}
        </div>
      </form>
      {error && <p role="alert" className="mt-3 break-words text-red-700 dark:text-red-300">{error}</p>}
      {entries.length ? (
        <ul className="mt-4 max-h-72 space-y-2 overflow-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-gray-50 p-2 dark:bg-gray-700/30">
              <span className="min-w-0 break-words text-gray-900 dark:text-gray-100">{entry.name}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Переименовать ${entry.name}`}
                  onClick={() => { setEditingId(entry.id); setName(entry.name); setError(''); }}
                  className="rounded bg-blue-100 px-2 py-1 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                >
                  <img src="/edit.png" alt="" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Удалить ${entry.name}`}
                  onClick={() => deleteEntry(entry)}
                  className="rounded bg-red-100 px-2 py-1 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                >
                  <img src="/trash.png" alt="" className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-gray-600 dark:text-gray-400">Справочник пока пуст.</p>
      )}
    </section>
  );
}
