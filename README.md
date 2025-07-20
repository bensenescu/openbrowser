# OpenBrowser
## API Key Authentication Setup

This service requires API key authentication to secure access when exposed to the internet.

## Quick Setup

1. Generate a secure API key:
```bash
openssl rand -hex 32
```

2. Set the API key as a Cloudflare secret:
```bash
wrangler secret put API_KEY
# Paste your generated key when prompted
```

3. Deploy your service:
```bash
npm run deploy
```

## How to Authenticate and connect over CDP
```
import { chromium } from "playwright";
const browser = chromium.connectOverCDP("https://your-service.workers.dev?apiKey=YOUR_API_KEY");
```

## Disabling Authentication
To run without authentication (e.g., for local development), add `DEV=true` to your `.dev.vars`

