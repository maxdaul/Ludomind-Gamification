import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTimeRemaining = (endDate) => {
  if (!endDate) return '';
  const now = new Date();
  const end = new Date(endDate);
  const diff = end - now;

  if (diff < 0) return 'Соревнование завершено';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `Осталось: ${days} дн. ${hours} ч.`;
  if (hours > 0) return `Осталось: ${hours} ч. ${minutes} мин.`;
  return `Осталось: ${minutes} мин.`;
};

const getCompetitionStatus = (competition) => {
  if (!competition?.start_date || !competition?.end_date) {
    return {
      text: 'Без дат',
      color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    };
  }

  const now = new Date();
  const startDate = new Date(competition.start_date);
  const endDate = new Date(competition.end_date);

  if (now < startDate) {
    return {
      text: 'Не началось',
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    };
  }

  if (now >= startDate && now <= endDate) {
    return {
      text: 'Идёт',
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    };
  }

  return {
    text: 'Завершено',
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  };
};

const LeaderboardsPage = () => {
  const [users, setUsers] = useState([]);
  const [recentTasks, setRecentTasks] = useState({ competitionId: null, items: null, error: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [competitionId, setCompetitionId] = useState(null);
  const [userCompetitions, setUserCompetitions] = useState([]);
  const api = useApi();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Проверка доступа: страница доступна только для обычных пользователей
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (user?.role !== 'user') {
      navigate('/');
      return;
    }

    document.title = 'Список лидеров | Геймификация предприятий';
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon-trophy.svg';
    document.head.appendChild(link);

    const initLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);

        // Загружаем пользователя и список его соревнований
        const me = await api.get('/users/me');
        const competitionsList = await api.get('/users/me/competitions');
        const normalizedCompetitions = Array.isArray(competitionsList) ? competitionsList : [];
        setUserCompetitions(normalizedCompetitions);

        let resolvedCompId =
          me?.current_competition_id ||
          (normalizedCompetitions.length > 0 ? normalizedCompetitions[0].id : null);

        if (!resolvedCompId && normalizedCompetitions.length === 0) {
          setCompetitionId(null);
          setUsers([]);
          return;
        }

        setCompetitionId(resolvedCompId);

        const data = await api.get(`/leaderboard/${resolvedCompId}`);
        const usersArray = Array.isArray(data) ? data : [];
        const sortedUsers = usersArray
          .map((u) => ({
            user_id: u.user_id,
            first_name: u.first_name || '',
            last_name: u.last_name || '',
            score: Number(u.score) || 0,
          }))
          .sort((a, b) => b.score - a.score);

        setUsers(sortedUsers);
      } catch (err) {
        console.error('Ошибка загрузки лидеров:', err);
        setError(err.message || 'Не удалось загрузить лидеров');
      } finally {
        setLoading(false);
      }
    };

    initLeaderboard();
  }, [isAuthenticated, user?.role, navigate]);

  useEffect(() => {
    const loadLeaderboardForCompetition = async () => {
      if (!competitionId) return;
      try {
        setLoading(true);
        setError(null);
        const data = await api.get(`/leaderboard/${competitionId}`);
        const usersArray = Array.isArray(data) ? data : [];
        const sortedUsers = usersArray
          .map((u) => ({
            user_id: u.user_id,
            first_name: u.first_name || '',
            last_name: u.last_name || '',
            score: Number(u.score) || 0,
          }))
          .sort((a, b) => b.score - a.score);
        setUsers(sortedUsers);
      } catch (err) {
        console.error('Ошибка загрузки лидеров:', err);
        setError(err.message || 'Не удалось загрузить лидеров');
      } finally {
        setLoading(false);
      }
    };

    loadLeaderboardForCompetition();
  }, [competitionId]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'user' || !competitionId) return;
    let cancelled = false;
    api.get(`/tasks/latest?competition_id=${competitionId}`)
      .then(items => {
        if (!cancelled) setRecentTasks({ competitionId, items: Array.isArray(items) ? items : [], error: false });
      })
      .catch(() => {
        if (!cancelled) setRecentTasks({ competitionId, items: [], error: true });
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.role, competitionId]);

  const currentCompetition =
    (competitionId && userCompetitions.find((c) => c.id === competitionId)) ||
    userCompetitions[0] ||
    null;

  let myRank = null;
  let myPoints = null;
  const totalParticipants = users.length;

  if (user && users.length > 0) {
    const foundIndex = users.findIndex(
      (u) => String(u.user_id) === String(user.id)
    );
    if (foundIndex !== -1) {
      myRank = foundIndex + 1;
      myPoints = users[foundIndex].score;
    }
  }

  // Проверка доступа перед рендерингом
  if (!isAuthenticated || user?.role !== 'user') {
    return null;
  }

  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto min-w-0 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <header className="mb-6 px-2">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Список лидеров
        </h1>
        <p className="text-base text-gray-500 dark:text-gray-400 mt-0.5">
          Рейтинг участников по набранным очкам
        </p>
      </header>

      {/* Блок соревнования */}
      {currentCompetition && (
        <div className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <div className="flex flex-col justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
                  Мои соревнования
                </h2>
                <p className="text-base text-gray-600 dark:text-gray-400 mb-4">
                  Выберите соревнование, чтобы посмотреть подробную информацию.
                </p>
                <div className="space-y-2">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Соревнование
                  </label>
                  <select
                    value={competitionId || ''}
                    onChange={(e) => {
                      const value = e.target.value ? Number(e.target.value) : null;
                      setCompetitionId(value);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={userCompetitions.length <= 1}
                  >
                    {userCompetitions.length === 0 && (
                      <option value="">Нет доступных соревнований</option>
                    )}
                    {userCompetitions.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.title}
                      </option>
                    ))}
                  </select>
                  {userCompetitions.length <= 1 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Сейчас вы участвуете только в одном соревновании.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 sm:p-5 flex flex-col justify-between">
              {(() => {
                const status = getCompetitionStatus(currentCompetition);
                return (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {currentCompetition.title || 'Соревнование'}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      <div className="space-y-1 text-base text-gray-800 dark:text-gray-100">
                        {currentCompetition.start_date && (
                          <p>
                            <span className="font-medium">Начало:</span>{' '}
                            {formatDateTime(currentCompetition.start_date)}
                          </p>
                        )}
                        {currentCompetition.end_date ? (
                          <>
                            <p>
                              <span className="font-medium">Дедлайн:</span>{' '}
                              {formatDateTime(currentCompetition.end_date)}
                            </p>
                            <p className="text-gray-700 dark:text-gray-300">
                              {getTimeRemaining(currentCompetition.end_date)}
                            </p>
                          </>
                        ) : (
                          <p className="text-gray-600 dark:text-gray-400">
                            Информация о дедлайне недоступна
                          </p>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-base">
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Мои баллы</p>
                          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {loading ? '...' : myPoints != null ? myPoints : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Моё место</p>
                          {loading ? (
                            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">...</p>
                          ) : myRank != null ? (
                            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                              {myRank}{' '}
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                из {totalParticipants}
                              </span>
                            </p>
                          ) : (
                            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Участников</p>
                          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {loading ? '...' : totalParticipants || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="inline-flex items-center px-4 py-2 rounded-lg text-base font-medium border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        Вернуться к календарю задач
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Таблица лидеров: на мобильных без горизонтального скролла, ФИО переносится */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 min-w-0 overflow-x-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="mt-3 text-base text-gray-500 dark:text-gray-400">Загрузка...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-base text-red-500 dark:text-red-400">{error}</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-base text-gray-500 dark:text-gray-400">Нет данных</p>
          </div>
        ) : (
          <div className="min-w-0 max-w-full">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col className="w-14 sm:w-16" />
                <col />
                <col className="w-16 sm:w-20" />
              </colgroup>
              <thead className="bg-gray-600 dark:bg-gray-700 text-white">
                <tr>
                  <th className="px-1.5 sm:px-3 py-3 text-center text-xs font-semibold uppercase tracking-tight">
                    Место
                  </th>
                  <th className="px-2 sm:px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider">
                    Участник
                  </th>
                  <th className="px-2 sm:px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider whitespace-nowrap">
                    Очки
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((u, index) => {
                  const rank = index + 1;
                  const isMe =
                    user && String(u.user_id) === String(user.id);
                  return (
                    <tr
                      key={rank}
                      className={`transition-colors ${
                        isMe
                          ? 'bg-blue-50 dark:bg-blue-900/20'
                          : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <td
                        className="px-1.5 sm:px-2 py-3 text-center align-middle text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 border-r border-gray-200/80 dark:border-gray-600/80"
                      >
                        {rank <= 3 ? (
                          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br font-bold text-gray-950 shadow-sm ${
                            rank === 1 ? 'from-yellow-200 to-amber-500' : rank === 2 ? 'from-gray-100 to-slate-400' : 'from-orange-200 to-amber-700'
                          }`} aria-label={`${rank}-е место`}>
                            <span aria-hidden="true">★</span><span className="sr-only">{rank}</span>
                          </span>
                        ) : rank}
                      </td>
                      <td className="px-2 sm:px-6 py-3 align-top min-w-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 min-w-0">
                          <span className="text-base font-medium text-gray-900 dark:text-gray-100 min-w-0 break-words">
                            <span className="block sm:inline">{u.first_name}</span>
                            <span className="hidden sm:inline"> </span>
                            <span className="block sm:inline">{u.last_name}</span>
                          </span>
                          <div className="flex flex-wrap gap-1.5 shrink-0">
                            {isMe && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                                Вы
                              </span>
                            )}
                            {rank === 1 && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">
                                Чемпион
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 sm:px-6 py-3 whitespace-nowrap text-right align-middle tabular-nums">
                        <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {u.score}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {currentCompetition && recentTasks.competitionId === competitionId && (
        <section aria-labelledby="recent-task-title" className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 id="recent-task-title" className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Мои последние задачи в соревновании</h2>
          {recentTasks.error ? (
            <p className="text-gray-600 dark:text-gray-300">Не удалось загрузить задачи.</p>
          ) : recentTasks.items.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-300">Задач пока нет.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentTasks.items.map((task, index) => (
                <li key={index} className="flex flex-wrap justify-between gap-x-4 py-2 text-gray-900 dark:text-gray-100">
                  <span className="min-w-0 break-words">{task.title}</span>
                  {task.due_date && <time className="text-gray-600 dark:text-gray-300" dateTime={task.due_date}>{formatDateTime(task.due_date)}</time>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
};

export default LeaderboardsPage;
