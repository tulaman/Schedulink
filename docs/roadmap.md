Roadmap

Principle: After every stage the application starts via npm run dev and delivers a vertical slice of new functionality.
Stack: Node 20 LTS, TypeScript, pnpm, Prisma, Baileys, Telegraf, @openai/agents, Jest (+ts-jest), Docker Compose.

⸻

Stage 0 «Bootstrap & CI» — 1 day
- [x] Create GitHub repository
- [x] Project init – pnpm init, commit tsconfig.json (target: es2022, module: es2022)
- [x] Install deps

pnpm add telegraf baileys @openai/agents dotenv prisma @prisma/client
pnpm add -D typescript ts-node-dev jest ts-jest @types/jest
- [x] Configure Jest – npx ts-jest config:init, set testEnvironment: "node"
- [x] CI pipeline – GitHub Actions: lint → test → build Docker image
- [x] Dockerisation – multistage Dockerfile + docker-compose.yml (api, mysql, redis)

:bulb: Outcome: container starts but does nothing yet.

⸻

Stage 1 «Hello, Telegram» — 0.5 day
 - [x] Create bot via @BotFather; store TELEGRAM_BOT_TOKEN in .env
 - [x] Minimal handler (src/telegram/bot.ts) – /ping → "pong"
 - [x] Jest test – mock Telegraf, expect reply('pong')

:bulb: Outcome: you can send /ping and get a reply.

⸻

Stage 2 «WhatsApp login & echo» — 1 day
- [x] Integrate Baileys (src/whatsapp/index.ts)
- [x] Generate QR and post to Telegram with sendPhoto
- [x] Persist creds in baileys_auth on creds.update
- [x] Command /wa <jid> <text> forwards message to WhatsApp
- [x] Jest test – mock Baileys socket, assert sendMessage

:bulb: Outcome: bot sends arbitrary text from your personal WA account.

⸻

Stage 3 «Simple LLM agent» — 1 day
- [x] Add OPENAI_API_KEY to .env
- [x] Agent skeleton (src/agents/turkishNegotiator.ts)
- [x] System prompt: "Native Turkish speaker ..."
- [x] generateGreeting(name)
- [x] Command /greet – generate text & send to barber
- [x] Jest test – mock OpenAI endpoint, ensure prompt has name

:bulb: Outcome: bot produces live Turkish greeting.

⸻

Stage 4 «State Machine v1 — Greeting → AskSlots» — 2 days
- [x] pnpm add xstate
- [x] Define FSM (greet → askSlots → done)
- [x] Await reply, transition, ask "Hangi saatler müsait?"
- [x] Parser v0 – regex for HH:MM
- [x] Jest e2e – fake barber replies "15:30", FSM reaches done

:bulb: Outcome: full loop prints recognised time to logs.

⸻

Stage 5 «Google Calendar & slot ranges» — 1.5 days
- [x] Obtain Google OAuth creds (desktop flow)
- [x] Tool createCalEvent
- [x] Parser emits JSON {start,end}
- [x] On valid slot create event and finish FSM
- [x] Jest test – mock googleapis, assert call params

:bulb: Outcome: meeting really appears in Google Calendar.

⸻

Stage 5.5 «Migration to OpenAI Agents SDK» — 1.5 days
- [x] Replace XState FSM with OpenAI Agents SDK conversational agent
- [x] Create barberAgent.ts - main conversational agent for Turkish barber communication
- [x] Implement conversation memory and context handling
- [x] Add time extraction and calendar booking (via regex parsing in response)
- [x] Update Telegram bot to use new agent architecture
- [x] Update WhatsApp integration to forward messages to agent
- [x] Refactor turkishNegotiator.ts logic into agent (integrated into barberAgent)
- [x] Jest tests - mock OpenAI Agents, test conversation flow

:bulb: Outcome: fully conversational agent replaces finite state machine.

⸻

Stage 6 «Persistence & restart safety» — 1 day
	•	Prisma schema – User, Barber, ConversationLog, Appointment, WaSession
	•	Persist each agent conversation & raw messages
	•	On restart reload conversation history & resume
	•	Jest test – simulate crash, ensure conversation restored

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
mockOpenAIAgents()	Mock OpenAI Agents SDK responses	Jest
advanceTimersByDialog()	Drive agent with fake timers	Jest


⸻

:rocket: Tip: copy this file to docs/roadmap.md, mark tasks [x] as you progress, run tests (npm run test) before closing each stage.
