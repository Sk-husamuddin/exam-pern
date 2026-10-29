-- ============================================================
-- Smart Exam Platform — Supabase PostgreSQL Schema
-- ============================================================
-- Run this entire block in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------
-- profiles
-- Faculty: linked to Supabase auth.users via auth_user_id
-- Students: standalone rows (no Supabase Auth account), password_hash = bcrypt(username)
-- ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null, -- faculty only
  username text unique,
  name text not null,
  role text not null check (role in ('student','faculty')),
  password_hash text, -- bcrypt hash for students; null for faculty (Supabase Auth handles it)
  created_at timestamptz default now()
);

-- ------------------------------------------------------------------
-- exams
-- ------------------------------------------------------------------
create table public.exams (
  id bigserial primary key,
  code text not null unique,
  title text not null,
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','live','ended')),
  duration_min int not null default 60 check (duration_min between 1 and 600),
  max_violations int not null default 3 check (max_violations between 1 and 20),
  started_at timestamptz null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------------
-- questions
-- ------------------------------------------------------------------
create table public.questions (
  id bigserial primary key,
  exam_id bigint not null references public.exams(id) on delete cascade,
  q_no int not null,
  body text not null,
  unique (exam_id, q_no)
);

-- ------------------------------------------------------------------
-- exam_sessions
-- One row per student per exam. token enforces single-session kick-out.
-- ------------------------------------------------------------------
create table public.exam_sessions (
  id bigserial primary key,
  exam_id bigint not null references public.exams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  login_order int not null,
  login_time timestamptz not null default now(),
  token text not null,
  q_id bigint null references public.questions(id) on delete set null,
  entered_at timestamptz null,
  violations int not null default 0,
  locked boolean not null default false,
  last_seen timestamptz null,
  unique (exam_id, user_id),
  unique (exam_id, login_order)
);

-- ------------------------------------------------------------------
-- violation_log
-- ------------------------------------------------------------------
create table public.violation_log (
  id bigserial primary key,
  session_id bigint not null references public.exam_sessions(id) on delete cascade,
  reason text not null,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------------
-- Row Level Security (Express backend uses service_role and bypasses RLS)
-- ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.questions enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.violation_log enable row level security;

create policy "profiles_select_all" on public.profiles for select using (true);
create policy "exams_select_all" on public.exams for select using (true);
create policy "questions_select_all" on public.questions for select using (true);
create policy "sessions_select_all" on public.exam_sessions for select using (true);
create policy "violations_select_all" on public.violation_log for select using (true);

-- Indexes for polling performance
create index idx_exam_sessions_exam_user on public.exam_sessions(exam_id, user_id);
create index idx_exam_sessions_last_seen on public.exam_sessions(last_seen);
create index idx_questions_exam on public.questions(exam_id);
create index idx_violation_log_session on public.violation_log(session_id);
