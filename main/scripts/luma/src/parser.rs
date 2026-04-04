use std::collections::HashMap;

pub struct CommandParser {
    aliases: HashMap<String, String>,
    server_mode_commands: HashMap<String, String>,
}

impl CommandParser {
    pub fn new() -> Self {
        let mut aliases = HashMap::new();
        
        // Main mode aliases
        aliases.insert("ls".to_string(), "logs".to_string());
        aliases.insert("r".to_string(), "restart".to_string());
        aliases.insert("st".to_string(), "status".to_string());
        aliases.insert("q".to_string(), "exit".to_string());
        aliases.insert("quit".to_string(), "exit".to_string());
        aliases.insert("?".to_string(), "help".to_string());
        aliases.insert("?".to_string(), "help".to_string());
        aliases.insert("int".to_string(), "interface".to_string());
        aliases.insert("bal".to_string(), "balance".to_string());
        
        // Server mode commands (need / prefix in Discord but not in API)
        let mut server_commands = HashMap::new();
        server_commands.insert("/blackjack".to_string(), "game-play".to_string());
        server_commands.insert("/poker".to_string(), "game-play".to_string());
        server_commands.insert("/roulette".to_string(), "game-play".to_string());
        server_commands.insert("/slots".to_string(), "game-play".to_string());
        server_commands.insert("/keno".to_string(), "game-play".to_string());
        server_commands.insert("/bingo".to_string(), "game-play".to_string());
        server_commands.insert("/wheel".to_string(), "game-play".to_string());
        server_commands.insert("/russianroulette".to_string(), "game-play".to_string());
        
        Self {
            aliases,
            server_mode_commands: server_commands,
        }
    }

    pub fn parse(&self, input: &str) -> ParsedCommand {
        let parts: Vec<&str> = input.trim().split_whitespace().collect();
        
        if parts.is_empty() {
            return ParsedCommand {
                command: String::new(),
                args: None,
            };
        }
        
        let cmd = parts[0].to_lowercase();
        
        // Check aliases
        let final_cmd = if let Some(alias) = self.aliases.get(&cmd) {
            alias.clone()
        } else {
            cmd.clone()
        };
        
        // Get args
        let args = if parts.len() > 1 {
            Some(parts[1..].join(" "))
        } else {
            None
        };
        
        ParsedCommand {
            command: final_cmd,
            args,
        }
    }

    pub fn is_server_mode_command(&self, cmd: &str) -> bool {
        self.server_mode_commands.contains_key(cmd)
    }

    pub fn get_main_commands() -> Vec<&'static str> {
        vec![
            "start",
            "stop", 
            "restart",
            "status",
            "logs",
            "say",
            "broadcast",
            "add",
            "remove",
            "balance",
            "mute",
            "unmute",
            "kick",
            "ban",
            "warn",
            "interface",
            "settings",
            "help",
            "history",
            "clear-history",
            "login",
            "logout",
            "shell",
            "exit",
        ]
    }

    pub fn get_server_commands() -> Vec<&'static str> {
        vec![
            "/blackjack",
            "/poker", 
            "/roulette",
            "/slots",
            "/keno",
            "/bingo",
            "/wheel",
            "/russianroulette",
            "say",
            "balance",
            "add",
            "remove",
            "mute",
            "unmute",
            "info",
            "back",
            "exit",
            "logout",
            "clear",
            "help",
        ]
    }
}

#[derive(Debug, Clone)]
pub struct ParsedCommand {
    pub command: String,
    pub args: Option<String>,
}

impl Default for CommandParser {
    fn default() -> Self {
        Self::new()
    }
}
