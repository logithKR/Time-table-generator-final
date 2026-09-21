const express = require('express');
const { db } = require('../database');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

router.get('/health', (req, res) => {
    res.json({ status: "ok" });
});

// ============================================
// SEMESTER CONFIG
// ============================================
router.get('/semester-config', (req, res) => {
    try {
        const configs = db.prepare("SELECT * FROM semester_config").all();
        res.json(configs);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/semester-config/:semester', (req, res) => {
    try {
        const { semester } = req.params;
        const { academic_year } = req.body;
        const existing = db.prepare("SELECT * FROM semester_config WHERE semester = ?").get(semester);
        if (existing) {
            db.prepare("UPDATE semester_config SET academic_year = ? WHERE semester = ?").run(academic_year, semester);
        } else {
            db.prepare("INSERT INTO semester_config (semester, academic_year) VALUES (?, ?)").run(semester, academic_year);
        }
        const updated = db.prepare("SELECT * FROM semester_config WHERE semester = ?").get(semester);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

// ============================================
// DEPARTMENTS
// ============================================
router.get('/departments', (req, res) => {
    try {
        const depts = db.prepare("SELECT * FROM department_master").all();
        res.json(depts);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/departments', (req, res) => {
    try {
        const { department_code, student_count, pair_add_course_miniproject } = req.body;
        const existing = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(department_code);
        if (existing) return res.status(400).json({ detail: `Department ${department_code} already exists` });
        
        db.prepare("INSERT INTO department_master (department_code, student_count, pair_add_course_miniproject) VALUES (?, ?, ?)")
          .run(department_code, student_count || 0, pair_add_course_miniproject ? 1 : 0);
        res.json({ status: "success", department_code });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.put('/departments/:code', (req, res) => {
    try {
        const { code } = req.params;
        const { student_count, pair_add_course_miniproject } = req.body;
        const existing = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(code);
        if (!existing) return res.status(404).json({ detail: "Department not found" });

        if (student_count !== undefined) {
            db.prepare("UPDATE department_master SET student_count = ? WHERE department_code = ?").run(student_count, code);
        }
        if (pair_add_course_miniproject !== undefined) {
            db.prepare("UPDATE department_master SET pair_add_course_miniproject = ? WHERE department_code = ?").run(pair_add_course_miniproject ? 1 : 0, code);
        }
        const updated = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(code);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/departments/:code', (req, res) => {
    try {
        const { code } = req.params;
        const existing = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(code);
        if (!existing) return res.status(404).json({ detail: "Department not found" });

        const facCount = db.prepare("SELECT COUNT(*) as c FROM faculty_master WHERE department_code = ?").get(code).c;
        const courseCount = db.prepare("SELECT COUNT(*) as c FROM course_master WHERE department_code = ?").get(code).c;

        if (facCount > 0 || courseCount > 0) {
            return res.status(400).json({ detail: `Cannot delete: ${facCount} faculty and ${courseCount} courses still linked.` });
        }
        db.prepare("DELETE FROM department_master WHERE department_code = ?").run(code);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.get('/departments/:code/capacities', (req, res) => {
    try {
        const { code } = req.params;
        const existing = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(code);
        if (!existing) return res.status(404).json({ detail: "Department not found" });

        const capacities = db.prepare("SELECT * FROM department_semester_count WHERE department_code = ? ORDER BY semester").all();
        res.json(capacities);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/departments/:code/capacities', (req, res) => {
    try {
        const { code } = req.params;
        const { semester } = req.query;
        const { student_count } = req.body;
        if (!semester) return res.status(400).json({ detail: "Missing semester query param" });

        const existing = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(code);
        if (!existing) return res.status(404).json({ detail: "Department not found" });

        const record = db.prepare("SELECT * FROM department_semester_count WHERE department_code = ? AND semester = ?").get(code, semester);
        if (record) {
            db.prepare("UPDATE department_semester_count SET student_count = ? WHERE department_code = ? AND semester = ?").run(student_count, code, semester);
        } else {
            db.prepare("INSERT INTO department_semester_count (department_code, semester, student_count) VALUES (?, ?, ?)").run(code, semester, student_count);
        }
        const updated = db.prepare("SELECT * FROM department_semester_count WHERE department_code = ? AND semester = ?").get(code, semester);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.get('/semesters', (req, res) => {
    const sems = [];
    for (let i = 1; i <= 8; i++) sems.push({ semester_number: i });
    res.json(sems);
});

// ============================================
// FACULTY
// ============================================
router.get('/faculty', (req, res) => {
    try {
        const { department_code } = req.query;
        let query = "SELECT * FROM faculty_master";
        const params = [];
        if (department_code) {
            query += " WHERE department_code = ?";
            params.push(department_code);
        }
        res.json(db.prepare(query).all(...params));
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/faculty', (req, res) => {
    try {
        const { faculty_id, faculty_name, faculty_email, department_code, status } = req.body;
        const existing = db.prepare("SELECT * FROM faculty_master WHERE faculty_id = ?").get(faculty_id);
        if (existing) return res.status(400).json({ detail: `Faculty ${faculty_id} already exists` });
        
        const dept = db.prepare("SELECT * FROM department_master WHERE department_code = ?").get(department_code);
        if (!dept) return res.status(400).json({ detail: `Department ${department_code} does not exist` });

        db.prepare("INSERT INTO faculty_master (faculty_id, faculty_name, faculty_email, department_code, status) VALUES (?, ?, ?, ?, ?)").run(
            faculty_id, faculty_name, faculty_email, department_code, status || 'ACTIVE'
        );
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.put('/faculty/:fid', (req, res) => {
    try {
        const { fid } = req.params;
        const { faculty_name, faculty_email, department_code, status } = req.body;
        const existing = db.prepare("SELECT * FROM faculty_master WHERE faculty_id = ?").get(fid);
        if (!existing) return res.status(404).json({ detail: "Faculty not found" });

        db.prepare("UPDATE faculty_master SET faculty_name = ?, faculty_email = ?, department_code = ?, status = ? WHERE faculty_id = ?").run(
            faculty_name, faculty_email, department_code, status, fid
        );
        res.json(db.prepare("SELECT * FROM faculty_master WHERE faculty_id = ?").get(fid));
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/faculty/:fid', (req, res) => {
    try {
        const { fid } = req.params;
        const existing = db.prepare("SELECT * FROM faculty_master WHERE faculty_id = ?").get(fid);
        if (!existing) return res.status(404).json({ detail: "Faculty not found" });

        const count = db.prepare("SELECT COUNT(*) as c FROM course_faculty_map WHERE faculty_id = ?").get(fid).c;
        if (count > 0) return res.status(400).json({ detail: "Cannot delete faculty, they are mapped to courses." });

        db.prepare("DELETE FROM faculty_master WHERE faculty_id = ?").run(fid);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});
// ============================================
// COURSE FACULTY MAP
// ============================================
router.get('/course-faculty', (req, res) => {
    try {
        const { department_code } = req.query;
        let query = "SELECT * FROM course_faculty_map";
        const params = [];
        if (department_code) {
            query += " WHERE department_code = ?";
            params.push(department_code);
        }
        res.json(db.prepare(query).all(...params));
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/course-faculty', (req, res) => {
    try {
        const { course_code, faculty_id, department_code, delivery_type } = req.body;
        db.prepare("INSERT INTO course_faculty_map (course_code, faculty_id, department_code, delivery_type) VALUES (?, ?, ?, ?)").run(
            course_code, faculty_id, department_code, delivery_type || 'THEORY'
        );
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/course-faculty/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM course_faculty_map WHERE id = ?").run(req.params.id);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

// ============================================
// COURSES
// ============================================
router.get('/courses', (req, res) => {
    try {
        const { department_code, semester } = req.query;
        let query = "SELECT * FROM course_master WHERE 1=1";
        const params = [];
        if (department_code) { query += " AND department_code = ?"; params.push(department_code); }
        if (semester) { query += " AND semester = ?"; params.push(semester); }
        res.json(db.prepare(query).all(...params));
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/courses', (req, res) => {
    try {
        const d = req.body;
        const existing = db.prepare("SELECT * FROM course_master WHERE course_code = ? AND department_code = ? AND semester = ?").get(
            d.course_code, d.department_code, d.semester
        );
        if (existing) return res.status(400).json({ detail: `Course ${d.course_code} already exists for this dept/sem` });

        db.prepare(`
            INSERT INTO course_master (
                course_code, department_code, semester, course_name, course_category, delivery_type,
                lecture_hours, tutorial_hours, practical_hours, weekly_sessions, credits,
                is_lab, is_elective, is_open_elective, is_honours, is_minor, is_add_course, enrolled_students
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            d.course_code, d.department_code, d.semester, d.course_name, d.course_category, d.delivery_type,
            d.lecture_hours || 0, d.tutorial_hours || 0, d.practical_hours || 0, d.weekly_sessions, d.credits || 0,
            d.is_lab ? 1 : 0, d.is_elective ? 1 : 0, d.is_open_elective ? 1 : 0, d.is_honours ? 1 : 0,
            d.is_minor ? 1 : 0, d.is_add_course ? 1 : 0, d.enrolled_students || 0
        );
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.put('/courses/:code', (req, res) => {
    try {
        const { code } = req.params;
        const d = req.body;
        // Simplified update for brevity, update matching course in SQLite
        db.prepare(`
            UPDATE course_master SET
                course_name = ?, course_category = ?, delivery_type = ?,
                lecture_hours = ?, tutorial_hours = ?, practical_hours = ?,
                weekly_sessions = ?, credits = ?, is_lab = ?, is_elective = ?,
                is_open_elective = ?, is_honours = ?, is_minor = ?, is_add_course = ?, enrolled_students = ?
            WHERE course_code = ? AND department_code = ? AND semester = ?
        `).run(
            d.course_name, d.course_category, d.delivery_type,
            d.lecture_hours, d.tutorial_hours, d.practical_hours,
            d.weekly_sessions, d.credits,
            d.is_lab ? 1 : 0, d.is_elective ? 1 : 0,
            d.is_open_elective ? 1 : 0, d.is_honours ? 1 : 0, d.is_minor ? 1 : 0, d.is_add_course ? 1 : 0, d.enrolled_students,
            code, d.department_code, d.semester
        );
        res.json({ status: "updated" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/courses/:code', (req, res) => {
    try {
        const { code } = req.params;
        db.prepare("DELETE FROM course_master WHERE course_code = ?").run(code);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

// ============================================
// SLOTS
// ============================================
router.get('/slots', (req, res) => {
    try {
        res.json(db.prepare("SELECT * FROM slot_master").all());
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/slots', (req, res) => {
    try {
        const { day_of_week, period_number, start_time, end_time, slot_type, is_active, semester_ids } = req.body;
        db.prepare("INSERT INTO slot_master (day_of_week, period_number, start_time, end_time, slot_type, is_active, semester_ids) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
            day_of_week, period_number, start_time, end_time, slot_type || 'REGULAR', is_active !== false ? 1 : 0, semester_ids || "[]"
        );
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.put('/slots/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { day_of_week, period_number, start_time, end_time, slot_type, is_active, semester_ids } = req.body;
        db.prepare("UPDATE slot_master SET day_of_week=?, period_number=?, start_time=?, end_time=?, slot_type=?, is_active=?, semester_ids=? WHERE slot_id=?").run(
            day_of_week, period_number, start_time, end_time, slot_type, is_active ? 1 : 0, semester_ids, id
        );
        res.json({ status: "updated" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/slots/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM slot_master WHERE slot_id = ?").run(req.params.id);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

// ============================================
// BREAKS
// ============================================
router.get('/breaks', (req, res) => {
    try {
        res.json(db.prepare("SELECT * FROM break_config_master").all());
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/breaks', (req, res) => {
    try {
        const { break_type, start_time, end_time, semester_ids } = req.body;
        db.prepare("INSERT INTO break_config_master (break_type, start_time, end_time, semester_ids) VALUES (?, ?, ?, ?)").run(
            break_type, start_time, end_time, semester_ids || "[]"
        );
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.put('/breaks/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { break_type, start_time, end_time, semester_ids } = req.body;
        db.prepare("UPDATE break_config_master SET break_type=?, start_time=?, end_time=?, semester_ids=? WHERE id=?").run(
            break_type, start_time, end_time, semester_ids, id
        );
        res.json({ status: "updated" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/breaks/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM break_config_master WHERE id = ?").run(req.params.id);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});
// ============================================
// USER CONSTRAINTS
// ============================================
router.get('/user-constraints', (req, res) => {
    try {
        const { department_code, semester } = req.query;
        let query = "SELECT * FROM user_constraints WHERE 1=1";
        const params = [];
        if (department_code) { query += " AND department_code = ?"; params.push(department_code); }
        if (semester) { query += " AND semester = ?"; params.push(semester); }
        res.json(db.prepare(query).all(...params));
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/user-constraints', (req, res) => {
    try {
        const { department_code, semester, constraint_type, course_code, faculty_id, day_of_week, period_number, priority, is_active, notes } = req.body;
        db.prepare(`
            INSERT INTO user_constraints (department_code, semester, constraint_type, course_code, faculty_id, day_of_week, period_number, priority, is_active, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(department_code, semester, constraint_type, course_code, faculty_id, day_of_week, period_number, priority || 'MEDIUM', is_active !== false ? 1 : 0, notes);
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/user-constraints/:id', (req, res) => {
    try {
        db.prepare("DELETE FROM user_constraints WHERE id = ?").run(req.params.id);
        res.json({ status: "deleted" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

// ============================================
// TIMETABLE GENERATION & FETCHING
// ============================================

router.post('/generate', (req, res) => {
    try {
        const payload = JSON.stringify(req.body);
        
        // Spawn the python solver wrapper
        // Note: Working directory should be properly resolved in actual environment
        const pythonProcess = spawn('python', [path.resolve(__dirname, '../../python_solver/run_solver.py')]);
        
        let dataString = '';
        let errString = '';

        pythonProcess.stdin.write(payload);
        pythonProcess.stdin.end();

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errString += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error("Python Solver Error:", errString);
                return res.status(500).json({ success: false, errors: [{ message: errString || 'Python process failed' }] });
            }
            try {
                const result = JSON.parse(dataString);
                res.json(result);
            } catch (e) {
                console.error("Failed to parse Python output:", dataString);
                res.status(500).json({ success: false, errors: [{ message: 'Invalid JSON from solver', details: dataString }] });
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, errors: [{ message: e.message }] });
    }
});

router.get('/timetable', (req, res) => {
    try {
        const { department_code, semester } = req.query;
        if (!department_code || !semester) {
            return res.status(400).json({ detail: "Missing department_code or semester" });
        }
        
        // Return latest saved timetable from JSON dump in timetable_data table
        const record = db.prepare("SELECT * FROM timetable_data WHERE department_code = ? AND semester = ? ORDER BY id DESC LIMIT 1").get(department_code, semester);
        if (record && record.timetable_json) {
            res.json(JSON.parse(record.timetable_json));
        } else {
            res.json({});
        }
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.get('/timetable/entries', (req, res) => {
    try {
        const { department_code, semester } = req.query;
        let query = "SELECT * FROM timetable_entries WHERE 1=1";
        const params = [];
        if (department_code) { query += " AND department_code = ?"; params.push(department_code); }
        if (semester) { query += " AND semester = ?"; params.push(semester); }
        res.json(db.prepare(query).all(...params));
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/timetable/save', (req, res) => {
    try {
        const { department_code, semester, timetable_data, learning_modes } = req.body;
        db.prepare("INSERT INTO timetable_data (department_code, semester, timetable_json, learning_modes, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(
            department_code, semester, JSON.stringify(timetable_data), learning_modes || "1,2"
        );
        res.json({ status: "success" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.get('/timetable/conflicts', (req, res) => {
    // Basic stub - in python it calculated real-time overlaps. We'll return empty for now, or you can implement the SQL query.
    res.json([]);
});

router.get('/timetable/export-excel', (req, res) => {
    res.status(501).json({ detail: "Excel export not fully ported yet. Available in Python." });
});

module.exports = router;
