Roadmap

Principle: After every stage the application starts via npm run dev and delivers a vertical slice of new functionality.
Stack: Node 20 LTS, TypeScript, pnpm, Prisma, Baileys, Telegraf, @openai/agents, Jest (+ts-jest), Docker Compose.

⸻

Stage 0 «Bootstrap & CI» — 1 day
	•	Create GitHub repository
	•	Project init – pnpm init, commit tsconfig.json (target: es2022, module: es2022)
	•	Install deps

pnpm add telegraf baileys @openai/agents dotenv prisma @prisma/client
pnpm add -D typescript ts-node-dev jest ts-jest @types/jest


	•	Configure Jest – npx ts-jest config:init, set testEnvironment: "node"
	•	CI pipeline – GitHub Actions: lint → test → build Docker image
	•	Dockerisation – multistage Dockerfile + docker-compose.yml (api, mysql, redis)

:bulb: Outcome: container starts but does nothing yet.

⸻

Stage 1 «Hello, Telegram» — 0.5 day
	•	Create bot via @BotFather; store TELEGRAM_BOT_TOKEN in .env
	•	Minimal handler (src/telegram/bot.ts) – /ping → “pong”
	•	Jest test – mock Telegraf, expect reply('pong')

:bulb: Outcome: you can send /ping and get a reply.

⸻

Stage 2 «WhatsApp login & echo» — 1 day
	•	Integrate Baileys (src/whatsapp/index.ts)
	•	Generate QR and post to Telegram with sendPhoto
	•	Persist creds in baileys_auth on creds.update
	•	Command /wa <jid> <text> forwards message to WhatsApp
	•	Jest test – mock Baileys socket, assert sendMessage

:bulb: Outcome: bot sends arbitrary text from your personal WA account.

⸻

Stage 3 «Simple LLM agent» — 1 day
	•	Add OPENAI_API_KEY to .env
	•	Agent skeleton (src/agents/turkishNegotiator.ts)
	•	System prompt: “Native Turkish speaker …”
	•	generateGreeting(name)
	•	Command /greet – generate text & send to barber
	•	Jest test – mock OpenAI endpoint, ensure prompt has name

:bulb: Outcome: bot produces live Turkish greeting.

⸻

Stage 4 «State Machine v1 — Greeting → AskSlots» — 2 days
	•	pnpm add xstate
	•	Define FSM (greet → askSlots → done)
	•	Await reply, transition, ask “Hangi saatler müsait?”
	•	Parser v0 – regex for HH:MM
	•	Jest e2e – fake barber replies “15:30”, FSM reaches done

:bulb: Outcome: full loop prints recognised time to logs.

⸻

Stage 5 «Google Calendar & slot ranges» — 1.5 days
	•	Obtain Google OAuth creds (desktop flow)
	•	Tool createCalEvent
	•	Parser emits JSON {start,end}
	•	On valid slot create event and finish FSM
	•	Jest test – mock googleapis, assert call params

:bulb: Outcome: meeting really appears in Google Calendar.

⸻

Stage 6 «Persistence & restart safety» — 1 day
	•	Prisma schema – User, Barber, ConversationLog, Appointment, WaSession
	•	Persist each FSM step & raw messages
	•	On restart reload state & resume
	•	Jest test – simulate crash, ensure state restored

:bulb: Outcome: app survives container restarts.

⸻

Stage 7 «Human touch 2.0 & resilience» — 1 day
	•	sendHumanLike – typing indicator + random delay
	•	Retry logic – 10-min timeout → reminder → escalation
	•	Language fallback – auto-detect EN responses
	•	Jest tests – fake timers for timeout branch; assert Telegram escalation

:bulb: Outcome: agent converses naturally & pings you only on success/failure.

⸻

Stage 8 «Production hardening» — 2 days
	•	WhatsApp rate-limiter (≤1 msg/s)
	•	Sentry / OpenTelemetry tracing
	•	Prometheus metrics (dialogs, errors)
	•	GitHub Actions → Fly.io deploy (multi-region)
	•	Load-test (Artillery) – 20 concurrent users
	•	Update README (add npm run wa:login)

:bulb: Outcome: CI-built image deploys to prod in one command.

⸻

Test utilities

Helper	Purpose	Use in tests
createFakeBaileys()	Simulate messages.upsert, connection.update	Jest
mockOpenAI()	Intercept fetch to api.openai.com	Jest
advanceTimersByDialog()	Drive FSM with fake timers	Jest


⸻

:rocket: Tip: copy this file to docs/roadmap.md, mark tasks [x] as you progress, run tests (npm run test) before closing each stage.
