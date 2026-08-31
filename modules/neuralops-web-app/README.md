# neuralops-app

First-party web frontend for NeuralOps Nexus — a Next.js (App Router) client for the
self-hosted backend in this repository. Sign in once, keep a launcher of your servers,
and work in any of them: Projects → Channels → Chats, with AI personas answering
alongside humans in real time.

## How it fits the system

- **Identity** comes from Supabase (`@supabase/supabase-js`) — the same accounts the
  backend's `authn` app verifies. The app itself stores no user data.
- **Everything else** comes from the NeuralOps server the user connects to
  (`nexus-nucleus` REST API + Centrifugo websockets via `centrifuge-js`). The server
  URL is chosen at runtime on the `/servers` launcher — one build works against any
  deployment.
- **Privacy rule:** no workspace ids ever appear in URLs. Navigation state lives in
  a per-server selection store; every route is a static path (`/w`, `/intelligence`,
  `/members`, `/servers`).
- `src/lib/version.ts` carries `APP_VERSION` and `COMPATIBLE_SERVER_VERSION` — the
  launcher warns or blocks when a server's version drifts.

## Getting started

```bash
cp .env.example .env.local   # fill in your Supabase project's URL + anon key
npm install
npm run dev                  # http://localhost:3000
```

Point the app at any running NeuralOps server (for the dev stack in this repo:
`http://localhost:8096`) from the `/servers` screen after signing in.

## Scripts

| Command             | What it does                                      |
|---------------------|---------------------------------------------------|
| `npm run dev`       | Dev server with hot reload                        |
| `npm run build`     | Production build (also the type-check gate)       |
| `npm run lint`      | ESLint                                            |
| `npm run test:run`  | Vitest unit/component suite (jsdom + MSW)         |
| `npm run e2e`       | Playwright smoke suite                            |

`/dev/preview`, `/dev/preview-intel`, and `/dev/preview-servers` render the main
surfaces with fixture data (dev builds only) so UI states can be reviewed without a
signed-in session.

## Layout

```
src/app/          routes (login, servers launcher, w = workspace, intelligence, members)
src/components/   chat, shell, intelligence, servers, ui primitives
src/hooks/        TanStack Query hooks per backend domain
src/lib/          api clients, realtime store, composer logic, platform helpers
src/stores/       zustand stores (connection, selection, saved servers)
```
