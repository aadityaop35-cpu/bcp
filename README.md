# Discord Application/Tryout Bot

A production-ready, modular Discord bot built with **TypeScript + discord.js v14 + MongoDB/Mongoose**. Staff configure everything — embeds, applications, questions, ticket routing, staff roles, logging — entirely through Discord slash commands, buttons, select menus, and modals. Nothing important lives only in memory: the bot can restart, redeploy, or crash mid-application and pick back up from MongoDB.

---

## 🩹 Changelog (this delivery)

- **Fixed:** `/embed create` → `/embed edit`/`/embed view`/`/embed send` on a brand-new (unconfigured) embed threw `DiscordAPIError[50035]: Invalid Form Body`. Discord rejects an embed with literally nothing set (no title/description/fields/image/thumbnail/author). `buildEmbedFromDoc` in `src/utils/discord.ts` now falls back to a placeholder description ("*This embed hasn't been configured yet...*") whenever an embed is otherwise empty, so create → edit → send all work immediately, before you've added any content.
- **Fixed:** the "Supplying `ephemeral` for interaction response options is deprecated" runtime warning — every `ephemeral: true` on an actual Discord API call (`interaction.reply`, `editReply`, etc.) was switched to `flags: MessageFlags.Ephemeral` across all commands/interactions. (`BotError`'s own internal `{ ephemeral: true }` option — unrelated to the Discord API — was left as-is.)
- Verified: full `tsc --noEmit` typecheck passes with zero errors, and a clean `npm install && npm run build` succeeds from scratch.

---


## ✅ What's implemented

- **Core config** (`src/config/core.ts`) — only developer-level secrets (bot token, Mongo URI, dev user IDs, bootstrap staff roles) come from `.env`. Everything else is DB-driven.
- **Reusable permission system** (`PermissionService` + `utils/permissions.ts`) — developer-only guard, guild-staff guard (DB roles ∪ bootstrap env roles ∪ Administrator), and per-application staff guard.
- **Full interactive embed builder** — `/embed create|edit|delete|view|send|list|refresh`, plus `/embed field add|remove`, `/embed button add|remove`, `/embed application add|remove|list`. The `edit` subcommand opens a live-updating panel with buttons that launch modals for title/description/URL, author, thumbnail/image, footer, color, and a timestamp toggle.
- **Embed persistence & publishing** — every embed is stored in MongoDB (`Embed` model) and is guild-isolated (unique per `guildId + name`, queries always scoped by `guildId`). Publishing a message records `{channelId, messageId}`; `/embed refresh` (or an application edit) re-renders and edits every live published message.
- **Dynamic application/tryout system** — `/application create|edit|delete|list|view|publish|unpublish|submissions`, plus `/application questions add|edit|remove|reorder|list` and `/application submission view|close`. Any number of questions, of type Short Text / Long Text / Number / Yes-No / Choice / Multiple Choice, each with required/optional, choices, max length, and order.
- **Embed ↔ Application linking by reference** — an embed stores `applicationOptions: [{ applicationId, label, emoji, style, displayAs, row }]`, never a copy of the application. Editing an application and running `/embed refresh` (or via the propagation call in `/embed application add|remove`) updates every embed that references it.
- **DM-based application flow** (`src/interactions/applicationFlow.ts`) — clicking an application button/select checks eligibility (published, no existing in-progress session, duplicate/cooldown rules), DMs the user, and asks questions one at a time with per-type validation. Users can type `cancel` any time. Closed DMs are handled gracefully with a friendly ephemeral error instead of a crash.
- **Resumable sessions** (`ApplicationSession` model) — every answer is saved to MongoDB as it's given. If the bot restarts mid-application, the session document is untouched; the user's next DM continues from where they left off (`ApplicationService.getActiveSessionForUser`). A `ready` event job expires sessions untouched for 7+ days so they don't block re-applying forever.
- **Automatic ticket creation** — on submission, a private channel is created under the application's (or guild's default) ticket category, visible to the applicant, the bot, and **every** configured staff role (guild staff ∪ that application's own `staffRoleIds` — multiple roles fully supported), with the full Q&A embed and Accept/Reject/Request-Info/View/Close buttons.
- **Ping system** — one message pings the applicant and the application's configured ping role, no repeated pings.
- **Ticket decision flow** — Accept/Reject saves the reviewer + timestamp, applies configured accepted/rejected roles (and can remove a role, e.g. an "Applicant" role, on accept), DMs the applicant (with a graceful fallback message if their DMs are closed), and disables the buttons. "Request More Info" opens a modal and DMs the applicant. "Close" locks in the closed status and deletes the channel after a short delay.
- **Guild-scoped logging** — every major event (application started/submitted, ticket created, accepted/rejected/closed/cancelled, embed created/edited/deleted, config changed) is written to the `AuditLog` collection (survives restarts) and, if `/settings logs set` is configured, mirrored to a channel.
- **Central error handling** (`utils/errors.ts`) — typed `BotError`/`PermissionError`/`NotFoundError`/`ValidationError`, a single `handleInteractionError` used by the interaction router, and defensive handling of deleted channels/roles/messages throughout the services.
- **Developer tools** — `/bot-config view` (env config, secrets redacted), `/database status` (connection + document counts), `/database purge-guild` (confirmation-gated permanent wipe of one guild's data), `/reload` (re-registers slash commands for the current guild or globally without a process restart).
- **Guild isolation everywhere** — every Mongoose query for `Embed`, `Application`, `ApplicationSubmission`, `ApplicationSession`, and `GuildConfig` is scoped by `guildId`; `Embed`/`Application` names are unique **per guild**, not globally.

## ⚠️ Known limitations / what you may want to extend

- **`applicationOptions`/select-menu limits**: Discord allows at most 5 action rows and 25 options per select menu. `buildEmbedComponents` distributes buttons across rows and chunks select options, but if you attach so many applications that they don't fit in 5 rows total, the overflow is silently dropped rather than erroring — worth adding an explicit warning to staff if you expect to hit this.
- **Autocomplete** is wired up for `embed` and `application` name fields in `/embed`. `/application`'s own autocomplete function was not added in this pass — the options still work by typing the exact name or ID, but tab-completion isn't live for that command yet. Copy the pattern from `src/commands/embed/embed.ts`'s `autocomplete` export if you want it.
- **`ApplicationSession.getActiveSessionForUser`** looks up sessions by `userId` only (DMs have no guild context) and takes the most-recently-touched one. If a single user is mid-application in two different servers at once, only the most recent one will receive their next DM reply — an edge case worth a "which application are you answering?" disambiguation prompt if that matters for your use case.
- **No automated tests** were written (out of scope for this pass) — recommend adding integration tests around `ApplicationService` eligibility/cooldown logic and `EmbedService.refreshPublished`, since those have the most branching.
- **Rate limits**: ticket creation, role application, and embed refresh all make sequential Discord API calls per-item (e.g. one role fetch per staff role). Fine at normal scale; if you expect dozens of staff roles or very high submission volume, consider batching/backoff.
- **PublishedMessage** is stored *embedded* inside each `Embed` document rather than as the separate top-level collection sketched in the original spec — this was an intentional simplification (a publish record only ever makes sense in the context of its parent embed, and Mongo document size limits are a complete non-issue at this scale). If you specifically want a separate collection (e.g. to query "all messages in channel X" without scanning embeds), it's a small refactor: pull `IPublishedMessage` into its own model with an `embedId` ref.

---

## 📁 Project structure

```
src/
├── commands/
│   ├── embed/embed.ts              /embed ...
│   ├── application/application.ts  /application ...
│   ├── ticket/ticket.ts            /ticket ...
│   ├── settings/settings.ts        /settings ...
│   └── admin/
│       ├── bot-config.ts           /bot-config (developer)
│       ├── database.ts             /database (developer)
│       └── reload.ts               /reload (developer)
├── events/
│   ├── interactionCreate.ts        central command/button/select/modal router
│   ├── messageCreate.ts            routes DMs into the application flow
│   ├── ready.ts                    startup log + stale-session cleanup
│   └── guildDelete.ts
├── models/
│   ├── Embed.ts
│   ├── Application.ts
│   ├── ApplicationSubmission.ts
│   ├── ApplicationSession.ts
│   ├── GuildConfig.ts
│   ├── AuditLog.ts
│   └── modelHelper.ts              hot-reload-safe model registration
├── services/
│   ├── EmbedService.ts
│   ├── ApplicationService.ts
│   ├── TicketService.ts
│   ├── PermissionService.ts
│   ├── LoggingService.ts
│   └── DatabaseService.ts
├── interactions/
│   ├── embedEditorPanel.ts         panel + modal builders for /embed edit
│   ├── applicationFlow.ts          DM question flow (start/validate/resume)
│   ├── buttons/                    embed editor, ticket actions, app-start, db purge
│   └── modals/                     embed editor, ticket "request info"
├── utils/
│   ├── permissions.ts
│   ├── validation.ts
│   ├── discord.ts                  embed/component rendering, pagination
│   └── errors.ts
├── config/core.ts
├── deploy-commands.ts
└── index.ts
```

---

## 🛠 Setup

### 1. Prerequisites
- Node.js **v24+**
- A MongoDB instance (local, Docker, or [MongoDB Atlas](https://www.mongodb.com/atlas) free tier)
- A Discord application + bot (create one at the [Discord Developer Portal](https://discord.com/developers/applications))

### 2. Discord application setup
1. Create an application → **Bot** tab → add a bot, copy the **token**.
2. Under **Bot**, enable these **Privileged Gateway Intents**:
   - `SERVER MEMBERS INTENT` (needed to fetch members for role checks)
   - `MESSAGE CONTENT INTENT` (needed to read DM answers during the application flow)
3. Under **OAuth2 → URL Generator**, select scopes `bot` and `applications.commands`, and at minimum these bot permissions: `Manage Channels`, `Manage Roles`, `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Manage Messages`. Use the generated URL to invite the bot to your server.
4. Copy the **Application (Client) ID** from the **General Information** tab.

### 3. Install & configure
```bash
git clone <this repo>
cd discord-bot
npm install
cp .env.example .env
```

Fill in `.env`:
```dotenv
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DEV_GUILD_ID=your-test-server-id     # optional, for instant command sync while developing
MONGO_URI=mongodb://127.0.0.1:27017/application-bot
STAFF_ROLE_IDS=                       # optional bootstrap staff roles, comma-separated
DEVELOPER_USER_IDS=your-user-id       # required for /bot-config, /database, /reload
```

### 4. Deploy slash commands
```bash
npm run deploy
```
This registers commands to `DEV_GUILD_ID` if set (near-instant), otherwise globally (can take up to ~1 hour to appear everywhere).

### 5. Run the bot
```bash
# Development (auto-restart on file changes)
npm run dev

# Production
npm run build
npm start
```

### 6. First-run configuration (in Discord)
1. `/settings staff add role:@Staff` — grant your staff role access to staff-only commands.
2. `/settings logs set channel:#bot-logs` — (optional) mirror audit events to a channel.
3. `/settings tickets category:#Applications` — (optional) default category for ticket channels.
4. `/application create name:"Vanguard Tryout"` then `/application questions add ...` for each question, then `/application publish`.
5. `/embed create name:"apply-hub"`, style it via `/embed edit`, then `/embed application add embed:apply-hub application:"Vanguard Tryout" label:"⚔️ Vanguard Tryout" display_as:BUTTON`.
6. `/embed send embed:apply-hub channel:#applications` — this is the live message users click to apply.

That's it — staff never need to touch code or `.env` again for day-to-day configuration.

---

## 🌐 Deploying on Render (or any free host) without it sleeping

The bot now runs a tiny built-in HTTP health-check server (`src/keepAlive.ts`) alongside the Discord client. This exists because Render's free **Web Service** tier spins your process down after ~15 minutes with no inbound HTTP traffic — a Discord bot normally never receives HTTP traffic, so it would get killed constantly.

**How it works:**
- On startup, the bot binds to `process.env.PORT` (Render sets this automatically) and serves a JSON status response on `GET /` and `GET /health`.
- Point an external uptime pinger at your Render service's public URL, hitting it every 5–10 minutes:
  - [UptimeRobot](https://uptimerobot.com) (free, 5-minute interval)
  - [cron-job.org](https://cron-job.org) (free)
  - [Better Uptime](https://betteruptime.com)
- Every ping counts as traffic, so Render never spins the service down.

**Render setup:**
1. Create a new **Web Service** (not a Background Worker) pointing at your repo.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Add your `.env` variables in Render's Environment tab (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGO_URI`, `DEVELOPER_USER_IDS`, etc.) — you do **not** need to set `PORT`, Render provides it.
5. Once deployed, copy the public URL Render gives you (e.g. `https://your-bot.onrender.com`) and add it to your uptime checker of choice, pinging `/health`.

> Note: Render's free tier still enforces a monthly usage cap and can restart the instance periodically for platform maintenance regardless of uptime pinging — this keeps it from idling out due to inactivity, but isn't a guarantee of 100% uptime. For anything mission-critical, a paid tier or a host built for long-running workers is more reliable.

## 🔐 Permission summary

| Command | Access |
|---|---|
| `/bot-config`, `/database`, `/reload` | `DEVELOPER_USER_IDS` only |
| `/embed`, `/application`, `/ticket`, `/settings` | Guild staff (configured roles, or Administrator, or a developer) |
| Ticket action buttons (Accept/Reject/Info/Close) | Guild staff **or** that specific application's own `staffRoleIds` |

## 🗄 Data model at a glance

- `Embed` — one document per named embed, embeds fields/buttons/applicationOptions/publishedMessages inline.
- `Application` — one document per application, questions stored inline with stable IDs so reordering/removal never breaks references.
- `ApplicationSubmission` — one per completed application (`PENDING → ACCEPTED|REJECTED → CLOSED`, or `CANCELLED`).
- `ApplicationSession` — one per in-progress DM flow (`IN_PROGRESS → COMPLETED|CANCELLED|EXPIRED`); this is what makes restarts safe.
- `GuildConfig` — per-guild staff roles, log channel, default ticket category.
- `AuditLog` — append-only event log, guild-scoped.

All are indexed on `guildId` (and `guildId + name` where uniqueness matters), so one server can never see or collide with another's data.
"# bcp" 
