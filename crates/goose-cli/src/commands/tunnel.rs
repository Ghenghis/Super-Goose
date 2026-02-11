use anyhow::Result;

const DEFAULT_SERVER_URL: &str = "http://127.0.0.1:3284";

fn server_url() -> String {
    std::env::var("GOOSE_SERVER_URL").unwrap_or_else(|_| DEFAULT_SERVER_URL.to_string())
}

/// Start the remote access tunnel via the goosed server
pub async fn handle_tunnel_start() -> Result<()> {
    let base = server_url();
    let url = format!("{}/tunnel/start", base);
    let client = reqwest::Client::new();

    println!("Starting tunnel via goosed server...");

    let resp = client
        .post(&url)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to connect to goosed server at {}. Is `goosed` running?\n  Error: {}",
                base,
                e
            )
        })?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("Server returned non-JSON response: {}", e))?;

        println!("Tunnel started successfully!");
        if let Some(url) = body.get("url").and_then(|v| v.as_str()) {
            println!("  URL:      {}", url);
        }
        if let Some(hostname) = body.get("hostname").and_then(|v| v.as_str()) {
            println!("  Hostname: {}", hostname);
        }
        if let Some(state) = body.get("state").and_then(|v| v.as_str()) {
            println!("  State:    {}", state);
        }
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Failed to start tunnel (HTTP {}): {}", status, body);
    }

    Ok(())
}

/// Stop the remote access tunnel via the goosed server
pub async fn handle_tunnel_stop() -> Result<()> {
    let base = server_url();
    let url = format!("{}/tunnel/stop", base);
    let client = reqwest::Client::new();

    println!("Stopping tunnel...");

    let resp = client
        .post(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to connect to goosed server at {}. Is `goosed` running?\n  Error: {}",
                base,
                e
            )
        })?;

    if resp.status().is_success() {
        println!("Tunnel stopped.");
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Failed to stop tunnel (HTTP {}): {}", status, body);
    }

    Ok(())
}

/// Get the tunnel status via the goosed server
pub async fn handle_tunnel_status() -> Result<()> {
    let base = server_url();
    let url = format!("{}/tunnel/status", base);
    let client = reqwest::Client::new();

    let resp = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to connect to goosed server at {}. Is `goosed` running?\n  Error: {}",
                base,
                e
            )
        })?;

    if resp.status().is_success() {
        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| anyhow::anyhow!("Server returned non-JSON response: {}", e))?;

        println!("Tunnel Status");
        println!("{}", "-".repeat(50));

        let state = body
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        println!("  State:    {}", state);

        if let Some(url) = body.get("url").and_then(|v| v.as_str()) {
            if !url.is_empty() {
                println!("  URL:      {}", url);
            }
        }
        if let Some(hostname) = body.get("hostname").and_then(|v| v.as_str()) {
            if !hostname.is_empty() {
                println!("  Hostname: {}", hostname);
            }
        }
        if let Some(secret) = body.get("secret").and_then(|v| v.as_str()) {
            if !secret.is_empty() {
                // Use char-based truncation to avoid panicking on multi-byte UTF-8
                let truncated: String = secret.chars().take(8).collect();
                println!("  Secret:   {}...", truncated);
            }
        }

        println!("{}", "-".repeat(50));
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Failed to get tunnel status (HTTP {}): {}", status, body);
    }

    Ok(())
}
