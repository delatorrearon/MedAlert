-- ==============================================================================
-- MedAlert PostgreSQL Schema for Supabase
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your Project -> Click "SQL Editor" in the left sidebar
-- 3. Click "New Query", paste this entire script, and click "Run"
-- ==============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  profile_complete BOOLEAN NOT NULL DEFAULT FALSE
);

-- 2. USER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  age INT NOT NULL DEFAULT 0,
  gender TEXT DEFAULT '',
  weight REAL NOT NULL DEFAULT 0,
  height REAL NOT NULL DEFAULT 0,
  smoking TEXT DEFAULT 'never',
  alcohol TEXT DEFAULT 'rarely',
  diet_type TEXT DEFAULT 'balanced',
  vegetable_intake TEXT DEFAULT 'daily',
  fruit_intake TEXT DEFAULT 'daily',
  processed_food TEXT DEFAULT 'sometimes',
  activity_level TEXT DEFAULT 'moderate',
  goal TEXT DEFAULT 'maintain' CHECK (goal IN ('lose', 'maintain', 'gain')),
  medical_conditions JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. DAILY LOGS TABLE
CREATE TABLE IF NOT EXISTS public.daily_logs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  sleep_hours REAL NOT NULL DEFAULT 0,
  exercise_minutes INT NOT NULL DEFAULT 0,
  water_intake INT NOT NULL DEFAULT 0,
  caffeine_intake INT NOT NULL DEFAULT 0,
  weight REAL NULL,
  track_weight BOOLEAN DEFAULT FALSE,
  calories INT NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fats REAL NOT NULL DEFAULT 0,
  food_quality TEXT NULL,
  meals JSONB DEFAULT '[]'::jsonb,
  track_macros BOOLEAN DEFAULT FALSE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_logs_user_date_unique UNIQUE (user_id, date)
);

-- 4. ML SNAPSHOTS TABLE
CREATE TABLE IF NOT EXISTS public.ml_snapshots (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  overall_score REAL NOT NULL DEFAULT 0,
  cardiovascular REAL NOT NULL DEFAULT 0,
  metabolic REAL NOT NULL DEFAULT 0,
  nutritional REAL NOT NULL DEFAULT 0,
  sleep REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ml_snapshots_user_date_unique UNIQUE (user_id, date)
);

-- 5. DOCTOR TIP REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.tip_reviews (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  patient_name TEXT NOT NULL,
  patient_email TEXT NOT NULL,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  item_index INT NOT NULL DEFAULT 0,
  item_key TEXT NOT NULL UNIQUE,
  original_text TEXT NOT NULL,
  approved_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- Ensures patient data isolation and role-based doctor access.
-- Protects against unauthorized cross-user access and sensitive data exposure.
-- ==============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_reviews ENABLE ROW LEVEL SECURITY;

-- 1. Drop existing insecure open policies
DROP POLICY IF EXISTS "Public full access to users" ON public.users;
DROP POLICY IF EXISTS "Public full access to user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Public full access to daily_logs" ON public.daily_logs;
DROP POLICY IF EXISTS "Public full access to ml_snapshots" ON public.ml_snapshots;
DROP POLICY IF EXISTS "Public full access to tip_reviews" ON public.tip_reviews;

-- Drop previous hardened policies to ensure clean execution
DROP POLICY IF EXISTS "Users can read own record or doctors read roster" ON public.users;
DROP POLICY IF EXISTS "Users can insert own record" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;

DROP POLICY IF EXISTS "Users can read own profile or doctors read patient profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;

DROP POLICY IF EXISTS "Users can read own logs or doctors read patient logs" ON public.daily_logs;
DROP POLICY IF EXISTS "Users can insert own logs" ON public.daily_logs;
DROP POLICY IF EXISTS "Users can update own logs" ON public.daily_logs;
DROP POLICY IF EXISTS "Users can delete own logs" ON public.daily_logs;

DROP POLICY IF EXISTS "Users can read own snapshots or doctors read patient snapshots" ON public.ml_snapshots;
DROP POLICY IF EXISTS "Users can insert own snapshots" ON public.ml_snapshots;
DROP POLICY IF EXISTS "Users can update own snapshots" ON public.ml_snapshots;

DROP POLICY IF EXISTS "Patients read own tips or doctors read all tips" ON public.tip_reviews;
DROP POLICY IF EXISTS "Patients and doctors can insert tips" ON public.tip_reviews;
DROP POLICY IF EXISTS "Only doctors can update tip review decisions" ON public.tip_reviews;

-- Helper function: verify if the calling user has doctor role
CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'doctor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 1. USERS TABLE POLICIES ─────────────────────────────────────────────────
-- Read: Patient views own record; Doctor views patient roster
CREATE POLICY "Users can read own record or doctors read roster" ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_doctor());

-- Insert: Self-registration (anon or authenticated user matching id)
CREATE POLICY "Users can insert own record" ON public.users
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (auth.uid() = id OR auth.uid() IS NULL);

-- Update: Patient or Doctor updates only their own record
CREATE POLICY "Users can update own record" ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─── 2. USER PROFILES TABLE POLICIES ──────────────────────────────────────────
-- Read: Patient views own profile; Doctor views patient profile
CREATE POLICY "Users can read own profile or doctors read patient profiles" ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_doctor());

-- Insert: Patient creates own profile
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: Patient modifies own profile
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 3. DAILY LOGS TABLE POLICIES ─────────────────────────────────────────────
-- Read: Patient views own logs; Doctor views patient logs
CREATE POLICY "Users can read own logs or doctors read patient logs" ON public.daily_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_doctor());

-- Insert: Patient inserts own daily log
CREATE POLICY "Users can insert own logs" ON public.daily_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: Patient updates own daily log
CREATE POLICY "Users can update own logs" ON public.daily_logs
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete: Patient deletes own daily log
CREATE POLICY "Users can delete own logs" ON public.daily_logs
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── 4. ML SNAPSHOTS TABLE POLICIES ───────────────────────────────────────────
-- Read: Patient views own snapshots; Doctor views patient snapshots
CREATE POLICY "Users can read own snapshots or doctors read patient snapshots" ON public.ml_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_doctor());

-- Insert: Patient records own ML snapshot
CREATE POLICY "Users can insert own snapshots" ON public.ml_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update: Patient updates own ML snapshot
CREATE POLICY "Users can update own snapshots" ON public.ml_snapshots
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 5. TIP REVIEWS TABLE POLICIES ────────────────────────────────────────────
-- Read: Patient views only their own tips; Doctor views all tips across patients
CREATE POLICY "Patients read own tips or doctors read all tips" ON public.tip_reviews
  FOR SELECT
  TO authenticated
  USING (auth.uid() = patient_id OR public.is_doctor());

-- Insert: Patient syncs generated tips, or Doctor creates tip
CREATE POLICY "Patients and doctors can insert tips" ON public.tip_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = patient_id OR public.is_doctor());

-- Update: STRICTLY DOCTORS ONLY — patients cannot alter review status or approval text
CREATE POLICY "Only doctors can update tip review decisions" ON public.tip_reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_doctor())
  WITH CHECK (public.is_doctor());
