import { v4 as uuidv4 } from 'uuid';
import { getCollection, getMeta, initIndexedDB, setCollection, setMeta } from './indexedDb';
import { api } from './apiClient';
import { supabaseDb } from './supabaseClient';

export function getRemote() {
  if (supabaseDb.isAvailable()) return supabaseDb;
  return api;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'patient' | 'doctor';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  createdAt: string;
  lastLogin: string;
  profileComplete: boolean; // true once onboarding is done
}

export interface UserProfile {
  userId: string;
  age: number;
  gender: string;
  weight: number;   // kg
  height: number;   // cm
  smoking: string;
  alcohol: string;
  dietType: string;
  vegetableIntake: string;
  fruitIntake: string;
  processedFood: string;
  activityLevel: string;  // sedentary | light | moderate | active | very_active
  goal: 'lose' | 'maintain' | 'gain'; // weight goal → drives macro targets
  medicalConditions: string[]; // e.g. ['diabetes','hypertension']
  updatedAt: string;
}

export type FoodQuality = 'healthy' | 'balanced' | 'mixed' | 'processed';

/** A single food the user logged, with per-serving macros. */
export interface MealEntry {
  name: string;
  serving: string;   // human-readable serving label, e.g. "100g"
  qty: number;       // number of servings
  protein: number;   // g per serving
  carbs: number;     // g per serving
  fats: number;      // g per serving
  calories: number;  // kcal per serving
}

export interface DailyLog {
  id: string;
  userId: string;
  date: string;           // YYYY-MM-DD
  // Physical
  sleepHours: number;
  exerciseMinutes: number;
  waterIntake: number;    // glasses
  caffeineIntake: number; // drinks
  weight?: number;        // kg
  trackWeight?: boolean;  // user opted to log weight this day
  // Diet / Nutrition
  calories: number;       // kcal
  protein: number;        // g (0 = estimate from calories in ML)
  carbs: number;          // g
  fats: number;           // g
  foodQuality?: FoodQuality; // per-day eating quality (optional, improves ML)
  meals?: MealEntry[];        // foods logged via the food picker (auto-fills macros)
  trackMacros?: boolean;  // user chose to enter macros manually
  /** @deprecated Notes removed from UI; kept for older saved logs */
  notes?: string;
  createdAt: string;
}

export interface MLSnapshot {
  id: string;
  userId: string;
  date: string;
  overallScore: number;
  cardiovascular: number;
  metabolic: number;
  nutritional: number;
  sleep: number;
  createdAt: string;
}

export type TipStatus = 'pending' | 'approved' | 'rejected';

/** An ML-generated health tip that awaits (or has) a doctor's final decision. */
export interface TipReview {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  date: string;      // YYYY-MM-DD the tip was generated for
  category: string;  // e.g. 'Cardiovascular Health'
  index: number;     // position within the category's recommendation list
  key: string;       // stable dedupe key: patientId|date|category|index
  originalText: string;
  approvedText: string;
  status: TipStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const KEYS = {
  USERS:        'med_users',
  PROFILES:     'med_profiles',
  DAILY_LOGS:   'med_daily_logs',
  ML_SNAPSHOTS: 'med_ml_snapshots',
  CURRENT_USER: 'med_current_user',
  TIP_REVIEWS:  'med_tip_reviews',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]') as T[];
  } catch {
    return [];
  }
}

function write<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
  // Mirror to IndexedDB for structured persistence in Vite/browser environments.
  void setCollection('meta', key, data).catch(() => {
    // Keep the app functional even if IndexedDB is unavailable.
  });
}

function writeRaw(key: string, value: string): void {
  localStorage.setItem(key, value);
  void setCollection('meta', key, value).catch(() => {
    // Keep the app functional even if IndexedDB is unavailable.
  });
}

