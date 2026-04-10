# Planner — Personal AI Email & Calendar Assistant

A personal-use PWA that connects to Gmail and Google Calendar, classifies emails with AI, drafts replies, detects meetings/deadlines, and gives you full approval control before any action is taken.

## Features

- **Inbox Assistant** — AI summarizes, classifies, and drafts replies for each email
- **Review Queue** — Approve, edit, reject, or snooze AI suggestions before anything is sent
- **Calendar & Planner** — Google Calendar + manual events, tasks, study blocks, reminders
- **Email → Calendar** — Detects meetings and deadlines from emails, suggests adding them
- **Phone notifications** — PWA-installable with Web Push support
- **Approval-first** — Nothing is auto-sent or auto-created without your explicit approval
- **AI abstraction** — Works with mock AI (no key needed) or OpenAI; swap providers in Settings

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo>
cd PlannerApp
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | SQLite path: `file:./dev.db` |
| `AUTH_SECRET` | Random secret: `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `AI_PROVIDER` | `mock` (default) or `openai` |
| `OPENAI_API_KEY` | Only needed when `AI_PROVIDER=openai` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional: for push notifications |
| `VAPID_PRIVATE_KEY` | Optional: for push notifications |

### 3. Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Go to **APIs & Services → Library** and enable:
   - **Gmail API**
   - **Google Calendar API**
4. Go to **APIs & Services → Credentials**
5. Create **OAuth 2.0 Client ID** → Web application
6. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
7. Copy Client ID and Secret to `.env.local`

### 4. Database setup

```bash
npx prisma db push
```

### 5. (Optional) Seed demo data

```bash
npm run db:seed
```

This creates sample emails, approval items, and planner items so you can explore the UI without connecting Gmail.

### 6. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google.

### 7. (Optional) Push notifications

```bash
npx web-push generate-vapid-keys
```

Copy the keys to `.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

---

## Architecture

```
src/
  app/
    (auth)/login/          # Login page
    (dashboard)/           # Protected app pages
      dashboard/           # Today's overview
      inbox/               # Email assistant
      queue/               # Review queue
      calendar/            # Calendar + planner
      settings/            # Settings
    api/                   # Route handlers
  components/
    ui/                    # Base UI components (shadcn-compatible)
    layout/                # Sidebar, header
    email/                 # Inbox list + email view
    calendar/              # Calendar views + create dialog
    queue/                 # Approval cards
    dashboard/             # Dashboard widgets
  lib/
    auth.ts               # Auth.js v5 config + token refresh
    db.ts                 # Prisma client singleton
    gmail/                # Gmail sync, parser, client
    calendar/             # Google Calendar client
    ai/                   # AI provider abstraction
      mock.ts             # Deterministic mock (no API key needed)
      openai.ts           # OpenAI implementation
      provider.ts         # Factory (switches based on AI_PROVIDER env)
    push/                 # Web Push server module
prisma/
  schema.prisma           # SQLite schema (SQLite → Postgres: change one line)
public/
  sw.js                   # Service worker (push + offline)
  manifest.json           # PWA manifest
```

## Database (Prisma + SQLite)

Key models:

- `Profile` — Single-user profile with Google OAuth tokens
- `Email` — Gmail messages with AI enrichment
- `ReplyDraft` — AI-suggested replies pending approval
- `CalendarSuggestion` — Events extracted from emails
- `ApprovalItem` — Unified approval queue
- `PlannerItem` — Manual events, tasks, reminders, study blocks
- `Task` — Action items extracted from emails
- `PushSubscription` — Web push endpoints
- `Settings` — Per-profile settings
- `AuditLog` — Action history

### Upgrade to PostgreSQL

Change one line in `.env.local`:
```
DATABASE_URL="postgresql://user:password@host:5432/plannerapp"
```

Then change `provider = "sqlite"` to `provider = "postgresql"` in `prisma/schema.prisma`.

## AI Provider

The AI layer (`src/lib/ai/`) is fully abstracted behind an `AIProvider` interface:

```typescript
interface AIProvider {
  summarizeEmail(content): Promise<EmailSummary>
  classifyEmail(content): Promise<EmailClassification>
  suggestReply(content, style): Promise<ReplySuggestion>
  extractCalendarEvent(content): Promise<CalendarEventSuggestion | null>
  extractTasksAndDeadlines(content): Promise<TaskExtraction[]>
}
```

- **Mock provider** — Keyword-based detection, deterministic output, zero API calls
- **OpenAI provider** — Uses `gpt-4o-mini` with JSON mode
- **To add Anthropic/etc**: implement the `AIProvider` interface and register in `provider.ts`

## Safety Philosophy

All AI actions default to **approval-first**:

- Reply drafts go to the Review Queue — never sent automatically
- Calendar suggestions require approval before creation in Google Calendar
- `autoSendReplies` and `autoCreateEvents` are `false` by default in Settings
- Every approval action is recorded in `AuditLog`

## PWA Installation

Visit the app in Chrome/Edge/Safari on any device → "Add to Home Screen" / install prompt.

Push notifications require HTTPS in production (localhost works for development).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run db:push` | Sync schema to database |
| `npm run db:studio` | Open Prisma Studio (GUI) |
| `npm run db:seed` | Seed demo data |
