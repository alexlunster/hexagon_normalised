# Complete Vercel Deployment Guide with Screenshots

## Overview

This guide walks you through deploying the Demand-Supply Analyzer to Vercel with detailed steps and descriptions.

---

## Part 1: Prepare Your Code for GitHub

### Step 1.1: Open Terminal/Command Prompt

Navigate to your project directory:
```bash
cd demand_supply_analyzer
```

### Step 1.2: Initialize Git Repository

```bash
git init
git add .
git commit -m "Initial commit: Demand-Supply Analyzer"
```

**Expected output:**
```
Initialized empty Git repository in ...
[master (root-commit) abc1234] Initial commit
 X files changed, Y insertions(+)
```

---

## Part 2: Create GitHub Repository

### Step 2.1: Go to GitHub

1. Open https://github.com/new
2. You should see the "Create a new repository" form

### Step 2.2: Fill in Repository Details

| Field | Value |
|-------|-------|
| **Repository name** | `demand-supply-analyzer` |
| **Description** | `Geospatial demand-supply visualization tool` |
| **Visibility** | Public (recommended) or Private |
| **Initialize with** | Leave unchecked (we have files already) |

### Step 2.3: Create Repository

Click the **"Create repository"** button.

### Step 2.4: Copy Repository URL

You'll see a page with setup instructions. Copy the HTTPS URL shown (looks like):
```
https://github.com/YOUR_USERNAME/demand-supply-analyzer.git
```

---

## Part 3: Push Code to GitHub

### Step 3.1: Add Remote and Push

In your terminal, run:

```bash
# Add GitHub as the remote repository
git remote add origin https://github.com/YOUR_USERNAME/demand-supply-analyzer.git

# Rename branch to main (if needed)
git branch -M main

# Push your code to GitHub
git push -u origin main
```

**Replace `YOUR_USERNAME` with your actual GitHub username!**

**Expected output:**
```
Enumerating objects: ...
Counting objects: 100% (...)
Compressing objects: 100% (...)
Writing objects: 100% (...)
...
To https://github.com/YOUR_USERNAME/demand-supply-analyzer.git
 * [new branch]      main -> main
Branch 'main' set up to track remote branch 'main' from 'origin'.
```

### Step 3.2: Verify on GitHub

1. Go to https://github.com/YOUR_USERNAME/demand-supply-analyzer
2. You should see all your project files
3. The code is now on GitHub! ✓

---

## Part 4: Connect to Vercel

### Step 4.1: Sign In to Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"** or **"Log In"**
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your GitHub account

### Step 4.2: Create New Project

1. Go to https://vercel.com/dashboard
2. Click **"Add New..."** button (top right)
3. Select **"Project"**

### Step 4.3: Import Git Repository

1. Click **"Import Git Repository"**
2. In the "Repository URL" field, paste:
   ```
   https://github.com/YOUR_USERNAME/demand-supply-analyzer.git
   ```
3. Click **"Continue"**

**Note:** If you don't see this option, you may need to authorize Vercel with GitHub first.

---

## Part 5: Configure Vercel Settings

### Step 5.1: Project Settings

On the "Import Project" page, you'll see several fields:

#### Project Name
```
demand-supply-analyzer
```
(Vercel will suggest a name; you can change it)

#### Framework Preset
```
Other
```
(Select "Other" since this is a custom full-stack app)

#### Root Directory
```
./
```
(Leave as default - root directory)

### Step 5.2: Build Settings

Scroll down to find the build configuration section.

#### Build Command
```
pnpm build
```

#### Output Directory
```
dist/public
```

#### Install Command
```
pnpm install --frozen-lockfile
```

### Step 5.3: Environment Variables (Optional)

If you need environment variables, add them here:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |

(Leave empty for now if you don't have any)

### Step 5.4: Review Settings

Your settings should look like:
```
Project Name: demand-supply-analyzer
Framework: Other
Root Directory: ./
Build Command: pnpm build
Output Directory: dist/public
Install Command: pnpm install --frozen-lockfile
```

---

## Part 6: Deploy!

### Step 6.1: Click Deploy

Click the **"Deploy"** button at the bottom of the page.

**What happens next:**
- Vercel clones your GitHub repository
- Installs dependencies with pnpm
- Runs the build command
- Deploys your application

### Step 6.2: Wait for Build

You'll see a progress page showing:
```
Building...
Installing dependencies...
Running build...
Deploying...
```

This typically takes 2-5 minutes.

### Step 6.3: Success!

Once complete, you'll see:
```
✓ Deployment Successful
```

And a URL like:
```
https://demand-supply-analyzer.vercel.app
```

---

## Part 7: Access Your Application

### Step 7.1: Visit Your App

Click the URL or open:
```
https://demand-supply-analyzer.vercel.app
```

You should see your Demand-Supply Analyzer running live! 🎉

### Step 7.2: Test the Application

1. Upload a demand Excel file
2. (Optional) Upload a supply Excel file
3. Verify the map displays with bright background
4. Test the delete buttons
5. Check that the display logic works correctly

---

## Part 8: Set Up Auto-Deployments (Optional)

Vercel automatically deploys when you push to the main branch. To verify:

1. Go to your Vercel project dashboard
2. Click **"Settings"** → **"Git"**
3. Ensure **"Deploy on push to main"** is enabled
4. Save if needed

Now, every time you push to GitHub, Vercel will automatically deploy!

---

## Part 9: Add Custom Domain (Optional)

If you have a custom domain:

1. Go to your Vercel project
2. Click **"Settings"** → **"Domains"**
3. Enter your domain name
4. Follow the DNS configuration instructions
5. Wait for DNS to propagate (can take a few minutes)

---

## Troubleshooting

### Build Failed: "pnpm not found"

**Solution:**
1. Go to Vercel project → Settings → General
2. Set "Node.js Version" to `22.x`
3. Go to Settings → Git → "Clear Build Cache"
4. Redeploy

### Build Failed: "Cannot find module"

**Solution:**
1. Go to Settings → Git
2. Click "Clear Build Cache"
3. Redeploy

### Application Shows 404 or Blank Page

**Solution:**
1. Check the Vercel build logs for errors
2. Verify the Output Directory is set to `dist/public`
3. Verify the Build Command is `pnpm build`

### Port Already in Use

**Solution:**
- Don't set a PORT environment variable
- Vercel manages ports automatically

---

## What's Deployed

✅ **Features:**
- Delete buttons for uploaded files
- Bright map display (light basemap)
- Smart display logic (coefficient or sum)
- Hexagon visualization
- Real-time data processing

✅ **Tech Stack:**
- React 19 frontend
- Express.js backend
- Deck.gl visualization
- H3 geospatial indexing

---

## Next Steps

### Monitor Your Deployment
1. Go to Vercel dashboard
2. Click on your project
3. View deployment history and logs

### Update Your Code
1. Make changes locally
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your message"
   git push
   ```
3. Vercel automatically deploys!

### Add Environment Variables
1. Go to Vercel project → Settings → Environment Variables
2. Add variables as needed
3. Redeploy for changes to take effect

---

## Support & Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Vercel Support**: https://vercel.com/support
- **GitHub Issues**: Create an issue in your repository
- **Project README**: See `README.md` for more info

---

**Status**: Deployment Complete ✓
**Last Updated**: December 4, 2025