export async function syncAllFromServer(): Promise<void> {
  const isSupabase = supabaseDb.isAvailable();
  if (!isSupabase) {
    const health = await api.checkHealth();
    if (!health) return;
  }
  const remote = getRemote();

  const current = auth.getCurrentUser();
  if (!current) return;

  // Sync users list
  const serverUsers = await remote.getAllUsers();
  if (serverUsers && serverUsers.length > 0) {
    const localUsers = read<User>(KEYS.USERS);
    const map = new Map<string, User>();
    localUsers.forEach(u => map.set(u.id, u));
    serverUsers.forEach(u => map.set(u.id, { ...map.get(u.id), ...u }));
    write(KEYS.USERS, Array.from(map.values()));
  }

  // If patient, sync their profile, daily logs, and snapshots
  if (current.role === 'patient') {
    const p = await remote.getProfile(current.id);
    if (p) {
      const allProfiles = read<UserProfile>(KEYS.PROFILES);
      const idx = allProfiles.findIndex(x => x.userId === current.id);
      if (idx >= 0) allProfiles[idx] = p;
      else allProfiles.push(p);
      write(KEYS.PROFILES, allProfiles);
    }

    const logs = await remote.getDailyLogs(current.id);
    if (logs) {
      const allLogs = read<DailyLog>(KEYS.DAILY_LOGS);
      const otherLogs = allLogs.filter(l => l.userId !== current.id);
      write(KEYS.DAILY_LOGS, [...otherLogs, ...logs]);
    }

    const snaps = await remote.getSnapshots(current.id);
    if (snaps) {
      const allSnaps = read<MLSnapshot>(KEYS.ML_SNAPSHOTS);
      const otherSnaps = allSnaps.filter(s => s.userId !== current.id);
      write(KEYS.ML_SNAPSHOTS, [...otherSnaps, ...snaps]);
    }
  }

  // Sync doctor tip reviews
  const reviews = await remote.getTipReviews();
  if (reviews) {
    write(KEYS.TIP_REVIEWS, reviews);
  }
}

