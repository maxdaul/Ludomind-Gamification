import React, { useEffect, useMemo, useState } from 'react';
import { useApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext.jsx';
import TaskDifficultyChart from '../components/TaskDifficultyChart.jsx';

const GRAFANA_BASE_URL = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000';

const StatisticsPage = () => {
  const api = useApi();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [userSearch, setUserSearch] = useState('');
  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true });
  }, [isAuthenticated, navigate]);

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const isManagerOrAdmin = user && (user.role === 'admin' || user.role === 'manager');

  const [enrolPanelOpen, setEnrolPanelOpen] = useState(false);
  const [moodleCourses, setMoodleCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [enrolSubmitting, setEnrolSubmitting] = useState(false);
  const [enrolMessage, setEnrolMessage] = useState({ type: '', text: '' });

  const [statsMoodleCourses, setStatsMoodleCourses] = useState([]);
  const [statsCoursesLoading, setStatsCoursesLoading] = useState(false);
  const [statsCoursesError, setStatsCoursesError] = useState('');
  const [statsCourseId, setStatsCourseId] = useState('');
  const [moodleRevision, setMoodleRevision] = useState(0);
  const [completionInfo, setCompletionInfo] = useState(null);
  const [completionLoading, setCompletionLoading] = useState(false);
  const [completionError, setCompletionError] = useState('');

  const matchingUsers = users.filter((u) =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLocaleLowerCase('ru-RU')
      .includes(userSearch.trim().toLocaleLowerCase('ru-RU'))
  );
  const userOptions = users.filter((u) => u.id === selectedUserId || matchingUsers.includes(u));
  const selectedUser = users.find((u) => u.id === selectedUserId) || null;

  const targetMoodleUserId = useMemo(() => {
    if (isManagerOrAdmin) {
      return selectedUser?.moodle_id ?? null;
    }
    return user?.moodle_id ?? null;
  }, [isManagerOrAdmin, selectedUser?.moodle_id, user?.moodle_id]);

  const currentProgress = completionInfo?.course_id === Number(statsCourseId)
    && completionInfo.moodle_user_id === targetMoodleUserId ? completionInfo : null;

  const grafanaPanelSrc = useMemo(() => {
    if (!targetMoodleUserId || !statsCourseId || currentProgress?.completion_percent == null) return '';
    const uid = 'moodle-completion';
    const q = new URLSearchParams();
    q.set('orgId', '1');
    q.set('panelId', '2');
    q.set('from', 'now-6h');
    q.set('to', 'now');
    q.set('theme', theme);
    q.set('kiosk', 'true');
    q.set('var-moodle_user_id', String(targetMoodleUserId));
    q.set('var-course_id', String(statsCourseId));
    return `${GRAFANA_BASE_URL.replace(/\/$/, '')}/d-solo/${uid}?${q.toString()}`;
  }, [targetMoodleUserId, statsCourseId, theme, currentProgress?.completion_percent]);

  const loadStats = async (targetUserId = null, targetTagIds = []) => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();

      if (targetUserId && isManagerOrAdmin) {
        params.append('user_id', String(targetUserId));
      }

      if (targetTagIds && targetTagIds.length > 0) {
        targetTagIds.forEach((id) => params.append('tag_ids', String(id)));
      }

      const endpoint = params.toString()
        ? `/users/me/statistics?${params.toString()}`
        : '/users/me/statistics';

      const response = await api.get(endpoint);
      setStats(response);
    } catch (e) {
      console.error('Failed to load statistics', e);
      setError('Не удалось загрузить статистику. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    const hasMoodleContext =
      (!isManagerOrAdmin && user.moodle_id) ||
      (isManagerOrAdmin && selectedUserId && selectedUser?.moodle_id);

    if (!hasMoodleContext) {
      setStatsMoodleCourses([]);
      setStatsCourseId('');
      setStatsCoursesError('');
      setStatsCoursesLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setStatsCoursesLoading(true);
      setStatsCoursesError('');
      try {
        const qs =
          isManagerOrAdmin && selectedUserId
            ? `?user_id=${selectedUserId}`
            : '';
        const list = await api.get(`/moodle/user-courses${qs}`);
        if (cancelled) return;
        const courses = Array.isArray(list) ? list : [];
        setStatsMoodleCourses(courses);
        setStatsCourseId((current) => courses.some((course) => String(course.id) === current) ? current : '');
      } catch (e) {
        if (!cancelled) {
          setStatsCoursesError(e.message || 'Не удалось загрузить курсы Moodle');
          setStatsMoodleCourses([]);
          setStatsCourseId('');
        }
      } finally {
        if (!cancelled) setStatsCoursesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    isManagerOrAdmin,
    selectedUserId,
    selectedUser?.moodle_id,
    user?.moodle_id,
    moodleRevision,
  ]);

  useEffect(() => {
    if (!statsCourseId || !targetMoodleUserId) {
      setCompletionInfo(null);
      setCompletionError('');
      setCompletionLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setCompletionLoading(true);
      setCompletionError('');
      setCompletionInfo(null);
      try {
        const q = new URLSearchParams({ course_id: String(statsCourseId) });
        if (isManagerOrAdmin && selectedUserId) {
          q.set('user_id', String(selectedUserId));
        }
        const data = await api.get(`/moodle/course-completion?${q.toString()}`);
        if (!cancelled) setCompletionInfo(data);
      } catch (e) {
        if (!cancelled) {
          setCompletionInfo(null);
          setCompletionError(e.message || 'Не удалось загрузить прогресс по курсу');
        }
      } finally {
        if (!cancelled) setCompletionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    statsCourseId,
    targetMoodleUserId,
    isManagerOrAdmin,
    selectedUserId,
  ]);

  useEffect(() => {
    if (!user) return;

    const init = async () => {
      if (isManagerOrAdmin) {
        try {
          setLoading(true);
          setError('');
          const usersResponse = await api.get('/users/only');
          const tagsResponse = await api.get('/tags');
          setUsers(usersResponse);
          setAllTags(tagsResponse);

          if (usersResponse.length > 0) {
            const firstUserId = usersResponse[0].id;
            setSelectedUserId(firstUserId);
            await loadStats(firstUserId, selectedTagIds);
          } else {
            setStats(null);
          }
        } catch (e) {
          console.error('Failed to load users for statistics', e);
          setError('Не удалось загрузить список пользователей.');
        } finally {
          setLoading(false);
        }
      } else {
        const tagsResponse = await api.get('/tags');
        setAllTags(tagsResponse);
        await loadStats(null, selectedTagIds);
      }
    };

    init();
  }, [user]);

  const handleUserChange = async (e) => {
    const newUserId = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedUserId(newUserId);
    await loadStats(newUserId, selectedTagIds);
  };

  const loadMoodleCourses = async () => {
    setCoursesLoading(true);
    setCoursesError('');
    try {
      const list = await api.get('/moodle/courses');
      setMoodleCourses(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Failed to load Moodle courses', e);
      setCoursesError(e.message || 'Не удалось загрузить курсы Moodle');
      setMoodleCourses([]);
    } finally {
      setCoursesLoading(false);
    }
  };

  const openEnrolPanel = async () => {
    setEnrolMessage({ type: '', text: '' });
    setSelectedCourseId('');
    setEnrolPanelOpen(true);
    await loadMoodleCourses();
  };

  const handleMoodleEnrol = async () => {
    setEnrolMessage({ type: '', text: '' });
    if (!selectedUserId) {
      setEnrolMessage({ type: 'error', text: 'Выберите пользователя.' });
      return;
    }
    if (!selectedUser?.moodle_id) {
      setEnrolMessage({
        type: 'error',
        text: 'У пользователя нет учётной записи в Moodle.',
      });
      return;
    }
    const courseId = parseInt(selectedCourseId, 10);
    if (!courseId) {
      setEnrolMessage({ type: 'error', text: 'Выберите курс.' });
      return;
    }
    setEnrolSubmitting(true);
    try {
      await api.post('/moodle/enrol', { user_id: selectedUserId, course_id: courseId });
      setEnrolMessage({ type: 'success', text: 'Пользователь зачислен на курс.' });
      setMoodleRevision((revision) => revision + 1);
      setSelectedCourseId('');
    } catch (e) {
      setEnrolMessage({ type: 'error', text: e.message || 'Ошибка зачисления' });
    } finally {
      setEnrolSubmitting(false);
    }
  };

  const handleTagToggle = async (tagId) => {
    let next;
    if (selectedTagIds.includes(tagId)) {
      next = selectedTagIds.filter((id) => id !== tagId);
    } else {
      next = [...selectedTagIds, tagId];
    }
    setSelectedTagIds(next);
    await loadStats(selectedUserId, next);
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">
              Аналитика
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">
              {isManagerOrAdmin ? 'Статистика пользователей' : 'Моя статистика'}
            </h1>
            <p className="mt-2 text-base text-gray-500 dark:text-gray-400 max-w-xl">
              Просматривайте ключевые показатели по соревнованиям и задачам, настраивая выборку по
              пользователям и тегам.
            </p>
          </div>

          {loading && (
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-gray-800/60 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              Загрузка статистики
            </div>
          )}
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          {/* Левая панель с фильтрами */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
              <h2 className="mb-3 text-base font-medium text-gray-800 dark:text-gray-100">
                Управление
              </h2>

              {isManagerOrAdmin && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Пользователь
                  </label>
                  <label htmlFor="stats-user-search" className="mb-1 block text-base text-gray-700 dark:text-gray-300">Найти пользователя</label>
                  <input id="stats-user-search" type="search" value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Имя, фамилия или почта"
                    className="mb-2 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100" />
                  {userSearch && matchingUsers.length === 0 && <p className="mb-2 text-base text-gray-500 dark:text-gray-400" role="status">Пользователи не найдены. Текущий выбор сохранён.</p>}
                  <select
                    aria-label="Пользователь для статистики"
                    value={selectedUserId || ''}
                    onChange={handleUserChange}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {users.length === 0 && <option value="">Нет пользователей</option>}
                    {users.length > 0 && <option value="">— выберите пользователя —</option>}
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isManagerOrAdmin && (
                <div className="mb-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => (enrolPanelOpen ? setEnrolPanelOpen(false) : openEnrolPanel())}
                    className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-base font-medium text-blue-800 transition hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200 dark:hover:bg-blue-900/40"
                  >
                    {enrolPanelOpen ? 'Скрыть зачисление в Moodle' : 'Зачислить на курс Moodle'}
                  </button>

                  {enrolPanelOpen && (
                    <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50">

                      {coursesLoading && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Загрузка курсов…</p>
                      )}
                      {coursesError && (
                        <p className="text-xs text-red-600 dark:text-red-400">{coursesError}</p>
                      )}

                      {!coursesLoading && !coursesError && moodleCourses.length === 0 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Курсы не найдены.</p>
                      )}

                      {moodleCourses.length > 0 && (
                        <>
                          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Курс
                          </label>
                          <select
                            value={selectedCourseId}
                            onChange={(e) => setSelectedCourseId(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          >
                            <option value="">— выберите курс —</option>
                            {moodleCourses.map((c) => (
                              <option key={c.id} value={String(c.id)}>
                                {c.fullname || c.shortname || `Курс #${c.id}`}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={enrolSubmitting || !selectedUserId || !selectedUser?.moodle_id}
                            onClick={handleMoodleEnrol}
                            className="w-full rounded-lg bg-blue-600 px-3 py-2 text-base font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {enrolSubmitting ? 'Зачисление…' : 'Зачислить на курс'}
                          </button>
                        </>
                      )}

                      {enrolMessage.text && (
                        <p
                          className={`text-xs ${
                            enrolMessage.type === 'success'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {enrolMessage.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Теги задач
                </label>
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-2 max-h-40 overflow-y-auto dark:border-gray-700 dark:bg-gray-800/60">
                  {allTags.length === 0 ? (
                    <p className="py-2 text-xs text-gray-500 dark:text-gray-400">Теги отсутствуют.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleTagToggle(tag.id)}
                          className={`px-2.5 py-1 text-base rounded-full border transition-colors ${
                            selectedTagIds.includes(tag.id)
                              ? 'border-blue-500 bg-blue-500 text-white'
                              : 'border-transparent bg-white text-gray-800 hover:border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:hover:border-gray-600'
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!stats && !loading && !error && (
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
                Статистика недоступна. Возможно, ещё нет данных по соревнованиям или задачам.
              </div>
            )}
          </aside>

          {/* Правая колонка с карточками статистики */}
          <main className="space-y-4">
            {loading && !stats && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70"
                  >
                    <div className="mb-3 h-3 w-24 rounded-full bg-gray-200 dark:bg-gray-800" />
                    <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-gray-800" />
                  </div>
                ))}
              </div>
            )}

            {stats && (
              <div className="space-y-4">
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-500 via-sky-400 to-blue-500" />
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Количество соревнований
                    </h2>
                    <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                      {stats.total_competitions}
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-cyan-400" />
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Общий счёт по соревнованиям
                    </h2>
                    <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100">
                      {stats.total_score}
                    </p>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-emerald-500 to-lime-400" />
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Выполненные задачи (всего)
                    </h2>
                    <p className="text-3xl font-semibold text-emerald-600 dark:text-emerald-400">
                      {stats.completed_tasks_count}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Лёгкие задачи (&lt; {stats.medium_difficulty_min ?? 25} баллов)
                    </h2>
                    <p className="text-3xl font-semibold text-sky-600 dark:text-sky-400">
                      {stats.easy_tasks_count}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Средние задачи ({stats.medium_difficulty_min ?? 25}–{stats.medium_difficulty_max ?? 75} баллов)
                    </h2>
                    <p className="text-3xl font-semibold text-amber-600 dark:text-amber-400">
                      {stats.medium_tasks_count}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Сложные задачи (&gt; {stats.medium_difficulty_max ?? 75} баллов)
                    </h2>
                    <p className="text-3xl font-semibold text-purple-600 dark:text-purple-400">
                      {stats.hard_tasks_count}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                    <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                      Просроченные задачи
                    </h2>
                    <p className="text-3xl font-semibold text-red-600 dark:text-red-400">
                      {stats.wasted_tasks_count}
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
                    <div>
                      <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Выполненные задачи с выбранными тегами
                      </h2>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Учитываются задачи в статусе «Выполнено», у которых есть хотя бы один из выбранных тегов.
                      </p>
                    </div>
                    <p className="text-3xl font-semibold text-indigo-600 dark:text-indigo-400">
                      {stats.completed_with_tags_count}
                    </p>
                  </div>
                </section>
              </div>
            )}

            {stats && <TaskDifficultyChart stats={stats} />}

            {targetMoodleUserId && (
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900/70">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  Прогресс курса в Moodle
                </h2>

                <label htmlFor="moodle-progress-course" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Курс для статистики
                </label>
                {statsCoursesLoading && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Загрузка курсов…</p>
                )}
                {statsCoursesError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mb-3">{statsCoursesError}</p>
                )}
                {!statsCoursesLoading && !statsCoursesError && statsMoodleCourses.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Нет зачисленных курсов в Moodle для этого пользователя.
                  </p>
                )}
                {statsMoodleCourses.length > 0 && (
                  <select
                    id="moodle-progress-course"
                    value={statsCourseId}
                    onChange={(e) => setStatsCourseId(e.target.value)}
                    className="mb-4 w-full max-w-md rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <option value="">— выберите курс —</option>
                    {statsMoodleCourses.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.fullname || c.shortname || `Курс #${c.id}`}
                      </option>
                    ))}
                  </select>
                )}

                {statsCourseId && (
                  <div className="mb-4 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-800/60">
                    {completionLoading && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">Загрузка прогресса…</p>
                    )}
                    {completionError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{completionError}</p>
                    )}
                    {!completionLoading && !completionError && currentProgress && (
                      <div className="text-gray-800 dark:text-gray-200">
                        {currentProgress.progress_basis === 'unavailable' ? (
                          <p>В Moodle для этого курса не настроено отслеживание прогресса.</p>
                        ) : (
                          <>
                            <p>Прогресс: {currentProgress.completion_percent}%</p>
                            {currentProgress.total_criteria > 0 && (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {currentProgress.progress_basis === 'activities' ? 'Выполненные активности' : 'Выполненные критерии'}:{' '}
                                {currentProgress.completed_criteria} / {currentProgress.total_criteria}
                              </p>
                            )}
                          </>
                        )}
                        {currentProgress.moodle_completed && (
                          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                            В Moodle курс отмечен как завершённый.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {grafanaPanelSrc && (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950">

                    <div className="relative h-[420px] w-full bg-white dark:bg-gray-900">
                      <iframe
                        title="Grafana: прогресс курса Moodle"
                        src={grafanaPanelSrc}
                        className="absolute inset-0 h-full w-full"
                        style={{ border: 0 }}
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </div>
                )}
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default StatisticsPage;