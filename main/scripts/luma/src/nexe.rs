use ratatui::prelude::*;
use ratatui::widgets::*;
use std::process::Command;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub struct Window {
    pub id: u32,
    pub title: String,
    pub x: u16,
    pub y: u16,
    pub width: u16,
    pub height: u16,
    pub minimized: bool,
    pub maximized: bool,
    pub content: WindowContent,
    pub _border_color: Color,
    pub title_color: Color,
}

#[derive(Clone, Debug)]
pub enum WindowContent {
    Terminal(Vec<String>),
    FileManager(String),
    Settings,
    About,
    Calculator,
    Editor,
    Network,
    ProcessList,
}

impl Window {
    pub fn new(id: u32, title: String, width: u16, height: u16) -> Self {
        Self {
            id,
            title,
            x: 2,
            y: 2,
            width,
            height,
            minimized: false,
            maximized: false,
            content: WindowContent::Terminal(Vec::new()),
            _border_color: Color::Cyan,
            title_color: Color::Cyan,
        }
    }

    pub fn title_bar(&self) -> Line<'static> {
        let buttons = if self.maximized { " [−][□][×] " } else { " [−][□][×] " };
        let title = format!("{} {}", self.title, buttons);
        
        Line::from(Span::styled(
            title,
            Style::default()
                .fg(self.title_color)
                .bg(Color::Black)
                .bold()
        ))
    }

    pub fn content_rect(&self) -> Rect {
        Rect::new(
            self.x + 1,
            self.y + 2,
            self.width.saturating_sub(2),
            self.height.saturating_sub(3),
        )
    }
}

#[derive(Clone)]
pub struct NeXeState {
    pub running: bool,
    pub windows: Vec<Window>,
    pub active_window: u32,
    pub taskbar: Vec<TaskbarItem>,
    pub clock_minute: u32,
    pub _auto_update: bool,
    pub _dragging: Option<u32>,
    pub _drag_offset: (u16, u16),
    pub terminal_history: Vec<String>,
    pub file_manager_path: String,
}

#[derive(Clone)]
pub struct TaskbarItem {
    pub window_id: u32,
    pub title: String,
    pub icon: String,
}

impl NeXeState {
    pub fn new() -> Self {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home".to_string());
        Self {
            running: true,
            windows: Vec::new(),
            active_window: 0,
            taskbar: Vec::new(),
            clock_minute: 0,
            _auto_update: true,
            _dragging: None,
            _drag_offset: (0, 0),
            terminal_history: vec![
                "NeXe Terminal v1.0".to_string(),
                "Type 'help' for commands".to_string(),
            ],
            file_manager_path: home.clone(),
        }
    }

    pub fn init_default_windows(&mut self) {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home".to_string());
        self.windows.clear();
        self.taskbar.clear();
        
        let mut term = Window::new(1, "Terminal".to_string(), 50, 20);
        term.content = WindowContent::Terminal(self.terminal_history.clone());
        self.windows.push(term);
        self.taskbar.push(TaskbarItem { window_id: 1, title: "Terminal".to_string(), icon: "⬛".to_string() });
        
        let mut files = Window::new(2, "Files".to_string(), 35, 15);
        files.x = 55;
        files.y = 3;
        files.content = WindowContent::FileManager(home.clone());
        self.windows.push(files);
        self.taskbar.push(TaskbarItem { window_id: 2, title: "Files".to_string(), icon: "📁".to_string() });
        
        let mut net = Window::new(3, "Network".to_string(), 40, 12);
        net.x = 3;
        net.y = 22;
        net.content = WindowContent::Network;
        self.windows.push(net);
        self.taskbar.push(TaskbarItem { window_id: 3, title: "Network".to_string(), icon: "🌐".to_string() });
        
        let mut proc = Window::new(4, "Processes".to_string(), 40, 12);
        proc.x = 46;
        proc.y = 22;
        proc.content = WindowContent::ProcessList;
        self.windows.push(proc);
        self.taskbar.push(TaskbarItem { window_id: 4, title: "Processes".to_string(), icon: "⚙".to_string() });
        
        let mut about = Window::new(5, "About".to_string(), 30, 10);
        about.x = 70;
        about.y = 5;
        about.content = WindowContent::About;
        self.windows.push(about);
        self.taskbar.push(TaskbarItem { window_id: 5, title: "About".to_string(), icon: "ℹ".to_string() });
        
        self.active_window = 1;
    }

    pub fn get_cpu_usage(&self) -> (u32, String) {
        #[cfg(target_os = "linux")]
        {
            if let Ok(usage) = Self::read_cpu_stats() {
                return (usage, format!("{}%", usage));
            }
        }
        (0, "0%".to_string())
    }

