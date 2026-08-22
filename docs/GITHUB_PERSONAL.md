# Push to personal GitHub (`dheerajgoel17`)

This machine is currently logged into GitHub as **dheerajgoel1710**.  
To publish under your **personal** account **dheerajgoel17**, run once in Terminal:

```bash
cd /Users/dheerajgoel/Projects/dual-stream

# Sign in as dheerajgoel17 (browser flow)
gh auth login -h github.com -p https -w

# When prompted, pick account dheerajgoel17 and approve in the browser.

# Create repo and push
gh repo create dheerajgoel17/dual-stream --public --source=. --remote=origin --push
```

If the repo already exists on GitHub:

```bash
git remote add origin https://github.com/dheerajgoel17/dual-stream.git
git push -u origin main
```

## Enable GitHub Pages (for AdSense landing + extension ad iframes)

1. Open https://github.com/dheerajgoel17/dual-stream/settings/pages  
2. **Build and deployment** → Source: **GitHub Actions** (workflow included)  
3. After deploy: https://dheerajgoel17.github.io/dual-stream/  
4. Follow [docs/ADS.md](docs/ADS.md) to add your AdSense `ca-pub-…` id  

## Switch back to work account later (optional)

```bash
gh auth switch -u dheerajgoel1710
```
