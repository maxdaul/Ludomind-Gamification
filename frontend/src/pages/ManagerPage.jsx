import TaskAnalysisPreview, { assessTaskBatch, taskAnalysisPayload } from "../components/TaskAnalysisPreview.jsx";
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../api/client.js';

const hasTaskInput = (task) => Boolean(
  task.title.trim() || task.description.trim() || task.due_date || task.user_ids.length || task.tag_ids.length
);

const isCompleteTask = (task) => Boolean(
  task.title.trim() && task.description.trim() && task.due_date && task.user_ids.length
);

const ManagerPage = () => {
  const { isAuthenticated, user } = useAuth();
  const api = useApi();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [formData, setFormData] = useState({
    title: '',
    start_date: '',
    end_date: ''
  });
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [tasks, setTasks] = useState([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [competitions, setCompetitions] = useState([]);
  const [loadingCompetitions, setLoadingCompetitions] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);
  const [editFormData, setEditFormData] = useState({ title: '', start_date: '', end_date: '' });
  const [expandedCompetitionId, setExpandedCompetitionId] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState({});
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [managingParticipants, setManagingParticipants] = useState(null);
  const [competitionParticipants, setCompetitionParticipants] = useState({});
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantSearchText, setParticipantSearchText] = useState('');
  const [editTasks, setEditTasks] = useState([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
  const [failedChatTasks, setFailedChatTasks] = useState([]);
  const [pendingTasksCounts, setPendingTasksCounts] = useState({});
  const [pendingTasks, setPendingTasks] = useState({});
  const [loadingPendingTasks, setLoadingPendingTasks] = useState(false);
  const [activePendingCompetitionId, setActivePendingCompetitionId] = useState(null);
  const [activeTasksManagementCompetitionId, setActiveTasksManagementCompetitionId] = useState(null);
  const [competitionTasks, setCompetitionTasks] = useState({});
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [doneStatusId, setDoneStatusId] = useState(null);

  /** Закрыть все раскрытые блоки действий по соревнованию (взаимоисключающий режим). */
  const closeAllCompetitionPanels = useCallback(() => {
    setExpandedCompetitionId(null);
    setActivePendingCompetitionId(null);
    setManagingParticipants(null);
    setActiveTasksManagementCompetitionId(null);
    setParticipantSearchText('');
    setEditingCompetition(null);
    setEditFormData({ title: '', start_date: '', end_date: '' });
    setEditTasks([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
  }, []);

  useEffect(() => {
    document.title = 'Управление соревнованиями | Геймификация предприятий';
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon-g.svg';
    document.head.appendChild(link);

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (user?.role !== 'admin' && user?.role !== 'manager') {
      navigate('/');
      return;
    }

    loadUsers();
    loadCompetitions();
    loadTags();
    loadTaskStatuses();
  }, [isAuthenticated, user, navigate]);

  const loadTags = async () => {
    try {
      const data = await api.get('/tags');
      setAllTags(data || []);
    } catch (err) {
      console.error('Ошибка загрузки тегов:', err);
    }
  };

  const loadTaskStatuses = async () => {
    try {
      const data = await api.get('/task-statuses');
      setTaskStatuses(data || []);
      const doneStatus = (data || []).find((status) => status.code === 'done');
      if (doneStatus) {
        setDoneStatusId(doneStatus.id);
      }
    } catch (err) {
      console.error('Ошибка загрузки статусов задач:', err);
    }
  };

  useEffect(() => {
    const competitionIdParam = searchParams.get('competitionId');
    if (competitionIdParam && competitions.length > 0) {
      const competitionId = parseInt(competitionIdParam);
      const competition = competitions.find(c => c.id === competitionId);
      if (competition) {
        const shouldLoadLeaderboard = !leaderboardData[competitionId] || expandedCompetitionId !== competitionId;

        const loadLeaderboardForCompetition = async () => {
          try {
            if (!leaderboardData[competitionId]) {
              setLoadingLeaderboard(true);
              const data = await api.get(`/leaderboard/${competitionId}`);
              setLeaderboardData(prev => ({ ...prev, [competitionId]: data || [] }));
            }
            if (expandedCompetitionId !== competitionId) {
              setExpandedCompetitionId(competitionId);
            }
            setTimeout(() => {
              const element = document.getElementById(`competition-${competitionId}`);
              if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 300);

            setTimeout(() => {
              setSearchParams({});
            }, 500);
          } catch (err) {
            console.error('Ошибка загрузки рейтинга:', err);
            if (expandedCompetitionId !== competitionId) {
              setExpandedCompetitionId(competitionId);
            }
            setTimeout(() => {
              setSearchParams({});
            }, 500);
          } finally {
            setLoadingLeaderboard(false);
          }
        };

        if (shouldLoadLeaderboard) {
          loadLeaderboardForCompetition();
        } else {
          if (expandedCompetitionId !== competitionId) {
            setExpandedCompetitionId(competitionId);
          }
          setTimeout(() => {
            const element = document.getElementById(`competition-${competitionId}`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            setSearchParams({});
          }, 300);
        }
      } else {
        setSearchParams({});
      }
    }
  }, [searchParams, competitions]);

  const getUserTotalScore = (user) => {
    if (!user || !Array.isArray(user.participants)) return 0;
    return user.participants.reduce((sum, p) => sum + (p.score || 0), 0);
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      // Загружаем пользователей и их участия через participants
      const users = await api.get('/participants/users');
      setAllUsers(users || []);
    } catch (err) {
      console.error('Ошибка загрузки пользователей:', err);
      setError('Не удалось загрузить список пользователей');
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadPendingTasksCounts = async () => {
    try {
      const data = await api.get('/competitions/pending-tasks-counts');
      const map = {};
      (data || []).forEach((item) => {
        map[item.competition_id] = item.pending_count;
      });
      setPendingTasksCounts(map);
    } catch (err) {
      console.error('Ошибка загрузки задач на подтверждение:', err);
    }
  };

  const loadCompetitions = async () => {
    try {
      setLoadingCompetitions(true);
      const comps = await api.get('/competitions');
      setCompetitions(comps || []);
      await loadPendingTasksCounts();
    } catch (err) {
      console.error('Ошибка загрузки соревнований:', err);
      setError('Не удалось загрузить список соревнований');
    } finally {
      setLoadingCompetitions(false);
    }
  };

  const loadPendingTasksForCompetition = async (competitionId) => {
    try {
      setLoadingPendingTasks(true);
      const tasks = await api.get(`/competitions/${competitionId}/pending-tasks`);
      setPendingTasks((prev) => ({
        ...prev,
        [competitionId]: tasks || [],
      }));
      setPendingTasksCounts((prev) => ({
        ...prev,
        [competitionId]: (tasks || []).length,
      }));
    } catch (err) {
      console.error('Ошибка загрузки задач на подтверждение:', err);
      setError('Не удалось загрузить задачи на подтверждение');
    } finally {
      setLoadingPendingTasks(false);
    }
  };

  const loadCompetitionTasksForManager = async (competitionId) => {
    try {
      setLoadingPendingTasks(true);
      const tasks = await api.get(`/manager/competitions/${competitionId}/tasks`);
      setCompetitionTasks((prev) => ({
        ...prev,
        [competitionId]: tasks || [],
      }));
    } catch (err) {
      console.error('Ошибка загрузки задач соревнования:', err);
      setError('Не удалось загрузить задачи соревнования');
    } finally {
      setLoadingPendingTasks(false);
    }
  };

  const togglePendingTasksSection = async (competitionId) => {
    if (activePendingCompetitionId === competitionId) {
      setActivePendingCompetitionId(null);
      return;
    }
    closeAllCompetitionPanels();
    setActivePendingCompetitionId(competitionId);
    await loadPendingTasksForCompetition(competitionId);
  };



  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      const newSelected = prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId];

      setTasks(currentTasks =>
        currentTasks.map(task => ({
          ...task,
          user_ids: task.user_ids.filter(id => newSelected.includes(id))
        }))
      );

      return newSelected;
    });
  };

  const selectAllUsers = () => {
    const allFilteredUserIds = filteredUsers.map(user => user.id);
    setSelectedUsers(allFilteredUserIds);
  };

  const deselectAllUsers = () => {
    setSelectedUsers([]);
    setTasks(currentTasks =>
      currentTasks.map(task => ({
        ...task,
        user_ids: []
      }))
    );
  };

  const addTask = () => {
    setTasks(prev => [...prev, { title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
  };

  const removeTask = (index) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  const updateTask = (index, field, value) => {
    setTasks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const toggleTaskUser = (taskIndex, userId) => {
    setTasks(prev => {
      const updated = [...prev];
      const task = updated[taskIndex];
      if (task.user_ids.includes(userId)) {
        task.user_ids = task.user_ids.filter(id => id !== userId);
      } else {
        task.user_ids = [...task.user_ids, userId];
      }
      return updated;
    });
  };

  const toggleTaskTag = (taskIndex, tagId) => {
    setTasks(prev => {
      const updated = [...prev];
      const task = updated[taskIndex];
      const tag_ids = task.tag_ids || [];
      if (tag_ids.includes(tagId)) {
        updated[taskIndex] = { ...task, tag_ids: tag_ids.filter(id => id !== tagId) };
      } else {
        updated[taskIndex] = { ...task, tag_ids: [...tag_ids, tagId] };
      }
      return updated;
    });
  };

  const addEditTask = () => {
    setEditTasks(prev => [...prev, { title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
  };

  const removeEditTask = (index) => {
    setEditTasks(prev => prev.filter((_, i) => i !== index));
  };

  const updateEditTask = (index, field, value) => {
    setEditTasks(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const toggleEditTaskUser = (taskIndex, userId) => {
    setEditTasks(prev => {
      const updated = [...prev];
      const task = updated[taskIndex];
      if (task.user_ids.includes(userId)) {
        task.user_ids = task.user_ids.filter(id => id !== userId);
      } else {
        task.user_ids = [...task.user_ids, userId];
      }
      return updated;
    });
  };

  const toggleEditTaskTag = (taskIndex, tagId) => {
    setEditTasks(prev => {
      const updated = [...prev];
      const task = updated[taskIndex];
      const tag_ids = task.tag_ids || [];
      if (tag_ids.includes(tagId)) {
        updated[taskIndex] = { ...task, tag_ids: tag_ids.filter(id => id !== tagId) };
      } else {
        updated[taskIndex] = { ...task, tag_ids: [...tag_ids, tagId] };
      }
      return updated;
    });
  };


  const formatLocalDateTime = (dateInput) => new Date(dateInput).toISOString();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.title.trim()) {
      setError('Введите название соревнования');
      return;
    }

    if (!formData.start_date) {
      setError('Выберите дату начала соревнования');
      return;
    }

    if (!formData.end_date) {
      setError('Выберите дедлайн соревнования');
      return;
    }

    const startDate = new Date(formData.start_date);
    const endDate = new Date(formData.end_date);

    if (endDate <= startDate) {
      setError('Дедлайн должен быть позже даты начала');
      return;
    }

    if (selectedUsers.length === 0) {
      setError('Выберите хотя бы одного участника');
      return;
    }

    const validTasks = tasks.filter(hasTaskInput);
    if (validTasks.length === 0 || validTasks.some(task => !isCompleteTask(task))) {
      setError('Укажите название, описание, исполнителей и срок каждой добавленной задачи');
      return;
    }

    try {
      setLoading(true);

      const assessedTasks = await assessTaskBatch(api, validTasks);
      const competition = await api.post('/competitions', {
        title: formData.title.trim(),
        start_date: formatLocalDateTime(startDate),
        end_date: formatLocalDateTime(endDate)
      });

      const competitionId = typeof competition.id === 'string' ? parseInt(competition.id) : competition.id;

      const assignPromises = selectedUsers.map(userId =>
        api.post('/participants', {
          competition_id: competitionId,
          user_id: userId
        })
      );

      await Promise.all(assignPromises);

      const failedTasks = [];

      for (let i = 0; i < assessedTasks.length; i++) {
        const task = assessedTasks[i];
        // Send an absolute UTC timestamp; inputs and display remain in the user's local time.
        const dueDateIso = task.due_date ? new Date(task.due_date).toISOString() : null;

        setSuccess(`Создание задач: ${i + 1} из ${assessedTasks.length}...`);

        const chatResponse = await api.post('/chat', {
          title: task.title.trim(),
          description: task.description.trim(),
          ...taskAnalysisPayload(task),
          user_ids: task.user_ids,
          due_date: dueDateIso,
          competition_id: competitionId,
          tag_ids: (task.tag_ids && task.tag_ids.length > 0) ? task.tag_ids : undefined
        });

        if (!chatResponse || !chatResponse.task_created) {
          failedTasks.push({
            title: task.title.trim(),
            reply: chatResponse?.reply || 'Задача не была создана.'
          });
        }

        if (i < assessedTasks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms задержка
        }
      }

      if (failedTasks.length > 0) {
        const failedTitles = failedTasks.map(t => `«${t.title}»`).join(', ');
        setSuccess(`Соревнование создано. Некоторые задачи не были созданы: ${failedTitles}.`);
        setFailedChatTasks(failedTasks);
      } else {
        setSuccess('Соревнование и все задачи успешно созданы!');
        setFailedChatTasks([]);
      }

      setFormData({ title: '', start_date: '', end_date: '' });
      setSelectedUsers([]);
      setTasks([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);

      await loadCompetitions();

      if (failedTasks.length === 0) {
        setTimeout(() => setSuccess(''), 5000);
      }
    } catch (err) {
      console.error('Ошибка создания соревнования:', err);
      setError(err.message || 'Не удалось создать соревнование');
    } finally {
      setLoading(false);
    }
  };

  const handleEditCompetition = async (competition) => {
    closeAllCompetitionPanels();
    setEditingCompetition(competition);
    setError('');
    setSuccess('');
    setFailedChatTasks([]);
    const startDate = new Date(competition.start_date);
    const endDate = new Date(competition.end_date);
    const formatDateTimeLocal = (date) => {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    setEditFormData({
      title: competition.title,
      start_date: formatDateTimeLocal(startDate),
      end_date: formatDateTimeLocal(endDate)
    });
    setEditTasks([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
    await loadCompetitionParticipants(competition.id);
  };

  const handleCancelEdit = () => {
    setEditingCompetition(null);
    setEditFormData({ title: '', start_date: '', end_date: '' });
    setEditTasks([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
    setError('');
    setSuccess('');
    setFailedChatTasks([]);
  };

  const loadCompetitionParticipants = async (competitionId) => {
    try {
      setLoadingParticipants(true);
      // Загружаем участников конкретного соревнования через participants
      const data = await api.get(`/participants/competition/${competitionId}`);
      const participants = (data || []).map(item => item.user_id);
      setCompetitionParticipants(prev => ({
        ...prev,
        [competitionId]: participants
      }));
    } catch (err) {
      console.error('Ошибка загрузки участников:', err);
      setError('Не удалось загрузить участников соревнования');
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleManageParticipants = async (competitionId) => {
    if (managingParticipants === competitionId) {
      setManagingParticipants(null);
      setParticipantSearchText('');
      return;
    }
    closeAllCompetitionPanels();
    setManagingParticipants(competitionId);
    setParticipantSearchText('');
    await loadCompetitionParticipants(competitionId);
  };

  const handleAddParticipant = async (competitionId, userId) => {
    try {
      setLoading(true);
      await api.post('/participants', {
        competition_id: competitionId,
        user_id: userId
      });

      await loadCompetitionParticipants(competitionId);
      setSuccess('Участник успешно добавлен в соревнование!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка добавления участника:', err);
      setError(err.message || 'Не удалось добавить участника');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveParticipant = async (competitionId, userId) => {
    try {
      setLoading(true);
      await api.delete(`/participants/competition/${competitionId}/user/${userId}`);

      await loadCompetitionParticipants(competitionId);
      setSuccess('Участник успешно удалён из соревнования!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка удаления участника:', err);
      setError(err.message || 'Не удалось удалить участника');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTask = async (competitionId, taskId) => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      await api.put(`/manager/tasks/${taskId}/confirm`, {});
      await loadPendingTasksForCompetition(competitionId);
      await loadPendingTasksCounts();
      setSuccess('Задача подтверждена, баллы начислены.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка подтверждения задачи:', err);
      setError(err.message || 'Не удалось подтвердить задачу');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTaskByManager = async (competitionId, taskId) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту задачу?')) {
      return;
    }
    try {
      setLoading(true);
      setError('');
      setSuccess('');
      await api.delete(`/manager/tasks/${taskId}`);
      await loadPendingTasksForCompetition(competitionId);
      await loadPendingTasksCounts();
      await loadCompetitionTasksForManager(competitionId);
      setSuccess('Задача удалена.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка удаления задачи менеджером:', err);
      setError(err.message || 'Не удалось удалить задачу');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredUsersForParticipants = () => {
    if (!allUsers.length) return [];

    return allUsers.filter(user => {
      const matchesSearch = participantSearchText.trim() === '' ||
        `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(participantSearchText.toLowerCase());
      return matchesSearch;
    });
  };

  const handleUpdateCompetition = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!editFormData.title.trim()) {
      setError('Введите название соревнования');
      return;
    }

    if (!editFormData.start_date || !editFormData.end_date) {
      setError('Заполните все поля дат');
      return;
    }

    const startDate = new Date(editFormData.start_date);
    const endDate = new Date(editFormData.end_date);

    if (endDate <= startDate) {
      setError('Дедлайн должен быть позже даты начала');
      return;
    }

    const validEditTasks = editTasks.filter(hasTaskInput);
    if (validEditTasks.some(task => !isCompleteTask(task))) {
      setError('Укажите название, описание, исполнителей и срок каждой добавленной задачи');
      return;
    }

    try {
      setLoading(true);
      const assessedTasks = await assessTaskBatch(api, validEditTasks);
      await api.put(`/competitions/${editingCompetition.id}`, {
        title: editFormData.title.trim(),
        start_date: formatLocalDateTime(startDate),
        end_date: formatLocalDateTime(endDate)
      });

      if (assessedTasks.length > 0) {
        const failedTasks = [];

        for (let i = 0; i < assessedTasks.length; i++) {
          const task = assessedTasks[i];
          const dueDateIso = task.due_date ? new Date(task.due_date).toISOString() : null;

          setSuccess(`Обновление соревнования и создание задач: ${i + 1} из ${assessedTasks.length}...`);

          const chatResponse = await api.post('/chat', {
            title: task.title.trim(),
            description: task.description.trim(),
            ...taskAnalysisPayload(task),
            user_ids: task.user_ids,
            due_date: dueDateIso,
            competition_id: editingCompetition.id,
            tag_ids: (task.tag_ids && task.tag_ids.length > 0) ? task.tag_ids : undefined
          });

          if (!chatResponse || !chatResponse.task_created) {
            failedTasks.push({
              title: task.title.trim(),
              reply: chatResponse?.reply || 'Задача не была создана.'
            });
          }

          if (i < assessedTasks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        if (failedTasks.length > 0) {
          const failedTitles = failedTasks.map(t => `«${t.title}»`).join(', ');
          setSuccess(`Соревнование обновлено. Некоторые задачи не были созданы: ${failedTitles}.`);
          setFailedChatTasks(failedTasks);
        } else {
          setSuccess('Соревнование успешно обновлено и все задачи добавлены!');
          setFailedChatTasks([]);
          setEditingCompetition(null);
          setEditFormData({ title: '', start_date: '', end_date: '' });
          setEditTasks([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
          setTimeout(() => setSuccess(''), 5000);
        }
      } else {
        setSuccess('Соревнование успешно обновлено!');
        setFailedChatTasks([]);
        setEditingCompetition(null);
        setEditFormData({ title: '', start_date: '', end_date: '' });
        setEditTasks([{ title: '', description: '', user_ids: [], tag_ids: [], due_date: '' }]);
        setTimeout(() => setSuccess(''), 5000);
      }

      await loadCompetitions();
    } catch (err) {
      console.error('Ошибка обновления соревнования:', err);
      setError(err.message || 'Не удалось обновить соревнование');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCompetition = async (competitionId) => {
    if (!window.confirm('Вы уверены, что хотите удалить это соревнование? Все пользователи будут отписаны от него.')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/competitions/${competitionId}`);
      setSuccess('Соревнование успешно удалено!');
      await loadCompetitions();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Ошибка удаления соревнования:', err);
      setError(err.message || 'Не удалось удалить соревнование');
    } finally {
      setLoading(false);
    }
  };


  const formatDateTime = (dateString) => {
    if (!dateString) return '';

    let date;
    if (dateString.includes('Z') || dateString.match(/[+-]\d{2}:\d{2}$/)) {
      date = new Date(dateString);
    } else {
      const dateMatch = dateString.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (dateMatch) {
        const [, year, month, day, hours, minutes, seconds] = dateMatch;
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
                       parseInt(hours), parseInt(minutes), parseInt(seconds || 0));
      } else {
        date = new Date(dateString);
      }
    }

    if (isNaN(date.getTime())) return dateString;

    return date.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCompetitionStatus = (competition) => {
    const now = new Date();
    const startDate = new Date(competition.start_date);
    const endDate = new Date(competition.end_date);

    if (now < startDate) {
      return { text: 'Не началось', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' };
    } else if (now >= startDate && now <= endDate) {
      return { text: 'Идёт', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' };
    } else {
      return { text: 'Завершено', color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' };
    }
  };

  const toggleLeaderboard = async (competitionId) => {
    if (expandedCompetitionId === competitionId) {
      setExpandedCompetitionId(null);
      return;
    }

    closeAllCompetitionPanels();

    if (leaderboardData[competitionId]) {
      setExpandedCompetitionId(competitionId);
      return;
    }

    try {
      setLoadingLeaderboard(true);
      const data = await api.get(`/leaderboard/${competitionId}`);
      setLeaderboardData(prev => ({ ...prev, [competitionId]: data || [] }));
      setExpandedCompetitionId(competitionId);
    } catch (err) {
      console.error('Ошибка загрузки рейтинга:', err);
      setError('Не удалось загрузить рейтинг соревнования');
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const filteredUsers = allUsers.filter((user) => {
    if (!searchText.trim()) {
      return true;
    }

    const query = searchText.trim().toLowerCase();
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
    const email = (user.email || '').toLowerCase();

    return fullName.includes(query) || email.includes(query);
  });

  if (!isAuthenticated || (user?.role !== 'admin' && user?.role !== 'manager')) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            Управление соревнованиями
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Просматривайте, редактируйте и создавайте новые соревнования
          </p>
        </div>

        {/* Список существующих соревнований */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Существующие соревнования
            </h2>
            <button
              onClick={loadCompetitions}
              disabled={loadingCompetitions}
              className="px-4 py-2 text-base bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 w-full sm:w-auto shrink-0"
            >
              <svg className={`w-4 h-4 ${loadingCompetitions ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Обновить
            </button>
          </div>

          {loadingCompetitions ? (
            <div className="text-center py-8">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Загрузка соревнований...</p>
            </div>
          ) : competitions.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Нет созданных соревнований
            </p>
          ) : (
            <div className="space-y-4">
              {competitions.map((competition) => (
                <div
                  key={competition.id}
                  id={`competition-${competition.id}`}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {editingCompetition?.id === competition.id ? (
                    // Форма редактирования
                    <form onSubmit={handleUpdateCompetition} className="space-y-4">
                      <div>
                        <label className="block mb-1 text-base font-medium text-gray-700 dark:text-gray-300">
                          Название *
                        </label>
                        <input
                          type="text"
                          value={editFormData.title}
                          onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block mb-1 text-base font-medium text-gray-700 dark:text-gray-300">
                            Дата начала *
                          </label>
                          <input
                            type="datetime-local"
                            value={editFormData.start_date}
                            onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                            min="1900-01-01T00:00"
                            max="9999-12-31T23:59"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-base font-medium text-gray-700 dark:text-gray-300">
                            Дедлайн *
                          </label>
                          <input
                            type="datetime-local"
                            value={editFormData.end_date}
                            onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                            min={editFormData.start_date || "1900-01-01T00:00"}
                            max="9999-12-31T23:59"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                            required
                          />
                        </div>
                      </div>

                      {/* Добавление задач */}
                      <div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
                          <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                            Добавить задачи ({editTasks.filter(isCompleteTask).length} добавлено)
                          </label>
                          <button
                            type="button"
                            onClick={addEditTask}
                            className="px-3 py-1.5 text-base bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1 w-full sm:w-auto shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Добавить задачу
                          </button>
                        </div>

                        <div className="space-y-4">
                          {editTasks.map((task, index) => (
                            <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/30">
                              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-3">
                                <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                                  Задача #{index + 1}
                                </span>
                                {editTasks.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeEditTask(index)}
                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 self-start sm:self-auto"
                                    title="Удалить задачу"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                )}
                              </div>

                              <div className="space-y-3">
                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Название задачи *
                          </label>
                          <input
                            type="text"
                            value={task.title}
                            maxLength={500}
                            onChange={(e) => updateEditTask(index, 'title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Введите название задачи"
                          />
                        </div>

                        <div>
                          <label htmlFor={`edit-task-description-${index}`} className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Описание задачи *
                          </label>
                          <textarea
                            id={`edit-task-description-${index}`}
                            value={task.description}
                            onChange={(e) => updateEditTask(index, 'description', e.target.value)}
                            maxLength={10000}
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          />
                        </div>

                        <TaskAnalysisPreview
                          task={task}
                          api={api}
                          id={`edit-task-points-${index}`}
                          onUpdate={(value) => updateEditTask(index, 'assessment', value)}
                        />

                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Теги ({(task.tag_ids || []).length} выбрано)
                          </label>
                          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-2 max-h-32 overflow-y-auto bg-white dark:bg-gray-700">
                            {allTags.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                Нет доступных тегов
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {allTags.map((tag) => (
                                  <label
                                    key={tag.id}
                                    className="flex items-center px-2 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(task.tag_ids || []).includes(tag.id)}
                                      onChange={() => toggleEditTaskTag(index, tag.id)}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-1"
                                    />
                                    <span className="ml-2 text-xs text-gray-900 dark:text-gray-100">
                                      {tag.name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Дата выполнения *
                          </label>
                          <input
                            type="datetime-local"
                            value={task.due_date ? task.due_date.slice(0, 16) : ''}
                            onChange={(e) => updateEditTask(index, 'due_date', e.target.value)}
                            min={editFormData.start_date ? editFormData.start_date.slice(0, 16) : undefined}
                            max={editFormData.end_date ? editFormData.end_date.slice(0, 16) : undefined}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                                <div>
                                  <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Пользователи * ({task.user_ids.length} выбрано)
                                  </label>
                                  <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-2 max-h-40 overflow-y-auto bg-white dark:bg-gray-700">
                                    {loadingParticipants ? (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                        Загрузка участников...
                                      </p>
                                    ) : !competitionParticipants[editingCompetition.id] || competitionParticipants[editingCompetition.id]?.length === 0 ? (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                        Нет участников в этом соревновании
                                      </p>
                                    ) : (
                                      <div className="space-y-1">
                                        {allUsers
                                          .filter(userItem => competitionParticipants[editingCompetition.id]?.includes(userItem.id))
                                          .map((userItem) => (
                                            <label
                                              key={userItem.id}
                                              className="flex items-center p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={task.user_ids.includes(userItem.id)}
                                                onChange={() => toggleEditTaskUser(index, userItem.id)}
                                                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-1"
                                              />
                                              <span className="ml-2 text-xs text-gray-900 dark:text-gray-100">
                                                {userItem.first_name} {userItem.last_name}
                                              </span>
                                            </label>
                                          ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Сообщения об ошибках и успехе прямо в форме редактирования */}
                      {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg relative">
                          <button
                            onClick={() => setError('')}
                            className="absolute top-2 right-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xl leading-none"
                            title="Закрыть"
                          >
                            ×
                          </button>
                          <p className="text-red-600 dark:text-red-400 text-base pr-6">{error}</p>
                        </div>
                      )}

                      {success && (
                        <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg space-y-2 relative">
                          <button
                            onClick={() => {
                              setSuccess('');
                              setFailedChatTasks([]);
                            }}
                            className="absolute top-2 right-2 text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-xl leading-none"
                            title="Закрыть"
                          >
                            ×
                          </button>
                          <p className="text-green-600 dark:text-green-400 text-base pr-6">{success}</p>

                          {failedChatTasks.length > 0 && (
                            <div className="mt-2 border-t border-green-200 dark:border-green-800 pt-2">
                              <p className="text-xs text-green-700 dark:text-green-300 mb-1">
                                Некоторые задачи не были созданы. Проверьте формулировки:
                              </p>
                              <ul className="list-disc pl-4 space-y-1">
                                {failedChatTasks.map((task, idx) => (
                                  <li key={idx} className="text-xs text-green-800 dark:text-green-200">
                                    <span className="font-semibold">«{task.title}»</span>
                                    {task.reply && (
                                      <span className="ml-1 text-[11px] text-green-700 dark:text-green-300">
                                        — {task.reply}
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="submit"
                          disabled={loading}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-medium transition-colors disabled:opacity-50 w-full sm:w-auto"
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={loading}
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-base font-medium transition-colors disabled:opacity-50 w-full sm:w-auto"
                        >
                          Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 break-words">
                              {competition.title}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${getCompetitionStatus(competition).color}`}>
                              {getCompetitionStatus(competition).text}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-base text-gray-600 dark:text-gray-400">
                            <div>
                              <span className="font-semibold">Начало:</span> {formatDateTime(competition.start_date)}
                            </div>
                            <div>
                              <span className="font-semibold">Дедлайн:</span> {formatDateTime(competition.end_date)}
                            </div>
                            <div>
                              <span className="font-semibold">Создано:</span> {formatDateTime(competition.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col w-full sm:flex-row sm:flex-wrap sm:w-auto ml-0 sm:ml-4 gap-2 shrink-0">
                          <button
                            onClick={() => togglePendingTasksSection(competition.id)}
                            disabled={loading}
                            className="relative px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto flex justify-center"
                            title="Задачи на подтверждение"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                              />
                            </svg>
                            {pendingTasksCounts[competition.id] > 0 && (
                              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] leading-none rounded-full bg-red-500 text-white">
                                {pendingTasksCounts[competition.id]}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => handleManageParticipants(competition.id)}
                            disabled={loading}
                            className="px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto flex justify-center"
                            title="Управление участниками"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => toggleLeaderboard(competition.id)}
                            disabled={loading || loadingLeaderboard}
                            className="px-3 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto flex justify-center"
                            title="Показать рейтинг"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleEditCompetition(competition)}
                            disabled={loading}
                            className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto flex justify-center"
                            title="Редактировать"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCompetition(competition.id)}
                            disabled={loading}
                            className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto flex justify-center"
                            title="Удалить"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {/* Рейтинг соревнования */}
                      {expandedCompetitionId === competition.id && (
                        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
                            🏆 Рейтинг участников
                          </h4>
                          {loadingLeaderboard ? (
                            <div className="text-center py-4">
                              <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                              <p className="mt-2 text-base text-gray-600 dark:text-gray-400">Загрузка рейтинга...</p>
                            </div>
                          ) : leaderboardData[competition.id]?.length > 0 ? (
                            <div className="space-y-2">
                              {leaderboardData[competition.id].map((user, index) => (
                                <div
                                  key={index}
                                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400 w-8">
                                      {index + 1}
                                    </span>
                                    <span className="text-base font-medium text-gray-800 dark:text-gray-100">
                                      {user.first_name} {user.last_name}
                                    </span>
                                  </div>
                                  <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                                    {user.score} баллов
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-base text-gray-500 dark:text-gray-400 text-center py-4">
                              Нет участников в этом соревновании
                            </p>
                          )}
                        </div>
                      )}
         
                      {/* Блок задач на подтверждение */}
                      {activePendingCompetitionId === competition.id && (
                        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-3">
                             Задачи, ожидающие подтверждения
                          </h4>
                          {loadingPendingTasks ? (
                            <div className="text-center py-4">
                              <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent"></div>
                              <p className="mt-2 text-base text-gray-600 dark:text-gray-400">
                                Загрузка задач на подтверждение...
                              </p>
                            </div>
                          ) : (pendingTasks[competition.id] || []).length > 0 ? (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {pendingTasks[competition.id].map((task) => {
                                const userInfo = allUsers.find((u) => u.id === task.user_id);
                                return (
                                  <div
                                    key={task.id}
                                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg"
                                  >
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-base font-medium text-gray-800 dark:text-gray-100">
                                        {task.title}
                                      </span>
                                      <span className="text-xs text-gray-600 dark:text-gray-400">
                                        Исполнитель:{' '}
                                        {userInfo
                                          ? `${userInfo.first_name} ${userInfo.last_name}`
                                          : `Пользователь #${task.user_id}`}
                                      </span>
                                      {typeof task.estimated_points === 'number' && (
                                        <span className="text-xs text-indigo-600 dark:text-indigo-400">
                                          Баллы за задачу: {task.estimated_points}
                                        </span>
                                      )}
                                      {task.ai_analysis_metadata?.explanation && (
                                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                          {task.ai_analysis_metadata.explanation}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                                      <button
                                        onClick={() => handleConfirmTask(competition.id, task.id)}
                                        disabled={loading}
                                        className="px-3 py-1.5 text-base bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto"
                                      >
                                        Подтвердить
                                      </button>
                                      <button
                                        onClick={() => handleDeleteTaskByManager(competition.id, task.id)}
                                        disabled={loading}
                                        className="px-3 py-1.5 text-base bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto"
                                      >
                                        Удалить
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-base text-gray-500 dark:text-gray-400">
                              Нет задач, ожидающих подтверждения
                            </p>
                          )}
                        </div>
                      )}

                      {/* Удаление задач соревнования */}
                      <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                        <button
                          onClick={async () => {
                            if (activeTasksManagementCompetitionId === competition.id) {
                              setActiveTasksManagementCompetitionId(null);
                              return;
                            }
                            closeAllCompetitionPanels();
                            setActiveTasksManagementCompetitionId(competition.id);
                            await loadCompetitionTasksForManager(competition.id);
                          }}
                          className="flex items-center gap-2 text-base text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 text-xs">
                            🗑
                          </span>
                          <span>Удаление задач соревнования</span>
                        </button>

                        {activeTasksManagementCompetitionId === competition.id && (
                          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                            {(competitionTasks[competition.id] || []).length === 0 ? (
                              <p className="text-base text-gray-500 dark:text-gray-400">
                                В этом соревновании пока нет задач.
                              </p>
                            ) : (
                              competitionTasks[competition.id].map((task) => {
                                const userInfo = allUsers.find((u) => u.id === task.user_id);
                                const isCompleted =
                                  (doneStatusId != null && task.status_id === doneStatusId);

                                return (
                                  <div
                                    key={task.id}
                                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                                  >
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-base font-medium text-gray-800 dark:text-gray-100">
                                        {task.title}
                                      </span>
                                      <span className="text-xs text-gray-600 dark:text-gray-400">
                                        Пользователь:{' '}
                                        {userInfo
                                          ? `${userInfo.first_name} ${userInfo.last_name}`
                                          : `#${task.user_id}`}
                                      </span>
                                      {task.due_date && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          Дедлайн:{' '}
                                          {new Date(task.due_date).toLocaleString('ru-RU')}
                                        </span>
                                      )}
                                      {isCompleted && (
                                        <span className="mt-1 text-xs font-semibold text-green-600 dark:text-green-400">
                                          Задача выполнена (нельзя удалить)
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (!isCompleted) {
                                          handleDeleteTaskByManager(competition.id, task.id);
                                        }
                                      }}
                                      disabled={loading || isCompleted}
                                      className={`px-3 py-1.5 text-base rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto shrink-0 ${
                                        isCompleted
                                          ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                                      }`}
                                      title={
                                        isCompleted
                                          ? 'Нельзя удалить уже выполненную задачу'
                                          : 'Удалить задачу'
                                      }
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>

                      {/* Управление участниками */}
                      {managingParticipants === competition.id && (
                        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-600">
                          <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">
                            👥 Управление участниками
                          </h4>

                          {/* Поиск пользователей */}
                          <div className="mb-4">
                            <input
                              type="text"
                              placeholder="Найти участника"
                              value={participantSearchText}
                              onChange={(e) => setParticipantSearchText(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          {loadingParticipants ? (
                            <div className="text-center py-4">
                              <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                              <p className="mt-2 text-base text-gray-600 dark:text-gray-400">Загрузка участников...</p>
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {getFilteredUsersForParticipants().map((user) => {
                                const isParticipant = competitionParticipants[competition.id]?.includes(user.id) || false;
                                return (
                                  <div
                                    key={user.id}
                                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg"
                                  >
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
                                      <div className="min-w-0">
                                        <span className="text-base font-medium text-gray-800 dark:text-gray-100">
                                          {user.first_name} {user.last_name}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 block break-all">
                                          {user.email}
                                        </span>
                                      </div>
                                      {isParticipant && (
                                        <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded shrink-0 self-start sm:self-auto">
                                          Участник
                                        </span>
                                      )}
                                    </div>
                                    {isParticipant ? (
                                      <button
                                        onClick={() => handleRemoveParticipant(competition.id, user.id)}
                                        disabled={loading}
                                        className="px-3 py-1 text-base bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto shrink-0"
                                      >
                                        Удалить
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleAddParticipant(competition.id, user.id)}
                                        disabled={loading}
                                        className="px-3 py-1 text-base bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50 w-full sm:w-auto shrink-0"
                                      >
                                        Добавить
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                              {getFilteredUsersForParticipants().length === 0 && (
                                <p className="text-base text-gray-500 dark:text-gray-400 text-center py-4">
                                  Пользователи не найдены
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Форма создания нового соревнования */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">
            Создать новое соревнование
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Название соревнования */}
            <div>
              <label htmlFor="title" className="block mb-2 text-base font-medium text-gray-700 dark:text-gray-300">
                Название соревнования *
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Введите название соревнования"
                required
              />
            </div>

            {/* Дата начала соревнования */}
            <div>
              <label htmlFor="start_date" className="block mb-2 text-base font-medium text-gray-700 dark:text-gray-300">
                Дата начала соревнования *
              </label>
              <input
                type="datetime-local"
                id="start_date"
                name="start_date"
                value={formData.start_date}
                onChange={handleInputChange}
                min="1900-01-01T00:00"
                max="9999-12-31T23:59"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Дедлайн соревнования */}
            <div>
              <label htmlFor="end_date" className="block mb-2 text-base font-medium text-gray-700 dark:text-gray-300">
                Дедлайн соревнования *
              </label>
              <input
                type="datetime-local"
                id="end_date"
                name="end_date"
                value={formData.end_date}
                onChange={handleInputChange}
                min={formData.start_date || "1900-01-01T00:00"}
                max="9999-12-31T23:59"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {/* Выбор участников */}
            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
                <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                  Участники соревнования * ({selectedUsers.length} выбрано)
                </label>
                {!loadingUsers && filteredUsers.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                    <button
                      type="button"
                      onClick={selectAllUsers}
                      className="px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors w-full sm:w-auto"
                    >
                      Выбрать всех
                    </button>
                    {selectedUsers.length > 0 && (
                      <button
                        type="button"
                        onClick={deselectAllUsers}
                        className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors w-full sm:w-auto"
                      >
                        Снять выбор
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Поиск */}
              {!loadingUsers && allUsers.length > 0 && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Найти участника"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchText && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Найдено: {filteredUsers.length} из {allUsers.length}
                    </p>
                  )}
                </div>
              )}

              {loadingUsers ? (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                  <p className="mt-2 text-gray-600 dark:text-gray-400">Загрузка пользователей...</p>
                </div>
              ) : allUsers.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                  {user?.role === 'manager' ? 'Администратор ещё не закрепил за вами сотрудников' : 'Нет доступных пользователей'}
                </p>
              ) : filteredUsers.length === 0 ? (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/30">
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">
                    Пользователи не найдены по заданным критериям
                  </p>
                </div>
              ) : (
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 max-h-96 overflow-y-auto bg-gray-50 dark:bg-gray-700/30">
                  <div className="space-y-2">
                    {filteredUsers.map((userItem) => (
                      <label
                        key={userItem.id}
                        className="flex items-center p-3 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(userItem.id)}
                          onChange={() => toggleUserSelection(userItem.id)}
                          className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                        <div className="ml-3 min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                          <span className="text-base font-medium text-gray-900 dark:text-gray-100">
                            {userItem.first_name} {userItem.last_name}
                          </span>
                          <span className="mt-1 block text-base text-gray-500 dark:text-gray-400">
                            ({userItem.email})
                          </span>
                          <span className="mt-1 block text-base text-indigo-600 dark:text-indigo-400 font-semibold">
                            {getUserTotalScore(userItem)} баллов
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Добавление задач */}
            {formData.title.trim() && selectedUsers.length > 0 && (
              <div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mb-3">
                  <label className="block text-base font-medium text-gray-700 dark:text-gray-300">
                    Задачи соревнования ({tasks.filter(isCompleteTask).length} добавлено)
                  </label>
                  <button
                    type="button"
                    onClick={addTask}
                    className="px-3 py-1.5 text-base bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1 w-full sm:w-auto shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Добавить задачу
                  </button>
                </div>

                <div className="space-y-4">
                  {tasks.map((task, index) => (
                    <div key={index} className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-700/30">
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-3">
                        <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                          Задача #{index + 1}
                        </span>
                        {tasks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTask(index)}
                            className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 self-start sm:self-auto"
                            title="Удалить задачу"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Название задачи *
                          </label>
                          <input
                            type="text"
                            value={task.title}
                            maxLength={500}
                            onChange={(e) => updateTask(index, 'title', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Введите название задачи"
                          />
                        </div>

                        <div>
                          <label htmlFor={`new-task-description-${index}`} className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Описание задачи *
                          </label>
                          <textarea
                            id={`new-task-description-${index}`}
                            value={task.description}
                            onChange={(e) => updateTask(index, 'description', e.target.value)}
                            maxLength={10000}
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          />
                        </div>

                        <TaskAnalysisPreview
                          task={task}
                          api={api}
                          id={`new-task-points-${index}`}
                          onUpdate={(value) => updateTask(index, 'assessment', value)}
                        />

                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Теги ({(task.tag_ids || []).length} выбрано)
                          </label>
                          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-2 max-h-32 overflow-y-auto bg-white dark:bg-gray-700">
                            {allTags.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                Нет доступных тегов
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {allTags.map((tag) => (
                                  <label
                                    key={tag.id}
                                    className="flex items-center px-2 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(task.tag_ids || []).includes(tag.id)}
                                      onChange={() => toggleTaskTag(index, tag.id)}
                                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-1"
                                    />
                                    <span className="ml-2 text-xs text-gray-900 dark:text-gray-100">
                                      {tag.name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                            Дата выполнения *
                          </label>
                          <input
                            type="datetime-local"
                            value={task.due_date ? task.due_date.slice(0, 16) : ''}
                            onChange={(e) => updateTask(index, 'due_date', e.target.value)}
                            min={formData.start_date ? formData.start_date.slice(0, 16) : undefined}
                            max={formData.end_date ? formData.end_date.slice(0, 16) : undefined}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                              Пользователи * ({task.user_ids.length} выбрано)
                            </label>
                            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-2 max-h-40 overflow-y-auto bg-white dark:bg-gray-700">
                              {selectedUsers.length === 0 ? (
                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                  Сначала выберите участников соревнования выше
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {allUsers
                                    .filter(userItem => selectedUsers.includes(userItem.id))
                                    .map((userItem) => (
                                      <label
                                        key={userItem.id}
                                        className="flex items-center p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={task.user_ids.includes(userItem.id)}
                                          onChange={() => toggleTaskUser(index, userItem.id)}
                                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-1"
                                        />
                                        <span className="ml-2 text-xs text-gray-900 dark:text-gray-100">
                                          {userItem.first_name} {userItem.last_name}
                                        </span>
                                      </label>
                                    ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formData.title.trim() && selectedUsers.length === 0 && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-yellow-600 dark:text-yellow-400 text-base">
                  Выберите участников соревнования выше, чтобы добавить задачи
                </p>
              </div>
            )}

            {/* Сообщения об ошибках и успехе - показываем только при создании нового соревнования (не при редактировании) */}
            {!editingCompetition && error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-red-600 dark:text-red-400 text-base">{error}</p>
              </div>
            )}

            {!editingCompetition && success && (
              <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <p className="text-green-600 dark:text-green-400 text-base flex-1 min-w-0">{success}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSuccess('');
                      setFailedChatTasks([]);
                    }}
                    className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 text-xs font-semibold self-end sm:self-auto shrink-0"
                    aria-label="Закрыть сообщение"
                  >
                    ✕
                  </button>
                </div>

                {failedChatTasks.length > 0 && (
                  <div className="mt-1 border-t border-green-200 dark:border-green-800 pt-2">
                    <p className="text-xs text-green-700 dark:text-green-300 mb-1">
                      Некоторые задачи не были созданы. Проверьте формулировки:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      {failedChatTasks.map((task, idx) => (
                        <li key={idx} className="text-xs text-green-800 dark:text-green-200">
                          <span className="font-semibold">«{task.title}»</span>
                          {task.reply && (
                            <span className="ml-1 text-[11px] text-green-700 dark:text-green-300">
                              — {task.reply}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Кнопка отправки */}
            <button
              type="submit"
              disabled={loading || loadingUsers}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Создание...' : 'Создать соревнование'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ManagerPage;