    pub fn get_ram_usage(&self) -> (u64, u64, String) {
        #[cfg(target_os = "linux")]
        {
            if let Ok((used, total)) = Self::read_ram_stats() {
                let used_mb = used / 1024 / 1024;
                let total_mb = total / 1024 / 1024;
                return (used_mb, total_mb, format!("{}MB", used_mb));
            }
        }
        (0, 0, "0MB".to_string())
    }

    pub fn get_network_stats(&self) -> Vec<(String, String, String)> {
        let mut stats = Vec::new();
        
        #[cfg(target_os = "linux")]
        {
            let interfaces = Self::get_network_interfaces();
            for iface in interfaces.iter().take(3) {
                let (rx, tx) = Self::get_interface_bytes(iface);
                stats.push((
                    iface.clone(),
                    format!("↓ {} ", Self::format_bytes(rx)),
                    format!("↑ {} ", Self::format_bytes(tx)),
                ));
            }
        }
        
        if stats.is_empty() {
            stats.push(("eth0".to_string(), "↓ 0 B ".to_string(), "↑ 0 B ".to_string()));
        }
        
        stats
    }

    pub fn get_processes(&self) -> Vec<(String, u32, String)> {
        let output = Command::new("sh")
            .args(["-c", "ps aux --sort=-%cpu | head -8 | awk '{print $11, $3, $6}'"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return stdout.lines()
                .filter(|l| !l.is_empty())
                .map(|l| {
                    let parts: Vec<&str> = l.split_whitespace().collect();
                    let name = parts.get(0).unwrap_or(&"?").to_string();
                    let cpu = parts.get(1).and_then(|s| s.parse::<f32>().ok()).unwrap_or(0.0) as u32;
                    let mem = parts.get(2).unwrap_or(&"0").to_string();
                    (name, cpu, mem.to_string())
                })
                .collect();
        }
        
        vec![
            ("bash".to_string(), 2, "4M".to_string()),
            ("node".to_string(), 1, "128M".to_string()),
            ("rustc".to_string(), 0, "50M".to_string()),
        ]
    }

    fn read_cpu_stats() -> Result<u32, std::io::Error> {
        let output = Command::new("sh")
            .args(["-c", "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1"])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let usage = stdout.trim().parse::<f32>().unwrap_or(0.0);
        Ok(usage as u32)
    }

    fn read_ram_stats() -> Result<(u64, u64), std::io::Error> {
        let output = Command::new("sh")
            .args(["-c", "free | grep Mem:"])
            .output()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let parts: Vec<&str> = stdout.split_whitespace().collect();
        
        if parts.len() >= 2 {
            let total: u64 = parts[1].parse().unwrap_or(0);
            let used: u64 = parts[2].parse().unwrap_or(0);
            return Ok((used, total));
        }
        
        Err(std::io::Error::new(std::io::ErrorKind::NotFound, "No RAM info"))
    }

    fn get_primary_interface() -> Option<String> {
        if let Ok(entries) = std::fs::read_dir("/sys/class/net") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name == "lo" {
                    continue;
                }
                let state_path = entry.path().join("operstate");
                if let Ok(state) = std::fs::read_to_string(&state_path) {
                    if state.trim() == "up" {
                        return Some(name);
                    }
                }
            }
        }
        None
    }

    fn get_network_interfaces() -> Vec<String> {
        if let Some(primary) = Self::get_primary_interface() {
            return vec![primary];
        }
        
        let output = Command::new("sh")
            .args(["-c", "ip link show | grep -E '^[0-9]+:' | awk -F': ' '{print $2}' | grep -v lo"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            return stdout.lines().map(|s| s.to_string()).collect();
        }
        
        vec!["eth0".to_string()]
    }

    fn get_interface_bytes(iface: &str) -> (u64, u64) {
        let rx = std::fs::read_to_string(format!("/sys/class/net/{}/statistics/rx_bytes", iface))
            .ok().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        let tx = std::fs::read_to_string(format!("/sys/class/net/{}/statistics/tx_bytes", iface))
            .ok().and_then(|s| s.trim().parse().ok()).unwrap_or(0);
        (rx, tx)
    }

    fn format_bytes(bytes: u64) -> String {
        if bytes < 1024 {
            format!("{}B", bytes)
        } else if bytes < 1024 * 1024 {
            format!("{:.1}KB", bytes as f64 / 1024.0)
        } else if bytes < 1024 * 1024 * 1024 {
            format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
        } else {
            format!("{:.1}GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
        }
    }

    pub fn _increment_clock(&mut self) {
        if self._auto_update {
            self.clock_minute += 1;
            if self.clock_minute >= 1440 {
                self.clock_minute = 0;
            }
        }
    }

    pub fn get_clock_string(&self) -> String {
        let hours = self.clock_minute / 60;
        let mins = self.clock_minute % 60;
        format!("{:02}-{:02}", hours, mins)
    }

    pub fn _execute_terminal_command(&mut self, cmd: &str) -> String {
        self.terminal_history.push(format!("$ {}", cmd));
        
        if cmd == "clear" {
            self.terminal_history.clear();
            return String::new();
        }
        
        if cmd == "exit" {
            self.running = false;
            return "Goodbye.".to_string();
        }

        if cmd == "help" {
            return "Commands: clear, exit, ls, cd, cat, whoami, date".to_string();
        }

        let output = Command::new("sh")
            .args(["-c", cmd])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let result = if stdout.is_empty() { stderr.to_string() } else { stdout.to_string() };
            for line in result.lines() {
                self.terminal_history.push(line.to_string());
            }
            return result;
        }
        
        String::new()
    }

    pub fn list_directory(&self, path: &str) -> Vec<(String, bool)> {
        let full = if path.starts_with('/') { 
            std::path::PathBuf::from(path) 
        } else { 
            std::path::PathBuf::from(&self.file_manager_path).join(path) 
        };
        
        if let Ok(entries) = std::fs::read_dir(&full) {
            let mut items: Vec<(String, bool)> = entries
                .filter_map(|e| e.ok())
                .map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    let is_dir = e.path().is_dir();
                    (name, is_dir)
                })
                .collect();
            items.sort_by(|a, b| {
                if a.1 != b.1 { b.1.cmp(&a.1) }
                else { a.0.cmp(&b.0) }
            });
            return items;
        }
        
        Vec::new()
    }
}

