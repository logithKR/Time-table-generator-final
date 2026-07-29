"""
Logging Models for centralized logging system (log.db).

Tables:
  - auth_logs: Tracks user authentication events (Login/Logout)
  - activity_logs: Tracks user API activity (HTTP requests)

All timestamps are stored in both IST and GMT in readable format (AM/PM).
"""

from sqlalchemy import Column, Integer, String, DateTime, Index
from sqlalchemy.sql import func
from utils.log_database import LoggingBase
from datetime import datetime
import pytz

# Timezone definitions
IST = pytz.timezone('Asia/Kolkata')
GMT = pytz.timezone('GMT')


def get_ist_time() -> str:
    """Return current time in IST formatted as readable string with AM/PM."""
    now = datetime.now(IST)
    return now.strftime('%Y-%m-%d %I:%M %p')


def get_gmt_time() -> str:
    """Return current time in GMT formatted as readable string with AM/PM."""
    now = datetime.now(GMT)
    return now.strftime('%Y-%m-%d %I:%M %p')


class AuthLog(LoggingBase):
    """
    Authentication events: Login, Logout, Token Refresh, etc.
    """
    __tablename__ = "auth_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(255), nullable=True)  # Internal user ID if available
    email = Column(String(255), nullable=False, index=True)  # User email
    event_type = Column(String(50), nullable=False)  # "LOGIN", "LOGOUT", "TOKEN_REFRESH", etc.
    timestamp_ist = Column(String(100), nullable=False, default=get_ist_time)  # e.g., "2026-04-20 11:30 AM"
    timestamp_gmt = Column(String(100), nullable=False, default=get_gmt_time)  # e.g., "2026-04-20 06:00 AM"
    user_agent = Column(String(512), nullable=True)  # Browser/client info
    
    # Indexes for faster queries
    __table_args__ = (
        Index('idx_auth_email', 'email'),
        Index('idx_auth_timestamp_ist', 'timestamp_ist'),
        Index('idx_auth_event', 'event_type'),
    )


class ActivityLog(LoggingBase):
    """
    User activity events: API calls, HTTP requests made by authenticated users.
    """
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(255), nullable=True)  # Internal user ID if available
    email = Column(String(255), nullable=True, index=True)  # User email (if authenticated)
    action = Column(String(255), nullable=False)  # API endpoint called (e.g., "/api/departments")
    method = Column(String(20), nullable=False)  # Mapped action type: Fetch, Generate, Edit, etc.
    status_code = Column(Integer, nullable=False)  # HTTP response code (200, 404, 500, etc.)
    department_code = Column(String(255), nullable=True, index=True)  # Associated department
    semester = Column(Integer, nullable=True, index=True)  # Associated semester
    timestamp_ist = Column(String(100), nullable=False, default=get_ist_time)  # e.g., "2026-04-20 11:30 AM"
    timestamp_gmt = Column(String(100), nullable=False, default=get_gmt_time)  # e.g., "2026-04-20 06:00 AM"
    
    # Indexes for faster queries
    __table_args__ = (
        Index('idx_activity_email', 'email'),
        Index('idx_activity_timestamp_ist', 'timestamp_ist'),
        Index('idx_activity_action', 'action'),
        Index('idx_activity_dept_sem', 'department_code', 'semester'),
    )
