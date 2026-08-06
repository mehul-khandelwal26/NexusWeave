# NexusWeave Audit Report

**Date:** 2026-08-06  
**Scope:** Full-stack productivity app (HTML/CSS/JS + Express + MongoDB Atlas)  
**Goal:** Fix bugs preventing correct frontend ↔ backend ↔ database operation

---

## 1. Bug Report

| # | Issue | Severity | Cause | File(s) | Fix |
|---|--------|----------|-------|---------|-----|
| 1 | `backend/.env` tracked in git (DB credentials risk) | Critical | No `.gitignore`; secrets committed | repo root | Added `.gitignore`; removed `.env` from git index. **Rotate Atlas password** if the repo was ever shared. |
| 2 | Static server exposed `/backend/.env` | Critical | `express.static` served entire repo | `backend/server.js` | Serve only `/pages`, `/styles`, `/scripts`; block `/backend` with 404 |
| 3 | Personal users could see/edit others’ projects & tasks | Critical | `organizationId: null` matched all personal docs (`null === null`) | `routes/projects.js`, `routes/tasks.js` | Org clauses/ownership only when `orgId` is truthy (`sameOrg` helper) |
| 4 | Org join/leave left stale JWT (`orgId`/`role`) | High | Membership updated in Mongo but token not re-issued | `routes/orgs.js`, `routes/auth.js` | Return fresh `{ token, user }` after join/leave/promote/remove; `/auth/me` re-issues token |
| 5 | Hardcoded JWT secret fallback | High | `process.env.JWT_SECRET \|\| '…'` | `middleware/auth.js`, routes, WS | Shared `utils/jwt.js`; server exits if `JWT_SECRET` missing |
| 6 | Admin org UI failed on clean browser | High | `getOrgFull` read only `localStorage.nw_orgs` | `api-client.js`, `org/org.js` | Added `GET /api/orgs/:id`; client `fetchOrganization` + cache |
| 7 | Profile edits never persisted to Mongo | High | Profile form wrote localStorage only | `profile.js`, `routes/auth.js` | Added `PATCH /api/auth/me`; client `updateProfile` |
| 8 | API/WS hardcoded `localhost:4000` | Medium–High | Absolute URL in client | `api-client.js`, `socket-service.js` | Relative `/api`; WS uses `window.location.host` |
| 9 | `/orgs/public` leaked private orgs | Medium | `Organization.find()` unfiltered | `routes/orgs.js` | Filter `visibility: 'public'` |
| 10 | Signup allowed empty password | Medium | Password not required | `models/User.js`, `routes/auth.js` | Require min 6 chars; rollback org on failed admin signup |
| 11 | Orphan org if admin user create failed | Medium | Org created before user | `routes/auth.js` | Delete created org on signup failure |
| 12 | No project update/delete API | Medium | Only GET/POST projects | `routes/projects.js` | Added `PUT`/`DELETE /:id` with ownership checks |
| 13 | Passwords stored in localStorage | Medium | Signup/login mirrored password | `api-client.js` | `sanitizeUser` / never persist password |
| 14 | Fake unsigned client JWT | Medium | `createJwt()` btoa fallback | `api-client.js` | Removed; session requires server token |
| 15 | `getAllUsersInOrg` not awaited | Medium | Treated Promise as array | `chat-widget.js`, `ai-service.js` | `await` callers; AI context made async |
| 16 | Chat `tempId` dropped on send | Low–Medium | Socket payload omitted field | `socket-service.js`, `server.js` | Forward/echo `tempId` |
| 17 | Task board missing `completedAt` / assignee / org flags | Medium | Sync mapper incomplete | `task-board.js` | Map and set fields on create/sync |
| 18 | Google login created fake accounts | Medium | Mock signup with random Gmail | `auth/auth.js` | Show “not available yet” message |
| 19 | `dotenv` CWD-dependent | Medium | `dotenv.config()` without path | `server.js` | Load `backend/.env` via `__dirname` |
| 20 | Last admin could leave/be removed | Medium | No admin-count check | `routes/orgs.js` | Block leave/remove if last admin |
| 21 | Invalid ObjectIds → 500 | Low–Medium | No ID validation | routes + `utils/ids.js` | Validate → 400; ValidationError → 400 |
| 22 | Heatmap API unused / weak client data | Low | Client-only; missing `completedAt` | `dashboard.js`, `api-client.js` | Prefer `GET /tasks/heatmap`; keep fallback |
| 23 | `/` broke relative page links | Medium | Served index at `/` so `dashboard.html` → wrong path | `server.js` | Redirect `/` → `/pages/index.html` |
| 24 | Debug `console.log` in focus timer | Low | Leftover debug | `focus/focus.js` | Removed |

