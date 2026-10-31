# Deployment — Smart Exam Platform (PERN)

## Architecture Overview

- **Frontend**: React (Vite SPA) deployed on **Vercel** (`https://exam-pern.vercel.app`)
- **Backend**: Node.js / Express Web Service deployed on **Render** (`https://exam-pern.onrender.com`)
- **Database & Auth**: Managed PostgreSQL and Authentication on **Supabase**

---

## 1. Frontend Deployment (Vercel)

### Project Configuration
- **Root Directory**: `frontend` (in Vercel Project Settings > General > Root Directory)
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### SPA Routing & Redirects
To prevent 404 errors on direct navigation or page refresh for client-side routes (e.g. `/faculty/login`, `/student/login`, `/faculty/dashboard`), the repository includes:
- `frontend/vercel.json`:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
- `frontend/public/_redirects`:
  ```
  /* /index.html 200
  ```

### Environment Variables (Vercel)
Set the following four environment variables in **Vercel Project Settings > Environment Variables**:

| Variable | Value / Format | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | `ey...` | Supabase Anon Public Key |
| `VITE_API_BASE` | `https://exam-pern.onrender.com/api` | Backend API base URL |
| `VITE_AUTH_BASE` | `https://exam-pern.onrender.com/auth` | Backend Auth base URL |

*Note: If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing at build time, the frontend displays a visible "Configuration missing" screen rather than crashing with a blank page.*

---

## 2. Backend Deployment (Render)

### Render Web Service Settings
- **Root Directory**: `backend`
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Health Check Path**: `/health`

### Environment Variables (Render)
Configure in **Render Dashboard > Environment**:

| Variable | Required | Notes |
|---|---|---|
| `PORT` | Yes | Assigned automatically by Render (defaults to 5000 locally) |
| `BASE_URL` | Yes | `https://exam-pern.onrender.com` |
| `CORS_ORIGINS` | Yes | `http://localhost:3000,https://exam-pern.vercel.app` (comma-separated allowed origins) |
| `SUPABASE_URL` | Yes | From Supabase Settings > API |
| `SUPABASE_JWT_SECRET` | Yes | From Supabase Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | From Supabase Settings > API (keep secret!) |
| `DATABASE_URL` | Yes | Supabase connection string (use pooled `:6543` for connection pooling) |
| `STUDENT_JWT_SECRET` | Yes | Random secure 32+ character string |

### Keep-alive / Spin-down Prevention
Render free tier instances sleep after 15 minutes of inactivity. To prevent delays during exams:
- Use Render's paid plan, or
- Configure a monitor (e.g. UptimeRobot, cron-job.org) hitting `GET https://exam-pern.onrender.com/health` every 5–10 minutes.

---

## 3. Supabase Configuration (Authentication & URLs)

Go to your **Supabase Dashboard > Authentication > URL Configuration**:

### 1. Site URL
Set the primary Site URL to your production Vercel frontend:
```
https://exam-pern.vercel.app
```

### 2. Redirect URLs (Allowlist)
Add the following URL patterns to **Redirect URLs**:
```
https://exam-pern.vercel.app/**
https://exam-pern.vercel.app/faculty/login
http://localhost:3000/**
http://localhost:3000/faculty/login
```

This ensures magic links, email verification redirects, and password resets redirect faculty users back to the correct login page without open redirect vulnerabilities.

---

## 4. Troubleshooting Checklist

| Issue | Likely Cause | Solution |
|---|---|---|
| Vercel returns `404 NOT_FOUND` on direct visit | Missing SPA rewrite | Confirm `frontend/vercel.json` exists with rewrites to `/index.html` and Vercel Root Directory is set to `frontend`. |
| "Configuration missing" screen on frontend | Missing env vars at build time | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel and trigger a redeploy. |
| CORS error on student enter or faculty actions | Origin not allowed | Set `CORS_ORIGINS=http://localhost:3000,https://exam-pern.vercel.app` in Render environment. |
| Student login loops back to login | Session storage mismatch | The application uses `sessionStorage` for student tokens (`exam_student_*`). Ensure browser allows session storage. |
| Polling stops in ExamScreen | Health check failed | Polling queries `/student/state`; remove any health check targeting `${API_BASE}/health`. |
| Database connection refused (`ECONNREFUSED`) | IP restriction or invalid string | Verify `DATABASE_URL` uses the pooled host and port 6543. |
