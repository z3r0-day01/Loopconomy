use std::io;
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use ratatui::prelude::*;
use ratatui::widgets::*;
use ratatui::Frame;
use crossterm::event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, MouseEvent, MouseEventKind, KeyModifiers, MouseButton};
use crossterm::execute;
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};

mod api;
mod nesh;
mod nexe;

use api::ApiClient;
use nesh::NeSH;
use nexe::{NeXeState, render_nexe};

const COLORS: (Color, Color, Color, Color, Color, Color, Color, Color) = (
    Color::Cyan,      // Primary
    Color::Green,     // Success
    Color::Red,       // Error
    Color::Yellow,    // Warning
    Color::Magenta,   // Highlight
    Color::White,     // Text
    Color::DarkGray,  // Muted
    Color::Blue,      // Info
);

struct App {
    api: ApiClient,
    output: Vec<ColoredLine>,
    command_input: String,
    cursor_position: usize,
    history: Vec<String>,
    history_index: isize,
    mode: LumaMode,
    nesh_mode: bool,  // Track if in NeSH (Ne, NeS, NeC, NeXe)
    username: String,
    authenticated: bool,
    password_hash: Option<String>,
    api_username: String,  // For API Basic auth
    api_password: String,   // For API Basic auth
    current_server: String,
    stats: BotStats,
    servers: Vec<ServerInfo>,
    sidebar_width: u16,
    commands_run: u32,
    nesh: NeSH,
    nexe: NeXeState,
    scroll_offset: u16,
    autocomplete_suggestion: String,
    nec_editor: NecEditor,
    quickshell_active: bool,
    quickshell_buffer: String,
    resizing: bool,
    launch_nexe: bool,
}

#[derive(Clone)]
struct ColoredLine {
    text: String,
    color: Color,
}

#[derive(Clone, PartialEq)]
enum LumaMode {
    Normal,
    NeSH,
    NeS,
    NeC,
    NeXe,
    Login,
}

#[derive(Clone, Default)]
struct BotStats {
    temp: f32,
    ram: u64,
    ping: i32,
    uptime: String,
    servers: u32,
    users: u32,
    commands: u32,
}

#[derive(Clone, Default)]
struct ServerInfo {
    name: String,
    id: String,
    online: bool,
}

#[derive(Clone, Default)]
struct NecEditor {
    lines: Vec<String>,
    cursor_line: usize,
    cursor_col: usize,
    running: bool,
}

impl App {
    fn new() -> Self {
        let bot_root = PathBuf::from("/home/z3r0/loop/main");
        
        Self {
            api: ApiClient::new("http://localhost:8080".to_string()),
            output: Vec::new(),
            command_input: String::new(),
            cursor_position: 0,
            history: Vec::new(),
            history_index: -1,
            mode: LumaMode::Normal,
            nesh_mode: false,
            username: "guest".to_string(),
            authenticated: false,
            password_hash: None,
            api_username: String::new(),
            api_password: String::new(),
            current_server: "main".to_string(),
            stats: BotStats::default(),
            servers: vec![ServerInfo { name: "Dev".to_string(), id: "main".to_string(), online: true }],
            sidebar_width: 25,
            commands_run: 0,
            nesh: NeSH::new(bot_root),
            nexe: NeXeState::new(),
            scroll_offset: 0,
            autocomplete_suggestion: String::new(),
            nec_editor: NecEditor::default(),
            quickshell_active: false,
            quickshell_buffer: String::new(),
            resizing: false,
            launch_nexe: false,
        }
    }

    fn push_output(&mut self, text: &str) {
        for line in text.lines() {
            self.output.push(ColoredLine { text: line.to_string(), color: COLORS.5 });
        }
        self.trim_output();
    }

    fn push_colored(&mut self, text: &str, color: Color) {
        for line in text.lines() {
            self.output.push(ColoredLine { text: line.to_string(), color });
        }
        self.trim_output();
    }

    fn trim_output(&mut self) {
        if self.output.len() > 1000 {
            self.output.drain(0..self.output.len() - 1000);
        }
    }

    fn clear_output(&mut self) {
        self.output.clear();
    }

