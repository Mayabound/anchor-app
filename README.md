TEAM DOODLE
# Anchor — daily wellness check-in

A conversational check-in companion built with Node.js/Express and the Groq API (OpenAI-compatible, running Llama 3.3). Streams responses in real time, keeps the API key server-side, and surfaces crisis resources automatically if a message suggests real distress.

**Anchor is a supportive conversation tool, not therapy or medical advice.**

🔗 https://anchor-app-0bux.onrender.com

## Tech stack

* **Frontend:** static HTML/CSS/JS (no build step), served by Express
* **Backend:** Node.js + Express
* **LLM:** Groq API (`llama-3.3-70b-versatile`), OpenAI-compatible chat completions endpoint, streamed via SSE-style chunks. Free tier, no card required at signup. Check console.groq.com/docs/models if this model ID has since been deprecated — Groq's lineup changes fairly often.
* **Container:** Docker (node:20-alpine)
* **Deploy target:** Render (Web Service, deployed from Docker)

## Run locally

```
npm install
cp .env.example .env
# edit .env and add your real GROQ_API_KEY (get one free at console.groq.com)
npm start
```

Visit http://localhost:8080

## Run with Docker

```
docker build -t anchor-app .
docker run -p 8080:8080 --env-file .env anchor-app
```

## Deploying to Render

1. Push this repo to GitHub (`.env` is gitignored — never commit real keys).
2. In the Render Dashboard, click **New → Web Service**.
3. Connect your GitHub repo.
4. Runtime: select **Docker** — Render will detect the `Dockerfile` automatically at the repo root.
5. Under **Environment**, add an environment variable: `GROQ_API_KEY` = your real key. Do not hardcode it anywhere.
6. Port: `8080` (matches `EXPOSE 8080` in the Dockerfile) — Render auto-detects this from the container, but you can set `PORT=8080` explicitly under Environment if needed.
7. Health check path: `/api/health`.
8. Instance type: **Free** is sufficient for this project.
9. Click **Create Web Service**. Render builds the image and deploys it, giving you a public `*.onrender.com` HTTPS URL — that's the link to paste into your Concept Note and Project Report.

**Cost awareness:** the Free instance type on Render is sufficient for this project and won't incur charges. Note that free-tier services spin down after a period of inactivity and take a few seconds to spin back up on the next request — worth mentioning in your report as a known limitation, and worth doing a warm-up request before a live demo/grading session.

## Architecture

```
Browser (HTTPS)
   -> Render Web Service
        -> Docker container (Node 20 + Express)
             -> serves static frontend (public/)
             -> POST /api/chat -> streams from Groq API -> SSE-style chunks back to browser
```

## Project structure

```
anchor-app/
├── server.js           # Express server, streaming endpoint, persona + safety logic
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js           # streaming fetch, chat UI, crisis resource modal
├── Dockerfile
├── .dockerignore
├── .env.example
├── .gitignore
└── package.json
```

## Prompting strategy notes (for your report)

The persona and safety instructions live entirely in `SYSTEM_PROMPT` in `server.js`. Key decisions worth documenting in your report:

* The system prompt explicitly forbids diagnostic language and caps response length, so Anchor reads as a companion, not a chatbot essay machine.
* A separate, deliberately narrow regex check (`mentionsCrisisLanguage`) decides whether to auto-surface the crisis resource card — it's a heuristic, not a diagnosis, which is why the resources are also always reachable from the footer regardless of what the check catches.
* `max_tokens` is kept modest (512) to keep replies check-in-sized rather than long-form.

Good things to screenshot/log for your prompt engineering documentation: your first draft of `SYSTEM_PROMPT` vs. the final version, and any prompts you gave an AI coding assistant while building this (e.g. "add a graceful error state when the API key is missing").

## Security checklist

* `GROQ_API_KEY` only ever read from `process.env`, never sent to the client
* `.env` is gitignored
* `.env.example` has placeholder values only
* No API keys in frontend code
