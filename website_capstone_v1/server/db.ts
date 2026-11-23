import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'medalert_db';

let pool: mysql.Pool | null = null;
let isConnected = false;

export async function initDatabaseConnection(): Promise<boolean> {
  try {
    // 1. Create a temporary connection to verify MySQL is running & create DB if missing
    const rootConn = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    });

    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConn.end();

    // 2. Initialize connection pool to the database
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    // 3. Ensure all tables exist
    await runTableMigrations();
    isConnected = true;
    console.log(`[MySQL] Connected successfully to XAMPP MySQL database "${DB_NAME}" at ${DB_HOST}:${DB_PORT}`);
    return true;
  } catch (err: any) {
    isConnected = false;
    console.warn(`[MySQL Warning] Could not connect to XAMPP MySQL at ${DB_HOST}:${DB_PORT} (${err.message}).`);
    console.warn('[MySQL Warning] Ensure MySQL is started in XAMPP Control Panel. Server will remain running and retry on incoming requests.');
    return false;
  }
}

async function runTableMigrations(): Promise<void> {
  if (!pool) return;

  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('patient', 'doctor') NOT NULL DEFAULT 'patient',
      created_at DATETIME NOT NULL,
      last_login DATETIME NOT NULL,
      profile_complete TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS user_profiles (
      user_id VARCHAR(36) NOT NULL,
      age INT NOT NULL DEFAULT 0,
      gender VARCHAR(50) DEFAULT '',
      weight FLOAT NOT NULL DEFAULT 0,
      height FLOAT NOT NULL DEFAULT 0,
      smoking VARCHAR(50) DEFAULT 'never',
      alcohol VARCHAR(50) DEFAULT 'rarely',
      diet_type VARCHAR(50) DEFAULT 'balanced',
      vegetable_intake VARCHAR(50) DEFAULT 'daily',
      fruit_intake VARCHAR(50) DEFAULT 'daily',
      processed_food VARCHAR(50) DEFAULT 'sometimes',
      activity_level VARCHAR(50) DEFAULT 'moderate',
      goal ENUM('lose', 'maintain', 'gain') DEFAULT 'maintain',
      medical_conditions JSON NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (user_id),
      CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS daily_logs (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      date VARCHAR(10) NOT NULL,
      sleep_hours FLOAT NOT NULL DEFAULT 0,
      exercise_minutes INT NOT NULL DEFAULT 0,
      water_intake INT NOT NULL DEFAULT 0,
      caffeine_intake INT NOT NULL DEFAULT 0,
      weight FLOAT NULL,
      track_weight TINYINT(1) DEFAULT 0,
      calories INT NOT NULL DEFAULT 0,
      protein FLOAT NOT NULL DEFAULT 0,
      carbs FLOAT NOT NULL DEFAULT 0,
      fats FLOAT NOT NULL DEFAULT 0,
      food_quality VARCHAR(50) NULL,
      meals JSON NULL,
      track_macros TINYINT(1) DEFAULT 0,
      notes TEXT NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY user_date_unique (user_id, date),
      CONSTRAINT fk_log_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS ml_snapshots (
      id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      date VARCHAR(10) NOT NULL,
      overall_score FLOAT NOT NULL DEFAULT 0,
      cardiovascular FLOAT NOT NULL DEFAULT 0,
      metabolic FLOAT NOT NULL DEFAULT 0,
      nutritional FLOAT NOT NULL DEFAULT 0,
      sleep FLOAT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY user_date_snapshot (user_id, date),
      CONSTRAINT fk_snapshot_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

    `CREATE TABLE IF NOT EXISTS tip_reviews (
      id VARCHAR(36) NOT NULL,
      patient_id VARCHAR(36) NOT NULL,
      patient_name VARCHAR(255) NOT NULL,
      patient_email VARCHAR(255) NOT NULL,
      date VARCHAR(10) NOT NULL,
      category VARCHAR(100) NOT NULL,
      item_index INT NOT NULL DEFAULT 0,
      item_key VARCHAR(255) NOT NULL,
      original_text TEXT NOT NULL,
      approved_text TEXT NOT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      reviewed_by VARCHAR(255) NULL,
      reviewed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY tip_key_unique (item_key),
      CONSTRAINT fk_tip_patient FOREIGN KEY (patient_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  ];

  for (const q of queries) {
    await pool.query(q);
  }
}

export function getDbPool(): mysql.Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Ensure XAMPP MySQL is started.');
  }
  return pool;
}

export function isDbConnected(): boolean {
  return isConnected;
}
