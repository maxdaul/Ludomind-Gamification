import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../api/client.js';
import OrganizationDirectory from '../components/OrganizationDirectory.jsx';

const directories = [
  { key: 'positions', field: 'position_id', title: 'Должности', label: 'Должность' },
  { key: 'departments', field: 'department_id', title: 'Подразделения', label: 'Подразделение' },
];

const AdminPage = () => {
  const { isAuthenticated, user } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  // Состояние для всех сущностей
  const [rewardTypes, setRewardTypes] = useState([]);
  const [tags, setTags] = useState([]);
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [organization, setOrganization] = useState({ positions: [], departments: [] });
  
  // Состояние загрузки и ошибок
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Состояние для форм редактирования
  const [editingRewardType, setEditingRewardType] = useState(null);
  const [editingTag, setEditingTag] = useState(null);
  const [editingTaskStatus, setEditingTaskStatus] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingUserPassword, setEditingUserPassword] = useState('');
  
  // Состояние для новых записей
  const [newRewardType, setNewRewardType] = useState({ code: '', name: '', description: '' });
  const [newTag, setNewTag] = useState({ name: '' });
  const [newTaskStatus, setNewTaskStatus] = useState({ code: '', name: '' });
  
  // Состояние для поиска пользователей
  const [userSearchText, setUserSearchText] = useState('');

  useEffect(() => {
    document.title = 'Панель администратора | Геймификация предприятий';
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon-g.svg';
    document.head.appendChild(link);

    // Проверка авторизации и прав администратора
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }

    loadAllData();
  }, [isAuthenticated, user, navigate]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [rewardTypesData, tagsData, taskStatusesData, usersData, organizationData] = await Promise.all([
        api.get('/reward-types'),
        api.get('/tags'),
        api.get('/task-statuses'),
        api.get('/users'),
        api.get('/admin/organization')
      ]);
      
      setRewardTypes(rewardTypesData || []);
      setTags(tagsData || []);
      setTaskStatuses(taskStatusesData || []);
      setAllUsers(usersData || []);
      setOrganization(organizationData);
    } catch (err) {
      console.error('Ошибка загрузки данных:', err);
      setError('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  // ========== REWARD TYPES ==========
  const handleCreateRewardType = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!newRewardType.code.trim() || !newRewardType.name.trim()) {
      setError('Заполните обязательные поля (код и название)');
      return;
    }

    try {
      setLoading(true);
      await api.post('/reward-types', newRewardType);
      setSuccess('Тип награды успешно создан!');
      setNewRewardType({ code: '', name: '', description: '' });
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка создания типа награды:', err);
      setError(err.message || 'Не удалось создать тип награды');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRewardType = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      await api.put(`/reward-types/${editingRewardType.id}`, {
        code: editingRewardType.code,
        name: editingRewardType.name,
        description: editingRewardType.description || null
      });
      setSuccess('Тип награды успешно обновлён!');
      setEditingRewardType(null);
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка обновления типа награды:', err);
      setError(err.message || 'Не удалось обновить тип награды');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRewardType = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот тип награды?')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/reward-types/${id}`);
      setSuccess('Тип награды успешно удалён!');
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка удаления типа награды:', err);
      setError(err.message || 'Не удалось удалить тип награды');
    } finally {
      setLoading(false);
    }
  };

  // ========== TAGS ==========
  const handleCreateTag = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!newTag.name.trim()) {
      setError('Введите название тега');
      return;
    }

    try {
      setLoading(true);
      await api.post('/tags', newTag);
      setSuccess('Тег успешно создан!');
      setNewTag({ name: '' });
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка создания тега:', err);
      setError(err.message || 'Не удалось создать тег');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTag = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      await api.put(`/tags/${editingTag.id}`, {
        name: editingTag.name
      });
      setSuccess('Тег успешно обновлён!');
      setEditingTag(null);
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка обновления тега:', err);
      setError(err.message || 'Не удалось обновить тег');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTag = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот тег?')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/tags/${id}`);
      setSuccess('Тег успешно удалён!');
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка удаления тега:', err);
      setError(err.message || 'Не удалось удалить тег');
    } finally {
      setLoading(false);
    }
  };

  // ========== TASK STATUSES ==========
  const handleCreateTaskStatus = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!newTaskStatus.code.trim() || !newTaskStatus.name.trim()) {
      setError('Заполните обязательные поля (код и название)');
      return;
    }

    try {
      setLoading(true);
      await api.post('/task-statuses', newTaskStatus);
      setSuccess('Статус задачи успешно создан!');
      setNewTaskStatus({ code: '', name: '' });
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка создания статуса задачи:', err);
      setError(err.message || 'Не удалось создать статус задачи');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTaskStatus = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      await api.put(`/task-statuses/${editingTaskStatus.id}`, {
        code: editingTaskStatus.code,
        name: editingTaskStatus.name
      });
      setSuccess('Статус задачи успешно обновлён!');
      setEditingTaskStatus(null);
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка обновления статуса задачи:', err);
      setError(err.message || 'Не удалось обновить статус задачи');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTaskStatus = async (id) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот статус задачи?')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/task-statuses/${id}`);
      setSuccess('Статус задачи успешно удалён!');
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка удаления статуса задачи:', err);
      setError(err.message || 'Не удалось удалить статус задачи');
    } finally {
      setLoading(false);
    }
  };

  // ========== USERS ==========
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setLoading(true);
      const updateData = {
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        email: editingUser.email,
        role: editingUser.role,
        manager_id: editingUser.role === 'user' ? (editingUser.manager_id ?? null) : null,
        position_id: editingUser.position_id ?? null,
        department_id: editingUser.department_id ?? null
      };
      
      // Добавляем пароль только если он был введен
      if (editingUserPassword.trim()) {
        updateData.password = editingUserPassword;
      }
      
      await api.put(`/admin/users/${editingUser.id}`, updateData);
      setSuccess('Данные пользователя успешно обновлены!');
      setEditingUser(null);
      setEditingUserPassword('');
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка обновления пользователя:', err);
      setError(err.message || 'Не удалось обновить данные пользователя');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого пользователя? Все его задачи и награды будут также удалены.')) {
      return;
    }

    try {
      setLoading(true);
      await api.delete(`/admin/users/${userId}`);
      setSuccess('Пользователь успешно удалён!');
      await loadAllData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Ошибка удаления пользователя:', err);
      setError(err.message || 'Не удалось удалить пользователя');
    } finally {
      setLoading(false);
    }
  };

  // Фильтрация пользователей по поисковому запросу
  const filteredUsers = allUsers.filter((userItem) => {
    if (!userSearchText.trim()) {
      return true;
    }

    const query = userSearchText.trim().toLowerCase();
    const fullName = `${userItem.first_name} ${userItem.last_name}`.toLowerCase();
    const email = (userItem.email || '').toLowerCase();
    const role = userItem.role === 'admin' ? 'администратор' : 
                 userItem.role === 'manager' ? 'менеджер' : 'пользователь';
    
    return fullName.includes(query) || 
           email.includes(query) || 
           role.includes(query);
  });

  if (!isAuthenticated || user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto min-w-0">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">
            Панель администратора
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Управление пользователями, корпоративными справочниками и настройками задач
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg">
            {success}
          </div>
        )}

        {loading && (
          <div className="mb-4 text-center py-4">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
          {/* Типы наград */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 min-w-0 overflow-hidden">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <img src="/award.png" alt="Reward" className="w-6 h-6" /> Типы наград
            </h2>
            
            {/* Форма создания */}
            <form onSubmit={handleCreateRewardType} className="mb-4 space-y-3">
              <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Код</span>
<input
                type="text"
                placeholder="Код"
                value={newRewardType.code}
                onChange={(e) => setNewRewardType({ ...newRewardType, code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                required
              />
</label>
              <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Название</span>
<input
                type="text"
                placeholder="Название"
                value={newRewardType.name}
                onChange={(e) => setNewRewardType({ ...newRewardType, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                required
              />
</label>
              <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Описание (опционально)</span>
<input
                type="text"
                placeholder="Описание (опционально)"
                value={newRewardType.description}
                onChange={(e) => setNewRewardType({ ...newRewardType, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
              />
</label>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-medium transition-colors disabled:opacity-50"
              >
                Создать
              </button>
            </form>

            {/* Список */}
            <div className="space-y-2 max-h-96 overflow-y-auto overflow-x-hidden min-w-0">
              {rewardTypes.map((rt) => (
                <div
                  key={rt.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg min-w-0"
                >
                  {editingRewardType?.id === rt.id ? (
                    <form onSubmit={handleUpdateRewardType} className="flex-1 space-y-2 w-full min-w-0 max-w-full">
                      <div className="flex flex-col gap-2 sm:flex-row w-full min-w-0">
                        <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Код</span>
<input
                          type="text"
                          value={editingRewardType.code}
                          onChange={(e) => setEditingRewardType({ ...editingRewardType, code: e.target.value })}
                          placeholder="Код"
                          className="w-full min-w-0 sm:flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                          required
                        />
</label>
                        <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Название</span>
<input
                          type="text"
                          value={editingRewardType.name}
                          onChange={(e) => setEditingRewardType({ ...editingRewardType, name: e.target.value })}
                          placeholder="Название"
                          className="w-full min-w-0 sm:flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                          required
                        />
</label>
                      </div>
                      <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Описание</span>
<input
                        type="text"
                        value={editingRewardType.description || ''}
                        onChange={(e) => setEditingRewardType({ ...editingRewardType, description: e.target.value })}
                        placeholder="Описание"
                        className="w-full min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                      />
</label>
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="submit"
                          className="w-full sm:w-auto px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-base"
                        >
                          ✓ Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRewardType(null)}
                          className="w-full sm:w-auto px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-base"
                        >
                          ✕ Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-800 dark:text-gray-100 break-words">
                          {rt.name} ({rt.code})
                        </div>
                        {rt.description && (
                          <div className="text-base text-gray-600 dark:text-gray-400 break-words">
                            {rt.description}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                        <button
                          onClick={() => setEditingRewardType(rt)}
                          className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-base hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        >
                          <img src="/edit.png" alt="Edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRewardType(rt.id)}
                          className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-base hover:bg-red-200 dark:hover:bg-red-900/50"
                        >
                          <img src="/trash.png" alt="Trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Теги */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 min-w-0 overflow-hidden">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <img src="/tag.png" alt="Reward" className="w-6 h-6" /> Теги
            </h2>
            
            {/* Форма создания */}
            <form onSubmit={handleCreateTag} className="mb-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Название тега</span>
<input
                  type="text"
                  placeholder="Название тега"
                  value={newTag.name}
                  onChange={(e) => setNewTag({ name: e.target.value })}
                  className="w-full min-w-0 sm:flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                  required
                />
</label>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-medium transition-colors disabled:opacity-50"
                >
                  Создать
                </button>
              </div>
            </form>

            {/* Список */}
            <div className="space-y-2 max-h-96 overflow-y-auto overflow-x-hidden min-w-0">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg min-w-0"
                >
                  {editingTag?.id === tag.id ? (
                    <form onSubmit={handleUpdateTag} className="flex-1 flex flex-col gap-2 sm:flex-row sm:items-center w-full min-w-0 max-w-full">
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                        className="w-full min-w-0 sm:flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                        required
                      />
                      <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end sm:justify-start">
                        <button
                          type="submit"
                          className="flex-1 sm:flex-none px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-base"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTag(null)}
                          className="flex-1 sm:flex-none px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-base"
                        >
                          ✕
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="font-semibold text-gray-800 dark:text-gray-100 min-w-0 break-words">
                        {tag.name}
                      </div>
                      <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                        <button
                          onClick={() => setEditingTag(tag)}
                          className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-base hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        >
                          <img src="/edit.png" alt="Edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTag(tag.id)}
                          className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-base hover:bg-red-200 dark:hover:bg-red-900/50"
                        >
                          <img src="/trash.png" alt="Trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Статусы задач */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 min-w-0 overflow-hidden">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <img src="/status.png" alt="Reward" className="w-6 h-6" /> Статусы задач
            </h2>
            
            {/* Форма создания */}
            <form onSubmit={handleCreateTaskStatus} className="mb-4 space-y-3">
              <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Код</span>
<input
                type="text"
                placeholder="Код"
                value={newTaskStatus.code}
                onChange={(e) => setNewTaskStatus({ ...newTaskStatus, code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                required
              />
</label>
              <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Название</span>
<input
                type="text"
                placeholder="Название"
                value={newTaskStatus.name}
                onChange={(e) => setNewTaskStatus({ ...newTaskStatus, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                required
              />
</label>
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-medium transition-colors disabled:opacity-50"
              >
                Создать
              </button>
            </form>

            {/* Список */}
            <div className="space-y-2 max-h-96 overflow-y-auto overflow-x-hidden min-w-0">
              {taskStatuses.map((status) => (
                <div
                  key={status.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg min-w-0"
                >
                  {editingTaskStatus?.id === status.id ? (
                    <form onSubmit={handleUpdateTaskStatus} className="flex-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center w-full min-w-0 max-w-full">
                      <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Код</span>
<input
                        type="text"
                        value={editingTaskStatus.code}
                        onChange={(e) => setEditingTaskStatus({ ...editingTaskStatus, code: e.target.value })}
                        placeholder="Код"
                        className="w-full min-w-0 sm:flex-1 sm:min-w-[6rem] px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                        required
                      />
</label>
                      <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Название</span>
<input
                        type="text"
                        value={editingTaskStatus.name}
                        onChange={(e) => setEditingTaskStatus({ ...editingTaskStatus, name: e.target.value })}
                        placeholder="Название"
                        className="w-full min-w-0 sm:flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                        required
                      />
</label>
                      <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end sm:justify-start">
                        <button
                          type="submit"
                          className="flex-1 sm:flex-none px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-base"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTaskStatus(null)}
                          className="flex-1 sm:flex-none px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-base"
                        >
                          ✕
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-800 dark:text-gray-100 break-words">
                          {status.name} ({status.code})
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                        <button
                          onClick={() => setEditingTaskStatus(status)}
                          className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-base hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        >
                          <img src="/edit.png" alt="Edit" className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTaskStatus(status.id)}
                          className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-base hover:bg-red-200 dark:hover:bg-red-900/50"
                        >
                          <img src="/trash.png" alt="Trash" className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {directories.map(({ key, title, label }) => (
            <OrganizationDirectory
              key={key}
              endpoint={`/admin/organization/${key}`}
              title={title}
              label={label}
              entries={organization[key]}
              api={api}
              onChange={(update) => setOrganization((current) => ({ ...current, [key]: update(current[key]) }))}
            />
          ))}

          {/* Пользователи */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 min-w-0 overflow-hidden">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
            <img src="/users.png" alt="Reward" className="w-6 h-6" /> Пользователи
            </h2>

            {/* Поиск пользователей */}
            {allUsers.length > 0 && (
              <div className="mb-4">
                <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Поиск по имени, email, роли...</span>
<input
                  type="text"
                  placeholder="Поиск по имени, email, роли..."
                  value={userSearchText}
                  onChange={(e) => setUserSearchText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
</label>
                {userSearchText && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Найдено: {filteredUsers.length} из {allUsers.length}
                  </p>
                )}
              </div>
            )}

            {/* Список */}
            <div className="space-y-2 max-h-96 overflow-y-auto overflow-x-hidden min-w-0">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {userSearchText ? 'Пользователи не найдены' : 'Нет пользователей'}
                </div>
              ) : (
                filteredUsers.map((userItem) => (
                <div
                  key={userItem.id}
                  className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg min-w-0"
                >
                  {editingUser?.id === userItem.id ? (
                    <form onSubmit={handleUpdateUser} className="space-y-3 w-full min-w-0 max-w-full">
                      <div className="flex flex-col gap-2 sm:flex-row w-full min-w-0">
                        <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Имя</span>
<input
                          type="text"
                          value={editingUser.first_name}
                          onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })}
                          placeholder="Имя"
                          className="w-full min-w-0 sm:flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                          required
                        />
</label>
                        <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Фамилия</span>
<input
                          type="text"
                          value={editingUser.last_name}
                          onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                          placeholder="Фамилия"
                          className="w-full min-w-0 sm:flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                          required
                        />
</label>
                      </div>
                      <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Email</span>
<input
                        type="email"
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        placeholder="Email"
                        className="w-full min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                        required
                      />
</label>
                      <label className="block min-w-0 flex-1">
<span className="mb-1 block text-base text-gray-700 dark:text-gray-300">Новый пароль (оставьте пустым, чтобы не менять)</span>
<input
                        type="password"
                        value={editingUserPassword}
                        onChange={(e) => setEditingUserPassword(e.target.value)}
                        placeholder="Новый пароль (оставьте пустым, чтобы не менять)"
                        className="w-full min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                      />
</label>
                      <select
                        aria-label="Роль пользователя"
                        value={editingUser.role || 'user'}
                        onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                        className="w-full min-w-0 max-w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-base"
                      >
                        <option value="user">Пользователь</option>
                        <option value="manager">Менеджер</option>
                        <option value="admin">Администратор</option>
                      </select>
                      {directories.map(({ key, field, label }) => (
                        <label key={field} className="block text-base text-gray-700 dark:text-gray-300">
                          {label}
                          <select
                            value={editingUser[field] ?? ''}
                            onChange={(event) => setEditingUser({ ...editingUser, [field]: Number(event.target.value) || null })}
                            className="mt-1 w-full min-w-0 rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Не указано</option>
                            {organization[key].map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.name}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                      {editingUser.role === 'user' && (
                        <label className="block text-base text-gray-700 dark:text-gray-300">
                          Менеджер сотрудника
                          <select
                            value={editingUser.manager_id ?? ''}
                            onChange={(e) => setEditingUser({ ...editingUser, manager_id: e.target.value ? Number(e.target.value) : null })}
                            className="mt-1 w-full min-w-0 rounded border border-gray-300 bg-white px-2 py-1 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                          >
                            <option value="">Не назначен</option>
                            {allUsers.filter((entry) => entry.role === 'manager').map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.first_name} {entry.last_name} ({entry.email})</option>
                            ))}
                          </select>
                        </label>
                      )}
                      <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <button
                          type="submit"
                          className="w-full sm:flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-base"
                        >
                          ✓ Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(null);
                            setEditingUserPassword('');
                          }}
                          className="w-full sm:w-auto px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-base shrink-0"
                        >
                          ✕ Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-800 dark:text-gray-100 break-words">
                            {userItem.first_name} {userItem.last_name}
                          </div>
                          <div className="text-base text-gray-600 dark:text-gray-400 break-all">
                            {userItem.email}
                          </div>
                          {directories.map(({ key, field, label }) => {
                            const entry = organization[key].find(({ id }) => id === userItem[field]);
                            return entry && (
                              <p key={field} className="break-words text-base text-gray-600 dark:text-gray-400">
                                {label}: {entry.name}
                              </p>
                            );
                          })}
                          {userItem.role === 'user' && (
                            <p className="text-base text-gray-600 dark:text-gray-400">
                              Менеджер: {allUsers.find((entry) => entry.id === userItem.manager_id)?.email ?? 'не назначен'}
                            </p>
                          )}
                          <div className="text-base text-gray-600 dark:text-gray-400 mt-1">
                            Роль: <span className="font-semibold">
                              {userItem.role === 'admin' ? 'Администратор' : 
                               userItem.role === 'manager' ? 'Менеджер' : 
                               'Пользователь'}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => {
                              setEditingUser(userItem);
                              setEditingUserPassword('');
                            }}
                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-base hover:bg-blue-200 dark:hover:bg-blue-900/50"
                          >
                            <img src="/edit.png" alt="Edit" className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(userItem.id)}
                            className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-base hover:bg-red-200 dark:hover:bg-red-900/50"
                          >
                            <img src="/trash.png" alt="Trash" className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;