    fn execute_command(&mut self, cmd: &str) -> String {
        let cmd = cmd.trim();
        if cmd.is_empty() {
            return String::new();
        }

        self.history.push(cmd.to_string());
        self.history_index = self.history.len() as isize;
        self.commands_run += 1;

        // Check for NeXe interface switch - return signal to launch external NeXe binary
        if cmd.starts_with("interface NeXe") {
            self.launch_nexe = true;
            return "Launching NeXe Graphics (real OS window)...".to_string();
        }

        match self.mode {
            LumaMode::NeSH | LumaMode::NeS => {
                let result = self.nesh.execute(cmd);
                // Check if NeSH switched to NeXe mode
                if self.nesh.is_nexe_switched() {
                    self.mode = LumaMode::NeXe;
                }
                result
            }
            LumaMode::NeC => self.execute_nec(cmd),
            LumaMode::NeXe => self.execute_nexe_command(cmd),
            LumaMode::Normal | LumaMode::Login => self.execute_luma_command(cmd),
        }
    }

    fn execute_luma_command(&mut self, cmd: &str) -> String {
        let parts: Vec<&str> = cmd.split_whitespace().collect();
        if parts.is_empty() {
            return String::new();
        }

        let program = parts[0];
        let args: Vec<&str> = parts[1..].to_vec();

        match program {
            "help" => self.help_command(args),
            "clear" | "cls" => {
                self.clear_output();
                String::new()
            }
            "exit" | "quit" => "Use Ctrl+C to exit LUMA".to_string(),
            "whoami" => format!("{}", self.username),
            "pwd" => "/home/eden".to_string(),
            "date" => chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            "uname" => "EdenOS v1.1.3-1r".to_string(),
            "hostname" => "eden.local".to_string(),
            "ls" => self.bot_ls(args.join(" ").as_str()),
            "cat" => self.bot_cat(args.join(" ").as_str()),
            "mkdir" => self.bot_mkdir(args.join(" ").as_str()),
            "touch" => self.bot_touch(args.join(" ").as_str()),
            "rm" => self.bot_rm(args.join(" ").as_str()),
            "login" => self.handle_login(args),
            "logout" => {
                self.authenticated = false;
                self.username = "guest".to_string();
                self.mode = LumaMode::Login;
                "Logged out. Please login again.".to_string()
            }
            "connect" => self.connect_server(args),
            "servers" => self.list_servers(),
            "start" => {
                if !self.authenticated {
                    return "Not authenticated. Use 'login <user>' first.".to_string();
                }
                match self.api.execute_shell_command("start", "") {
                    Ok(r) => r,
                    Err(e) => format!("Error: {}", e),
                }
            }
            "stop" => {
                if !self.authenticated {
                    return "Not authenticated. Use 'login <user>' first.".to_string();
                }
                match self.api.execute_shell_command("stop", "") {
                    Ok(r) => r,
                    Err(e) => format!("Error: {}", e),
                }
            }
            "restart" => {
                if !self.authenticated {
                    return "Not authenticated. Use 'login <user>' first.".to_string();
                }
                match self.api.execute_shell_command("restart", "") {
                    Ok(r) => r,
                    Err(e) => format!("Error: {}", e),
                }
            }
            "status" => self.bot_status(),
            "logs" => "Fetching logs... (requires bot running)".to_string(),
            "say" => {
                if args.is_empty() { return "Usage: say <message>".to_string(); }
                format!("[BOT] {}", args.join(" "))
            }
            "broadcast" => {
                if args.is_empty() { return "Usage: broadcast <message>".to_string(); }
                format!("[BROADCAST] {}", args.join(" "))
            }
            "interface" => {
                if args.is_empty() { return "Usage: interface <NeS|NeC|NeXe> (use 'interface' from NeSH to enter)".to_string(); }
                "Use 'interface' command in NeSH to switch interfaces".to_string()
            }
            "neonctl" => self.neonctl_command(args),
            "sh" => self.execute_shell(&args.join(" ")),
            _ => format!("Command not found: {}. Type 'help' for available commands.", program),
        }
    }

