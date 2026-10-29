# Deployment — Smart Exam Platform (PERN)

## Recommended: Render.com

Render is ideal for this stack because it supports:
- **Web Service** (Node.js backend) with auto-deploy from Git
- **Static Site** (React frontend) or serve frontend from the same backend
- **External Database**: Supabase (managed PostgreSQL) — Render does not host the DB; Supabase does

### Option A: Backend on Render + Frontend on Vercel/Netlify (Recommended)

1. **Backend** (`exam-pern/backend`)
   - Create a Render Web Service, connect your Git repo, set root directory to `exam-pern/backend`
   - Build command: `npm install`
   - Start command: `npm start`
   - Add environment variables (from `.env.example`):
     - `PORT=10000` (Render assigns port; use `process.env.PORT || 5000`)
     - `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`
     - `DATABASE_URL` (Supabase pooled connection string)
     - `STUDENT_JWT_SECRET` (random string)
     - `BASE_URL=https://your-backend.onrender.com`

2. **Frontend** (`exam-pern/frontend`)
   - Create a Vercel/Netlify project, connect your Git repo, root directory `exam-pern/frontend`
   - Build command: `npm run build`
   - Add environment variables:
     - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
     - `VITE_API_BASE=https://your-backend.onrender.com/api`
     - `VITE_AUTH_BASE=https://your-backend.onrender.com/auth`

3. **Keep-alive**: Render free tier web services spin down after inactivity. To prevent this:
   - Use Render's **paid plan** (recommended for exams), or
   - Add a cron job (e.g., Cron-job.org, GitHub Actions, or UptimeRobot) that hits `GET https://your-backend.onrender.com/health` every 5–10 minutes.

### Option B: Single Render Web Service (Backend serves frontend)

1. Build the frontend: `cd exam-pern/frontend && npm run build`
2. Copy `dist/` contents into `exam-pern/backend/public/`
3. Add to `backend/src/app.js`:
   ```js
   app.use(express.static('public'));
   app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
   ```
4. Deploy backend on Render with root directory `exam-pern/backend`

---

## Environment Variables Checklist (Production)

| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | Yes | Render sets this automatically |
| `SUPABASE_URL` | Yes | From Supabase dashboard |
| `SUPABASE_JWT_SECRET` | Yes | From Supabase Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | From Supabase Settings > API (keep secret!) |
| `DATABASE_URL` | Yes | Supabase connection string (use pooled `:6543` for serverless/Edge) |
| `STUDENT_JWT_SECRET` | Yes | Any random 32+ char string |
| `BASE_URL` | Yes | Public backend URL |
| `VITE_SUPABASE_URL` | Yes | Frontend |
| `VITE_SUPABASE_ANON_KEY` | Yes | Frontend |
| `VITE_API_BASE` | Yes | Backend public URL + `/api` |

---

## Security Notes for Production

1. **Never commit `.env`** — add it to `.gitignore`
2. **`SUPABASE_SERVICE_ROLE_KEY`** bypasses RLS — keep it backend-only
3. **Use HTTPS** in production (Render provides automatic TLS)
4. **Set `DEBUG=false`** in production to avoid stack traces
5. **Consider rate limiting** on `/auth/student/login` (brute-force protection) — add `express-rate-limit` if needed
6. **Student password == username** is by design but weak; enforce strong passwords if your use-case requires it

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `connect ECONNREFUSED` to database | Check `DATABASE_URL`, ensure Supabase project is active, add Render's outbound IPs to Supabase firewall if needed |
| Faculty JWT invalid | Verify `SUPABASE_JWT_SECRET` matches Supabase Settings > API |
| Student login returns 401 | Check bcrypt hash in `profiles.password_hash` matches the username |
| `.docx` import returns empty | Ensure file is a valid `.docx` (not `.doc`) and under 5 MB |
| Polling stops working | Check browser console, verify backend `/health` is reachable |
