<?php
/**
 * LOOP Admin PHP Backend
 * Logs Module
 * Version: v1.1.2_r2-1
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

define('BOT_VERSION', 'v1.1.2_r2-1');

/**
 * Get log lines with filtering
 */
function get_logs($lines = 50, $level = null, $grep = null, $since = null) {
    $log_file = __DIR__ . '/../../bot.log';
    
    if (!file_exists($log_file)) {
        return ['success' => false, 'error' => 'Log file not found'];
    }
    
    $content = file($log_file);
    $logs = array_reverse($content);
    
    $filtered = [];
    foreach ($logs as $log) {
        $include = true;
        
        // Filter by level
        if ($level) {
            $level_upper = strtoupper($level);
            if (stripos($log, "[$level_upper]") === false && stripos($log, $level_upper) === false) {
                $include = false;
            }
        }
        
        // Filter by grep pattern
        if ($grep && $include) {
            if (stripos($log, $grep) === false) {
                $include = false;
            }
        }
        
        // Filter by time (since HH:MM)
        if ($since && $include) {
            if (preg_match('/(\d+):(\d+)/', $log, $matches)) {
                $log_time = ($matches[1] * 60) + $matches[2];
                if ($log_time < $since) {
                    $include = false;
                }
            }
        }
        
        if ($include) {
            $filtered[] = trim($log);
        }
        
        if (count($filtered) >= $lines) {
            break;
        }
    }
    
    return [
        'success' => true,
        'logs' => $filtered,
        'count' => count($filtered),
        'level' => $level,
        'grep' => $grep
    ];
}

/**
 * Get log stats (error count, warning count, etc)
 */
function get_log_stats() {
    $log_file = __DIR__ . '/../../bot.log';
    
    if (!file_exists($log_file)) {
        return ['success' => false, 'error' => 'Log file not found'];
    }
    
    $content = file($log_file);
    $stats = [
        'total' => count($content),
        'errors' => 0,
        'warnings' => 0,
        'info' => 0,
        'debug' => 0
    ];
    
    foreach ($content as $line) {
        if (stripos($line, 'ERROR') !== false) $stats['errors']++;
        if (stripos($line, 'WARN') !== false) $stats['warnings']++;
        if (stripos($line, '[INFO]') !== false) $stats['info']++;
        if (stripos($line, '[DEBUG]') !== false) $stats['debug']++;
    }
    
    return ['success' => true, 'stats' => $stats];
}

/**
 * Clear logs
 */
function clear_logs() {
    $log_file = __DIR__ . '/../../bot.log';
    
    if (file_exists($log_file)) {
        file_put_contents($log_file, '');
        return ['success' => true, 'message' => 'Logs cleared'];
    }
    
    return ['success' => false, 'error' => 'Log file not found'];
}

/**
 * Export logs
 */
function export_logs($format = 'txt') {
    $log_file = __DIR__ . '/../../bot.log';
    
    if (!file_exists($log_file)) {
        return ['success' => false, 'error' => 'Log file not found'];
    }
    
    $content = file_get_contents($log_file);
    
    if ($format === 'json') {
        return [
            'success' => true,
            'logs' => array_filter(array_map('trim', explode("\n", $content))),
            'exported_at' => date('Y-m-d H:i:s')
        ];
    }
    
    return [
        'success' => true,
        'content' => $content,
        'content_type' => 'text/plain'
    ];
}

// Route handling
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'get':
        $lines = (int)($_GET['lines'] ?? $_POST['lines'] ?? 50);
        $level = $_GET['level'] ?? $_POST['level'] ?? null;
        $grep = $_GET['grep'] ?? $_POST['grep'] ?? null;
        $since = $_GET['since'] ?? $_POST['since'] ?? null;
        
        if ($since) {
            list($h, $m) = explode(':', $since);
            $since = ($h * 60) + $m;
        }
        
        echo json_encode(get_logs($lines, $level, $grep, $since));
        break;
        
    case 'stats':
        echo json_encode(get_log_stats());
        break;
        
    case 'clear':
        echo json_encode(clear_logs());
        break;
        
    case 'export':
        $format = $_GET['format'] ?? $_POST['format'] ?? 'txt';
        $result = export_logs($format);
        
        if ($format === 'json') {
            echo json_encode($result);
        } else {
            header('Content-Type: text/plain');
            header('Content-Disposition: attachment; filename=bot.log');
            echo $result['content'];
        }
        break;
        
    default:
        echo json_encode([
            'success' => false, 
            'error' => 'Unknown action',
            'available_actions' => ['get', 'stats', 'clear', 'export']
        ]);
}
