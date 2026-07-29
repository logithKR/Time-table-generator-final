"""
Activity Logging Utilities.

Functions to log user activity events (API calls, HTTP requests)
to the centralized log.db database.
"""

from utils.log_database import get_log_db_transaction
from models.log_models import ActivityLog, get_ist_time, get_gmt_time
from typing import Optional


def log_activity(
    email: Optional[str],
    action: str,  # API endpoint path (e.g., "/api/departments")
    method: str,  # HTTP method: GET, POST, PUT, DELETE, PATCH, etc.
    status_code: int,  # HTTP response status code
    user_id: Optional[str] = None,
    department_code: Optional[str] = None,
    semester: Optional[int] = None,
) -> bool:
    """
    Log a user activity event to the centralized logging system.
    
    Args:
        email: User's email address (None if unauthenticated)
        action: API endpoint called (e.g., "/api/departments")
        method: HTTP method (GET, POST, PUT, DELETE, PATCH)
        status_code: HTTP response status code
        user_id: Optional internal user ID
    
    Returns:
        True if logged successfully, False otherwise
    """
    try:
        with get_log_db_transaction() as db:
            log_entry = ActivityLog(
                user_id=user_id,
                email=email,
                action=action,
                method=method.upper(),
                status_code=status_code,
                department_code=department_code,
                semester=semester,
                timestamp_ist=get_ist_time(),
                timestamp_gmt=get_gmt_time(),
            )
            db.add(log_entry)
            # db.commit() is handled by context manager
            return True
    except Exception as e:
        print(f"[ACTIVITY_LOG_ERROR] Failed to log {method} {action}: {str(e)}")
        return False