pub fn render_nexe(f: &mut Frame, state: &mut NeXeState, size: Rect) {
    if !state.running {
        state.init_default_windows();
    }

    let (_, success, error, warning, primary, text, muted, info) = (
        Color::Cyan, Color::Green, Color::Red, Color::Yellow, Color::Magenta, Color::White, Color::DarkGray, Color::Blue,
    );

    // Desktop background
    let bg = Block::default()
        .style(Style::default().bg(Color::Black));
    f.render_widget(bg, size);

    // Desktop icons (left side)
    let desktop_icons = vec![
        Line::from(Span::styled(" 🖥️  This PC", Style::default().fg(text))),
        Line::from(""),
        Line::from(Span::styled(" 📁 Home", Style::default().fg(text))),
        Line::from(""),
        Line::from(Span::styled(" 🗑️  Trash", Style::default().fg(text))),
        Line::from(""),
        Line::from(Span::styled(" ⚙️  Settings", Style::default().fg(text))),
    ];
    let desktop_area = Rect::new(1, 1, 12, 10);
    f.render_widget(Paragraph::new(desktop_icons).style(Style::default().fg(text)), desktop_area);

    // Render windows (back to front)
    for window in &state.windows {
        if window.minimized {
            continue;
        }

        let win_rect = Rect::new(window.x, window.y, window.width, window.height);
        let is_active = window.id == state.active_window;
        let border = if is_active { primary } else { muted };
        
        let block = Block::default()
            .title(window.title_bar())
            .borders(Borders::ALL)
            .border_style(Style::default().fg(border))
            .title_style(Style::default().fg(if is_active { primary } else { muted }).bold());
        
        f.render_widget(block, win_rect);

        let content_rect = window.content_rect();
        
        match &window.content {
            WindowContent::Terminal(history) => {
                let lines: Vec<Line> = history
                    .iter()
                    .rev()
                    .take((content_rect.height - 2) as usize)
                    .rev()
                    .map(|s| Line::from(Span::styled(s, Style::default().fg(text))))
                    .collect();
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::FileManager(path) => {
                let items = state.list_directory(path);
                let lines: Vec<Line> = items
                    .iter()
                    .take((content_rect.height - 2) as usize)
                    .map(|(name, is_dir)| {
                        let icon = if *is_dir { "📁" } else { "📄" };
                        let color = if *is_dir { info } else { text };
                        Line::from(Span::styled(format!("{} {}", icon, name), Style::default().fg(color)))
                    })
                    .collect();
                let header = Line::from(Span::styled(format!("Path: {}", path), Style::default().fg(muted)));
                let mut all_lines = vec![header];
                all_lines.extend(lines);
                f.render_widget(Paragraph::new(all_lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::Network => {
                let stats = state.get_network_stats();
                let lines: Vec<Line> = stats
                    .iter()
                    .map(|(iface, rx, tx)| {
                        Line::from(vec![
                            Span::styled(iface, Style::default().fg(primary)),
                            Span::styled(rx, Style::default().fg(success)),
                            Span::styled(tx, Style::default().fg(error)),
                        ])
                    })
                    .collect();
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::ProcessList => {
                let procs = state.get_processes();
                let lines: Vec<Line> = procs
                    .iter()
                    .map(|(name, cpu, mem)| {
                        Line::from(vec![
                            Span::styled(name.chars().take(15).collect::<String>(), Style::default().fg(text)),
                            Span::styled(format!(" {:>3}%", cpu), Style::default().fg(if *cpu > 50 { error } else { success })),
                            Span::styled(format!(" {}M", mem), Style::default().fg(warning)),
                        ])
                    })
                    .collect();
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::About => {
                let lines = vec![
                    Line::from(Span::styled("NeXe Graphics v1.0.0", Style::default().fg(primary).bold())),
                    Line::from(""),
                    Line::from("Neon Xenon Desktop Environment"),
                    Line::from("Part of NeSH Suite"),
                    Line::from(""),
                    Line::from(Span::styled("© 2024 Z3r0_DaYz Software", Style::default().fg(muted))),
                ];
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::Settings => {
                let lines = vec![
                    Line::from(Span::styled("Settings", Style::default().fg(primary).bold())),
                    Line::from(""),
                    Line::from("[ ] Auto-update clock"),
                    Line::from("[✓] Show taskbar"),
                    Line::from("[✓] Enable effects"),
                ];
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::Calculator => {
                let lines = vec![
                    Line::from(Span::styled("Calculator", Style::default().fg(primary).bold())),
                    Line::from(""),
                    Line::from(" ┌───────┐"),
                    Line::from(" │  123 │"),
                    Line::from(" │ +456 │"),
                    Line::from(" │ =579 │"),
                    Line::from(" └───────┘"),
                ];
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
            WindowContent::Editor => {
                let lines = vec![
                    Line::from(Span::styled("NeC BASIC Editor", Style::default().fg(primary).bold())),
                    Line::from(""),
                    Line::from("00: O: \"Hello World\""),
                    Line::from("01: END"),
                    Line::from(""),
                    Line::from(Span::styled("<EOF> to compile", Style::default().fg(muted))),
                ];
                f.render_widget(Paragraph::new(lines).style(Style::default().fg(text)), content_rect);
            }
        }
    }

    // CPU/RAM gauges (top right)
    let (cpu_pct, cpu_str) = state.get_cpu_usage();
    let (ram_used, ram_total, ram_str) = state.get_ram_usage();
    
    let gauge_width = 20u16;
    let gauge_area = Rect::new(size.width.saturating_sub(gauge_width + 2), 1, gauge_width, 3);
    
    let cpu_gauge = Gauge::default()
        .label(format!("CPU {}", cpu_str))
        .gauge_style(Style::default().fg(success).bg(muted))
        .ratio((cpu_pct as f64 / 100.0).min(1.0));
    
    let ram_gauge = Gauge::default()
        .label(format!("RAM {}", ram_str))
        .gauge_style(Style::default().fg(info).bg(muted))
        .ratio(if ram_total > 0 { (ram_used as f64 / ram_total as f64).min(1.0) } else { 0.0 });

    f.render_widget(cpu_gauge, gauge_area);
    f.render_widget(ram_gauge, Rect::new(gauge_area.x, gauge_area.y + 1, gauge_area.width, 2));

    // Clock
    let clock = state.get_clock_string();
    let clock_area = Rect::new(size.width.saturating_sub(8), size.height - 2, 8, 1);
    f.render_widget(
        Paragraph::new(clock)
            .style(Style::default().fg(text).bg(Color::Black))
            .alignment(Alignment::Right),
        clock_area,
    );

    // Taskbar
    let taskbar_height = 3u16;
    let taskbar_area = Rect::new(0, size.height - taskbar_height, size.width, taskbar_height);
    let taskbar_block = Block::default()
        .borders(Borders::TOP)
        .border_style(Style::default().fg(muted))
        .title(" Start ");
    f.render_widget(taskbar_block, taskbar_area);

    // Taskbar items
    let item_width = 15u16;
    for (i, item) in state.taskbar.iter().enumerate() {
        let item_x = (i as u16 * item_width) + 2;
        let item_rect = Rect::new(item_x, size.height - 2, item_width - 1, 1);
        
        let is_active = item.window_id == state.active_window;
        let style = if is_active {
            Style::default().fg(primary).bold()
        } else {
            Style::default().fg(text)
        };
        
        let label = format!("{} {}", item.icon, item.title.chars().take(10).collect::<String>());
        f.render_widget(Paragraph::new(label).style(style), item_rect);
    }

    // Bottom bar
    let bottom_tooltip = Rect::new(0, size.height - 1, size.width.saturating_sub(10), 1);
    f.render_widget(
        Paragraph::new("Eden(00-00): NeXe> ")
            .style(Style::default().fg(success).bg(Color::Black))
            .alignment(Alignment::Left),
        bottom_tooltip,
    );
}
