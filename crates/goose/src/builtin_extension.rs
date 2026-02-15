use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::RwLock;

pub type SpawnServerFn = fn(tokio::io::DuplexStream, tokio::io::DuplexStream);

static BUILTIN_REGISTRY: Lazy<RwLock<HashMap<&'static str, SpawnServerFn>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// Register a builtin extension into the global registry
pub fn register_builtin_extension(name: &'static str, spawn_fn: SpawnServerFn) {
    match BUILTIN_REGISTRY.write() {
        Ok(mut registry) => {
            registry.insert(name, spawn_fn);
        }
        Err(e) => {
            tracing::error!("Builtin extension registry lock poisoned in register: {}", e);
        }
    }
}

/// Register multiple builtin extensions from a HashMap
pub fn register_builtin_extensions(extensions: HashMap<&'static str, SpawnServerFn>) {
    match BUILTIN_REGISTRY.write() {
        Ok(mut registry) => {
            registry.extend(extensions);
        }
        Err(e) => {
            tracing::error!("Builtin extension registry lock poisoned in register_multiple: {}", e);
        }
    }
}

/// Get a copy of all registered builtin extensions
pub fn get_builtin_extension(name: &str) -> Option<SpawnServerFn> {
    match BUILTIN_REGISTRY.read() {
        Ok(registry) => registry.get(name).cloned(),
        Err(e) => {
            tracing::error!("Builtin extension registry lock poisoned in get: {}", e);
            None
        }
    }
}
