/* tslint:disable */
/* eslint-disable */

/**
 * BinderCore: WASM module for scoring, staleness, entropy, and compression.
 */
export class BinderCore {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Compute the entropy health score for the current state.
     *
     * Input: atoms_js — array of AtomInput objects
     * Input: inbox_count — current number of inbox items
     * Input: inbox_cap — configured inbox cap
     * Input: task_cap — configured open task cap
     * Input: now_ms — current Unix timestamp in milliseconds
     * Output: EntropyScore
     */
    compute_entropy(atoms_js: any, inbox_count: number, inbox_cap: number, task_cap: number, now_ms: number): any;
    /**
     * Compute priority scores, staleness, and energy for all atoms.
     *
     * Input: atoms_js — array of AtomInput objects
     * Input: now_ms — current Unix timestamp in milliseconds
     * Output: Record<string, AtomScore> (keyed by atom id)
     */
    compute_scores(atoms_js: any, now_ms: number): any;
    /**
     * Filter atoms that are candidates for compression (stale or orphaned).
     *
     * Input: atoms_js — array of AtomInput objects
     * Input: now_ms — current Unix timestamp in milliseconds
     * Output: Vec<CompressionCandidate>
     */
    filter_compression_candidates(atoms_js: any, now_ms: number): any;
    /**
     * Create a new BinderCore instance.
     */
    constructor();
    /**
     * Smoke test for Worker communication: returns "pong".
     */
    ping(): string;
    /**
     * Returns the crate version string.
     */
    version(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_bindercore_free: (a: number, b: number) => void;
    readonly bindercore_compute_entropy: (a: number, b: any, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly bindercore_compute_scores: (a: number, b: any, c: number) => [number, number, number];
    readonly bindercore_filter_compression_candidates: (a: number, b: any, c: number) => [number, number, number];
    readonly bindercore_new: () => number;
    readonly bindercore_ping: (a: number) => [number, number];
    readonly bindercore_version: (a: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
