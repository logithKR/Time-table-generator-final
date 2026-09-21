require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const legacyRoutes = require('./routes/legacy');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Setup Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', legacyRoutes); // All the legacy data routes (departments, faculty, etc.)

app.get('/', (req, res) => {
    res.json({ message: "BIT Timetable Generator Node.js API is running." });
});

app.get('/health', (req, res) => {
    res.json({ status: "ok" });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ detail: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
