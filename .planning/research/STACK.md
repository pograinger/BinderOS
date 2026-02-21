# Stack Research

**Domain:** Local-first, browser-only personal information management system with WASM compute and AI integration
**Researched:** 2026-02-21
**Confidence:** MEDIUM-HIGH (core stack HIGH; AI layer MEDIUM; IronCalc LOW — early-stage project)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SolidJS | 1.9.x (stable) | UI framework | Fine-grained reactivity at the signal level avoids VDOM overhead, which matters critically when bridging WASM↔UI — every WASM state change triggers exactly the components that depend on it, not a subtree diff. 7KB runtime. TypeScript-first. v2.0 is in development but 1.9.x is production-stable. |
| TypeScript | 5.9.x | Type layer for all JS/TS | Current stable. v5.9.3 is latest. TS 6.0 (bridge to Go-based TS 7) is coming in early 2026 but is not yet released — 5.9.x is safe for project start. |
| Vite | 7.3.x | Build tool and dev server | Current major. Dropped Node.js 18 (EOL). Targets `baseline-widely-available` by default (Chrome 107+, Firefox 104+, Safari 16+). Rolldown bundler coming in v8 beta but v7.x is stable. Best DX for WASM + SolidJS combo. |
| Rust (wasm32-unknown-unknown target) | stable toolchain (1.84+) | Core logic compiled to WASM | Priority scoring, entropy metrics, schema enforcement — these are CPU-bound, stateful computations that benefit from Rust's memory safety and near-native performance without GC pauses. |
| wasm-bindgen | 0.2.109 | Rust↔JS bridge | The core tool for Rust-to-WASM JS interop. The rustwasm org was archived July 2025, but wasm-bindgen itself was transferred to a new wasm-bindgen org with active maintainers. Not deprecated — just re-homed. |
| wasm-bindgen-cli | 0.2.109 (must match lib) | Post-compilation WASM processing | Replaces wasm-pack's packaging step. Run after `cargo build --target wasm32-unknown-unknown`. Version must exactly match wasm-bindgen crate version in Cargo.toml. |
| Dexie.js | 4.0.x (stable) | IndexedDB wrapper | The standard IndexedDB abstraction for 2025. Version 4.0.11 is current stable. Provides schema versioning, typed queries, and reactive live queries. 4.1.x betas add experimental Y.js/CRDT support but stable 4.0.x is the right choice for now. |
| IndexedDB (via Dexie) | Browser-native | Structured data persistence | Typed atom storage (Task, Fact, Event, Decision, Insight). OPFS is for large binary blobs (not row-query JSON). Use Dexie over raw IndexedDB for schema migrations and typed access. |
| Zod | 4.x | Schema validation and type inference | v4 released July 2025. TypeScript-first. Validates all atom mutations at runtime before they touch IndexedDB. Bridges compile-time types and runtime constraints. Single schema definition generates both TS types and runtime validators. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite-plugin-solid | 2.10.x | SolidJS JSX transform for Vite | Required in every SolidJS+Vite project. Configure with `{ typescript: { onlyRemoveTypeImports: true } }` if using Solid directives. |
| vite-plugin-wasm | 3.5.0 | ESM-compatible WASM loading in Vite 7 | Required for loading custom Rust-compiled WASM modules in Vite. Supports Vite 2–7. |
| vite-plugin-top-level-await | latest | Enables top-level `await` for WASM init | Required alongside vite-plugin-wasm unless build.target is `esnext`. WASM module initialization is async. |
| solid-dexie | 0.0.5 | Reactive Dexie queries as Solid signals | Bridges Dexie's live query system into SolidJS's reactive graph. `createDexieArrayQuery` and `createDexieSignalQuery` make IndexedDB reads first-class reactive primitives — UI auto-updates when DB changes. Use for all atom list queries. |
| @solidjs/router | 0.14.x | SPA client-side routing | Hash-based or history API routing for navigating between Pages (views). No server needed — pure client-side SPA mode. |
| serde + serde-wasm-bindgen | serde: 1.x, serde-wasm-bindgen: 0.6.x | Rust↔JS data serialization | Serialize Rust structs to/from JS objects at the WASM boundary. Faster and smaller than JSON-based serialization. Use for passing atom data between WASM compute and the JS layer. |
| web-sys | 0.3.x (matches wasm-bindgen) | Rust bindings to browser Web APIs | Needed if Rust modules must directly touch browser APIs (storage, performance timing). In BinderOS, most browser API calls should stay in the TS layer — use web-sys only when necessary. |
| js-sys | 0.3.x (matches wasm-bindgen) | Rust bindings to JavaScript built-ins | Date, Array, Object interop from Rust. Required when passing JS primitives to/from WASM functions. |
| @ironcalc/wasm | 0.7.x | Embedded spreadsheet engine | Rust→WASM spreadsheet engine for embedded computational atoms. v0.7.1 released January 2026. Early-stage project — use as embedded content renderer only, not as foundational data store. Test integration carefully. |
| @mlc-ai/web-llm | 0.2.x | In-browser LLM inference (optional) | WebGPU-accelerated in-browser LLM for users who want fully local AI with no API key. Plugged in as one implementation of the AI provider interface. Requires WebGPU (Chrome 113+, Firefox 121+ with flag). |
| wasm-opt (via binaryen) | latest | Post-compilation WASM optimization | Reduces .wasm file size by 20-40%. Run as part of build pipeline after wasm-bindgen-cli step. Install via cargo or system package manager. |
| Vitest | 2.x | Unit and integration testing | Works with SolidJS+Vite natively. Use `@solidjs/testing-library` for component tests. For WASM module testing, use `.wasm?init` query param or vite-plugin-wasm in test config. |
| @solidjs/testing-library | 0.8.x | Component testing utilities | The official SolidJS testing-library integration. Provides `render`, `screen`, and event utilities for Solid components. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| cargo (Rust toolchain stable) | Compile Rust to WASM | `cargo build --target wasm32-unknown-unknown --release`. Use `[profile.release]` with `opt-level = "s"` (size) or `"z"` (smallest) in Cargo.toml for smaller WASM output. |
| wasm-bindgen-cli | Process WASM output post-cargo | Must version-match the wasm-bindgen crate. Install: `cargo install wasm-bindgen-cli --version 0.2.109`. Run: `wasm-bindgen --target web ./target/wasm32-unknown-unknown/release/binderos_core.wasm --out-dir ./src/wasm`. |
| wasm-opt | Optimize WASM binary size | Install via `cargo install wasm-opt` or system package manager. Run after wasm-bindgen-cli. |
| pnpm | Package management | Preferred over npm/yarn for monorepo-style dependency deduplication. Works well if TS and Rust crates live side-by-side. |
| rustup | Rust toolchain management | `rustup target add wasm32-unknown-unknown`. Use stable channel. |
| cargo-watch | Auto-recompile Rust on change | `cargo watch -x "build --target wasm32-unknown-unknown --release"`. Speeds up WASM dev iteration. |
| ESLint + typescript-eslint | TypeScript linting | Enforce strict typing at the TS layer. Use `@typescript-eslint/strict` ruleset. |

