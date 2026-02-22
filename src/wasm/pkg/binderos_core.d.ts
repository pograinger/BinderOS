/* tslint:disable */
/* eslint-disable */

/**
 * BinderCore: minimal WASM module for Phase 1 Worker bridge.
 * Phase 2 adds the real compute engine (priority scoring, staleness decay, entropy).
 */
export class BinderCore {
    free(): void;
    [Symbol.dispose](): void;
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
    readonly bindercore_new: () => number;
    readonly bindercore_ping: (a: number) => [number, number];
    readonly bindercore_version: (a: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
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
