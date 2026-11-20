import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

const Navbar = () => {
  const { isAuthenticated, logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileHeaderVisible, setIsMobileHeaderVisible] = useState(true);
  const [isMobileTaskPanelOpen, setIsMobileTaskPanelOpen] = useState(false);
  const lastScrollYRef = useRef(0);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...(menuRef.current?.querySelectorAll('button, a, input, select, [tabindex="0"]') || [])]
      .filter((element) => !element.disabled);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); setIsMobileMenuOpen(false); }
      if (event.key === 'Tab') {
        const items = controls(); const first = items[0]; const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || !menuRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !menuRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [isMobileMenuOpen]);

  const isActive = (path) => {
    return location.pathname === path;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleScroll = () => {
      if (isMobileTaskPanelOpen) {
        setIsMobileHeaderVisible(true);
        return;
      }
      const currentY = window.scrollY;
      if (currentY < 10) {
        setIsMobileHeaderVisible(true);
      } else if (currentY > lastScrollYRef.current) {
        setIsMobileHeaderVisible(false);
      } else {
        setIsMobileHeaderVisible(true);
      }
      lastScrollYRef.current = currentY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobileTaskPanelOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleTaskPanel = (e) => {
      const open = Boolean(e?.detail?.open);
      setIsMobileTaskPanelOpen(open);
      if (open) setIsMobileHeaderVisible(true);
    };

    window.addEventListener('mobile-task-panel', handleTaskPanel);
    return () => window.removeEventListener('mobile-task-panel', handleTaskPanel);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Не показываем navbar на странице авторизации
  if (location.pathname === '/login') {
    return null;
  }

  return (
    <>
      <nav className="hidden xl:block bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link
                to="/"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/')
                    ? 'text-blue-500 dark:text-blue-600 bg-blue-100 dark:bg-blue-900/40'
                    : 'text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {isAuthenticated && (user?.role === 'admin' || user?.role === 'manager')
                  ? 'Главная'
                  : 'Панель геймификации'}
              </Link>
              {isAuthenticated && user?.role === 'user' && (
                <Link
                  to="/leaderboards"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/leaderboards')
                      ? 'text-blue-500 dark:text-blue-600 bg-blue-100 dark:bg-blue-900/40'
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Список лидеров
                </Link>
              )}
              {isAuthenticated && (
                <Link
                  to="/statistics"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/statistics')
                      ? 'text-blue-500 dark:text-blue-600 bg-blue-100 dark:bg-blue-900/40'
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Cтатистика
                </Link>
              )}
              {isAuthenticated && (user?.role === 'admin' || user?.role === 'manager') && (
                <Link
                  to="/manager"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/manager')
                      ? 'text-blue-500 dark:text-blue-600 bg-blue-100 dark:bg-blue-900/40'
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Управление соревнованиями
                </Link>
              )}
              {isAuthenticated && user?.role === 'admin' && (
                <Link
                  to="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive('/admin')
                      ? 'text-blue-500 dark:text-blue-600 bg-blue-100 dark:bg-blue-900/40'
                      : 'text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  Админ-панель
                </Link>
              )}
            </div>
            <div className="flex items-center space-x-4">
              {isAuthenticated && user && (
                <div className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-200">
                  <button
                    onClick={() => navigate('/profile')}
                    className="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-blue-500 dark:text-blue-600 font-medium"
                    title="Профиль"
                  >
                    {user.email}
                  </button>
                </div>
              )}
              <button
                onClick={toggleTheme}
                className="p-2 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Переключить тему"
              >
                {theme === 'dark' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              {isAuthenticated ? (
                <button
                  onClick={() => {
                    logout();
                    navigate('/login');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-500 dark:hover:text-blue-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  Выйти
                </button>
              ) : (
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-md transition-colors"
                >
                  Войти
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Мобильная шапка */}
      <nav
        className={`xl:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-transform duration-300 ${
          isMobileHeaderVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="px-3 h-14 flex items-center justify-between">
          {/* Гамбургер слева */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-1 rounded-md text-gray-700 dark:text-gray-200"
            ref={menuButtonRef}
            aria-label="Открыть меню"
            aria-controls="mobile-navigation"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Правые кнопки */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-gray-700 dark:text-gray-200"
              aria-label="Переключить тему"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {isAuthenticated && (
              <button
                onClick={() => navigate('/profile')}
                className="p-2 rounded-md text-gray-700 dark:text-gray-200"
                aria-label="Профиль"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Затемнение */}
      {isMobileMenuOpen && (
        <div
          className="xl:hidden fixed inset-0 z-[60] bg-black/50"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Боковая панель слева */}
      {isMobileMenuOpen && <div
        id="mobile-navigation"
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Главное меню"
        className={`xl:hidden fixed top-0 left-0 bottom-0 z-[70] w-72 max-w-full bg-white dark:bg-gray-900 flex flex-col shadow-2xl transition-transform duration-300 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Заголовок панели */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="text-lg font-semibold text-gray-800 dark:text-gray-100">Меню</span>
          <button type="button" onClick={() => setIsMobileMenuOpen(false)} aria-label="Закрыть меню" className="p-2 rounded focus-visible:ring-2 focus-visible:ring-blue-500">✕</button>
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto py-2">
          <button
            onClick={() => navigate('/')}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
              isActive('/') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.75L12 3l9 6.75V21H15v-6H9v6H3V9.75z" />
            </svg>
            Главная
          </button>

          {isAuthenticated && user?.role === 'user' && (
            <button
              onClick={() => navigate('/leaderboards')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                isActive('/leaderboards') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v13M12 3v18M8 11v10" />
              </svg>
              Список лидеров
            </button>
          )}

          {isAuthenticated && (
            <button
              onClick={() => navigate('/statistics')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                isActive('/statistics') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Моя статистика
            </button>
          )}

          {isAuthenticated && (user?.role === 'admin' || user?.role === 'manager') && (
            <button
              onClick={() => navigate('/manager')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                isActive('/manager') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Управление соревнованиями
            </button>
          )}

          {isAuthenticated && user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                isActive('/admin') ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Админ-панель
            </button>
          )}
        </nav>

        {/* Нижняя часть панели */}
        <div className="border-t border-gray-200 dark:border-gray-700 py-2">
          {isAuthenticated && user && (
            <button
              onClick={() => navigate('/profile')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="truncate">{user.email}</span>
            </button>
          )}
          {isAuthenticated ? (
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Выйти
            </button>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              Войти
            </button>
          )}
        </div>
      </div>}

      <div className="h-14 xl:hidden" />
    </>
  );
};

export default Navbar;

