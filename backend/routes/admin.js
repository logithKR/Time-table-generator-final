const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { logDb } = require('../database');

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
        const logs = logDb.prepare("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100").all();
        res.json(logs);
    } catch (e) {
        res.status(500).json({ detail: e.message });
    }
});

module.exports = router;
