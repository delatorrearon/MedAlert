import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { clientEnv } from '../config/env';
import { User, UserProfile, DailyLog, MLSnapshot, TipReview, TipRecInput, UserRole } from './database';

const rawUrl = (clientEnv.supabaseUrl || '').trim();
const cleanUrl = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const cleanKey = (clientEnv.supabaseAnonKey || '').trim();

export const supabase: SupabaseClient | null = (cleanUrl && cleanKey)
  ? createClient(cleanUrl, cleanKey)
  : null;

if (typeof window !== 'undefined') {
  if (supabase) {
    console.log('[MedAlert] Supabase initialized successfully:', cleanUrl);
  } else {
    console.warn('[MedAlert] Supabase NOT active. Running in local/IndexedDB mode.', {
      hasUrl: Boolean(rawUrl),
      hasKey: Boolean(cleanKey),
    });
  }
}

export const supabaseDb = {
  isAvailable(): boolean {
    return !!supabase;
  },

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async register(name: string, email: string, password: string, role: UserRole = 'patient') {
    if (!supabase) return null;
    const cleanEmail = email.toLowerCase().trim();

    // Check if user exists
    const { data: existing, error: checkErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (checkErr) {
      console.warn('Supabase register error:', checkErr.message);
      return { success: false, error: checkErr.message };
    }
    if (existing) {
      return { success: false, error: 'An account with this email already exists.' };
    }

    // Strong salted bcrypt hashing (cost factor 10)
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: cleanEmail,
      password_hash: passwordHash,
      role,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString(),
      profile_complete: false,
    };

    const { error: insertErr } = await supabase.from('users').insert(newUser);
    if (insertErr) {
      return { success: false, error: insertErr.message };
    }

    // Explicitly omit password_hash from the returned user object
    const user: User = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role as UserRole,
      createdAt: newUser.created_at,
      lastLogin: newUser.last_login,
      profileComplete: false,
    };

    return { success: true, user };
  },

  async login(email: string, password: string) {
    if (!supabase) return null;
    const cleanEmail = email.toLowerCase().trim();

    const { data: userRow, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (error || !userRow) {
      return { success: false, error: 'No account found with this email.' };
    }

    // Verify bcrypt hash
    let passwordMatches = false;
    if (userRow.password_hash && (userRow.password_hash.startsWith('$2a$') || userRow.password_hash.startsWith('$2b$'))) {
      passwordMatches = await bcrypt.compare(password, userRow.password_hash);
    }

    if (!passwordMatches) {
      return { success: false, error: 'Incorrect password.' };
    }

    const now = new Date().toISOString();
    await supabase.from('users').update({ last_login: now }).eq('id', userRow.id);

    // Explicitly omit password_hash from the returned user object
    const user: User = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role,
      createdAt: userRow.created_at,
      lastLogin: now,
      profileComplete: Boolean(userRow.profile_complete),
    };

    return { success: true, user };
  },

  async getAllUsers(): Promise<User[] | null> {
    if (!supabase) return null;
    // Explicitly omit password_hash from the SQL select
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, created_at, last_login, profile_complete');
    if (error || !data) return null;
    return data.map((u: any) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.created_at,
      lastLogin: u.last_login,
      profileComplete: Boolean(u.profile_complete),
    }));
  },

  async markProfileComplete(userId: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('users').update({ profile_complete: true }).eq('id', userId);
    return !error;
  },

  async updateUser(id: string, name: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('users').update({ name }).eq('id', id);
    return !error;
  },

  // ─── Profiles ─────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      userId: data.user_id,
      age: Number(data.age),
      gender: data.gender,
      weight: Number(data.weight),
      height: Number(data.height),
      smoking: data.smoking,
      alcohol: data.alcohol,
      dietType: data.diet_type,
      vegetableIntake: data.vegetable_intake,
      fruitIntake: data.fruit_intake,
      processedFood: data.processed_food,
      activityLevel: data.activity_level,
      goal: data.goal,
      medicalConditions: Array.isArray(data.medical_conditions) ? data.medical_conditions : [],
      updatedAt: data.updated_at,
    };
  },

  async saveProfile(profile: UserProfile): Promise<UserProfile | null> {
    if (!supabase) return null;
    const row = {
      user_id: profile.userId,
      age: profile.age,
      gender: profile.gender,
      weight: profile.weight,
      height: profile.height,
      smoking: profile.smoking,
      alcohol: profile.alcohol,
      diet_type: profile.dietType,
      vegetable_intake: profile.vegetableIntake,
      fruit_intake: profile.fruitIntake,
      processed_food: profile.processedFood,
      activity_level: profile.activityLevel,
      goal: profile.goal,
      medical_conditions: profile.medicalConditions || [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('user_profiles').upsert(row);
    if (error) {
      console.warn('Supabase saveProfile error:', error.message);
      return null;
    }
    return profile;
  },

  // ─── Daily Logs ───────────────────────────────────────────────────────────

  async getDailyLogs(userId: string): Promise<DailyLog[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('daily_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error || !data) return null;

    return data.map((r: any) => ({
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
      meals: Array.isArray(r.meals) ? r.meals : [],
      trackMacros: Boolean(r.track_macros),
      notes: r.notes || undefined,
      createdAt: r.created_at,
    }));
  },

  async saveDailyLog(log: DailyLog): Promise<DailyLog | null> {
    if (!supabase) return null;
    const row = {
      id: log.id,
      user_id: log.userId,
      date: log.date,
      sleep_hours: log.sleepHours || 0,
      exercise_minutes: log.exerciseMinutes || 0,
      water_intake: log.waterIntake || 0,
      caffeine_intake: log.caffeineIntake || 0,
      weight: log.weight ?? null,
      track_weight: Boolean(log.trackWeight),
      calories: log.calories || 0,
      protein: log.protein || 0,
      carbs: log.carbs || 0,
      fats: log.fats || 0,
      food_quality: log.foodQuality || null,
      meals: log.meals || [],
      track_macros: Boolean(log.trackMacros),
      notes: log.notes || null,
      created_at: log.createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('daily_logs').upsert(row, { onConflict: 'user_id,date' });
    if (error) {
      console.warn('Supabase saveDailyLog error:', error.message);
      return null;
    }
    return log;
  },

  async deleteDailyLog(userId: string, logId: string): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase
      .from('daily_logs')
      .delete()
      .eq('user_id', userId)
      .eq('id', logId);
    return !error;
  },

  // ─── ML Snapshots ─────────────────────────────────────────────────────────

  async getSnapshots(userId: string): Promise<MLSnapshot[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('ml_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true });

    if (error || !data) return null;

    return data.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      date: r.date,
      overallScore: Number(r.overall_score),
      cardiovascular: Number(r.cardiovascular),
      metabolic: Number(r.metabolic),
      nutritional: Number(r.nutritional),
      sleep: Number(r.sleep),
      createdAt: r.created_at,
    }));
  },

  async saveSnapshot(snapshot: MLSnapshot): Promise<MLSnapshot | null> {
    if (!supabase) return null;
    const row = {
      id: snapshot.id,
      user_id: snapshot.userId,
      date: snapshot.date,
      overall_score: snapshot.overallScore || 0,
      cardiovascular: snapshot.cardiovascular || 0,
      metabolic: snapshot.metabolic || 0,
      nutritional: snapshot.nutritional || 0,
      sleep: snapshot.sleep || 0,
      created_at: snapshot.createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('ml_snapshots').upsert(row, { onConflict: 'user_id,date' });
    if (error) {
      console.warn('Supabase saveSnapshot error:', error.message);
      return null;
    }
    return snapshot;
  },

  // ─── Tip Reviews ──────────────────────────────────────────────────────────

  async getTipReviews(): Promise<TipReview[] | null> {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('tip_reviews')
      .select('*')
      .order('date', { ascending: true });

    if (error || !data) return null;

    return data.map((r: any) => ({
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
      reviewedAt: r.reviewed_at || undefined,
      createdAt: r.created_at,
    }));
  },

  async syncTipReviews(
    patient: Pick<User, 'id' | 'name' | 'email'>,
    date: string,
    recs: TipRecInput[]
  ): Promise<TipReview[] | null> {
    if (!supabase) return null;
    const now = new Date().toISOString();

    for (const rec of recs || []) {
      for (let i = 0; i < (rec.texts || []).length; i++) {
        const text = rec.texts[i];
        if (!text || !text.trim()) continue;
        const key = `${patient.id}|${date}|${rec.category}|${i}`;

        // Upsert tip review; preserve approved/rejected status if existing
        const { data: existing } = await supabase
          .from('tip_reviews')
          .select('id, status')
          .eq('item_key', key)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'pending') {
            await supabase.from('tip_reviews').update({ original_text: text, approved_text: text }).eq('id', existing.id);
          }
        } else {
          await supabase.from('tip_reviews').insert({
            id: crypto.randomUUID(),
            patient_id: patient.id,
            patient_name: patient.name,
            patient_email: patient.email,
            date,
            category: rec.category,
            item_index: i,
            item_key: key,
            original_text: text,
            approved_text: text,
            status: 'pending',
            created_at: now,
          });
        }
      }
    }

    return this.getTipReviews();
  },

  async setTipStatus(
    id: string,
    status: 'approved' | 'rejected',
    approvedText: string,
    reviewedBy: string
  ): Promise<boolean> {
    if (!supabase) return false;
    const { error } = await supabase.from('tip_reviews').update({
      status,
      approved_text: approvedText,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    return !error;
  },

  async setTipGroup(
    key: string,
    status: 'approved' | 'rejected',
    block: string,
    reviewedBy: string
  ): Promise<boolean> {
    if (!supabase) return false;
    const prefix = `${key}|`;
    const { data: rows, error } = await supabase
      .from('tip_reviews')
      .select('id, item_index')
      .like('item_key', `${prefix}%`)
      .order('item_index', { ascending: true });

    if (error || !rows) return false;

    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      await supabase.from('tip_reviews').update({
        status: i === 0 ? status : 'rejected',
        approved_text: i === 0 ? (block || '').trim() : '',
        reviewed_by: reviewedBy,
        reviewed_at: now,
      }).eq('id', row.id);
    }
    return true;
  },
};
