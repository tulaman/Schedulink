Schedulink

Self-care errands, handled autonomously.

Schedulink is a Telegram-controlled agent that chats in WhatsApp as you, books appointments, and drops the event straight into your calendar — without further input.

⸻

Features
	•	One command → appointment:  /haircut <barber_jid> <client_name> [barber_name]
	•	Human-like WhatsApp dialogue with OpenAI Agents SDK
	•	Supports Turkish barber communication (extensible to other languages)
	•	Google Calendar auto-sync with reminders
	•	Conversational AI agent replaces finite state machine
	•	**Database persistence**: Conversations survive app restarts
	•	**Automatic recovery**: Resume incomplete conversations on startup
	•	**Complete tracking**: All messages, appointments, and context preserved
	•	Built with Node 20 + TypeScript & OpenAI Agents SDK + Prisma

⸻

Quick Start

Prerequisites
	•	Node 20 LTS + pnpm ≥ 9
	•	OpenAI API Key
	•	Telegram Bot Token

# 1. Clone
$ git clone https://github.com/tulaman/Schedulink.git
$ cd Schedulink

# 2. Install deps
$ pnpm install

# 3. Create .env file with your keys
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
GOOGLE_CLIENT_ID=your_google_client_id (optional for calendar)
GOOGLE_CLIENT_SECRET=your_google_client_secret (optional for calendar)

# 4. Run in watch mode
$ pnpm dev

# 5. Connect WhatsApp
Open Telegram, send /qr to your bot to get WhatsApp QR code, scan it with your phone.

# 6. Start booking appointments
/haircut <barber_whatsapp_number@c.us> <your_name> [barber_name]

⸻

New Commands

Command	What it does
/ping	Test bot connection
/qr	Get WhatsApp QR code for login
/haircut <jid> <name> [barber]	Start appointment booking with barber
/wa <jid> <text>	Send manual WhatsApp message
/greet <jid> <name>	Legacy greeting command

⸻

How It Works

1. **Send /haircut command** → Agent generates Turkish greeting message
2. **Agent sends to barber** → Automatic WhatsApp message sent
3. **Barber responds** → Agent continues conversation naturally
4. **Appointment confirmed** → Agent adds [CONFIRMED:HH:MM] tag
5. **Calendar event created** → Automatic Google Calendar entry

⸻

Configuration (.env)

TELEGRAM_BOT_TOKEN=xxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=... (optional)
GOOGLE_CLIENT_SECRET=... (optional)

⸻

Project Structure

├─ src
│  ├─ telegram/       # Telegraf bot
│  ├─ whatsapp/       # Baileys wrapper with auto-conversation
│  ├─ agents/         # OpenAI Agents SDK conversational agent
│  │  ├─ barberAgent.ts    # Main conversational agent
│  │  └─ turkishNegotiator.ts # Legacy functions
│  ├─ calendar/       # Google Calendar integration
│  └─ index.ts
├─ tests/             # Jest suites
├─ docker-compose.yml
└─ docs/roadmap.md

⸻

Development Status

Current implementation (Stage 6): ✅ **Persistence & Restart Safety Complete**
- Database persistence with Prisma + SQLite/MySQL
- Conversation recovery after application restarts
- Automatic conversation and appointment tracking
- Comprehensive test coverage with crash simulation
- Conversational AI agent for Turkish barber communication
- Calendar integration with confirmed appointments

See docs/roadmap.md for detailed progress.

⸻

Contributing
	1.	Fork & create feature branch feat/short-desc.
	2.	pnpm test must stay green.
	3.	Open PR — GitHub Actions will lint, test and build.

Commit convention

Follow the user rules for commit messages:
- ✨ for new features
- 🐛 for bug fixes  
- 🎨 for refactoring and code improvements
- 🔧 add or update configuration file

⸻

License

This project is licensed under the MIT License — see LICENSE for details.

⸻

Acknowledgements
	•	Baileys by @adiwajshing — WhatsApp Web library
	•	OpenAI Agents SDK for conversational AI
	•	Telegraf for Telegram bot

Happy automating! 🎉
