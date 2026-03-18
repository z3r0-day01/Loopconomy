# Loopconomy Bot Manager - Windows PowerShell

$script:BotProcess = $null
$script:MainDir = Split-Path $PSScriptRoot -Parent
$script:PidFile = "$script:MainDir\.bot.pid"
$script:LogFile = "$script:MainDir\bot.log"

function Show-Banner {
    Clear-Host
    Write-Host @"

 ╔════════════════════════════════════════╗
 ║        Loopconomy Bot Manager          ║
 ╚════════════════════════════════════════╝
"@ -ForegroundColor Magenta
    Write-Host "                    v1.0.0 | Beta 2" -ForegroundColor Cyan
    Write-Host ""
}

function Get-BotStatus {
    $pid = Get-Content $script:PidFile -ErrorAction SilentlyContinue
    if ($pid) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            return @{
                Running = $true
                PID = $process.Id
                Uptime = (Get-Date) - $process.StartTime
            }
        }
    }
    return @{ Running = $false }
}

function Show-Status {
    $status = Get-BotStatus
    
    Write-Host "Bot Status:" -ForegroundColor Cyan
    Write-Host ""
    
    if ($status.Running) {
        Write-Host "  [RUNNING] 🟢" -ForegroundColor Green
        Write-Host "  PID: $($status.PID)"
        Write-Host "  Uptime: $($status.Uptime.ToString('hh\:mm\:ss'))"
    } else {
        Write-Host "  [STOPPED] 🔴" -ForegroundColor Red
    }
    Write-Host ""
}

function Start-Bot {
    $status = Get-BotStatus
    if ($status.Running) {
        Write-Host "Bot is already running!" -ForegroundColor Yellow
        return
    }
    
    Set-Location $script:MainDir
    Start-Process -FilePath "node" -ArgumentList "main.js" -RedirectStandardOutput $script:LogFile -RedirectStandardError "$script:LogFile.err" -WindowStyle Hidden
    Start-Sleep 3
    
    $status = Get-BotStatus
    if ($status.Running) {
        Write-Host "Bot started! (PID: $($status.PID))" -ForegroundColor Green
    } else {
        Write-Host "Bot failed to start." -ForegroundColor Red
    }
}

function Stop-Bot {
    $status = Get-BotStatus
    if (-not $status.Running) {
        Write-Host "Bot is not running." -ForegroundColor Yellow
        return
    }
    
    Stop-Process -Id $status.PID -Force
    Start-Sleep 2
    
    if (Test-Path $script:PidFile) { Remove-Item $script:PidFile }
    Write-Host "Bot stopped." -ForegroundColor Green
}

function Restart-Bot {
    Write-Host "Restarting bot..."
    Stop-Bot
    Start-Sleep 2
    Start-Bot
}

function View-Logs {
    if (Test-Path $script:LogFile) {
        Get-Content $script:LogFile -Tail 50
    } else {
        Write-Host "No log file found." -ForegroundColor Yellow
    }
}

function View-FullLogs {
    if (Test-Path $script:LogFile) {
        Get-Content $script:LogFile | Out-Host
    } else {
        Write-Host "No log file found." -ForegroundColor Yellow
    }
}

function Clear-Logs {
    if (Test-Path $script:LogFile) {
        $confirm = Read-Host "Clear logs? (y/n)"
        if ($confirm -eq "y") {
            "" | Set-Content $script:LogFile
            Write-Host "Logs cleared." -ForegroundColor Green
        }
    }
}

function Get-DBStatus {
    Write-Host "Database Status:" -ForegroundColor Cyan
    Write-Host ""
    
    if (-not (Test-Path "$script:MainDir\.env")) {
        Write-Host ".env not found." -ForegroundColor Red
        return
    }
    
    $envContent = Get-Content "$script:MainDir\.env" | ForEach-Object { $parts = $_ -split '=', 2; @{ $parts[0] = $parts[1] } } | ForEach-Object { $_ }
    
    $dbUrl = ($envContent | Where-Object { $_.Keys -contains 'DATABASE_URL' }).Values | Select-Object -First 1
    
    if (-not $dbUrl) {
        Write-Host "DATABASE_URL not set." -ForegroundColor Red
        return
    }
    
    try {
        $result = & psql $dbUrl -t -c "SELECT COUNT(*), COALESCE(SUM(coins), 0) FROM economy" 2>$null
        if ($result) {
            Write-Host "Database connected 🟢" -ForegroundColor Green
            Write-Host "Query result: $result"
        }
    } catch {
        Write-Host "Database connection failed." -ForegroundColor Red
    }
}

function Get-DBUsers {
    Write-Host "Top Users by Balance:" -ForegroundColor Cyan
    Write-Host ""
    
    if (-not (Test-Path "$script:MainDir\.env")) {
        Write-Host ".env not found." -ForegroundColor Red
        return
    }
    
    . "$script:MainDir\.env" 2>$null
    
    if ($env:DATABASE_URL) {
        & psql $env:DATABASE_URL -c "SELECT uid, coins FROM economy ORDER BY coins DESC LIMIT 20;" 2>$null
    }
    
    Write-Host ""
    Read-Host "Press Enter"
}

