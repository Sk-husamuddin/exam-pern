-- Migration 004: Concurrency Hardening and Query Optimization

-- 1. Ensure composite unique constraint on (exam_id, user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_sessions_exam_id_user_id_key'
      AND conrelid = 'exam_sessions'::regclass
  ) THEN
    ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_exam_id_user_id_key UNIQUE (exam_id, user_id);
  END IF;
END $$;

-- 2. Ensure composite unique constraint on (exam_id, login_order)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exam_sessions_exam_id_login_order_key'
      AND conrelid = 'exam_sessions'::regclass
  ) THEN
    ALTER TABLE exam_sessions ADD CONSTRAINT exam_sessions_exam_id_login_order_key UNIQUE (exam_id, login_order);
  END IF;
END $$;

-- 3. Composite indexes for fast live monitoring and polling
CREATE INDEX IF NOT EXISTS idx_sessions_exam_lastseen ON exam_sessions(exam_id, last_seen);
CREATE INDEX IF NOT EXISTS idx_violation_log_session_id ON violation_log(session_id);

