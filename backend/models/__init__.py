from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Index, UniqueConstraint, DateTime
from sqlalchemy.sql import func
from utils.database import Base

class DepartmentMaster(Base):
    __tablename__ = "department_master"
    
    department_code = Column(String, primary_key=True)
    student_count = Column(Integer, default=0, nullable=True)
    pair_add_course_miniproject = Column(Boolean, default=False)

class FacultyMaster(Base):
    __tablename__ = "faculty_master"
    
    faculty_id = Column(String, primary_key=True)
    faculty_name = Column(String, nullable=False)
    faculty_email = Column(String)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    status = Column(String, default='ACTIVE')


# Index for faster queries
Index('idx_faculty_department', FacultyMaster.department_code)


class CourseMaster(Base):
    __tablename__ = "course_master"
    
    # We must establish a composite primary key so same course can exist in multiple departments
    course_code = Column(String, primary_key=True)
    department_code = Column(String, ForeignKey('department_master.department_code'), primary_key=True)
    semester = Column(Integer, primary_key=True)

    course_name = Column(String, nullable=False)
    
    course_category = Column(String)
    delivery_type = Column(String)
    
    lecture_hours = Column(Integer, default=0)
    tutorial_hours = Column(Integer, default=0)
    practical_hours = Column(Integer, default=0)
    
    weekly_sessions = Column(Integer, nullable=False)
    credits = Column(Integer)
    
    is_lab = Column(Boolean, default=False)
    is_elective = Column(Boolean, default=False)
    is_open_elective = Column(Boolean, default=False)
    is_honours = Column(Boolean, default=False)
    is_minor = Column(Boolean, default=False)
    is_add_course = Column(Boolean, default=False)
    enrolled_students = Column(Integer, default=0)
    enrollment_data = Column(String, nullable=True)  # JSON breakdown for learning modes


class StudentMaster(Base):
    __tablename__ = "student_master"
    
    student_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    semester = Column(Integer, default=1)
    learning_mode_id = Column(Integer, default=1)

class CourseRegistration(Base):
    __tablename__ = "course_registrations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(String, ForeignKey('student_master.student_id'), nullable=False)
    course_code = Column(String, ForeignKey('course_master.course_code'), nullable=False)
    semester = Column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint('student_id', 'course_code', 'semester', name='uix_student_course_sem'),
    )


# Index for faster queries
Index('idx_course_department_semester', CourseMaster.department_code, CourseMaster.semester)


class CourseFacultyMap(Base):
    __tablename__ = "course_faculty_map"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    course_code = Column(String, ForeignKey('course_master.course_code'), nullable=False)
    faculty_id = Column(String, ForeignKey('faculty_master.faculty_id'), nullable=False)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    delivery_type = Column(String)


# Index for faster queries
Index('idx_course_faculty', CourseFacultyMap.course_code, CourseFacultyMap.faculty_id)


class SlotMaster(Base):
    __tablename__ = "slot_master"
    
    slot_id = Column(Integer, primary_key=True, autoincrement=True)
    day_of_week = Column(String, nullable=False)  # Monday, Tuesday, etc.
    period_number = Column(Integer, nullable=False)  # 1, 2, 3, etc.
    start_time = Column(String, nullable=False)  # e.g., "09:00"
    end_time = Column(String, nullable=False)  # e.g., "09:50"
    slot_type = Column(String, default='REGULAR')  # REGULAR, LUNCH, BREAK
    is_active = Column(Boolean, default=True)
    semester_ids = Column(String, default="[]")  # JSON encoded list of ints e.g. [4, 6]


class BreakConfigMaster(Base):
    __tablename__ = "break_config_master"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    break_type = Column(String, nullable=False)  # FN, LUNCH, AN
    start_time = Column(String, nullable=False)
    end_time = Column(String, nullable=False)
    semester_ids = Column(String, default="[]")  # JSON encoded list of ints [4, 6]


# Composite index for day + period lookup
Index('idx_slot_day_period', SlotMaster.day_of_week, SlotMaster.period_number)


class TimetableEntry(Base):
    __tablename__ = "timetable_entries"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    semester = Column(Integer, nullable=False)
    course_code = Column(String, nullable=False)  # No FK - allows OPEN_ELECTIVE, MENTOR
    course_name = Column(String, nullable=True)
    faculty_id = Column(String, nullable=True)
    faculty_name = Column(String, nullable=True)
    session_type = Column(String, default='THEORY')  # THEORY, LAB, MENTOR, OPEN_ELECTIVE
    slot_id = Column(Integer, ForeignKey('slot_master.slot_id'), nullable=False)
    
    # Denormalized for easier querying
    day_of_week = Column(String)
    period_number = Column(Integer)
    venue_name = Column(String, nullable=True) # Override venue specifically for this class
    section_number = Column(Integer, default=1, nullable=True) # For multi-section classes
    learning_mode_ids = Column(String, default="1,2", nullable=False) # e.g., "1", "2", "1,2"
    
    created_at = Column(String)


class VenueMaster(Base):
    __tablename__ = "venue_master"
    
    venue_id = Column(Integer, primary_key=True, autoincrement=True)
    venue_name = Column(String, unique=True, index=True, nullable=False)
    block = Column(String, nullable=True)
    is_lab = Column(Boolean, default=False)
    capacity = Column(Integer, default=60)