    fn help_command(&self, _args: Vec<&str>) -> String {
        r#"╔══════════════════════════════════════════════════════════════════╗
║                    LUMA v1.1.3-1r HELP                                ║
╠══════════════════════════════════════════════════════════════════╣
║  Bot Management:                                                      ║
║    start <server>     - Start bot on server                           ║
║    stop <server>      - Stop bot on server                            ║
║    restart <server>   - Restart bot on server                         ║
║    status             - Show bot status                               ║
║    logs [lines]       - Show bot logs                                  ║
║    servers            - List available servers                         ║
║    connect <server>   - Connect to a server                           ║
║                                                                       ║
║  Messaging:                                                           ║
║    say <message>      - Send message to channel                       ║
║    broadcast <msg>    - Broadcast to all servers                      ║
║                                                                       ║
║  System:                                                              ║
║    whoami             - Current user                                  ║
║    hostname           - Current hostname                              ║
║    pwd                - Current directory                            ║
║    date               - Current date/time                             ║
║    uname              - System information                             ║
║    login <user>       - Login to LUMA                                 ║
║    logout             - Logout from LUMA                              ║
║                                                                       ║
║  Filesystem (bot-local):                                              ║
║    ls [path]          - List directory                               ║
║    cat <file>         - Show file contents                            ║
║    mkdir <dir>        - Create directory                              ║
║    touch <file>       - Create empty file                             ║
║    rm <path>          - Remove file/directory                         ║
║                                                                       ║
║  Shell (real system - requires 'sh' prefix):                          ║
║    sh <command>       - Execute real shell command                    ║
║                                                                       ║
║  Other:                                                               ║
║    clear              - Clear screen                                 ║
║    help               - Show this help                               ║
║    exit               - Exit LUMA (Ctrl+C)                           ║
║                                                                       ║
║  Special Modes:                                                       ║
║    Press ALT+S         - Enter NeSH (Neon Shell)                      ║
║    In NeSH: interface  - Switch to NeS/NeC/NeXe                        ║
╚══════════════════════════════════════════════════════════════════╝"#.to_string()
    }