export async function initializeDatabase(): Promise<void> {
  await initIndexedDB();

  const alreadyHydrated = await getMeta('med_idb_hydrated');
  if (alreadyHydrated !== 'true') {
    const mappings: Array<{ key: string; store: 'meta' }> = [
      { key: KEYS.USERS, store: 'meta' },
      { key: KEYS.PROFILES, store: 'meta' },
      { key: KEYS.DAILY_LOGS, store: 'meta' },
      { key: KEYS.ML_SNAPSHOTS, store: 'meta' },
      { key: KEYS.CURRENT_USER, store: 'meta' },
      { key: KEYS.TIP_REVIEWS, store: 'meta' },
    ];

    for (const map of mappings) {
      const localValue = localStorage.getItem(map.key);
      if (localValue !== null) {
        try {
          const parsed = JSON.parse(localValue);
          await setCollection(map.store, map.key, parsed);
        } catch {
          await setCollection(map.store, map.key, localValue);
        }
      } else {
        const idbValue = await getCollection<unknown>(map.store, map.key);
        if (idbValue !== null) {
          if (map.key === KEYS.CURRENT_USER && typeof idbValue === 'string') {
            localStorage.setItem(map.key, idbValue);
          } else {
            localStorage.setItem(map.key, JSON.stringify(idbValue));
          }
        }
      }
    }

    await setMeta('med_idb_hydrated', 'true');
  }

  // Background sync from MySQL if backend is running
  void syncAllFromServer().catch(() => {});
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  register(name: string, email: string, password: string, role: UserRole = 'patient'): { success: boolean; error?: string; user?: User } {
    const users = read<User>(KEYS.USERS);
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'An account with this email already exists.' };
    }
    const user: User = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      profileComplete: false,
    };
    write(KEYS.USERS, [...users, user]);
    writeRaw(KEYS.CURRENT_USER, user.id);
    void getRemote().register(name, email, password, role).catch(() => {});
    return { success: true, user };
  },

  async registerAsync(name: string, email: string, password: string, role: UserRole = 'patient'): Promise<{ success: boolean; error?: string; user?: User; token?: string }> {
    const res = await getRemote().register(name, email, password, role);
    if (res && res.success && res.user) {
      if ((res as any).token) {
        localStorage.setItem('med_auth_token', (res as any).token);
      }
      const users = read<User>(KEYS.USERS);
      const updated = users.filter(u => u.id !== res.user!.id);
      write(KEYS.USERS, [...updated, res.user]);
      writeRaw(KEYS.CURRENT_USER, res.user.id);
      return res;
    }
    if (res && !res.success) {
      return res;
    }
    return auth.register(name, email, password, role);
  },

  login(email: string, password: string): { success: boolean; error?: string; user?: User } {
    const users = read<User>(KEYS.USERS);
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!found) return { success: false, error: 'No account found with this email.' };
    const updated = users.map(u =>
      u.id === found.id ? { ...u, lastLogin: new Date().toISOString() } : u
    );
    write(KEYS.USERS, updated);
    writeRaw(KEYS.CURRENT_USER, found.id);
    void getRemote().login(email, password).catch(() => {});
    return { success: true, user: { ...found, role: found.role ?? 'patient', lastLogin: new Date().toISOString() } };
  },

  async loginAsync(email: string, password: string): Promise<{ success: boolean; error?: string; user?: User; token?: string }> {
    const res = await getRemote().login(email, password);
    if (res && res.success && res.user) {
      if ((res as any).token) {
        localStorage.setItem('med_auth_token', (res as any).token);
      }
      const users = read<User>(KEYS.USERS);
      const updated = users.filter(u => u.id !== res.user!.id);
      write(KEYS.USERS, [...updated, res.user]);
      writeRaw(KEYS.CURRENT_USER, res.user.id);
      void syncAllFromServer().catch(() => {});
      return res;
    }
    if (res && !res.success) {
      return res;
    }
    return auth.login(email, password);
  },

  logout(): void {
    localStorage.removeItem(KEYS.CURRENT_USER);
    localStorage.removeItem('med_auth_token');
    void setCollection('meta', KEYS.CURRENT_USER, '').catch(() => {});
    if ('logout' in api && typeof api.logout === 'function') {
      api.logout();
    }
  },

  getCurrentUser(): User | null {
    const id = localStorage.getItem(KEYS.CURRENT_USER);
    if (!id) return null;
    const user = read<User>(KEYS.USERS).find(u => u.id === id);
    return user ? { ...user, role: user.role ?? 'patient' } : null;
  },

  getAll(): User[] {
    return read<User>(KEYS.USERS).map(u => ({ ...u, role: u.role ?? 'patient' }));
  },

  async syncUsers(): Promise<User[]> {
    const serverUsers = await getRemote().getAllUsers();
    if (serverUsers) {
      const localUsers = read<User>(KEYS.USERS);
      const map = new Map<string, User>();
      localUsers.forEach(u => map.set(u.id, u));
      serverUsers.forEach(u => map.set(u.id, { ...map.get(u.id), ...u }));
      const merged = Array.from(map.values());
      write(KEYS.USERS, merged);
      return merged;
    }
    return auth.getAll();
  },

  markProfileComplete(userId: string): void {
    const users = read<User>(KEYS.USERS);
    const idx = users.findIndex(u => u.id === userId);
    if (idx !== -1) {
      users[idx] = { ...users[idx], profileComplete: true };
      write(KEYS.USERS, users);
      writeRaw(KEYS.CURRENT_USER, userId);
    }
    void getRemote().markProfileComplete(userId).catch(() => {});
  },

  updateUser(id: string, updates: Partial<Pick<User, 'name'>>): User | null {
    const users = read<User>(KEYS.USERS);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    write(KEYS.USERS, users);
    if (updates.name) {
      void getRemote().updateUser(id, updates.name).catch(() => {});
    }
    return users[idx];
  },
};

// ─── Profiles ─────────────────────────────────────────────────────────────────

