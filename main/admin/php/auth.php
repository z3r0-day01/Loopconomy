<?php
/**
 * LOOP Admin PHP Backend
 * Authentication Module
 * Version: v1.1.2_r2-1
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

define('BOT_VERSION', 'v1.1.2_r2-1');
define('ADMIN_VERSION', 'v1.1.2_r2-1');

// Database configuration
$db_host = getenv('DB_HOST') ?: 'localhost';
$db_port = getenv('DB_PORT') ?: '5432';
$db_name = getenv('DB_NAME') ?: 'loopconomy';
$db_user = getenv('DB_USER') ?: 'botuser';
$db_pass = getenv('DB_PASS') ?: 'password';

/**
 * Authenticate user credentials
 */
function authenticate($username, $password) {
    global $db_host, $db_port, $db_name, $db_user, $db_pass;
    
    try {
        $conn = pg_connect("host=$db_host port=$db_port dbname=$db_name user=$db_user password=$db_pass");
        
        $result = pg_query_params($conn, 
            "SELECT server_id, username, password_hash, must_change_password FROM server_admins WHERE username = $1",
            [$username]
        );
        
        if ($row = pg_fetch_assoc($result)) {
            if (password_verify($password, $row['password_hash'])) {
                return [
                    'success' => true,
                    'username' => $username,
                    'server_id' => $row['server_id'],
                    'must_change_password' => (bool)$row['must_change_password'],
                    'token' => bin2hex(random_bytes(32))
                ];
            }
        }
        
        return ['success' => false, 'error' => 'Invalid credentials'];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => 'Database error: ' . $e->getMessage()];
    }
}

/**
 * Hash password using SHA3-256
 */
function hash_password($password) {
    return hash('sha3-256', $password);
}

/**
 * Create new admin user
 */
function create_admin($username, $password, $server_name = 'Main') {
    global $db_host, $db_port, $db_name, $db_user, $db_pass;
    
    try {
        $conn = pg_connect("host=$db_host port=$db_port dbname=$db_name user=$db_user password=$db_pass");
        
        $password_hash = password_hash($password, PASSWORD_BCRYPT);
        
        $result = pg_query_params($conn,
            "INSERT INTO server_admins (server_name, username, password_hash, must_change_password) 
             VALUES ($1, $2, $3, TRUE) 
             ON CONFLICT DO NOTHING 
             RETURNING server_id",
            [$server_name, $username, $password_hash]
        );
        
        if ($row = pg_fetch_assoc($result)) {
            return ['success' => true, 'server_id' => $row['server_id']];
        }
        
        return ['success' => false, 'error' => 'User already exists'];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Change password
 */
function change_password($username, $old_password, $new_password) {
    global $db_host, $db_port, $db_name, $db_user, $db_pass;
    
    try {
        $conn = pg_connect("host=$db_host port=$db_port dbname=$db_name user=$db_user password=$db_pass");
        
        // Verify old password
        $result = pg_query_params($conn,
            "SELECT password_hash FROM server_admins WHERE username = $1",
            [$username]
        );
        
        if ($row = pg_fetch_assoc($result)) {
            if (password_verify($old_password, $row['password_hash'])) {
                $new_hash = password_hash($new_password, PASSWORD_BCRYPT);
                pg_query_params($conn,
                    "UPDATE server_admins SET password_hash = $1, must_change_password = FALSE WHERE username = $2",
                    [$new_hash, $username]
                );
                return ['success' => true];
            }
        }
        
        return ['success' => false, 'error' => 'Invalid old password'];
        
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

/**
 * Get system info
 */
function get_system_info() {
    return [
        'bot_version' => BOT_VERSION,
        'admin_version' => ADMIN_VERSION,
        'php_version' => PHP_VERSION,
        'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
        'uptime' => shell_exec('uptime -p') ?: 'Unknown',
        'load_average' => sys_getloadavg()
    ];
}

// Route handling
$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'login':
        $username = $_POST['username'] ?? '';
        $password = $_POST['password'] ?? '';
        echo json_encode(authenticate($username, $password));
        break;
        
    case 'register':
        $username = $_POST['username'] ?? '';
        $password = $_POST['password'] ?? '';
        $server_name = $_POST['server_name'] ?? 'Main';
        echo json_encode(create_admin($username, $password, $server_name));
        break;
        
    case 'change_password':
        $username = $_POST['username'] ?? '';
        $old_password = $_POST['old_password'] ?? '';
        $new_password = $_POST['new_password'] ?? '';
        echo json_encode(change_password($username, $old_password, $new_password));
        break;
        
    case 'system_info':
        echo json_encode(get_system_info());
        break;
        
    default:
        echo json_encode([
            'success' => false, 
            'error' => 'Unknown action',
            'available_actions' => ['login', 'register', 'change_password', 'system_info']
        ]);
}
