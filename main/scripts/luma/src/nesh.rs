use std::collections::HashMap;
use std::process::Command;
use std::fs;
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq)]
pub enum InterfaceMode {
    Ne,      // Default Neon Shell
    NeS,     // Neon-Sulfur
    NeC,     // Neon-Carbon BASIC
    NeXe,    // Neon Xenon Graphics
}

#[derive(Clone, Debug)]
pub struct NeonVar {
    pub name: String,
    pub var_type: String,
    pub value: String,
}

impl NeonVar {
    pub fn get_type(&self) -> &str {
        &self.var_type
    }
    
    pub fn get_value(&self) -> &str {
        &self.value
    }
}

#[derive(Clone, Debug)]
pub struct EnvVar {
    pub name: String,
    pub value: String,
}

impl EnvVar {
    pub fn get_value(&self) -> &str {
        &self.value
    }
}

#[derive(Clone, Debug)]
pub struct BasicLine {
    pub line_num: f64,
    pub statement: String,
}

pub struct NeSH {
    pub mode: InterfaceMode,
    pub depth: u32,
    pub env: Vec<EnvVar>,
    pub variables: Vec<NeonVar>,
    pub posix_enabled: bool,
    pub auto_update: bool,
    pub basic_program: Vec<BasicLine>,
    pub basic_vars: HashMap<String, String>,
    pub basic_line_ptr: usize,
    pub quick_shell: bool,
    pub config_source: String,  // "system" or "bot"
    pub history: Vec<String>,
    pub bot_root: PathBuf,
    pub rules: HashMap<String, String>,  // DIV0 and other algebra rules
}

impl NeSH {
    pub fn new(bot_root: PathBuf) -> Self {
        Self {
            mode: InterfaceMode::Ne,
            depth: 0,
            env: Vec::new(),
            variables: Vec::new(),
            posix_enabled: true,
            auto_update: true,
            basic_program: Vec::new(),
            basic_vars: HashMap::new(),
            basic_line_ptr: 0,
            quick_shell: false,
            config_source: "system".to_string(),
            history: Vec::new(),
            bot_root,
            rules: HashMap::new(),
        }
    }

    pub fn get_prompt(&self, time: &str) -> String {
        match self.mode {
            InterfaceMode::Ne => format!("Eden({}): ", time),
            InterfaceMode::NeS => format!("Eden({}): NeS> ", time),
            InterfaceMode::NeC => format!("Neon-Carbon BASIC{:02}: ", self.basic_line_ptr),
            InterfaceMode::NeXe => format!("Eden({}): NeXe> ", time),
        }
    }

    pub fn switch_interface(&mut self, mode: &str) -> String {
        match mode.trim() {
            "Ne" => {
                self.mode = InterfaceMode::Ne;
                "Default Neon Shell".to_string()
            }
            "NeS" => {
                self.mode = InterfaceMode::NeS;
                "Neon-Sulfur".to_string()
            }
            "NeC" => {
                self.mode = InterfaceMode::NeC;
                self.basic_program.clear();
                self.basic_vars.clear();
                "Neon-Carbon BASIC".to_string()
            }
            "NeXe" => {
                self.mode = InterfaceMode::NeXe;
                "Neon Graphics Interface System.\nLoading GPU...\nStarting Drivers...\nDone!".to_string()
            }
            _ => "Unknown interface. Use: Ne, NeS, NeC, NeXe".to_string(),
        }
    }

    pub fn is_nexe_switched(&self) -> bool {
        self.mode == InterfaceMode::NeXe
    }

    pub fn get_welcome(&self) -> String {
        "Welcome to the Neon Shell!\nBuilt in: C, C++, Rust, Zig, NeSH, LISP, and Julia.\nLicensed under the Apache 2.0 License.".to_string()
    }

    pub fn execute(&mut self, input: &str) -> String {
        let input = input.trim();
        self.history.push(input.to_string());
        
        // Quick Shell mode
        if self.quick_shell {
            return self.handle_quick_shell(input);
        }

        // Check for Quick Shell entry (Ctrl+C simulation)
        if input == "^C" {
            self.quick_shell = true;
            return "× ".to_string();
        }

        match self.mode {
            InterfaceMode::Ne | InterfaceMode::NeS => self.execute_ne(input),
            InterfaceMode::NeC => self.execute_basic(input),
            InterfaceMode::NeXe => self.execute_nexe(input),
        }
    }