---

## Installation

```bash
# UI layer
pnpm add solid-js @solidjs/router dexie zod
pnpm add solid-dexie

# Dev dependencies (UI)
pnpm add -D vite vite-plugin-solid vitest jsdom
pnpm add -D vite-plugin-wasm vite-plugin-top-level-await
pnpm add -D @solidjs/testing-library @testing-library/user-event @testing-library/jest-dom
pnpm add -D typescript eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser

# AI layer (optional, pluggable)
pnpm add @mlc-ai/web-llm

# IronCalc (embedded spreadsheet atoms)
pnpm add @ironcalc/wasm

# Rust side (Cargo.toml dependencies)
# [dependencies]
# wasm-bindgen = "0.2.109"
# wasm-bindgen-futures = "0.4"
# serde = { version = "1", features = ["derive"] }
# serde-wasm-bindgen = "0.6"
# web-sys = { version = "0.3", features = ["Window", "Performance", ...] }
# js-sys = "0.3"

# Install Rust toolchain additions
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.109
cargo install wasm-opt
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SolidJS 1.9.x | React 19 | If team has deep React expertise and WASM bridging overhead is acceptable. React's reconciler is heavier — each WASM state push triggers broader re-render subtrees. |
| SolidJS 1.9.x | SolidJS 2.0 (beta) | Wait for 2.0 when it reaches stable release. It is under active development and not production-ready. |
| SolidJS 1.9.x | Svelte 5 | Svelte has better rune-based reactivity and smaller output, but weaker WASM integration community patterns and fewer TypeScript ecosystem tools. |
| Vite 7 | Vite 6 | Vite 6 still receives important backports. Acceptable if any dep has Vite 7 incompatibility, but prefer v7. |
| Dexie 4.0.x | Raw IndexedDB | Use raw IndexedDB only if Dexie's abstraction creates unacceptable overhead — benchmark first. Dexie's overhead is negligible for most use cases. |
| Dexie 4.0.x | RxDB | RxDB is heavier and designed for sync scenarios. BinderOS is single-user local-first — Dexie's weight is appropriate. |
| Dexie 4.0.x | OPFS (direct) | OPFS is for large binary blobs (images, file attachments). Atom data (JSON-like structs) belongs in IndexedDB. Use OPFS as a secondary store for file attachments if needed. |
| Zod 4.x | TypeBox | TypeBox generates JSON Schema from types; Zod generates runtime validators. For BinderOS's needs (validating atom mutations), Zod is more ergonomic. |
| wasm-bindgen-cli (direct) | wasm-pack | wasm-pack was sunset and archived by the rustwasm org in July 2025. Do not use. |
| @mlc-ai/web-llm | Chrome Built-in AI (Prompt API) | Chrome's built-in Gemini Nano (via `window.ai`) is simpler but Chrome-only and in early origin trial. Use as an additional AI provider impl, not the default. |
| @mlc-ai/web-llm | Ollama (external local) | Ollama runs as a local server; the AI provider interface can call `http://localhost:11434` for users who run it. Add as an optional provider, not a hard dep. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| wasm-pack | Sunset and archived by rustwasm org, July 2025. The toolchain is abandoned. | `cargo build` → `wasm-bindgen-cli` → `wasm-opt` (three-step pipeline) |
| React | VDOM reconciler adds overhead at the WASM↔UI boundary. Fine-grained SolidJS signals are a better fit for WASM-driven state. | SolidJS 1.9.x |
| SolidJS 2.0 beta | Unstable, API changes expected. Not production-ready as of Feb 2026. | SolidJS 1.9.x until v2 reaches stable. |
| OPFS for atom storage | OPFS is a binary file system abstraction — it does not support queries, indexes, or structured data retrieval. | IndexedDB via Dexie.js |
| localStorage / sessionStorage | 5MB limit, synchronous (blocks main thread), no schema, no indexes. | IndexedDB via Dexie.js |
| SolidStart | SolidStart is a full-stack meta-framework. BinderOS is browser-only, no server. SolidStart adds SSR complexity with zero benefit here. | Plain SolidJS + Vite |
| server-side database (Postgres, SQLite file, etc.) | Contradicts the browser-only, local-first constraint. | IndexedDB (Dexie) for atoms, OPFS for binary attachments |
| TypeScript 6.0 / 7.0 | TS 6.0 is not yet released (Feb 2026) and 7.0 (Go-based compiler) is mid-2026. Ecosystem compatibility is unverified. | TypeScript 5.9.x |
| JSON serialization at WASM boundary | JSON.stringify/parse at the Rust↔JS boundary is 3–10x slower than serde-wasm-bindgen's native JsValue serialization. | serde-wasm-bindgen 0.6.x |
| Embedding LLMs as hard dependencies | WebGPU is not universally available (no Safari full support, mobile limited). Hard-coding WebLLM breaks for millions of users. | Abstract AI provider interface; WebLLM as one optional impl |

