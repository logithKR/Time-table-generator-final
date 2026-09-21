const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../database/college_scheduler.db');
const usersDbPath = path.resolve(__dirname, '../database/users.db');
const logDbPath = path.resolve(__dirname, '../database/log.db');

let dbPromise = open({ filename: dbPath, driver: sqlite3.Database });
let usersDbPromise = open({ filename: usersDbPath, driver: sqlite3.Database });
let logDbPromise = open({ filename: logDbPath, driver: sqlite3.Database });

// Setup pragmas
dbPromise.then(db => {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
});
usersDbPromise.then(db => db.exec('PRAGMA journal_mode = WAL'));
logDbPromise.then(db => db.exec('PRAGMA journal_mode = WAL'));

module.exports = {
    getDb: () => dbPromise,
    getUsersDb: () => usersDbPromise,
    getLogDb: () => logDbPromise
};
