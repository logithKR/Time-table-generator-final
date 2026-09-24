const express = require('express');
const router = express.Router();
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

router.get('/sync/status', (req, res) => {
    res.json({ status: 'complete', logs: [] });
});

module.exports = router;
