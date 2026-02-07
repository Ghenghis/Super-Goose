use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SonarQubeConfig {
    pub host_url: String,
    pub token: String,
    pub project_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QualityGateStatus {
    #[serde(rename = "projectStatus")]
    pub project_status: ProjectStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectStatus {
    pub status: String,
    pub conditions: Vec<QualityCondition>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QualityCondition {
    pub status: String,
    #[serde(rename = "metricKey")]
    pub metric_key: String,
    #[serde(rename = "actualValue")]
    pub actual_value: String,
    #[serde(rename = "errorThreshold")]
    pub error_threshold: String,
}

impl SonarQubeConfig {
    /// Create from environment variables
    pub fn from_env() -> Result<Self, String> {
        Ok(Self {
            host_url: std::env::var("SONAR_HOST_URL")
                .unwrap_or_else(|_| "http://localhost:9000".to_string()),
            token: std::env::var("SONAR_TOKEN")
                .map_err(|_| "SONAR_TOKEN environment variable not set".to_string())?,
            project_key: std::env::var("SONAR_PROJECT_KEY")
                .unwrap_or_else(|_| "goose-ui".to_string()),
        })
    }

    /// Run SonarQube analysis on specified path
    pub fn analyze_codebase(&self, path: &str) -> Result<(), String> {
        println!("🔍 Running SonarQube analysis on {}...", path);

        let output = Command::new("sonar-scanner")
            .arg(format!("-Dsonar.projectKey={}", self.project_key))
            .arg(format!("-Dsonar.host.url={}", self.host_url))
            .arg(format!("-Dsonar.login={}", self.token))
            .arg(format!("-Dsonar.sources={}", path))
            .arg("-Dsonar.scm.disabled=true")
            .output()
            .map_err(|e| {
                format!(
                    "Failed to run sonar-scanner (is it installed?): {}",
                    e
                )
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("SonarQube analysis failed:\n{}", stderr));
        }

        println!("✅ SonarQube analysis complete");
        Ok(())
    }

    /// Check quality gate status
    pub async fn check_quality_gate(&self) -> Result<QualityGateStatus, String> {
        println!("🚦 Checking quality gate status...");

        let url = format!(
            "{}/api/qualitygates/project_status?projectKey={}",
            self.host_url, self.project_key
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .basic_auth(&self.token, Some(""))
            .send()
            .await
            .map_err(|e| format!("Failed to check quality gate: {}", e))?;

        if !response.status().is_success() {
            return Err(format!(
                "Quality gate check failed with status: {}",
                response.status()
            ));
        }

        let status: QualityGateStatus = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse quality gate response: {}", e))?;

        self.print_quality_gate_status(&status);

        Ok(status)
    }

    /// Print quality gate status with colors
    fn print_quality_gate_status(&self, status: &QualityGateStatus) {
        if status.project_status.status == "ERROR" {
            println!("❌ Quality gate FAILED!");
            println!("Issues found:");

            for condition in &status.project_status.conditions {
                if condition.status == "ERROR" {
                    println!(
                        "  ❌ {}: {} (threshold: {})",
                        condition.metric_key,
                        condition.actual_value,
                        condition.error_threshold
                    );
                }
            }

            println!("\n📊 View full report:");
            println!(
                "   {}/dashboard?id={}",
                self.host_url, self.project_key
            );
        } else {
            println!("✅ Quality gate PASSED!");
        }
    }

    /// Get detailed quality metrics
    pub async fn get_metrics(&self) -> Result<Vec<Metric>, String> {
        let url = format!(
            "{}/api/measures/component?component={}&metricKeys=bugs,vulnerabilities,code_smells,coverage,duplicated_lines_density",
            self.host_url, self.project_key
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .basic_auth(&self.token, Some(""))
            .send()
            .await
            .map_err(|e| format!("Failed to get metrics: {}", e))?;

        let metrics: MetricsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse metrics response: {}", e))?;

        Ok(metrics.component.measures)
    }
}

#[derive(Debug, Deserialize)]
struct MetricsResponse {
    component: Component,
}

#[derive(Debug, Deserialize)]
struct Component {
    measures: Vec<Metric>,
}

#[derive(Debug, Deserialize)]
pub struct Metric {
    pub metric: String,
    pub value: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_from_env() {
        std::env::set_var("SONAR_TOKEN", "test_token");
        let config = SonarQubeConfig::from_env();
        assert!(config.is_ok());
    }

    #[test]
    fn test_config_without_token() {
        std::env::remove_var("SONAR_TOKEN");
        let config = SonarQubeConfig::from_env();
        assert!(config.is_err());
    }
}