---

## Stack Patterns by Variant

**WASM module initialization (async):**
- Initialize the WASM module once at app startup via `await init()` before rendering UI
- Use SolidJS `<Suspense>` to block rendering until WASM is ready
- Because WASM init returns a Promise, vite-plugin-top-level-await is needed unless build.target is `esnext`

**AI provider interface pattern:**
- Define a `AIProvider` interface in TypeScript: `{ complete(prompt: string): Promise<string>; summarize(atoms: Atom[]): Promise<string>; disabled: boolean }`
- Implementations: `WebLLMProvider`, `OllamaProvider` (localhost:11434), `OpenAIProvider` (cloud), `NullProvider` (disabled)
- User selects provider in settings; no AI features break if provider is `NullProvider`

**WASM↔SolidJS state bridge:**
- WASM functions return plain JS objects (via serde-wasm-bindgen)
- TS layer receives return values and writes to SolidJS stores or signals
- Never pass SolidJS signal objects into WASM — pass raw values, receive raw values back
- For live query reactivity: WASM computes priority scores → TS writes results to Dexie → solid-dexie live query triggers UI update

**IndexedDB schema migrations:**
- Use Dexie's versioned schema: `db.version(1).stores({...}); db.version(2).stores({...}).upgrade(...)`
- Never alter existing version schemas — always increment version for any field changes
- Zod schemas enforce atom shape before writes; Dexie schema enforces indexes

**IronCalc integration:**
- Initialize `@ironcalc/wasm` separately from the core Rust module
- Each spreadsheet atom holds an IronCalc workbook serialized as a blob in OPFS or IndexedDB blob field
- Load/save workbook on atom open/close; don't keep all workbooks in memory simultaneously

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| solid-js 1.9.x | vite-plugin-solid 2.8.x+ | vite-plugin-solid 2.8.2+ handles all test config automatically for Vitest |
| vite 7.3.x | vite-plugin-wasm 3.5.0 | Plugin explicitly supports Vite 2–7 |
| vite 7.3.x | vite-plugin-solid 2.10.x | Verified compatible |
| wasm-bindgen 0.2.109 (Cargo.toml) | wasm-bindgen-cli 0.2.109 | These MUST match exactly — mismatched versions cause cryptic binary format errors |
| dexie 4.0.x | solid-dexie 0.0.5 | solid-dexie declares dexie as a peer dep; version 4.x is supported |
| TypeScript 5.9.x | zod 4.x | Zod 4 requires TS 5.5+ |
| @ironcalc/wasm 0.7.x | Any modern bundler | Early-stage; verify WASM init pattern with their README at time of integration |

