---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [vite, solidjs, typescript, eslint, pwa, rust, wasm, wasm-bindgen, wasm-opt, web-worker, service-worker, workbox]

# Dependency graph
requires: []
provides:
  - Vite 7.3.x + SolidJS 1.9.x + TypeScript 5.9.x project scaffold
  - ESLint v9 flat config with eslint-plugin-solid (reactivity violation detection)
  - PWA manifest with share_target, standalone display, service worker via vite-plugin-pwa
  - Rust WASM crate (BinderCore) with ping() and version() methods
  - Three-step WASM pipeline: cargo -> wasm-bindgen-cli -> wasm-opt
  - Web Worker bridge (bridge.ts + worker.ts) with typed Command/Response messages
  - Worker-owned WASM pattern established (no UI-side WASM imports)
  - src/types/messages.ts with Command and Response discriminated union types
affects:
  - 01-02 (atom schema uses Worker bridge and message types)
  - 01-03 (shell uses bridge.ts and message types)
  - All future plans (WASM-in-Worker pattern must be maintained)

# Tech tracking
tech-stack:
  added:
    - solid-js 1.9.11
    - "@solidjs/router 0.15.4"
    - dexie 4.3.0
    - dexie-export-import 4.1.4
    - solid-dexie 0.0.5
    - zod 4.3.6
    - vite 7.3.1
    - vite-plugin-solid 2.11.10
    - vite-plugin-pwa 1.2.0
    - vite-plugin-wasm 3.5.0
    - vite-plugin-top-level-await 1.6.0
    - typescript 5.9.3
    - eslint 10.0.1 (requires jiti for TypeScript config)
    - eslint-plugin-solid 0.14.5
    - vitest 4.0.18
    - wasm-bindgen 0.2.111 (Cargo, 0.2.109 was yanked)
    - wasm-bindgen-cli 0.2.109 (pre-built binary)
    - wasm-opt version_123 (binaryen, pre-built binary)
  patterns:
    - "Worker-owned WASM: all WASM imports live in src/worker/worker.ts only"
    - "ESLint v9 flat config with jiti for TypeScript eslint.config.ts support"
    - "vite-plugin-pwa 1.x generates manifest.webmanifest and service worker automatically"
    - "Plugin order must be: solid() -> wasm() -> topLevelAwait() -> VitePWA()"
    - "Cargo config uses lld-link.exe for MSVC linker (Git link.exe shadows MSVC link.exe)"
    - "wasm-bindgen 0.2.109 binary works with Cargo-resolved 0.2.111 wasm-bindgen crate"

key-files:
  created:
    - package.json (project manifest with all scripts including build:wasm)
    - vite.config.ts (Vite config with solid/wasm/topLevelAwait/VitePWA plugins)
    - tsconfig.json (ES2022, bundler resolution, solid-js JSX, strict mode)
    - eslint.config.ts (ESLint v9 flat config with eslint-plugin-solid)
    - index.html (PWA entry with viewport-fit=cover, theme-color, manifest link)
    - src/index.tsx (render() entry point)
    - src/app.tsx (placeholder component calling initWorker() on mount)
    - src/types/messages.ts (Command and Response discriminated union types)
    - src/worker/worker.ts (Web Worker with INIT/PING/CREATE_ATOM dispatch)
    - src/worker/bridge.ts (initWorker, dispatch, onMessage typed bridge)
    - wasm/core/Cargo.toml (BinderCore cdylib crate)
    - wasm/core/src/lib.rs (BinderCore struct with ping() and version())
    - src/wasm/pkg/ (wasm-bindgen generated JS/TS bindings + optimized WASM)
    - .cargo/config.toml (MSVC linker configuration)
    - public/icons/ (placeholder PWA icons at 192px and 512px)
    - .gitignore (node_modules, dist, target directories)
  modified: []

key-decisions:
  - "wasm-bindgen 0.2.109 is yanked from crates.io; Cargo.toml uses 0.2 range, resolves to 0.2.111"
  - "Used pre-built wasm-bindgen-cli 0.2.109 and wasm-opt binaries instead of cargo install (MSVC linker issue)"
  - "Node.js 22.14.0 required (installed as portable zip) — Node 20.10 is below Vite 7's minimum (20.19+)"
  - "ESLint v10 requires jiti package for TypeScript config file support (not v9)"
  - "Windows MSVC build required installing VS Build Tools + Windows 11 SDK via vs_buildtools.exe"
  - ".cargo/config.toml configures lld-link.exe as linker for x86_64-pc-windows-msvc (Git link.exe was in PATH first)"
  - "src/wasm/pkg ignored in ESLint config (generated files have false-positive warnings)"
  - "LIB env variable must include MSVC lib/x64 + Windows SDK um/x64 + ucrt/x64 for cargo build"

patterns-established:
  - "Worker-owned WASM: never import WASM from UI components, only from src/worker/worker.ts"
  - "Bridge pattern: UI uses bridge.ts dispatch() and onMessage(), never constructs Worker directly"
  - "Typed messages: Command and Response discriminated unions prevent untyped postMessage calls"
  - "Plugin order: solid() -> wasm() -> topLevelAwait() -> VitePWA() (wasm before topLevelAwait)"
  - "WASM build env: requires LIB path with MSVC + Windows SDK libs for cargo build on Windows"

