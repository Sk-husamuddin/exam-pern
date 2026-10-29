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
| Auth (Faculty) | Supabase Auth (email/password) | Express validates tokens via `GET /auth/v1/user` (algorithm-agnostic, works with RS256/ECC P-256) |
| Auth (Student) | Custom Express route | Students ingested by faculty into `profiles`; login = roll number + password (password == username by design, bcrypt cost 8) |
| Backend | Express + `pg` + `multer` + `bcryptjs` | REST API, 3-second polling preserved |
| Frontend | React + Vite + `@supabase/supabase-js` | Polling (3s), fullscreen gating, violation detection |

---

## Folder Structure

```
exam-pern/
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   # Run FIRST in Supabase SQL Editor
│       └── 002_security_fixes.sql   # Run SECOND (drops permissive RLS policies, adds indexes)
├── backend/
│   ├── .env.example                 # Copy to .env and fill values
│   ├── .env                         # YOUR SECRETS — never commit
│   ├── package.json                 # scripts: start, dev, check-db, e2e
│   ├── src/
│   │   ├── config.js
│   │   ├── db.js                    # pg pool
│   │   ├── middleware/
│   │   │   └── auth.js              # verifyFaculty (Supabase /auth/v1/user), verifyStudentJwt, verifyStudentSession
│   │   ├── routes/
│   │   │   ├── auth.js              # faculty profile, student login, logout
│   │   │   ├── faculty.js           # exams, questions, students, actions, monitor state
│   │   │   └── student.js           # dashboard-state, enter, state, violation
│   │   ├── app.js
│   │   └── server.js
│   ├── scripts/
│   │   ├── check-db.js              # npm run check-db
│   │   └── e2e.js                   # npm run e2e
│   └── uploads/                     # multer local uploads (temporary)
├── frontend/
│   ├── .env.example                 # Copy to .env and fill values
│   ├── .env                         # YOUR SECRETS — never commit
│   ├── package.json
│   ├── vite.config.js               # proxies /api and /auth to localhost:5000
│   ├── index.html
│   └── src/
│       ├── lib/
│       │   ├── supabase.js          # supabase client + API_BASE / AUTH_BASE
│       │   └── api.js               # shared fetch helper with token + 401 refresh
│       ├── main.jsx
│       ├── App.jsx                  # createBrowserRouter with future flags (v7)
│       └── pages/
│           ├── FacultyLogin.jsx
│           ├── FacultyDashboard.jsx
│           ├── QuestionsEditor.jsx
│           ├── StudentsManager.jsx
│           ├── LiveMonitor.jsx
│           ├── StudentLogin.jsx
│           ├── StudentDashboard.jsx
│           └── ExamScreen.jsx
├── .gitignore                       # excludes .env, node_modules, dist, etc.
├── README.md
└── DEPLOYMENT.md
```

---

## Windows Setup — Step by Step

### Prerequisites
- Node.js 18+ installed
- A Supabase project created

### 1. Apply database schema

Open **Supabase → SQL Editor** and run these two files **in order**:

1. `exam-pern/supabase/migrations/001_initial_schema.sql`
2. `exam-pern/supabase/migrations/002_security_fixes.sql`

### 2. Configure backend environment

Create `exam-pern/backend/.env` (copy from `.env.example` and fill in):

```env
PORT=5000
BASE_URL=http://localhost:5000

SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_JWT_SECRET=<from Settings > API > JWT Secret>
SUPABASE_SERVICE_ROLE_KEY=<from Settings > API > service_role key>
SUPABASE_ANON_KEY=<from Settings > API > anon public key>

# Get from Settings > Database > Connection string (pooled, e.g. aws-0-<region>.pooler.supabase.com:5432)
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

STUDENT_JWT_SECRET=<long random string, different from DB password>
MAX_DOCX_SIZE=5242880
MAX_XLSX_SIZE=2097152
DEBUG=false
```

### 3. Configure frontend environment

Create `exam-pern/frontend/.env`:

