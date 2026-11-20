import logging
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from dependencies import require_docs_admin
from routes import router

logger = logging.getLogger("gamification.errors")
if not logger.handlers:
    logger.addHandler(logging.StreamHandler(sys.stdout))
logger.setLevel(logging.ERROR)
logger.propagate = False

app = FastAPI(
    title="Gamification API",
    description="Платформа геймификации задач и соревнований",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    if exc.status_code >= 500:
        logger.error("HTTP failure status=%s method=%s", exc.status_code, request.method)
        return JSONResponse(status_code=exc.status_code, content={"detail": "Сервис временно недоступен. Повторите запрос позже."}, headers=exc.headers)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError):
    # Do not reflect submitted passwords/tokens or raw request bodies.
    errors = [{"loc": e["loc"], "msg": "Некорректное значение поля", "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(Exception)
async def server_error(request: Request, exc: Exception):
    logger.error("Unhandled server failure type=%s method=%s", type(exc).__name__, request.method)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера. Повторите запрос позже."})


@app.get("/openapi.json", include_in_schema=False)
async def protected_openapi(current_user: dict = Depends(require_docs_admin)):
    return JSONResponse(app.openapi())


@app.get("/docs", include_in_schema=False)
async def protected_docs(current_user: dict = Depends(require_docs_admin)):
    # Browser Basic credentials are reused for the same-origin schema request.
    # Swagger API operations continue to use its Bearer Authorize control.
    return get_swagger_ui_html(openapi_url="/openapi.json", title="Gamification API")


app.include_router(router)

STATIC_ROOT = (Path(__file__).resolve().parent / "frontend" / "dist").resolve()
SPA_ROUTES = {"", "login", "leaderboards", "profile", "statistics", "manager", "admin"}
assets = STATIC_ROOT / "assets"
if assets.is_dir():
    app.mount("/assets", StaticFiles(directory=assets, follow_symlink=False), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str = ""):
    if "\\" in full_path or any(part in {".", ".."} for part in full_path.split("/")):
        raise HTTPException(status_code=404, detail="Not Found")
    candidate = (STATIC_ROOT / full_path).resolve()
    try:
        candidate.relative_to(STATIC_ROOT)
    except ValueError:
        raise HTTPException(status_code=404, detail="Not Found") from None
    if full_path and candidate.is_file() and not any(part.startswith(".") for part in Path(full_path).parts):
        return FileResponse(candidate)
    if full_path.rstrip("/") in SPA_ROUTES and (STATIC_ROOT / "index.html").is_file():
        return FileResponse(STATIC_ROOT / "index.html")
    raise HTTPException(status_code=404, detail="Not Found")
