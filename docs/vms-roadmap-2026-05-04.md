# VMS Roadmap - Priority Execution Plan

## Objective
Turn the current platform from a strong custom base into a real competitive VMS by closing the largest functional gaps first.

## Phase 1 - Stop the UI/backend mismatch
Target: make operator-critical workflows real.

1. Alarm engine
- Create first-class models for `AlarmRule`, `AlarmInstance`, `AlarmAction`, `NotificationTarget`.
- Stop deriving alarms only from `STREAM_*` events.
- Support trigger, scope, severity, cooldown, ack, resolve, snooze and escalation.

2. Playback rewrite
- Replace synthetic timeline logic with real segments from `/recordings`.
- Add real player binding to `/recordings/:id/play`.
- Add camera filter, time filter, gap rendering and clip export by interval.
- Add audio playback where available.

3. Investigation workspace
- Persist cases, bookmarks, notes and evidence selections in PostgreSQL.
- Add relationship between cases, recordings, events and exports.
- Add case audit trail and export status.

## Phase 2 - Professional recording and detection
Target: improve day-to-day reliability and forensic value.

1. Recording policy engine
- Continuous, motion, schedule and event-triggered recording modes.
- Pre-event and post-event buffers.
- Per-camera and per-group retention policy.
- Gap detection and recording integrity report.

2. Motion detection hardening
- Detection zones and exclusion zones.
- Sensitivity profiles by camera.
- False-positive reduction.
- Event thumbnails and metadata persistence.

3. Storage operations
- Retention cleanup by policy instead of only generic cleanup.
- Protected recordings / legal hold.
- Archive tiers and external/NAS strategy.

## Phase 3 - Competitive platform capabilities
Target: reach parity with serious commercial VMS expectations.

1. Analytics pipeline
- Person detection.
- Vehicle detection.
- LPR/plate recognition.
- Line crossing, intrusion, loitering, object left/removed.
- Metadata indexing for search.

2. Notifications and automation
- Email, webhook and mobile notification targets.
- Action rules: PTZ preset, relay, clip protection, speaker/audio, integrations.
- Correlation and deduplication logic.

3. Enterprise operations
- SSO/OIDC/SAML/LDAP.
- MFA.
- Multi-site federation.
- HA/failover for API, workers and stream/recording roles.
- Better observability and metrics.

## Suggested build order

1. Alarm engine.
2. Playback rewrite.
3. Investigation persistence.
4. Recording policies and gap detection.
5. Motion hardening.
6. Notification/action rules.
7. Advanced analytics.
8. Enterprise identity and HA/federation.

## Why this order

- Alarm engine fixes the biggest gap between what the UI suggests and what the backend really does.
- Playback and investigation directly improve operator output and evidence quality.
- Recording policy and detection quality reduce operational pain and false positives.
- Enterprise and advanced analytics features matter a lot, but only after the core workflows become trustworthy.
