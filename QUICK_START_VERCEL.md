# Quick Start: Deploy to Vercel in 5 Minutes

## Prerequisites
- GitHub account
- Vercel account (sign up free at https://vercel.com)

## The 5-Step Process

### 1️⃣ Create GitHub Repository (2 minutes)

```bash
# From the project directory, initialize git
git add .
git commit -m "Initial commit"

# Create a new repository on GitHub.com and copy the URL
# Then run:
git remote add origin https://github.com/YOUR_USERNAME/demand-supply-analyzer.git
git branch -M main
git push -u origin main
```

**What to do:**
- Go to https://github.com/new
- Name it: `demand-supply-analyzer`
- Copy the HTTPS URL
- Paste it in the `git remote add origin` command above
- Replace `YOUR_USERNAME` with your GitHub username

---

### 2️⃣ Connect to Vercel (1 minute)

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** → **"Project"**
3. Click **"Import Git Repository"**
4. Paste your GitHub repo URL
5. Click **"Continue"**

---

### 3️⃣ Configure Build Settings (1 minute)

In the Vercel import page, set:

| Setting | Value |
|---------|-------|
| **Project Name** | `demand-supply-analyzer` |
| **Framework** | Other |
| **Build Command** | `pnpm build` |
| **Output Directory** | `dist/public` |
| **Install Command** | `pnpm install --frozen-lockfile` |

Leave other settings as default.

---

### 4️⃣ Deploy (1 minute)

Click **"Deploy"** and wait for the build to complete (2-3 minutes).

---

### 5️⃣ Access Your App (instant)

Once deployed, your app is live at:
```
https://demand-supply-analyzer.vercel.app
```

(Or your custom domain if configured)

---

## That's It! 🎉

Your Demand-Supply Analyzer is now live on Vercel!

### What Happens Next?

- **Auto-deployments**: Every push to `main` branch auto-deploys
- **Custom domain**: Add one in Vercel Settings → Domains
- **Environment variables**: Add them in Vercel Settings → Environment Variables

---

## Common Issues & Fixes

### ❌ Build fails with "pnpm not found"
**Fix**: In Vercel project settings, set Node.js version to 22.x and redeploy

### ❌ "Cannot find module" errors
**Fix**: Clear Vercel cache and redeploy:
1. Go to Settings → Git
2. Click "Clear Build Cache"
3. Redeploy

### ❌ Port errors
**Fix**: Don't set PORT environment variable (Vercel handles this)

---

## Need Help?

- **Vercel docs**: https://vercel.com/docs
- **GitHub issues**: Create an issue in your repository
- **Full guide**: See `VERCEL_DEPLOYMENT_GUIDE.md`

---

**Status**: Ready to Deploy ✓
