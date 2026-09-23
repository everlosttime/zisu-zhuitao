# 像素风人机训练与发布实施计划

> **For agentic workers:** Follow tasks in order. Behavioral changes use a failing test before implementation. The user approved publishing the finished static pixel build to the existing GitHub Pages repository.

**Goal:** Add local police-versus-computer matches with three fixed speeds and a larger Chinese sentence bank to the existing voxel-pixel game, then publish only that version to the existing Pages URL.

**Architecture:** Keep the fallback Vite/React client as the public Pages application. Implement deterministic AI progress in the existing game and peer-room helpers, reuse the present pixel scene and match HUD, and preserve the MQTT friend-room flow. Build `fallback-dist/` and publish its contents to the repository's `gh-pages` root.

**Tech Stack:** React, TypeScript, Vite, Three.js, Node test runner, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-24-pixel-ai-training-design.md`

## Global Constraints

- Keep the current pixel voxel city, HUD, subtitle typing, and friend multiplayer visual flow.
- Set AI speeds to 20, 40, and 60 correct characters per minute for low, medium, and high.
- Use the existing 3-second countdown, 120-second round, 20-meter starting gap, and 2 meters per correct character.
- Export 200 distinct sentences and 30 deterministic articles, each at least 800 Unicode characters with 45 distinct sentences.
- Keep AI play local and the public website on `https://everlosttime.github.io/zisu-zhuitao/`.
- Publish the static fallback output only; do not publish the old 2D Next page.

---

### Task 1: Add AI pace rules and the shared word bank

**Files:**
- Modify: `lib/game.ts`
- Modify: `lib/articles.ts`
- Test: `tests/game.test.ts`
- Modify: `app/api/game/route.ts` so friend replays use the whole bank

**Interfaces:**
- `AiDifficulty = "low" | "medium" | "high"`
- `AI_SPEEDS: Record<AiDifficulty, number>`
- `aiProgressAt(speedCpm, elapsedMs, articleLength): number`
- `SENTENCES: string[]`, `ARTICLES: string[]`, and `nextArticleIndex(currentIndex): number`

- [x] Add tests for 20/40/60 character-per-minute progress, countdown clamping, article-end clamping, 200 distinct sentences, 30 unique passages, and replay wraparound.
- [x] Confirm the new tests fail before adding the exports and expanded bank.
- [x] Export 200 topic-grouped original sentences and deterministically generate 30 passages of 45 unique sentences.
- [x] Change the server replay SQL from the fixed ten-article modulus to the tested helper.
- [x] Verify `node --test tests/game.test.ts` passes.

### Task 2: Add local AI room state

**Files:**
- Modify: `fallback/src/peer-room.ts`
- Test: `tests/peer-room.test.ts`

**Interfaces:**
- `createAiPeerRoom(name, article, difficulty, now, round, articleIndex): PeerRoom`
- `advanceAiPeerRoom(room, difficulty, now): PeerRoom`

- [x] Add a failing behavior test for local police/computer roles, the three-second countdown, steady speed, and timeout.
- [x] Implement the local-room helpers with elapsed-time progress and existing winner rules.
- [x] Return the existing state unchanged between AI character advances to avoid needless scene updates.
- [x] Verify `node --test tests/peer-room.test.ts` passes.

### Task 3: Add AI mode to the pixel lobby and match view

**Files:**
- Modify: `fallback/src/main.tsx`
- Modify: `fallback/src/cinema.css`
- Modify: `fallback/index.html`

**Interfaces:**
- Lobby mode state: `"friend" | "ai"`, with friend mode selected by default.
- AI difficulty state: `AiDifficulty`, defaulting to `"low"`.
- A local AI match uses `createAiPeerRoom`; it does not open a relay connection or send room messages.

- [x] Add accessible mode and difficulty selectors to the existing pixel lobby panel.
- [x] Keep nickname entry and hide friend-room inputs only while AI mode is selected.
- [x] Reuse the existing Three.js chase, typing subtitle, timer, score display, result panel, and IME handlers.
- [x] Add local rematch with the next article and a local-only return-to-lobby action.
- [x] Keep friend mode creation, joining, synchronization, and replay on the existing MQTT relay.
- [x] Update the static page title and description for both modes.

### Task 4: Verify the build and publish to Pages

**Files:**
- Review: `fallback-dist/` build output
- Publish: GitHub `gh-pages` branch root

- [x] Run `node --test tests/*.test.ts` and confirm all tests pass.
- [x] Run ESLint on all changed TypeScript files and confirm no diagnostics.
- [x] Run `npm run build:fallback` and confirm the pixel static bundle is produced.
- [x] Request the local preview page, JavaScript bundle, and CSS bundle over HTTP and confirm HTTP 200 plus pixel and AI UI markers.
- [x] Commit and push the source changes to `main` after reviewing the working-tree diff.
- [x] Publish `fallback-dist/` to the existing `gh-pages` branch without force-pushing.
- [x] Verify the deployed page and referenced resources return HTTP 200 and show the new title and feature markers.
