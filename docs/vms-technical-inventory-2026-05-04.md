# VMS Technical Inventory - 2026-05-04

Status legend:
- `REAL`: implemented and connected to backend behavior used in operation
- `PARTIAL`: real backend or data exists, but workflow/UI is incomplete
- `MOCK`: mostly visual/prototype behavior
- `BROKEN`: intended flow exists but is currently failing or unreliable

## Frontend pages

| Page | Status | Notes |
|---|---|---|
| `/login` | REAL | Uses real auth against NestJS. |
| `/dashboard` | PARTIAL | Uses real system/camera/event data, but still lacks deep operational drill-down and some enterprise widgets. |
| `/live` | PARTIAL | Real live streams and camera grid. PTZ shortcut fixed to preserve camera selection. Still lacks richer operator workflows and status diagnostics. |
| `/playback` | PARTIAL | Uses real recordings, real playback token and real download. Still lacks synchronized multi-camera playback, clip-by-range export and richer forensic timeline controls. |
| `/events` | PARTIAL | Uses real events feed, but investigation/search workflows are still shallow. |
| `/alarms` | PARTIAL | UI now reads persisted `AlarmInstance` records. Base alarm engine is real, but rules, escalation, notifications and richer sources are still missing. |
| `/cameras` | PARTIAL | Real camera inventory and actions, but many device-management actions are still shallow. |
| `/cameras/:id` | PARTIAL | Real live preview and metadata. PTZ tab still contains mock-style controls not fully wired to backend. |
| `/map` | PARTIAL | Backend persistence exists, but map logic is not yet a full smart-map/GIS/alarm dispatch experience. |
| `/ptz` | PARTIAL | Real ONVIF directional and zoom commands, real live preview, camera preselection from Live/Cameras fixed. Presets, tours and focus remain unimplemented. |
| `/investigation` | PARTIAL | Workspace persistence and evidence item persistence are now real via backend. Still lacks case lifecycle, bookmarks, clip binding, multi-cam playback sync and richer chain-of-custody workflow. |
| `/evidence` | PARTIAL | Signing/verification is real, but case-bound evidence chain management is still incomplete. |
| `/storage` | PARTIAL | Uses real storage/recording data, but lacks policy editing, archive tiers and full retention operations. |
| `/settings` | PARTIAL | Some sections are still placeholder/admin shell. |
| `/ai` | MOCK | UI suggests multiple analytics, but backend currently only starts basic motion analysis. |
| `/users` | REAL | Real CRUD-backed user listing/editing is present. |
| `/roles` | MOCK | Mostly presentation; no mature RBAC policy editor yet. |
| `/reports` | MOCK | Still mostly prototype. |
| `/audit` | REAL | Reads real audit logs. |
| `/wall` | PARTIAL | Uses live streams/layouts, but lacks enterprise wall orchestration and event-driven dispatch. |

## Backend/API endpoints

### Auth and identity
| Endpoint group | Status | Notes |
|---|---|---|
| `/auth/login`, `/auth/me` | REAL | Real JWT auth in operation. |
| `/users` | REAL | CRUD exists. |
| `/camera-permissions`, `/camera-groups` | PARTIAL | Backend entities exist, but operator UX and policy coverage are still limited. |
| `/roles` | MOCK | No dedicated backend module for rich role policy editing. |

### Cameras and live operations
| Endpoint group | Status | Notes |
|---|---|---|
| `/cameras` CRUD and diagnostics | REAL | Inventory, diagnostics and test-connection endpoints exist. |
| `/camera-stream/:cameraId/token` and `/camera-stream/:cameraId/flv` | REAL | Live FLV stream is operational. |
| `/ptz/:cameraId/move` | REAL | Directional start/stop and zoom via ONVIF work. Verified against `Legacy Camera`. |
| `/cameras/internal/:id/status` | REAL | Worker health/status updates supported. |
| `/cameras/internal/:id/events` | REAL | Internal event ingestion supported. |

### Events, alerts and alarms
| Endpoint group | Status | Notes |
|---|---|---|
| `/cameras/events`, `/cameras/events-feed` | REAL | Real event feed exists. |
| `/cameras/incidents*` | PARTIAL | Incident workflow exists, but is centered on camera events rather than a richer incident model. |
| `/cameras/alarms*` | PARTIAL | List/ack/resolve now operate on dedicated `AlarmInstance` records. Still missing full rule engine, notifications, suppression and escalation. |
| `/cameras/alerts` | PARTIAL | Not yet backed by a mature alert rule engine. |

### Recording and playback
| Endpoint group | Status | Notes |
|---|---|---|
| `/cameras/:cameraId/recording/start|stop|status` | REAL | FFmpeg recording control exists. |
| `/recordings` | REAL | Lists real recordings. |
| `/recordings/:id/play` | REAL | Byte-range playback endpoint exists. |
| `/recordings/:id/download` | REAL | Real file download exists. |
| `/recordings/:id/thumbnail*` | REAL | Thumbnail generation and serving exist. |
| End-to-end operator playback workflow | PARTIAL | Backend is real, frontend UX is not yet complete. |

### AI/analytics
| Endpoint group | Status | Notes |
|---|---|---|
| `/ai/health` | REAL | Health endpoint exists. |
| `/ai/start/:cameraId`, `/ai/stop/:cameraId` | PARTIAL | Starts/stops Python analysis, but analysis type is currently motion only. |
| Advanced detections (person, vehicle, LPR, loitering, intrusion) | MOCK | Not implemented as real productized analytics. |

### Evidence, map and health
| Endpoint group | Status | Notes |
|---|---|---|
| `/evidence/sign`, `/evidence/verify` | REAL | Server-side HMAC signing and verification exist. |
| `/sites/:siteId/map-layouts*` | REAL | Layout persistence is implemented. |
| `/health`, `/health/system` | REAL | System health and storage info exist. |
| `/audit-logs` | REAL | Audit read endpoint exists. |

## Highest-value gaps still open

1. Expand the new alarm engine with rules, escalation, notifications and backfill/sync workflows.
2. Expand playback into synchronized multi-camera forensic workflow with clip-by-range export.
3. Expand investigations from saved workspaces into full case management.
4. Real analytics metadata pipeline.
5. Notification and automation layer.
6. Storage retention policy engine.
7. SSO/MFA/enterprise identity.
8. Multi-site federation and HA/failover.

## Immediate regression notes from this cycle

- Fixed: PTZ shortcut from `/live` now opens `/ptz` with the selected camera preserved via query string.
- Fixed: PTZ page now uses real live preview and real ONVIF command calls.
- Fixed: PTZ command path validated against camera `6086981f-641e-4b88-845b-8ce2e3c9cc0e` with successful `start` and `stop` responses.
- Still pending: PTZ presets/tours/focus are not implemented in backend and must not be treated as real.