---

## Build Pipeline (WASM modules)

The three-step pipeline replacing wasm-pack:

```bash
# Step 1: Compile Rust to WASM
cargo build --target wasm32-unknown-unknown --release

# Step 2: Generate JS bindings
wasm-bindgen \
  --target web \
  ./target/wasm32-unknown-unknown/release/binderos_core.wasm \
  --out-dir ./src/wasm/

# Step 3: Optimize binary size (optional but recommended for production)
wasm-opt -Oz \
  ./src/wasm/binderos_core_bg.wasm \
  -o ./src/wasm/binderos_core_bg.wasm
```

Wrap in a Makefile or package.json script (`"build:wasm": "..."`). Run before or alongside `vite build`.

---

## Sources

- [SolidJS Releases — GitHub](https://github.com/solidjs/solid/releases) — v1.9.11 current stable, v2.0 in development
- [SolidJS Road to 2.0 Discussion](https://github.com/solidjs/solid/discussions/2425) — v2.0 status
- [Sunsetting the rustwasm GitHub org — Inside Rust Blog](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/) — wasm-pack sunset, July 2025; wasm-bindgen transferred to new org
- [Life after wasm-pack — nickb.dev](https://nickb.dev/blog/life-after-wasm-pack-an-opinionated-deconstruction/) — Concrete post-wasm-pack toolchain recommendations
- [wasm-bindgen Guide](https://rustwasm.github.io/docs/wasm-bindgen/) — Authoritative wasm-bindgen docs
- [wasm-bindgen-cli crates.io](https://crates.io/crates/wasm-bindgen-cli) — v0.2.109 current
- [IronCalc GitHub](https://github.com/ironcalc/IronCalc) — v0.7.1 (Jan 2026), early-stage
- [IronCalc web-bindings README](https://github.com/ironcalc/web-bindings/blob/main/README.pkg.md) — @ironcalc/wasm package usage
- [Dexie.js — dexie.org](https://dexie.org/) — v4.0.x stable, actively maintained
- [solid-dexie — GitHub](https://github.com/faassen/solid-dexie) — Dexie↔SolidJS reactive integration
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) — v7.3.1 current
- [vite-plugin-wasm — npm](https://www.npmjs.com/package/vite-plugin-wasm) — v3.5.0, Vite 7 compatible
- [TypeScript 5.9 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/) — v5.9.3 current stable
- [Zod v4 release notes](https://zod.dev/v4) — v4.3.6 current; v4 released July 2025
- [WebLLM — mlc-ai GitHub](https://github.com/mlc-ai/web-llm) — @mlc-ai/web-llm, WebGPU-based in-browser inference
- [Offline-first frontend apps 2025 — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — IndexedDB vs OPFS trade-offs
- [LocalStorage vs IndexedDB vs OPFS comparison — RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html) — Storage API comparison
- [SolidJS Testing guide](https://docs.solidjs.com/guides/testing) — Vitest + @solidjs/testing-library

---

## Confidence Notes

| Area | Confidence | Notes |
|------|------------|-------|
| SolidJS version | HIGH | npm confirmed, GitHub releases checked |
| Vite version | HIGH | Official blog post, v7.3.1 confirmed |
| wasm-bindgen workflow | HIGH | Inside Rust Blog official announcement; nickb.dev confirmed; crates.io version checked |
| wasm-pack deprecation | HIGH | Official Inside Rust Blog announcement July 2025 |
| Dexie.js + solid-dexie | HIGH | npm and GitHub checked; active maintenance confirmed |
| TypeScript version | HIGH | Official MS dev blog, v5.9.3 confirmed |
| Zod v4 | HIGH | Official zod.dev release notes |
| IronCalc maturity | LOW | Project self-describes as "early stage" and "work-in-progress". v0.7.1 is recent but API surface may shift. Integration testing is required before committing to this dependency. |
| AI layer (WebLLM) | MEDIUM | WebGPU availability constraint is real. Pluggable interface pattern is standard; specific provider versions need verification at integration time. |
| @solidjs/router version | MEDIUM | Confirmed general availability, version number not pinned via npm — verify at install time |

---

*Stack research for: BinderOS — local-first, browser-only personal information management system*
*Researched: 2026-02-21*
