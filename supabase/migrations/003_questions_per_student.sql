-- ============================================================
-- Migration 003: Questions per student
-- Allows faculty to configure how many questions each student receives
-- ============================================================

ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS questions_per_student INT NOT NULL DEFAULT 1;

ALTER TABLE public.exam_sessions 
ADD COLUMN IF NOT EXISTS assigned_q_ids BIGINT[] DEFAULT NULL;
