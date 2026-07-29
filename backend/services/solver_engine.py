from ortools.sat.python import cp_model
from sqlalchemy.orm import Session
import models
import math
import sys

# Safe print wrapper for Windows cp1252 encoding (can't handle emoji)
_builtin_print = print
def print(*args, **kwargs):
    try:
        _builtin_print(*args, **kwargs)
    except UnicodeEncodeError:
        safe_args = []
        for a in args:
            s = str(a)
            safe_args.append(s.encode(sys.stdout.encoding or 'utf-8', errors='replace').decode(sys.stdout.encoding or 'utf-8', errors='replace'))
        _builtin_print(*safe_args, **kwargs)

from typing import List, Optional

def generate_schedule(db: Session, department_code: str, semester: int, mentor_day: str, mentor_period: int = 8, hard_mode: bool = False, learning_mode_ids: Optional[List[int]] = None):
    """
    Generates a timetable matching real BIT college pattern, driven by SchedulerConfig.
    """
    import json
    DEFAULT_CONFIG = {}
    
    print(f"🚀 Starting Solver for Dept: {department_code}, Sem: {semester}...")
    
    learning_mode_str = ",".join(sorted(map(str, learning_mode_ids))) if learning_mode_ids else "1,2"
    db.query(models.TimetableEntry).filter_by(department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str).delete()

    # =========================================================
    # 0. FETCH CONFIG
    # =========================================================
    config_record = db.query(models.SchedulerConfig).first()
    config = config_record.config_json if config_record and config_record.config_json else DEFAULT_CONFIG

    def get_conf(category, key, field='value', default=None):
        try:
            item = config.get(category, {}).get(key, {})
            if not item.get('enabled', True):
                return default
            return item.get(field, default)
        except:
            return default

    # Extract key constraints
    c_max_lab_blocks = get_conf('hard_constraints', 'max_lab_blocks_per_day', 'value', 1)
    c_mentor_blocked = get_conf('hard_constraints', 'mentor_hour_blocked', 'value', True)
    c_no_fac_clash = get_conf('hard_constraints', 'no_faculty_clash', 'value', True)
    c_no_theory_in_own_lab = get_conf('hard_constraints', 'no_theory_in_own_lab', 'value', True)

    c_max_theory_norm = get_conf('dynamic_constraints', 'max_theory_per_course_per_day', 'value', 1)
    c_max_theory_over = get_conf('dynamic_constraints', 'max_theory_per_course_per_day', 'overloaded_value', 2)
    c_no_back_to_back = get_conf('dynamic_constraints', 'no_back_to_back_theory', 'value', True)
    c_p8_honours_only = get_conf('dynamic_constraints', 'p8_honours_only', 'value', True)

    c_consecutive_lab_penalty = get_conf('soft_constraints', 'non_consecutive_lab_days_penalty', 'value', -5)
    c_theory_lab_bonus = get_conf('soft_constraints', 'theory_lab_same_day_bonus', 'value', 3)
    c_fill_bonus = get_conf('soft_constraints', 'fill_slots_bonus', 'value', 10)

    c_min_section_thresh = get_conf('section_settings', 'min_section_threshold', 'value', 30)
    c_default_cap = get_conf('section_settings', 'default_venue_capacity', 'value', 60)

    c_batch_rot_enabled = get_conf('batch_rotation', 'enabled', 'value', True)
    c_max_merged = get_conf('batch_rotation', 'max_merged_entries', 'value', 15)

    c_mini_proj_max = get_conf('gap_fill', 'mini_project_max_periods', 'value', 4)
    c_core_extra_week = get_conf('gap_fill', 'core_extra_max_per_week', 'value', 3)
    c_core_extra_day = get_conf('gap_fill', 'core_extra_max_per_day', 'value', 2)
    c_open_elective_p = get_conf('gap_fill', 'open_elective_periods', 'value', 3)

    c_pair_electives = get_conf('elective_handling', 'pair_same_category', 'value', True)

    lab_block_starts = get_conf('hard_constraints', 'lab_block_starts', 'value', [1, 3, 5])

    # =========================================================
    # 1. FETCH DATA
    # =========================================================

    courses = db.query(models.CourseMaster).filter_by(
        department_code=department_code, semester=semester, is_open_elective=False
    ).all()
    raw_slots = db.query(models.SlotMaster).filter_by(is_active=True).all()
    slots = []
    for s in raw_slots:
        try:
            s_ids = json.loads(s.semester_ids) if s.semester_ids else []
        except:
            s_ids = []
        if not s_ids or semester in s_ids:
            slots.append(s)

    if not courses:
        print("❌ No courses found.")
        return {"success": False, "errors": [{"type": "NO_COURSES", "severity": "ERROR", "course_code": None, "course_name": None, "details": {}, "context": {"department": department_code, "semester": semester}, "suggestion": f"Add courses for {department_code} Semester {semester}"}], "warnings": [], "entries_saved": 0}
    if not slots:
        print("❌ No active slots found for this semester.")
        return {"success": False, "errors": [{"type": "NO_SLOTS", "severity": "ERROR", "course_code": None, "course_name": None, "details": {}, "context": {"department": department_code, "semester": semester}, "suggestion": f"Configure time slots for Semester {semester}"}], "warnings": [], "entries_saved": 0}

    # Faculty lookups — now with delivery_type for priority sorting
    course_faculty = {}     # course_code -> [(fac_id, fac_name, delivery_type), ...]
    course_names = {}
    
    course_codes = [c.course_code for c in courses]
    all_mappings = db.query(models.CourseFacultyMap).filter(models.CourseFacultyMap.course_code.in_(course_codes)).all()
    all_fac_vids = list(set(m.faculty_id for m in all_mappings))
    all_faculties = db.query(models.FacultyMaster).filter(models.FacultyMaster.faculty_id.in_(all_fac_vids)).all()
    fac_dict = {f.faculty_id: f.faculty_name for f in all_faculties}
    
    mapping_dict = {}
    for m in all_mappings:
        mapping_dict.setdefault(m.course_code, []).append(m)
        
    for course in courses:
        course_names[course.course_code] = course.course_name
        f_list = []
        for m in mapping_dict.get(course.course_code, []):
            fname = fac_dict.get(m.faculty_id, m.faculty_id)
            dtype = (m.delivery_type or 'OFFLINE').strip().upper()
            f_list.append((m.faculty_id, fname, dtype))
        course_faculty[course.course_code] = f_list

    # Organize slots
    day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    all_days = sorted(set(s.day_of_week for s in slots), key=lambda d: day_order.index(d))

    # Reject Language Electives with no faculty
    valid_courses = []
    for course in courses:
        # --- NEW: Learning Mode Filter ---
        if learning_mode_ids:
            try:
                enroll_data = json.loads(course.enrollment_data) if course.enrollment_data else {}
                mode_total = sum(enroll_data.get(str(m_id), 0) for m_id in learning_mode_ids)
                if mode_total == 0:
                    print(f"⏩ Skipping {course.course_code} - zero registrations for modes {learning_mode_ids}")
                    continue
            except Exception as e:
                print(f"⚠️ Error parsing enrollment_data for {course.course_code}: {e}")

        is_lang = course.course_category and "LANGUAGE" in course.course_category.upper()
        has_fac = len(course_faculty.get(course.course_code, [])) > 0
        if is_lang and not has_fac:
            print(f"Skipping {course.course_code} - Language Elective missing faculty.")
            continue
        valid_courses.append(course)
    courses = valid_courses
    
    if not courses:
        print("❌ No valid courses left after filtering constraints.")
        return {"success": False, "errors": [{"type": "NO_VALID_COURSES", "severity": "ERROR", "course_code": None, "course_name": None, "details": {}, "context": {"department": department_code, "semester": semester}, "suggestion": "Check faculty mappings for language elective courses"}], "warnings": [], "entries_saved": 0}

    slot_lookup = {}
    day_periods = {}
    for s in slots:
        slot_lookup[(s.day_of_week, s.period_number)] = s
        if s.day_of_week not in day_periods:
            day_periods[s.day_of_week] = []
        day_periods[s.day_of_week].append(s.period_number)
    for d in day_periods:
        day_periods[d] = sorted(set(day_periods[d]))

    # Pre-fetch course-specific venues (venue_type aware)
    course_venues = db.query(models.CourseVenueMap).filter_by(department_code=department_code).all()
    cv_venue_ids = list(set(cv.venue_id for cv in course_venues))
    cv_venues = db.query(models.VenueMaster).filter(models.VenueMaster.venue_id.in_(cv_venue_ids)).all()
    cv_vdict = {v.venue_id: v for v in cv_venues}
    
    cv_lookup = {}  # {course_code: {'theory': [venue_names], 'lab': [venue_names]}}
    for cv in course_venues:
        v = cv_vdict.get(cv.venue_id)
        if v:
            vtype = (cv.venue_type or 'BOTH').upper()
            if cv.course_code not in cv_lookup:
                cv_lookup[cv.course_code] = {'theory': [], 'lab': []}
            if vtype == 'BOTH':
                cv_lookup[cv.course_code]['theory'].append(v.venue_name)
                cv_lookup[cv.course_code]['lab'].append(v.venue_name)
            elif vtype == 'THEORY':
                cv_lookup[cv.course_code]['theory'].append(v.venue_name)
            elif vtype == 'LAB':
                cv_lookup[cv.course_code]['lab'].append(v.venue_name)

    # Override cv_lookup for common courses with their GLOBAL venue
    # This ensures all departments share the same venue for common courses
    common_entries = db.query(models.CommonCourseMap).filter(
        models.CommonCourseMap.course_code.in_([c.course_code for c in courses]),
        models.CommonCourseMap.semester == semester,
        models.CommonCourseMap.venue_name != None
    ).all()
    for cc in common_entries:
        vtype = (cc.venue_type or 'BOTH').upper()
        if cc.course_code not in cv_lookup:
            cv_lookup[cc.course_code] = {'theory': [], 'lab': []}
        if vtype in ('BOTH', 'THEORY'):
            cv_lookup[cc.course_code]['theory'] = [cc.venue_name]
        if vtype in ('BOTH', 'LAB'):
            cv_lookup[cc.course_code]['lab'] = [cc.venue_name]

    # Pre-fetch department default venues
    dept_venue_maps = db.query(models.DepartmentVenueMap).filter_by(department_code=department_code, semester=semester).all()
    default_labs = []
    default_classrooms = []
    classroom_venues_info = []  # [(venue_name, capacity), ...]
    lab_venues_info = []
    
    dvm_vids = list(set(dvm.venue_id for dvm in dept_venue_maps))
    dvm_venues = db.query(models.VenueMaster).filter(models.VenueMaster.venue_id.in_(dvm_vids)).all()
    dvm_vdict = {v.venue_id: v for v in dvm_venues}
    
    for dvm in dept_venue_maps:
        v = dvm_vdict.get(dvm.venue_id)
        if v:
            if v.is_lab:
                default_labs.append(v.venue_name)
                lab_venues_info.append((v.venue_name, v.capacity or c_default_cap))
            else:
                default_classrooms.append(v.venue_name)
                classroom_venues_info.append((v.venue_name, v.capacity or c_default_cap))
    
    # We will no longer concatenate default_classrooms into a single string.
    # Keep them as lists default_classrooms and default_labs.

    # =========================================================
    # 1b. MULTI-SECTION CALCULATION
    # =========================================================
    sem_count = db.query(models.DepartmentSemesterCount).filter_by(
        department_code=department_code, semester=semester
    ).first()
    
    student_count = 60
    if sem_count:
        if learning_mode_ids:
            try:
                count_data = json.loads(sem_count.student_count_data) if sem_count.student_count_data else {}
                student_count = sum(count_data.get(str(m_id), 0) for m_id in learning_mode_ids)
            except:
                student_count = sem_count.student_count
        else:
            student_count = sem_count.student_count
    
    if student_count <= 0: student_count = 60

    max_classroom_cap = max((c[1] for c in classroom_venues_info), default=c_default_cap)
    max_lab_cap = max((c[1] for c in lab_venues_info), default=c_default_cap)

    # Helper to calculate sections dynamically per course based on accurate enrollment counts
    def get_course_sections(course_code, is_lab_req):
        course_obj = next((c for c in courses if c.course_code == course_code), None)
        if not course_obj: return 1

        enrolled = 0
        if learning_mode_ids:
            try:
                enroll_data = json.loads(course_obj.enrollment_data) if course_obj.enrollment_data else {}
                enrolled = sum(enroll_data.get(str(m_id), 0) for m_id in learning_mode_ids)
            except:
                enrolled = course_obj.enrolled_students or 0
        else:
            enrolled = course_obj.enrolled_students or 0
        
        # Cap enrolled at student_count to prevent global course enrollments
        base_count = min(enrolled, student_count) if enrolled > 0 else student_count
        
        cap = max_lab_cap if is_lab_req else max_classroom_cap
        sections = math.ceil(base_count / cap) if cap > 0 else 1
        if base_count % cap > 0 and base_count % cap < c_min_section_thresh:
            if enrolled > 0 and base_count < c_min_section_thresh:
                sections = max(sections, 1) # Course with 1-29 students still gets 1 section
            else:
                sections = max(sections - 1, 1)
        return sections

    print(f"  👥 Fallback Dept Student count: {student_count}")
    print(f"  🏢 max_classroom_cap: {max_classroom_cap}, max_lab_cap: {max_lab_cap}")

    # Faculty priority helpers
    def get_theory_faculty(course_code):
        """Returns faculty sorted: THEORY -> THEORY WITH LAB -> LAB -> OFFLINE"""
        all_fac = course_faculty.get(course_code, [])
        priority = {'THEORY': 0, 'THEORY WITH LAB': 1, 'LAB': 2, 'OFFLINE': 1}
        return sorted(all_fac, key=lambda f: priority.get(f[2], 3))

    def get_lab_faculty(course_code):
        """Returns faculty sorted: LAB -> THEORY WITH LAB -> THEORY -> OFFLINE"""
        all_fac = course_faculty.get(course_code, [])
        priority = {'LAB': 0, 'THEORY WITH LAB': 1, 'THEORY': 2, 'OFFLINE': 1}
        return sorted(all_fac, key=lambda f: priority.get(f[2], 3))

    # Global faculty occupancy: check what faculty are busy across ALL departments
    global_faculty_busy = {}  # (day, period) -> set(faculty_ids)
    all_existing = db.query(models.TimetableEntry).filter(
        models.TimetableEntry.department_code != department_code
    ).all()
    for e in all_existing:
        key = (e.day_of_week, e.period_number)
        if key not in global_faculty_busy:
            global_faculty_busy[key] = set()
        if e.faculty_id:
            global_faculty_busy[key].add(e.faculty_id)

    # Current run faculty occupancy (within this generation)
    run_faculty_busy = {}  # (day, period) -> set(faculty_ids)

    def is_faculty_free(fac_id, day, period):
        if not fac_id:
            return True
        key = (day, period)
        if fac_id in global_faculty_busy.get(key, set()):
            return False
        if fac_id in run_faculty_busy.get(key, set()):
            return False
        return True

    def mark_faculty_busy(fac_id, day, period):
        if not fac_id:
            return
        key = (day, period)
        if key not in run_faculty_busy:
            run_faculty_busy[key] = set()
        run_faculty_busy[key].add(fac_id)

    generation_warnings = []  # Collect warnings for the user

    def add_warning(res_type, course_code, cname, period, section, reason, resource_name=None):
        import sys
        day = sys._getframe(1).f_locals.get('day', '')
        
        # Clean section string to avoid duplicating the word 'Section' when the UI renders it
        sec_str = str(section)
        import re
        sec_str = re.sub(r'(?i)section\s*', '', sec_str).strip()

        w_dict = {
            "type": res_type,
            "course_code": course_code,
            "subject_name": cname,
            "day": day,
            "period": f"Period {period}" if isinstance(period, int) else str(period),
            "section": sec_str,
            "resource_name": resource_name,
            "reason": reason
        }
        if w_dict not in generation_warnings:
            generation_warnings.append(w_dict)

    generation_errors = []     # Collect hard-stop errors (only block in hard_mode)

    def make_error(err_type, course_code, course_name, details, context=None, suggestion=""):
        return {
            "type": err_type, "severity": "ERROR",
            "course_code": course_code, "course_name": course_name,
            "details": details, "context": context or {},
            "suggestion": suggestion
        }

    mentor_day_clean = mentor_day.strip().capitalize()

    # Separate courses
    regular_courses = [c for c in courses if not (c.is_honours or c.is_minor)]
    honours_courses = [c for c in courses if c.is_honours or c.is_minor]
    
    def is_mini_project(course_code):
        cname = course_names.get(course_code, course_code).lower()
        c_obj = next((c for c in courses if c.course_code == course_code), None)
        return "mini project" in cname or (c_obj and getattr(c_obj, 'is_add_course', False))

    # ── Build elective pair groups ──
    # Courses with the same course_category (e.g. "ELECTIVE 3") share the same slots
    elective_groups = {}  # course_category -> [course, ...]
    elective_representative = {}  # course_code -> course_category (only for representatives)
    elective_partners = {}  # representative_course_code -> [partner_course, ...]
    solver_regular_courses = []  # courses that actually go into the solver
    
    for c in regular_courses:
        cat = (c.course_category or '').strip().upper()
        is_elective_cat = cat.startswith('ELECTIVE') and c.is_elective
        
        if is_elective_cat and c_pair_electives:
            if cat not in elective_groups:
                elective_groups[cat] = []
            elective_groups[cat].append(c)
        else:
            solver_regular_courses.append(c)
    
    # For each elective group, pick the first as representative, rest are partners
    for cat, group in elective_groups.items():
        rep = group[0]  # representative goes into solver
        solver_regular_courses.append(rep)
        elective_representative[rep.course_code] = cat
        partners = group[1:]  # partners piggyback on the same slots
        elective_partners[rep.course_code] = partners
        if partners:
            partner_names = ', '.join(p.course_code for p in partners)
            print(f"  🔗 {cat}: {rep.course_code} (solver) ↔ {partner_names} (paired)")
    
    # Replace regular_courses with solver_regular_courses for the CP-SAT model
    regular_courses = solver_regular_courses

    # Split theory vs lab
    course_theory_count = {}
    course_lab_blocks = {}
    for c in courses:
        theory = (c.lecture_hours or 0) + (c.tutorial_hours or 0)
        lab_periods = c.practical_hours or 0
        lab_blocks = lab_periods // 2 if lab_periods >= 2 else 0
        if lab_periods % 2 == 1:
            theory += 1
        course_theory_count[c.course_code] = theory
        course_lab_blocks[c.course_code] = lab_blocks

    # Calculate available slots
    p17_slots = sum(1 for day in all_days for p in day_periods.get(day, [])
                    if p <= 7 and not (day == mentor_day_clean and p == mentor_period))
    p8_slots_count = sum(1 for day in all_days if (day, 8) in slot_lookup
                         and not (day == mentor_day_clean and 8 == mentor_period))
    total_available = p17_slots + p8_slots_count

    reg_sessions = sum(course_theory_count[c.course_code] + course_lab_blocks[c.course_code] * 2 for c in regular_courses)
    hon_sessions = sum(c.weekly_sessions for c in honours_courses)
    total_sessions = reg_sessions + hon_sessions

    # Determine if schedule is overloaded
    is_overloaded = reg_sessions > p17_slots
    use_p8_for_regular = is_overloaded and len(honours_courses) == 0 and c_p8_honours_only
    # If p8 is NOT restricted to honours only, we can always use it
    if not c_p8_honours_only:
        use_p8_for_regular = True

    print(f"  📋 {len(regular_courses)} regular ({reg_sessions} sessions) + {len(honours_courses)} honours ({hon_sessions} sessions)")
    print(f"  🗓️  P1-P7 slots: {p17_slots}, P8 slots: {p8_slots_count}, Total: {total_available}")
    if is_overloaded:
        print(f"  ⚠️  OVERLOADED schedule: {reg_sessions} sessions > {p17_slots} P1-P7 slots")
        if use_p8_for_regular:
            print(f"  ℹ️  P8 will be used for regular courses (no honours)")
    for c in courses:
        tag = " [H/M]" if c.is_honours or c.is_minor else ""
        print(f"    {c.course_code}: theory={course_theory_count[c.course_code]}, labs={course_lab_blocks[c.course_code]}{tag}")

    # =========================================================
    # 2. CP-SAT MODEL
    # =========================================================
    model = cp_model.CpModel()

    # Determine which periods regular theory can use
    max_regular_period = 8 if use_p8_for_regular else 7

    # --- THEORY variables ---
    theory_vars = {}
    for c in regular_courses:
        for day in all_days:
            for period in day_periods.get(day, []):
                if period > max_regular_period:
                    continue
                theory_vars[(c.course_code, day, period)] = model.NewBoolVar(
                    f'th_{c.course_code}_{day}_{period}'
                )

    # ---------------------------------------------------------
    # BATCH ROTATION LOGIC (MERGED LABS)
    # ---------------------------------------------------------
    mini_projects = [c for c in courses if "mini project" in (c.course_name or "").lower()]
    core_lab_courses = [
        c for c in regular_courses 
        if course_lab_blocks[c.course_code] > 0 
        and (not c.is_elective or (c.course_category and "LANGUAGE" in c.course_category.upper()))
        and c not in mini_projects
    ]
    
    batch_rotation_needed = False
    merged_batch_count = 0
    faculty_deficient_labs = []  # Labs that lack faculty
    venue_deficient_labs = []    # Labs that lack venues
    resource_sufficient_labs = []  # Labs with enough of both
    
    c_venue_aware_rot = get_conf('batch_rotation', 'venue_aware_rotation', 'value', True)
    
    if core_lab_courses:
        for c in core_lab_courses:
            needed_sections = get_course_sections(c.course_code, True)
            valid_facs = [f for f in get_lab_faculty(c.course_code) if f[2] in ('LAB', 'THEORY WITH LAB')]
            
            # Check venue availability for this lab course
            course_cv = cv_lookup.get(c.course_code, {})
            course_lab_pool = course_cv.get('lab', [])
            if course_lab_pool:
                available_lab_venues = len(course_lab_pool)
            else:
                available_lab_venues = len(default_labs)
            
            is_faculty_deficient = len(valid_facs) < needed_sections
            is_venue_deficient = c_venue_aware_rot and available_lab_venues < needed_sections
            
            print(f"    🔬 {c.course_code}: needs {needed_sections} sections, "
                  f"has {len(valid_facs)} valid lab faculty, "
                  f"has {available_lab_venues} lab venue(s)")
            
            if is_faculty_deficient:
                faculty_deficient_labs.append(c)
                print(f"       → Faculty-deficient ({len(valid_facs)} < {needed_sections})")
            if is_venue_deficient:
                venue_deficient_labs.append(c)
                print(f"       → Venue-deficient ({available_lab_venues} < {needed_sections})")
            
            if not is_faculty_deficient and not is_venue_deficient:
                resource_sufficient_labs.append(c)
        
        # Combine: any lab that is deficient in EITHER faculty OR venues
        resource_deficient_labs = list({c.course_code: c for c in (faculty_deficient_labs + venue_deficient_labs)}.values())
        
        if len(resource_deficient_labs) >= 2 and c_batch_rot_enabled:
            # 2+ labs are resource-deficient — merge them for rotation
            core_lab_courses_to_merge = resource_deficient_labs
            batch_rotation_needed = True
            merged_batch_count = max(get_course_sections(c.course_code, True) for c in core_lab_courses_to_merge)
        elif len(resource_deficient_labs) == 1 and c_batch_rot_enabled:
            # Only 1 deficient lab — still needs rotation if there are sufficient labs to pair with
            if resource_sufficient_labs:
                core_lab_courses_to_merge = resource_deficient_labs + resource_sufficient_labs[:1]
                batch_rotation_needed = True
                merged_batch_count = max(get_course_sections(c.course_code, True) for c in core_lab_courses_to_merge)
            else:
                core_lab_courses_to_merge = []
        else:
            core_lab_courses_to_merge = []
    else:
        core_lab_courses_to_merge = []

    # Replace core_lab_courses with only the ones being merged
    core_lab_courses = core_lab_courses_to_merge if batch_rotation_needed else []

    if batch_rotation_needed:
        fac_def_codes = [c.course_code for c in faculty_deficient_labs]
        ven_def_codes = [c.course_code for c in venue_deficient_labs]
        reason_parts = []
        if fac_def_codes:
            reason_parts.append(f"faculty shortage: {fac_def_codes}")
        if ven_def_codes:
            reason_parts.append(f"venue shortage: {ven_def_codes}")
        reason_str = "; ".join(reason_parts) if reason_parts else "unknown"
        print(f"  🔄 Lab Batch Rotation TRIGGERED: Merging {len(core_lab_courses)} labs into {merged_batch_count} batches.")
        print(f"     Reason: {reason_str}")
        print(f"     Merged labs: {[c.course_code for c in core_lab_courses]}")
        print(f"     Independent labs (sufficient resources): {[c.course_code for c in resource_sufficient_labs if c not in core_lab_courses]}")
    else:
        print("  ✅ Sufficient faculty and venues available. Lab Batch Rotation not needed.")

    # =========================================================
    # PRE-VALIDATION PHASE (HARD MODE ONLY)
    # =========================================================
    if hard_mode:
        print("  🔒 HARD MODE ON: Running pre-validation checks...")
        
        # 1. Check Faculty Sufficiency
        for c in regular_courses:
            if is_mini_project(c.course_code): continue
            needed = get_course_sections(c.course_code, False)
            mapped_theory = len([f for f in get_theory_faculty(c.course_code) if f[0]])
            if needed > 0 and mapped_theory < needed:
                cname = course_names.get(c.course_code, c.course_code)
                generation_errors.append(make_error(
                    "FACULTY_DEFICIT", c.course_code, cname,
                    {"required": needed, "available": mapped_theory, "deficit": needed - mapped_theory, "type": "THEORY"},
                    {"department": department_code, "semester": semester},
                    f"Map at least {needed - mapped_theory} more theory faculty for this course."
                ))
        
        # 2. Lab Specific Pre-validation (if not rotating)
        for c in core_lab_courses_to_merge if not batch_rotation_needed else []:
            if is_mini_project(c.course_code): continue
            needed = get_course_sections(c.course_code, True)
            mapped_lab = len([f for f in get_lab_faculty(c.course_code) if f[0] and f[2] in ('LAB', 'THEORY WITH LAB')])
            if needed > 0 and mapped_lab < needed:
                cname = course_names.get(c.course_code, c.course_code)
                generation_errors.append(make_error(
                    "FACULTY_DEFICIT", c.course_code, cname,
                    {"required": needed, "available": mapped_lab, "deficit": needed - mapped_lab, "type": "LAB"},
                    {"department": department_code, "semester": semester},
                    f"Map at least {needed - mapped_lab} more lab faculty, or enable Batch Rotation."
                ))
                
            course_cv = cv_lookup.get(c.course_code, {})
            course_lab_pool = course_cv.get('lab', [])
            available_labs = len(course_lab_pool) if course_lab_pool else len(default_labs)
            if c_venue_aware_rot and needed > 0 and available_labs < needed:
                cname = course_names.get(c.course_code, c.course_code)
                generation_errors.append(make_error(
                    "VENUE_SHORTAGE", c.course_code, cname,
                    {"required": needed, "available": available_labs, "deficit": needed - available_labs, "type": "LAB"},
                    {"department": department_code, "semester": semester},
                    f"Allocate {needed - available_labs} more lab venues to this department, or enable Venue-Aware Batch Rotation."
                ))
                
        # If any hard-stop errors found during pre-validation, abort!
        if generation_errors:
            print(f"❌ Hard mode pre-validation failed with {len(generation_errors)} errors.")
            return {"success": False, "errors": generation_errors, "warnings": generation_warnings, "entries_saved": 0}
        print("  ✅ Pre-validation passed.")

    # --- LAB variables ---
    lab_vars = {}
    merged_lab_vars = {}
    
    if batch_rotation_needed:
        for day in all_days:
            for bs in lab_block_starts:
                if (day, bs) in slot_lookup and (day, bs + 1) in slot_lookup:
                    merged_lab_vars[(day, bs)] = model.NewBoolVar(f'merged_lab_{day}_{bs}')

    for c in regular_courses:
        if course_lab_blocks[c.course_code] == 0:
            continue
        if batch_rotation_needed and c in core_lab_courses:
            continue  # Skip standalone variables since this course is merged
            
        for day in all_days:
            for bs in lab_block_starts:
                if (day, bs) in slot_lookup and (day, bs + 1) in slot_lookup:
                    lab_vars[(c.course_code, day, bs)] = model.NewBoolVar(
                        f'lab_{c.course_code}_{day}_{bs}'
                    )

    # ---------------------------------------------------------
    # COMMON COURSE OR-TOOLS PINNING (REGULAR/LAB CROSS-DEPT SYNC)
    # ---------------------------------------------------------
    for c in regular_courses:
        common_depts = db.query(models.CommonCourseMap).filter_by(
            course_code=c.course_code, semester=semester
        ).all()
        if len(common_depts) >= 2:
            anchor_entry = db.query(models.TimetableEntry).filter(
                models.TimetableEntry.course_code == c.course_code,
                models.TimetableEntry.semester == semester,
                models.TimetableEntry.department_code != department_code
            ).first()
            if anchor_entry:
                anchor_entries = db.query(models.TimetableEntry).filter(
                    models.TimetableEntry.course_code == c.course_code,
                    models.TimetableEntry.semester == semester,
                    models.TimetableEntry.department_code == anchor_entry.department_code
                ).all()
                
                anchor_theory = {(ae.day_of_week, ae.period_number) for ae in anchor_entries if ae.session_type == 'THEORY'}
                anchor_lab = {(ae.day_of_week, ae.period_number) for ae in anchor_entries if ae.session_type == 'LAB'}
                
                if anchor_theory and course_theory_count[c.course_code] > 0:
                    for day in all_days:
                        for period in day_periods.get(day, []):
                            if period > max_regular_period:
                                continue
                            if (day, period) in anchor_theory:
                                model.Add(theory_vars[(c.course_code, day, period)] == 1)
                            else:
                                model.Add(theory_vars[(c.course_code, day, period)] == 0)
                                
                if anchor_lab and course_lab_blocks[c.course_code] > 0 and not (batch_rotation_needed and c in core_lab_courses):
                    for day in all_days:
                        for bs in lab_block_starts:
                            if (day, bs) in slot_lookup and (day, bs + 1) in slot_lookup:
                                if (day, bs) in anchor_lab:
                                    model.Add(lab_vars[(c.course_code, day, bs)] == 1)
                                else:
                                    model.Add(lab_vars[(c.course_code, day, bs)] == 0)
                
                print(f"  🔗 CP-SAT constraint: pinned {c.course_code} to anchor dept {anchor_entry.department_code}")

    # =========================================================
    # 3. CONSTRAINTS
    # =========================================================

    # --- C6: Weekly session counts ---
    for c in regular_courses:
        theory_sum = [theory_vars[k] for k in theory_vars if k[0] == c.course_code]
        if course_theory_count[c.course_code] > 0:
            model.Add(sum(theory_sum) == course_theory_count[c.course_code])
        else:
            for v in theory_sum:
                model.Add(v == 0)

        if course_lab_blocks[c.course_code] > 0:
            if batch_rotation_needed and c in core_lab_courses:
                pass # Handled globally below
            else:
                lab_sum = [lab_vars[k] for k in lab_vars if k[0] == c.course_code]
                model.Add(sum(lab_sum) == course_lab_blocks[c.course_code])

    if batch_rotation_needed and core_lab_courses:
        # We only need num_merged_labs × lab_blocks merged slots (one rotation cycle per lab per week).
        # The extra batch entires (theory fallback for batches > num_labs) are filled in the save phase.
        num_merged_labs = len(core_lab_courses)
        target_blocks = max(course_lab_blocks[c.course_code] for c in core_lab_courses) * num_merged_labs
        model.Add(sum(merged_lab_vars.values()) == target_blocks)

    # --- C4: Mentor hour blocking ---
    if c_mentor_blocked:
        for c in regular_courses:
            key = (c.course_code, mentor_day_clean, mentor_period)
            if key in theory_vars:
                model.Add(theory_vars[key] == 0)
        for c in regular_courses:
            for bs in lab_block_starts:
                if mentor_period in [bs, bs + 1]:
                    key = (c.course_code, mentor_day_clean, bs)
                    if key in lab_vars:
                        model.Add(lab_vars[key] == 0)
        
        if batch_rotation_needed:
            for bs in lab_block_starts:
                if mentor_period in [bs, bs + 1]:
                    mkey = (mentor_day_clean, bs)
                    if mkey in merged_lab_vars:
                        model.Add(merged_lab_vars[mkey] == 0)

    # --- Slot occupancy ---
    core_slot_fills = []
    for day in all_days:
        for period in day_periods.get(day, []):
            if period > max_regular_period:
                continue
            occupants = []
            for c in regular_courses:
                key = (c.course_code, day, period)
                if key in theory_vars:
                    occupants.append(theory_vars[key])
                if course_lab_blocks[c.course_code] > 0:
                    for bs in lab_block_starts:
                        if period in [bs, bs + 1]:
                            lkey = (c.course_code, day, bs)
                            if lkey in lab_vars:
                                occupants.append(lab_vars[lkey])

            if batch_rotation_needed:
                for bs in lab_block_starts:
                    if period in [bs, bs + 1]:
                        mkey = (day, bs)
                        if mkey in merged_lab_vars:
                            occupants.append(merged_lab_vars[mkey])
                            break

            if not occupants:
                continue

            is_mentor = (day == mentor_day_clean and period == mentor_period)
            if is_mentor and c_mentor_blocked:
                model.Add(sum(occupants) == 0)
            else:
                model.Add(sum(occupants) <= 1)
                core_slot_fills.extend(occupants)

    # --- C7: No back-to-back theory of same course ---
    # Only enforced when schedule is NOT overloaded OR if user strictly demands it
    if c_no_back_to_back and not is_overloaded:
        for c in regular_courses:
            for day in all_days:
                pl = [p for p in day_periods.get(day, []) if p <= 7]
                for i in range(len(pl) - 1):
                    p1, p2 = pl[i], pl[i + 1]
                    if p2 == p1 + 1:
                        k1 = (c.course_code, day, p1)
                        k2 = (c.course_code, day, p2)
                        if k1 in theory_vars and k2 in theory_vars:
                            model.Add(theory_vars[k1] + theory_vars[k2] <= 1)

    max_theory_per_day = c_max_theory_over if is_overloaded else c_max_theory_norm
    print(f"  📊 max_theory/course/day={max_theory_per_day}, back-to-back={'allowed' if is_overloaded or not c_no_back_to_back else 'blocked'}")



    for c in regular_courses:
        for day in all_days:
            day_theory = [theory_vars[(c.course_code, day, p)]
                          for p in day_periods.get(day, [])
                          if (c.course_code, day, p) in theory_vars]
            if day_theory:
                model.Add(sum(day_theory) <= max_theory_per_day)

    # --- C9: Max 1 lab block per day GLOBALLY (across all courses) ---
    for day in all_days:
        all_lab_blocks_on_day = []
        for c in regular_courses:
            if course_lab_blocks[c.course_code] == 0:
                continue
            for bs in lab_block_starts:
                if (c.course_code, day, bs) in lab_vars:
                    all_lab_blocks_on_day.append(lab_vars[(c.course_code, day, bs)])
        if batch_rotation_needed:
            for bs in lab_block_starts:
                mkey = (day, bs)
                if mkey in merged_lab_vars:
                    all_lab_blocks_on_day.append(merged_lab_vars[mkey])
                    
        if len(all_lab_blocks_on_day) > c_max_lab_blocks:
            model.Add(sum(all_lab_blocks_on_day) <= c_max_lab_blocks)

    # --- C10: Lab blocks on NON-CONSECUTIVE days GLOBALLY ---
    # No lab day followed by another lab day (across all courses)
    lab_spread_penalties = []
    for i in range(len(all_days) - 1):
        day1 = all_days[i]
        day2 = all_days[i + 1]
        labs_day1 = []
        labs_day2 = []
        for c in regular_courses:
            if course_lab_blocks[c.course_code] == 0:
                continue
            for bs in lab_block_starts:
                if (c.course_code, day1, bs) in lab_vars:
                    labs_day1.append(lab_vars[(c.course_code, day1, bs)])
                if (c.course_code, day2, bs) in lab_vars:
                    labs_day2.append(lab_vars[(c.course_code, day2, bs)])
                    
        if batch_rotation_needed:
            for bs in lab_block_starts:
                if (day1, bs) in merged_lab_vars:
                    labs_day1.append(merged_lab_vars[(day1, bs)])
                if (day2, bs) in merged_lab_vars:
                    labs_day2.append(merged_lab_vars[(day2, bs)])
        if labs_day1 and labs_day2:
            # Count total lab blocks available to decide hard vs soft
            total_lab_blocks = sum(course_lab_blocks[c.course_code] for c in regular_courses)
            if total_lab_blocks <= 3:
                # 3 or fewer lab blocks can always fit Mon/Wed/Fri — hard constraint
                model.Add(sum(labs_day1) + sum(labs_day2) <= 1)
            else:
                # Many lab blocks — soft penalty to avoid consecutive
                has_d1 = model.NewBoolVar(f'glab_d1_{day1}')
                has_d2 = model.NewBoolVar(f'glab_d2_{day2}')
                model.AddMaxEquality(has_d1, labs_day1)
                model.AddMaxEquality(has_d2, labs_day2)
                consec = model.NewBoolVar(f'gconsec_{day1}_{day2}')
                model.AddMultiplicationEquality(consec, [has_d1, has_d2])
                lab_spread_penalties.append(consec)

    # --- No theory in same slot as own lab block ---
    if c_no_theory_in_own_lab:
        for c in regular_courses:
            if course_lab_blocks[c.course_code] == 0:
                continue
            for day in all_days:
                for bs in lab_block_starts:
                    lvar = None
                    if batch_rotation_needed and c in core_lab_courses:
                        lvar = merged_lab_vars.get((day, bs))
                    else:
                        lkey = (c.course_code, day, bs)
                        lvar = lab_vars.get(lkey)
                        
                    if lvar is None:
                        continue
                    for p in [bs, bs + 1]:
                        tkey = (c.course_code, day, p)
                        if tkey in theory_vars:
                            model.Add(theory_vars[tkey] + lvar <= 1)

    # --- C5: Faculty clash ---
    if c_no_fac_clash:
        faculty_courses_map = {}
        for c in regular_courses:
            for fid, fname, dtype in course_faculty.get(c.course_code, []):
                if not fid or str(fid).lower() in ['nan', 'none']: 
                    continue # Skip faculty clash check if no real faculty ID
                if fid not in faculty_courses_map:
                    faculty_courses_map[fid] = set()
                faculty_courses_map[fid].add(c.course_code)

        for fid, taught_codes in faculty_courses_map.items():
            if len(taught_codes) <= 1:
                continue
            for day in all_days:
                for period in day_periods.get(day, []):
                    occupants = []
                    for cc in taught_codes:
                        key = (cc, day, period)
                        if key in theory_vars:
                            occupants.append(theory_vars[key])
                        if course_lab_blocks.get(cc, 0) > 0:
                            for bs in lab_block_starts:
                                if period in [bs, bs + 1]:
                                    if batch_rotation_needed and any(x for x in core_lab_courses if x.course_code == cc):
                                        mkey = (day, bs)
                                        if mkey in merged_lab_vars:
                                            occupants.append(merged_lab_vars[mkey])
                                    else:
                                        lkey = (cc, day, bs)
                                        if lkey in lab_vars:
                                            occupants.append(lab_vars[lkey])
                    if len(occupants) > 1:
                        model.Add(sum(occupants) <= 1)

    # --- C11 (SOFT): Theory on same day as lab ---
    theory_lab_same_day_bonus = []
    for c in regular_courses:
        if course_lab_blocks[c.course_code] == 0 or course_theory_count[c.course_code] == 0:
            continue
        for day in all_days:
            if batch_rotation_needed and c in core_lab_courses:
                day_lab_vars = [merged_lab_vars[(day, bs)]
                                for bs in lab_block_starts
                                if (day, bs) in merged_lab_vars]
            else:
                day_lab_vars = [lab_vars[(c.course_code, day, bs)]
                                for bs in lab_block_starts
                                if (c.course_code, day, bs) in lab_vars]
            day_theory_vars = [theory_vars[(c.course_code, day, p)]
                               for p in day_periods.get(day, [])
                               if (c.course_code, day, p) in theory_vars]
            if day_lab_vars and day_theory_vars:
                lab_on_day = model.NewBoolVar(f'lab_day_{c.course_code}_{day}')
                theory_on_day = model.NewBoolVar(f'th_day_{c.course_code}_{day}')
                model.AddMaxEquality(lab_on_day, day_lab_vars)
                model.AddMaxEquality(theory_on_day, day_theory_vars)
                both = model.NewBoolVar(f'both_{c.course_code}_{day}')
                model.AddMultiplicationEquality(both, [lab_on_day, theory_on_day])
                theory_lab_same_day_bonus.append(both)

    # --- USER-DEFINED CONSTRAINTS (pre-solve) ---
    from services.constraint_interpreter import ConstraintInterpreter
    user_interpreter = ConstraintInterpreter(db, department_code, semester)
    user_interpreter.load_constraints()
    uc_warnings = user_interpreter.validate_constraints(
        regular_courses, slots, all_days, day_periods, slot_lookup
    )
    generation_warnings.extend(uc_warnings)
    user_interpreter.apply_to_model(
        model=model,
        theory_vars=theory_vars,
        lab_vars=lab_vars,
        merged_lab_vars=merged_lab_vars,
        core_slot_fills=core_slot_fills,
        objective_terms=[],  # will be populated below
        all_days=all_days,
        day_periods=day_periods,
        slot_lookup=slot_lookup,
        filled_slots=set()
    )

    # --- OBJECTIVE ---
    objective_terms = []
    
    if c_fill_bonus != 0:
        for v in core_slot_fills:
            objective_terms.append(c_fill_bonus * v)  # Fill slots
            
    if c_theory_lab_bonus != 0:
        for v in theory_lab_same_day_bonus:
            objective_terms.append(c_theory_lab_bonus * v)   # Theory near lab
            
    if c_consecutive_lab_penalty != 0:
        for v in lab_spread_penalties:
            objective_terms.append(c_consecutive_lab_penalty * v)  # Avoid consecutive-day labs

    if objective_terms:
        model.Maximize(sum(objective_terms))

    # =========================================================
    # 4. SOLVE
    # =========================================================
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    solver.parameters.num_workers = 4

    status = solver.Solve(model)

    if status != cp_model.OPTIMAL and status != cp_model.FEASIBLE:
        print(f"❌ No solution found ({solver.StatusName(status)}).")
        return {"success": False, "errors": [{"type": "SOLVER_FAILED", "severity": "ERROR", "course_code": None, "course_name": None, "details": {}, "context": {"department": department_code, "semester": semester}, "suggestion": "Try relaxing constraints or adding more resources."}], "warnings": [], "entries_saved": 0}

    print(f"✅ Solution Found ({solver.StatusName(status)})")

    # =========================================================
    # 4b. GLOBAL VENUE TRACKING
    # =========================================================
    from sqlalchemy import and_
    other_entries = db.query(models.TimetableEntry).filter(
        and_(
            models.TimetableEntry.semester == semester,
            models.TimetableEntry.department_code != department_code
        )
    ).all()
    
    global_occupancy = {}
    for e in other_entries:
        if not e.venue_name: continue
        venues = [v.strip() for v in e.venue_name.split(',')]
        key = (e.day_of_week, e.period_number)
        if key not in global_occupancy:
            global_occupancy[key] = set()
        global_occupancy[key].update(venues)
        
    current_run_occupancy = {}

    def assign_venue(day, period, course_code, is_lab, required_idx):
        import sys
        try:
            # Extract true section from caller scope to keep UI 'Section X' warnings accurate
            f_locals = sys._getframe(1).f_locals
            sec_num = f_locals.get('sec', f_locals.get('batch_idx', 0)) + 1
        except Exception:
            sec_num = 1

        if is_mini_project(course_code):
            return None
        course_cv = cv_lookup.get(course_code, {})
        session_key = 'lab' if is_lab else 'theory'
        course_specific_pool = course_cv.get(session_key, [])
        if course_specific_pool:
            pool = course_specific_pool
        else:
            pool = default_labs if is_lab else default_classrooms
        if not pool:
            cname = course_names.get(course_code, course_code)
            add_warning("VENUE", course_code, cname, period, sec_num, "No venues were configured.")
            if hard_mode:
                generation_errors.append(make_error("VENUE_SHORTAGE", course_code, cname, {"required": 1, "available": 0, "deficit": 1, "type": session_key.upper()}, {"day": day, "period": period}, "Add default venues to this department."))
                return None
            return None
            
        key = (day, period)
        occupied_g = global_occupancy.get(key, set())
        occupied_l = current_run_occupancy.get(key, set())
        available = [v for v in pool if v not in occupied_g and v not in occupied_l]
        if not available:
            cname = course_names.get(course_code, course_code)
            add_warning("VENUE", course_code, cname, period, sec_num, "Not enough venues are available.")
            if hard_mode:
                generation_errors.append(make_error("VENUE_CONFLICT", course_code, cname, {"pool_size": len(pool), "occupied": len(pool), "type": session_key.upper()}, {"day": day, "period": period}, "Add more default venues or spread classes across more days."))
                return None
            return None
        else:
            assigned = available[required_idx % len(available)]
            
        if key not in current_run_occupancy:
            current_run_occupancy[key] = set()
        current_run_occupancy[key].add(assigned)
        return assigned

    # =========================================================
    # 5. SAVE ENTRIES
    # =========================================================
    db.query(models.TimetableEntry).filter_by(
        department_code=department_code, semester=semester
    ).delete()

    count = 0
    filled_slots = set()

    # --- Save THEORY entries (multi-section + elective pairing) ---
    all_partner_codes = {p.course_code for partners in elective_partners.values() for p in partners}
    for c in regular_courses:
        if c.course_code in all_partner_codes:
            continue
            
        sorted_fac = get_theory_faculty(c.course_code)
        cname = course_names.get(c.course_code, c.course_code)
        partners = elective_partners.get(c.course_code, [])
        all_group_courses = [c] + partners  # c is the representative + any partners
        
        for day in all_days:
            for period in day_periods.get(day, []):
                key = (c.course_code, day, period)
                if key in theory_vars and solver.Value(theory_vars[key]):
                    slot_obj = slot_lookup.get((day, period))
                    if not slot_obj:
                        continue
                    
                    # For each course in the elective group (or just the single course)
                    for gc in all_group_courses:
                        gc_fac = get_theory_faculty(gc.course_code)
                        gc_name = course_names.get(gc.course_code, gc.course_code)
                        
                        total_secs = get_course_sections(gc.course_code, False)
                        assigned_sections = 0
                        for sec in range(total_secs):
                            # Find available faculty for this course
                            fac_assigned = None
                            for fid, fname, dtype in gc_fac:
                                if is_faculty_free(fid, day, period):
                                    fac_assigned = (fid, fname)
                                    break
                            
                            if not fac_assigned and gc_fac:
                                if hard_mode and not is_mini_project(gc.course_code):
                                    generation_errors.append(make_error("FACULTY_DEFICIT", gc.course_code, gc_name, {"required": total_secs, "available": len(gc_fac), "deficit": total_secs - len(gc_fac), "type": "THEORY"}, {"day": day, "period": period}, "Add more unique theory faculty to handle parallel sections without clashes."))
                                    continue
                                fac_assigned = (None, 'Unassigned')
                                if not is_mini_project(gc.course_code):
                                    add_warning("FACULTY", gc.course_code, gc_name, period, sec + 1, "Not enough faculty are available.")
                            elif not fac_assigned:
                                fac_assigned = (None, 'Unassigned')
                                if not is_mini_project(gc.course_code):
                                    add_warning("FACULTY", gc.course_code, gc_name, period, sec + 1, "No faculty is configured.")
                            
                            c_venue = assign_venue(day, period, gc.course_code, False, count + sec)
                            display_name = gc_name
                            
                            entry = models.TimetableEntry(
                                department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                                course_code=gc.course_code, course_name=display_name,
                                faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                                session_type='THEORY',
                                slot_id=slot_obj.slot_id,
                                day_of_week=day, period_number=period,
                                venue_name=c_venue,
                                section_number=sec + 1,
                                created_at="now"
                            )
                            db.add(entry)
                            mark_faculty_busy(fac_assigned[0], day, period)
                            assigned_sections += 1
                    
                    filled_slots.add((day, period))
                    count += assigned_sections * len(all_group_courses)

    # --- Save LAB entries (multi-section + elective pairing) ---
    for c in regular_courses:
        if c.course_code in all_partner_codes:
            continue
        if course_lab_blocks[c.course_code] == 0:
            continue
        if batch_rotation_needed and c in core_lab_courses:
            continue
            
        partners = elective_partners.get(c.course_code, [])
        all_group_courses = [c] + partners
        
        for day in all_days:
            for bs in lab_block_starts:
                lkey = (c.course_code, day, bs)
                if lkey in lab_vars and solver.Value(lab_vars[lkey]):
                    for gc in all_group_courses:
                        gc_fac = get_lab_faculty(gc.course_code)
                        gc_name = course_names.get(gc.course_code, gc.course_code)
                        
                        total_lab_secs = get_course_sections(gc.course_code, True)
                        for sec in range(total_lab_secs):
                            fac_assigned = None
                            for fid, fname, dtype in gc_fac:
                                if is_faculty_free(fid, day, bs) and is_faculty_free(fid, day, bs + 1):
                                    fac_assigned = (fid, fname)
                                    break
                            
                            if not fac_assigned and gc_fac:
                                if hard_mode and not is_mini_project(gc.course_code):
                                    generation_errors.append(make_error("FACULTY_DEFICIT", gc.course_code, gc_name, {"required": total_lab_secs, "available": len(gc_fac), "deficit": total_lab_secs - len(gc_fac), "type": "LAB"}, {"day": day, "period": f"P{bs}-P{bs+1}"}, "Add more unique lab faculty or enable Batch Rotation."))
                                    continue
                                fac_assigned = (None, 'Unassigned')
                                if not is_mini_project(gc.course_code):
                                    add_warning("FACULTY", gc.course_code, gc_name, period, sec + 1, "Not enough faculty are available.")
                            elif not fac_assigned:
                                fac_assigned = (None, 'Unassigned')
                                if not is_mini_project(gc.course_code):
                                    add_warning("FACULTY", gc.course_code, gc_name, period, sec + 1, "No faculty is configured.")
                            
                            for p in [bs, bs + 1]:
                                c_v = assign_venue(day, p, gc.course_code, True, count + sec)
                                slot_obj = slot_lookup.get((day, p))
                                if slot_obj:
                                    total_secs = get_course_sections(gc.course_code, True)
                                    display_name = gc_name
                                    
                                    entry = models.TimetableEntry(
                                        department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                                        course_code=gc.course_code, course_name=display_name,
                                        faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                                        session_type='LAB',
                                        slot_id=slot_obj.slot_id,
                                        day_of_week=day, period_number=p,
                                        venue_name=c_v,
                                        section_number=sec + 1,
                                        created_at="now"
                                    )
                                    db.add(entry)
                                    filled_slots.add((day, p))
                                    count += 1
                            mark_faculty_busy(fac_assigned[0], day, bs)
                            mark_faculty_busy(fac_assigned[0], day, bs + 1)

    # --- Save MERGED LAB entries (Batch Rotation) ---
    # Each merged slot: all merged_batch_count batches rotate through lab courses.
    # assigned_lab_pairs ensures each (batch, course) gets exactly 1 LAB entry.
    # If the rotation revisits a (batch, course) pair, it saves a THEORY entry instead.
    if batch_rotation_needed and core_lab_courses:
        core_lab_ordered = sorted(core_lab_courses, key=lambda x: x.course_code)
        num_labs = len(core_lab_ordered)
        assigned_lab_pairs = set()  # (batch_idx, course_code) already given a LAB slot

        # Collect solver-chosen merged slots in day/period order
        chosen_merged_slots = []
        for day in all_days:
            for bs in lab_block_starts:
                mkey = (day, bs)
                if mkey in merged_lab_vars and solver.Value(merged_lab_vars[mkey]):
                    chosen_merged_slots.append((day, bs))

        for slot_order, (day, bs) in enumerate(chosen_merged_slots):
            for batch_idx in range(merged_batch_count):
                lab_idx = (batch_idx + slot_order) % num_labs
                c = core_lab_ordered[lab_idx]
                cname = course_names.get(c.course_code, c.course_code)
                pair_key = (batch_idx, c.course_code)

                if pair_key not in assigned_lab_pairs:
                    # First time this batch visits this lab course → LAB session
                    assigned_lab_pairs.add(pair_key)
                    gc_fac = get_lab_faculty(c.course_code)
                    fac_assigned = None
                    for fid, fname, dtype in gc_fac:
                        if is_faculty_free(fid, day, bs) and is_faculty_free(fid, day, bs+1):
                            fac_assigned = (fid, fname)
                            break
                    if not fac_assigned and gc_fac:
                        if hard_mode and not is_mini_project(c.course_code):
                            generation_errors.append(make_error("FACULTY_DEFICIT", c.course_code, cname, {"required": merged_batch_count, "available": len(gc_fac), "deficit": merged_batch_count - len(gc_fac), "type": "LAB_BATCH"}, {"day": day, "period": f"P{bs}-P{bs+1}"}, "Insufficient faculty for lab rotation."))
                            continue
                        fac_assigned = (None, 'Unassigned')
                        if not is_mini_project(c.course_code):
                            add_warning("FACULTY", c.course_code, cname, period if "period" in locals() else (f"{bs}-{bs+1}" if "bs" in locals() else "N/A"), sec + 1 if "sec" in locals() else ("Batch " + str(batch_idx+1) if "batch_idx" in locals() else 1), "Not enough faculty are available.")
                    elif not fac_assigned:
                        fac_assigned = (None, 'Unassigned')
                        if not is_mini_project(c.course_code):
                            add_warning("FACULTY", c.course_code, cname, period if "period" in locals() else (f"{bs}-{bs+1}" if "bs" in locals() else "N/A"), sec + 1 if "sec" in locals() else ("Batch " + str(batch_idx+1) if "batch_idx" in locals() else 1), "No faculty is configured.")
                    for p in [bs, bs+1]:
                        c_v = assign_venue(day, p, c.course_code, True, batch_idx)
                        slot_obj = slot_lookup.get((day, p))
                        if slot_obj:
                            db.add(models.TimetableEntry(
                                department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                                course_code=c.course_code,
                                course_name=f"B{batch_idx+1}: {cname}" if len(core_lab_courses_to_merge) > 1 else cname,
                                faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                                session_type='LAB',
                                slot_id=slot_obj.slot_id,
                                day_of_week=day, period_number=p,
                                venue_name=c_v,
                                section_number=batch_idx + 1,
                                created_at="now"
                            ))
                            filled_slots.add((day, p))
                            count += 1
                    mark_faculty_busy(fac_assigned[0], day, bs)
                    mark_faculty_busy(fac_assigned[0], day, bs+1)
                else:
                    # This (batch, lab) already has a LAB. Give theory session instead.
                    gc_fac = get_theory_faculty(c.course_code)
                    fac_assigned = None
                    for fid, fname, dtype in gc_fac:
                        if is_faculty_free(fid, day, bs) and is_faculty_free(fid, day, bs+1):
                            fac_assigned = (fid, fname)
                            break
                    if not fac_assigned and gc_fac:
                        if hard_mode and not is_mini_project(c.course_code):
                            generation_errors.append(make_error("FACULTY_DEFICIT", c.course_code, cname, {"required": merged_batch_count, "available": len(gc_fac), "deficit": merged_batch_count - len(gc_fac), "type": "THEORY_FALLBACK"}, {"day": day, "period": f"P{bs}-P{bs+1}"}, "Insufficient theory faculty for lab fallback rotation."))
                            continue
                        fac_assigned = (None, 'Unassigned')
                        if not is_mini_project(c.course_code):
                            add_warning("FACULTY", c.course_code, cname, period if "period" in locals() else (f"{bs}-{bs+1}" if "bs" in locals() else "N/A"), sec + 1 if "sec" in locals() else ("Batch " + str(batch_idx+1) if "batch_idx" in locals() else 1), "Not enough faculty are available.")
                    elif not fac_assigned:
                        fac_assigned = (None, 'Unassigned')
                        if not is_mini_project(c.course_code):
                            add_warning("FACULTY", c.course_code, cname, period if "period" in locals() else (f"{bs}-{bs+1}" if "bs" in locals() else "N/A"), sec + 1 if "sec" in locals() else ("Batch " + str(batch_idx+1) if "batch_idx" in locals() else 1), "No faculty is configured.")
                    for p in [bs, bs+1]:
                        c_v = assign_venue(day, p, c.course_code, False, batch_idx)
                        slot_obj = slot_lookup.get((day, p))
                        if slot_obj:
                            db.add(models.TimetableEntry(
                                department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                                course_code=c.course_code,
                                course_name=f"{cname} (Theory)",
                                faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                                session_type='THEORY',
                                slot_id=slot_obj.slot_id,
                                day_of_week=day, period_number=p,
                                venue_name=c_v,
                                section_number=batch_idx + 1,
                                created_at="now"
                            ))
                            filled_slots.add((day, p))
                            count += 1
                    mark_faculty_busy(fac_assigned[0], day, bs)
                    mark_faculty_busy(fac_assigned[0], day, bs+1)
    # =========================================================
    # 5.5 COMMON COURSES — schedule these FIRST (before Honours/Minor)
    # If another dept already placed this course, reuse the same slot.
    # If the slot is occupied here, split the cell (section_number 2).
    # =========================================================
    common_placed_codes = set()   # track codes handled here so Section 6 skips them

    for c in honours_courses:
        # Check if this course is registered as a common course
        common_depts = db.query(models.CommonCourseMap).filter_by(
            course_code=c.course_code, semester=semester
        ).all()
        if not common_depts:
            continue  # not a common course — handled by Section 6 normally

        dept_codes = [r.department_code for r in common_depts]
        if len(dept_codes) < 2:
            continue  # only one dept — not truly shared

        # Look for an existing TimetableEntry for this course in ANY other dept
        anchor_entry = db.query(models.TimetableEntry).filter(
            models.TimetableEntry.course_code == c.course_code,
            models.TimetableEntry.semester == semester,
            models.TimetableEntry.department_code != department_code
        ).first()

        fids  = course_faculty.get(c.course_code, [])
        cname = course_names.get(c.course_code, c.course_code)
        if fids:
            fid   = fids[0][0]
            fname = fids[0][1]
        else:
            fid   = None
            fname = 'Unassigned'
            add_warning("FACULTY", c.course_code, cname, "N/A", 1, "No faculty is configured.")
        stype = 'HONOURS' if c.is_honours else 'MINOR'
        needed = c.weekly_sessions or (
            course_theory_count.get(c.course_code, 3) +
            course_lab_blocks.get(c.course_code, 0) * 2
        )

        if anchor_entry:
            # ── Sync mode: reuse existing slots from anchor dept ──
            anchor_entries = db.query(models.TimetableEntry).filter(
                models.TimetableEntry.course_code == c.course_code,
                models.TimetableEntry.semester == semester,
                models.TimetableEntry.department_code == anchor_entry.department_code
            ).all()
            # Deduplicate by (day, period)
            seen_slots = set()
            anchor_slots = []
            for ae in anchor_entries:
                key = (ae.day_of_week, ae.period_number)
                if key not in seen_slots:
                    seen_slots.add(key)
                    anchor_slots.append((ae.day_of_week, ae.period_number))

            for (day, period) in anchor_slots:
                if (day, period) not in slot_lookup:
                    continue
                slot_obj = slot_lookup[(day, period)]
                # Determine section_number: if slot already has an entry → section 2 (split)
                already_there = (day, period) in filled_slots
                sec_num = 2 if already_there else 1
                c_venue = assign_venue(day, period, c.course_code, False, count)
                db.add(models.TimetableEntry(
                    department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                    course_code=c.course_code, course_name=cname,
                    faculty_id=fid, faculty_name=fname,
                    session_type=stype,
                    slot_id=slot_obj.slot_id,
                    day_of_week=day, period_number=period,
                    venue_name=c_venue,
                    section_number=sec_num,
                    created_at="now"
                ))
                filled_slots.add((day, period))
                count += 1
            print(f"  🔗 Common course {c.course_code} synced to {len(anchor_slots)} slots from dept {anchor_entry.department_code}")
        else:
            # ── Anchor mode: this dept is first — schedule normally in P8 ──
            # Use the standard day-group logic; other depts will sync later.
            DAY_GROUP_A_CC = ['Monday', 'Wednesday', 'Friday']
            DAY_GROUP_B_CC = ['Tuesday', 'Thursday', 'Saturday']
            # Pick group based on position among common courses in this dept
            cc_idx = honours_courses.index(c)
            group_days_cc = DAY_GROUP_A_CC if cc_idx % 2 == 0 else DAY_GROUP_B_CC
            free_p8 = [(d, 8) for d in group_days_cc
                       if (d, 8) in slot_lookup
                       and (d, 8) not in filled_slots
                       and not (d == mentor_day_clean and mentor_period == 8)]
            if len(free_p8) < needed:
                other = DAY_GROUP_B_CC if cc_idx % 2 == 0 else DAY_GROUP_A_CC
                free_p8 += [(d, 8) for d in other
                            if (d, 8) in slot_lookup
                            and (d, 8) not in filled_slots
                            and not (d == mentor_day_clean and mentor_period == 8)]
            for (day, period) in free_p8[:needed]:
                slot_obj = slot_lookup[(day, period)]
                c_venue = assign_venue(day, period, c.course_code, False, count)
                db.add(models.TimetableEntry(
                    department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                    course_code=c.course_code, course_name=cname,
                    faculty_id=fid, faculty_name=fname,
                    session_type=stype,
                    slot_id=slot_obj.slot_id,
                    day_of_week=day, period_number=period,
                    venue_name=c_venue,
                    section_number=1,
                    created_at="now"
                ))
                filled_slots.add((day, period))
                count += 1
            print(f"  ⚓ Common course {c.course_code} anchored in {len(free_p8[:needed])} P8 slots (first dept)")

        common_placed_codes.add(c.course_code)

    # Remove already-placed common courses from honours_courses so Section 6 skips them
    honours_courses = [c for c in honours_courses if c.course_code not in common_placed_codes]

    # =========================================================
    # 6. POST-SOLVE: Honours in P8, fill gaps
    # =========================================================


    # --- Place HONOURS/MINOR in P8 with alternating-day groups ---
    if honours_courses:
        # Day groups: odd-indexed courses → MWF, even-indexed → TuThSat
        DAY_GROUP_A = ['Monday',    'Wednesday', 'Friday']
        DAY_GROUP_B = ['Tuesday',   'Thursday',  'Saturday']

        def get_p8_day_list(group_days):
            """Return P8 slots for a given day group that aren't yet filled."""
            result = []
            for d in group_days:
                if (d, 8) in slot_lookup \
                   and (d, 8) not in filled_slots \
                   and not (d == mentor_day_clean and mentor_period == 8):
                    result.append((d, 8))
            return result

        def get_any_free_p8():
            """Fallback: any free P8 across all days."""
            return [(d, 8) for d in all_days
                    if (d, 8) in slot_lookup
                    and (d, 8) not in filled_slots
                    and not (d == mentor_day_clean and mentor_period == 8)]

        # Separate into actual honours vs actual minors
        actual_honours = [c for c in honours_courses if c.is_honours]
        actual_minors  = [c for c in honours_courses if c.is_minor and not c.is_honours]
        # Fallback: if none properly flagged, treat all as honours
        if not actual_honours and not actual_minors:
            actual_honours = honours_courses

        def get_faculty(c):
            fids = course_faculty.get(c.course_code, [])
            if fids:
                return fids[0][0], fids[0][1]
            cname = course_names.get(c.course_code, c.course_code)
            add_warning("FACULTY", c.course_code, cname, "N/A", 1, "No faculty is configured.")
            return None, 'Unassigned'

        def sessions_needed(c):
            return c.weekly_sessions or (
                course_theory_count.get(c.course_code, 3) +
                course_lab_blocks.get(c.course_code, 0) * 2
            )

        def _write_entry(day, period, course, stype, sec_num):
            nonlocal count
            slot_obj = slot_lookup[(day, period)]
            fid, fname = get_faculty(course)
            cname = course_names.get(course.course_code, course.course_code)
            c_venue = assign_venue(day, period, course.course_code, False, count)
            db.add(models.TimetableEntry(
                department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                course_code=course.course_code, course_name=cname,
                faculty_id=fid, faculty_name=fname,
                session_type=stype,
                slot_id=slot_obj.slot_id,
                day_of_week=day, period_number=period,
                venue_name=c_venue,
                section_number=sec_num,
                created_at="now"
            ))
            filled_slots.add((day, period))
            count += 1

        # Assign Honours courses sequentially using Round-Robin
        available_p8 = get_any_free_p8()
        hon_day_groups = [[] for _ in actual_honours]
        sessions_needed_list = [sessions_needed(hc) for hc in actual_honours]
        
        slot_idx = 0
        while slot_idx < len(available_p8):
            assigned_in_round = False
            for hon_idx, hc in enumerate(actual_honours):
                if slot_idx >= len(available_p8):
                    break
                if len(hon_day_groups[hon_idx]) < sessions_needed_list[hon_idx]:
                    hon_day_groups[hon_idx].append(available_p8[slot_idx])
                    slot_idx += 1
                    assigned_in_round = True
            if not assigned_in_round:
                break # All courses have their needed sessions
                
        for hon_idx, hc in enumerate(actual_honours):
            print(f"  🎓 H{hon_idx+1} {hc.course_code}: {sessions_needed_list[hon_idx]} sessions requested → {hon_day_groups[hon_idx]}")

        # Assign Minor courses:
        # Minor 0 shares the same P8 slots as Honours 0
        # Minor 1 shares the same P8 slots as Honours 1, etc.
        min_day_groups = []
        for min_idx, mc in enumerate(actual_minors):
            needed = sessions_needed(mc)
            # Preferred: same slots as the matching honour
            if min_idx < len(hon_day_groups):
                preferred_slots = hon_day_groups[min_idx]
            else:
                preferred_slots = []
            # Among preferred slots, pick ones that have P8 *available* or already have its matching honour
            # (We allow same-slot sharing — both entries written to same day+period)
            # Supplement with any free P8 if needed
            all_p8 = get_any_free_p8()
            combined = preferred_slots + [s for s in all_p8 if s not in preferred_slots]
            seen = set(); combined_dedup = []
            for s in combined:
                if s not in seen:
                    seen.add(s); combined_dedup.append(s)
            min_day_groups.append(combined_dedup[:needed])
            print(f"  📚 M{min_idx+1} {mc.course_code}: {needed} sessions → {combined_dedup[:needed]}")

        # Write Honours entries
        for hon_idx, hc in enumerate(actual_honours):
            for slot in hon_day_groups[hon_idx]:
                day, period = slot
                _write_entry(day, period, hc, 'HONOURS', 1)

        # Write Minor entries (into the same slots as their paired Honours where possible)
        for min_idx, mc in enumerate(actual_minors):
            for slot in min_day_groups[min_idx]:
                day, period = slot
                # section_number=2 if this slot already has an honours entry, else 1
                sec = 2 if (min_idx < len(hon_day_groups) and slot in hon_day_groups[min_idx]) else 1
                _write_entry(day, period, mc, 'MINOR', sec)

        # Write any Honours that have no minor pair (already handled above — just log)
        print(f"  ✅ Honours/Minor scheduling complete")



    # --- MENTOR entry ---
    if (mentor_day_clean, mentor_period) in slot_lookup:
        slot_obj = slot_lookup[(mentor_day_clean, mentor_period)]
        entry = models.TimetableEntry(
            department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
            course_code='MENTOR', course_name='Mentor Interaction',
            faculty_id=None, faculty_name=None,
            session_type='MENTOR',
            slot_id=slot_obj.slot_id,
            day_of_week=mentor_day_clean, period_number=mentor_period,
            created_at="now"
        )
        db.add(entry)
        filled_slots.add((mentor_day_clean, mentor_period))
        count += 1

    # =========================================================
    # 7. EXTRA CREDIT: Free Periods -> Mini Projects & High Credit
    # =========================================================
    
    # IMPORTANT: Mark user-constraint reserved slots as filled
    # so the gap-filler doesn't place courses in them.
    for uuid, reserved in user_interpreter.reserved_slots.items():
        for slot in reserved:
            filled_slots.add(slot)
    
    # 1. Gather all empty periods and group them by day
    empty_by_day = {day: [] for day in all_days}
    for day in all_days:
        for p in day_periods.get(day, []):
            # Exclude P8 from extra credit filling unless explicitly required for overload
            if p == 8 and not use_p8_for_regular:
                continue
            if (day, p) not in filled_slots:
                empty_by_day[day].append(p)
    
    # Extract continuous 2-period blocks and single leftover periods
    free_blocks_2 = []  # List of tuples: (day, p1, p2)
    single_frees = []   # List of tuples: (day, p)
    
    for day, periods in empty_by_day.items():
        periods.sort()
        i = 0
        while i < len(periods):
            if i < len(periods) - 1 and periods[i+1] == periods[i] + 1:
                # We found mathematically consecutive periods, but we must verify visually contiguous (no break)
                s1 = slot_lookup.get((day, periods[i]))
                s2 = slot_lookup.get((day, periods[i+1]))
                if s1 and s2 and s1.end_time == s2.start_time:
                    # Purely contiguous without any lunch or tea breaks jumping between them
                    free_blocks_2.append((day, periods[i], periods[i+1]))
                    i += 2
                    continue
            single_frees.append((day, periods[i]))
            i += 1
                
    # 2. Organize Courses by Category
    mini_projects = [c for c in courses if "mini project" in (c.course_name or "").lower()]
    core_courses = [c for c in courses if not c.is_elective and not c.is_honours and not c.is_minor and c not in mini_projects]
    elective_courses = [c for c in courses if c.is_elective and not c.is_honours and not c.is_minor and c not in mini_projects]
    
    # Rank all courses by descending credits mathematically
    core_courses.sort(key=lambda x: x.credits or 0, reverse=True)
    elective_courses.sort(key=lambda x: x.credits or 0, reverse=True)
    
    daily_extra_counts = {c.course_code: {d: 0 for d in all_days} for c in courses}
    weekly_extra_counts = {c.course_code: 0 for c in courses}
    
    # Helper to check if a day has a LAB for any course
    def day_has_lab(target_day):
        for entry in db.new:
            if isinstance(entry, models.TimetableEntry) and entry.day_of_week == target_day and entry.session_type == 'LAB':
                return True
        return False

    # 3. Assign Mini Projects to 2-period blocks first
    for mp in mini_projects:
        while free_blocks_2 and weekly_extra_counts[mp.course_code] < c_mini_proj_max:
            day, p1, p2 = free_blocks_2.pop(0)

            gc_fac = get_lab_faculty(mp.course_code)
            for sec in range(get_course_sections(mp.course_code, True)):
                fac_assigned = None
                for fid, fname, dtype in gc_fac:
                    if is_faculty_free(fid, day, p1) and is_faculty_free(fid, day, p2):
                        fac_assigned = (fid, fname)
                        break
                if not fac_assigned and gc_fac:
                    fac_assigned = (gc_fac[sec % len(gc_fac)][0], gc_fac[sec % len(gc_fac)][1])
                elif not fac_assigned:
                    fac_assigned = (None, 'Unassigned')

                for p in [p1, p2]:
                    slot_obj = slot_lookup.get((day, p))
                    c_v = assign_venue(day, p, mp.course_code, True, count + sec)
                    if slot_obj:
                        db.add(models.TimetableEntry(
                            department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                            course_code=mp.course_code, course_name=mp.course_name,
                            faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                            session_type='LAB',
                            slot_id=slot_obj.slot_id,
                            day_of_week=day, period_number=p,
                            venue_name=c_v,
                            section_number=sec + 1,
                            created_at="now"
                        ))
                        filled_slots.add((day, p))
                        count += 1
                mark_faculty_busy(fac_assigned[0], day, p1)
                mark_faculty_busy(fac_assigned[0], day, p2)
            
            weekly_extra_counts[mp.course_code] += 1
            daily_extra_counts[mp.course_code][day] += 1
    def fill_remaining_slots(target_courses):
        nonlocal count
        if not target_courses:
            return
            
        idx = 0
        consecutive_failures = 0
        
        # 4. Fill remaining 2-period blocks
        while free_blocks_2 and consecutive_failures < len(target_courses):
            c = target_courses[idx % len(target_courses)]
            idx += 1
            
            day, p1, p2 = free_blocks_2[0]
            
            # Check limits: daily + 2, weekly + 2
            # AND strictly demand the course physically possesses Practical (P) Hours > 0 before locking a LAB block
            course_has_practicals = (c.practical_hours or 0) > 0
            if batch_rotation_needed and c in core_lab_courses:
                course_has_practicals = False  # Prevent gap filler from breaking batch rotation logic
                
            # If we add a block of 2, ensure it won't exceed the weekly limit
            if course_has_practicals and (weekly_extra_counts[c.course_code] + 2) <= c_core_extra_week and (daily_extra_counts[c.course_code][day] + 2) <= c_core_extra_day and not day_has_lab(day):
                free_blocks_2.pop(0)
                consecutive_failures = 0
                
                gc_fac = get_lab_faculty(c.course_code)
                for sec in range(get_course_sections(c.course_code, True)):
                    fac_assigned = None
                    for fid, fname, dtype in gc_fac:
                        if is_faculty_free(fid, day, p1) and is_faculty_free(fid, day, p2):
                            fac_assigned = (fid, fname)
                            break
                    if not fac_assigned and gc_fac:
                        fac_assigned = (gc_fac[sec % len(gc_fac)][0], gc_fac[sec % len(gc_fac)][1])
                    elif not fac_assigned:
                        fac_assigned = (None, 'Unassigned')

                    for p in [p1, p2]:
                        slot_obj = slot_lookup.get((day, p))
                        c_v = assign_venue(day, p, c.course_code, True, count + sec)
                        if slot_obj:
                            db.add(models.TimetableEntry(
                                department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                                course_code=c.course_code, course_name=c.course_name,
                                faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                                session_type='LAB',
                                slot_id=slot_obj.slot_id,
                                day_of_week=day, period_number=p,
                                venue_name=c_v,
                                section_number=sec + 1,
                                created_at="now"
                            ))
                            filled_slots.add((day, p))
                            count += 1
                    mark_faculty_busy(fac_assigned[0], day, p1)
                    mark_faculty_busy(fac_assigned[0], day, p2)
                
                weekly_extra_counts[c.course_code] += 1
                daily_extra_counts[c.course_code][day] += 1
            else:
                consecutive_failures += 1
                
        # If any 2-period blocks couldn't be filled safely, break them into singles
        while free_blocks_2:
            day, p1, p2 = free_blocks_2.pop(0)
            single_frees.extend([(day, p1), (day, p2)])
            
        # 5. Fill single periods
        idx = 0
        consecutive_failures = 0
        while single_frees and consecutive_failures < len(target_courses):
            c = target_courses[idx % len(target_courses)]
            idx += 1
            
            day, p = single_frees[0]
            
            if weekly_extra_counts[c.course_code] < c_core_extra_week and daily_extra_counts[c.course_code][day] < c_core_extra_day:
                single_frees.pop(0)
                consecutive_failures = 0
                
                gc_fac = get_theory_faculty(c.course_code)
                for sec in range(get_course_sections(c.course_code, False)):
                    fac_assigned = None
                    for fid, fname, dtype in gc_fac:
                        if is_faculty_free(fid, day, p):
                            fac_assigned = (fid, fname)
                            break
                    if not fac_assigned and gc_fac:
                        fac_assigned = (gc_fac[sec % len(gc_fac)][0], gc_fac[sec % len(gc_fac)][1])
                    elif not fac_assigned:
                        fac_assigned = (None, 'Unassigned')

                    slot_obj = slot_lookup.get((day, p))
                    c_venue = assign_venue(day, p, c.course_code, False, count + sec)
                    if slot_obj:
                        db.add(models.TimetableEntry(
                            department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                            course_code=c.course_code, course_name=c.course_name,
                            faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                            session_type='THEORY',
                            slot_id=slot_obj.slot_id,
                            day_of_week=day, period_number=p,
                            venue_name=c_venue,
                            section_number=sec + 1,
                            created_at="now"
                        ))
                        filled_slots.add((day, p))
                        count += 1
                    mark_faculty_busy(fac_assigned[0], day, p)
                
                weekly_extra_counts[c.course_code] += 1
                daily_extra_counts[c.course_code][day] += 1
            else:
                consecutive_failures += 1

    # Apply to Core Courses first
    fill_remaining_slots(core_courses)
    
    # If slots still remain, apply to Elective Courses (sorted by credits)
    if free_blocks_2 or single_frees:
        fill_remaining_slots(elective_courses)
        
    # =========================================================
    # 7.5 SEMESTER 5 OPEN ELECTIVE INJECTION
    # =========================================================
    global_oe = db.query(models.CourseMaster).filter_by(semester=semester, is_open_elective=True).first()
    
    if semester == 5 and global_oe:
        # We need N periods for an Open Elective natively.
        oe_slots_needed = c_open_elective_p
        
        # Flatten any remaining 2-blocks into single frees
        while free_blocks_2:
            day, p1, p2 = free_blocks_2.pop(0)
            single_frees.extend([(day, p1), (day, p2)])
            
        while oe_slots_needed > 0 and single_frees:
            day, p = single_frees.pop(0)
            
            c_venue = assign_venue(day, p, global_oe.course_code, False, count)
            slot_obj = slot_lookup.get((day, p))
            
            if slot_obj:
                db.add(models.TimetableEntry(
                    department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                    course_code=global_oe.course_code, course_name=global_oe.course_name,
                    faculty_id=None, faculty_name="Unassigned",
                    session_type='OPEN_ELECTIVE',
                    slot_id=slot_obj.slot_id,
                    day_of_week=day, period_number=p,
                    venue_name=c_venue,
                    created_at="now"
                ))
                filled_slots.add((day, p))
                count += 1
                oe_slots_needed -= 1

    # Absolute Fallback: Zero Free Slots Allowed
    if free_blocks_2 or single_frees:
        while free_blocks_2:
            day, p1, p2 = free_blocks_2.pop(0)
            single_frees.extend([(day, p1), (day, p2)])
        
        # Absolute Fallback: Zero Free Slots Allowed
        fallback_courses = core_courses or elective_courses or courses
        if fallback_courses:
            fallback_courses.sort(key=lambda x: x.credits or 0, reverse=True)
            idx = 0
            for day, p in single_frees:
                c = fallback_courses[idx % len(fallback_courses)]
                gc_fac = get_theory_faculty(c.course_code)
                for sec in range(get_course_sections(c.course_code, False)):
                    fac_assigned = None
                    for fid, fname, dtype in gc_fac:
                        if is_faculty_free(fid, day, p):
                            fac_assigned = (fid, fname)
                            break
                    if not fac_assigned and gc_fac:
                        fac_assigned = (gc_fac[sec % len(gc_fac)][0], gc_fac[sec % len(gc_fac)][1])
                    elif not fac_assigned:
                        fac_assigned = (None, 'Unassigned')

                    slot_obj = slot_lookup.get((day, p))
                    c_venue = assign_venue(day, p, c.course_code, False, count + sec)
                    if slot_obj:
                        db.add(models.TimetableEntry(
                            department_code=department_code, semester=semester, learning_mode_ids=learning_mode_str,
                            course_code=c.course_code, course_name=c.course_name,
                            faculty_id=fac_assigned[0], faculty_name=fac_assigned[1],
                            session_type='THEORY',
                            slot_id=slot_obj.slot_id,
                            day_of_week=day, period_number=p,
                            venue_name=c_venue,
                            section_number=sec + 1,
                            created_at="now"
                        ))
                        filled_slots.add((day, p))
                        count += 1
                    mark_faculty_busy(fac_assigned[0], day, p)
                idx += 1

    # =========================================================
    # 8. OPEN ELECTIVE MERGING (SEMESTER 6 ONLY)
    # =========================================================
    if semester == 6 and global_oe:
        # Find the highest numbered elective in the current department's scheduled courses
        dept_electives = [c for c in courses if c.is_elective]
        if dept_electives:
            def get_elective_num(c):
                import re
                m = re.search(r'\d+', c.course_category or "")
                if m: return int(m.group())
                m = re.search(r'\d+', c.course_name or c.course_code)
                return int(m.group()) if m else 0
            
            dept_electives.sort(key=get_elective_num, reverse=True)
            highest_elective = dept_electives[0]
            
            # Find all entries for this highest elective and update the name
            for entry in db.new:
                if isinstance(entry, models.TimetableEntry) and entry.course_code == highest_elective.course_code:
                    if "OPEN ELECTIVE" not in str(entry.course_name).upper():
                        entry.course_name = f"{entry.course_name} / OPEN ELECTIVE"

    # --- USER-DEFINED CONSTRAINTS (post-solve) ---
    count = user_interpreter.apply_post_solve(
        db=db,
        department_code=department_code,
        semester=semester,
        filled_slots=filled_slots,
        slot_lookup=slot_lookup,
        assign_venue=assign_venue,
        count=count,
        all_days=all_days,
        day_periods=day_periods
    )
    generation_warnings.extend(user_interpreter.warnings)

    # Print warnings before commit
    if generation_warnings:
        print(f"\n{'='*60}")
        print(f"⚠️  GENERATION WARNINGS ({len(generation_warnings)} issues):")
        print(f"{'='*60}")
        for w in generation_warnings:
            print(f"  {w}")
        print(f"{'='*60}\n")
        
    if hard_mode and generation_errors:
        db.rollback()
        print(f"❌ Hard mode generation aborted during save phase with {len(generation_errors)} errors.")
        return {"success": False, "errors": generation_errors, "warnings": generation_warnings, "entries_saved": 0}

    try:
        db.commit()
        print(f"💾 Saved {count} timetable entries.")
    except Exception as e:
        db.rollback()
        print(f"❌ Database commit failed: {str(e)}")
        raise e
    # Return structured dict
    return {"success": True, "errors": generation_errors, "warnings": generation_warnings, "entries_saved": count}
