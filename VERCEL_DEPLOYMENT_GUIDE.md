# Vercel Deployment Guide for Demand-Supply Analyzer

This guide will walk you through deploying the Demand-Supply Analyzer to Vercel.

## Prerequisites

- A GitHub account
- A Vercel account (free tier available at https://vercel.com)
- Git installed on your machine

## Step-by-Step Deployment Instructions

### Step 1: Create a GitHub Repository

1. Go to https://github.com/new
2. Create a new repository with the name `demand-supply-analyzer`
3. Choose "Public" or "Private" (your preference)
4. **Do NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### Step 2: Push Code to GitHub

Run these commands in your terminal from the project directory:

```bash
# Add all files to git
git add .

# Create initial commit
git commit -m "Initial commit: Demand-Supply Analyzer with delete buttons, bright map, and smart display logic"

# Add GitHub as remote (replace USERNAME with your GitHub username)
git remote add origin https://github.com/USERNAME/demand-supply-analyzer.git

# Rename branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### Step 3: Connect to Vercel

1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Click "Import Git Repository"
4. Paste your GitHub repository URL: `https://github.com/USERNAME/demand-supply-analyzer.git`
5. Click "Continue"
6. Authorize Vercel to access your GitHub account (if prompted)

### Step 4: Configure Vercel Project Settings

On the Vercel import page, configure:

#### **Project Name**
- Name: `demand-supply-analyzer` (or your preferred name)

#### **Framework Preset**
- Select: **Other** (since this is a custom full-stack app)

#### **Root Directory**
- Leave as: `.` (root)

#### **Build Command**
- Set to: `pnpm build`

#### **Output Directory**
- Set to: `dist/public`

#### **Install Command**
- Set to: `pnpm install --frozen-lockfile`

#### **Environment Variables**
Add these variables (optional, for production):

```
NODE_ENV=production
PORT=3000
```

If you're using OAuth or other services, add those credentials here.

### Step 5: Deploy

1. Click "Deploy"
2. Wait for the build to complete (usually 2-5 minutes)
3. Once complete, you'll see a success message with your deployment URL

### Step 6: Access Your Deployment

Your application will be available at:
- **Default URL**: `https://demand-supply-analyzer.vercel.app`
- **Custom domain**: You can add a custom domain in Vercel settings

## Troubleshooting

### Build Fails with "pnpm not found"

**Solution**: Vercel should auto-detect pnpm from `pnpm-lock.yaml`. If it doesn't:
1. Go to Project Settings → General
2. Set "Node.js Version" to 22.x
3. Redeploy

### Port Already in Use Error

**Solution**: This shouldn't happen on Vercel, but if it does:
1. Remove the `PORT` environment variable
2. Redeploy

### Database Connection Issues

If you add a database later:
1. Add `DATABASE_URL` to Environment Variables in Vercel
2. Run migrations if needed
3. Redeploy

## Post-Deployment

### Enable Auto-Deployments

By default, Vercel will automatically deploy when you push to the `main` branch. To verify:
1. Go to your Vercel project
2. Click "Settings" → "Git"
3. Ensure "Deploy on push to main" is enabled

### Custom Domain (Optional)

1. Go to your Vercel project
2. Click "Settings" → "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

### Environment Variables (Optional)

To add environment variables after deployment:
1. Go to your Vercel project
2. Click "Settings" → "Environment Variables"
3. Add your variables
4. Redeploy for changes to take effect

## Features Deployed

✅ Delete buttons for uploaded files
✅ Bright map display (light basemap)
✅ Smart display logic:
  - Shows coefficient (demand/supply ratio) when both files uploaded
  - Shows sum of events when only demand file uploaded
✅ Hexagon visualization with H3 geospatial indexing
✅ Real-time data processing

## Support

For issues with:
- **Vercel deployment**: https://vercel.com/support
- **Application bugs**: Check the browser console and Vercel logs
- **GitHub issues**: Create an issue in your repository

---

**Deployment Status**: Ready to deploy ✓
**Last Updated**: December 4, 2025
