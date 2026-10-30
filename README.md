# Smart Exam Platform (PERN Stack)

A role-based online examination platform built with React, Express, PostgreSQL, and Supabase.

Faculty members create exams, manage students and questions, run live exams, monitor participants, handle violations, and export question assignments. Students join with their roll number, password, and exam code, then complete a monitored fullscreen exam session.

## Overview

This project migrates a PHP/MySQL exam platform to a modern PERN architecture:

- **PostgreSQL** — managed application database through Supabase
- **Express.js** — REST API and authorization middleware
- **React + Vite** — faculty and student interfaces
- **Node.js** — backend runtime
- **Supabase Auth** — faculty authentication

## Features

### Faculty

- Sign up and sign in through Supabase Auth
- Create, update, start, and end exams
- Set duration and the maximum violation count
- Generate a unique six-character exam code
- Add students individually or import them from CSV/XLSX
- Reset or delete student accounts
- Add, edit, delete, or import questions
- Preview DOCX imports before confirmation
- Monitor sessions, activity, violations, and locking state
- Lock or unlock individual students
- Export student-to-question assignments

### Student

- Log in with roll number and password
- Join a live exam by code
- Receive a least-used question assignment with random tie-breaking
- Follow a shared countdown based on the exam start time
- Enter fullscreen before starting
- Record tab switches, window blur, and fullscreen exits as violations
- Lock automatically after the configured violation limit
- Detect kicked or invalidated sessions

### Security and Monitoring

- Three-second REST polling for live state
- Student heartbeat and last-seen tracking
- Transactional, row-lock-safe question assignment
- Single-session enforcement through rotating session tokens
- Separate student JWT and per-exam session tokens
- Faculty and student authorization middleware
- RLS enabled on all Supabase application tables
- Upload size limits for DOCX and XLSX imports

## Architecture

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18, React Router, Vite 5 | Faculty and student UI |
| Backend | Node.js, Express 4 | REST API and business logic |
| Database | Supabase PostgreSQL | Accounts, exams, questions, sessions, violations |
| Faculty auth | Supabase Auth | Email/password login and access tokens |
| Student auth | bcrypt, JWT | Student credentials and session authentication |
| Imports | Multer, JSZip | DOCX/XLSX/CSV uploads and parsing |
| Database client | `pg` | Queries, transactions, and connection pooling |

## Database Schema

Apply both migration files in order through the Supabase SQL Editor:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_security_fixes.sql`

| Table | Purpose |
|---|---|
| `profiles` | Faculty and student accounts |
| `exams` | Exam settings, status, code, owner, and start time |
| `questions` | Questions belonging to exams |
| `exam_sessions` | One session per student per exam; includes assigned question and violations |
| `violation_log` | Violation reason and timestamp for each session |

The second migration removes permissive public RLS policies, keeps RLS enabled, and adds indexes used by dashboard, login, monitor, and session queries.

## Project Structure

```text
exam-pern/
├── backend/
│   ├── src/
│   │   ├── config.js              # Environment configuration
│   │   ├── db.js                  # PostgreSQL connection pool
│   │   ├── app.js                 # Express setup and routes
│   │   ├── server.js              # Server entry point
│   │   ├── middleware/auth.js     # Faculty and student authorization
│   │   └── routes/
│   │       ├── auth.js            # Faculty profile and student login
│   │       ├── faculty.js         # Exam, question, student, and monitor APIs
│   │       └── student.js         # Exam state and violation APIs
│   ├── scripts/check-db.js        # Database connectivity check
│   ├── scripts/e2e.js             # End-to-end API workflow
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── lib/                   # Supabase and API helpers
│   │   ├── components/            # Shared UI component
│   │   ├── pages/                 # Login, dashboard, monitor, and exam screens
│   │   ├── App.jsx                # Router and role guards
│   │   └── main.jsx
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
├── supabase/migrations/
│   ├── 001_initial_schema.sql
│   └── 002_security_fixes.sql
├── DEPLOYMENT.md
├── .gitignore
└── README.md
```

## Prerequisites

- Node.js 18 or newer
- npm
- A Supabase project
- Windows PowerShell or another terminal

## Local Setup (Windows)

### 1. Configure Supabase

Create a Supabase project. In the SQL Editor, run:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_security_fixes.sql
```

Run both files in the order shown.

### 2. Configure the backend

```powershell
Copy-Item backend\.env.example backend\.env
```

Update `backend/.env`:

```env
PORT=5000
BASE_URL=http://localhost:5000

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_JWT_SECRET=your_supabase_jwt_secret
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key

DATABASE_URL=postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres

STUDENT_JWT_SECRET=replace_with_a_long_random_secret
MAX_DOCX_SIZE=5242880
MAX_XLSX_SIZE=2097152
DEBUG=false
```

Get the Supabase values from **Project Settings > API** and **Project Settings > Database**. Use the pooled PostgreSQL connection string where available.

### 3. Configure the frontend

```powershell
Copy-Item frontend\.env.example frontend\.env
```

Update `frontend/.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_BASE=/api
VITE_AUTH_BASE=/auth
```