export const profiles = {
  get(userId: string): UserProfile | null {
    return read<UserProfile>(KEYS.PROFILES).find(p => p.userId === userId) || null;
  },

  save(profile: Omit<UserProfile, 'updatedAt'>): UserProfile {
    const all = read<UserProfile>(KEYS.PROFILES);
    const updated: UserProfile = { ...profile, updatedAt: new Date().toISOString() };
    const idx = all.findIndex(p => p.userId === profile.userId);
    if (idx >= 0) {
      all[idx] = updated;
    } else {
      all.push(updated);
    }
    write(KEYS.PROFILES, all);
    void getRemote().saveProfile(updated).catch(() => {});
    return updated;
  },

  defaultProfile(userId: string): UserProfile {
    return {
      userId,
      age: 0,
      gender: '',
      weight: 0,
      height: 0,
      smoking: 'never',
      alcohol: 'rarely',
      dietType: 'balanced',
      vegetableIntake: 'daily',
      fruitIntake: 'daily',
      processedFood: 'sometimes',
      activityLevel: 'moderate',
      goal: 'maintain',
      medicalConditions: [],
      updatedAt: new Date().toISOString(),
    };
  },
};

// ─── Daily Logs ───────────────────────────────────────────────────────────────

export const dailyLogs = {
  getAll(userId: string): DailyLog[] {
    return read<DailyLog>(KEYS.DAILY_LOGS)
      .filter(l => l.userId === userId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  getByDate(userId: string, date: string): DailyLog | null {
    return read<DailyLog>(KEYS.DAILY_LOGS)
      .find(l => l.userId === userId && l.date === date) || null;
  },

  save(log: Omit<DailyLog, 'id' | 'createdAt'> & { id?: string }): DailyLog {
    const all = read<DailyLog>(KEYS.DAILY_LOGS);
    const existing = all.findIndex(l => l.userId === log.userId && l.date === log.date);
    const saved: DailyLog = {
      ...log,
      id: log.id || uuidv4(),
      createdAt: new Date().toISOString(),
    };
    if (existing >= 0) {
      all[existing] = saved;
    } else {
      all.push(saved);
    }
    write(KEYS.DAILY_LOGS, all);
    void getRemote().saveDailyLog(saved).catch(() => {});
    return saved;
  },

  delete(userId: string, logId: string): void {
    write(
      KEYS.DAILY_LOGS,
      read<DailyLog>(KEYS.DAILY_LOGS).filter(l => !(l.userId === userId && l.id === logId))
    );
    void getRemote().deleteDailyLog(userId, logId).catch(() => {});
  },

  getStreak(userId: string): number {
    const logs = dailyLogs.getAll(userId);
    if (!logs.length) return 0;
    let streak = 0;
    const check = new Date();
    while (streak <= 365) {
      const dateStr = check.toISOString().split('T')[0];
      if (logs.find(l => l.date === dateStr)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  },
};

// ─── ML Snapshots ─────────────────────────────────────────────────────────────

export const mlSnapshots = {
  getAll(userId: string): MLSnapshot[] {
    return read<MLSnapshot>(KEYS.ML_SNAPSHOTS)
      .filter(s => s.userId === userId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  save(snapshot: Omit<MLSnapshot, 'id' | 'createdAt'>): MLSnapshot {
    const all = read<MLSnapshot>(KEYS.ML_SNAPSHOTS);
    const existing = all.findIndex(
      s => s.userId === snapshot.userId && s.date === snapshot.date
    );
    const saved: MLSnapshot = {
      ...snapshot,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    if (existing >= 0) {
      all[existing] = saved;
    } else {
      all.push(saved);
    }
    write(KEYS.ML_SNAPSHOTS, all);
    void getRemote().saveSnapshot(saved).catch(() => {});
    return saved;
  },
};

// ─── Doctor Review (ML tips final say) ───────────────────────────────────────

export interface TipRecInput {
  category: string;
  texts: string[];
}

function tipKey(patientId: string, date: string, category: string, index: number): string {
  return `${patientId}|${date}|${category}|${index}`;
}

export const tipReviews = {
  getAll(): TipReview[] {
    return read<TipReview>(KEYS.TIP_REVIEWS).sort(
      (a, b) => a.date.localeCompare(b.date) || a.category.localeCompare(b.category)
    );
  },

  getForPatient(patientId: string): TipReview[] {
    return tipReviews.getAll().filter(r => r.patientId === patientId);
  },

  getForDate(patientId: string, date: string): TipReview[] {
    return tipReviews.getAll().filter(r => r.patientId === patientId && r.date === date);
  },

  getApprovedForDate(patientId: string, date: string): TipReview[] {
    return tipReviews.getForDate(patientId, date).filter(r => r.status === 'approved');
  },

  /** Doctor view: everything still awaiting a decision, newest first. */
  getPending(): TipReview[] {
    return tipReviews
      .getAll()
      .filter(r => r.status === 'pending')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  getPatientCounts(patientId: string) {
    const all = tipReviews.getForPatient(patientId);
    return {
      pending: all.filter(r => r.status === 'pending').length,
      approved: all.filter(r => r.status === 'approved').length,
      rejected: all.filter(r => r.status === 'rejected').length,
    };
  },

  /**
   * Upsert the day's generated tips. Approved/rejected rows are left untouched
   * (the doctor's decision is final); pending rows get their text refreshed.
   */
  sync(
    patient: Pick<User, 'id' | 'name' | 'email'>,
    date: string,
    recs: TipRecInput[]
  ): TipReview[] {
    const all = read<TipReview>(KEYS.TIP_REVIEWS);
    for (const rec of recs) {
      rec.texts.forEach((text, index) => {
        if (!text.trim()) return;
        const key = tipKey(patient.id, date, rec.category, index);
        const existing = all.find(r => r.key === key);
        if (existing) {
          if (existing.status === 'pending' && existing.originalText !== text) {
            existing.originalText = text;
          }
          return;
        }
        all.push({
          id: uuidv4(),
          patientId: patient.id,
          patientName: patient.name,
          patientEmail: patient.email,
          date,
          category: rec.category,
          index,
          key,
          originalText: text,
          approvedText: text,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      });
    }
    write(KEYS.TIP_REVIEWS, all);
    void getRemote().syncTipReviews(patient, date, recs).catch(() => {});
    return all.filter(r => r.patientId === patient.id);
  },

  /** Doctor's final decision: approve (optionally edited) or reject. */
  setStatus(
    id: string,
    status: Exclude<TipStatus, 'pending'>,
    approvedText: string,
    reviewedBy: string
  ): TipReview | null {
    const all = read<TipReview>(KEYS.TIP_REVIEWS);
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      status,
      approvedText: approvedText.trim() || all[idx].originalText,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    };
    write(KEYS.TIP_REVIEWS, all);
    void getRemote().setTipStatus(id, status, approvedText, reviewedBy).catch(() => {});
    return all[idx];
  },

  /**
   * Doctor's decision for a whole category block. The first row of the group
   * stores the composed block (newline-separated, any number of items); the
   * remaining generated rows are marked rejected so the patient only sees the
   * doctor's single composed block per category.
   * `key` is the group prefix (patientId|date|category, without the index).
   */
  setGroup(
    key: string,
    status: Exclude<TipStatus, 'pending'>,
    block: string,
    reviewedBy: string
  ): void {
    const all = read<TipReview>(KEYS.TIP_REVIEWS);
    const prefix = key + '|';
    const group = all
      .filter(r => r.key.startsWith(prefix))
      .sort((a, b) => a.index - b.index);
    const text = block.trim();
    const timestamp = new Date().toISOString();
    group.forEach((r, i) => {
      const idx = all.findIndex(x => x.id === r.id);
      if (idx === -1) return;
      all[idx] = {
        ...all[idx],
        status: i === 0 ? status : 'rejected',
        approvedText: i === 0 ? text : '',
        reviewedBy,
        reviewedAt: timestamp,
      };
    });
    write(KEYS.TIP_REVIEWS, all);
    void getRemote().setTipGroup(key, status, text, reviewedBy).catch(() => {});
  },

  async syncFromServer(): Promise<TipReview[]> {
    const reviews = await getRemote().getTipReviews();
    if (reviews) {
      write(KEYS.TIP_REVIEWS, reviews);
      return reviews;
    }
    return tipReviews.getAll();
  },
};
