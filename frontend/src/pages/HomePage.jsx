import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const getFirstDayOfMonth = (year, month) => {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toGenitiveMonth = (name) => {
  if (name.endsWith('рь')) return name.slice(0, -1) + 'я';
  if (name.endsWith('ль')) return name.slice(0, -1) + 'я';
  if (name.endsWith('й')) return name.slice(0, -1) + 'я';
  if (name.endsWith('нь')) return name.slice(0, -1) + 'я';
  if (name.endsWith('т')) return name + 'а';
  return name;
};

const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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
      color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
    };
  }

  const now = new Date();
  const startDate = new Date(competition.start_date);
  const endDate = new Date(competition.end_date);

  if (now < startDate) {
    return {
      text: 'Не началось',
      color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    };
  }

  if (now >= startDate && now <= endDate) {
    return {
      text: 'Идёт',
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
    };
  }

  return {
    text: 'Завершено',
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
  };
};

const HomePage = () => {
  const api = useApi();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [competition, setCompetition] = useState(null);
  const [isLoadingCompetition, setIsLoadingCompetition] = useState(true);
  const [chatSuccess, setChatSuccess] = useState(null);
  const [competitions, setCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [uniqueParticipants, setUniqueParticipants] = useState(0);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const dashboardDataLoadedRef = useRef(false);
  const [userCompetitions, setUserCompetitions] = useState([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState(null);
  const [competitionStats, setCompetitionStats] = useState(null);
  const [isLoadingCompetitionStats, setIsLoadingCompetitionStats] = useState(false);

  useEffect(() => {
    document.title = 'Панель геймификации';
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon-g.svg';
    document.head.appendChild(link);
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [expandedDay, setExpandedDay] = useState(null);
  const [tasks, setTasks] = useState({});
  const [defaultStatusId, setDefaultStatusId] = useState(null);
  const [pendingStatusId, setPendingStatusId] = useState(null);
  const [wastedStatusId, setWastedStatusId] = useState(null);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const inputRef = useRef(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [completedStatusId, setCompletedStatusId] = useState(null);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [mobileWeekRowHeight, setMobileWeekRowHeight] = useState(null);

  const MOBILE_VISIBLE_TASKS = 5;

  const mapTasksByDate = (taskList) => {
    const mapped = {};
    (taskList || []).forEach((task) => {
      const dateSource = task.due_date || task.created_at || new Date().toISOString();
      
      let date;
      if (typeof dateSource === 'string') {
        if (dateSource.includes('Z') || dateSource.match(/[+-]\d{2}:\d{2}$/)) {
          date = new Date(dateSource);
        } else {
          const dateMatch = dateSource.match(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?)?/);
          if (dateMatch) {
            const [, year, month, day, hours = '0', minutes = '0', seconds = '0'] = dateMatch;
            date = new Date(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(hours),
              parseInt(minutes),
              parseInt(seconds)
            );
          } else {
            date = new Date(dateSource);
          }
        }
      } else {
        date = new Date(dateSource);
      }
      
      const dateKey = formatDateKey(date);
      if (!mapped[dateKey]) mapped[dateKey] = [];
      mapped[dateKey].push(task);
    });
    return mapped;
  };

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        setIsLoadingTasks(true);
        const statuses = await api.get('/task-statuses');
        const defaultStatus = statuses.find(s => s.code === 'todo') || statuses[0];
        const completedStatus = statuses.find(s => s.code === 'done');
        const holdDoneStatus = statuses.find(s => s.code === 'hold done');
        const wastedStatus = statuses.find(s => s.code === 'wasted');
        setDefaultStatusId(defaultStatus?.id || null);
        setCompletedStatusId(completedStatus?.id || null);
        setPendingStatusId(holdDoneStatus?.id || null);
        setWastedStatusId(wastedStatus?.id || null);

        const tasksResp = await api.get('/tasks');
        const visibleTasks = tasksResp || [];
        setTasks(mapTasksByDate(visibleTasks));
      } catch (err) {
        console.error('Ошибка загрузки задач:', err);
        setError(err.message || 'Не удалось загрузить задачи');
      } finally {
        setIsLoadingTasks(false);
      }
    };
    loadData();
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const computeRowHeight = () => {
      // Фиксируем высоту ячейки под 5 задач + строку "+N", чтобы:
      // - задачи не “слипались” при переполнении
      // - всегда был виден индикатор "+N"
      // - не было пустого места снизу именно в состоянии "5 задач + +N"
      const dayHeaderPx = 28; // блок с номером дня
      const cellPaddingPx = 12; // px-1.5 + pb-1.5 суммарно по вертикали
      const pillPx = 20; // py-1 + leading-3
      const gapPx = 6; // gap-1.5
      const footerPx = 12; // строка "+N"

      const tasksBlockPx =
        MOBILE_VISIBLE_TASKS * pillPx + Math.max(0, MOBILE_VISIBLE_TASKS - 1) * gapPx;

      const rowHeight = dayHeaderPx + cellPaddingPx + tasksBlockPx + footerPx;
      setMobileWeekRowHeight(rowHeight);
    };

    if (!isMobileView) {
      setMobileWeekRowHeight(null);
      return undefined;
    }

    computeRowHeight();
    window.addEventListener('resize', computeRowHeight);
    return () => window.removeEventListener('resize', computeRowHeight);
  }, [isMobileView]);

  const loadCompetitionStats = async (competitionId, nameSource) => {
    try {
      setIsLoadingCompetitionStats(true);
      const leaderboardRaw = await api.get(`/leaderboard/${competitionId}`);
      const usersArray = Array.isArray(leaderboardRaw) ? leaderboardRaw : [];
      const sortedUsers = usersArray
        .map((u) => ({
          user_id: u.user_id,
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          total_points: Number(u.score) || 0,
        }))
        .sort((a, b) => b.total_points - a.total_points);

      let userRank = null;
      let userPoints = null;

      const nameData = nameSource || user || {};
      const foundIndex = sortedUsers.findIndex(
        (u) => String(u.user_id) === String(nameData.id)
      );

      if (foundIndex !== -1) {
        userRank = foundIndex + 1;
        userPoints = sortedUsers[foundIndex].total_points;
      }

      setCompetitionStats({
        competitionId,
        totalParticipants: sortedUsers.length,
        userRank,
        userPoints,
      });
    } catch (statsErr) {
      console.error('Ошибка загрузки статистики соревнования:', statsErr);
      setCompetitionStats(null);
    } finally {
      setIsLoadingCompetitionStats(false);
    }
  };

  useEffect(() => {
    if (!user || user.role === 'admin' || user.role === 'manager') {
      setIsLoadingCompetition(false);
      return;
    }
    
    const loadCompetition = async () => {
      try {
        setIsLoadingCompetition(true);
        setIsLoadingCompetitionStats(true);
        const userInfo = await api.get('/users/me');

        const competitionsList = await api.get('/users/me/competitions');
        const normalizedCompetitions = Array.isArray(competitionsList) ? competitionsList : [];
        setUserCompetitions(normalizedCompetitions);

        const competitionId =
          userInfo?.current_competition_id ||
          (normalizedCompetitions.length > 0 ? normalizedCompetitions[0].id : null);

        if (competitionId) {
          const compInfo =
            normalizedCompetitions.find((c) => c.id === competitionId) ||
            (await api.get(`/competitions/${competitionId}`));

          setCompetition(compInfo);
          setSelectedCompetitionId(compInfo.id);

          await loadCompetitionStats(competitionId, userInfo);
        } else {
          setCompetition(null);
          setSelectedCompetitionId(null);
          setCompetitionStats(null);
        }
      } catch (err) {
        console.error('Ошибка загрузки соревнования:', err);
        setCompetition(null);
        setUserCompetitions([]);
        setSelectedCompetitionId(null);
        setCompetitionStats(null);
      } finally {
        setIsLoadingCompetition(false);
        setIsLoadingCompetitionStats(false);
      }
    };
    loadCompetition();
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'manager') return;
    if (!selectedCompetitionId) return;

    loadCompetitionStats(selectedCompetitionId);
  }, [selectedCompetitionId]);

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      dashboardDataLoadedRef.current = false;
      return;
    }

    if (dashboardDataLoadedRef.current || loadingCompetitions || loadingUsers) {
      return;
    }

    dashboardDataLoadedRef.current = true;

    const loadDashboardData = async () => {
      try {
        setLoadingCompetitions(true);
        setLoadingUsers(true);
        
        const [comps, summary] = await Promise.all([
          api.get('/competitions'),
          api.get('/manager/summary')
        ]);
        
        setCompetitions(comps || []);
        setUniqueParticipants(summary.unique_participants_count || 0);
      } catch (err) {
        if (err.message && !err.message.includes('Нет подключения')) {
          console.error('Ошибка загрузки данных дашборда:', err);
        }
        setCompetitions([]);
        setUniqueParticipants(0);
      } finally {
        setLoadingCompetitions(false);
        setLoadingUsers(false);
        dashboardDataLoadedRef.current = false;
      }
    };

    loadDashboardData();
  }, [user?.role]);

  const markTaskAsCompleted = async (taskId, estimatedPoints = 0) => {
    if (!pendingStatusId) {
      setError('Статус "Ожидает подтверждения" не найден');
      return;
    }

    try {
      // Проверка даты начала соревнования
      if (competition && competition.start_date) {
        const startDate = new Date(competition.start_date);
        const now = new Date();
        
        if (now < startDate) {
          const formattedDate = startDate.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setError(`Нельзя пометить задачу выполненной до начала соревнования. Соревнование начинается ${formattedDate}`);
          return;
        }
      }

      const allTasks = await api.get('/tasks');
      const task = allTasks.find(t => t.id === taskId);
      if (!task) {
        setError('Задача не найдена');
        return;
      }
      if (task.status_id === pendingStatusId) {
        setError('Задача уже отправлена на подтверждение');
        return;
      }
      if (completedStatusId && task.status_id === completedStatusId) {
        setError('Задача уже подтверждена менеджером');
        return;
      }
      if (wastedStatusId && task.status_id === wastedStatusId) {
        setError('Просроченную задачу нельзя отправить на подтверждение');
        return;
      }

      await api.put(`/tasks/${taskId}`, {
        status_id: pendingStatusId,
      });

      const tasksResp = await api.get('/tasks');
      const visibleTasks = tasksResp || [];
      setTasks(mapTasksByDate(visibleTasks));
    } catch (err) {
      console.error('Ошибка завершения задачи:', err);
      let errorMessage = 'Не удалось завершить задачу';
      if (err && typeof err === 'object') {
        errorMessage = err.detail || err.message || JSON.stringify(err, null, 2);
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
    }
  };


  const { year, month, days, startDay } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const startDay = getFirstDayOfMonth(year, month);
    return { year, month, days: Array.from({ length: daysInMonth }, (_, i) => i + 1), startDay };
  }, [currentDate]);

  const getTasksForDay = (day) => {
    const dateKey = formatDateKey(new Date(year, month, day));
    return tasks[dateKey] || [];
  };

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setExpandedDay(null);
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setExpandedDay(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setExpandedDay(null);
    setSelectedDateKey(null);
    setSelectedTaskId(null);
  };

  const openDayTasks = (day) => {
    const date = new Date(year, month, day);
    const dateKey = formatDateKey(date);
    const dayTasks = getTasksForDay(day);

    if (!dayTasks.length) return;

    if (expandedDay === dateKey) {
      setExpandedDay(null);
      setSelectedDateKey(null);
      setSelectedTaskId(null);
      return;
    }

    setExpandedDay(dateKey);
    setSelectedDateKey(dateKey);
    setSelectedTaskId(dayTasks[0]?.id || null);
  };

  const isToday = (day) => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const isWeekend = (dayIndex) => {
    const dayOfWeek = (startDay + dayIndex) % 7;
    return dayOfWeek === 5 || dayOfWeek === 6;
  };

  // Считаем количество строк динамически по месяцу.
  // Добиваем только последнюю строку до конца недели, без полностью пустых строк внизу.
  const TOTAL_COLUMNS = 7;
  const totalMonthCells = startDay + days.length;
  const totalRows = Math.ceil(totalMonthCells / TOTAL_COLUMNS);
  const trailingEmptyCells = totalRows * TOTAL_COLUMNS - totalMonthCells;
  const isMobileUserView =
    isMobileView && user?.role !== 'admin' && user?.role !== 'manager';
  const isMobileTaskPanelOpen = isMobileUserView && Boolean(selectedDateKey);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    // Сообщаем Navbar'у, что открыт мобильный задачник (нужно зафиксировать шапку).
    window.dispatchEvent(
      new CustomEvent('mobile-task-panel', { detail: { open: isMobileTaskPanelOpen } })
    );

    if (!isMobileTaskPanelOpen) return undefined;

    // Лочим прокрутку страницы, чтобы скроллилась только панель задач.
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
      window.dispatchEvent(
        new CustomEvent('mobile-task-panel', { detail: { open: false } })
      );
    };
  }, [isMobileTaskPanelOpen]);

  if (!user) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-12 text-gray-900 dark:text-gray-100">
        <h1 className="text-2xl font-semibold">Панель геймификации</h1>
        <p className="my-4 text-gray-600 dark:text-gray-300">Войдите, чтобы увидеть свои соревнования и задачи.</p>
        <button type="button" onClick={() => navigate('/login')} className="rounded-lg bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800">
          Войти
        </button>
      </main>
    );
  }

  if (user.role === 'admin' || user.role === 'manager') {
    const now = new Date();
    const activeCompetitions = competitions.filter(comp => {
      const start = new Date(comp.start_date);
      const end = new Date(comp.end_date);
      return now >= start && now <= end;
    });
    const upcomingCompetitions = competitions.filter(comp => {
      const start = new Date(comp.start_date);
      return now < start;
    });
    const completedCompetitions = competitions.filter(comp => {
      const end = new Date(comp.end_date);
      return now > end;
    });

    return (
      <div className="p-3 sm:p-5 max-w-7xl mx-auto bg-gray-50 dark:bg-gray-900 min-h-screen">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-base">Всего соревнований</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 mt-1">
                  {loadingCompetitions ? '...' : competitions.length}
                </p>
              </div>
              <div className="text-4xl"></div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-base">Активных</p>
                <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mt-1">
                  {loadingCompetitions ? '...' : activeCompetitions.length}
                </p>
              </div>
              <div className="text-4xl"></div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 dark:text-gray-400 text-base">Участников</p>
                <p className="text-2xl sm:text-3xl font-bold text-blue-500 dark:text-blue-600 mt-1">
                  {loadingUsers ? '...' : uniqueParticipants}
                </p>
              </div>
              <div className="text-4xl"></div>
            </div>
          </div>
        </div>

        {/* Быстрые действия */}
        <div className={`grid grid-cols-1 ${user?.role === 'admin' ? 'md:grid-cols-2' : ''} gap-6 mb-8`}>
          <button
            onClick={() => navigate('/manager')}
            className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 p-4 sm:p-6 rounded-xl shadow-lg text-white hover:from-blue-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:to-blue-800 transition-all transform hover:scale-105 w-full"
          >
            <div className="flex items-center gap-4">
              <div className="text-left">
                <h3 className="text-lg sm:text-xl font-bold mb-1">Управление соревнованиями</h3>
                <p className="text-blue-100 text-base sm:text-base">Создавайте и управляйте соревнованиями</p>
              </div>
            </div>
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 p-4 sm:p-6 rounded-xl shadow-lg text-white hover:from-blue-600 hover:to-blue-700 dark:hover:from-blue-700 dark:hover:to-blue-800 transition-all transform hover:scale-105"
            >
              <div className="flex items-center gap-4">
                <div className="text-left">
                  <h3 className="text-lg sm:text-xl font-bold mb-1">Админ-панель</h3>
                  <p className="text-blue-100 text-base sm:text-base">Управление пользователями и настройками</p>
                </div>
              </div>
            </button>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 sm:mb-6">
            Соревнования
          </h2>

          {loadingCompetitions ? (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
            </div>
          ) : competitions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Нет созданных соревнований
            </p>
          ) : (
            <div className="space-y-4">
              {activeCompetitions.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-3">
                    Активные ({activeCompetitions.length})
                  </h3>
                  <div className="space-y-2">
                    {activeCompetitions.map((comp) => (
                      <div
                        key={comp.id}
                        className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                              {comp.title}
                            </h4>
                            <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                              {formatDateTime(comp.start_date)} - {formatDateTime(comp.end_date)}
                            </p>
                          </div>
                          <button
                            onClick={() => navigate(`/manager?competitionId=${comp.id}`)}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-base"
                          >
                            Управлять
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {upcomingCompetitions.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-3">
                    Предстоящие ({upcomingCompetitions.length})
                  </h3>
                  <div className="space-y-2">
                    {upcomingCompetitions.map((comp) => (
                      <div
                        key={comp.id}
                        className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                              {comp.title}
                            </h4>
                            <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                              Начало: {formatDateTime(comp.start_date)}
                            </p>
                          </div>
                          <button
                            onClick={() => navigate(`/manager?competitionId=${comp.id}`)}
                            className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-base"
                          >
                            Управлять
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {completedCompetitions.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-600 dark:text-gray-400 mb-3">
                    ⚫ Завершённые ({completedCompetitions.length})
                  </h3>
                  <div className="space-y-2">
                    {completedCompetitions.slice(0, 5).map((comp) => (
                      <div
                        key={comp.id}
                        className="p-4 bg-gray-50 dark:bg-gray-700/30 border border-gray-200 dark:border-gray-700 rounded-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                              {comp.title}
                            </h4>
                            <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                              {formatDateTime(comp.start_date)} - {formatDateTime(comp.end_date)}
                            </p>
                          </div>
                          <button
                            onClick={() => navigate(`/manager?competitionId=${comp.id}`)}
                            className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-base"
                          >
                            Просмотр
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-gray-50 dark:bg-gray-900 min-h-screen ${
        isMobileUserView ? 'px-0 py-2 pb-24' : 'p-3 sm:p-5 max-w-7xl mx-auto'
      }`}
    >
      <header className="mb-6 sm:mb-8 px-2 flex justify-between items-center">
        <h1 className="sr-only">Календарь задач</h1>
      </header>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 border border-red-300 text-red-800 text-base">
          {error}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-8 ${isMobileUserView ? 'px-0' : ''}`}>
        {!isLoadingCompetition && competition && (
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
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
                      value={selectedCompetitionId || ''}
                      onChange={(e) => {
                        const value = e.target.value ? Number(e.target.value) : null;
                        setSelectedCompetitionId(value);
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
                  const currentComp =
                    userCompetitions.find((c) => c.id === selectedCompetitionId) || competition;
                  if (!currentComp) {
                    return (
                      <p className="text-base text-gray-600 dark:text-gray-300">
                        Выберите соревнование слева, чтобы увидеть подробности.
                      </p>
                    );
                  }

                  const status = getCompetitionStatus(currentComp);
                  const statsAvailable =
                    competitionStats &&
                    competitionStats.competitionId === currentComp.id &&
                    competitionStats.userRank != null;

                  return (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {currentComp.title || 'Соревнование'}
                          </h3>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${status.color}`}
                          >
                            {status.text}
                          </span>
                        </div>

                        <div className="space-y-1 text-base text-gray-800 dark:text-gray-100">
                          {currentComp.start_date && (
                            <p>
                              <span className="font-medium">Начало:</span>{' '}
                              {formatDateTime(currentComp.start_date)}
                            </p>
                          )}
                          {currentComp.end_date ? (
                            <>
                              <p>
                                <span className="font-medium">Дедлайн:</span>{' '}
                                {formatDateTime(currentComp.end_date)}
                              </p>
                              <p className="text-gray-700 dark:text-gray-300">
                                {getTimeRemaining(currentComp.end_date)}
                              </p>
                            </>
                          ) : (
                            <p className="text-gray-600 dark:text-gray-400">
                              Информация о дедлайне недоступна
                            </p>
                          )}
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-base">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Мои баллы
                            </p>
                            {isLoadingCompetitionStats ? (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                ...
                              </p>
                            ) : (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {statsAvailable ? competitionStats.userPoints : '—'}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Моё место
                            </p>
                            {isLoadingCompetitionStats ? (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                ...
                              </p>
                            ) : statsAvailable ? (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {competitionStats.userRank}{' '}
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  из {competitionStats.totalParticipants}
                                </span>
                              </p>
                            ) : (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                —
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Участников
                            </p>
                            {isLoadingCompetitionStats ? (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                ...
                              </p>
                            ) : competitionStats &&
                              competitionStats.competitionId === currentComp.id ? (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                {competitionStats.totalParticipants}
                              </p>
                            ) : (
                              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                —
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <button
                          onClick={() => navigate('/leaderboards')}
                          className="inline-flex items-center px-4 py-2 rounded-lg text-base font-medium border border-blue-500 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          Открыть полный рейтинг
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {!isLoadingCompetition && !competition && (
          <div className="bg-white dark:bg-gray-800 p-3 sm:p-5 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
            <p className="text-gray-600 dark:text-gray-400 text-center">
              Вы не участвуете в соревновании
            </p>
          </div>
        )}

        <div
          className={`bg-white dark:bg-gray-800 shadow-md ${
            isMobileUserView ? 'p-0 rounded-none border-y border-gray-200 dark:border-gray-700' : 'p-3 sm:p-5 rounded-lg'
          }`}
        >
          <div className={`flex flex-col gap-6 ${selectedDateKey ? 'lg:flex-row' : ''}`}>
            <div className={selectedDateKey ? 'lg:w-3/5' : 'w-full'}>
              <div
                className={`flex justify-between items-center ${isMobileUserView ? 'mb-0 px-3 py-3 border-b border-gray-200 dark:border-gray-700' : 'mb-4 sm:mb-5'}`}
              >
                <h2 className="m-0 text-gray-800 dark:text-gray-100 font-semibold text-3xl sm:text-xl capitalize">
                   {new Date(year, month).toLocaleString('ru-RU', isMobileUserView ? { month: 'long' } : { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={goToToday}
                    className={`px-2.5 py-1.5 rounded cursor-pointer text-base sm:text-base border border-blue-500 text-blue-500 dark:text-blue-400 bg-white dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors ${
                      isMobileUserView ? 'hidden' : ''
                    }`}
                  >
                    Сегодня
                  </button>
                  <button
                    onClick={goToPreviousMonth}
                    className="px-2.5 py-1.5 rounded cursor-pointer text-lg sm:text-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-gray-900 dark:text-gray-100"
                  >
                    ‹
                  </button>
                  <button
                    onClick={goToNextMonth}
                    className="px-2.5 py-1.5 rounded cursor-pointer text-lg sm:text-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors text-gray-900 dark:text-gray-100"
                  >
                    ›
                  </button>
                </div>
              </div>

              <div
                className="grid grid-cols-7 text-center font-semibold mb-0 bg-gray-600 dark:bg-gray-700 text-white"
              >
                {(isMobileUserView ? ['П', 'В', 'С', 'Ч', 'П', 'С', 'В'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']).map((day, idx) => (
                  <div
                    key={`${day}-${idx}`}
                    className="py-1.5 px-0.5 text-base sm:text-base"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="border border-gray-300 dark:border-gray-600 overflow-hidden">
                <div
                  className="grid grid-cols-7"
                  style={
                    isMobileUserView && mobileWeekRowHeight
                      ? { gridAutoRows: `${mobileWeekRowHeight}px` }
                      : undefined
                  }
                >
                  {Array.from({ length: startDay }).map((_, i) => {
                    const colIndex = i % 7;
                    const isLastCol = colIndex === 6;
                    const rowIndex = Math.floor(i / 7);
                    const isLastRow = rowIndex === totalRows - 1;
                    return (
                      <div 
                        key={`empty-${i}`} 
                        className={`${isMobileUserView ? 'h-full' : 'h-[90px] sm:h-[120px]'} bg-gray-50 dark:bg-gray-800 ${!isLastCol ? 'border-r border-gray-300 dark:border-gray-600' : ''} ${!isLastRow ? 'border-b border-gray-300 dark:border-gray-600' : ''}`}
                      ></div>
                    );
                  })}

                  {days.map((day, dayIdx) => {
                    const dayIndex = day - 1;
                    const dateKey = formatDateKey(new Date(year, month, day));
                    const dayTasks = getTasksForDay(day);
                    const isExpanded = expandedDay === dateKey;
                    const today = isToday(day);
                    const weekend = isWeekend(dayIndex);
                    const hasWasted = dayTasks.some(
                      (t) => wastedStatusId && t.status_id === wastedStatusId
                    );
                    const cellIndex = startDay + dayIdx;
                    const colIndex = cellIndex % TOTAL_COLUMNS;
                    const rowIndex = Math.floor(cellIndex / TOTAL_COLUMNS);
                    const isLastCol = colIndex === TOTAL_COLUMNS - 1;
                    const isLastRow = rowIndex === totalRows - 1;

                    return (
                      <div
                        key={day}
                        onClick={() => dayTasks.length > 0 && openDayTasks(day)}
                        className={`
                          ${isMobileUserView ? 'h-full' : 'min-h-[90px] sm:min-h-[120px]'} transition-colors flex flex-col
                          ${!isLastCol ? 'border-r border-gray-300 dark:border-gray-600' : ''}
                          ${!isLastRow ? 'border-b border-gray-300 dark:border-gray-600' : ''}
                          ${
                            today
                              ? 'bg-blue-100 dark:bg-blue-900/40'
                              : hasWasted
                              ? 'bg-red-50 dark:bg-red-900/30'
                              : 'bg-gray-50 dark:bg-gray-800'
                          }
                          ${isExpanded ? 'bg-gray-100 dark:bg-gray-700' : ''}
                          ${dayTasks.length > 0 ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                        `.trim()}
                      >
                      <div
                        className={`
                          ${isMobileUserView ? 'p-1.5 text-center text-base' : 'p-1.5 text-right text-base sm:text-base'}
                          ${today ? 'font-bold' : ''}
                          ${weekend ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}
                        `.trim()}
                      >
                        {today ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-500 dark:bg-blue-600 text-white">
                            {day}
                          </span>
                        ) : (
                          <span>{day}</span>
                        )}
                      </div>

                      <div className={`px-1.5 pb-1.5 text-base sm:text-base flex-1 ${isMobileUserView ? 'hidden' : ''}`}>
                        {dayTasks.length > 0 ? (
                          <div>
                            {dayTasks.map((task, i) => {
                              const isWasted = wastedStatusId && task.status_id === wastedStatusId;
                              return (
                                <span
                                  key={task.id || i}
                                  className={`px-1.5 py-0.5 rounded-full text-base sm:text-base inline-block max-w-full break-words m-0.5 ${
                                    isWasted
                                      ? 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200'
                                      : 'bg-cyan-50 dark:bg-cyan-900/50 text-cyan-900 dark:text-cyan-100'
                                  }`}
                                >
                                  {task.title.length > 15 ? task.title.slice(0, 15) + '…' : task.title}
                                  {task.estimated_points && (
                                    <span className="ml-1 text-blue-500 dark:text-blue-600 font-semibold">
                                      ({task.difficulty ? `${task.difficulty} · ` : ''}{task.estimated_points})
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-gray-500 dark:text-gray-400 text-xs m-1">Нет задач</p>
                        )}
                      </div>

                      {isMobileUserView && dayTasks.length > 0 && (() => {
                        const shown = Math.max(0, Math.min(dayTasks.length, MOBILE_VISIBLE_TASKS));
                        const hidden = Math.max(0, dayTasks.length - shown);

                        return (
                          <div className="px-1.5 pb-1.5 flex-1 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-hidden flex flex-col gap-1.5">
                              {dayTasks.slice(0, shown).map((task, i) => (
                                <div
                                  key={task.id || `m-task-${i}`}
                                  className="px-1.5 py-1 rounded-lg bg-gray-700/60 dark:bg-gray-900/35 text-[10px] leading-3 text-white truncate"
                                  title={task.title}
                                >
                                  {task.title}
                                </div>
                              ))}
                            </div>
                            {hidden > 0 && (
                              <div className="mt-auto text-[10px] leading-3 text-gray-600 dark:text-gray-400 text-center">
                                +{hidden}
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {!isMobileUserView && dayTasks.length > 0 && !isExpanded && (
                        <div className="text-center text-xs text-gray-600 dark:text-gray-400 border-t border-dashed border-gray-200 dark:border-gray-700 pt-1 mt-auto">
                          Кликните для просмотра
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Хвостовые пустые ячейки, чтобы добить последнюю строку до конца недели */}
                {Array.from({ length: trailingEmptyCells }).map((_, i) => {
                  const cellIndex = totalMonthCells + i;
                  const colIndex = cellIndex % TOTAL_COLUMNS;
                  const rowIndex = Math.floor(cellIndex / TOTAL_COLUMNS);
                  const isLastCol = colIndex === TOTAL_COLUMNS - 1;
                  const isLastRow = rowIndex === totalRows - 1;

                  return (
                    <div
                      key={`trailing-empty-${i}`}
                      className={`${isMobileUserView ? 'h-full' : 'h-[90px] sm:h-[120px]'} bg-gray-50 dark:bg-gray-800 ${!isLastCol ? 'border-r border-gray-300 dark:border-gray-600' : ''} ${!isLastRow ? 'border-b border-gray-300 dark:border-gray-600' : ''}`}
                    ></div>
                  );
                })}
                </div>
              </div>
            </div>

            {selectedDateKey && (tasks[selectedDateKey] || []).length > 0 && (
              <div
                className={`w-full lg:w-2/5 ${
                  isMobileUserView
                    ? 'fixed inset-0 z-40 bg-gray-50 dark:bg-gray-900'
                    : ''
                }`}
              >
                <div
                  className={`flex flex-col gap-4 h-full ${
                    isMobileUserView
                      ? 'p-3 pt-[calc(env(safe-area-inset-top)+3.5rem+0.75rem)] overflow-y-auto'
                      : ''
                  }`}
                >
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2.5 sm:p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base sm:text-base font-semibold text-gray-800 dark:text-gray-100">
                        Задачи на{' '}
                        {new Date(selectedDateKey).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </h3>
                      <button
                        onClick={() => {
                          setSelectedDateKey(null);
                          setSelectedTaskId(null);
                          setExpandedDay(null);
                        }}
                        className={`${
                          isMobileUserView
                            ? 'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-base font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors'
                            : 'text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                      >
                        {isMobileUserView && <span className="text-base leading-none">‹</span>}
                        {isMobileUserView ? 'Назад' : 'Закрыть'}
                      </button>
                    </div>
                    <ul className="space-y-1.5 max-h-32 sm:max-h-40 overflow-y-auto">
                      {tasks[selectedDateKey].map((task) => (
                        <li
                          key={task.id}
                          onClick={() => setSelectedTaskId(task.id)}
                          className={`
                            p-1.5 rounded cursor-pointer text-base sm:text-base
                            ${task.id === selectedTaskId
                              ? 'bg-blue-500 text-white'
                              : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100'}
                          `}
                        >
                          <div className="flex justify-between items-center">
                            <span className="truncate mr-2">{task.title}</span>
                            {task.estimated_points && (
                              <span className="text-xs font-semibold">
                                {task.estimated_points}
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {(() => {
                    const dayTasks = tasks[selectedDateKey] || [];
                    const selectedTask =
                      dayTasks.find((t) => t.id === selectedTaskId) || dayTasks[0];

                    if (!selectedTask) {
                      return (
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 sm:p-4 h-full flex items-center justify-center text-base sm:text-base text-gray-500 dark:text-gray-400">
                          Выберите задачу выше, чтобы посмотреть подробности
                        </div>
                      );
                    }

                    const competitionFromList =
                      (selectedTask.competition_id &&
                        (userCompetitions.find(
                          (c) => c.id === selectedTask.competition_id
                        ) ||
                          (competition &&
                            competition.id === selectedTask.competition_id
                              ? competition
                              : null))) ||
                      null;

                    const competitionName = competitionFromList
                      ? competitionFromList.title
                      : selectedTask.competition_id
                      ? `Соревнование #${selectedTask.competition_id}`
                      : 'Не указано';

                    return (
                      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-3 sm:p-4 h-full flex flex-col">
                        <div className="mb-3">
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {selectedTask.title || 'Задача'}
                          </h3>
                          {(selectedTask.tags && selectedTask.tags.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {selectedTask.tags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200"
                                >
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5 text-base sm:text-base text-gray-800 dark:text-gray-100 flex-1">
                          <p>
                            <span className="font-semibold">К какому соревнованию относится:</span>{' '}
                            <span className="font-normal">{competitionName}</span>
                          </p>
                          <p>
                            <span className="font-semibold">Дедлайн:</span>{' '}
                            <span className="font-normal">
                              {selectedTask.due_date
                                ? formatDateTime(selectedTask.due_date)
                                : 'Не указан'}
                            </span>
                          </p>
                          <p>
                            <span className="font-semibold">Сложность задачи (в баллах):</span>{' '}
                            <span className="font-normal">
                              {selectedTask.difficulty ? `${selectedTask.difficulty} · ` : ''}
                              {selectedTask.estimated_points ?? 'Не указана'}
                            </span>
                          </p>
                          {selectedTask.ai_analysis_metadata?.explanation && (
                            <p className="text-gray-700 dark:text-gray-200">
                              {selectedTask.ai_analysis_metadata.explanation}
                            </p>
                          )}
                          <div>
                            <p className="font-semibold mb-1">Описание задачи:</p>
                            <p className="font-normal whitespace-pre-wrap text-gray-700 dark:text-gray-200">
                              {selectedTask.description || 'Описание отсутствует'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          {selectedTask.status_id === completedStatusId ? (
                            <span className="inline-flex items-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-base sm:text-base">
                              Задача уже выполнена
                            </span>
                          ) : selectedTask.status_id === pendingStatusId ? (
                            <span className="inline-flex items-center px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 text-base sm:text-base">
                              Задача отправлена на подтверждение
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                if (selectedTask.id) {
                                  markTaskAsCompleted(
                                    selectedTask.id,
                                    selectedTask.estimated_points || 10
                                  );
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-base sm:text-base font-medium transition-colors"
                            >
                              Отметить как выполненную
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobileUserView && !selectedDateKey && (
        <button
          onClick={goToToday}
          className="fixed left-4 bottom-5 z-30 px-4 py-1.5 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-base text-gray-800 dark:text-gray-100 shadow"
        >
          Сегодня
        </button>
      )}
    </div>
  );
};

export default HomePage;
