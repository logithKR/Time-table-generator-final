const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { usersDb } = require('../database');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'dummy';
const JWT_SECRET = process.env.JWT_SECRET || 'dummy_secret_for_dev_32_chars_long!';

// --- Auth Logging Helper ---
function logAuthEvent(req, action, email = null, status = 200, method = 'POST') {
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
        
        logDb.prepare("INSERT INTO auth_logs (email, event_type, timestamp_ist, timestamp_gmt, user_id) VALUES (?, ?, ?, ?, ?)").run(
            email || 'Unknown', action, timestamp_ist, timestamp_gmt, email || 'Unknown'
        );
    } catch (e) { console.error("Auth logging error", e); }
}

const ALGORITHM = 'HS256';
const ACCESS_TOKEN_EXPIRE_MINUTES = parseInt(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '30');
const REFRESH_TOKEN_EXPIRE_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRE_DAYS || '7');

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

function setAuthCookies(res, accessToken, refreshToken) {
    res.cookie('access_token', accessToken, {
        httpOnly: true,
        maxAge: ACCESS_TOKEN_EXPIRE_MINUTES * 60 * 1000,
        path: '/'
    });
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        maxAge: REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60 * 1000,
        path: '/'
    });
}

function clearAuthCookies(res) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
}

router.post('/login', async (req, res) => {
    try {
        const { credential } = req.body;
        // Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const email = payload.email;

        if (!email.endsWith('@bitsathy.ac.in') && !email.endsWith('@gmail.com')) {
            return res.status(401).json({ detail: "Domain not allowed" });
        }

        const userRecord = usersDb.prepare("SELECT role, is_active FROM users WHERE email = ?").get(email);
        if (!userRecord || userRecord.role !== 'teacher') {
            return res.status(403).json({ detail: "Access Denied: Only registered faculty (teachers) can access this system." });
        }

        const userData = { email, name: payload.name, picture: payload.picture };
        const accessToken = jwt.sign({ ...userData, type: 'access' }, JWT_SECRET, { expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m` });
        const refreshToken = jwt.sign({ ...userData, type: 'refresh' }, JWT_SECRET, { expiresIn: `${REFRESH_TOKEN_EXPIRE_DAYS}d` });

        setAuthCookies(res, accessToken, refreshToken);
        logAuthEvent(req, 'LOGIN_SUCCESS', email, 200);
        res.json({ message: "Login successful", user: userData, access_token: accessToken });
    } catch (e) {
        console.error("Google Auth Error:", e); logAuthEvent(req, 'LOGIN_FAILED: ' + (e.message || "Invalid Token"), req.body.email || 'Unknown', 401);
        res.status(401).json({ detail: e.message || "Invalid Google token" });
    }
});

router.post('/refresh', (req, res) => {
    // Basic cookie parsing
    const cookies = req.headers.cookie;
    let refreshTokenValue = null;
    if (cookies) {
        const match = cookies.match(/refresh_token=([^;]+)/);
        if (match) refreshTokenValue = match[1];
    }

    if (!refreshTokenValue) return res.status(401).json({ detail: "Refresh token missing" });

    try {
        const payload = jwt.verify(refreshTokenValue, JWT_SECRET);
        if (payload.type !== 'refresh') return res.status(401).json({ detail: "Invalid token type" });

        const userData = { email: payload.email, name: payload.name, picture: payload.picture };
        const newAccess = jwt.sign({ ...userData, type: 'access' }, JWT_SECRET, { expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m` });
        const newRefresh = jwt.sign({ ...userData, type: 'refresh' }, JWT_SECRET, { expiresIn: `${REFRESH_TOKEN_EXPIRE_DAYS}d` });

        setAuthCookies(res, newAccess, newRefresh);
        res.json({ message: "Token refreshed successfully", access_token: newAccess });
    } catch (e) {
        res.status(401).json({ detail: "Invalid refresh token" });
    }
});

router.post('/logout', (req, res) => {
    // Extract email before clearing
        let email = 'Unknown';
        try {
            if (req.cookies && req.cookies.access_token) {
                const decoded = jwt.verify(req.cookies.access_token, JWT_SECRET);
                if (decoded && decoded.email) email = decoded.email;
            }
        } catch(e) {}
        logAuthEvent(req, 'LOGOUT', email, 200);
        clearAuthCookies(res);
    res.json({ message: "Successfully logged out" });
});

router.get('/me', (req, res) => {
    const cookies = req.headers.cookie;
    let accessTokenValue = null;
    if (cookies) {
        const match = cookies.match(/access_token=([^;]+)/);
        if (match) accessTokenValue = match[1];
    }
    
    if (!accessTokenValue) return res.status(401).json({ detail: "Not authenticated" });

    try {
        const payload = jwt.verify(accessTokenValue, JWT_SECRET);
        res.json({ user: { email: payload.email, name: payload.name, picture: payload.picture } });
    } catch (e) {
        res.status(401).json({ detail: "Invalid access token" });
    }
});

module.exports = router;