requirements-completed: [TRST-01, TRST-07]

# Metrics
duration: 54min
completed: 2026-02-22
---

# Phase 1 Plan 01: Project Scaffold Summary

**Vite 7 + SolidJS 1.9 + TypeScript + ESLint-solid + PWA scaffold with Rust/WASM three-step pipeline and typed Web Worker bridge**

## Performance

- **Duration:** 54 min
- **Started:** 2026-02-22T01:53:27Z
- **Completed:** 2026-02-22T02:47:58Z
- **Tasks:** 2 of 2
- **Files modified:** 16

## Accomplishments
- Vite 7.3 + SolidJS 1.9 + TypeScript 5.9 project builds and lints cleanly with zero errors
- ESLint v9 flat config with eslint-plugin-solid configured to catch reactivity violations before any component code exists
- PWA manifest with share_target, standalone display, and service worker (workbox) precaching all assets
- Rust BinderCore WASM crate compiled via three-step pipeline: cargo build -> wasm-bindgen-cli -> wasm-opt -Oz (10.9KB optimized output)
- Web Worker bridge established: typed Command/Response discriminated unions, initWorker() Promise, dispatch() and onMessage() main-thread API
- App component proves full chain on mount: UI -> Bridge -> Worker -> WASM -> Worker -> Bridge -> UI (WASM version displayed)

## Task Commits

Each task was committed atomically:

1. **Task 1: Vite + SolidJS + TypeScript + ESLint + PWA** - `60f812b` (feat)
2. **Task 2: Rust WASM pipeline + Web Worker bridge** - `2128727` (feat)
3. **Fix: wasm-bindgen version pinning** - `9c631e2` (fix)

**Plan metadata:** (created after this summary)

