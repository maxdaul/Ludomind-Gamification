#!/usr/bin/env python3
"""
Скрипт запуска приложения с опциональной инициализацией БД.
Гарантирует, что инициализация БД происходит только один раз до запуска приложения.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    demo_available = Path(__file__).with_name('db_backup.sql').is_file()
    load_demo = os.getenv("INIT_DEMO_DB", str(demo_available)).lower() == "true"
    if load_demo or os.getenv("INIT_DB", "false").lower() == "true":
        print("Инициализация базы данных...")
        from database import init_db
        init_db(seed_defaults=not load_demo)
        print("Инициализация завершена.")
    
    from database import migrate_staff_and_notifications

    migrate_staff_and_notifications()

    if load_demo:
        from scripts.restore_demo_db import restore_demo_data

        if restore_demo_data(skip_existing=True):
            print("Тестовые данные загружены.")

    cmd = [
        "uvicorn",
        "main:app",
        "--host", "0.0.0.0",
        "--port", "8000",
        "--workers", "6"
    ]
    
    os.execvp("uvicorn", cmd)

