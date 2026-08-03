# Free Tier Deployment Guide
## Legal Automation System - Render.com + Supabase

This guide explains how to deploy the complete Legal Automation system to production using only **free tier services**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Supabase Setup (Database)](#step-1-supabase-setup-database)
4. [Step 2: Render.com Setup (Backend)](#step-2-rendercom-setup-backend)
5. [Step 3: GitHub Configuration](#step-3-github-configuration)
6. [Step 4: Deployment](#step-4-deployment)
7. [Step 5: Verification & Testing](#step-5-verification--testing)
8. [Environment Variables Reference](#environment-variables-reference)
9. [Troubleshooting](#troubleshooting)
10. [Free Tier Limits & Scaling](#free-tier-limits--scaling)

---

## Architecture Overview

### Deployment Stack
- **Backend**: Render.com (Node.js + Express)
- **Database**: Supabase (PostgreSQL)
- **Optional Cache**: Render Redis (optional)
- **File Storage**: Local filesystem (Render /tmp directory - non-persistent)
- **DNS**: Render default domain or custom domain

### Service Specifications (Free Tier)
| Service | Tier | CPU | RAM | Storage | Bandwidth |
|---------|------|-----|-----|---------|-----------|
| Render Backend | Free | 0.5 vCPU | 512 MB | 100 GB | 100 GB/month |
| Supabase DB | Free | Shared | Shared | 500 MB | 2 GB/month |
| Redis (Optional) | Free | Shared | 256 MB | 30 MB | Unlimited |

### Key Limitations
- Render free tier instances **spin down** after 15 minutes of inactivity (causes ~30s delay on first request)
- Supabase free tier has **500 MB** storage limit (57 tables should use ~50-100 MB)
- No persistent file storage on Render (use object storage like Cloudinary for production)
- Cannot scale horizontally on free tier

---

## Prerequisites

Before starting, you'll need:

1. **GitHub Account** - Code repository hosting
2. **Render.com Account** - Backend hosting (sign up at https://render.com)
3. **Supabase Account** - Database hosting (sign up at https://supabase.com)
4. **Git CLI** - Installed locally (git --version)
5. **Node.js 20+** - For local testing (node --version)

### Accounts Setup (5 minutes)

#### 1. Create Render.com Account
```bash
# Go to https://render.com and sign up with GitHub
# This allows direct connection for automatic deployments
```

#### 2. Create Supabase Account
```bash
# Go to https://supabase.com and sign up
# Create a new project:
# - Region: Choose closest to you (e.g., us-east-1, eu-west-1)
# - Password: Save securely (you'll need this!)
# - Project name: legal-automation-prod
```

---

## Step 1: Supabase Setup (Database)

### 1.1 Create PostgreSQL Database

1. **Log in to Supabase** (https://app.supabase.com)
2. Click **"New Project"**
3. Configure:
   - **Project Name**: `legal-automation-prod`
   - **Database Password**: Save this securely! (you'll use it later)
   - **Region**: Select closest to your users
   - **Pricing Plan**: Free tier
4. Click **"Create new project"** and wait for initialization (~2 minutes)

### 1.2 Get Connection String

1. In Supabase Dashboard, navigate to **"Settings"** → **"Database"**
2. Find **"Connection String"** section
3. Click the connection string tab (usually shows PostgreSQL)
4. Copy the entire connection string:
```
postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
```

⚠️ **Important**: Save this connection string securely - you'll add it to Render environment variables

### 1.3 Run Database Migrations

The system has 10 SQL migration files that set up all 57 tables. There are two ways to run them:

#### Option A: Using Supabase SQL Editor (Recommended)

1. In Supabase Dashboard, go to **"SQL Editor"**
2. Click **"New Query"**
3. Copy the contents of `/migrations/001_init.sql` (starting file)
4. Paste into the SQL editor
5. Click **"Run"**
6. Repeat for migrations 002-010 in order:
   - `002_pki_module.sql`
   - `003_ged_module.sql`
   - `004_timesheet_module.sql`
   - `005_ai_module.sql`
   - `006_mobile_module.sql`
   - `007_alerts_module.sql`
   - `008_calendar_module.sql`
   - `009_reports_module.sql`
   - `010_portal_module.sql`

#### Option B: Using psql CLI (Alternative)

```bash
# Install PostgreSQL client
sudo apt-get install postgresql-client  # Linux
brew install postgresql  # macOS
choco install postgresql  # Windows

# Run all migrations
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres"

for file in migrations/00*.sql; do
  psql $DATABASE_URL -f "$file"
done
```

### 1.4 Verify Database Setup

In Supabase SQL Editor, run this query to verify tables were created:

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

You should see 57 tables including:
- `users`
- `certificates`
- `documents`
- `time_entries`
- `cases`
- `alerts`
- `calendar_events`
- `portal_access`
- ... and more

---

## Step 2: Render.com Setup (Backend)

### 2.1 Create Web Service

1. **Log in to Render** (https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository:
   - Click **"Connect Account"** if not already connected
   - Select the repository with the legal-automation code
   - Authorize Render to access your GitHub

### 2.2 Configure Web Service

Fill in the following configuration:

| Setting | Value |
|---------|-------|
| **Name** | `legal-automation-api` |
| **Environment** | `Node` |
| **Region** | Choose closest to your users |
| **Branch** | `claude/eproc-projudi-automation-4cx0tt` |
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `node dist/index.js` |
| **Plan** | Free |

### 2.3 Add Environment Variables

After creating the service, go to **"Environment"** tab:

**Critical Environment Variables** (must set):

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REGION].supabase.co:5432/postgres
JWT_SECRET=your-random-secure-32-character-string-here-change-it
CERT_ENCRYPTION_KEY=another-random-secure-32-character-string-here
```

**Optional Environment Variables** (set if using these services):

```bash
# For Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=noreply@legal-automation.com

# For 2FA (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# For Legal Platform APIs
DATAJUD_API_KEY=your-datajud-key
PROJUDI_USERNAME=your-tjpr-username
PROJUDI_PASSWORD=your-tjpr-password
# ... add other platform credentials as needed

# For AI/LLM (if using external AI)
CLAUDE_API_KEY=your-claude-api-key
GEMINI_API_KEY=your-gemini-api-key
```

### 2.4 Add Custom Domain (Optional)

If you have a custom domain:

1. Go to **"Settings"** → **"Custom Domain"**
2. Add your domain (e.g., `api.yourlawfirm.com`)
3. Configure DNS records as instructed by Render
4. Update `CORS_ORIGIN` environment variable with your domain

---

## Step 3: GitHub Configuration

### 3.1 Ensure Code is on GitHub

Verify the repository is on GitHub with the deployment branch:

```bash
cd /home/user/Lucide-react/legal-automation

# Check remote
git remote -v

# Should show:
# origin  https://github.com/[your-username]/lucide-react.git (fetch)
# origin  https://github.com/[your-username]/lucide-react.git (push)

# Verify branch exists
git branch -a | grep claude/eproc

# Push latest changes
git push origin claude/eproc-projudi-automation-4cx0tt
```

### 3.2 Verify Build Configuration

Render will automatically detect:
- `package.json` for npm scripts
- `Procfile` for start command (we created this)
- `render.yaml` for additional configuration (we created this)

---

## Step 4: Deployment

### 4.1 Deploy on Render

Render will automatically start deployment after you create the service:

1. **View Deployment Logs**:
   - Go to Render Dashboard → Your service
   - Click **"Logs"** tab
   - Watch the build progress:
     ```
     $ npm ci && npm run build
     $ npm run build
     $ tsc --build
     $ node dist/index.js
     ```

2. **Wait for Success**:
   - Build should complete in 3-5 minutes
   - You'll see: `Server running on port 3000`
   - Status should change to "Live" (green)

### 4.2 Get Your Live URL

Once deployment succeeds:

1. In Render Dashboard, find your service
2. Look for **"Live URL"** at the top (e.g., `https://legal-automation-api.onrender.com`)
3. This is your public API endpoint

**Note**: First request may take 30 seconds due to Render free tier spindown

---

## Step 5: Verification & Testing

### 5.1 Health Check Endpoint

Test that the API is running:

```bash
# Should return 200 OK
curl https://legal-automation-api.onrender.com/health

# Response:
# {"status":"ok","timestamp":"2026-08-03T12:00:00Z"}
```

### 5.2 Test Authentication Endpoint

```bash
# Test JWT login
curl -X POST https://legal-automation-api.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@lawfirm.com",
    "password": "test-password"
  }'

# Should return JWT token or authentication error
```

### 5.3 Test Core Endpoints

Test a few module endpoints to ensure database connection works:

```bash
# Get cases (requires valid JWT token)
curl https://legal-automation-api.onrender.com/portal/cases \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get documents
curl https://legal-automation-api.onrender.com/ged/documents \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get timesheet entries
curl https://legal-automation-api.onrender.com/timesheet/entries \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5.4 Check Render Logs

If endpoints return errors:

1. Go to Render Dashboard → Your service
2. Click **"Logs"** tab
3. Look for error messages
4. Common issues:
   - `DATABASE_URL` not set correctly
   - Database migrations not run
   - Missing required environment variables

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | Express port (Render sets this) | `3000` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://postgres:pwd@host:5432/db` |
| `JWT_SECRET` | JWT signing key (32+ chars) | `your-random-string` |
| `CERT_ENCRYPTION_KEY` | Certificate encryption key | `your-random-string` |

### Optional but Recommended

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity | `info` |
| `CORS_ORIGIN` | Allowed CORS origins | `http://localhost:3000` |
| `MAX_FILE_SIZE` | Max upload size (bytes) | `52428800` (50MB) |
| `RATE_LIMIT_MAX_REQUESTS` | Requests per window | `100` |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window (ms) | `900000` (15 min) |

### Legal Platform APIs

Set these only if you have credentials for these platforms:

- `DATAJUD_API_KEY` - CNJ DataJud integration
- `PROJUDI_USERNAME`, `PROJUDI_PASSWORD` - Projudi TJPR
- `EPROC_API_URL` - eProc TJSC
- `TRF4_LOGIN`, `TRF4_PASSWORD` - TRF4
- `JFPR_LOGIN`, `JFPR_PASSWORD` - JFPR
- `TJMT_LOGIN`, `TJMT_PASSWORD` - TJMT
- `TJRO_LOGIN`, `TJRO_PASSWORD` - TJRO

### AI/LLM Configuration

Set only if using external AI services:

- `CLAUDE_API_KEY` - Anthropic Claude
- `GEMINI_API_KEY` - Google Gemini
- `GROK_API_KEY` - xAI Grok
- `OPENAI_API_KEY` - OpenAI

---

## Troubleshooting

### Issue: Build Fails

**Error**: `npm ERR! code E404`

**Solution**:
1. Check that `package.json` exists in root directory
2. Verify all dependencies are available on npm
3. Check Node.js version: `node --version` (must be 20+)

---

### Issue: Database Connection Error

**Error**: `ECONNREFUSED` or `connection refused`

**Solution**:
1. Verify `DATABASE_URL` environment variable is set correctly
2. Check Supabase connection string format:
   ```
   postgresql://postgres:PASSWORD@db.REGION.supabase.co:5432/postgres
   ```
3. Verify password doesn't contain special characters that need escaping
4. Test connection locally:
   ```bash
   psql "postgresql://postgres:PASSWORD@db.REGION.supabase.co:5432/postgres"
   ```

---

### Issue: Migrations Haven't Run

**Error**: Relations don't exist (404 on database queries)

**Solution**:
1. Check that all 10 migration files were executed in order
2. Run migrations again via Supabase SQL Editor
3. Verify with query:
   ```sql
   SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```
   Should return 57 tables

---

### Issue: CORS Errors

**Error**: `Cross-Origin Request Blocked`

**Solution**:
1. Update `CORS_ORIGIN` environment variable to include your frontend domain
2. Render Dashboard → Service → Environment
3. Add or update `CORS_ORIGIN`:
   ```
   https://yourdomain.com,https://app.yourdomain.com
   ```
4. Restart service

---

### Issue: 502 Bad Gateway

**Error**: Service returns 502 on every request

**Solution**:
1. Check Render logs: Dashboard → Logs
2. Common causes:
   - Application crashed (check logs for errors)
   - Startup takes >30 seconds (timeout)
   - Database connection failed (check DATABASE_URL)
3. Restart service: Dashboard → More → Restart

---

### Issue: First Request Takes 30+ Seconds

**Note**: This is normal on free tier!

Render free tier instances spin down after 15 minutes of inactivity. First request after spindown takes 30-40 seconds. Subsequent requests are fast.

**Workaround** (if you need constant availability):
- Upgrade to Render's paid tier ($7/month)
- Set up a monitoring service to ping the API every 10 minutes

---

## Free Tier Limits & Scaling

### Current Limits

| Resource | Free Tier | Your Usage | Headroom |
|----------|-----------|-----------|----------|
| Backend CPU | 0.5 vCPU | ~0.1 vCPU (idle) | ✅ Good |
| Backend RAM | 512 MB | ~150 MB (app) | ✅ Good |
| Backend Bandwidth | 100 GB/month | ~1 GB/month (typical) | ✅ Good |
| Database Storage | 500 MB | ~50 MB (57 tables) | ✅ Good |
| Database Bandwidth | 2 GB/month | ~500 MB/month (typical) | ✅ Good |

### When to Upgrade

You should upgrade when:

1. **Database Storage**: Approaching 450 MB used
   - **Solution**: Upgrade to Supabase Pro ($25/month) for 10 GB
   - Or: Archive old records, increase cleanup cycles

2. **API Requests**: Handling many concurrent users
   - **Solution**: Upgrade to Render's Starter plan ($7/month) for guaranteed resources
   - Scales to handle 50+ concurrent users

3. **Need Always-On**: Can't tolerate spindown delays
   - **Solution**: Upgrade to Render Starter ($7/month) for always-on instance

### Upgrade Path

When ready to scale:

1. **Backend**: Render Starter ($7/month)
   - 1 vCPU, 512 MB RAM
   - No spindown
   - Unlimited bandwidth

2. **Database**: Supabase Pro ($25/month)
   - 10 GB storage
   - 50 GB bandwidth
   - Dedicated compute

3. **Redis Cache** (if needed): Render Redis ($5/month)
   - 2 GB storage
   - Better performance

**Total Starter Cost**: ~$37/month (still very affordable for a law firm)

---

## Final Checklist

- [ ] Supabase project created and configured
- [ ] Database migrations all run successfully (57 tables)
- [ ] Render.com account created
- [ ] Web service created on Render
- [ ] All environment variables set in Render
- [ ] Code pushed to GitHub on `claude/eproc-projudi-automation-4cx0tt` branch
- [ ] Deployment completed successfully (green "Live" status)
- [ ] Health check endpoint responds
- [ ] At least one authenticated endpoint works

---

## Support

For issues or questions:

1. Check Render logs: Dashboard → Logs
2. Check Supabase logs: SQL Editor → look for error messages
3. Verify environment variables are set correctly
4. Test locally first if possible:
   ```bash
   cp .env.example .env
   npm install
   npm run build
   npm start
   ```

---

**Deployed! 🚀**

Your Legal Automation System is now live on:
- **API URL**: `https://legal-automation-api.onrender.com`
- **Database**: Supabase PostgreSQL (free tier)
- **Cost**: $0/month (completely free!)

Next steps:
- Configure frontend to point to your API URL
- Add legal platform API credentials
- Set up email/SMS notifications
- Create initial users and cases