# Index for fast retrieval by dept/sem
Index('idx_timetable_dept_sem', TimetableEntry.department_code, TimetableEntry.semester)

class DepartmentVenueMap(Base):
    __tablename__ = "department_venue_map"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    venue_id = Column(Integer, ForeignKey('venue_master.venue_id'), nullable=False)
    semester = Column(Integer, default=6, nullable=False)

# Index for fast retrieval by dept AND semester
Index('idx_dept_sem_venue', DepartmentVenueMap.department_code, DepartmentVenueMap.semester, DepartmentVenueMap.venue_id)

class DepartmentSemesterCount(Base):
    __tablename__ = "department_semester_count"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    semester = Column(Integer, nullable=False)
    student_count = Column(Integer, default=0, nullable=False)
    student_count_data = Column(String, nullable=True) # JSON breakdown for learning modes

    __table_args__ = (
        UniqueConstraint('department_code', 'semester', name='uix_dept_sem_count'),
    )

# Index for fast retrieval by dept/sem
Index('idx_dept_sem_count', DepartmentSemesterCount.department_code, DepartmentSemesterCount.semester)

class SemesterConfig(Base):
    __tablename__ = "semester_config"
    semester = Column(Integer, primary_key=True)
    academic_year = Column(String, default="")


class CourseVenueMap(Base):
    __tablename__ = "course_venue_map"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    course_code = Column(String, ForeignKey('course_master.course_code'), nullable=False)
    venue_id = Column(Integer, ForeignKey('venue_master.venue_id'), nullable=False)
    venue_type = Column(String, default='BOTH')  # 'THEORY', 'LAB', or 'BOTH'

# Index for fast retrieval by course
Index('idx_course_venue', CourseVenueMap.course_code, CourseVenueMap.venue_id)


class SchedulerConfig(Base):
    __tablename__ = "scheduler_config"
    
    id = Column(Integer, primary_key=True, default=1)
    config_json = Column(String, nullable=False)  # JSON blob with all constraint settings


class CommonCourseMap(Base):
    """Links a single course_code+semester to multiple departments.
    All rows with the same course_code+semester must share the same timetable slot.
    venue_name is the GLOBAL venue — enforced to be identical across all rows
    with the same (course_code, semester)."""
    __tablename__ = "common_course_map"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    course_code     = Column(String, nullable=False)
    semester        = Column(Integer, nullable=False)
    department_code = Column(String, ForeignKey('department_master.department_code'), nullable=False)
    venue_name      = Column(String, nullable=True)    # Global locked venue for this common course
    venue_type      = Column(String, default='BOTH')   # THEORY / LAB / BOTH

    __table_args__ = (
        UniqueConstraint('course_code', 'semester', 'department_code', name='uix_common_course'),
    )

Index('idx_common_course', CommonCourseMap.course_code, CommonCourseMap.semester)


class UserConstraint(Base):
    """Stores user-defined scheduling constraints as declarative JSON rules.
    The solver interprets these at generation time via ConstraintInterpreter."""
    __tablename__ = "user_constraints"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    uuid            = Column(String, unique=True, nullable=False)
    name            = Column(String, nullable=False)
    description     = Column(String, nullable=True)
    enabled         = Column(Boolean, default=True)
    priority        = Column(String, default='HARD')       # HARD | SOFT | PREFERENCE
    soft_weight     = Column(Integer, default=0)
    constraint_type = Column(String, nullable=False)        # COURSE_INJECTION | SLOT_BLOCKING | FACULTY_RULE | SPACING_RULE | DISTRIBUTION_RULE
    scope_json      = Column(String, nullable=False)        # JSON: {departments, semesters, sections}
    target_json     = Column(String, nullable=False)        # JSON: {type, course_code, faculty_id, ...}
    rules_json      = Column(String, nullable=False)        # JSON: {sessions_per_week, day_preference, ...}
    created_at      = Column(String)
    updated_at      = Column(String)
    order_index     = Column(Integer, default=0)

Index('idx_user_constraint_type', UserConstraint.constraint_type)
Index('idx_user_constraint_enabled', UserConstraint.enabled)

class TimetableData(Base):
    __tablename__ = "timetable"
    id = Column(Integer, primary_key=True, autoincrement=True)
    department = Column(String, nullable=False)
    semester = Column(Integer, nullable=False)
    learning_mode_ids = Column(String, default="1,2", nullable=False) # E.g., "1,2" for merged state
    data = Column(String, nullable=False) # Store generated JSON string
    created_at = Column(String, nullable=False)


class TimetableStatus(Base):
    __tablename__ = "timetable_status"
    department_code = Column(String, ForeignKey('department_master.department_code'), primary_key=True)
    semester = Column(Integer, primary_key=True)
    is_finalized = Column(Boolean, default=False)
    finalized_by = Column(String, nullable=True)
    finalized_at = Column(String, nullable=True)

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    level = Column(String, default="INFO")
    event = Column(String, nullable=False)
    details = Column(String, nullable=True)
    user_email = Column(String, nullable=True)
