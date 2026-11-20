"""Create local Docker credentials without replacing existing files."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
paths = [root / name for name in ('.env.local', '.env.db.local', '.env.grafana.local')]
existing = [p.name for p in paths if p.exists()]
if existing:
    raise SystemExit('Local configuration already exists; no files changed: ' + ', '.join(existing))
db_password = secrets.token_urlsafe(32)
grafana_key = secrets.token_urlsafe(40)
values = [
    {'DB_PASSWORD': db_password, 'SECRET_KEY': secrets.token_urlsafe(64), 'GRAFANA_INFINITY_KEY': grafana_key},
    {'POSTGRES_PASSWORD': db_password},
    {'GF_SECURITY_ADMIN_PASSWORD': secrets.token_urlsafe(32), 'GRAFANA_INFINITY_KEY': grafana_key},
]
for path, settings in zip(paths, values):
    path.write_text(''.join(f'{key}={value}\n' for key, value in settings.items()), encoding='utf-8')
print('Created local env files. Credentials were not printed. Do not commit these files.')
