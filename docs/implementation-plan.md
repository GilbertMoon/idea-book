# Three-stage race implementation plan

Goal: implement docs/race-spec.md in the existing React/Canvas app; no backend or external physics library.
Execution: user explicitly requests full implementation, tests and commit, minimal docs and no routine questions. Work in existing checkout on feat/ranking-race-three-stage; parent repository has unrelated untracked files, stage only idea-book.

## Contracts and ownership
- Physics: src/physics/RaceEngine.js and geometry helpers, tests/unit/race*.test.js. RaceEngine({groups,settings,obstacleSettings,isShuffled}), width/height, balls, obstacles, gates, routes; status READY/RUNNING/FINISHED; start(), step(dt=1/120), getRanking(); animationTime progresses in READY while balls frozen, elapsed in RUNNING only. Coordinates in pixels, velocities pixels/second. Ball fields id,groupId,memberName,imageUrl,x,y,radius,stage,route,arrivalTime(seconds|null),collisionCount,returnFromStage2,returnFromStage3,returnCount,dnf. Rendering metadata documented in docs/race-engine-api.md. Old PhysicsEngine retained for regression.
- Storage/context: src/services/StorageService.js, src/state/*, src/config/defaults.js, persistence tests. Context existing group/member APIs retained; add hydrated,storageError,settings,updateSettings,slackSettings,setSlackSettings,prepareGame,startGame,resetRace. Status uppercase. prepareGame fresh runId READY, startGame RUNNING only from READY, finishGame FINISHED, resetRace IDLE retaining configuration. Existing setRankingResult and finishGame used by game. settings defaults {difficulty:'normal',gatesEnabled:true,stage2Gate:true,stage3Gate:true,maxReturns:2,returnCooldown:1,maxRaceSeconds:90}. Slack settings {url:'',remember:false}. Provider loads before autosaving, atomic saves, photos Blob in IndexedDB, object URL cleanup. No race results saved.
- Admin/Slack/result: src/admin/*, src/game/Result.*, src/services/SlackService.js, Slack unit tests. Consume above context API. Admin calls prepareGame(), navigate('/game'); numeric difficulty/return/time settings and existing obstacle controls persisted. Slack opt-in remember only; masked edit/delete; no secrets in errors or git. Result consumes ranking seconds/DNF/shared ranks and onClose/onReplay props, auto send once/run and explicit retry only after failure. SlackService.sendResult(data,{retry:false}) idempotent concurrent successful calls; hasWebhookUrl/setWebhookUrl preserved.
- Integration root: src/game/Game.jsx, RaceRenderer.js, styles, SoundManager extensions, package test commands, E2E and final verification/review/commit. Game owns RAF fixed steps (dt=1/120) and DPR display only, READY preview, departure, progress, time and replay. Mount once per runId.

## Tasks
- [x] Physics: failing tests for READY, stage paths, collision-selected return paths, continuous transitions, return limit/cooldown, ties/DNF, deterministic stability. Implement and run node --test tests/unit/race*.test.js.
- [x] Storage: failing integration tests for reload/photo Blob restore, edit/delete cleanup, denied DB failure, explicit Slack opt-in, race reset. Implement and run relevant tests.
- [x] Admin/Slack: failing tests for exactly-once automatic send, retry/failure/opaque response, secret redaction. Implement admin persistence controls and result rows.
- [x] Game renderer/integration: E2E for READY frozen balls/moving obstacles, start, full route, finish/replay/config retained, narrow screen. Ensure effects and stage/return event sounds throttled.
- [x] Independent code review; fix findings; run lint, unit, build and E2E, inspect desktop/mobile screenshots.
- [x] Update README/report and commit only scoped project files; no push/deploy.

## Review focus
Hydration racing edits; stale async photo callbacks after deletion; Slack double-send across StrictMode/remount; return entry selected without a physical gate contact; DNF or identical arrival times assigned invented ranks. Tests must cover these rather than only rendering text.

Review: independent code review findings fixed (history navigation cancels current race; configured oscillators and physical bypass clearance). Verification recorded in the final output report. Captive belts and uniform assistance are documented; no remote push or deployment.