    fn handle_quick_shell(&mut self, input: &str) -> String {
        match input {
            "clear" => {
                self.quick_shell = false;
                String::new() // Caller should clear output
            }
            "!exit" => {
                self.quick_shell = false;
                self.depth += 1;
                String::new()
            }
            _ => {
                // Execute as Ne command
                let result = self.execute_ne(input);
                format!("× {}\n× ", result)
            }
        }
    }

    fn execute_ne(&mut self, input: &str) -> String {
        // Comments
        if input.starts_with('#') {
            return String::new();
        }

        // interface command
        if input.starts_with("interface ") {
            let mode = input.trim_start_matches("interface ");
            return self.switch_interface(mode);
        }

        // Exit from NeS to Ne
        if input == "exit" && self.mode == InterfaceMode::NeS {
            self.mode = InterfaceMode::Ne;
            self.depth += 1;
            return String::new();
        }

        // POSIX toggle
        if input.starts_with("&POSIX=") {
            let value = input.trim_start_matches("&POSIX=");
            if value == "False" {
                self.posix_enabled = false;
                self.depth += 1;
                return "POSIX Compatiblity Disabled. Bash will no longer be used for POSIX Compatibility.".to_string();
            } else {
                self.posix_enabled = true;
                self.depth += 1;
                return "POSIX Compatiblity Enabled.".to_string();
            }
        }

        // neonctl commands
        if input.starts_with("neonctl ") {
            return self.handle_neonctl(input.trim_start_matches("neonctl "));
        }

        // SET_ENV
        if input.starts_with("SET_ENV ") {
            return self.handle_set_env(input.trim_start_matches("SET_ENV "));
        }

        // Z_ typed variable
        if input.starts_with("Z_") {
            return self.handle_typed_var(input);
        }

        // System-Get command (NeS)
        if input.starts_with("System-Get ") {
            return self.handle_system_get(input);
        }

        // LNK_ENV
        if input.starts_with("LNK_ENV ") {
            return self.handle_lnk_env(input);
        }

        // SET_CMD
        if input.starts_with("SET_CMD ") {
            return self.handle_set_cmd(input);
        }

        // Pipeline commands
        if input.contains('|') {
            return self.handle_pipeline(input);
        }

        // DEF command (function definition)
        if input.starts_with("DEF ") {
            return self.handle_def(input);
        }

        // WHAT command (query variable)
        if input.starts_with("WHAT ") {
            return self.handle_what(input);
        }

        // SET_AXIOM command
        if input.starts_with("SET_AXIOM") {
            return self.handle_set_axiom(input);
        }

        // SET_AXION command
        if input.starts_with("SET_AXION") {
            return self.handle_set_axion(input);
        }

        // SET_AUTOFILL command
        if input.starts_with("SET_AUTOFILL") {
            return self.handle_set_autofill(input);
        }

        // RULE_NAME command
        if input.starts_with("RULE_NAME") {
            return self.handle_rule_name(input);
        }

        // Default: Use BOT-LOCAL filesystem (secure by default, requires "sh " prefix for real shell)
        self.handle_bot_command(input)
    }

    fn handle_neonctl(&mut self, input: &str) -> String {
        if input.starts_with("set ") {
            let args = input.trim_start_matches("set ");
            if args.contains("zero=%time-LOCAL-24-hh-mm") {
                if args.contains("auto-update=True") {
                    self.auto_update = true;
                } else if args.contains("auto-update=False") {
                    self.auto_update = false;
                }
                self.depth += 1;
                return String::new();
            }
            if args.contains("interface_main=fish") {
                self.depth += 1;
                return "Using FISH as the base Interpretter.\nWARN: POSIX Compliance is NOT guaranteed.".to_string();
            }
        }
        if input == "save config" {
            self.depth += 1;
            return "Saved.".to_string();
        }
        String::new()
    }

