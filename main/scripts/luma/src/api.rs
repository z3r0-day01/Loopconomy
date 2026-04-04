use reqwest::blocking::Client;
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize, Default)]
pub struct StatusResponse {
    pub temp: f32,
    pub ram: u64,
    pub ping: i32,
    pub uptime: String,
    pub servers: u32,
    pub users: u32,
    pub commands: u32,
}

#[derive(Debug, Deserialize)]
pub struct LoginResponse {
    pub success: bool,
    pub error: Option<String>,
    pub token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ShellResponse {
    pub output: Option<String>,
    pub error: Option<String>,
}

pub struct ApiClient {
    client: Client,
    base_url: String,
    auth_token: Option<String>,
}

impl ApiClient {
    pub fn new(base_url: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            base_url,
            auth_token: None,
        }
    }

    pub fn get_status(&self) -> Result<StatusResponse, String> {
        let url = format!("{}/api/shell/status", self.base_url);
        
        let response = self.client
            .get(&url)
            .header("Authorization", format!("Basic {}", self.auth_token.as_ref().unwrap_or(&String::new())))
            .send()
            .map_err(|e| e.to_string())?;
        
        if response.status().is_success() {
            response.json::<StatusResponse>().map_err(|e| e.to_string())
        } else {
            Err(format!("HTTP error: {}", response.status()))
        }
    }

    pub fn login(&mut self, username: &str, password: &str) -> Result<(), String> {
        let url = format!("{}/api/login", self.base_url);
        
        let response = self.client
            .post(&url)
            .json(&serde_json::json!({
                "username": username,
                "password": password
            }))
            .send()
            .map_err(|e| e.to_string())?;
        
        if response.status().is_success() {
            let login_resp: LoginResponse = response.json().map_err(|e| e.to_string())?;
            if login_resp.success {
                // Store Basic auth token for subsequent requests
                let credentials = format!("{}:{}", username, password);
                self.auth_token = Some(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, credentials));
                Ok(())
            } else {
                Err(login_resp.error.unwrap_or_else(|| "Login failed".to_string()))
            }
        } else {
            Err(format!("HTTP error: {}", response.status()))
        }
    }

    pub fn execute_shell_command(&self, command: &str, args: &str) -> Result<String, String> {
        let url = format!("{}/api/shell/{}", self.base_url, command);
        
        let auth_header = if let Some(ref token) = self.auth_token {
            format!("Basic {}", token)
        } else {
            String::new()
        };
        
        let response = self.client
            .post(&url)
            .header("Authorization", auth_header)
            .json(&serde_json::json!({
                "args": args,
                "server_id": "main"
            }))
            .send()
            .map_err(|e| e.to_string())?;
        
        if response.status().is_success() {
            let shell_resp: ShellResponse = response.json().map_err(|e| e.to_string())?;
            Ok(shell_resp.output.unwrap_or_else(|| shell_resp.error.unwrap_or_default()))
        } else {
            Err(format!("HTTP error: {}", response.status()))
        }
    }

    pub fn get_servers(&self) -> Result<Vec<super::ServerInfo>, String> {
        // For now, return placeholder - would need actual endpoint
        Ok(vec![super::ServerInfo {
            name: "Dev".to_string(),
            id: "1".to_string(),
            online: true,
        }])
    }
}
