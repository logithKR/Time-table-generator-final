const express = require('express');
const router = express.Router();

// --- Admin Logging Helper ---
function logAdminEvent(action, dept, sem) {
    try {
        const { logDb } = require('../database');
        if (!logDb) return;
        const now = new Date();
        const yy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        let hh = now.getHours();
        const m = String(now.getMinutes()).padStart(2, '0');
        const ampm = hh >= 12 ? 'PM' : 'AM';
        hh = hh % 12;
        hh = hh ? hh : 12;
        const timestamp_ist = `${yy}-${mm}-${dd} ${String(hh).padStart(2, '0')}:${m} ${ampm}`;
        const timestamp_gmt = now.toUTCString();
        
        logDb.prepare("INSERT INTO activity_logs (action, method, status_code, timestamp_ist, timestamp_gmt, department_code, semester, email, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
            action, 'POST', 200, timestamp_ist, timestamp_gmt, dept || null, sem || null, 'admin', 'admin'
        );
    } catch (e) { console.error("Admin logging error", e); }
}

const jwt = require('jsonwebtoken');
const { db, logDb } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'dummy_secret_for_dev_32_chars_long!';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Simple admin login using password
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ detail: "Invalid admin password" });
    }

    const accessToken = jwt.sign({ role: 'admin', type: 'access' }, JWT_SECRET, { expiresIn: '1d' });
    res.cookie('admin_token', accessToken, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000, path: '/' });
    res.json({ message: "Admin login successful", access_token: accessToken });
});

router.post('/logout', (req, res) => {
    res.clearCookie('admin_token');
    res.json({ message: "Admin logged out" });
});

router.get('/me', (req, res) => {
    const cookies = req.headers.cookie;
    let adminToken = null;
    if (cookies) {
        const match = cookies.match(/admin_token=([^;]+)/);
        if (match) adminToken = match[1];
    }
    
    if (!adminToken) return res.status(401).json({ detail: "Not authenticated as admin" });

    try {
        const payload = jwt.verify(adminToken, JWT_SECRET);
        if (payload.role !== 'admin') throw new Error("Invalid role");
        res.json({ user: { role: 'admin' } });
    } catch (e) {
        res.status(401).json({ detail: "Invalid admin token" });
    }
});

