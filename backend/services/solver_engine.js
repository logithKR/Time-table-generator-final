/**
 * solver_engine.js
 * 
 * Complete port of solver_engine.py (1,911 lines) to Node.js using or-tools-wasm.
 * Variable names, function names, and constraint logic preserved from Python.
 * Golden reference: e:\Time-table-generator\backend\services\solver_engine.py
 */
const cp = require('or-tools-wasm/cp-sat');
const { ConstraintInterpreter } = require('./constraint_interpreter');

// â”€â”€â”€ Helper Functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function get_conf(config, category, key, field = 'value', defaultVal = null) {
    try {
        const item = (config[category] || {})[key] || {};
        if (item.enabled === false) return defaultVal;
        return item[field] !== undefined ? item[field] : defaultVal;
    } catch (e) {
        return defaultVal;
    }
}

function make_error(err_type, course_code, course_name, details, context = {}, suggestion = '') {
    return { type: err_type, severity: 'ERROR', course_code, course_name, details, context, suggestion };
}

function is_mini_project(course_code, course_names, courses) {
    const cname = (course_names[course_code] || course_code).toLowerCase();
    const c_obj = courses.find(c => c.course_code === course_code);
    return cname.includes('mini project') || (c_obj && c_obj.is_add_course);
}

function get_theory_faculty(course_code, course_faculty) {
    const all_fac = course_faculty[course_code] || [];
    const priority = { 'THEORY': 0, 'THEORY WITH LAB': 1, 'LAB': 2, 'OFFLINE': 1 };
    return [...all_fac].sort((a, b) => (priority[a[2]] || 3) - (priority[b[2]] || 3));
}

function get_lab_faculty(course_code, course_faculty) {
    const all_fac = course_faculty[course_code] || [];
    const priority = { 'LAB': 0, 'THEORY WITH LAB': 1, 'THEORY': 2, 'OFFLINE': 1 };
    return [...all_fac].sort((a, b) => (priority[a[2]] || 3) - (priority[b[2]] || 3));
}

