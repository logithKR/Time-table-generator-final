const db = require('better-sqlite3')('../database/log.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='activity_logs'").get().sql);
