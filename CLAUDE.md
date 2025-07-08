# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Schedulink is a Telegram-controlled agent that automates appointment booking via WhatsApp. It uses conversational AI to communicate with barbers in Turkish, books appointments, and syncs them to Google Calendar.

## Development Commands

### Essential Commands
- `pnpm dev` - Run in development mode with file watching
- `pnpm build` - Compile TypeScript to JavaScript
- `pnpm start` - Run the compiled application
- `pnpm test` - Run Jest test suite
- `pnpm lint` - Currently skipped (echo 'skip lint')

### Database Commands
- Database migrations are handled automatically by Prisma
- `npx prisma migrate dev` - Create and apply new migration
- `npx prisma generate` - Generate Prisma client after schema changes
- `npx prisma studio` - Open database browser

### Docker Commands
- `pnpm build:docker` - Build Docker image
- `docker-compose up` - Run with Docker Compose

## Architecture Overview

### Core Components

**Multi-Platform Integration:**
- **Telegram Bot** (`src/telegram/bot.ts`) - Controls the system via commands like `/haircut`, `/qr`, `/wa`
- **WhatsApp Client** (`src/whatsapp/index.ts`) - Handles WhatsApp messaging using Baileys library
- **OpenAI Agent** (`src/agents/barberAgent.ts`) - Conversational AI for natural Turkish dialogue

**Data Persistence:**
- **Database Service** (`src/database/service.ts`) - Prisma-based persistence layer
- **Prisma Schema** (`prisma/schema.prisma`) - SQLite database with Users, Barbers, ConversationLogs, Appointments
- **Conversation Recovery** - Incomplete conversations are restored on startup

**Key Features:**
- **JID Normalization** - WhatsApp JIDs are normalized for consistent lookup (`normalizeJid()`)
- **Human-like Messaging** - Typing indicators and realistic delays (`sendHumanLike()`)
- **Timeout Management** (`src/timeout/manager.ts`) - Tracks unanswered messages
- **Google Calendar Integration** (`src/calendar/google.ts`) - Auto-sync confirmed appointments

### Message Flow

1. User sends `/haircut <jid> <name> [barber]` to Telegram bot
2. System calls `startConversationWithBarber()` to generate initial Turkish message
3. Message sent to barber via WhatsApp with human-like behavior
4. Barber responses trigger `continueConversationWithBarber()` for natural dialogue
5. When appointment confirmed (marked with `[CONFIRMED:HH:MM]`), system:
   - Creates calendar event
   - Saves appointment to database
   - Sends Telegram notification
   - Marks conversation as completed

### Database Schema

- **Users** - Telegram users who control the system
- **Barbers** - WhatsApp contacts (identified by normalized JID)
- **ConversationLogs** - All messages with type (sent/received/system) and completion status
- **Appointments** - Confirmed bookings with calendar integration
- **WaSession** - WhatsApp session persistence

### Environment Variables

Required:
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `OPENAI_API_KEY` - OpenAI API key for conversational agent

Optional:
- `GOOGLE_CLIENT_ID` - Google Calendar integration
- `GOOGLE_CLIENT_SECRET` - Google Calendar integration
- `DATABASE_URL` - Prisma database URL (defaults to SQLite)

## Testing

- Test files in `tests/` directory
- Jest configuration in `jest.config.js`
- Tests cover: barber agent, calendar integration, JID normalization, persistence, Telegram/WhatsApp integration

## Key Implementation Details

### JID Normalization
All WhatsApp JIDs are normalized to `<phone_number>@s.whatsapp.net` format for consistent database lookups. The system includes migration logic to normalize existing JIDs.

### Conversation Context
Conversations persist across app restarts. Context includes client name, barber name, and completion status. The system automatically recovers incomplete conversations on startup.

### Turkish Language Support
The barber agent is specifically trained for Turkish barber communication patterns and uses natural, colloquial Turkish for appointment booking.

### Error Handling
- WhatsApp connection failures trigger automatic reconnection
- Database errors are logged but don't crash the application
- Failed calendar events are logged but don't prevent appointment confirmation

## Commit Convention

Follow these emoji prefixes:
- ✨ for new features
- 🐛 for bug fixes
- 🎨 for refactoring and code improvements
- 🔧 for configuration changes