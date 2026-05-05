import sqlite3 from 'sqlite3';
const { verbose } = sqlite3;
const sqlite = verbose();
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/dashboard.db');

let db;

function initDB() {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new sqlite.Database(dbPath);

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS ip_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        name TEXT,
        description TEXT,
        watch_interval INTEGER DEFAULT 60,
        is_watching BOOLEAN DEFAULT 0,
        last_status TEXT,
        last_check TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ping_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_id INTEGER,
        status TEXT,
        response_time INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ip_id) REFERENCES ip_addresses (id)
      )
    `);
  });

  console.log('Database initialized at', dbPath);
  return db;
}

function getDB() {
  if (!db) {
    return initDB();
  }
  return db;
}

export { initDB, getDB };
