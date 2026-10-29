# Smart Exam Platform — PERN Stack (Supabase PostgreSQL)

This is a **PERN** migration of the original PHP + MySQL exam platform.
- **P**ostgreSQL (Supabase)
- **E**xpress.js (Node.js)
- **R**eact (Vite)
- **N**ode.js

The original PHP repository at `exam/` is **not modified**. This project lives in a separate `exam-pern/` folder.

---

## Architecture

| Layer | Technology | Notes |
|-------|-----------|-------|
| Database | Supabase PostgreSQL | 5 tables: `profiles`, `exams`, `questions`, `exam_sessions`, `violation_log` |
| Auth (Faculty) | Supabase Auth (email/password) | Express verifies Supabase JWT via `jsonwebtoken` + `SUPABASE_JWT_SECRET` |
| Auth (Student) | Custom Express route | Students are ingested by faculty into `profiles`; login = roll number + password (password == username by design, bcrypt cost 8) |
| Backend | Express + `pg` + `multer` + `bcryptjs` | REST API, 3-second polling preserved |
| Frontend | React + Vite + `@supabase/supabase-js` | Polling (3s), fullscreen gating, violation detection |

---

## Folder Structure

```
exam-pern/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql   # Run this in Supabase SQL Editor
├── backend/
│   ├── .env.example                 # Copy to .env and fill values
│   ├── package.json
│   ├── src/
│   │   ├── config.js
│   │   ├── db.js                    # pg pool
│   │   ├── middleware/
│   │   │   └── auth.js              # verifyFaculty (Supabase JWT), verifyStudent (token)
│   │   ├── routes/
│   │   │   ├── auth.js              # faculty profile, student login, logout
│   │   │   ├── faculty.js           # exams, questions, students, actions, monitor state
│   │   │   └── student.js           # dashboard-state, enter, state, violation
│   │   ├── app.js
│   │   └── server.js
│   └── uploads/                     # multer local uploads (temporary, before Supabase Storage)
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── lib/supabase.js
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/
│       │   ├── FacultyLogin.jsx
│       │   ├── FacultyDashboard.jsx
│       │   ├── QuestionsEditor.jsx
│       │   ├── StudentsManager.jsx
│       │   ├── LiveMonitor.jsx
│       │   ├── StudentLogin.jsx
│       │   ├── StudentDashboard.jsx
│       │   └── ExamScreen.jsx
│       └── (components inline)
├── README.md
└── DEPLOYMENT.md
```

---

## Database Setup (Supabase PostgreSQL)

Run the following SQL in your Supabase project's **SQL Editor**:

```sql
-- Contents of exam-pern/supabase/migrations/001_initial_schema.sql
```

The file contains the full schema with:
- `profiles` — faculty (linked to Supabase `auth.users`) and students (standalone, bcrypt password)
- `exams` — exam metadata, 6-char hex code, draft/live/ended status
- `questions` — question bank per exam
- `exam_sessions` — one row per student per exam, single-session token
- `violation_log` — audit trail

Row Level Security is enabled but the Express backend uses the Supabase `service_role` key and bypasses RLS.

---

## Backend Setup

```bash
cd exam-pern/backend
cp .env.example .env
# Edit .env with your Supabase values
npm install
npm start
```

### Required `.env` values

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase Settings > API |
| `SUPABASE_JWT_SECRET` | Supabase Settings > API > JWT Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings > API > service_role key |
| `DATABASE_URL` | Supabase Settings > Database > Connection string (pooled or direct) |
| `STUDENT_JWT_SECRET` | Any random string (for custom student session JWT) |
| `PORT` | `5000` (default) |

---

## Frontend Setup

```bash
cd exam-pern/frontend
npm install
npm run dev          # http://localhost:3000
```

Create a `.env` in `frontend/` if needed:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_BASE=/api
VITE_AUTH_BASE=/auth
```

The `vite.config.js` already proxies `/api` and `/auth` to `http://localhost:5000` for local development.

---

## How to Use

### Faculty
1. Go to `/faculty/login`, sign up or sign in with Supabase Auth (email/password).
2. Create an exam (title, duration, max violations). A 6-character exam code is generated.
3. Go to `/faculty/students`, add students manually or import `.xlsx`/`.csv` (Column A = username/roll number, Column B = full name).
   - Student password == username by design.
4. Go to `/faculty/questions/:examId`, add questions manually or import `.docx`.
5. Go to `/faculty/monitor/:examId`, click **Start exam** when ready.
6. Monitor students: online dots, violations, lock/unlock per student.

### Student
1. Go to `/student/login`, enter username (roll number), password (same as username), and exam code.
2. Wait on the dashboard until faculty starts the exam.
3. Click **Enter fullscreen & show my question**. One question is assigned.
4. Do not switch tabs or leave fullscreen — violations are counted and auto-lock after `max_violations`.

---

## Migration Notes (from PHP)

Preserved:
- One question per student, least-used-first assignment with random tie-break
- Shared exam clock: `started_at + duration_min` for all students
- Violation-based auto-lock after `max_violations`
- Faculty live monitor (online, violations, lock/unlock, start/end)
- `.docx` question import with preview-and-confirm
- `.xlsx`/`.csv` student import
- 6-character hex exam codes
- 3-second REST polling
- Single-session token kick-out (re-login rotates token)

Changed:
- PHP sessions → Supabase Auth for faculty + custom JWT/token for students
- MySQL → Supabase PostgreSQL
- Pure-PHP zip reading → `jszip` in Node
- Vanilla PHP/JS frontend → React + Vite

---

## Known Differences from Original PHP

- Student login is a two-step flow: (1) authenticate via `/auth/student/login`, (2) join exam via `/api/student/enter` with exam code.
- Faculty signup creates a Supabase Auth account first, then the backend creates the matching `profiles` row.
- The original `setup.php` installer is **not ported** — you run the SQL schema manually in Supabase.
- Zip-bomb protection: file size caps enforced (5 MB docx, 2 MB xlsx/csv).
- macOS `Cmd` key is now blocked in addition to `Ctrl` (fixes a PHP bug).

---

## Testing Checklist

1. [ ] Supabase schema created, tables exist
2. [ ] Faculty can sign up/in via Supabase Auth
3. [ ] Faculty can create an exam (6-char code generated)
4. [ ] Faculty can add students manually and via `.xlsx`/`.csv` import
5. [ ] Student login with roll number + password works
6. [ ] Student joins exam with code, question assigned
7. [ ] Faculty monitor shows students online/offline, violations
8. [ ] Tab switch / blur / fullscreen exit records a violation
9. [ ] Auto-lock after `max_violations`
10. [ ] Faculty can lock/unlock individual students
11. [ ] Exam end ends for all students

---

## Deployment

See `DEPLOYMENT.md` for Render / keep-alive instructions.