---

## 2. Changes Made

### Repo / config
- [`.gitignore`](.gitignore) — ignore `.env`, `node_modules`, logs, IDE files
- [`backend/.env.example`](backend/.env.example) — document required `JWT_SECRET`
- `git rm --cached backend/.env` — stop tracking secrets (local `.env` kept for run)

### Backend
- [`backend/server.js`](backend/server.js) — secure static mounts, dotenv path, JWT fail-fast, WS user check + `tempId`, API 404
- [`backend/utils/jwt.js`](backend/utils/jwt.js) — `signToken` / `verifyToken` / `getJwtSecret`
- [`backend/utils/ids.js`](backend/utils/ids.js) — `isValidObjectId`, `sameOrg`
- [`backend/middleware/auth.js`](backend/middleware/auth.js) — use shared verify
- [`backend/routes/auth.js`](backend/routes/auth.js) — password rules, org rollback, `PATCH /me`, token refresh on `/me`
- [`backend/routes/orgs.js`](backend/routes/orgs.js) — public filter, `GET /:id`, JWT re-issue, last-admin guards
- [`backend/routes/projects.js`](backend/routes/projects.js) — IDOR-safe list; PUT/DELETE
- [`backend/routes/tasks.js`](backend/routes/tasks.js) — IDOR-safe CRUD; heatmap before param routes
- [`backend/models/User.js`](backend/models/User.js) — password required (minlength 6)

### Frontend
- [`scripts/services/api-client.js`](scripts/services/api-client.js) — `/api` base, `refreshMe`, org/profile APIs, no fake JWT/passwords
- [`scripts/services/socket-service.js`](scripts/services/socket-service.js) — same-origin WS + `tempId`
- [`scripts/auth/auth.js`](scripts/auth/auth.js) — Google mock removed
- [`scripts/org/org.js`](scripts/org/org.js) — fetch org from API; await join; refresh session
- [`scripts/profile/profile.js`](scripts/profile/profile.js) — PATCH profile; load tasks from API
- [`scripts/dashboard/dashboard.js`](scripts/dashboard/dashboard.js) — `refreshMe`; server heatmap
- [`scripts/shared/task-board.js`](scripts/shared/task-board.js) — full task field sync
- [`scripts/shared/chat-widget.js`](scripts/shared/chat-widget.js) — await org users
- [`scripts/services/ai-service.js`](scripts/services/ai-service.js) — async workspace context
- [`scripts/focus/focus.js`](scripts/focus/focus.js) — remove debug log

---

## 3. Remaining Improvements (optional, not blockers)

- Rotate MongoDB Atlas password and use a strong unique `JWT_SECRET`
- Hash org join keys; rate-limit auth endpoints
- Add indexes on `Task.userEmail`, `Task.organizationId`, `Project.userEmail`
- Real Google OAuth, S3 attachments, email digests (README bonuses)
- Wire unused `Activity` model to task/project events
- Transactions for admin signup (instead of best-effort org rollback)
- Purge `.env` from git history if the repo was published (`git filter-repo` / BFG)

---

## 4. Functional Testing Results

Server: `cd backend && npm start` → MongoDB connected, listening on port 4000.

| Test | Result |
|------|--------|
| `GET /api/health` | Pass — DB connected |
| `GET /backend/.env` | Pass — **404** (not exposed) |
| `GET /pages/index.html`, `/styles/*`, `/scripts/*` | Pass |
| Signup / login personal users | Pass |
| Empty password signup | Pass — **400** |
| User A create project + task | Pass |
| User B cannot list A’s project/task | Pass — leakCount **0** |
| User B cannot update A’s task | Pass — **403** |
| Admin org signup + listed in `/orgs/public` | Pass |
| Employee join re-issues JWT; `/orgs/users` works | Pass |
| `GET /orgs/:id` returns orgKey for admin | Pass |
| `PATCH /auth/me` + `GET /auth/me` | Pass |
| Mark task Done + heatmap | Pass |
| Delete project | Pass |

### How to run locally

1. Ensure `backend/.env` has `MONGODB_URI` and `JWT_SECRET`
2. `cd backend && npm install && npm start`
3. Open http://localhost:4000 → redirects to `/pages/index.html`

**Reminder:** If this repository was pushed with a live Atlas URI, rotate the database user password in MongoDB Atlas immediately.
