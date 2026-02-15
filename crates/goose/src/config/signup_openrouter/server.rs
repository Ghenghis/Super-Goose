use anyhow::Result;
use axum::{
    extract::Query,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::get,
    Router,
};
use include_dir::{include_dir, Dir};
use minijinja::{context, Environment};
use serde::Deserialize;
use std::net::SocketAddr;
use tokio::sync::oneshot;

static TEMPLATES_DIR: Dir =
    include_dir!("$CARGO_MANIFEST_DIR/src/config/signup_openrouter/templates");

#[derive(Debug, Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    error: Option<String>,
}

/// Run the callback server on localhost:3000
pub async fn run_callback_server(
    code_tx: oneshot::Sender<String>,
    shutdown_rx: oneshot::Receiver<()>,
) -> Result<()> {
    let app = Router::new().route("/", get(handle_callback));
    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let state = std::sync::Arc::new(tokio::sync::Mutex::new(Some(code_tx)));

    axum::serve(listener, app.with_state(state.clone()).into_make_service())
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .await?;

    Ok(())
}

async fn handle_callback(
    Query(params): Query<CallbackQuery>,
    state: axum::extract::State<
        std::sync::Arc<tokio::sync::Mutex<Option<oneshot::Sender<String>>>>,
    >,
) -> impl IntoResponse {
    if let Some(error) = params.error {
        let rendered = render_embedded_template("error.html", Some(&error));
        return (StatusCode::BAD_REQUEST, Html(rendered));
    }

    if let Some(code) = params.code {
        let mut tx_guard = state.lock().await;
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(code);
        }

        let success_html = render_embedded_template("success.html", None);
        return (StatusCode::OK, Html(success_html));
    }

    let invalid_html = render_embedded_template("invalid.html", None);
    (StatusCode::BAD_REQUEST, Html(invalid_html))
}

/// Render an embedded template file, with an optional `error` context variable.
///
/// Returns a safe fallback HTML string if any step fails (file not found,
/// invalid UTF-8, template rendering error) instead of panicking.
fn render_embedded_template(filename: &str, error_ctx: Option<&str>) -> String {
    let Some(file) = TEMPLATES_DIR.get_file(filename) else {
        return format!("<html><body><p>Template {} not found</p></body></html>", filename);
    };
    let Some(content) = file.contents_utf8() else {
        return format!("<html><body><p>Template {} is not valid UTF-8</p></body></html>", filename);
    };

    if let Some(error) = error_ctx {
        let mut env = Environment::new();
        if env.add_template("tpl", content).is_err() {
            return content.to_string();
        }
        match env.get_template("tpl") {
            Ok(tmpl) => tmpl.render(context! { error => error }).unwrap_or_else(|_| content.to_string()),
            Err(_) => content.to_string(),
        }
    } else {
        content.to_string()
    }
}
