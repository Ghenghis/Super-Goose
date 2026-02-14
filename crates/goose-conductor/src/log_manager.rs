//! Structured logging with file rotation.
//!
//! Initialises a `tracing` subscriber that writes JSON-formatted log entries
//! to a file (rotated daily) **and** to stderr.  Every write is immediately
//! flushed so that logs survive a crash.

use std::path::Path;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::fmt::time::UtcTime;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};

use crate::config::LogConfig;

/// Holds the flush guard — drop it only on shutdown.
pub struct LogManager {
    /// Dropping this guard flushes remaining buffered log lines.
    _guard: WorkerGuard,
}

impl LogManager {
    /// Initialise the global tracing subscriber.
    ///
    /// Returns a `LogManager` whose lifetime controls the flush guard.
    /// The caller **must** keep it alive for the duration of the process.
    pub fn init(config: &LogConfig) -> anyhow::Result<Self> {
        // Ensure the log directory exists.
        std::fs::create_dir_all(&config.dir)?;

        // Daily-rotated file appender.
        let file_appender =
            tracing_appender::rolling::daily(&config.dir, "goose-conductor.log");
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

        // File layer: JSON, UTC timestamps.
        let file_layer = fmt::layer()
            .json()
            .with_timer(UtcTime::rfc_3339())
            .with_target(true)
            .with_thread_ids(true)
            .with_writer(non_blocking);

        // Stderr layer: human-readable, coloured.
        let stderr_layer = fmt::layer()
            .with_timer(UtcTime::rfc_3339())
            .with_target(true)
            .with_ansi(true);

        // Env filter: respect `RUST_LOG`, default to info.
        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info,goose_conductor=debug,sqlx=warn"));

        tracing_subscriber::registry()
            .with(filter)
            .with(file_layer)
            .with(stderr_layer)
            .init();

        tracing::info!(
            log_dir = %config.dir.display(),
            "logging initialised"
        );

        Ok(Self { _guard: guard })
    }
}

/// Convenience: clean up old log files beyond `max_files` count.
///
/// This is a best-effort operation — failures are logged but do not
/// propagate.
pub fn prune_old_logs(dir: &Path, max_files: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    let mut logs: Vec<_> = entries
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .file_name()
                .map(|n| n.to_string_lossy().starts_with("goose-conductor.log"))
                .unwrap_or(false)
        })
        .collect();

    // Sort by modification time, newest first.
    logs.sort_by(|a, b| {
        let ta = a.metadata().and_then(|m| m.modified()).ok();
        let tb = b.metadata().and_then(|m| m.modified()).ok();
        tb.cmp(&ta)
    });

    // Remove everything beyond `max_files`.
    for old in logs.into_iter().skip(max_files) {
        let path = old.path();
        if let Err(e) = std::fs::remove_file(&path) {
            tracing::warn!(path = %path.display(), error = %e, "failed to prune old log");
        } else {
            tracing::debug!(path = %path.display(), "pruned old log file");
        }
    }
}