    fn bot_ls(&self, path: &str) -> String {
        let full_path = if path.is_empty() || path == "." {
            self.nesh.bot_root.clone()
        } else if path.starts_with('/') {
            PathBuf::from(path)
        } else {
            self.nesh.bot_root.join(path)
        };

        match std::fs::read_dir(&full_path) {
            Ok(entries) => {
                let mut dirs = Vec::new();
                let mut files = Vec::new();
                
                for entry in entries.filter_map(|e| e.ok()) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if entry.path().is_dir() {
                        dirs.push(format!("\x1b[34m{}/\x1b[0m", name));
                    } else {
                        files.push(name);
                    }
                }
                
                dirs.sort();
                files.sort();
                
                let mut result = dirs;
                result.extend(files);
                result.join("  ")
            }
            Err(_) => format!("ls: {}: No such directory", path),
        }
    }

    fn bot_cat(&self, path: &str) -> String {
        if path.is_empty() {
            return "cat: missing operand".to_string();
        }
        let full_path = if path.starts_with('/') {
            PathBuf::from(path)
        } else {
            self.nesh.bot_root.join(path)
        };

        match std::fs::read_to_string(&full_path) {
            Ok(content) => content,
            Err(e) => format!("cat: {}: {}", path, e),
        }
    }

    fn bot_mkdir(&self, path: &str) -> String {
        if path.is_empty() {
            return "mkdir: missing operand".to_string();
        }
        let full_path = self.nesh.bot_root.join(path);
        match std::fs::create_dir(&full_path) {
            Ok(_) => format!("Created: {}", path),
            Err(e) => format!("mkdir: {}: {}", path, e),
        }
    }

    fn bot_touch(&self, path: &str) -> String {
        if path.is_empty() {
            return "touch: missing operand".to_string();
        }
        let full_path = self.nesh.bot_root.join(path);
        match std::fs::write(&full_path, "") {
            Ok(_) => format!("Created: {}", path),
            Err(e) => format!("touch: {}: {}", path, e),
        }
    }

    fn bot_rm(&self, path: &str) -> String {
        if path.is_empty() {
            return "rm: missing operand".to_string();
        }
        let full_path = self.nesh.bot_root.join(path);
        let p = std::path::Path::new(&full_path);
        if p.is_dir() {
            match std::fs::remove_dir_all(&full_path) {
                Ok(_) => format!("Removed: {}", path),
                Err(e) => format!("rm: {}: {}", path, e),
            }
        } else {
            match std::fs::remove_file(&full_path) {
                Ok(_) => format!("Removed: {}", path),
                Err(e) => format!("rm: {}: {}", path, e),
            }
        }
    }

    fn handle_login(&mut self, args: Vec<&str>) -> String {
        if args.is_empty() {
            self.mode = LumaMode::Login;
            return "Enter username: ".to_string();
        }
        
        if !self.authenticated {
            self.username = args[0].to_string();
            self.mode = LumaMode::Login;
            return "Enter password: ".to_string();
        }
        
        format!("Already logged in as {}", self.username)
    }

    fn handle_login_password(&mut self, password: &str) -> String {
        // Actually authenticate with the bot API
        match self.api.login(&self.username, password) {
            Ok(_) => {
                self.authenticated = true;
                self.mode = LumaMode::Normal;
                self.api_username = self.username.clone();
                self.api_password = password.to_string();
                format!("Login successful! Welcome, {}", self.username)
            }
            Err(e) => {
                self.authenticated = false;
                self.username = "guest".to_string();
                self.mode = LumaMode::Normal;
                format!("Login failed: {}", e)
            }
        }
    }

    fn connect_server(&mut self, args: Vec<&str>) -> String {
        if args.is_empty() {
            return "Usage: connect <server-id>".to_string();
        }
        let server_id = args[0];
        if self.servers.iter().any(|s| s.id == server_id) {
            self.current_server = server_id.to_string();
            format!("Connected to server: {}", server_id)
        } else {
            format!("Server '{}' not found. Use 'servers' to list.", server_id)
        }
    }

    fn list_servers(&self) -> String {
        let mut result = String::from("Available servers:\n");
        for server in &self.servers {
            let status = if server.online { "\x1b[32m●\x1b[0m" } else { "\x1b[31m○\x1b[0m" };
            let current = if server.id == self.current_server { " (current)" } else { "" };
            result.push_str(&format!("  {} {}{}\n", status, server.name, current));
        }
        result
    }

    fn bot_status(&self) -> String {
        format!("╔═══════════════════════════╗\n║     BOT STATUS            ║\n╠═══════════════════════════╣\n║ User: {}                 ║\n║ Server: {}                ║\n║ Servers Online: {}        ║\n║ Commands Run: {}          ║\n║ Uptime: {}               ║\n╚═══════════════════════════╝",
            self.username, self.current_server, self.servers.iter().filter(|s| s.online).count(), self.commands_run, self.stats.uptime)
    }

    fn execute_shell(&self, cmd: &str) -> String {
        if cmd.is_empty() {
            return "Usage: sh <command>".to_string();
        }
        
        match Command::new("sh").args(["-c", cmd]).output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                if stdout.is_empty() && !stderr.is_empty() {
                    stderr.to_string()
                } else {
                    stdout.to_string()
                }
            }
            Err(e) => format!("sh: {}: {}", cmd, e),
        }
    }

    fn neonctl_command(&self, args: Vec<&str>) -> String {
        if args.is_empty() {
            return "Usage: neonctl <set|save|get> [options]".to_string();
        }
        
        match args[0] {
            "set" => {
                if args.len() < 2 {
                    return "Usage: neonctl set <option>=<value>".to_string();
                }
                format!("Setting '{}' (saved to config)", args[1])
            }
            "save" => "Configuration saved.".to_string(),
            "get" => {
                if args.len() < 2 {
                    return "Usage: neonctl get <option>".to_string();
                }
                format!("{} = value", args[1])
            }
            _ => "Usage: neonctl <set|save|get>".to_string(),
        }
    }

    fn execute_nec(&mut self, cmd: &str) -> String {
        if self.nec_editor.running {
            if cmd == "<EOF>" {
                return self.nec_compile_run();
            }
            if cmd.starts_with(|c: char| c.is_ascii_digit()) {
                let parts: Vec<&str> = cmd.splitn(2, ':').collect();
                if parts.len() == 2 {
                    let line_num: f64 = parts[0].parse().unwrap_or(0.0);
                    let statement = parts[1].trim().to_string();
                    self.nec_editor.lines.push(format!("{:02}: {}", line_num as u32, statement));
                    return String::new();
                }
            }
            self.nec_editor.lines.push(cmd.to_string());
            return String::new();
        }
        
        if cmd == "RUN" || cmd == "run" {
            return self.nec_compile_run();
        }
        
        if cmd == "LIST" || cmd == "list" {
            return self.nec_editor.lines.join("\n");
        }
        
        if cmd == "NEW" || cmd == "new" {
            self.nec_editor.lines.clear();
            return "Program cleared.".to_string();
        }
        
        if cmd == "EDIT" || cmd == "edit" {
            self.nec_editor.running = true;
            return "Neon-Carbon BASIC Editor\nEnter program lines (format: 00: <statement>)\nType <EOF> to compile and run".to_string();
        }
        
        "Use EDIT to enter program, NEW to clear, RUN to execute, LIST to view".to_string()
    }

    fn nec_compile_run(&mut self) -> String {
        if self.nec_editor.lines.is_empty() {
            return "No program to run. Use EDIT to enter code.".to_string();
        }
        
        let mut output = Vec::new();
        output.push("Compiling...".to_string());
        output.push(format!("Set {} Rules.", self.nec_editor.lines.len()));
        output.push("Verifying Algebra: PASS".to_string());
        output.push("Done.".to_string());
        output.push("RUN: PRG.BIN".to_string());
        output.push("DONE.".to_string());
        
        self.nec_editor.lines.join("\n")
    }

    fn execute_nexe_command(&mut self, cmd: &str) -> String {
        if cmd == "exit" || cmd == "quit" {
            self.mode = LumaMode::Normal;
            return "Exited NeXe Graphics".to_string();
        }
        
        if cmd == "clear" {
            self.clear_output();
            return String::new();
        }
        
        if cmd.starts_with("neonctl ") {
            let args: Vec<&str> = cmd.split_whitespace().collect();
            return self.neonctl_command(args[1..].to_vec());
        }
        
        "NeXe Commands: exit, clear, neonctl <set|save|get>".to_string()
    }

    fn refresh_stats(&mut self) {
        if let Ok(stats) = self.api.get_status() {
            self.stats.temp = stats.temp;
            self.stats.ram = stats.ram;
            self.stats.ping = stats.ping;
            self.stats.uptime = stats.uptime;
            self.stats.servers = stats.servers;
            self.stats.users = stats.users;
            self.stats.commands = stats.commands;
        }
    }

    fn get_time_string(&self) -> String {
        chrono::Local::now().format("%H-%M").to_string()
    }

    fn get_autocomplete(&self) -> String {
        if self.command_input.is_empty() {
            return String::new();
        }
        
        let commands = vec![
            "help", "clear", "cls", "exit", "quit", "whoami", "pwd", "date", 
            "uname", "hostname", "ls", "cat", "mkdir", "touch", "rm",
            "login", "logout", "connect", "servers", "start", "stop", "restart",
            "status", "logs", "say", "broadcast", "interface", "neonctl", "sh",
        ];
        
        for cmd in commands {
            if cmd.starts_with(&self.command_input.to_lowercase()) && cmd != self.command_input.to_lowercase() {
                return cmd[self.command_input.len()..].to_string();
            }
        }
        
        String::new()
    }

    fn enter_quickshell(&mut self) {
        self.quickshell_active = true;
        self.quickshell_buffer = "× ".to_string();
    }

    fn exit_quickshell(&mut self, force: bool) {
        if self.quickshell_buffer == "!stop" || force {
            self.quickshell_active = false;
            self.quickshell_buffer = String::new();
        }
    }
}

