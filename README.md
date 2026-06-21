# SEO Keyword Analyser

An AI-powered on-page SEO tool. Paste an article and get:

- **4 optimized headline options** (with character counts vs. the 50–60 char sweet spot + rationale)
- A **complete keyword strategy** — primary, secondary, semantic/LSI, question (FAQ / AI Overview), and long-tail keywords
- A **meta description** and URL slug
- **Structure recommendations** (H1/H2 hierarchy, intro, length, internal links, schema) graded by severity
- A **recommended heading outline**, **content gaps**, **E-E-A-T notes**, **featured-snippet tips**, and **quick wins**
- **Scores** (overall, headline, keywords, structure, readability) plus instant client-side metrics (word count, reading time, Flesch readability, heading count)

Built with **Next.js (App Router)**. The AI key stays **server-side only** (never exposed to the browser).

---

## How the AI works

The app is provider-flexible. It uses whichever key you set as an environment variable:

| Priority | Env var | Provider | Cost |
|---|---|---|---|
| 1 | `GEMINI_API_KEY` | Google Gemini | **Free tier available** ✅ |
| 2 | `ANTHROPIC_API_KEY` | Anthropic Claude | Paid |

Set **one** of them. Gemini is the recommended default — get a free key at <https://aistudio.google.com/app/apikey>.

---

## Deploy to Vercel via GitHub (recommended)

### 1. Put the code on GitHub
1. Create a new **empty** repo on GitHub (e.g. `seo-keyword-analyser`).
2. From this project folder, push it:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: SEO Keyword Analyser"
   git branch -M main
   git remote add origin https://github.com/<your-username>/seo-keyword-analyser.git
   git push -u origin main
   ```

### 2. Import into Vercel
1. Go to <https://vercel.com/new> and **Import** your GitHub repo.
2. Framework preset auto-detects **Next.js** — leave the defaults.
3. Before deploying, open **Environment Variables** and add:
   - **Name:** `GEMINI_API_KEY`  **Value:** your key from Google AI Studio
   - *(Optional)* `GEMINI_MODEL` = `gemini-2.0-flash`
4. Click **Deploy**. Done — every future `git push` auto-deploys.

> If you ever prefer Claude: add `ANTHROPIC_API_KEY` instead (and remove `GEMINI_API_KEY`), then redeploy.

---

## Run locally

```bash
npm install
cp .env.example .env.local      # then paste your real key into .env.local
npm run dev                      # http://localhost:3000
```

Build check:
```bash
npm run build
```

---

## Project structure

```
app/
  layout.js              # metadata + root layout
  page.js                # the UI (client component)
  globals.css            # styles
  api/analyze/route.js   # server route: calls Gemini/Anthropic, returns JSON
lib/
  prompt.js              # expert SEO system prompt + strict JSON contract
  metrics.js             # instant client-side text metrics (Flesch, headings, etc.)
.env.example             # which env vars to set
```

## Security note
Never commit your real key. `.env` / `.env.local` are git-ignored. On Vercel the key lives in encrypted Environment Variables and is only read inside the serverless API route.
