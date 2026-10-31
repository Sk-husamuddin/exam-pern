-- Migration 005: Ultra-fast atomic student enter function
-- Eliminates multiple network round-trips under the advisory lock.

CREATE OR REPLACE FUNCTION fn_student_enter_exam(
  p_exam_code TEXT,
  p_user_id UUID,
  p_token TEXT,
  p_wants_start BOOLEAN
)
RETURNS TABLE (
  session_id BIGINT,
  token TEXT,
  login_order INT,
  locked BOOLEAN,
  violations INT,
  seconds_left INT,
  status TEXT,
  title TEXT,
  duration_min INT,
  max_violations INT,
  entered BOOLEAN,
  entered_at_epoch BIGINT,
  assigned_q_ids INT[],
  questions_json JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_exam RECORD;
  v_session RECORD;
  v_num_questions INT;
  v_pick_ids INT[];
  v_questions_json JSONB := '[]'::JSONB;
  v_now_epoch BIGINT;
  v_entered_epoch BIGINT;
  v_elapsed BIGINT;
  v_seconds_left INT;
  v_exam_status TEXT;
  v_has_assigned BOOLEAN;
BEGIN
  -- 1. Find exam
  SELECT e.id, e.title, e.code, e.status, e.duration_min, e.max_violations, e.questions_per_student
  INTO v_exam
  FROM exams e
  WHERE UPPER(e.code) = UPPER(TRIM(p_exam_code)) AND e.status <> 'ended';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_EXAM';
  END IF;

  -- 2. Transaction-scoped advisory lock on exam id (serializes concurrent entries for the SAME exam in microseconds)
  PERFORM pg_advisory_xact_lock(v_exam.id);

  -- 3. Upsert session row atomically
  INSERT INTO exam_sessions (
    exam_id, user_id, login_order, login_time, token, last_seen, entered_at
  )
  VALUES (
    v_exam.id,
    p_user_id,
    (SELECT COALESCE(MAX(es.login_order), 0) + 1 FROM exam_sessions es WHERE es.exam_id = v_exam.id),
    now(),
    p_token,
    now(),
    CASE WHEN p_wants_start THEN now() ELSE NULL END
  )
  ON CONFLICT (exam_id, user_id) DO UPDATE
  SET token = COALESCE(exam_sessions.token, EXCLUDED.token),
      last_seen = now(),
      entered_at = CASE
        WHEN exam_sessions.entered_at IS NOT NULL THEN exam_sessions.entered_at
        WHEN p_wants_start THEN now()
        ELSE NULL
      END
  RETURNING
    exam_sessions.id,
    exam_sessions.token,
    exam_sessions.login_order,
    exam_sessions.q_id,
    exam_sessions.assigned_q_ids,
    exam_sessions.locked,
    exam_sessions.violations,
    EXTRACT(EPOCH FROM exam_sessions.entered_at)::BIGINT
  INTO v_session;

  v_now_epoch := EXTRACT(EPOCH FROM now())::BIGINT;
  v_entered_epoch := v_session.entered_at;
  v_elapsed := CASE WHEN v_entered_epoch IS NOT NULL THEN v_now_epoch - v_entered_epoch ELSE 0 END;
  v_num_questions := GREATEST(1, COALESCE(v_exam.questions_per_student, 1));
  v_has_assigned := (v_session.q_id IS NOT NULL) OR (v_session.assigned_q_ids IS NOT NULL AND array_length(v_session.assigned_q_ids, 1) > 0);

  -- 4. Question assignment (if exam is live, student wants start, time remains, and not assigned yet)
  IF v_exam.status = 'live' AND p_wants_start AND (v_elapsed < v_exam.duration_min * 60) THEN
    IF NOT v_has_assigned THEN
      -- Pick least used questions
      SELECT array_agg(sub.id ORDER BY sub.q_no)
      INTO v_pick_ids
      FROM (
        SELECT q.id, q.q_no
        FROM questions q
        LEFT JOIN exam_sessions es ON (es.exam_id = v_exam.id AND (es.q_id = q.id OR q.id = ANY(es.assigned_q_ids)))
        WHERE q.exam_id = v_exam.id
        GROUP BY q.id, q.q_no
        ORDER BY COUNT(es.id) ASC, RANDOM()
        LIMIT v_num_questions
      ) sub;

      IF v_pick_ids IS NOT NULL AND array_length(v_pick_ids, 1) > 0 THEN
        UPDATE exam_sessions
        SET q_id = v_pick_ids[1],
            assigned_q_ids = v_pick_ids
        WHERE id = v_session.id;

        v_session.q_id := v_pick_ids[1];
        v_session.assigned_q_ids := v_pick_ids;
        v_has_assigned := true;
      END IF;
    END IF;
  END IF;

  -- 5. Fetch questions JSON if assigned
  IF v_has_assigned THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'position', q.q_no,
        'body', q.body
      ) ORDER BY q.q_no ASC
    )
    INTO v_questions_json
    FROM questions q
    WHERE q.id = ANY(COALESCE(v_session.assigned_q_ids, ARRAY[v_session.q_id]))
      AND q.exam_id = v_exam.id;
  END IF;

  -- 6. Compute exam status and seconds_left
  v_exam_status := v_exam.status;
  IF v_exam.status = 'live' THEN
    IF v_entered_epoch IS NULL THEN
      v_seconds_left := v_exam.duration_min * 60;
    ELSE
      v_seconds_left := GREATEST(0, (v_exam.duration_min * 60) - v_elapsed);
      IF v_elapsed >= v_exam.duration_min * 60 THEN
        v_exam_status := 'ended';
      END IF;
    END IF;
  ELSE
    v_seconds_left := NULL;
  END IF;

  RETURN QUERY SELECT
    v_session.id,
    v_session.token,
    v_session.login_order,
    v_session.locked,
    v_session.violations,
    v_seconds_left,
    v_exam_status,
    v_exam.title,
    v_exam.duration_min,
    v_exam.max_violations,
    (v_has_assigned AND v_entered_epoch IS NOT NULL),
    v_entered_epoch,
    v_session.assigned_q_ids,
    COALESCE(v_questions_json, '[]'::JSONB);
END;
$$;
