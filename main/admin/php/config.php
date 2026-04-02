<?php
/**
 * LOOP Admin PHP Backend
 * Configuration Module
 * Version: v1.1.2_r2-1
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

define('BOT_VERSION', 'v1.1.2_r2-1');

$config_dir = __DIR__ . '/../../';
$config_files = [
    'ai-config.json' => 'AI Configuration',
    'copyright-config.json' => 'Copyright Smartclaim Config',
    'config.json' => 'Bot Configuration',
    '.env' => 'Environment Variables'
];

/**
 * Get configuration value
 */
function get_config($file, $key = null) {
    global $config_dir;
    
    $path = $config_dir . $file;
    
    if (!file_exists($path)) {
        return ['success' => false, 'error' => 'Config file not found: ' . $file];
    }
    
    $content = file_get_contents($path);
    
    if ($file === '.env') {
        $config = [];
        foreach (explode("\n", $content) as $line) {
            $line = trim($line);
            if ($line && strpos($line, '#') !== 0) {
                if (strpos($line, '=') !== false) {
                    list($k, $v) = explode('=', $line, 2);
                    $config[trim($k)] = trim($v);
                }
            }
        }
    } else {
        $config = json_decode($content, true);
    }
    
    if ($key) {
        return isset($config[$key]) 
            ? ['success' => true, 'value' => $config[$key]]
            : ['success' => false, 'error' => 'Key not found: ' . $key];
    }
    
    return ['success' => true, 'config' => $config, 'file' => $file];
}

/**
 * Set configuration value
 */
function set_config($file, $key, $value) {
    global $config_dir;
    
    $path = $config_dir . $file;
    
    if (!file_exists($path)) {
        return ['success' => false, 'error' => 'Config file not found: ' . $file];
    }
    
    $content = file_get_contents($path);
    
    if ($file === '.env') {
        $config = [];
        foreach (explode("\n", $content) as $line) {
            $line = trim($line);
            if ($line && strpos($line, '#') !== 0) {
                if (strpos($line, '=') !== false) {
                    list($k, $v) = explode('=', $line, 2);
                    $config[trim($k)] = trim($v);
                }
            }
        }
        $config[$key] = $value;
        
        $output = '';
        foreach ($config as $k => $v) {
            $output .= "$k=$v\n";
        }
    } else {
        $config = json_decode($content, true);
        $config[$key] = $value;
        $output = json_encode($config, JSON_PRETTY_PRINT);
    }
    
    file_put_contents($path, $output);
    
    return ['success' => true, 'message' => "Updated $key in $file"];
}

/**
 * List available config files
 */
function list_configs() {
    global $config_files, $config_dir;
    
    $available = [];
    
    foreach ($config_files as $file => $desc) {
        $path = $config_dir . $file;
        if (file_exists($path)) {
            $available[$file] = [
                'description' => $desc,
                'size' => filesize($path),
                'modified' => date('Y-m-d H:i:s', filemtime($path))
            ];
        }
    }
    
    return ['success' => true, 'configs' => $available];
}

/**
 * Reset config to defaults
 */
function reset_config($file) {
    global $config_dir;
    
    $defaults = [
        'ai-config.json' => [
            'enabled' => false,
            'model' => 'minimax-m2.7:cloud',
            'ollamaUrl' => 'http://localhost:11434',
            'temperature' => 0.7,
            'top_p' => 0.9,
            'top_k' => 40
        ],
        'copyright-config.json' => [
            'smartEnabled' => false,
            'ragEnabled' => false,
            'embeddingsEnabled' => false,
            'llmModel' => 'granite4:350m-h-q8_0',
            'embeddingModel' => 'granite-embedding:278m-fp16',
            'similarityThreshold' => 0.75,
            'firstOffenseWarn' => true
        ]
    ];
    
    if (!isset($defaults[$file])) {
        return ['success' => false, 'error' => 'No default config available for: ' . $file];
    }
    
    $path = $config_dir . $file;
    file_put_contents($path, json_encode($defaults[$file], JSON_PRETTY_PRINT));
    
    return ['success' => true, 'message' => "Reset $file to defaults"];
}

// Route handling
$action = $_GET['action'] ?? $_POST['action'] ?? '';
$file = $_GET['file'] ?? $_POST['file'] ?? 'config.json';
$key = $_GET['key'] ?? $_POST['key'] ?? null;
$value = $_GET['value'] ?? $_POST['value'] ?? null;

switch ($action) {
    case 'get':
        echo json_encode(get_config($file, $key));
        break;
        
    case 'set':
        if (!$key) {
            echo json_encode(['success' => false, 'error' => 'Key is required']);
            break;
        }
        echo json_encode(set_config($file, $key, $value));
        break;
        
    case 'list':
        echo json_encode(list_configs());
        break;
        
    case 'reset':
        echo json_encode(reset_config($file));
        break;
        
    default:
        echo json_encode([
            'success' => false, 
            'error' => 'Unknown action',
            'available_actions' => ['get', 'set', 'list', 'reset']
        ]);
}
