const fs = require('fs');
const adminPath = 'E:/time-table/Time-table-generator - Copy/backend/routes/admin.js';
let admin = fs.readFileSync(adminPath, 'utf8');

const missingRoutes = `
// Missing finalize/unfinalize endpoints
router.put('/timetables/:department_code/:semester/finalize', (req, res) => {
    try {
        const { department_code, semester } = req.params;
        const now = new Date().toISOString();
        db.prepare("UPDATE timetable_status SET is_finalized = 1, finalized_by = 'admin', finalized_at = ? WHERE department_code = ? AND semester = ?").run(now, department_code, semester);
        res.json({ message: "Timetable finalized successfully" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.put('/timetables/:department_code/:semester/unfinalize', (req, res) => {
    try {
        const { department_code, semester } = req.params;
        db.prepare("UPDATE timetable_status SET is_finalized = 0, finalized_by = NULL, finalized_at = NULL WHERE department_code = ? AND semester = ?").run(department_code, semester);
        res.json({ message: "Timetable unfinalized successfully" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

// Missing activity & summary endpoints
router.get('/logs/activity', (req, res) => {
    try {
        const { department_code, semester, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const logs = logDb.prepare("SELECT * FROM activity_logs WHERE department_code = ? AND semester = ? ORDER BY id DESC LIMIT ? OFFSET ?").all(department_code, semester, parseInt(limit), offset);
        const total = logDb.prepare("SELECT COUNT(*) as count FROM activity_logs WHERE department_code = ? AND semester = ?").get(department_code, semester).count;
        
        res.json({ data: logs, total });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.get('/logs/timetable-summary', (req, res) => {
    try {
        const { department_code, semester } = req.query;
        
        const gens = logDb.prepare("SELECT COUNT(*) as count FROM activity_logs WHERE department_code = ? AND semester = ? AND action LIKE '%Generate%'").get(department_code, semester).count;
        const edits = logDb.prepare("SELECT COUNT(*) as count FROM activity_logs WHERE department_code = ? AND semester = ? AND action LIKE '%Edit%'").get(department_code, semester).count;
        
        const lastEdit = logDb.prepare("SELECT email FROM activity_logs WHERE department_code = ? AND semester = ? AND action LIKE '%Edit%' ORDER BY id DESC LIMIT 1").get(department_code, semester);
        
        res.json({
            total_generations: gens || 0,
            total_edits: edits || 0,
            last_edited_by: lastEdit ? lastEdit.email : null
        });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});
`;

if (!admin.includes('/timetables/:department_code/:semester/finalize')) {
    admin = admin.replace('module.exports = router;', missingRoutes + '\nmodule.exports = router;');
    fs.writeFileSync(adminPath, admin, 'utf8');
    console.log('SUCCESS: Missing admin routes injected.');
} else {
    console.log('Routes already exist.');
}
