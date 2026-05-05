# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

---

## NexusGuard VMS (`artifacts/nexusguard-vms`)

A sophisticated on-premise Security Operations Command Center — dark-mode-native, fully functional as a React + Vite SPA.

### Screens (13 total)

| Route | Page | Description |
|-------|------|-------------|
| `/login` | LoginPage | Auth screen with mock login (any username) |
| `/dashboard` | DashboardPage | KPI cards, activity charts, NVR server health, storage |
| `/live` | LiveViewPage | Camera grid (1×1 / 2×2 / 3×3 / 4×4), wall mode, camera panel |
| `/playback` | PlaybackPage | Timeline scrubber, playback controls, speed, event markers |
| `/events` | EventsPage | 120 events table, filtering, event detail drawer |
| `/alarms` | AlarmsPage | Alarm cards, P1–P4 priority, acknowledge/resolve, stats |
| `/cameras` | CamerasPage | 48 cameras, table/card view, add camera wizard |
| `/map` | MapPage | SVG floorplan across 3 floors, camera dot markers |
| `/ptz` | PTZPage | D-pad, zoom/focus/iris, presets, PTZ tours |
| `/investigation` | InvestigationPage | Multi-camera timeline, evidence basket |
| `/evidence` | EvidencePage | Export packages, chain-of-custody, audit log |
| `/settings` | SettingsPage | General, Users, NVR/Storage, Alarms, Network, Security |
| Command Palette | — | Ctrl+K global search overlay |

### Architecture

- **State**: Zustand stores (`authStore`, `themeStore`, `sidebarStore`, `gridStore`, `alarmStore`)
- **Routing**: Wouter with protected routes
- **Styling**: Tailwind v4 + CSS variables, Inter + JetBrains Mono fonts
- **Icons**: Lucide React only
- **Charts**: Recharts (AreaChart, BarChart, PieChart)
- **Animations**: Framer Motion
- **Mock Data**: 48 cameras, 15 users, 120 events, 40 alarms

### Key UX Features

- Permanent collapsible sidebar (240px expanded / 56px collapsed)
- Live clock + system status in bottom status strip
- Keyboard shortcuts (Ctrl+K palette, Alt+1–9 nav, ? for shortcuts)
- Dark mode native with light mode toggle
- Camera tiles with scan-line animation, alarm glow, hover action bar
- Auth guard redirects unauthenticated users to login
