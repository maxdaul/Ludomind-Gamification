"""Load the bundled test data into an empty Ludomind database."""

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
CONFIG = ('.env.local', '.env.db.local', '.env.grafana.local')

RESTORE_LOCK = """
LOCK TABLE public.users, public.competitions, public.participants, public.tasks,
    public.rewards, public.task_tags, public.task_deadline_notifications, public.positions,
    public.departments, public.tags, public.task_status, public.reward_types
    IN SHARE ROW EXCLUSIVE MODE;
"""

CHECK_TARGET = """
    SELECT EXISTS (
        SELECT 1 FROM public.users UNION ALL SELECT 1 FROM public.competitions
        UNION ALL SELECT 1 FROM public.participants UNION ALL SELECT 1 FROM public.tasks
        UNION ALL SELECT 1 FROM public.rewards UNION ALL SELECT 1 FROM public.task_tags
        UNION ALL SELECT 1 FROM public.task_deadline_notifications
        UNION ALL SELECT 1 FROM public.positions UNION ALL SELECT 1 FROM public.departments
    ), EXISTS (SELECT 1 FROM public.tags WHERE name NOT IN ('SoftSkills', 'HardSkills', 'Creativity', 'Management'))
        OR EXISTS (
            SELECT 1 FROM public.task_status WHERE (code, name) NOT IN (
                ('todo', 'К выполнению'), ('in_progress', 'В работе'),
                ('hold done', 'Ожидает подтверждения'), ('done', 'Выполнено'), ('wasted', 'Просрочено')
            )
        ) OR EXISTS (
            SELECT 1 FROM public.reward_types
            WHERE code NOT IN ('bonus1', 'bonus2', 'bonus3') OR code <> name OR description IS NOT NULL
        );
"""


def restore_demo_data(*, skip_existing=False):
    from db import engine

    backup = (ROOT / 'db_backup.sql').read_text(encoding='utf-8')
    connection = engine.raw_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            cursor.execute(RESTORE_LOCK)
            cursor.execute(CHECK_TARGET)
            has_data, has_custom_dictionaries = cursor.fetchone()
            if has_data or has_custom_dictionaries:
                if skip_existing:
                    connection.rollback()
                    return False
                raise ValueError('База уже содержит данные или изменённые справочники. Импорт отменён.')

            # Replace starter dictionaries so imported IDs and foreign keys are preserved.
            cursor.execute('DELETE FROM public.tags; DELETE FROM public.task_status; DELETE FROM public.reward_types;')
            cursor.execute(backup)
        connection.commit()
        return True
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def restore_configured_db():
    from database import init_db, migrate_staff_and_notifications

    init_db(seed_defaults=False)
    migrate_staff_and_notifications()
    try:
        restore_demo_data()
    except ValueError as error:
        raise SystemExit(str(error)) from None
    print('Тестовые данные импортированы.')


def main():
    if not any((ROOT / name).exists() for name in CONFIG):
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'setup_local_env.py')], cwd=ROOT, check=True)
    missing = [name for name in CONFIG if not (ROOT / name).is_file()]
    if missing:
        raise SystemExit('Отсутствуют файлы конфигурации: ' + ', '.join(missing))

    try:
        subprocess.run(['docker', 'compose', 'up', '-d', '--build', '--wait', 'db'], cwd=ROOT, check=True)
        subprocess.run(['docker', 'compose', 'run', '--build', '--rm', '--no-deps', '-T', 'backend', 'python', '-c',
                        'from scripts.restore_demo_db import restore_configured_db; restore_configured_db()'],
                       cwd=ROOT, check=True)
    except subprocess.CalledProcessError:
        raise SystemExit('Импорт не выполнен. Проверьте причину в сообщении PostgreSQL.') from None
    print('Для запуска приложения: docker compose up -d --build')


if __name__ == '__main__':
    main()