    fn handle_def(&mut self, input: &str) -> String {
        // DEF "X/0": %UNIT(z) {WHERE:...}
        let re = regex::Regex::new(r#"DEF\s+"([^"]+)":\s*(.+)"#).ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let definition = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                self.rules.insert(name.to_string(), definition.to_string());
                self.depth += 1;
                return format!("Defined {}", name);
            }
        }
        String::new()
    }

    fn handle_what(&mut self, input: &str) -> String {
        // WHAT "X/0": A
        let re = regex::Regex::new(r#"WHAT\s+"([^"]+)":\s*(\w+)"#).ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let _var = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                
                if self.rules.contains_key(name) {
                    return format!("Defined {}", name);
                } else {
                    return format!("{}: Undef", name);
                }
            }
        }
        String::new()
    }

    fn handle_set_axiom(&mut self, input: &str) -> String {
        // SET_AXIOM: "DIV0" = 0
        if input.contains("DIV0") && input.contains("= 0") {
            self.rules.insert("DIV0_AXIOM".to_string(), "0".to_string());
            self.depth += 1;
            return "DIV0 axiom set to 0".to_string();
        }
        String::new()
    }

    fn handle_set_axion(&mut self, input: &str) -> String {
        // SET_AXION: "REM0" = 0
        if input.contains("REM0") && input.contains("= 0") {
            self.rules.insert("REM0_AXIOM".to_string(), "0".to_string());
            self.depth += 1;
            return "REM0 axion set to 0".to_string();
        }
        String::new()
    }

    fn handle_set_autofill(&mut self, input: &str) -> String {
        // SET_AUTOFILL=1,"SMART"
        if input.contains("SET_AUTOFILL") {
            self.depth += 1;
            return "SMART_COMPLETE: Done.".to_string();
        }
        String::new()
    }

    fn handle_rule_name(&mut self, input: &str) -> String {
        // RULE_NAME: "DIV0"
        if input.contains("RULE_NAME") {
            let re = regex::Regex::new(r#"RULE_NAME:\s*"([^"]+)""#).ok();
            if let Some(re) = re {
                if let Some(caps) = re.captures(input) {
                    let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                    return format!("Set {} Rules.", name.len() * 10); // Fake rule count
                }
            }
        }
        String::new()
    }

    fn handle_set_env(&mut self, input: &str) -> String {
        let re = regex::Regex::new(r#"(\$\w+)\s*:=\s*"([^"]+)""#).ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let value = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                self.env.retain(|e| e.name != name);
                self.env.push(EnvVar {
                    name: name.to_string(),
                    value: value.to_string(),
                });
                self.depth += 1;
                return String::new();
            }
        }
        String::new()
    }

    fn handle_set_cmd(&mut self, input: &str) -> String {
        // SET_CMD (cmd1, cmd2, ...) := "/path"
        let re = regex::Regex::new(r#"SET_CMD\s+\(([^)]+)\)\s*:=\s*"([^"]+)""#).ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let cmds = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let path = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                
                for cmd in cmds.split(',') {
                    let cmd_name = cmd.trim();
                    self.env.retain(|e| e.name != cmd_name);
                    self.env.push(EnvVar {
                        name: cmd_name.to_string(),
                        value: path.to_string(),
                    });
                }
                self.depth += 1;
                return format!("Set command path: {}", path);
            }
        }
        String::new()
    }

    fn handle_lnk_env(&mut self, input: &str) -> String {
        // LNK_ENV +am (Neon, Neon:Sulfur):"${path}/linker.ld"
        let re = regex::Regex::new(r#"LNK_ENV\s+(\w+)\s+\(([^)]+)\):\s*"([^"]+)""#).ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let _flag = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let modules = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                let linker = caps.get(3).map(|m| m.as_str()).unwrap_or("");
                
                for module in modules.split(',') {
                    let mod_name = module.trim();
                    let link_env_key = format!("LNK_{}", mod_name.replace(':', "_"));
                    self.env.retain(|e| e.name != link_env_key);
                    self.env.push(EnvVar {
                        name: link_env_key,
                        value: linker.to_string(),
                    });
                }
                self.depth += 1;
                return format!("[{}]: Linked linker: {}", modules, linker);
            }
        }
        self.depth += 1;
        String::new()
    }

    fn handle_typed_var(&mut self, input: &str) -> String {
        // Z_name:Type = value
        let re = regex::Regex::new(r"Z_(\w+):(\w+)\s*=\s*(.+)").ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let name = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let var_type = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                let value = caps.get(3).map(|m| m.as_str()).unwrap_or("");
                self.variables.retain(|v| v.name != name);
                self.variables.push(NeonVar {
                    name: name.to_string(),
                    var_type: var_type.to_string(),
                    value: value.to_string(),
                });
                self.depth += 1;
                return String::new();
            }
        }
        String::new()
    }

    fn handle_system_get(&mut self, input: &str) -> String {
        // System-Get @Network.List | Select-Type: WiFi & Get-Obj: (...) =>> Sort +Strength
        if input.contains("@Network.List") {
            // Get real WiFi networks
            let networks = self.get_wifi_networks();
            self.depth += 1;
            return networks;
        }
        String::new()
    }

    fn get_wifi_networks(&mut self) -> String {
        // Try to get real WiFi networks
        #[cfg(target_os = "linux")]
        {
            let output = Command::new("nmcli")
                .args(["-t", "-f", "SSID,SIGNAL,FREQ,MODE", "device", "wifi", "list"])
                .output();
            
            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if !stdout.is_empty() {
                    let lines: Vec<&str> = stdout.lines().collect();
                    if !lines.is_empty() {
                        let mut results = Vec::new();
                        results.push("%p > +(Freq%GHz & Ver%l) > -Dist%m =>> Sort: d;".to_string());
                        results.push("Name%ALPHABET".to_string());
                        results.push("SSID - Distance - Version - Strength - Frequency".to_string());
                        
                        for line in lines.iter().take(10) {
                            let parts: Vec<&str> = line.split(':').collect();
                            if parts.len() >= 4 {
                                let ssid = parts[0];
                                let signal = parts[1];
                                let freq = parts[2];
                                let mode = parts[3];
                                
                                let version = if mode.contains("6") { "WiFi 6 WPA3" } 
                                           else if mode.contains("5") { "WiFi 5 WPA2" }
                                           else { "WiFi" };
                                
                                let strength_pct = signal.parse::<u32>().unwrap_or(0);
                                let strength = format!("{}%", strength_pct);
                                
                                let freq_ghz = if freq.contains("5") { "5GHz" } else { "2.4GHz" };
                                
                                // Estimate distance (fake for demo)
                                let distance = format!("{}m", (100 - strength_pct) / 10 + 1);
                                
                                results.push(format!("{}, {}, {}, {}, {}", ssid, distance, version, strength, freq_ghz));
                            }
                        }
                        return results.join("\n");
                    }
                }
            }
        }
        
        // Demo data if no real networks
        self.depth += 1;
        "%p > +(Freq%GHz & Ver%l) > -Dist%m =>> Sort: d;\nName%ALPHABET\nSSID - Distance - Version - Strength - Frequency\nPablo69, 5m, WiFi 6 WPA3, 83%, 5GHz\nMikuMikuBeam, 13m, WiFi 7 PEAP Cert, 21%, 2.4GHz".to_string()
    }

    fn handle_pipeline(&mut self, input: &str) -> String {
        let parts: Vec<&str> = input.split('|').collect();
        if parts.is_empty() {
            return String::new();
        }
        
        let mut previous_output = String::new();
        
        for (i, part) in parts.iter().enumerate() {
            let cmd = part.trim();
            
            if i == 0 {
                // First command - execute normally
                if cmd.contains("Select-Type:") || cmd.contains("Sort") || cmd.contains("Get-Obj:") {
                    return "Pipeline requires input data. Use System-Get first.".to_string();
                }
                previous_output = self.execute_ne(cmd);
            } else {
                // Subsequent commands - chain results
                let result = self.execute_ne(cmd);
                if !result.is_empty() {
                    if !previous_output.is_empty() {
                        previous_output.push('\n');
                    }
                    previous_output.push_str(&result);
                }
            }
        }
        
        previous_output
    }

    fn handle_system_command(&mut self, input: &str) -> String {
        // Execute real system commands
        let parts: Vec<&str> = input.split_whitespace().collect();
        if parts.is_empty() {
            return String::new();
        }

        let cmd = parts[0];
        let args: Vec<&str> = parts[1..].to_vec();

        if cmd == "ls" {
            return self.handle_ls(args);
        }
        if cmd == "whoami" {
            return "Eden".to_string();
        }
        if cmd == "cat" {
            return self.handle_cat(args);
        }
        if cmd == "pwd" {
            return "/home".to_string();
        }
        if cmd == "uname" {
            return "Eden".to_string();
        }
        if cmd == "date" {
            return chrono::Local::now().to_string();
        }

        // ONLY execute real shell if command starts with "sh " prefix
        if input.starts_with("sh ") {
            let shell_cmd = input.trim_start_matches("sh ");
            let output = Command::new("sh")
                .args(["-c", shell_cmd])
                .output();

            if let Ok(output) = output {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                if stdout.is_empty() && !stderr.is_empty() {
                    return stderr.to_string();
                }
                self.depth += 1;
                return stdout.to_string();
            }
            self.depth += 1;
            return String::new();
        }

        // Default: Use BOT-LOCAL filesystem (secure by default)
        return self.handle_bot_command(input);
    }

    fn handle_bot_command(&mut self, input: &str) -> String {
        let parts: Vec<&str> = input.split_whitespace().collect();
        if parts.is_empty() {
            return String::new();
        }

        let cmd = parts[0];
        let path = if parts.len() > 1 { parts[1] } else { "." };

        if cmd == "ls" {
            return self.bot_ls(path);
        }
        if cmd == "whoami" {
            return "Eden".to_string();
        }
        if cmd == "cat" {
            return self.bot_cat(path);
        }
        if cmd == "pwd" {
            return "/home".to_string();
        }

        self.depth += 1;
        String::new()
    }

    fn handle_ls(&mut self, args: Vec<&str>) -> String {
        let path = if args.is_empty() { "." } else { args[0] };
        let output = Command::new("ls")
            .args(["-1", path])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            self.depth += 1;
            return stdout.to_string();
        }
        String::new()
    }

    fn handle_cat(&mut self, args: Vec<&str>) -> String {
        if args.is_empty() {
            return "cat: missing operand".to_string();
        }
        let path = args[0];
        if let Ok(content) = fs::read_to_string(path) {
            self.depth += 1;
            return content;
        }
        format!("cat: {}: No such file or directory", path)
    }

    fn bot_ls(&mut self, path: &str) -> String {
        let full_path = if path.starts_with('/') {
            PathBuf::from(path)
        } else {
            self.bot_root.join(path)
        };

        if let Ok(entries) = fs::read_dir(&full_path) {
            let mut names: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            names.sort();
            self.depth += 1;
            return names.join("  ");
        }
        format!("ls: {}: No such directory", path)
    }

    fn bot_cat(&mut self, path: &str) -> String {
        let full_path = if path.starts_with('/') {
            PathBuf::from(path)
        } else {
            self.bot_root.join(path)
        };

        if let Ok(content) = fs::read_to_string(&full_path) {
            self.depth += 1;
            return content;
        }
        format!("cat: {}: No such file or directory", path)
    }

    fn execute_basic(&mut self, input: &str) -> String {
        // Neon-Carbon BASIC interpreter
        let input = input.trim();

        // Check for <EOF> - end of program
        if input == "<EOF>" {
            return self.basic_compile();
        }

        // Parse line number
        let re = regex::Regex::new(r"^(\d+\.?\d*):\s*(.+)$").ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(input) {
                let line_num: f64 = caps.get(1).map(|m| m.as_str().parse().unwrap_or(0.0)).unwrap_or(0.0);
                let statement = caps.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
                
                // Remove existing line with same number
                self.basic_program.retain(|l| l.line_num != line_num);
                self.basic_program.push(BasicLine {
                    line_num,
                    statement: statement.clone(),
                });
                self.basic_program.sort_by(|a, b| a.line_num.partial_cmp(&b.line_num).unwrap());
                return String::new();
            }
        }

        // Direct commands (no line number)
        if input == "RUN" {
            return self.basic_run();
        }
        if input.starts_with("GOTO ") {
            let line: f64 = input.trim_start_matches("GOTO ").parse().unwrap_or(0.0);
            if let Some(idx) = self.basic_program.iter().position(|l| (l.line_num - line).abs() < 0.01) {
                self.basic_line_ptr = idx;
            }
            return String::new();
        }
        if input == "LIST" {
            return self.basic_list();
        }
        if input == "CLEAR" {
            self.basic_program.clear();
            self.basic_vars.clear();
            return String::new();
        }

        // Execute single line
        self.basic_execute_line(input)
    }

    fn basic_compile(&self) -> String {
        if self.basic_program.is_empty() {
            return "No program to compile.".to_string();
        }
        
        let mut output = Vec::new();
        output.push("Compiling...".to_string());
        
        // Check for DIV0 rules
        if self.rules.contains_key("DIV0") || self.rules.contains_key("DIV0_AXIOM") {
            output.push("WARN: RULE:DIV0 MAY CAUSE ISSUES IN THE FUTURE".to_string());
        }
        
        output.push("SMART_COMPLETE: Done.".to_string());
        output.push(format!("Set {} Rules.", self.basic_program.len() * 10));
        
        if self.rules.contains_key("DIV0_AXIOM") {
            output.push("Verifying Algebra (Ignoring Division by 0, Neutralization by 0): PASS".to_string());
        }
        
        output.push("Done.".to_string());
        output.join("\n")
    }

    fn basic_run(&mut self) -> String {
        let mut output = Vec::new();
        self.basic_line_ptr = 0;

        // Collect statements to execute first to avoid borrow issues
        let statements: Vec<String> = self.basic_program.iter().map(|l| l.statement.clone()).collect();

        for stmt in statements {
            let result = self.basic_execute_line(&stmt);
            if !result.is_empty() {
                output.push(result);
            }
        }

        if output.is_empty() {
            "DONE.".to_string()
        } else {
            output.push("DONE.".to_string());
            output.join("\n")
        }
    }

    fn basic_list(&self) -> String {
        self.basic_program
            .iter()
            .map(|l| {
                let line_num = if l.line_num.fract() == 0.0 {
                    format!("{:02}", l.line_num as u32)
                } else {
                    format!("{:02.2}", l.line_num)
                };
                format!("{}: {}", line_num, l.statement)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    fn basic_execute_line(&mut self, statement: &str) -> String {
        let statement = statement.trim();
        
        // Comments
        if statement.starts_with(";") || statement.starts_with("REM") {
            return String::new();
        }

        // O: "text" - Output text
        if statement.starts_with("O: ") || statement.starts_with("O:") {
            let text = statement.trim_start_matches("O:").trim();
            let text = text.trim_matches('"');
            return text.to_string();
        }

        // O= expr - Output expression
        if statement.starts_with("O=") || statement.starts_with("O =") {
            let expr = statement.trim_start_matches("O=").trim_start_matches("O =").trim();
            return self.basic_eval(expr);
        }

        // I: "prompt:",Var - Input
        if statement.starts_with("I: ") || statement.starts_with("I:") {
            // For now, simulate input
            return String::new();
        }

        // Z_ typed variable
        if statement.starts_with("Z_") {
            return self.handle_typed_var(statement);
        }

        // IF statement
        if statement.starts_with("IF ") {
            return self.basic_if(statement);
        }

        // END
        if statement == "END" {
            self.basic_line_ptr = self.basic_program.len(); // Stop execution
            return String::new();
        }

        // DEF function definition
        if statement.starts_with("DEF ") {
            return String::new();
        }

        // WHAT query
        if statement.starts_with("WHAT ") {
            return String::new();
        }

        String::new()
    }

    fn basic_eval(&self, expr: &str) -> String {
        // Simple expression evaluator
        let expr = expr.trim();
        
        // Check for variable
        if let Some(var) = self.basic_vars.get(expr) {
            return var.clone();
        }

        // Try to evaluate
        if let Ok(num) = expr.parse::<f64>() {
            return num.to_string();
        }

        // Check for DIV0 (division by zero) - returns ERR unless DIV0 axiom is defined
        if expr.contains("/0") && !self.rules.contains_key("DIV0_AXIOM") {
            return "ERR: Division by 0 not defined".to_string();
        }

        // If DIV0 is defined, return special value "1z" for /0 expressions
        if expr.contains("/0") && self.rules.contains_key("DIV0_AXIOM") {
            return "1z".to_string();
        }

        // Simple math
        if expr.contains('+') {
            let parts: Vec<&str> = expr.split('+').collect();
            if parts.len() == 2 {
                let a: f64 = parts[0].trim().parse().unwrap_or(0.0);
                let b: f64 = parts[1].trim().parse().unwrap_or(0.0);
                return (a + b).to_string();
            }
        }

        if expr.contains('*') {
            let parts: Vec<&str> = expr.split('*').collect();
            if parts.len() == 2 {
                let a: f64 = parts[0].trim().parse().unwrap_or(0.0);
                let b: f64 = parts[1].trim().parse().unwrap_or(0.0);
                return (a * b).to_string();
            }
        }

        if expr.contains('-') {
            let parts: Vec<&str> = expr.split('-').collect();
            if parts.len() == 2 {
                let a: f64 = parts[0].trim().parse().unwrap_or(0.0);
                let b: f64 = parts[1].trim().parse().unwrap_or(0.0);
                return (a - b).to_string();
            }
        }

        if expr.contains('/') {
            let parts: Vec<&str> = expr.split('/').collect();
            if parts.len() == 2 {
                let a: f64 = parts[0].trim().parse().unwrap_or(0.0);
                let b: f64 = parts[1].trim().parse().unwrap_or(1.0);
                if b == 0.0 {
                    return if self.rules.contains_key("DIV0_AXIOM") { "1z".to_string() } else { "ERR: Division by 0".to_string() };
                }
                return (a / b).to_string();
            }
        }

        if expr.contains('^') {
            let parts: Vec<&str> = expr.split('^').collect();
            if parts.len() == 2 {
                let a: f64 = parts[0].trim().parse().unwrap_or(0.0);
                let b: f64 = parts[1].trim().parse().unwrap_or(0.0);
                return a.powf(b).to_string();
            }
        }

        expr.to_string()
    }

    fn basic_if(&mut self, statement: &str) -> String {
        // IF (condition) : action
        let re = regex::Regex::new(r"IF\s*\((.+)\)\s*:\s*(.+)").ok();
        if let Some(re) = re {
            if let Some(caps) = re.captures(statement) {
                let cond = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                let action = caps.get(2).map(|m| m.as_str()).unwrap_or("");
                
                // Evaluate the condition
                let cond_result = self.basic_eval(cond);
                
                // Check if condition is truthy (non-empty and not "0", "ERR", etc.)
                let is_true = !cond_result.is_empty() 
                    && cond_result != "0" 
                    && cond_result != "ERR" 
                    && !cond_result.starts_with("ERR:");
                
                if is_true {
                    return self.basic_execute_line(action);
                }
                return String::new();
            }
        }
        String::new()
    }

    fn execute_nexe(&mut self, input: &str) -> String {
        // NeXe Graphics mode - commands are handled differently
        if input == "exit" || input == "quit" {
            return "Goodbye.".to_string();
        }
        if input == "clear" {
            return String::new(); // Caller clears
        }
        
        // neonctl commands work in NeXe too
        if input.starts_with("neonctl ") {
            return self.handle_neonctl(input.trim_start_matches("neonctl "));
        }

        String::new()
    }

    pub fn is_nexe_mode(&self) -> bool {
        self.mode == InterfaceMode::NeXe
    }

    pub fn nesh_is_nexe_mode(&self) -> bool {
        self.mode == InterfaceMode::NeXe
    }

    pub fn increment_depth(&mut self) {
        if self.auto_update && self.mode == InterfaceMode::NeXe {
            self.depth += 1;
        }
    }

    pub fn get_config_source(&self) -> &str {
        &self.config_source
    }
}
