const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../database/college_scheduler.db');
const usersDbPath = path.resolve(__dirname, '../database/users.db');
const logDbPath = path.resolve(__dirname, '../database/log.db');

const db = new Database(dbPath);
const usersDb = new Database(usersDbPath);
const logDb = new Database(logDbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

usersDb.pragma('journal_mode = WAL');
logDb.pragma('journal_mode = WAL');

module.exports = {
    db,
    usersDb,
    logDb
};