fn main() -> io::Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new();
    app.push_colored("╔═══════════════════════════════════════════════════════════════════════╗", COLORS.0);
    app.push_colored("║                 LUMA v1.1.3-1r                                      ║", COLORS.0);
    app.push_colored("║          Loopconomy Unified Manager Application                       ║", COLORS.0);
    app.push_colored("╠═══════════════════════════════════════════════════════════════════════╣", COLORS.0);
    app.push_colored("║  Type 'help' for commands, 'login <user>' to authenticate             ║", COLORS.0);
    app.push_colored("║  Press ALT+S to enter Neon Shell (NeSH)                               ║", COLORS.0);
    app.push_colored("╚═══════════════════════════════════════════════════════════════════════╝", COLORS.0);
    app.push_output("");

    loop {
        let size = terminal.size().unwrap();
        
        terminal.draw(|f| {
            if app.mode == LumaMode::NeXe {
                // Initialize windows when entering NeXe mode
                if app.nexe.windows.is_empty() {
                    app.nexe.init_default_windows();
                }
                render_nexe(f, &mut app.nexe, size);
            } else {
                render_app(f, &mut app, size);
            }
        }).ok();

        if event::poll(Duration::from_millis(50)).ok() != Some(true) {
            continue;
        }

        let event_result = event::read();
        if event_result.is_err() {
            continue;
        }
        
        match event_result.unwrap() {
            Event::Key(key) => {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                            // In NeSH/NeS/NeC mode: Enter QuickShell (× mode), don't exit LUMA
                            if app.nesh_mode {
                                app.enter_quickshell();
                            } else {
                                break;
                            }
                        }
                        KeyCode::Char('l') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                            app.clear_output();
                        }
                        KeyCode::Enter => {
                            let cmd = if app.quickshell_active {
                                let r = app.quickshell_buffer.clone();
                                app.quickshell_buffer = "× ".to_string();  // Reset to ×
                                r
                            } else {
                                app.command_input.clone()
                            };
                            
                            if !cmd.is_empty() {
                                if app.quickshell_active {
                                    // QuickShell mode - only handle special commands
                                    let clean_cmd = cmd.trim().trim_start_matches("× ");
                                    if clean_cmd == "clear" {
                                        app.clear_output();
                                        app.quickshell_active = false;
                                        app.quickshell_buffer = String::new();
                                    } else if clean_cmd == "!stop" {
                                        // !stop - exit quickshell but stay in NeSH
                                        app.quickshell_active = false;
                                        app.quickshell_buffer = String::new();
                                    } else if clean_cmd == "!exit" {
                                        // !exit - exit NeSH to default mode
                                        app.quickshell_active = false;
                                        app.quickshell_buffer = String::new();
                                        app.mode = LumaMode::Normal;
                                        app.nesh_mode = false;
                                    } else {
                                        // Execute command in NeSH context
                                        let result = app.execute_command(clean_cmd);
                                        if !result.is_empty() {
                                            app.push_output(&result);
                                        }
                                    }
                                } else {
                                    // Check if in login mode
                                    if matches!(app.mode, LumaMode::Login) {
                                        let password = app.command_input.clone();
                                        if !password.is_empty() {
                                            let result = app.handle_login_password(&password);
                                            app.push_output(&result);
                                        }
                                    } else {
                                        // Normal mode
                                        let result = app.execute_command(&cmd);
                                        if !result.is_empty() {
                                            app.push_output(&result);
                                        }
                                    }
                                }
                            }
                            
                            if !app.quickshell_active {
                                app.command_input.clear();
                                app.cursor_position = 0;
                            }
                            
                            if matches!(app.mode, LumaMode::NeSH | LumaMode::NeS) {
                                let time = app.get_time_string();
                                let prefix = if matches!(app.mode, LumaMode::NeS) { "NeS> " } else { "" };
                                app.push_output(&format!("Eden({}): {}", time, prefix));
                            }

                            // Launch NeXe if requested
                            if app.launch_nexe {
                                app.launch_nexe = false;
                                drop(terminal);
                                execute!(io::stdout(), LeaveAlternateScreen, DisableMouseCapture).ok();
                                std::process::Command::new("/home/z3r0/loop/main/scripts/nexe/target/release/nexe").spawn().ok();
                                std::thread::sleep(std::time::Duration::from_millis(500));
                                enable_raw_mode().ok();
                                execute!(io::stdout(), EnterAlternateScreen, EnableMouseCapture).ok();
                                let backend = CrosstermBackend::new(io::stdout());
                                terminal = Terminal::new(backend).expect("Failed to recreate terminal");
                                app.mode = LumaMode::NeSH;
                                app.nesh.switch_interface("Ne");
                            }
                        }
                        KeyCode::Char('s') if key.modifiers.contains(KeyModifiers::ALT) => {
                            app.mode = LumaMode::NeSH;
                            app.nesh_mode = true;
                            app.push_colored("Welcome to the Neon Shell!", COLORS.0);
                            app.push_colored("Built in: C, C++, Rust, Zig, NeSH, LISP, and Julia.", COLORS.6);
                            app.push_output("");
                            let switch_result = app.nesh.switch_interface("Ne");
                            app.push_output(&format!("Eden(0): {}", switch_result));
                        }
                        KeyCode::Char(c) => {
                            if app.quickshell_active {
                                app.quickshell_buffer.push(c);
                            } else {
                                if app.cursor_position < app.command_input.len() {
                                    app.command_input.insert(app.cursor_position, c);
                                } else {
                                    app.command_input.push(c);
                                }
                                app.cursor_position += 1;
                                app.autocomplete_suggestion = app.get_autocomplete();
                            }
                        }
                        KeyCode::Backspace => {
                            if app.quickshell_active {
                                app.quickshell_buffer.pop();
                            } else if !app.command_input.is_empty() && app.cursor_position > 0 {
                                app.command_input.remove(app.cursor_position - 1);
                                app.cursor_position -= 1;
                                app.autocomplete_suggestion = app.get_autocomplete();
                            }
                        }
                        KeyCode::Left => {
                            if app.cursor_position > 0 {
                                app.cursor_position -= 1;
                            }
                        }
                        KeyCode::Right => {
                            if app.cursor_position < app.command_input.len() {
                                app.cursor_position += 1;
                            }
                        }
                        KeyCode::Up => {
                            if !app.quickshell_active && !app.history.is_empty() {
                                if app.history_index > 0 {
                                    app.history_index -= 1;
                                }
                                if app.history_index >= 0 && app.history_index < app.history.len() as isize {
                                    app.command_input = app.history[app.history_index as usize].clone();
                                    app.cursor_position = app.command_input.len();
                                }
                            }
                        }
                        KeyCode::Down => {
                            if !app.quickshell_active && !app.history.is_empty() {
                                if app.history_index < (app.history.len() - 1) as isize {
                                    app.history_index += 1;
                                    app.command_input = app.history[app.history_index as usize].clone();
                                } else {
                                    app.history_index = app.history.len() as isize;
                                    app.command_input.clear();
                                }
                                app.cursor_position = app.command_input.len();
                            }
                        }
                        KeyCode::PageUp => {
                            app.scroll_offset = app.scroll_offset.saturating_add(10);
                        }
                        KeyCode::PageDown => {
                            app.scroll_offset = app.scroll_offset.saturating_sub(10).max(0);
                        }
                        KeyCode::Tab => {
                            if !app.quickshell_active && !app.autocomplete_suggestion.is_empty() {
                                app.command_input.push_str(&app.autocomplete_suggestion);
                                app.cursor_position = app.command_input.len();
                                app.autocomplete_suggestion.clear();
                            }
                        }
                        KeyCode::Esc => {
                            if app.quickshell_active {
                                app.exit_quickshell(true);
                            } else {
                                app.command_input.clear();
                                app.cursor_position = 0;
                            }
                        }
                        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) && !app.quickshell_active => {
                            app.enter_quickshell();
                        }
                        _ => {}
                    }
                }
            }
            Event::Mouse(mouse) => {
                let term_size = terminal.size().unwrap();
                
                if mouse.kind == MouseEventKind::ScrollUp {
                    app.scroll_offset = app.scroll_offset.saturating_add(3);
                } else if mouse.kind == MouseEventKind::ScrollDown {
                    app.scroll_offset = app.scroll_offset.saturating_sub(3).max(0);
                }
                
                if mouse.kind == MouseEventKind::Down(MouseButton::Left) {
                    let sidebar_width = app.sidebar_width.min(term_size.width.saturating_sub(40)).max(15);
                    let sidebar_x = term_size.width - sidebar_width;
                    
                    if mouse.column == sidebar_x || mouse.column == sidebar_x + 1 {
                        app.resizing = true;
                    }
                } else if mouse.kind == MouseEventKind::Up(MouseButton::Left) {
                    app.resizing = false;
                } else if app.resizing {
                    let new_width = term_size.width.saturating_sub(mouse.column);
                    app.sidebar_width = new_width.max(15).min(term_size.width - 40);
                }
            }
            _ => {}
        }
    }

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    Ok(())
}