## Files Created/Modified
- `package.json` - pnpm project with solid-js, dexie, zod, all dev tooling, build:wasm script
- `vite.config.ts` - solid(), wasm(), topLevelAwait(), VitePWA() with share_target manifest
- `tsconfig.json` - ES2022, bundler moduleResolution, solid-js jsxImportSource, strict
- `eslint.config.ts` - ESLint v9 flat config with eslint-plugin-solid TypeScript rules
- `index.html` - PWA entry with viewport-fit=cover, theme-color, manifest link
- `src/index.tsx` - render(() => <App />, root) entry point
- `src/app.tsx` - Placeholder component, calls initWorker() on mount, shows WASM version
- `src/types/messages.ts` - Command and Response discriminated union types for Worker protocol
- `src/worker/worker.ts` - Web Worker entry with INIT/PING/CREATE_ATOM dispatch, error handling
- `src/worker/bridge.ts` - initWorker(), dispatch(), onMessage() typed main-thread bridge
- `wasm/core/Cargo.toml` - BinderCore cdylib crate, wasm-bindgen 0.2, panic=abort, LTO
- `wasm/core/src/lib.rs` - BinderCore struct with ping() and version() WASM-exposed methods
- `src/wasm/pkg/` - wasm-bindgen generated JS/TS bindings and 10.9KB optimized WASM binary
- `.cargo/config.toml` - MSVC lld-link.exe linker (Git's link.exe shadows MSVC link.exe on Windows)
- `public/icons/` - Placeholder PNG icons (192px, 512px, maskable)
- `.gitignore` - node_modules, dist, Rust target directories

## Decisions Made
- Used pre-built wasm-bindgen-cli 0.2.109 binary (cargo install fails on system with broken MSVC link chain)
- Used pre-built binaryen wasm-opt version_123 binary (same reason)
- Installed VS Build Tools + Windows 11 SDK via vs_buildtools.exe to get MSVC libs (kernel32.lib, dbghelp.lib etc.)
- Configured .cargo/config.toml with lld-link.exe to bypass Git's link.exe shadowing MSVC link.exe
- Node.js 22.14.0 installed as portable zip (Node 20.10.0 is below Vite 7's minimum requirement of 20.19+)
- ESLint v10 was installed (latest); jiti package added to support TypeScript config file loading
- wasm-bindgen pinned to 0.2 range (0.2.109 was yanked from crates.io; resolves to 0.2.111)
- WASM pkg directory excluded from ESLint (generated files emit false-positive unused-disable-directive warnings)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint v10 requires jiti for TypeScript config**
- **Found during:** Task 1 (lint verification)
- **Issue:** ESLint 10.0.1 was installed but TypeScript eslint.config.ts requires jiti package
- **Fix:** `pnpm add -D jiti` resolved the dependency
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `pnpm lint` passes with zero errors
- **Committed in:** 60f812b (Task 1 commit)

**2. [Rule 3 - Blocking] Rust 1.73.0 too old for modern crates (edition 2024)**
- **Found during:** Task 2 (wasm-bindgen-cli install)
- **Issue:** Rust 1.73.0 cannot compile crates using Rust edition 2024
- **Fix:** `rustup update stable` upgraded to Rust 1.93.1
- **Files modified:** Rust toolchain (system-level)
- **Verification:** `cargo --version` shows 1.93.1
- **Committed in:** Not committed (system toolchain change)

**3. [Rule 3 - Blocking] MSVC link.exe not found (Git's link.exe in PATH)**
- **Found during:** Task 2 (cargo build for WASM)
- **Issue:** Git installs `link.exe` (linker for ELF) in PATH; Rust's MSVC toolchain calls it but it's wrong
- **Fix 1:** Installed VS Build Tools 2022 via vs_buildtools.exe (provides MSVC link.exe at C:/BuildTools)
- **Fix 2:** Installed Windows 11 SDK component (provides kernel32.lib, dbghelp.lib etc.)
- **Fix 3:** Created .cargo/config.toml pointing to C:/BuildTools/VC/.../lld-link.exe
- **Fix 4:** Set LIB env var to point to MSVC + Windows SDK lib directories
- **Files modified:** .cargo/config.toml (new file)
- **Verification:** `cargo build --target wasm32-unknown-unknown --release` succeeds
- **Committed in:** 2128727 (Task 2 commit)

**4. [Rule 3 - Blocking] wasm-bindgen 0.2.109 yanked from crates.io**
- **Found during:** Task 2 (attempting to pin exact version)
- **Issue:** Cargo.toml used exact `=0.2.109` but 0.2.109 is yanked; resolves to 0.2.111
- **Fix:** Changed to `0.2` range; Cargo.lock pins to 0.2.111 which works with wasm-bindgen-cli 0.2.109
- **Files modified:** wasm/core/Cargo.toml
- **Verification:** `pnpm build` succeeds with WASM correctly bundled
- **Committed in:** 9c631e2 (fix commit)

**5. [Rule 3 - Blocking] Node.js 20.10.0 below Vite 7 minimum (20.19+)**
- **Found during:** Task 1 (pnpm build)
- **Issue:** Vite 7.3 requires Node.js 20.19+ or 22.12+; system has 20.10.0; `crypto.hash` missing
- **Fix:** Downloaded Node.js 22.14.0 as portable zip to C:/Users/patri/nodejs22/
- **Files modified:** PATH environment (runtime only)
- **Verification:** `pnpm build` succeeds with no Node.js version warnings
- **Committed in:** Not committed (environment change; PATH set per session)

---

**Total deviations:** 5 auto-fixed (all Rule 3 - Blocking environment/toolchain issues)
**Impact on plan:** All fixes were environment setup issues on this Windows machine. No scope changes. The core plan executed exactly as written — all deviations were toolchain gaps, not architectural decisions.

## Issues Encountered
- Windows MSVC toolchain setup required significant effort: Git link.exe shadowing, missing VS Build Tools, missing Windows SDK libs. Resolved by installing VS Build Tools 2022 + Windows 11 SDK and configuring .cargo/config.toml.
- Node.js 20.10 (system) below Vite 7 minimum — resolved by portable Node 22.14.0 installation.
- wasm-bindgen 0.2.109 yanked from crates.io — used 0.2 range; both CLI binary (0.2.109) and crate (0.2.111) work together.

## User Setup Required
None for running the app. However, for running `pnpm build:wasm` (rebuilding the Rust WASM), the environment requires:
1. Rust (rustup) with wasm32-unknown-unknown target: `rustup target add wasm32-unknown-unknown`
2. wasm-bindgen-cli binary at `~/.cargo/bin/wasm-bindgen` (pre-built binary at https://github.com/rustwasm/wasm-bindgen/releases)
3. wasm-opt binary at `~/.cargo/bin/wasm-opt` (pre-built binaryen binary)
4. On Windows: VS Build Tools 2022 with Windows SDK installed; LIB and PATH set to include MSVC compiler
5. Node.js 22.x (Vite 7 requires 20.19+ or 22.12+)

## Next Phase Readiness
- Plan 01-02 can begin: atom schema + IndexedDB persistence layer
- Worker bridge message types (Command/Response) are in place but will be expanded in 01-02 with full atom operations
- WASM BinderCore is a skeleton — real compute engine added in Phase 2 (Plan 02-01)
- ESLint solid rules are active — component code written in 01-03 will be validated immediately
- Service worker precaching all assets — offline capability is already wired up

## Self-Check: PASSED

All key files verified:
- package.json, vite.config.ts, tsconfig.json, eslint.config.ts, index.html: FOUND
- src/index.tsx, src/app.tsx, src/types/messages.ts: FOUND
- src/worker/worker.ts, src/worker/bridge.ts: FOUND
- wasm/core/Cargo.toml, wasm/core/src/lib.rs: FOUND
- src/wasm/pkg/binderos_core_bg.wasm: FOUND
- dist/manifest.webmanifest, dist/index.html, dist/sw.js: FOUND

All commits verified:
- 60f812b (Task 1: scaffold): FOUND
- 2128727 (Task 2: WASM + Worker): FOUND
- 9c631e2 (Fix: version pinning): FOUND

---
*Phase: 01-foundation*
*Completed: 2026-02-22*