router.get('/logs', (req, res) => {
    try {
        const { type = 'auth', page = 1, limit = 50, date } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        
        let tableName = type === 'auth' ? 'auth_logs' : 'activity_logs';
        let query = "SELECT * FROM " + tableName;
        let countQuery = "SELECT COUNT(*) as total FROM " + tableName;
        let params = [];
        
        if (date) {
            query += " WHERE timestamp_ist LIKE ?";
            countQuery += " WHERE timestamp_ist LIKE ?";
            params.push(date + '%');
        }
        
        query += " ORDER BY id DESC LIMIT ? OFFSET ?";
        params.push(limitNum, offset);
        
        const logs = logDb.prepare(query).all(params);
        const totalResult = logDb.prepare(countQuery).get(date ? [date + '%'] : []);
        const total = totalResult ? totalResult.total : 0;
        
        res.json({ 
            data: logs, 
            total, 
            total_pages: Math.ceil(total / limitNum) 
        });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.get('/timetables/', (req, res) => {
    try {
        const statuses = db.prepare("SELECT department_code, semester, is_finalized, finalized_by, finalized_at FROM timetable_status").all();
        res.json({ data: statuses });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});


router.get('/timetables/download-all', async (req, res) => {
    try {
        const statuses = db.prepare("SELECT department_code, semester FROM timetable_status").all();
        if (!statuses || statuses.length === 0) {
            return res.status(404).json({ detail: "No timetables found." });
        }
        
        const { generateTimetableExcelBytes } = require('../utils/excel_export');
        const ExcelJS = require('exceljs');
        const masterWb = new ExcelJS.Workbook();
        
        for (const status of statuses) {
            const { department_code, semester } = status;
            try {
                // Generate individual formatted workbook
                const buffer = await generateTimetableExcelBytes(db, department_code, semester);
                const tempWb = new ExcelJS.Workbook();
                await tempWb.xlsx.load(buffer);
                
                // Copy the first worksheet into the master workbook
                const srcWs = tempWb.worksheets[0];
                let sheetName = department_code + "_S" + semester;
                if (sheetName.length > 31) sheetName = sheetName.substring(0, 31);
                
                const destWs = masterWb.addWorksheet(sheetName);
                
                // Copy rows, columns, and styles
                srcWs.eachRow({ includeEmpty: true }, (row, rowNum) => {
                    const destRow = destWs.getRow(rowNum);
                    destRow.height = row.height;
                    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                        const destCell = destRow.getCell(colNum);
                        destCell.value = cell.value;
                        destCell.style = cell.style;
                    });
                });
                
                // Copy column widths
                srcWs.columns.forEach((col, idx) => {
                    if (col.width) {
                        destWs.getColumn(idx + 1).width = col.width;
                    }
                });
            } catch(e) {
                console.error("Error generating excel for " + department_code + " " + semester + ":", e.message);
            }
        }
        
        const buffer = await masterWb.xlsx.writeBuffer();
        
        res.setHeader('Content-Disposition', 'attachment; filename="all_timetables.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(Buffer.from(buffer));
    } catch(e) {
        console.error(e);
        res.status(500).json({ detail: "Excel download failed: " + e.message });
    }
});

router.get('/sync/status', (req, res) => {
    res.json({ status: 'complete', logs: [] });
});


// Missing finalize/unfinalize endpoints
router.post('/timetables/:department_code/:semester/finalize', (req, res) => {
    try {
        const { department_code, semester } = req.params;
        const now = new Date().toISOString();
        db.prepare("UPDATE timetable_status SET is_finalized = 1, finalized_by = 'admin', finalized_at = ? WHERE department_code = ? AND semester = ?").run(now, department_code, semester);
        logAdminEvent("Finalized timetable for " + department_code + " Sem " + semester, department_code, semester);
        res.json({ message: "Timetable finalized successfully" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.post('/timetables/:department_code/:semester/unfinalize', (req, res) => {
    try {
        const { department_code, semester } = req.params;
        db.prepare("UPDATE timetable_status SET is_finalized = 0, finalized_by = NULL, finalized_at = NULL WHERE department_code = ? AND semester = ?").run(department_code, semester);
        logAdminEvent("Unfinalized timetable for " + department_code + " Sem " + semester, department_code, semester);
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


// Missing DELETE routes
router.delete('/timetables/:department_code/:semester', (req, res) => {
    try {
        const { department_code, semester } = req.params;
        
        // Check if finalized
        const status = db.prepare("SELECT is_finalized FROM timetable_status WHERE department_code = ? AND semester = ?").get(department_code, semester);
        if (status && status.is_finalized) {
            return res.status(400).json({ detail: "Cannot delete a finalized timetable. Unfinalize it first." });
        }
        
        db.prepare("DELETE FROM timetable_entries WHERE department_code = ? AND semester = ?").run(department_code, semester);
        db.prepare("DELETE FROM timetable_status WHERE department_code = ? AND semester = ?").run(department_code, semester);
        
        logAdminEvent("Deleted draft timetable for " + department_code + " Sem " + semester, department_code, semester);
        res.json({ message: "Timetable deleted successfully" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/timetables/all', (req, res) => {
    try {
        // Delete all entries where is_finalized is 0 or null
        const unfinalized = db.prepare("SELECT department_code, semester FROM timetable_status WHERE is_finalized = 0 OR is_finalized IS NULL").all();
        
        for (const tt of unfinalized) {
            db.prepare("DELETE FROM timetable_entries WHERE department_code = ? AND semester = ?").run(tt.department_code, tt.semester);
            db.prepare("DELETE FROM timetable_status WHERE department_code = ? AND semester = ?").run(tt.department_code, tt.semester);
        }
        
        logAdminEvent("Deleted all unlocked draft timetables", null, null);
        res.json({ message: "All draft timetables deleted successfully" });
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

module.exports = router;
