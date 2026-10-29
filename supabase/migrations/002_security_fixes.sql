-- ============================================================
-- 002_security_fixes.sql
-- Run in Supabase SQL Editor AFTER 001_initial_schema.sql.
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Drop permissive select_all policies (Express backend uses direct pg
--    connection with service_role, bypassing RLS; the public anon key
--    must NOT be able to read password_hash or exam data).
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_all'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS profiles_select_all ON public.profiles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exams' AND policyname = 'exams_select_all'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS exams_select_all ON public.exams';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'questions' AND policyname = 'questions_select_all'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS questions_select_all ON public.questions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exam_sessions' AND policyname = 'sessions_select_all'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS sessions_select_all ON public.exam_sessions';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'violation_log' AND policyname = 'violations_select_all'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS violations_select_all ON public.violation_log';
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 2. Ensure RLS is enabled on all tables (no anon/authenticated policies
--    added — the backend bypasses RLS via service_role).
-- ------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.violation_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------
-- 3. Unique index on lower(username) for students (case-insensitive uniqueness).
-- ------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower_student
  ON public.profiles (lower(username))
  WHERE role = 'student';

-- ------------------------------------------------------------------
-- 4. Missing indexes used by routes/*.js queries.
-- ------------------------------------------------------------------
-- exams: faculty_id + status (dashboard list, own_exam)
CREATE INDEX IF NOT EXISTS idx_exams_faculty_status ON public.exams (faculty_id, status);

-- questions: exam_id + q_no (listing, assignment)
CREATE INDEX IF NOT EXISTS idx_questions_exam_qno ON public.questions (exam_id, q_no);

-- exam_sessions: exam_id + user_id (single session), exam_id + login_order (monitor)
CREATE INDEX IF NOT EXISTS idx_sessions_exam_user ON public.exam_sessions (exam_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exam_order ON public.exam_sessions (exam_id, login_order);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.exam_sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON public.exam_sessions (last_seen);

-- violation_log: session_id (last reason lookup)
CREATE INDEX IF NOT EXISTS idx_violation_log_session ON public.violation_log (session_id);

-- profiles: role + username (student login lookup)
CREATE INDEX IF NOT EXISTS idx_profiles_role_username ON public.profiles (role, username);

-- ------------------------------------------------------------------
-- 5. Confirm no public/anon select policies remain.
-- ------------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Remaining public policies:';
END $$;

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
