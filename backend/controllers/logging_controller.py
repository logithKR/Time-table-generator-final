"""
Admin Logging API Routes.

Endpoints for admins to view centralized logs from log.db.
Requires admin authentication.

Endpoints:
  GET  /api/admin/logs/auth     - Fetch authentication logs
  GET  /api/admin/logs/activity - Fetch activity logs  
  GET  /api/admin/logs/all      - Fetch all logs combined (paginated)
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc
from utils.log_database import get_log_db
from models.log_models import AuthLog, ActivityLog
from middleware.admin_guard import verify_admin_token
from typing import List, Dict, Any
import math

router = APIRouter(prefix="/logs", tags=["Admin Logs"])


# ===================================================================
# Auth Logs Endpoints
# ===================================================================

@router.get("/auth", dependencies=[Depends(verify_admin_token)])
def get_auth_logs(
    email: str = Query(None, description="Filter by email"),
    event_type: str = Query(None, description="Filter by event type (LOGIN, LOGOUT, etc.)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Items per page"),
    log_db: Session = Depends(get_log_db),
) -> Dict[str, Any]:
    """
    Fetch authentication logs from log.db.
    
    Query Parameters:
    - email: Filter by user email
    - event_type: Filter by event type (LOGIN, LOGOUT, TOKEN_REFRESH, etc.)
    - page: Page number (default 1)
    - limit: Items per page (default 50, max 500)
    
    Response includes: id, email, event_type, timestamp_ist, timestamp_gmt, user_agent
    """
    try:
        query = log_db.query(AuthLog)
        
        # Apply filters
        if email:
            query = query.filter(AuthLog.email.ilike(f"%{email}%"))
        if event_type:
            query = query.filter(AuthLog.event_type == event_type)
        
        # Count total
        total = query.count()
        total_pages = math.ceil(total / limit) if total > 0 else 0
        
        # Fetch paginated results (newest first)
        logs = query.order_by(desc(AuthLog.id)).offset((page - 1) * limit).limit(limit).all()
        
        # Format response
        logs_data = [
            {
                "id": log.id,
                "user_id": log.user_id,
                "email": log.email,
                "event_type": log.event_type,
                "timestamp_ist": log.timestamp_ist,
                "timestamp_gmt": log.timestamp_gmt,
                "user_agent": log.user_agent,
            }
            for log in logs
        ]
        
        return {
            "data": logs_data,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch auth logs: {str(e)}"
        )


# ===================================================================
# Activity Logs Endpoints
# ===================================================================

@router.get("/activity", dependencies=[Depends(verify_admin_token)])
def get_activity_logs(
    email: str = Query(None, description="Filter by user email"),
    action: str = Query(None, description="Filter by API endpoint"),
    method: str = Query(None, description="Filter by HTTP method (GET, POST, etc.)"),
    status_code: int = Query(None, description="Filter by HTTP status code"),
    department_code: str = Query(None, description="Filter by department code"),
    semester: int = Query(None, description="Filter by semester"),
    mutating_only: bool = Query(False, description="Filter only mutating actions (saves, generates)"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Items per page"),
    log_db: Session = Depends(get_log_db),
) -> Dict[str, Any]:
    """
    Fetch activity logs with optional filtering and pagination.
    
    Query Parameters:
    - email: Filter by user email
    - action: Filter by action/endpoint name
    - method: Filter by HTTP method (GET, POST, etc.)
    - status_code: Filter by HTTP response code (200, 404, 500, etc.)
    - mutating_only: If true, only return timetable saves/generations
    - page: Page number (default 1)
    - limit: Items per page (default 50, max 500)
    
    Response includes: id, email, action, method, status_code, timestamp_ist, timestamp_gmt
    """
    try:
        query = log_db.query(ActivityLog)
        
        # Apply filters
        if email:
            query = query.filter(ActivityLog.email.ilike(f"%{email}%"))
        if action:
            query = query.filter(ActivityLog.action.ilike(f"%{action}%"))
        if method:
            query = query.filter(ActivityLog.method == method.upper())
        if status_code:
            query = query.filter(ActivityLog.status_code == status_code)
        if department_code:
            query = query.filter(ActivityLog.department_code == department_code)
        if semester:
            query = query.filter(ActivityLog.semester == semester)
        if mutating_only:
            query = query.filter(ActivityLog.action.in_([
                "/api/timetable/save", "/timetable/save", 
                "/api/generate", "/generate"
            ]))
        
        # Count total
        total = query.count()
        total_pages = math.ceil(total / limit) if total > 0 else 0
        
        # Fetch paginated results (newest first)
        logs = query.order_by(desc(ActivityLog.id)).offset((page - 1) * limit).limit(limit).all()
        
        # Format response
        logs_data = [
            {
                "id": log.id,
                "user_id": log.user_id,
                "email": log.email,
                "action": log.action,
                "method": log.method,
                "status_code": log.status_code,
                "department_code": log.department_code,
                "semester": log.semester,
                "timestamp_ist": log.timestamp_ist,
                "timestamp_gmt": log.timestamp_gmt,
            }
            for log in logs
        ]
        
        return {
            "data": logs_data,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch activity logs: {str(e)}"
        )


@router.get("/timetable-summary", dependencies=[Depends(verify_admin_token)])
def get_timetable_summary(
    department_code: str = Query(..., description="Department Code"),
    semester: int = Query(..., description="Semester"),
    log_db: Session = Depends(get_log_db),
) -> Dict[str, Any]:
    """
    Fetch a quick summary of edits for a specific timetable.
    """
    try:
        # Get all activity for this timetable
        logs = log_db.query(ActivityLog).filter(
            ActivityLog.department_code == department_code,
            ActivityLog.semester == semester
        ).order_by(desc(ActivityLog.id)).all()
        
        total_edits = 0
        total_generations = 0
        last_edited_by = None
        last_edited_at = None
        
        for log in logs:
            if log.action in ["/api/timetable/save", "/timetable/save", "/api/generate", "/generate"]:
                if log.action in ["/api/timetable/save", "/timetable/save"]:
                    total_edits += 1
                elif log.action in ["/api/generate", "/generate"]:
                    total_generations += 1
                    
                # The first matching log (due to desc order) is the most recent edit/generation
                if not last_edited_by:
                    last_edited_by = log.email
                    last_edited_at = log.timestamp_ist
        
        # Check TimetableStatus from main DB
        from models import TimetableStatus
        from utils.database import get_db
        db = next(get_db())
        status_record = db.query(TimetableStatus).filter_by(department_code=department_code, semester=semester).first()
        is_finalized = status_record.is_finalized if status_record else False
        
        return {
            "department_code": department_code,
            "semester": semester,
            "total_edits": total_edits,
            "total_generations": total_generations,
            "last_edited_by": last_edited_by or "None",
            "last_edited_at": last_edited_at or "Never",
            "is_finalized": is_finalized
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timetable summary: {str(e)}"
        )



# ===================================================================
# Combined Logs (All Types)
# ===================================================================

@router.get("/all", dependencies=[Depends(verify_admin_token)])
def get_all_logs(
    log_type: str = Query("all", pattern="^(auth|activity|all)$", description="Log type filter"),
    email: str = Query(None, description="Filter by email"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=500, description="Items per page"),
    log_db: Session = Depends(get_log_db),
) -> Dict[str, Any]:
    """
    Fetch all logs (auth + activity combined).
    
    Query Parameters:
    - log_type: Filter by type (auth, activity, all) - default 'all'
    - email: Filter by user email
    - page: Page number (default 1)
    - limit: Items per page (default 50, max 500)
    """
    try:
        if log_type == "auth":
            return get_auth_logs(email=email, page=page, limit=limit, log_db=log_db)
        elif log_type == "activity":
            return get_activity_logs(email=email, page=page, limit=limit, log_db=log_db)
        else:  # "all"
            # For combined view, we just return auth logs (you can expand this if needed)
            return get_auth_logs(email=email, page=page, limit=limit, log_db=log_db)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch logs: {str(e)}"
        )