// â”€â”€â”€ Main Generation Function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function generate_schedule(db, department_code, semester, mentor_day = 'Saturday', mentor_period = 8, hard_mode = false, learning_mode_ids = null, locked_slots = []) {
    console.log(`\nðŸš€ Starting Solver for Dept: ${department_code}, Sem: ${semester}...`);

    const learning_mode_str = learning_mode_ids ? learning_mode_ids.sort().join(',') : '1,2';

    // Delete existing entries
    db.prepare("DELETE FROM timetable_entries WHERE department_code = ? AND semester = ? AND learning_mode_ids = ?").run(department_code, semester, learning_mode_str);

    // =========================================================
    // 0. FETCH CONFIG
    // =========================================================
    const config_record = db.prepare("SELECT * FROM scheduler_config LIMIT 1").get();
    let config = {};
    if (config_record && config_record.config_json) {
        try { config = JSON.parse(config_record.config_json); } catch (e) { config = {}; }
    }

    const c_max_lab_blocks = get_conf(config, 'hard_constraints', 'max_lab_blocks_per_day', 'value', 1);
    const c_mentor_blocked = get_conf(config, 'hard_constraints', 'mentor_hour_blocked', 'value', true);
    const c_no_fac_clash = get_conf(config, 'hard_constraints', 'no_faculty_clash', 'value', true);
    const c_no_theory_in_own_lab = get_conf(config, 'hard_constraints', 'no_theory_in_own_lab', 'value', true);

    const c_max_theory_norm = get_conf(config, 'dynamic_constraints', 'max_theory_per_course_per_day', 'value', 1);
    const c_max_theory_over = get_conf(config, 'dynamic_constraints', 'max_theory_per_course_per_day', 'overloaded_value', 2);
    const c_no_back_to_back = get_conf(config, 'dynamic_constraints', 'no_back_to_back_theory', 'value', true);
    const c_p8_honours_only = get_conf(config, 'dynamic_constraints', 'p8_honours_only', 'value', true);

    const c_consecutive_lab_penalty = get_conf(config, 'soft_constraints', 'non_consecutive_lab_days_penalty', 'value', -5);
    const c_theory_lab_bonus = get_conf(config, 'soft_constraints', 'theory_lab_same_day_bonus', 'value', 3);
    const c_fill_bonus = get_conf(config, 'soft_constraints', 'fill_slots_bonus', 'value', 10);

    const c_min_section_thresh = get_conf(config, 'section_settings', 'min_section_threshold', 'value', 30);
    const c_default_cap = get_conf(config, 'section_settings', 'default_venue_capacity', 'value', 60);

    const c_batch_rot_enabled = get_conf(config, 'batch_rotation', 'enabled', 'value', true);
    const c_venue_aware_rot = get_conf(config, 'batch_rotation', 'venue_aware_rotation', 'value', true);

    const c_mini_proj_max = get_conf(config, 'gap_fill', 'mini_project_max_periods', 'value', 4);
    const c_core_extra_week = get_conf(config, 'gap_fill', 'core_extra_max_per_week', 'value', 3);
    const c_core_extra_day = get_conf(config, 'gap_fill', 'core_extra_max_per_day', 'value', 2);
    const c_open_elective_p = get_conf(config, 'gap_fill', 'open_elective_periods', 'value', 3);

    const c_pair_electives = get_conf(config, 'elective_handling', 'pair_same_category', 'value', true);

    const lab_block_starts = get_conf(config, 'hard_constraints', 'lab_block_starts', 'value', [1, 3, 5]);

    // =========================================================
    // 1. FETCH DATA
    // =========================================================
    let courses = db.prepare("SELECT * FROM course_master WHERE department_code = ? AND semester = ? AND is_open_elective = 0").all(department_code, semester);

    const raw_slots = db.prepare("SELECT * FROM slot_master WHERE is_active = 1").all();
    let slots = [];
    for (const s of raw_slots) {
        let s_ids = [];
        try { s_ids = s.semester_ids ? JSON.parse(s.semester_ids) : []; } catch (e) { s_ids = []; }
        if (s_ids.length === 0 || s_ids.includes(semester)) {
            slots.push(s);
        }
    }

    if (!courses.length) {
        return { success: false, errors: [make_error('NO_COURSES', null, null, {}, { department: department_code, semester }, `Add courses for ${department_code} Semester ${semester}`)], warnings: [], entries_saved: 0 };
    }
    if (!slots.length) {
        return { success: false, errors: [make_error('NO_SLOTS', null, null, {}, { department: department_code, semester }, `Configure time slots for Semester ${semester}`)], warnings: [], entries_saved: 0 };
    }

    // Faculty lookups
    const course_faculty = {};
    const course_names = {};
    const course_codes = courses.map(c => c.course_code);

    const placeholders = course_codes.map(() => '?').join(',');
    const all_mappings = db.prepare(`SELECT * FROM course_faculty_map WHERE course_code IN (${placeholders})`).all(...course_codes);
    const fac_ids = [...new Set(all_mappings.map(m => m.faculty_id))];
    const fac_placeholders = fac_ids.map(() => '?').join(',');
    const all_faculties = fac_ids.length > 0 ? db.prepare(`SELECT * FROM faculty_master WHERE faculty_id IN (${fac_placeholders})`).all(...fac_ids) : [];
    const fac_dict = {};
    for (const f of all_faculties) fac_dict[f.faculty_id] = f.faculty_name;

    const mapping_dict = {};
    for (const m of all_mappings) {
        if (!mapping_dict[m.course_code]) mapping_dict[m.course_code] = [];
        mapping_dict[m.course_code].push(m);
    }

    for (const course of courses) {
        course_names[course.course_code] = course.course_name;
        const f_list = [];
        for (const m of (mapping_dict[course.course_code] || [])) {
            const fname = fac_dict[m.faculty_id] || m.faculty_id;
            const dtype = (m.delivery_type || 'OFFLINE').trim().toUpperCase();
            f_list.push([m.faculty_id, fname, dtype]);
        }
        course_faculty[course.course_code] = f_list;
    }

    // Organize slots
    const day_order_map = { 'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5 };
    const all_days = [...new Set(slots.map(s => s.day_of_week))].sort((a, b) => day_order_map[a] - day_order_map[b]);

    // Filter valid courses (learning modes, language electives)
    let valid_courses = [];
    for (const course of courses) {
        if (learning_mode_ids) {
            try {
                const enroll_data = course.enrollment_data ? JSON.parse(course.enrollment_data) : {};
                const mode_total = learning_mode_ids.reduce((sum, m_id) => sum + (enroll_data[String(m_id)] || 0), 0);
                if (mode_total === 0) { console.log(`  â© Skipping ${course.course_code} - zero registrations for modes ${learning_mode_ids}`); continue; }
            } catch (e) { /* proceed */ }
        }
        const is_lang = course.course_category && course.course_category.toUpperCase().includes('LANGUAGE');
        const has_fac = (course_faculty[course.course_code] || []).length > 0;
        if (is_lang && !has_fac) { console.log(`  Skipping ${course.course_code} - Language Elective missing faculty.`); continue; }
        valid_courses.push(course);
    }
    courses = valid_courses;

    if (!courses.length) {
        return { success: false, errors: [make_error('NO_VALID_COURSES', null, null, {}, { department: department_code, semester }, 'Check faculty mappings for language elective courses')], warnings: [], entries_saved: 0 };
    }

    const slot_lookup = {};
    const day_periods = {};
    for (const s of slots) {
        slot_lookup[`${s.day_of_week}_${s.period_number}`] = s;
        if (!day_periods[s.day_of_week]) day_periods[s.day_of_week] = [];
        day_periods[s.day_of_week].push(s.period_number);
    }
    for (const d in day_periods) day_periods[d] = [...new Set(day_periods[d])].sort((a, b) => a - b);

    // Pre-fetch course-specific venues
    const course_venues = db.prepare("SELECT * FROM course_venue_map WHERE department_code = ?").all(department_code);
    const cv_venue_ids = [...new Set(course_venues.map(cv => cv.venue_id))];
    const cv_venues_raw = cv_venue_ids.length > 0 ? db.prepare(`SELECT * FROM venue_master WHERE venue_id IN (${cv_venue_ids.map(() => '?').join(',')})`).all(...cv_venue_ids) : [];
    const cv_vdict = {};
    for (const v of cv_venues_raw) cv_vdict[v.venue_id] = v;

    const cv_lookup = {};
    for (const cv of course_venues) {
        const v = cv_vdict[cv.venue_id];
        if (v) {
            const vtype = (cv.venue_type || 'BOTH').toUpperCase();
            if (!cv_lookup[cv.course_code]) cv_lookup[cv.course_code] = { theory: [], lab: [] };
            if (vtype === 'BOTH') { cv_lookup[cv.course_code].theory.push(v.venue_name); cv_lookup[cv.course_code].lab.push(v.venue_name); }
            else if (vtype === 'THEORY') cv_lookup[cv.course_code].theory.push(v.venue_name);
            else if (vtype === 'LAB') cv_lookup[cv.course_code].lab.push(v.venue_name);
        }
    }

    // Common course venue overrides
    const cc_codes = courses.map(c => c.course_code);
    if (cc_codes.length > 0) {
        const cc_ph = cc_codes.map(() => '?').join(',');
        const common_entries = db.prepare(`SELECT * FROM common_course_map WHERE course_code IN (${cc_ph}) AND semester = ? AND venue_name IS NOT NULL`).all(...cc_codes, semester);
        for (const cc of common_entries) {
            const vtype = (cc.venue_type || 'BOTH').toUpperCase();
            if (!cv_lookup[cc.course_code]) cv_lookup[cc.course_code] = { theory: [], lab: [] };
            if (['BOTH', 'THEORY'].includes(vtype)) cv_lookup[cc.course_code].theory = [cc.venue_name];
            if (['BOTH', 'LAB'].includes(vtype)) cv_lookup[cc.course_code].lab = [cc.venue_name];
        }
    }

    // Department default venues
    const dept_venue_maps = db.prepare("SELECT * FROM department_venue_map WHERE department_code = ? AND semester = ?").all(department_code, semester);
    const default_labs = [];
    const default_classrooms = [];
    const classroom_venues_info = [];
    const lab_venues_info = [];

    const dvm_vids = [...new Set(dept_venue_maps.map(dvm => dvm.venue_id))];
    const dvm_venues = dvm_vids.length > 0 ? db.prepare(`SELECT * FROM venue_master WHERE venue_id IN (${dvm_vids.map(() => '?').join(',')})`).all(...dvm_vids) : [];
    const dvm_vdict = {};
    for (const v of dvm_venues) dvm_vdict[v.venue_id] = v;

    for (const dvm of dept_venue_maps) {
        const v = dvm_vdict[dvm.venue_id];
        if (v) {
            if (v.is_lab) {
                default_labs.push(v.venue_name);
                lab_venues_info.push([v.venue_name, v.capacity || c_default_cap]);
            } else {
                default_classrooms.push(v.venue_name);
                classroom_venues_info.push([v.venue_name, v.capacity || c_default_cap]);
            }
        }
    }

    // =========================================================
    // 1b. MULTI-SECTION CALCULATION
    // =========================================================
    const sem_count = db.prepare("SELECT * FROM department_semester_count WHERE department_code = ? AND semester = ?").get(department_code, semester);
    let student_count = 60;
    if (sem_count) {
        if (learning_mode_ids) {
            try {
                const count_data = sem_count.student_count_data ? JSON.parse(sem_count.student_count_data) : {};
                student_count = learning_mode_ids.reduce((sum, m_id) => sum + (count_data[String(m_id)] || 0), 0);
            } catch (e) { student_count = sem_count.student_count; }
        } else {
            student_count = sem_count.student_count;
        }
    }
    if (student_count <= 0) student_count = 60;

    const max_classroom_cap = classroom_venues_info.length > 0 ? Math.max(...classroom_venues_info.map(c => c[1])) : c_default_cap;
    const max_lab_cap = lab_venues_info.length > 0 ? Math.max(...lab_venues_info.map(c => c[1])) : c_default_cap;

    function get_course_sections(course_code, is_lab_req) {
        const course_obj = courses.find(c => c.course_code === course_code);
        if (!course_obj) return 1;

        let enrolled = 0;
        if (learning_mode_ids) {
            try {
                const enroll_data = course_obj.enrollment_data ? JSON.parse(course_obj.enrollment_data) : {};
                enrolled = learning_mode_ids.reduce((sum, m_id) => sum + (enroll_data[String(m_id)] || 0), 0);
            } catch (e) { enrolled = course_obj.enrolled_students || 0; }
        } else {
            enrolled = course_obj.enrolled_students || 0;
        }

        const base_count = enrolled > 0 ? Math.min(enrolled, student_count) : student_count;
        const cap = is_lab_req ? max_lab_cap : max_classroom_cap;
        let sections = cap > 0 ? Math.ceil(base_count / cap) : 1;
        if (base_count % cap > 0 && base_count % cap < c_min_section_thresh) {
            if (enrolled > 0 && base_count < c_min_section_thresh) {
                sections = Math.max(sections, 1);
            } else {
                sections = Math.max(sections - 1, 1);
            }
        }
        return sections;
    }

    // Global faculty occupancy
    const global_faculty_busy = {};
    const all_existing = db.prepare("SELECT * FROM timetable_entries WHERE department_code != ?").all(department_code);
    for (const e of all_existing) {
        const key = `${e.day_of_week}_${e.period_number}`;
        if (!global_faculty_busy[key]) global_faculty_busy[key] = new Set();
        if (e.faculty_id) global_faculty_busy[key].add(e.faculty_id);
    }

    const run_faculty_busy = {};

    function is_faculty_free(fac_id, day, period) {
        if (!fac_id) return true;
        const key = `${day}_${period}`;
        if (global_faculty_busy[key] && global_faculty_busy[key].has(fac_id)) return false;
        if (run_faculty_busy[key] && run_faculty_busy[key].has(fac_id)) return false;
        return true;
    }

    function mark_faculty_busy(fac_id, day, period) {
        if (!fac_id) return;
        const key = `${day}_${period}`;
        if (!run_faculty_busy[key]) run_faculty_busy[key] = new Set();
        run_faculty_busy[key].add(fac_id);
    }

    const generation_warnings = [];
    const generation_errors = [];

    function add_warning(res_type, course_code, cname, period_val, section, reason) {
        const sec_str = String(section).replace(/section\s*/gi, '').trim();
        const w_dict = {
            type: res_type,
            course_code,
            subject_name: cname,
            period: typeof period_val === 'number' ? `Period ${period_val}` : String(period_val),
            section: sec_str,
            reason
        };
        const exists = generation_warnings.some(w => JSON.stringify(w) === JSON.stringify(w_dict));
        if (!exists) generation_warnings.push(w_dict);
    }

    const mentor_day_clean = mentor_day.trim().charAt(0).toUpperCase() + mentor_day.trim().slice(1).toLowerCase();

    // Separate courses
    let regular_courses = courses.filter(c => !(c.is_honours || c.is_minor));
    let honours_courses = courses.filter(c => c.is_honours || c.is_minor);

    // Build elective pair groups
    const elective_groups = {};
    const elective_partners = {};
    let solver_regular_courses = [];

    for (const c of regular_courses) {
        const cat = (c.course_category || '').trim().toUpperCase();
        const is_elective_cat = cat.startsWith('ELECTIVE') && c.is_elective;
        if (is_elective_cat && c_pair_electives) {
            if (!elective_groups[cat]) elective_groups[cat] = [];
            elective_groups[cat].push(c);
        } else {
            solver_regular_courses.push(c);
        }
    }

    for (const [cat, group] of Object.entries(elective_groups)) {
        const rep = group[0];
        solver_regular_courses.push(rep);
        const partners = group.slice(1);
        elective_partners[rep.course_code] = partners;
        if (partners.length > 0) {
            console.log(`  ðŸ”— ${cat}: ${rep.course_code} (solver) â†” ${partners.map(p => p.course_code).join(', ')} (paired)`);
        }
    }

    regular_courses = solver_regular_courses;

    // Split theory vs lab
    const course_theory_count = {};
    const course_lab_blocks = {};
    for (const c of courses) {
        let theory = (c.lecture_hours || 0) + (c.tutorial_hours || 0);
        const lab_periods = c.practical_hours || 0;
        let lab_blocks_val = lab_periods >= 2 ? Math.floor(lab_periods / 2) : 0;
        if (lab_periods % 2 === 1) theory += 1;
        course_theory_count[c.course_code] = theory;
        course_lab_blocks[c.course_code] = lab_blocks_val;
    }

    // Calculate available slots
    let p17_slots = 0;
    for (const day of all_days) {
        for (const p of (day_periods[day] || [])) {
            if (p <= 7 && !(day === mentor_day_clean && p === mentor_period)) p17_slots++;
        }
    }
    let p8_slots_count = 0;
    for (const day of all_days) {
        if (slot_lookup[`${day}_8`] && !(day === mentor_day_clean && mentor_period === 8)) p8_slots_count++;
    }

    const reg_sessions = regular_courses.reduce((sum, c) => sum + course_theory_count[c.course_code] + course_lab_blocks[c.course_code] * 2, 0);
    const is_overloaded = reg_sessions > p17_slots;
    let use_p8_for_regular = is_overloaded && honours_courses.length === 0 && c_p8_honours_only;
    if (!c_p8_honours_only) use_p8_for_regular = true;

    const max_regular_period = use_p8_for_regular ? 8 : 7;

    // =========================================================
    // BATCH ROTATION LOGIC
    // =========================================================
    const mini_projects = courses.filter(c => (c.course_name || '').toLowerCase().includes('mini project'));
    let core_lab_courses = regular_courses.filter(c =>
        course_lab_blocks[c.course_code] > 0 &&
        (!c.is_elective || (c.course_category && c.course_category.toUpperCase().includes('LANGUAGE'))) &&
        !mini_projects.includes(c)
    );

    let batch_rotation_needed = false;
    let merged_batch_count = 0;
    const faculty_deficient_labs = [];
    const venue_deficient_labs = [];
    const resource_sufficient_labs = [];
    let core_lab_courses_to_merge = [];

    if (core_lab_courses.length > 0) {
        for (const c of core_lab_courses) {
            const needed_sections = get_course_sections(c.course_code, true);
            const valid_facs = get_lab_faculty(c.course_code, course_faculty).filter(f => ['LAB', 'THEORY WITH LAB'].includes(f[2]));
            const course_cv = cv_lookup[c.course_code] || {};
            const course_lab_pool = (course_cv.lab && course_cv.lab.length > 0) ? course_cv.lab : default_labs;
            const is_faculty_deficient = valid_facs.length < needed_sections;
            const is_venue_deficient = c_venue_aware_rot && course_lab_pool.length < needed_sections;

            if (is_faculty_deficient) faculty_deficient_labs.push(c);
            if (is_venue_deficient) venue_deficient_labs.push(c);
            if (!is_faculty_deficient && !is_venue_deficient) resource_sufficient_labs.push(c);
        }

        const seen = new Set();
        const resource_deficient_labs = [];
        for (const c of [...faculty_deficient_labs, ...venue_deficient_labs]) {
            if (!seen.has(c.course_code)) { seen.add(c.course_code); resource_deficient_labs.push(c); }
        }

        if (resource_deficient_labs.length >= 2 && c_batch_rot_enabled) {
            core_lab_courses_to_merge = resource_deficient_labs;
            batch_rotation_needed = true;
            merged_batch_count = Math.max(...core_lab_courses_to_merge.map(c => get_course_sections(c.course_code, true)));
        } else if (resource_deficient_labs.length === 1 && c_batch_rot_enabled) {
            if (resource_sufficient_labs.length > 0) {
                core_lab_courses_to_merge = [...resource_deficient_labs, resource_sufficient_labs[0]];
                batch_rotation_needed = true;
                merged_batch_count = Math.max(...core_lab_courses_to_merge.map(c => get_course_sections(c.course_code, true)));
            }
        }
    }

    core_lab_courses = batch_rotation_needed ? core_lab_courses_to_merge : [];

    if (batch_rotation_needed) {
        console.log(`  ðŸ”„ Lab Batch Rotation TRIGGERED: Merging ${core_lab_courses.length} labs into ${merged_batch_count} batches.`);
    } else {
        console.log('  âœ… Sufficient resources. Lab Batch Rotation not needed.');
    }

    // =========================================================
    // PRE-VALIDATION (HARD MODE)
    // =========================================================
    if (hard_mode) {
        for (const c of regular_courses) {
            if (is_mini_project(c.course_code, course_names, courses)) continue;
            const needed = get_course_sections(c.course_code, false);
            const mapped_theory = get_theory_faculty(c.course_code, course_faculty).filter(f => f[0]).length;
            if (needed > 0 && mapped_theory < needed) {
                generation_errors.push(make_error('FACULTY_DEFICIT', c.course_code, course_names[c.course_code], { required: needed, available: mapped_theory, deficit: needed - mapped_theory, type: 'THEORY' }, { department: department_code, semester }, `Map at least ${needed - mapped_theory} more theory faculty.`));
            }
        }
        if (generation_errors.length > 0) {
            return { success: false, errors: generation_errors, warnings: generation_warnings, entries_saved: 0 };
        }
    }

    // =========================================================
    // 2. CP-SAT MODEL
    // =========================================================
    const model = new cp.CpModel();

    // THEORY variables
    const theory_vars = {};
    for (const c of regular_courses) {
        for (const day of all_days) {
            for (const period of (day_periods[day] || [])) {
                if (period > max_regular_period) continue;
                theory_vars[`${c.course_code}_${day}_${period}`] = model.NewBoolVar(`th_${c.course_code}_${day}_${period}`);
            }
        }
    }

    // LAB variables
    const lab_vars = {};
    const merged_lab_vars = {};

    if (batch_rotation_needed) {
        for (const day of all_days) {
            for (const bs of lab_block_starts) {
                if (slot_lookup[`${day}_${bs}`] && slot_lookup[`${day}_${bs + 1}`]) {
                    merged_lab_vars[`${day}_${bs}`] = model.NewBoolVar(`merged_lab_${day}_${bs}`);
                }
            }
        }
    }

    for (const c of regular_courses) {
        if (course_lab_blocks[c.course_code] === 0) continue;
        if (batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code)) continue;
        for (const day of all_days) {
            for (const bs of lab_block_starts) {
                if (slot_lookup[`${day}_${bs}`] && slot_lookup[`${day}_${bs + 1}`]) {
                    lab_vars[`${c.course_code}_${day}_${bs}`] = model.NewBoolVar(`lab_${c.course_code}_${day}_${bs}`);
                }
            }
        }
    }

    // COMMON COURSE PINNING
    for (const c of regular_courses) {
        const common_depts = db.prepare("SELECT * FROM common_course_map WHERE course_code = ? AND semester = ?").all(c.course_code, semester);
        if (common_depts.length >= 2) {
            const anchor_entry = db.prepare("SELECT * FROM timetable_entries WHERE course_code = ? AND semester = ? AND department_code != ? LIMIT 1").get(c.course_code, semester, department_code);
            if (anchor_entry) {
                const anchor_entries = db.prepare("SELECT * FROM timetable_entries WHERE course_code = ? AND semester = ? AND department_code = ?").all(c.course_code, semester, anchor_entry.department_code);
                const anchor_theory = new Set(anchor_entries.filter(e => e.session_type === 'THEORY').map(e => `${e.day_of_week}_${e.period_number}`));
                const anchor_lab = new Set(anchor_entries.filter(e => e.session_type === 'LAB').map(e => `${e.day_of_week}_${e.period_number}`));

                if (anchor_theory.size > 0 && course_theory_count[c.course_code] > 0) {
                    for (const day of all_days) {
                        for (const period of (day_periods[day] || [])) {
                            if (period > max_regular_period) continue;
                            const tVar = theory_vars[`${c.course_code}_${day}_${period}`];
                            if (tVar) {
                                if (anchor_theory.has(`${day}_${period}`)) model.Add(tVar.eq(1));
                                else model.Add(tVar.eq(0));
                            }
                        }
                    }
                }

                if (anchor_lab.size > 0 && course_lab_blocks[c.course_code] > 0 && !(batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code))) {
                    for (const day of all_days) {
                        for (const bs of lab_block_starts) {
                            if (slot_lookup[`${day}_${bs}`] && slot_lookup[`${day}_${bs + 1}`]) {
                                const lVar = lab_vars[`${c.course_code}_${day}_${bs}`];
                                if (lVar) {
                                    if (anchor_lab.has(`${day}_${bs}`)) model.Add(lVar.eq(1));
                                    else model.Add(lVar.eq(0));
                                }
                            }
                        }
                    }
                }
                console.log(`  ðŸ”— CP-SAT constraint: pinned ${c.course_code} to anchor dept ${anchor_entry.department_code}`);
            }
        }
    }

    // =========================================================
    // 3. CONSTRAINTS
    // =========================================================

    // C2/C3: Weekly session counts
    for (const c of regular_courses) {
        const theory_sum = Object.keys(theory_vars).filter(k => k.startsWith(`${c.course_code}_`)).map(k => theory_vars[k]);
        if (course_theory_count[c.course_code] > 0) {
            model.Add(cp.sum(theory_sum).eq(course_theory_count[c.course_code]));
        } else {
            for (const v of theory_sum) model.Add(v.eq(0));
        }
        if (course_lab_blocks[c.course_code] > 0) {
            if (!(batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code))) {
                const lab_sum = Object.keys(lab_vars).filter(k => k.startsWith(`${c.course_code}_`)).map(k => lab_vars[k]);
                model.Add(cp.sum(lab_sum).eq(course_lab_blocks[c.course_code]));
            }
        }
    }

    if (batch_rotation_needed && core_lab_courses.length > 0) {
        const num_merged_labs = core_lab_courses.length;
        const target_blocks = Math.max(...core_lab_courses.map(c => course_lab_blocks[c.course_code])) * num_merged_labs;
        model.Add(cp.sum(Object.values(merged_lab_vars)).eq(target_blocks));
    }

    
    // C4.1: Locked Slots blocking
    if (locked_slots && locked_slots.length > 0) {
        for (const ls of locked_slots) {
            const ls_day = ls.day.trim().charAt(0).toUpperCase() + ls.day.trim().slice(1).toLowerCase();
            const ls_period = ls.period;
            
            // Block all regular theory courses
            for (const c of regular_courses) {
                const key = `${c.course_code}_${ls_day}_${ls_period}`;
                if (theory_vars[key]) model.Add(theory_vars[key].eq(0));
            }
            
            // Block lab variables (since lab occupies bs and bs+1, block if bs matches or bs+1 matches)
            for (const c of regular_courses) {
                for (const bs of lab_block_starts) {
                    if (ls_period === bs || ls_period === bs + 1) {
                        const key = `${c.course_code}_${ls_day}_${bs}`;
                        if (lab_vars[key]) model.Add(lab_vars[key].eq(0));
                    }
                }
            }
            
            // Block merged lab variables
            if (batch_rotation_needed) {
                for (const bs of lab_block_starts) {
                    if (ls_period === bs || ls_period === bs + 1) {
                        const mkey = `${ls_day}_${bs}`;
                        if (merged_lab_vars[mkey]) model.Add(merged_lab_vars[mkey].eq(0));
                    }
                }
            }
        }
    }

    // C4: Mentor hour blocking
    if (c_mentor_blocked) {
        for (const c of regular_courses) {
            const key = `${c.course_code}_${mentor_day_clean}_${mentor_period}`;
            if (theory_vars[key]) model.Add(theory_vars[key].eq(0));
        }
        for (const c of regular_courses) {
            for (const bs of lab_block_starts) {
                if (mentor_period === bs || mentor_period === bs + 1) {
                    const key = `${c.course_code}_${mentor_day_clean}_${bs}`;
                    if (lab_vars[key]) model.Add(lab_vars[key].eq(0));
                }
            }
        }
        if (batch_rotation_needed) {
            for (const bs of lab_block_starts) {
                if (mentor_period === bs || mentor_period === bs + 1) {
                    const mkey = `${mentor_day_clean}_${bs}`;
                    if (merged_lab_vars[mkey]) model.Add(merged_lab_vars[mkey].eq(0));
                }
            }
        }
    }

    // C6: Slot occupancy
    const core_slot_fills = [];
    for (const day of all_days) {
        for (const period of (day_periods[day] || [])) {
            if (period > max_regular_period) continue;
            const occupants = [];
            for (const c of regular_courses) {
                const key = `${c.course_code}_${day}_${period}`;
                if (theory_vars[key]) occupants.push(theory_vars[key]);
                if (course_lab_blocks[c.course_code] > 0) {
                    for (const bs of lab_block_starts) {
                        if (period === bs || period === bs + 1) {
                            const lkey = `${c.course_code}_${day}_${bs}`;
                            if (lab_vars[lkey]) occupants.push(lab_vars[lkey]);
                        }
                    }
                }
            }
            if (batch_rotation_needed) {
                for (const bs of lab_block_starts) {
                    if (period === bs || period === bs + 1) {
                        const mkey = `${day}_${bs}`;
                        if (merged_lab_vars[mkey]) { occupants.push(merged_lab_vars[mkey]); break; }
                    }
                }
            }
            if (occupants.length === 0) continue;
            const is_mentor = (day === mentor_day_clean && period === mentor_period);
            if (is_mentor && c_mentor_blocked) {
                model.Add(cp.sum(occupants).eq(0));
            } else {
                model.Add(cp.sum(occupants).le(1));
                core_slot_fills.push(...occupants);
            }
        }
    }

    // C7: No back-to-back theory
    if (c_no_back_to_back && !is_overloaded) {
        for (const c of regular_courses) {
            for (const day of all_days) {
                const pl = (day_periods[day] || []).filter(p => p <= 7).sort((a, b) => a - b);
                for (let i = 0; i < pl.length - 1; i++) {
                    const p1 = pl[i], p2 = pl[i + 1];
                    if (p2 === p1 + 1) {
                        const k1 = `${c.course_code}_${day}_${p1}`;
                        const k2 = `${c.course_code}_${day}_${p2}`;
                        if (theory_vars[k1] && theory_vars[k2]) {
                            model.Add(theory_vars[k1].plus(theory_vars[k2]).le(1));
                        }
                    }
                }
            }
        }
    }

    // C8: Max theory per course per day
    const max_theory_per_day = is_overloaded ? c_max_theory_over : c_max_theory_norm;
    for (const c of regular_courses) {
        for (const day of all_days) {
            const day_theory = (day_periods[day] || []).filter(p => theory_vars[`${c.course_code}_${day}_${p}`]).map(p => theory_vars[`${c.course_code}_${day}_${p}`]);
            if (day_theory.length > 0) {
                model.Add(cp.sum(day_theory).le(max_theory_per_day));
            }
        }
    }

    // C9: Max lab blocks per day globally
    for (const day of all_days) {
        const all_lab_blocks_on_day = [];
        for (const c of regular_courses) {
            if (course_lab_blocks[c.course_code] === 0) continue;
            for (const bs of lab_block_starts) {
                if (lab_vars[`${c.course_code}_${day}_${bs}`]) all_lab_blocks_on_day.push(lab_vars[`${c.course_code}_${day}_${bs}`]);
            }
        }
        if (batch_rotation_needed) {
            for (const bs of lab_block_starts) {
                if (merged_lab_vars[`${day}_${bs}`]) all_lab_blocks_on_day.push(merged_lab_vars[`${day}_${bs}`]);
            }
        }
        if (all_lab_blocks_on_day.length > c_max_lab_blocks) {
            model.Add(cp.sum(all_lab_blocks_on_day).le(c_max_lab_blocks));
        }
    }

    // C10: Lab non-consecutive days
    const lab_spread_penalties = [];
    for (let i = 0; i < all_days.length - 1; i++) {
        const day1 = all_days[i], day2 = all_days[i + 1];
        const labs_day1 = [], labs_day2 = [];
        for (const c of regular_courses) {
            if (course_lab_blocks[c.course_code] === 0) continue;
            for (const bs of lab_block_starts) {
                if (lab_vars[`${c.course_code}_${day1}_${bs}`]) labs_day1.push(lab_vars[`${c.course_code}_${day1}_${bs}`]);
                if (lab_vars[`${c.course_code}_${day2}_${bs}`]) labs_day2.push(lab_vars[`${c.course_code}_${day2}_${bs}`]);
            }
        }
        if (batch_rotation_needed) {
            for (const bs of lab_block_starts) {
                if (merged_lab_vars[`${day1}_${bs}`]) labs_day1.push(merged_lab_vars[`${day1}_${bs}`]);
                if (merged_lab_vars[`${day2}_${bs}`]) labs_day2.push(merged_lab_vars[`${day2}_${bs}`]);
            }
        }
        if (labs_day1.length > 0 && labs_day2.length > 0) {
            const total_lab_blocks_val = regular_courses.reduce((sum, c) => sum + (course_lab_blocks[c.course_code] || 0), 0);
            if (total_lab_blocks_val <= 3) {
                model.Add(cp.sum([...labs_day1, ...labs_day2]).le(1));
            } else {
                const has_d1 = model.NewBoolVar(`glab_d1_${day1}`);
                const has_d2 = model.NewBoolVar(`glab_d2_${day2}`);
                model.addMaxEquality(has_d1, labs_day1);
                model.addMaxEquality(has_d2, labs_day2);
                const consec = model.NewBoolVar(`gconsec_${day1}_${day2}`);
                model.addMultiplicationEquality(consec, [has_d1, has_d2]);
                lab_spread_penalties.push(consec);
            }
        }
    }

    // C12: No theory in own lab slot
    if (c_no_theory_in_own_lab) {
        for (const c of regular_courses) {
            if (course_lab_blocks[c.course_code] === 0) continue;
            for (const day of all_days) {
                for (const bs of lab_block_starts) {
                    let lvar = null;
                    if (batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code)) {
                        lvar = merged_lab_vars[`${day}_${bs}`];
                    } else {
                        lvar = lab_vars[`${c.course_code}_${day}_${bs}`];
                    }
                    if (!lvar) continue;
                    for (const p of [bs, bs + 1]) {
                        const tkey = `${c.course_code}_${day}_${p}`;
                        if (theory_vars[tkey]) {
                            model.Add(theory_vars[tkey].plus(lvar).le(1));
                        }
                    }
                }
            }
        }
    }

    // C5: Faculty clash
    if (c_no_fac_clash) {
        const faculty_courses_map = {};
        for (const c of regular_courses) {
            for (const [fid, fname, dtype] of (course_faculty[c.course_code] || [])) {
                if (!fid || ['nan', 'none'].includes(String(fid).toLowerCase())) continue;
                if (!faculty_courses_map[fid]) faculty_courses_map[fid] = new Set();
                faculty_courses_map[fid].add(c.course_code);
            }
        }
        for (const [fid, taught_codes_set] of Object.entries(faculty_courses_map)) {
            const taught_codes = Array.from(taught_codes_set);
            if (taught_codes.length <= 1) continue;
            for (const day of all_days) {
                for (const period of (day_periods[day] || [])) {
                    const occupants = [];
                    for (const cc of taught_codes) {
                        const key = `${cc}_${day}_${period}`;
                        if (theory_vars[key]) occupants.push(theory_vars[key]);
                        if ((course_lab_blocks[cc] || 0) > 0) {
                            for (const bs of lab_block_starts) {
                                if (period === bs || period === bs + 1) {
                                    if (batch_rotation_needed && core_lab_courses.some(x => x.course_code === cc)) {
                                        if (merged_lab_vars[`${day}_${bs}`]) occupants.push(merged_lab_vars[`${day}_${bs}`]);
                                    } else {
                                        if (lab_vars[`${cc}_${day}_${bs}`]) occupants.push(lab_vars[`${cc}_${day}_${bs}`]);
                                    }
                                }
                            }
                        }
                    }
                    if (occupants.length > 1) {
                        model.Add(cp.sum(occupants).le(1));
                    }
                }
            }
        }
    }

    // C11: Theory-lab same day bonus
    const theory_lab_same_day_bonus = [];
    for (const c of regular_courses) {
        if (course_lab_blocks[c.course_code] === 0 || course_theory_count[c.course_code] === 0) continue;
        for (const day of all_days) {
            let day_lab_vars_arr;
            if (batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code)) {
                day_lab_vars_arr = lab_block_starts.filter(bs => merged_lab_vars[`${day}_${bs}`]).map(bs => merged_lab_vars[`${day}_${bs}`]);
            } else {
                day_lab_vars_arr = lab_block_starts.filter(bs => lab_vars[`${c.course_code}_${day}_${bs}`]).map(bs => lab_vars[`${c.course_code}_${day}_${bs}`]);
            }
            const day_theory_vars_arr = (day_periods[day] || []).filter(p => theory_vars[`${c.course_code}_${day}_${p}`]).map(p => theory_vars[`${c.course_code}_${day}_${p}`]);

            if (day_lab_vars_arr.length > 0 && day_theory_vars_arr.length > 0) {
                const lab_on_day = model.NewBoolVar(`lab_day_${c.course_code}_${day}`);
                const theory_on_day = model.NewBoolVar(`th_day_${c.course_code}_${day}`);
                model.addMaxEquality(lab_on_day, day_lab_vars_arr);
                model.addMaxEquality(theory_on_day, day_theory_vars_arr);
                const both = model.NewBoolVar(`both_${c.course_code}_${day}`);
                model.addMultiplicationEquality(both, [lab_on_day, theory_on_day]);
                theory_lab_same_day_bonus.push(both);
            }
        }
    }

    // USER-DEFINED CONSTRAINTS (pre-solve)
    const user_interpreter = new ConstraintInterpreter(db, department_code, semester);
    user_interpreter.loadConstraints();
    const uc_warnings = user_interpreter.validateConstraints(regular_courses, slots, all_days, day_periods, slot_lookup);
    generation_warnings.push(...uc_warnings);
    user_interpreter.applyToModel(model, theory_vars, lab_vars, merged_lab_vars, core_slot_fills, [], all_days, day_periods, slot_lookup, new Set());

    // OBJECTIVE
    const objective_terms = [];
    if (c_fill_bonus !== 0) {
        for (const v of core_slot_fills) objective_terms.push(v.times(c_fill_bonus));
    }
    if (c_theory_lab_bonus !== 0) {
        for (const v of theory_lab_same_day_bonus) objective_terms.push(v.times(c_theory_lab_bonus));
    }
    if (c_consecutive_lab_penalty !== 0) {
        for (const v of lab_spread_penalties) objective_terms.push(v.times(c_consecutive_lab_penalty));
    }
    if (objective_terms.length > 0) {
        model.maximize(cp.sum(objective_terms));
    }

    // =========================================================
    // 4. SOLVE
    // =========================================================
    const solver = new cp.CpSolver();
    const status = await solver.solve(model, { maxTimeInSeconds: 60.0, numSearchWorkers: 4 });

    const OPTIMAL = 4; // cp.CpSolverStatus values
    const FEASIBLE = 2;
    if (status !== OPTIMAL && status !== FEASIBLE && status !== "OPTIMAL" && status !== "FEASIBLE") {
        console.log(`âŒ No solution found (status=${status}).`);
        return { success: false, errors: [make_error('SOLVER_FAILED', null, null, {}, { department: department_code, semester }, 'Try relaxing constraints or adding more resources.')], warnings: [], entries_saved: 0 };
    }
    console.log(`âœ… Solution Found (status=${status})`);

    // =========================================================
    // 4b. GLOBAL VENUE TRACKING
    // =========================================================
    const other_entries = db.prepare("SELECT * FROM timetable_entries WHERE semester = ? AND department_code != ?").all(semester, department_code);
    const global_occupancy = {};
    for (const e of other_entries) {
        if (!e.venue_name) continue;
        const venues = e.venue_name.split(',').map(v => v.trim());
        const key = `${e.day_of_week}_${e.period_number}`;
        if (!global_occupancy[key]) global_occupancy[key] = new Set();
        for (const v of venues) global_occupancy[key].add(v);
    }
    const current_run_occupancy = {};

    function assign_venue(day, period, course_code, is_lab, required_idx) {
        if (is_mini_project(course_code, course_names, courses)) return null;
        const course_cv = cv_lookup[course_code] || {};
        const session_key = is_lab ? 'lab' : 'theory';
        let pool = (course_cv[session_key] && course_cv[session_key].length > 0) ? course_cv[session_key] : (is_lab ? default_labs : default_classrooms);
        if (!pool || pool.length === 0) return null;

        const key = `${day}_${period}`;
        const occupied_g = global_occupancy[key] || new Set();
        const occupied_l = current_run_occupancy[key] || new Set();
        const available = pool.filter(v => !occupied_g.has(v) && !occupied_l.has(v));
        let assigned;
        if (available.length === 0) {
            assigned = pool[0]; // fallback
        } else {
            assigned = available[required_idx % available.length];
        }
        if (!current_run_occupancy[key]) current_run_occupancy[key] = new Set();
        current_run_occupancy[key].add(assigned);
        return assigned;
    }

    // =========================================================
    // 5. SAVE ENTRIES
    // =========================================================
    const modeStr = learning_mode_str || "1,2";
    db.prepare("DELETE FROM timetable_entries WHERE department_code = ? AND semester = ? AND learning_mode_ids = ?").run(department_code, semester, modeStr);

    let count = 0;
    const filled_slots = new Set();

    const all_partner_codes = new Set();
    for (const partners of Object.values(elective_partners)) {
        for (const p of partners) all_partner_codes.add(p.course_code);
    }

    // Save THEORY entries
    for (const c of regular_courses) {
        if (all_partner_codes.has(c.course_code)) continue;
        const sorted_fac = get_theory_faculty(c.course_code, course_faculty);
        const cname = course_names[c.course_code] || c.course_code;
        const partners = elective_partners[c.course_code] || [];
        const all_group_courses = [c, ...partners];

        for (const day of all_days) {
            for (const period of (day_periods[day] || [])) {
                const key = `${c.course_code}_${day}_${period}`;
                if (theory_vars[key] && solver.value(theory_vars[key])) {
                    const slot_obj = slot_lookup[`${day}_${period}`];
                    if (!slot_obj) continue;

                    for (const gc of all_group_courses) {
                        const gc_fac = get_theory_faculty(gc.course_code, course_faculty);
                        const gc_name = course_names[gc.course_code] || gc.course_code;
                        const total_secs = get_course_sections(gc.course_code, false);
                        let assigned_sections = 0;

                        for (let sec = 0; sec < total_secs; sec++) {
                            let fac_assigned = null;
                            for (const [fid, fname, dtype] of gc_fac) {
                                if (is_faculty_free(fid, day, period)) { fac_assigned = [fid, fname]; break; }
                            }
                            if (!fac_assigned && gc_fac.length > 0) {
                                fac_assigned = [null, 'Unassigned'];
                                if (!is_mini_project(gc.course_code, course_names, courses)) {
                                    add_warning('FACULTY', gc.course_code, gc_name, period, sec + 1, 'Not enough faculty are available.');
                                }
                            } else if (!fac_assigned) {
                                fac_assigned = [null, 'Unassigned'];
                            }

                            const c_venue = assign_venue(day, period, gc.course_code, false, count + sec);
                            db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'THEORY', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, gc.course_code, gc_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, period, c_venue, sec + 1);
                            mark_faculty_busy(fac_assigned[0], day, period);
                            assigned_sections++;
                        }
                    }
                    filled_slots.add(`${day}_${period}`);
                    count += get_course_sections(c.course_code, false) * all_group_courses.length;
                }
            }
        }
    }

    // Save LAB entries (non-merged)
    for (const c of regular_courses) {
        if (all_partner_codes.has(c.course_code)) continue;
        if (course_lab_blocks[c.course_code] === 0) continue;
        if (batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code)) continue;

        const partners = elective_partners[c.course_code] || [];
        const all_group_courses = [c, ...partners];

        for (const day of all_days) {
            for (const bs of lab_block_starts) {
                const lkey = `${c.course_code}_${day}_${bs}`;
                if (lab_vars[lkey] && solver.value(lab_vars[lkey])) {
                    for (const gc of all_group_courses) {
                        const gc_fac = get_lab_faculty(gc.course_code, course_faculty);
                        const gc_name = course_names[gc.course_code] || gc.course_code;
                        const total_lab_secs = get_course_sections(gc.course_code, true);

                        for (let sec = 0; sec < total_lab_secs; sec++) {
                            let fac_assigned = null;
                            for (const [fid, fname, dtype] of gc_fac) {
                                if (is_faculty_free(fid, day, bs) && is_faculty_free(fid, day, bs + 1)) { fac_assigned = [fid, fname]; break; }
                            }
                            if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                            for (const p of [bs, bs + 1]) {
                                const c_v = assign_venue(day, p, gc.course_code, true, count + sec);
                                const slot_obj = slot_lookup[`${day}_${p}`];
                                if (slot_obj) {
                                    db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'LAB', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, gc.course_code, gc_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_v, sec + 1);
                                    filled_slots.add(`${day}_${p}`);
                                    count++;
                                }
                            }
                            mark_faculty_busy(fac_assigned[0], day, bs);
                            mark_faculty_busy(fac_assigned[0], day, bs + 1);
                        }
                    }
                }
            }
        }
    }

    // Save MERGED LAB entries (Batch Rotation)
    if (batch_rotation_needed && core_lab_courses.length > 0) {
        const core_lab_ordered = [...core_lab_courses_to_merge].sort((a, b) => a.course_code.localeCompare(b.course_code));
        const num_labs = core_lab_ordered.length;
        const assigned_lab_pairs = new Set();
        const chosen_merged_slots = [];
        for (const day of all_days) {
            for (const bs of lab_block_starts) {
                const mkey = `${day}_${bs}`;
                if (merged_lab_vars[mkey] && solver.value(merged_lab_vars[mkey])) {
                    chosen_merged_slots.push([day, bs]);
                }
            }
        }

        for (let slot_order = 0; slot_order < chosen_merged_slots.length; slot_order++) {
            const [day, bs] = chosen_merged_slots[slot_order];
            for (let batch_idx = 0; batch_idx < merged_batch_count; batch_idx++) {
                const lab_idx = (batch_idx + slot_order) % num_labs;
                const c = core_lab_ordered[lab_idx];
                const cname = course_names[c.course_code] || c.course_code;
                const pair_key = `${batch_idx}_${c.course_code}`;

                if (!assigned_lab_pairs.has(pair_key)) {
                    assigned_lab_pairs.add(pair_key);
                    const gc_fac = get_lab_faculty(c.course_code, course_faculty);
                    let fac_assigned = null;
                    for (const [fid, fname, dtype] of gc_fac) {
                        if (is_faculty_free(fid, day, bs) && is_faculty_free(fid, day, bs + 1)) { fac_assigned = [fid, fname]; break; }
                    }
                    if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                    const display_name = core_lab_courses_to_merge.length > 1 ? `B${batch_idx + 1}: ${cname}` : cname;
                    for (const p of [bs, bs + 1]) {
                        const c_v = assign_venue(day, p, c.course_code, true, batch_idx);
                        const slot_obj = slot_lookup[`${day}_${p}`];
                        if (slot_obj) {
                            db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'LAB', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, display_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_v, batch_idx + 1);
                            filled_slots.add(`${day}_${p}`);
                            count++;
                        }
                    }
                    mark_faculty_busy(fac_assigned[0], day, bs);
                    mark_faculty_busy(fac_assigned[0], day, bs + 1);
                } else {
                    // Theory fallback
                    const gc_fac = get_theory_faculty(c.course_code, course_faculty);
                    let fac_assigned = null;
                    for (const [fid, fname, dtype] of gc_fac) {
                        if (is_faculty_free(fid, day, bs) && is_faculty_free(fid, day, bs + 1)) { fac_assigned = [fid, fname]; break; }
                    }
                    if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                    for (const p of [bs, bs + 1]) {
                        const c_v = assign_venue(day, p, c.course_code, false, batch_idx);
                        const slot_obj = slot_lookup[`${day}_${p}`];
                        if (slot_obj) {
                            db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'THEORY', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, `${cname} (Theory)`, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_v, batch_idx + 1);
                            filled_slots.add(`${day}_${p}`);
                            count++;
                        }
                    }
                    mark_faculty_busy(fac_assigned[0], day, bs);
                    mark_faculty_busy(fac_assigned[0], day, bs + 1);
                }
            }
        }
    }

    // =========================================================
    // 5.5 COMMON COURSES â€” Honours sync
    // =========================================================
    const common_placed_codes = new Set();
    for (const c of honours_courses) {
        const common_depts = db.prepare("SELECT * FROM common_course_map WHERE course_code = ? AND semester = ?").all(c.course_code, semester);
        if (common_depts.length < 2) continue;

        const anchor_entry = db.prepare("SELECT * FROM timetable_entries WHERE course_code = ? AND semester = ? AND department_code != ? LIMIT 1").get(c.course_code, semester, department_code);
        const fids = course_faculty[c.course_code] || [];
        const cname = course_names[c.course_code] || c.course_code;
        const [fid, fname] = fids.length > 0 ? [fids[0][0], fids[0][1]] : [null, 'Unassigned'];
        const stype = c.is_honours ? 'HONOURS' : 'MINOR';
        const needed = c.weekly_sessions || (course_theory_count[c.course_code] || 3) + (course_lab_blocks[c.course_code] || 0) * 2;

        if (anchor_entry) {
            const anchor_entries = db.prepare("SELECT * FROM timetable_entries WHERE course_code = ? AND semester = ? AND department_code = ?").all(c.course_code, semester, anchor_entry.department_code);
            const seen_slots_set = new Set();
            const anchor_slots = [];
            for (const ae of anchor_entries) {
                const key = `${ae.day_of_week}_${ae.period_number}`;
                if (!seen_slots_set.has(key)) { seen_slots_set.add(key); anchor_slots.push([ae.day_of_week, ae.period_number]); }
            }
            for (const [day, period] of anchor_slots) {
                if (!slot_lookup[`${day}_${period}`]) continue;
                const slot_obj = slot_lookup[`${day}_${period}`];
                const already_there = filled_slots.has(`${day}_${period}`);
                const sec_num = already_there ? 2 : 1;
                const c_venue = assign_venue(day, period, c.course_code, false, count);
                db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, cname, fid, fname, stype, slot_obj.slot_id, day, period, c_venue, sec_num);
                filled_slots.add(`${day}_${period}`);
                count++;
            }
        } else {
            const DAY_GROUP_A_CC = ['Monday', 'Wednesday', 'Friday'];
            const DAY_GROUP_B_CC = ['Tuesday', 'Thursday', 'Saturday'];
            const cc_idx = honours_courses.indexOf(c);
            const group_days_cc = cc_idx % 2 === 0 ? DAY_GROUP_A_CC : DAY_GROUP_B_CC;
            let free_p8 = group_days_cc.filter(d => slot_lookup[`${d}_8`] && !filled_slots.has(`${d}_8`) && !(d === mentor_day_clean && mentor_period === 8)).map(d => [d, 8]);
            if (free_p8.length < needed) {
                const other = cc_idx % 2 === 0 ? DAY_GROUP_B_CC : DAY_GROUP_A_CC;
                free_p8 = free_p8.concat(other.filter(d => slot_lookup[`${d}_8`] && !filled_slots.has(`${d}_8`) && !(d === mentor_day_clean && mentor_period === 8)).map(d => [d, 8]));
            }
            for (const [day, period] of free_p8.slice(0, needed)) {
                const slot_obj = slot_lookup[`${day}_${period}`];
                const c_venue = assign_venue(day, period, c.course_code, false, count);
                db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, cname, fid, fname, stype, slot_obj.slot_id, day, period, c_venue);
                filled_slots.add(`${day}_${period}`);
                count++;
            }
        }
        common_placed_codes.add(c.course_code);
    }

    honours_courses = honours_courses.filter(c => !common_placed_codes.has(c.course_code));

    // =========================================================
    // 6. Honours/Minor in P8
    // =========================================================
    if (honours_courses.length > 0) {
        const actual_honours = honours_courses.filter(c => c.is_honours);
        const actual_minors = honours_courses.filter(c => c.is_minor && !c.is_honours);

        function sessions_needed(c) {
            return c.weekly_sessions || ((course_theory_count[c.course_code] || 3) + (course_lab_blocks[c.course_code] || 0) * 2);
        }

        function get_any_free_p8() {
            return all_days.filter(d => slot_lookup[`${d}_8`] && !filled_slots.has(`${d}_8`) && !(d === mentor_day_clean && mentor_period === 8)).map(d => [d, 8]);
        }

        function write_entry(day, period, course, stype, sec_num) {
            const slot_obj = slot_lookup[`${day}_${period}`];
            const fids = course_faculty[course.course_code] || [];
            const [fid_val, fname_val] = fids.length > 0 ? [fids[0][0], fids[0][1]] : [null, 'Unassigned'];
            const cname = course_names[course.course_code] || course.course_code;
            const c_venue = assign_venue(day, period, course.course_code, false, count);
            db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, course.course_code, cname, fid_val, fname_val, stype, slot_obj.slot_id, day, period, c_venue, sec_num);
            filled_slots.add(`${day}_${period}`);
            count++;
        }

        const available_p8 = get_any_free_p8();
        const hon_list = actual_honours.length > 0 ? actual_honours : honours_courses;
        const hon_day_groups = hon_list.map(() => []);
        const sessions_needed_list = hon_list.map(hc => sessions_needed(hc));

        let slot_idx = 0;
        while (slot_idx < available_p8.length) {
            let assigned_in_round = false;
            for (let hon_idx = 0; hon_idx < hon_list.length; hon_idx++) {
                if (slot_idx >= available_p8.length) break;
                if (hon_day_groups[hon_idx].length < sessions_needed_list[hon_idx]) {
                    hon_day_groups[hon_idx].push(available_p8[slot_idx]);
                    slot_idx++;
                    assigned_in_round = true;
                }
            }
            if (!assigned_in_round) break;
        }

        for (let hon_idx = 0; hon_idx < hon_list.length; hon_idx++) {
            for (const [day, period] of hon_day_groups[hon_idx]) {
                write_entry(day, period, hon_list[hon_idx], 'HONOURS', 1);
            }
        }

        for (let min_idx = 0; min_idx < actual_minors.length; min_idx++) {
            const mc = actual_minors[min_idx];
            const needed_val = sessions_needed(mc);
            const preferred_slots = min_idx < hon_day_groups.length ? hon_day_groups[min_idx] : [];
            const all_p8 = get_any_free_p8();
            const combined = [...preferred_slots];
            for (const s of all_p8) {
                if (!combined.some(c => c[0] === s[0] && c[1] === s[1])) combined.push(s);
            }
            for (const [day, period] of combined.slice(0, needed_val)) {
                const sec = (min_idx < hon_day_groups.length && hon_day_groups[min_idx].some(s => s[0] === day && s[1] === period)) ? 2 : 1;
                write_entry(day, period, mc, 'MINOR', sec);
            }
        }
    }

    
    // LOCKED SLOTS entries
    if (locked_slots && locked_slots.length > 0) {
        for (const ls of locked_slots) {
            const ls_day = ls.day.trim().charAt(0).toUpperCase() + ls.day.trim().slice(1).toLowerCase();
            const ls_period = ls.period;
            
            if (slot_lookup[`${ls_day}_${ls_period}`]) {
                const slot_obj = slot_lookup[`${ls_day}_${ls_period}`];
                db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, session_type, slot_id, day_of_week, period_number, created_at) VALUES (?, ?, ?, 'LOCKED', 'Locked Slot', 'LOCKED', ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, slot_obj.slot_id, ls_day, ls_period);
                filled_slots.add(`${ls_day}_${ls_period}`);
                count++;
            }
        }
    }

    // MENTOR entry
    if (slot_lookup[`${mentor_day_clean}_${mentor_period}`]) {
        const slot_obj = slot_lookup[`${mentor_day_clean}_${mentor_period}`];
        db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, session_type, slot_id, day_of_week, period_number, created_at) VALUES (?, ?, ?, 'MENTOR', 'Mentor Interaction', 'MENTOR', ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, slot_obj.slot_id, mentor_day_clean, mentor_period);
        filled_slots.add(`${mentor_day_clean}_${mentor_period}`);
        count++;
    }

    // =========================================================
    // 7. GAP FILL
    // =========================================================
    for (const [uuid, reserved] of Object.entries(user_interpreter.reservedSlots)) {
        for (const slot_info of reserved) {
            filled_slots.add(`${slot_info.day}_${slot_info.period}`);
        }
    }

    const empty_by_day = {};
    for (const day of all_days) {
        empty_by_day[day] = [];
        for (const p of (day_periods[day] || [])) {
            if (p === 8 && !use_p8_for_regular) continue;
            if (!filled_slots.has(`${day}_${p}`)) empty_by_day[day].push(p);
        }
    }

    let free_blocks_2 = [];
    let single_frees = [];
    for (const [day, periods] of Object.entries(empty_by_day)) {
        periods.sort((a, b) => a - b);
        let i = 0;
        while (i < periods.length) {
            if (i < periods.length - 1 && periods[i + 1] === periods[i] + 1) {
                const s1 = slot_lookup[`${day}_${periods[i]}`];
                const s2 = slot_lookup[`${day}_${periods[i + 1]}`];
                if (s1 && s2 && s1.end_time === s2.start_time) {
                    free_blocks_2.push([day, periods[i], periods[i + 1]]);
                    i += 2;
                    continue;
                }
            }
            single_frees.push([day, periods[i]]);
            i++;
        }
    }

    const mini_projects_fill = courses.filter(c => (c.course_name || '').toLowerCase().includes('mini project'));
    const core_courses = courses.filter(c => !c.is_elective && !c.is_honours && !c.is_minor && !mini_projects_fill.includes(c)).sort((a, b) => (b.credits || 0) - (a.credits || 0));
    const elective_courses = courses.filter(c => c.is_elective && !c.is_honours && !c.is_minor && !mini_projects_fill.includes(c)).sort((a, b) => (b.credits || 0) - (a.credits || 0));

    const daily_extra_counts = {};
    const weekly_extra_counts = {};
    for (const c of courses) {
        daily_extra_counts[c.course_code] = {};
        for (const d of all_days) daily_extra_counts[c.course_code][d] = 0;
        weekly_extra_counts[c.course_code] = 0;
    }

    // Mini projects
    for (const mp of mini_projects_fill) {
        while (free_blocks_2.length > 0 && weekly_extra_counts[mp.course_code] < c_mini_proj_max) {
            const [day, p1, p2] = free_blocks_2.shift();
            const gc_fac = get_lab_faculty(mp.course_code, course_faculty);
            for (let sec = 0; sec < get_course_sections(mp.course_code, true); sec++) {
                let fac_assigned = null;
                for (const [fid, fname, dtype] of gc_fac) {
                    if (is_faculty_free(fid, day, p1) && is_faculty_free(fid, day, p2)) { fac_assigned = [fid, fname]; break; }
                }
                if (!fac_assigned && gc_fac.length > 0) fac_assigned = [gc_fac[sec % gc_fac.length][0], gc_fac[sec % gc_fac.length][1]];
                else if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                for (const p of [p1, p2]) {
                    const slot_obj = slot_lookup[`${day}_${p}`];
                    const c_v = assign_venue(day, p, mp.course_code, true, count + sec);
                    if (slot_obj) {
                        db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'LAB', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, mp.course_code, mp.course_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_v, sec + 1);
                        filled_slots.add(`${day}_${p}`);
                        count++;
                    }
                }
                mark_faculty_busy(fac_assigned[0], day, p1);
                mark_faculty_busy(fac_assigned[0], day, p2);
            }
            weekly_extra_counts[mp.course_code]++;
            daily_extra_counts[mp.course_code][day]++;
        }
    }

    function fill_remaining_slots(target_courses) {
        if (!target_courses || target_courses.length === 0) return;
        let idx = 0;
        let consecutive_failures = 0;

        while (free_blocks_2.length > 0 && consecutive_failures < target_courses.length) {
            const c = target_courses[idx % target_courses.length];
            idx++;
            const [day, p1, p2] = free_blocks_2[0];
            const course_has_practicals = (c.practical_hours || 0) > 0 && !(batch_rotation_needed && core_lab_courses.some(lc => lc.course_code === c.course_code));

            if (course_has_practicals && (weekly_extra_counts[c.course_code] + 2) <= c_core_extra_week && (daily_extra_counts[c.course_code][day] + 2) <= c_core_extra_day) {
                free_blocks_2.shift();
                consecutive_failures = 0;
                const gc_fac = get_lab_faculty(c.course_code, course_faculty);
                for (let sec = 0; sec < get_course_sections(c.course_code, true); sec++) {
                    let fac_assigned = null;
                    for (const [fid, fname, dtype] of gc_fac) {
                        if (is_faculty_free(fid, day, p1) && is_faculty_free(fid, day, p2)) { fac_assigned = [fid, fname]; break; }
                    }
                    if (!fac_assigned && gc_fac.length > 0) fac_assigned = [gc_fac[sec % gc_fac.length][0], gc_fac[sec % gc_fac.length][1]];
                    else if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                    for (const p of [p1, p2]) {
                        const slot_obj = slot_lookup[`${day}_${p}`];
                        const c_v = assign_venue(day, p, c.course_code, true, count + sec);
                        if (slot_obj) {
                            db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'LAB', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, c.course_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_v, sec + 1);
                            filled_slots.add(`${day}_${p}`);
                            count++;
                        }
                    }
                    mark_faculty_busy(fac_assigned[0], day, p1);
                    mark_faculty_busy(fac_assigned[0], day, p2);
                }
                weekly_extra_counts[c.course_code]++;
                daily_extra_counts[c.course_code][day]++;
            } else {
                consecutive_failures++;
            }
        }

        while (free_blocks_2.length > 0) {
            const [day, p1, p2] = free_blocks_2.shift();
            single_frees.push([day, p1], [day, p2]);
        }

        idx = 0;
        consecutive_failures = 0;
        while (single_frees.length > 0 && consecutive_failures < target_courses.length) {
            const c = target_courses[idx % target_courses.length];
            idx++;
            const [day, p] = single_frees[0];

            if (weekly_extra_counts[c.course_code] < c_core_extra_week && daily_extra_counts[c.course_code][day] < c_core_extra_day) {
                single_frees.shift();
                consecutive_failures = 0;
                const gc_fac = get_theory_faculty(c.course_code, course_faculty);
                for (let sec = 0; sec < get_course_sections(c.course_code, false); sec++) {
                    let fac_assigned = null;
                    for (const [fid, fname, dtype] of gc_fac) {
                        if (is_faculty_free(fid, day, p)) { fac_assigned = [fid, fname]; break; }
                    }
                    if (!fac_assigned && gc_fac.length > 0) fac_assigned = [gc_fac[sec % gc_fac.length][0], gc_fac[sec % gc_fac.length][1]];
                    else if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                    const slot_obj = slot_lookup[`${day}_${p}`];
                    const c_venue = assign_venue(day, p, c.course_code, false, count + sec);
                    if (slot_obj) {
                        db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'THEORY', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, c.course_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_venue, sec + 1);
                        filled_slots.add(`${day}_${p}`);
                        count++;
                    }
                    mark_faculty_busy(fac_assigned[0], day, p);
                }
                weekly_extra_counts[c.course_code]++;
                daily_extra_counts[c.course_code][day]++;
            } else {
                consecutive_failures++;
            }
        }
    }

    fill_remaining_slots(core_courses);
    if (free_blocks_2.length > 0 || single_frees.length > 0) fill_remaining_slots(elective_courses);

    // =========================================================
    // 7.5 OPEN ELECTIVE INJECTION
    // =========================================================
    const global_oe = db.prepare("SELECT * FROM course_master WHERE semester = ? AND is_open_elective = 1 LIMIT 1").get(semester);
    if (semester === 5 && global_oe) {
        let oe_slots_needed = c_open_elective_p;
        while (free_blocks_2.length > 0) {
            const [day, p1, p2] = free_blocks_2.shift();
            single_frees.push([day, p1], [day, p2]);
        }
        while (oe_slots_needed > 0 && single_frees.length > 0) {
            const [day, p] = single_frees.shift();
            const c_venue = assign_venue(day, p, global_oe.course_code, false, count);
            const slot_obj = slot_lookup[`${day}_${p}`];
            if (slot_obj) {
                db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, created_at) VALUES (?, ?, ?, ?, ?, NULL, 'Unassigned', 'OPEN_ELECTIVE', ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, global_oe.course_code, global_oe.course_name, slot_obj.slot_id, day, p, c_venue);
                filled_slots.add(`${day}_${p}`);
                count++;
                oe_slots_needed--;
            }
        }
    }

    // Fallback fill
    if (free_blocks_2.length > 0 || single_frees.length > 0) {
        while (free_blocks_2.length > 0) {
            const [day, p1, p2] = free_blocks_2.shift();
            single_frees.push([day, p1], [day, p2]);
        }
        const fallback_courses = (core_courses.length > 0 ? core_courses : (elective_courses.length > 0 ? elective_courses : courses)).sort((a, b) => (b.credits || 0) - (a.credits || 0));
        if (fallback_courses.length > 0) {
            let idx = 0;
            for (const [day, p] of single_frees) {
                const c = fallback_courses[idx % fallback_courses.length];
                const gc_fac = get_theory_faculty(c.course_code, course_faculty);
                for (let sec = 0; sec < get_course_sections(c.course_code, false); sec++) {
                    let fac_assigned = null;
                    for (const [fid, fname, dtype] of gc_fac) {
                        if (is_faculty_free(fid, day, p)) { fac_assigned = [fid, fname]; break; }
                    }
                    if (!fac_assigned && gc_fac.length > 0) fac_assigned = [gc_fac[sec % gc_fac.length][0], gc_fac[sec % gc_fac.length][1]];
                    else if (!fac_assigned) fac_assigned = [null, 'Unassigned'];

                    const slot_obj = slot_lookup[`${day}_${p}`];
                    const c_venue = assign_venue(day, p, c.course_code, false, count + sec);
                    if (slot_obj) {
                        db.prepare(`INSERT INTO timetable_entries (department_code, semester, learning_mode_ids, course_code, course_name, faculty_id, faculty_name, session_type, slot_id, day_of_week, period_number, venue_name, section_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'THEORY', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`).run(department_code, semester, learning_mode_str, c.course_code, c.course_name, fac_assigned[0], fac_assigned[1], slot_obj.slot_id, day, p, c_venue, sec + 1);
                        filled_slots.add(`${day}_${p}`);
                        count++;
                    }
                    mark_faculty_busy(fac_assigned[0], day, p);
                }
                idx++;
            }
        }
    }

    // =========================================================
    // 8. OPEN ELECTIVE MERGING (SEM 6)
    // =========================================================
    if (semester === 6 && global_oe) {
        const dept_electives = courses.filter(c => c.is_elective);
        if (dept_electives.length > 0) {
            dept_electives.sort((a, b) => {
                const getNum = (c) => { const m = (c.course_category || '').match(/\d+/); return m ? parseInt(m[0]) : 0; };
                return getNum(b) - getNum(a);
            });
            const highest_elective = dept_electives[0];
            db.prepare("UPDATE timetable_entries SET course_name = course_name || ' / OPEN ELECTIVE' WHERE course_code = ? AND department_code = ? AND semester = ? AND course_name NOT LIKE '%OPEN ELECTIVE%'").run(highest_elective.course_code, department_code, semester);
        }
    }

    // USER-DEFINED CONSTRAINTS (post-solve)
    count = user_interpreter.applyPostSolve(department_code, semester, filled_slots, slot_lookup, assign_venue, count, all_days, day_periods);
    generation_warnings.push(...user_interpreter.warnings);

    if (hard_mode && generation_errors.length > 0) {
        return { success: false, errors: generation_errors, warnings: generation_warnings, entries_saved: 0 };
    }

    console.log(`ðŸ’¾ Saved ${count} timetable entries.`);
    return { success: true, errors: generation_errors, warnings: generation_warnings, entries_saved: count };
}

module.exports = { generate_schedule };

