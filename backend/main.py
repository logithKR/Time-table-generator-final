from fastapi import FastAPI
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from config.settings import settings
from config.cors import setup_cors
from middleware.error_handler import setup_error_handlers
from middleware.auth_middleware import AuthMiddleware
from middleware.activity_logging_middleware import ActivityLoggingMiddleware
from utils.database import engine, Base
from utils.log_database import log_engine, LoggingBase
from routes.legacy_routes import router as legacy_router
from controllers.auth_controller import router as auth_router
from controllers.admin_controller import router as admin_router
from controllers.admin_timetable_controller import router as admin_timetable_router
from controllers.logging_controller import router as logging_router
import uvicorn


# Create all DB tables on startup
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Import models so Base.metadata knows about all tables
    import models  # noqa
    import models.log_models  # noqa - Initialize logging models
    Base.metadata.create_all(bind=engine)
    LoggingBase.metadata.create_all(bind=log_engine)
    print("[STARTUP] All database tables initialized (college_scheduler.db and log.db)")
    yield


app = FastAPI(
    title="BIT Timetable Generator",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# 1. Setup CORS
setup_cors(app)

# 2. Setup strict global exception handlers
setup_error_handlers(app)

# 3. Add Custom Middlewares (order matters - Auth first, then Activity Logging)
app.add_middleware(ActivityLoggingMiddleware)  # Logs all authenticated user activity
app.add_middleware(AuthMiddleware)  # Handles authentication checks

# 4. Mount Auth routes at /api/auth  (frontend calls /api/auth/login, /api/auth/me etc.)
app.include_router(auth_router, prefix="/api")

# 5. Mount Admin routes at /api/admin  (frontend calls /api/admin/login, /api/admin/me, /api/admin/logs)
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(admin_timetable_router, prefix="/api/admin", tags=["Admin"])
app.include_router(logging_router, prefix="/api/admin", tags=["Admin Logs"])

# 6. Mount ALL legacy data routes at /api  (frontend calls /api/departments, /api/generate etc.)
app.include_router(legacy_router, prefix="/api")

# 7. Health / Root
@app.get("/")
def read_root():
    return JSONResponse({"message": "BIT Timetable Generator API is running."})

@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
