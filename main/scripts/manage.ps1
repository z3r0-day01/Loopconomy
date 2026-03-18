# Loopconomy OS - Shell-like Interface

$MainDir = Split-Path $PSScriptRoot -Parent
$PidFile = "$MainDir\.bot.pid"
$LogFile = "$MainDir\bot.log"

$Prompt = "loop@bot:~$ "
$BotName = "Loopconomy OS"
$BotVersion = "Beta 2"

$Colors = @{
    Red = "`e[31m"
    Green = "`e[32m"
    Yellow = "`e[33m"
    Cyan = "`e[36m"
    Magenta = "`e[35m"
    White = "`e[37m"
    Dim = "`e[2m"
    Bold = "`e[1m"
    NC = "`e[0m"
}

function Get-BotStatus {
    $pid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($pid) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($proc) {
            return @{ Running = $true; PID = $proc.Id; Uptime = $proc.StartTime }
        }
    }
    return @{ Running = $false }
}

function Show-Banner {
    Clear-Host
    Write-Host @"

    ██╗    ██╗███████╗██████╗  ██████╗ ███████╗
    ██║    ██║██╔════╝██╔══██╗██╔═══██╗██╔════╝
    ██║ █╗ ██║█████╗  ██████╔╝██║   ██║███████╗
    ██║███╗██║██╔══╝  ██╔══██╗██║   ██║╚════██║
    ╚███╔███╔╝███████╗██████╔╝╚██████╔╝███████║
     ╚══╝╚══╝ ╚══════╝╚═════╝  ╚═════╝ ╚══════╝
"@ -ForegroundColor Magenta
    Write-Host "  $($Colors.Bold)Loopconomy OS v$BotVersion$($Colors.NC)"
    Write-Host "  $($Colors.Dim)Type 'help' for commands$($Colors.NC)"
    Write-Host ""
}

function Get-Help {
    Write-Host "$($Colors.Bold)Available Commands:$($Colors.NC)"
    Write-Host ""
    Write-Host "  $($Colors.Cyan)Bot Control$($Colors.NC)"
    Write-Host "    start, stop, restart, status"
    Write-Host ""
    Write-Host "  $($Colors.Cyan)Logs$($Colors.NC)"
    Write-Host "    logs, tail"
    Write-Host ""
    Write-Host "  $($Colors.Cyan)Database$($Colors.NC)"
    Write-Host "    db status, db users, db backup"
    Write-Host ""
    Write-Host "  $($Colors.Cyan)System$($Colors.NC)"
    Write-Host "    update, clear, exit"
    Write-Host ""
}

function Start-Bot {
    if ((Get-BotStatus).Running) { Write-Host "$($Colors.Yellow)Already running!$($Colors.NC)"; return }
    Set-Location $MainDir
    Start-Process node -ArgumentList "main.js" -RedirectStandardOutput $LogFile -WindowStyle Hidden
    Start-Sleep 2
    if ((Get-BotStatus).Running) { Write-Host "$($Colors.Green)✓ Started$($Colors.NC)" } else { Write-Host "$($Colors.Red)✗ Failed$($Colors.NC)" }
}

function Stop-Bot {
    $s = Get-BotStatus
    if (-not $s.Running) { Write-Host "$($Colors.Yellow)Not running$($Colors.NC)"; return }
    Stop-Process -Id $s.PID -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "$($Colors.Green)✓ Stopped$($Colors.NC)"
}

function Restart-Bot {
    Stop-Bot
    Start-Sleep 1
    Start-Bot
}

function Show-Status {
    $s = Get-BotStatus
    if ($s.Running) { Write-Host "$($Colors.Green)● RUNNING$($Colors.NC) PID: $($s.PID)" }
    else { Write-Host "$($Colors.Red)● STOPPED$($Colors.NC)" }
}

function Show-Logs {
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 30 }
    else { Write-Host "$($Colors.Yellow)No logs$($Colors.NC)" }
}

function Tail-Logs {
    if (Test-Path $LogFile) { Get-Content $LogFile -Tail 10 -Wait }
}

function Get-DBStatus {
    if (-not (Test-Path "$MainDir\.env")) { Write-Host "$($Colors.Red)✗ No .env$($Colors.NC)"; return }
    . "$MainDir\.env" 2>$null
    if ($env:DATABASE_URL) {
        try {
            $r = & psql $env:DATABASE_URL -t -c "SELECT COUNT(*), COALESCE(SUM(coins),0) FROM economy" 2>$null
            if ($r) { Write-Host "$($Colors.Green)✓ Connected$($Colors.NC) | $r" }
        } catch { Write-Host "$($Colors.Red)✗ Failed$($Colors.NC)" }
    }
}

function Get-DBUsers {
    if (Test-Path "$MainDir\.env") {
        . "$MainDir\.env" 2>$null
        if ($env:DATABASE_URL) { & psql $env:DATABASE_URL -c "SELECT uid, coins FROM economy ORDER BY coins DESC LIMIT 15;" 2>$null }
    }
}

function Backup-DB {
    if (Test-Path "$MainDir\.env") {
        . "$MainDir\.env" 2>$null
        if ($env:DATABASE_URL) {
            $dir = "$MainDir\backups"; if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }
            $f = "$dir\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
            & pg_dump $env:DATABASE_URL 2>$null | Set-Content $f -Encoding UTF8
            if (Test-Path $f) { Write-Host "$($Colors.Green)✓ Backup: $(Split-Path $f -Leaf)$($Colors.NC)" }
        }
    }
}

function Update-Bot {
    Set-Location $MainDir
    git pull origin beta2 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "$($Colors.Green)✓ Updated$($Colors.NC)"
        if ((Get-BotStatus).Running) { Restart-Bot }
    }
}

function Clear-Screen { Clear-Host }

function Run-Command {
    param($Input)
    
    $parts = $Input.Trim() -split '\s+'
    $cmd = $parts[0]
    $args = $parts[1..($parts.Length-1)] -join ' '
    
    switch ($cmd) {
        "help" { Get-Help }
        "start" { Start-Bot }
        "stop" { Stop-Bot }
        "restart" { Restart-Bot }
        "status" { Show-Status }
        "logs" { Show-Logs }
        "tail" { Tail-Logs }
        "db" {
            switch ($args) {
                "status" { Get-DBStatus }
                "users" { Get-DBUsers }
                "backup" { Backup-DB }
                default { Write-Host "Usage: db [status|users|backup]" }
            }
        }
        "update" { Update-Bot }
        "clear" { Clear-Screen }
        "exit" { Write-Host "$($Colors.Dim)Goodbye!$($Colors.NC)"; exit }
        "" { }
        default { Write-Host "$($Colors.Red)Unknown: $cmd$($Colors.NC) (help)" }
    }
}

Show-Banner
Show-Status
Write-Host ""

while ($true) {
    Write-Host -NoNewline "$Prompt"
    $cmd = Read-Host
    Run-Command $cmd
    Write-Host ""
}
