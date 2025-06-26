Schedulink

Self-care errands, handled autonomously.

Schedulink is a Telegram-controlled agent that chats in WhatsApp as you, books appointments, and drops the event straight into your calendar — without further input.

⸻

Features
	•	One command → appointment:  /haircut,  /nails,  /massage…
	•	Human-like WhatsApp dialogue (typing indicator, emojis)
	•	Supports multiple service providers & languages (extensible)
	•	Google Calendar auto-sync with reminders
	•	Crash-safe state persistence (MySQL / SQLite)
	•	Built with Node 20 + TypeScript & OpenAI Agents

⸻

Quick Start

Prerequisites
	•	Node 20 LTS + pnpm ≥ 9
	•	Docker (for MySQL & Redis)

# 1. Clone
$ git clone https://github.com/tulaman/Schedulink.git
$ cd Schedulink

# 2. Install deps
$ pnpm i

# 3. Bootstrap database (SQLite for dev)
$ pnpm prisma migrate dev --name init

# 4. Create .env
$ cp .env.example .env
#   fill TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, GOOGLE_* …

# 5. Run in watch mode
$ pnpm dev

Open Telegram, send /ping to your bot — you should receive pong. Next run /wa:login in a second terminal to generate the WhatsApp QR, scan it and you’re ready.

⸻

Important Commands

Script	What it does
pnpm dev	Run dev server with ts-node-dev & live reload
pnpm test	Jest unit + integration tests
pnpm wa:login	Stand-alone QR login for WhatsApp session
pnpm lint	ESLint + Prettier
pnpm docker:up	Start MySQL & Redis via Docker Compose


⸻

Configuration (.env)

TELEGRAM_BOT_TOKEN=xxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-...
DATABASE_URL="file:./dev.db"   # switch to mysql://… in prod
REDIS_URL=redis://localhost:6379
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT=http://localhost:3000/oauth2callback

Tip: For production set these with fly secrets set ….

⸻

Project Structure

├─ src
│  ├─ telegram/       # Telegraf bot
│  ├─ whatsapp/       # Baileys wrapper
│  ├─ agents/         # OpenAI agent definitions & XState FSM
│  ├─ prisma/schema.prisma
│  └─ index.ts
├─ tests/             # Jest suites
├─ docker-compose.yml
└─ docs/roadmap.md


⸻

Roadmap

The step-by-step implementation checklist lives in docs/roadmap.md. Tick the boxes as you complete stages.

⸻

Contributing
	1.	Fork & create feature branch feat/short-desc.
	2.	pnpm test must stay green.
	3.	Open PR — GitHub Actions will lint, test and build.

Commit convention

Follow Conventional Commits (feat: …, fix: …, chore: …).

⸻

License

This project is licensed under the MIT License — see LICENSE for details.

⸻

Acknowledgements
	•	Baileys by @adiwajshing — WhatsApp Web library
	•	OpenAI Agents JS for orchestration
	•	Prisma ORM

Happy automating! 🎉