```env
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<from Settings > API > anon public key>
VITE_API_BASE=/api
VITE_AUTH_BASE=/auth
```

### 4. Install and start

**Backend** (one terminal):
```bash
cd exam-pern/backend
npm install
npm run check-db        # verifies DB connectivity + tables
npm start               # http://localhost:5000
```

**Frontend** (another terminal):
```bash
cd exam-pern/frontend
npm install
npm run dev             # http://localhost:3000
```

> Restart both servers after any `.env` change.

### 5. Verify DB check

```bash
cd exam-pern/backend
npm run check-db
```

Expected output: `DB connectivity check: PASS` with all 5 tables present.

### 6. Run automated E2E test

```bash
cd exam-pern/backend
npm run e2e
```

This creates a throwaway faculty account via Supabase Admin API, tests all modules, prints PASS/FAIL per step, then cleans up.

---

## Manual Click-Through (10 lines)

1. Open `http://localhost:3000/faculty/login` — sign up with email/password, confirm email if required, then sign in.
2. **Create exam**: enter title, duration, max violations → a 6-character code is generated.
3. **Add students**: go to `/faculty/students`, create manually or import `.xlsx`/`.csv` (Column A = username/roll number, Column B = name). Password == username.
4. **Add questions**: go to `/faculty/questions/:examId`, add manually or import `.docx` (preview then confirm).
5. **Start exam**: go to `/faculty/monitor/:examId`, click **Start exam**.
6. **Student login**: open a **second browser profile** (incognito) at `http://localhost:3000/student/login`, enter username, password (same as username), and exam code.
7. **Enter exam**: student clicks **Enter fullscreen & show my question** — one question is assigned.
8. **Violation**: student switches tabs or leaves fullscreen → violation recorded, auto-locks after `max_violations`.
9. **Lock/unlock**: faculty clicks **Lock** or **Unlock** on the student row in the monitor.
10. **End exam**: faculty clicks **End exam** → all students see "Exam ended".

---

## How It Works (Key Behaviors Preserved from PHP)

| Behavior | Implementation |
|----------|---------------|
| One question per student | Least-used question first, random tie-break, inside `BEGIN`/`COMMIT` with `FOR UPDATE` |
| Shared exam clock | `started_at + duration_min` — all students share one deadline |
| Violation auto-lock | Locks after `max_violations`; violation logged to `violation_log` |
| Single-session kick-out | Re-login rotates `exam_sessions.token`, invalidating the old browser |
| 3-second polling | REST polling preserved (`state.php`, `faculty_state.php` equivalents) |
| `.docx` / `.xlsx` import | Preview-and-confirm; server-side parsing with `jszip` |
| 6-character hex exam codes | Generated with `crypto.randomBytes` |

---

## Security Notes for Production

1. **Never commit `.env`** — add it to `.gitignore` (already done)
2. **`SUPABASE_SERVICE_ROLE_KEY`** bypasses RLS — keep it backend-only
3. **Use HTTPS** in production
4. **Set `DEBUG=false`** in production
5. **Rotate all secrets** (DB password, service role key, JWT secret, STUDENT_JWT_SECRET) before production use
6. `STUDENT_JWT_SECRET` must be a long random value, **different** from the DB password

---

## Testing Checklist

1. [ ] `npm run check-db` passes (all 5 tables)
2. [ ] Faculty can sign up/in via Supabase Auth
3. [ ] Faculty profile auto-created on first API call
4. [ ] Faculty can create an exam (6-char code generated)
5. [ ] Faculty can add students manually and via `.xlsx`/`.csv` import
6. [ ] Student login with roll number + password works
7. [ ] Student joins exam with code, question assigned
8. [ ] Faculty monitor shows students online/offline, violations
9. [ ] Tab switch / blur / fullscreen exit records a violation
10. [ ] Auto-lock after `max_violations`
11. [ ] Faculty can lock/unlock individual students
12. [ ] Exam end ends for all students
13. [ ] `npm run e2e` — all steps PASS

---

## Deployment

See `DEPLOYMENT.md` for Render / keep-alive instructions.
