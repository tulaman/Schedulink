# Schedulink – Project Specification

*Version*: 0.1  *Last updated*: 26 Jun 2025

---

## 1 Overview

Schedulink is an autonomous personal‑assistant service that books self‑care appointments (haircuts, manicures, massage, etc.) on behalf of a user.  The agent receives a request in Telegram, conducts a natural WhatsApp dialogue **from the user’s own account** to negotiate an appointment, and finally places a calendar entry and notifies the user.

---

## 2 Objectives

|  ID  |  Goal                         | Metric                                     |
| ---- | ----------------------------- | ------------------------------------------ |
|  O‑1 | Minimise user interaction     | ≤ 1 Telegram message per booking           |
|  O‑2 | Human‑like conversation       | Barber CSAT ≥ 4⁄5 in pilot survey          |
|  O‑3 | Fault tolerance               | 99 % successful bookings across 100 trials |
|  O‑4 | Easy extension to new errands | ≤ 2 h to add a new service type            |

---

## 3 Scope (Initial MVP)

* Haircut booking with a single known barber.
* Telegram command `/haircut` triggers the workflow.
* Turkish language only.
* Google Calendar integration.

Out‑of‑scope for MVP: payments, multiple time‑zones, voice messages, multi‑user deployment.

---

## 4 Stakeholders

| Role                  | Interest                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| **End user**          | Wants seamless booking without chat micromanagement.                   |
| **Barber / Provider** | Receives clear, friendly WhatsApp messages and confirmed appointments. |
| **Dev team**          | Maintainable Node/TypeScript code base with CI.                        |
| **Platform Ops**      | Need observability, secure secret storage, low cloud cost.             |

---

## 5 Architecture

```
Telegram  <--HTTP-->  Bot (Telegraf)
                             │
                             ▼
                     Orchestrator  (openai‑agents‑js)
                             │ ︎state
                ┌────────────┴───────────┐
                ▼                        ▼
        WhatsApp Relay             Calendar Tool
           (Baileys)              (Google API)
                │                        ▲
                ▼                        │
          Service Provider          MySQL / SQLite
```

**Key components**

1. **Telegram Bot** – entry point, sends QR codes & final summaries.
2. **Orchestrator** – finite‑state machine (XState) plus OpenAI Agents for generation and parsing.
3. **WhatsApp Relay** – Baileys Web‑Socket client authorised via QR‑code; sends human‑like messages.
4. **Calendar Tool** – inserts events in Google Calendar.
5. **Persistence** – Prisma ORM; MySQL (prod) / SQLite (dev).
6. **Redis/BullMQ** – job retries & delays (timeouts, reminders).

---

## 6 Functional Requirements

|  ID  |  Requirement                                               | Priority |
| ---- | ---------------------------------------------------------- | -------- |
|  F‑1 | Telegram command triggers booking flow.                    | Must     |
|  F‑2 | System generates greeting in barber’s language.            | Must     |
|  F‑3 | System asks for available slots & parses reply.            | Must     |
|  F‑4 | System confirms slot & writes event to user calendar.      | Must     |
|  F‑5 | System sends final confirmation to user.                   | Must     |
|  F‑6 | If no reply in 10 min, resend once; after 20 min escalate. | Should   |
|  F‑7 | Persist conversation & FSM state for crash recovery.       | Must     |
|  F‑8 | Support pluggable “service types” (haircut, manicure…).    | Should   |

---

## 7 Non‑functional Requirements

* **Reliability** 99 % booking success, automatic restart on crash.
* **Usability** WhatsApp messages contain ≤ 60 words, occasional emojis, realistic typing delay.
* **Security** All tokens encrypted at rest; QR codes stored ≤ 15 minutes.
* **Performance** Booking completed ≤ 30 s after barber’s confirmation.
* **Scalability** Design for 100 concurrent active conversations.
* **Compliance** No storage of personal messages beyond 30 days (GDPR).

---

## 8 Data Model (Prisma, simplified)

```prisma
model User        { id Int @id @default(autoincrement())
                    tgId   BigInt  @unique
                    tz     String
                    waName String?
                    appointments Appointment[] }

model Barber      { id Int @id @default(autoincrement())
                    name   String
                    waJid  String  @unique
                    lang   String  // e.g. "tr" }

model Appointment { id Int @id @default(autoincrement())
                    userId   Int
                    barberId Int
                    start    DateTime
                    end      DateTime
                    status   String   // proposed | confirmed | failed }

model ConversationLog {
                    id        Int      @id @default(autoincrement())
                    userId    Int
                    barberId  Int
                    state     String
                    direction String   // out | in
                    text      String
                    createdAt DateTime @default(now()) }

model WaSession   { id Int @id @default(autoincrement())
                    userId Int @unique
                    data   Bytes
                    updatedAt DateTime @updatedAt }
```

---

## 9 Interface Contracts

### 9.1 Telegram

| Command    | Payload | Result                    |
| ---------- | ------- | ------------------------- |
| `/haircut` | –       | Starts FSM                |
| `/status`  | –       | Returns current FSM state |

### 9.2 Agent Tools

|  Tool            |  Input                |  Output            |
| ---------------- | --------------------- | ------------------ |
| `sendWa`         | `{jid,text}`          | none               |
| `waitForReply`   | `{jid,timeout}`       | `string` (message) |
| `createCalEvent` | `{start,end,summary}` | `eventId`          |

---

## 10 State Machine (v1)

* **greet** → **askSlots** → **confirm** → **book** → **done**
* Timeouts handled in each state (see F‑6).

---

## 11 Security & Compliance

1. Secrets stored in Fly.io Secrets / local `.env` (dev).
2. QR codes never logged; creds encrypted with AES‑256.
3. Rate‑limit WhatsApp to 1 msg/s to avoid lockout.
4. Opt‑in consent text stored with user profile.

---

## 12 Testing Strategy

* **Unit** business logic, state transitions (Jest, 90 % cover).
* **Integration** mock Baileys, OpenAI, Google.
* **E2E** docker‑compose with fake provider number.
* **Load** Artillery scenario (`20 VU × 5 min`).

---

## 13 Deployment & Ops

|  Env     |  URL                      |  DB    |  Secrets source |  Notes                |
| -------- | ------------------------- | ------ | --------------- | --------------------- |
|  Dev     | `localhost:3000`          | SQLite | `.env`          | `pnpm dev` watches TS |
|  Staging | Fly.io app `schedulink-stg` | MySQL  | Fly Secrets     | nightly auto‑deploy   |
|  Prod    | Fly.io app `schedulink`     | MySQL  | Fly Secrets     | manual tag deploy     |

Monitoring: Prometheus exporter → Grafana; alerts via Telegram.

---

## 14 Glossary

| Term        | Meaning                                        |
| ----------- | ---------------------------------------------- |
| **Baileys** | Node.js WhatsApp‑Web library (multi‑device).   |
| **JID**     | Jabber ID – WhatsApp internal user identifier. |
| **FSM**     | Finite‑state machine.                          |
| **LLM**     | Large Language Model (OpenAI GPT‑4o).          |

---

*End of Specification*
