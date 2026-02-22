use wasm_bindgen::prelude::*;

/// BinderCore: minimal WASM module for Phase 1 Worker bridge.
/// Phase 2 adds the real compute engine (priority scoring, staleness decay, entropy).
#[wasm_bindgen]
pub struct BinderCore {
    version: String,
}

#[wasm_bindgen]
impl BinderCore {
    /// Create a new BinderCore instance.
    #[wasm_bindgen(constructor)]
    pub fn new() -> BinderCore {
        BinderCore {
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }

    /// Smoke test for Worker communication: returns "pong".
    pub fn ping(&self) -> String {
        "pong".to_string()
    }

    /// Returns the crate version string.
    pub fn version(&self) -> String {
        self.version.clone()
    }
}
