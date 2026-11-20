from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, HTTPBasic, HTTPBasicCredentials
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from auth import SECRET_KEY, ALGORITHM, verify_password
from db import get_db
from database import User

security = HTTPBearer(auto_error=False)
docs_basic = HTTPBasic(auto_error=False)
ROLES = {"user", "manager", "admin"}


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось проверить токен",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer" or not SECRET_KEY:
        raise invalid
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"require_exp": True, "require_sub": True},
        )
        raw_id = payload.get("user_id")
        if isinstance(raw_id, bool) or not isinstance(raw_id, (str, int)):
            raise invalid
        user_id = int(raw_id)
        if user_id <= 0 or str(user_id) != str(raw_id) or payload.get("role") not in ROLES:
            raise invalid
        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject:
            raise invalid
    except (JWTError, ValueError, TypeError):
        raise invalid from None

    user = db.query(User).filter(User.id == user_id).first()
    if user is None or user.email != subject or user.role not in ROLES or not getattr(user, "is_active", True):
        raise invalid
    # Role claims are historical. Current database permissions take precedence.
    return {"user": user, "role": user.role}


def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return current_user


def require_manager(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Требуются права менеджера или администратора")
    return current_user


def require_docs_admin(
    bearer: HTTPAuthorizationCredentials | None = Depends(security),
    basic: HTTPBasicCredentials | None = Depends(docs_basic),
    db: Session = Depends(get_db),
):
    if bearer is not None:
        return require_admin(get_current_user(bearer, db))
    invalid = HTTPException(
        status_code=401,
        detail="Войдите под учётной записью администратора",
        headers={"WWW-Authenticate": 'Basic realm="API documentation", charset="UTF-8"'},
    )
    if basic is None:
        raise invalid
    user = db.query(User).filter(User.email == basic.username).first()
    if user is None or not verify_password(basic.password, user.password_hash) or not getattr(user, "is_active", True):
        raise invalid
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return {"user": user, "role": user.role}