fn render_app(f: &mut Frame, app: &mut App, size: Rect) {
    let time = app.get_time_string();
    let (primary, success, error, _, highlight, text, muted, _) = COLORS;

    let top_height = 1;
    let bottom_height = 2;
    let sidebar_width = app.sidebar_width.min(size.width.saturating_sub(40)).max(15);

    let main_area = Rect::new(0, top_height, size.width.saturating_sub(sidebar_width), size.height - top_height - bottom_height);
    let sidebar_area = Rect::new(size.width - sidebar_width, top_height, sidebar_width, size.height - top_height - bottom_height);
    let top_bar = Rect::new(0, 0, size.width, top_height);
    let bottom_bar = Rect::new(0, size.height - bottom_height, size.width, bottom_height);

    let top_bar_text = Span::styled(
        format!(" CPU: {:>3}% │ RAM: {:>4}MB │ Uptime: {:>6} │ Servers: {} │ Cmds: {} │ {} ",
            app.stats.temp as u32, app.stats.ram / 1024 / 1024, app.stats.uptime,
            app.stats.servers, app.commands_run, time),
        Style::default().fg(text).bg(Color::Black)
    );
    
    f.render_widget(Paragraph::new(top_bar_text).alignment(Alignment::Left), top_bar);

    let max_output_lines = (size.height - top_height - bottom_height - 2) as usize;
    let output_len = app.output.len();
    let scroll_usize: usize = app.scroll_offset as usize;
    
    let start_idx = if output_len > max_output_lines {
        output_len.saturating_sub(max_output_lines).saturating_sub(scroll_usize).min(output_len.saturating_sub(1))
    } else {
        0
    };
    let end_idx = output_len;

    let output_widget: Vec<Line> = app.output[start_idx..end_idx]
        .iter()
        .map(|cl| Line::from(Span::styled(&cl.text, Style::default().fg(cl.color))))
        .collect();

    f.render_widget(
        Paragraph::new(output_widget)
            .style(Style::default().fg(text))
            .scroll((std::cmp::min(app.scroll_offset as u16, 1000), 0)),
        main_area,
    );

    let status_icon = if app.stats.servers > 0 { "●" } else { "○" };
    let status_color = if app.stats.servers > 0 { success } else { error };
    
    let mode_display = match app.mode {
        LumaMode::Normal => "LUMA",
        LumaMode::NeSH => "Ne",
        LumaMode::NeS => "NeS",
        LumaMode::NeC => "NeC",
        LumaMode::NeXe => "NeXe",
        LumaMode::Login => "LOGIN",
    };
    
    let sidebar_text = vec![
        Line::from(Span::styled(" QUICK STATS ", Style::default().fg(primary).bold())),
        Line::from(""),
        Line::from(Span::styled(format!(" Mode: {} ", mode_display), Style::default().fg(highlight).bold())),
        Line::from(format!(" User: {}", app.username)),
        Line::from(format!(" Server: {}", app.current_server)),
        Line::from(format!(" Online: {}", app.stats.uptime)),
        Line::from(format!(" Commands: {}", app.commands_run)),
        Line::from(""),
        Line::from(Span::styled(" ──────────── ", Style::default().fg(muted))),
        Line::from(""),
        Line::from(Span::styled(" SERVERS ", Style::default().fg(primary).bold())),
        Line::from(""),
        Line::from(Span::styled(format!(" ● Dev (main) "), Style::default().fg(status_color))),
    ];
    
    f.render_widget(
        Paragraph::new(sidebar_text)
            .style(Style::default().fg(text))
            .block(Block::default().borders(Borders::LEFT).border_style(Style::default().fg(muted))),
        sidebar_area,
    );

    let (prompt, prompt_color) = match app.mode {
        LumaMode::Normal => (format!("LOOP({})[{}@{}]: ", time, app.username, app.current_server), success),
        LumaMode::Login => ("Login: ".to_string(), highlight),
        LumaMode::NeSH => (format!("Eden({}): ", time), primary),
        LumaMode::NeS => (format!("Eden({}): NeS> ", time), primary),
        LumaMode::NeC => ("NeC> ".to_string(), primary),
        LumaMode::NeXe => ("NeXe> ".to_string(), primary),
    };
    
    let input_display = if app.cursor_position < app.command_input.len() {
        format!("{}[{}]", 
            &app.command_input[..app.cursor_position],
            &app.command_input[app.cursor_position..])
    } else {
        format!("{}_", app.command_input)
    };
    
    let full_input = format!("{}{}", prompt, input_display);
    
    let mut input_line = Line::from(Span::styled(&full_input, Style::default().fg(prompt_color).bg(Color::Black)));
    
    if !app.autocomplete_suggestion.is_empty() {
        let ghost = Span::styled(&app.autocomplete_suggestion, Style::default().fg(muted));
        input_line.spans.push(ghost);
    }
    
    if app.quickshell_active {
        let qs_line = Line::from(vec![
            Span::styled("× ", Style::default().fg(error)),
            Span::styled(&app.quickshell_buffer, Style::default().fg(text)),
        ]);
        f.render_widget(Paragraph::new(qs_line).style(Style::default().fg(error).bg(Color::Black)), Rect::new(0, size.height - 2, size.width, 1));
    } else {
        f.render_widget(Paragraph::new(input_line).style(Style::default().fg(prompt_color).bg(Color::Black)), Rect::new(0, size.height - 2, size.width, 1));
    }
    
    let tooltip = "[Tab]=autocomplete [Arrows]=history [PgUp/Dn]=scroll [Ctrl+C]=quickshell [Ctrl+L]=clear [Ctrl+Q]=exit [ALT+S]=NeSH";
    f.render_widget(
        Paragraph::new(tooltip)
            .style(Style::default().fg(muted).bg(Color::Black))
            .alignment(Alignment::Left),
        Rect::new(0, size.height - 1, size.width, 1),
    );
}
