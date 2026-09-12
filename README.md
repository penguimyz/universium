# Universium

A browser/unblocker app built with Node.js + Ultraviolet.

## Deploy to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Select your repo — Railway auto-detects Node and runs `node server.js`
4. Once deployed, grab your Railway URL from the dashboard

That's it. No config needed.

## Run locally

```bash
npm install
node server.js
# → http://localhost:5000
```

## Notes

- Port is read from `process.env.PORT` (Railway sets this automatically)
- UV proxy, bare server, and wisp all run on the same server
- The `/games/` route rewrites CDN URLs through the built-in proxy