function Invoke-DBQuery {
    Write-Host "Enter SQL query:" -ForegroundColor Cyan
    $query = Read-Host
    
    Write-Host "Executing: $query" -ForegroundColor Yellow
    
    if (Test-Path "$script:MainDir\.env") {
        . "$script:MainDir\.env" 2>$null
        
        if ($env:DATABASE_URL) {
            & psql $env:DATABASE_URL -c "$query" 2>&1 | ForEach-Object { Write-Host $_ }
        }
    }
    
    Write-Host ""
    Read-Host "Press Enter"
}

function Add-DBCoins {
    Write-Host "Enter User ID:" -ForegroundColor Cyan
    $uid = Read-Host
    
    Write-Host "Enter Amount:" -ForegroundColor Cyan
    $amount = Read-Host
    
    Write-Host "Adding $amount coins to $uid..." -ForegroundColor Yellow
    
    if (Test-Path "$script:MainDir\.env") {
        . "$script:MainDir\.env" 2>$null
        
        if ($env:DATABASE_URL) {
            & psql $env:DATABASE_URL -c "INSERT INTO economy (uid, coins) VALUES ('$uid', $amount) ON CONFLICT (uid) DO UPDATE SET coins = economy.coins + $amount;" 2>&1 | Out-Null
            Write-Host "Done!" -ForegroundColor Green
        }
    }
    
    Write-Host ""
    Read-Host "Press Enter"
}

function Backup-Database {
    if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
        Write-Host "PostgreSQL not found." -ForegroundColor Red
        return
    }
    
    if (Test-Path "$script:MainDir\.env") {
        . "$script:MainDir\.env" 2>$null
        
        if ($env:DATABASE_URL) {
            $backupDir = "$script:MainDir\backups"
            if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
            
            $backupFile = "$backupDir\backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
            Write-Host "Creating: $backupFile"
            
            & pg_dump $env:DATABASE_URL 2>$null | Set-Content $backupFile -Encoding UTF8
            
            if (Test-Path $backupFile) {
                Write-Host "Backup created!" -ForegroundColor Green
                
                $compress = Read-Host "Compress? (y/n)"
                if ($compress -eq "y") {
                    Compress-Archive -Path $backupFile -DestinationPath "$backupFile.zip" -Force
                    Write-Host "Compressed: $backupFile.zip"
                }
            } else {
                Write-Host "Backup failed." -ForegroundColor Red
            }
        }
    }
    
    Write-Host ""
    Read-Host "Press Enter"
}

function Update-Bot {
    Write-Host "Pulling updates..."
    
    Set-Location $script:MainDir
    
    & git pull origin beta2 2>&1 | ForEach-Object { Write-Host $_ }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Updates pulled!" -ForegroundColor Green
        
        if (Test-Path "node_modules") {
            Write-Host "Installing dependencies..."
            npm install 2>&1 | Out-Null
        }
        
        $status = Get-BotStatus
        if ($status.Running) {
            $restart = Read-Host "Restart to apply? (y/n)"
            if ($restart -eq "y") { Restart-Bot }
        }
    } else {
        Write-Host "Git pull failed." -ForegroundColor Red
    }
    
    Write-Host ""
    Read-Host "Press Enter"
}

function Invoke-Command {
    Write-Host "Enter shell command:" -ForegroundColor Cyan
    $cmd = Read-Host
    
    Write-Host "Running: $cmd" -ForegroundColor Yellow
    
    Invoke-Expression $cmd 2>&1 | ForEach-Object { Write-Host $_ }
    
    Write-Host ""
    Read-Host "Press Enter"
}

function Show-Menu {
    Show-Banner
    Show-Status
    
    Write-Host @"

        ╔════════════════════════════════╗
        ║        Management Menu         ║
        ╚════════════════════════════════╝

  1. Start/Stop Bot
  2. Restart Bot
  3. View Logs
  4. View Full Logs
  5. Clear Logs
  6. Update (git pull)

  [Database]
  7. DB Status
  8. DB List Users
  9. DB Query (SQL)
  10. DB Add Coins
  11. DB Backup

  [System]
  12. Run Command
  13. Refresh
  14. Exit

"@ -ForegroundColor Cyan
    
    $choice = Read-Host "Select"
    Write-Host ""
    
    switch ($choice) {
        "1" { if ((Get-BotStatus).Running) { Stop-Bot } else { Start-Bot }; Write-Host ""; Read-Host "Enter" }
        "2" { Restart-Bot; Write-Host ""; Read-Host "Enter" }
        "3" { View-Logs; Write-Host ""; Read-Host "Enter" }
        "4" { View-FullLogs; Write-Host ""; Read-Host "Enter" }
        "5" { Clear-Logs; Write-Host ""; Read-Host "Enter" }
        "6" { Update-Bot }
        "7" { Get-DBStatus; Write-Host ""; Read-Host "Enter" }
        "8" { Get-DBUsers }
        "9" { Invoke-DBQuery }
        "10" { Add-DBCoins }
        "11" { Backup-Database }
        "12" { Invoke-Command }
        "13" { }
        "14" { Write-Host "Goodbye!"; exit }
        default { Write-Host "Invalid." -ForegroundColor Red; Start-Sleep 1 }
    }
}

while ($true) {
    Show-Menu
}
