import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { initDatabaseConnection, getDbPool, isDbConnected } from './db';

const app = express();
const PORT = process.env.PORT || 5001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Simple hash matching the frontend algorithm
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(16);
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    serverTime: new Date().toISOString(),
    mysqlConnected: isDbConnected(),
  });
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password, role = 'patient' } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    const pool = getDbPool();
    const cleanEmail = email.toLowerCase().trim();

    const [existing]: any = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists.' });
    }

    const id = uuidv4();
    const now = new Date();
    const passwordHash = simpleHash(password);

    await pool.query(
      `INSERT INTO users (id, name, email, password_hash, role, created_at, last_login, profile_complete)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name.trim(), cleanEmail, passwordHash, role, now, now, 0]
    );

    const user = {
      id,
      name: name.trim(),
      email: cleanEmail,
      role,
      createdAt: now.toISOString(),
      lastLogin: now.toISOString(),
      profileComplete: false,
    };

    return res.json({ success: true, user });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Database error during registration.' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const pool = getDbPool();
    const cleanEmail = email.toLowerCase().trim();

    const [rows]: any = await pool.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No account found with this email.' });
    }

    const userRow = rows[0];
    if (userRow.password_hash !== simpleHash(password)) {
      return res.status(401).json({ success: false, error: 'Incorrect password.' });
    }

    const now = new Date();
    await pool.query('UPDATE users SET last_login = ? WHERE id = ?', [now, userRow.id]);

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      createdAt: new Date(userRow.created_at).toISOString(),
      lastLogin: now.toISOString(),
      profileComplete: Boolean(userRow.profile_complete),
    };

    return res.json({ success: true, user });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: err.message || 'Database error during login.' });
  }
});

app.get('/api/auth/users', async (_req: Request, res: Response) => {
  try {
    const pool = getDbPool();
    const [rows]: any = await pool.query('SELECT id, name, email, role, created_at, last_login, profile_complete FROM users');
    const users = rows.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: new Date(u.created_at).toISOString(),
      lastLogin: new Date(u.last_login).toISOString(),
      profileComplete: Boolean(u.profile_complete),
    }));
    return res.json(users);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/profile-complete', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    const pool = getDbPool();
    await pool.query('UPDATE users SET profile_complete = 1 WHERE id = ?', [userId]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/user/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const pool = getDbPool();
    await pool.query('UPDATE users SET name = ? WHERE id = ?', [name, id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Profile Routes ───────────────────────────────────────────────────────────

app.get('/api/profiles/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const pool = getDbPool();
    const [rows]: any = await pool.query('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
    if (!rows || rows.length === 0) return res.json(null);

    const r = rows[0];
    const profile = {
      userId: r.user_id,
      age: Number(r.age),
      gender: r.gender,
      weight: Number(r.weight),
      height: Number(r.height),
      smoking: r.smoking,
      alcohol: r.alcohol,
      dietType: r.diet_type,
      vegetableIntake: r.vegetable_intake,
      fruitIntake: r.fruit_intake,
      processedFood: r.processed_food,
      activityLevel: r.activity_level,
      goal: r.goal,
      medicalConditions: typeof r.medical_conditions === 'string' ? JSON.parse(r.medical_conditions || '[]') : (r.medical_conditions || []),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
    return res.json(profile);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/profiles', async (req: Request, res: Response) => {
  try {
    const p = req.body;
    const pool = getDbPool();
    const now = new Date();
    const conditions = JSON.stringify(p.medicalConditions || []);

    await pool.query(
      `INSERT INTO user_profiles (
        user_id, age, gender, weight, height, smoking, alcohol, diet_type,
        vegetable_intake, fruit_intake, processed_food, activity_level, goal,
        medical_conditions, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        age = VALUES(age),
        gender = VALUES(gender),
        weight = VALUES(weight),
        height = VALUES(height),
        smoking = VALUES(smoking),
        alcohol = VALUES(alcohol),
        diet_type = VALUES(diet_type),
        vegetable_intake = VALUES(vegetable_intake),
        fruit_intake = VALUES(fruit_intake),
        processed_food = VALUES(processed_food),
        activity_level = VALUES(activity_level),
        goal = VALUES(goal),
        medical_conditions = VALUES(medical_conditions),
        updated_at = VALUES(updated_at)`,
      [
        p.userId, p.age, p.gender, p.weight, p.height, p.smoking, p.alcohol, p.dietType,
        p.vegetableIntake, p.fruitIntake, p.processedFood, p.activityLevel, p.goal,
        conditions, now
      ]
    );

    return res.json({ ...p, updatedAt: now.toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Daily Logs Routes ────────────────────────────────────────────────────────

app.get('/api/daily-logs/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const pool = getDbPool();
    const [rows]: any = await pool.query(
      'SELECT * FROM daily_logs WHERE user_id = ? ORDER BY date ASC',
      [userId]
    );

    const logs = rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      date: r.date,
      sleepHours: Number(r.sleep_hours),
      exerciseMinutes: Number(r.exercise_minutes),
      waterIntake: Number(r.water_intake),
      caffeineIntake: Number(r.caffeine_intake),
      weight: r.weight !== null ? Number(r.weight) : undefined,
      trackWeight: Boolean(r.track_weight),
      calories: Number(r.calories),
      protein: Number(r.protein),
      carbs: Number(r.carbs),
      fats: Number(r.fats),
      foodQuality: r.food_quality || undefined,
      meals: typeof r.meals === 'string' ? JSON.parse(r.meals || '[]') : (r.meals || []),
      trackMacros: Boolean(r.track_macros),
      notes: r.notes || undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    return res.json(logs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-logs', async (req: Request, res: Response) => {
  try {
    const l = req.body;
    const pool = getDbPool();
    const id = l.id || uuidv4();
    const now = new Date();
    const mealsJson = JSON.stringify(l.meals || []);

    await pool.query(
      `INSERT INTO daily_logs (
        id, user_id, date, sleep_hours, exercise_minutes, water_intake, caffeine_intake,
        weight, track_weight, calories, protein, carbs, fats, food_quality, meals,
        track_macros, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sleep_hours = VALUES(sleep_hours),
        exercise_minutes = VALUES(exercise_minutes),
        water_intake = VALUES(water_intake),
        caffeine_intake = VALUES(caffeine_intake),
        weight = VALUES(weight),
        track_weight = VALUES(track_weight),
        calories = VALUES(calories),
        protein = VALUES(protein),
        carbs = VALUES(carbs),
        fats = VALUES(fats),
        food_quality = VALUES(food_quality),
        meals = VALUES(meals),
        track_macros = VALUES(track_macros),
        notes = VALUES(notes)`,
      [
        id, l.userId, l.date, l.sleepHours || 0, l.exerciseMinutes || 0, l.waterIntake || 0,
        l.caffeineIntake || 0, l.weight ?? null, l.trackWeight ? 1 : 0, l.calories || 0,
        l.protein || 0, l.carbs || 0, l.fats || 0, l.foodQuality || null, mealsJson,
        l.trackMacros ? 1 : 0, l.notes || null, now
      ]
    );

    return res.json({ ...l, id, createdAt: now.toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/daily-logs/:userId/:logId', async (req: Request, res: Response) => {
  try {
    const { userId, logId } = req.params;
    const pool = getDbPool();
    await pool.query('DELETE FROM daily_logs WHERE user_id = ? AND id = ?', [userId, logId]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── ML Snapshots Routes ──────────────────────────────────────────────────────

app.get('/api/ml-snapshots/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const pool = getDbPool();
    const [rows]: any = await pool.query(
      'SELECT * FROM ml_snapshots WHERE user_id = ? ORDER BY date ASC',
      [userId]
    );

    const snapshots = rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      date: r.date,
      overallScore: Number(r.overall_score),
      cardiovascular: Number(r.cardiovascular),
      metabolic: Number(r.metabolic),
      nutritional: Number(r.nutritional),
      sleep: Number(r.sleep),
      createdAt: new Date(r.created_at).toISOString(),
    }));

    return res.json(snapshots);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/ml-snapshots', async (req: Request, res: Response) => {
  try {
    const s = req.body;
    const pool = getDbPool();
    const id = s.id || uuidv4();
    const now = new Date();

    await pool.query(
      `INSERT INTO ml_snapshots (
        id, user_id, date, overall_score, cardiovascular, metabolic, nutritional, sleep, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        overall_score = VALUES(overall_score),
        cardiovascular = VALUES(cardiovascular),
        metabolic = VALUES(metabolic),
        nutritional = VALUES(nutritional),
        sleep = VALUES(sleep)`,
      [
        id, s.userId, s.date, s.overallScore || 0, s.cardiovascular || 0,
        s.metabolic || 0, s.nutritional || 0, s.sleep || 0, now
      ]
    );

    return res.json({ ...s, id, createdAt: now.toISOString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Tip Reviews Routes ───────────────────────────────────────────────────────

app.get('/api/tip-reviews', async (_req: Request, res: Response) => {
  try {
    const pool = getDbPool();
    const [rows]: any = await pool.query(
      'SELECT * FROM tip_reviews ORDER BY date ASC, category ASC, item_index ASC'
    );

    const reviews = rows.map((r: any) => ({
      id: r.id,
      patientId: r.patient_id,
      patientName: r.patient_name,
      patientEmail: r.patient_email,
      date: r.date,
      category: r.category,
      index: Number(r.item_index),
      key: r.item_key,
      originalText: r.original_text,
      approvedText: r.approved_text,
      status: r.status,
      reviewedBy: r.reviewed_by || undefined,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    return res.json(reviews);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/tip-reviews/sync', async (req: Request, res: Response) => {
  try {
    const { patient, date, recs } = req.body;
    const pool = getDbPool();
    const now = new Date();

    for (const rec of recs || []) {
      for (let i = 0; i < (rec.texts || []).length; i++) {
        const text = rec.texts[i];
        if (!text || !text.trim()) continue;
        const key = `${patient.id}|${date}|${rec.category}|${i}`;

        await pool.query(
          `INSERT INTO tip_reviews (
            id, patient_id, patient_name, patient_email, date, category, item_index,
            item_key, original_text, approved_text, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
          ON DUPLICATE KEY UPDATE
            original_text = IF(status = 'pending', VALUES(original_text), original_text)`,
          [
            uuidv4(), patient.id, patient.name, patient.email, date, rec.category, i,
            key, text, text, now
          ]
        );
      }
    }

    const [rows]: any = await pool.query(
      'SELECT * FROM tip_reviews WHERE patient_id = ? ORDER BY date ASC',
      [patient.id]
    );

    const updated = rows.map((r: any) => ({
      id: r.id,
      patientId: r.patient_id,
      patientName: r.patient_name,
      patientEmail: r.patient_email,
      date: r.date,
      category: r.category,
      index: Number(r.item_index),
      key: r.item_key,
      originalText: r.original_text,
      approvedText: r.approved_text,
      status: r.status,
      reviewedBy: r.reviewed_by || undefined,
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : undefined,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/tip-reviews/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, approvedText, reviewedBy } = req.body;
    const pool = getDbPool();
    const now = new Date();

    await pool.query(
      `UPDATE tip_reviews SET
        status = ?,
        approved_text = ?,
        reviewed_by = ?,
        reviewed_at = ?
       WHERE id = ?`,
      [status, approvedText, reviewedBy, now, id]
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/tip-reviews/group', async (req: Request, res: Response) => {
  try {
    const { key, status, block, reviewedBy } = req.body;
    const pool = getDbPool();
    const prefix = `${key}|%`;
    const now = new Date();

    const [rows]: any = await pool.query(
      'SELECT id, item_index FROM tip_reviews WHERE item_key LIKE ? ORDER BY item_index ASC',
      [prefix]
    );

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowStatus = i === 0 ? status : 'rejected';
      const text = i === 0 ? (block || '').trim() : '';

      await pool.query(
        `UPDATE tip_reviews SET
          status = ?,
          approved_text = ?,
          reviewed_by = ?,
          reviewed_at = ?
         WHERE id = ?`,
        [rowStatus, text, reviewedBy, now, row.id]
      );
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

async function startServer() {
  await initDatabaseConnection();
  app.listen(PORT, () => {
    console.log(`[MedAlert Server] Running at http://localhost:${PORT}`);
    console.log(`[MedAlert Server] API available at http://localhost:${PORT}/api`);
  });
}

startServer();