### 4. Install dependencies

Backend:

```powershell
cd backend
npm install
```

Frontend, in a second terminal:

```powershell
cd frontend
npm install
```

### 5. Start the servers

Backend:

```powershell
cd backend
npm start
```

Frontend:

```powershell
cd frontend
npm run dev
```

URLs:

```text
Backend health:  http://localhost:5000/health
Backend API:     http://localhost:5000
Frontend:        http://localhost:3000
Faculty login:   http://localhost:3000/faculty/login
Student login:   http://localhost:3000/student/login
```

Restart both servers after changing environment files.

## Manual Test Flow

1. Open the faculty login page and sign up or sign in with Supabase Auth.
2. Create an exam from the faculty dashboard.
3. Add students manually or import them from CSV/XLSX. The current default password is the username/roll number.
4. Add questions manually or import and confirm a DOCX file.
5. Start the exam.
6. Open the student login page in a separate browser profile or incognito window.
7. Enter the roll number, password, and six-character exam code.
8. Enter fullscreen mode to start the assigned exam.
9. Test tab switches, window blur, and fullscreen exits.
10. Use the live monitor to lock/unlock students or observe their status.
11. End the exam when testing is complete.

## API Surface

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/faculty/profile` | Create or update the current faculty profile |
| POST | `/auth/student/login` | Authenticate a student and issue tokens |
| POST | `/auth/logout` | Logout acknowledgement |

### Faculty

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/api/faculty/exams` | List or create exams |
| GET/PATCH/DELETE | `/api/faculty/exams/:examId` | Read, update, or delete an exam |
| POST | `/api/faculty/exams/:examId/start` | Start an exam |
| POST | `/api/faculty/exams/:examId/end` | End an exam |
| POST | `/api/faculty/questions/import-docx` | Preview DOCX import |
| POST | `/api/faculty/questions/import-docx/confirm` | Confirm DOCX import |
| POST/PUT/DELETE | `/api/faculty/questions...` | Add, update, or delete questions |
| POST | `/api/faculty/students` | Create a student |
| POST | `/api/faculty/students/import` | Import students |
| POST | `/api/faculty/students/:id/reset` | Reset a student password |
| DELETE | `/api/faculty/students/:id` | Delete a student |
| GET | `/api/faculty/students` | List students |
| POST | `/api/faculty/action` | Lock or unlock a session |
| GET | `/api/faculty/state` | Poll live monitor state |
| GET | `/api/faculty/exams/:examId/export-assignments` | Export assignments |

### Student

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/student/dashboard-state` | Read dashboard state |
| POST | `/api/student/enter` | Join the exam and assign a question |
| GET | `/api/student/state` | Poll exam state |
| POST | `/api/student/leave` | Record leave/heartbeat activity |
| POST | `/api/student/violation` | Record a violation |

## Verification Commands

Check database connectivity and required tables:

```powershell
cd backend
npm run check-db
```

A successful check ends with:

```text
DB connectivity check: PASS
```

Run the automated end-to-end workflow:

```powershell
cd backend
npm run e2e
```

The script creates a temporary faculty account, validates core workflows, prints PASS/FAIL results, and attempts cleanup.

Build and preview the frontend:

```powershell
cd frontend
npm run build
npm run preview
```

## Deployment

See `DEPLOYMENT.md` for Render, Vercel, and Netlify guidance.

Recommended production setup:

- Render Web Service for the Express backend
- Vercel or Netlify for the React frontend
- Supabase for PostgreSQL and faculty authentication

Before production deployment:

- Use strong, unique values for `STUDENT_JWT_SECRET`, database credentials, and the Supabase service-role key
- Keep the service-role key backend-only
- Use HTTPS and the Supabase pooled database connection
- Configure CORS restrictions and login rate limiting
- Keep `DEBUG=false`
- Use uptime monitoring for live exams because service restarts can interrupt participants

## Security Notes

- Never commit `.env` files or the Supabase service-role key.
- RLS is enabled on all application tables.
- Faculty authentication uses Supabase access tokens verified by the backend.
- Student sessions use a JWT plus a rotating per-exam session token.
- Re-login invalidates previous browser sessions associated with the student.
- Student passwords should be treated as credentials, even though the current default sets password equal to roll number.
- Public or high-stakes deployments should add rate limiting, stronger password rules, audit logging, and stricter browser controls.

## Troubleshooting

| Problem | Resolution |
|---|---|
| Database connection fails | Verify `DATABASE_URL` and confirm the Supabase project is active |
| Tables are missing | Run both migration files in order |
| Faculty token is rejected | Confirm all Supabase environment values belong to the same project |
| Student login fails | Verify the student profile and password hash |
| Frontend cannot reach the API | Confirm ports 3000 and 5000 and the Vite proxy configuration |
| DOCX import returns no questions | Use a valid `.docx` smaller than `MAX_DOCX_SIZE` |
| Hosted backend sleeps | Use a paid service tier or ping `/health` regularly |

## License

No license file is currently included. Add a license before distributing the project publicly.
