<?php
/**
 * Auth API — login, logout, session check, first-time setup, password change.
 *
 * GET  /api/auth.php                                → check session
 * POST /api/auth.php {action: "login", email, password}   → login
 * POST /api/auth.php {action: "logout"}                    → logout
 * POST /api/auth.php {action: "setup", email, password, name} → first admin
 * POST /api/auth.php {action: "change_password", current_password, new_password} → change password
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';

$db = getDB();

// --- GET: Check session ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $token = $_COOKIE['session_token'] ?? null;

    if (!$token) {
        // Check if there are any users (for setup detection)
        $stmt = $db->query('SELECT COUNT(*) as cnt FROM users');
        $count = $stmt->fetch()['cnt'];
        http_response_code(401);
        echo json_encode(['error' => 'Not authenticated', 'needs_setup' => $count == 0]);
        exit;
    }

    // Clean expired sessions
    $db->exec("DELETE FROM sessions WHERE expires_at < datetime('now')");

    $stmt = $db->prepare("
        SELECT u.id, u.email, u.name, u.role
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = :token AND s.expires_at > datetime('now')
    ");
    $stmt->execute([':token' => $token]);
    $user = $stmt->fetch();

    if (!$user) {
        setcookie('session_token', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        $stmt = $db->query('SELECT COUNT(*) as cnt FROM users');
        $count = $stmt->fetch()['cnt'];
        http_response_code(401);
        echo json_encode(['error' => 'Session expired', 'needs_setup' => $count == 0]);
        exit;
    }

    echo json_encode(['user' => $user], JSON_UNESCAPED_UNICODE);
    exit;
}

// --- POST actions ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';

    // --- LOGIN ---
    if ($action === 'login') {
        $email = trim($input['email'] ?? '');
        $password = $input['password'] ?? '';

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Email and password required']);
            exit;
        }

        $stmt = $db->prepare('SELECT id, email, name, role, password_hash FROM users WHERE email = :email');
        $stmt->execute([':email' => $email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            usleep(500000); // 500ms delay to prevent brute force
            http_response_code(401);
            echo json_encode(['error' => 'Invalid email or password']);
            exit;
        }

        // Create session
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

        $stmt = $db->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (:token, :user_id, :expires_at)');
        $stmt->execute([':token' => $token, ':user_id' => $user['id'], ':expires_at' => $expiresAt]);

        setcookie('session_token', $token, [
            'expires' => strtotime('+30 days'),
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
        ]);

        unset($user['password_hash']);
        echo json_encode(['token' => $token, 'user' => $user], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // --- LOGOUT ---
    if ($action === 'logout') {
        $token = $_COOKIE['session_token'] ?? null;

        if ($token) {
            $stmt = $db->prepare('DELETE FROM sessions WHERE token = :token');
            $stmt->execute([':token' => $token]);
        }

        setcookie('session_token', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
        ]);

        echo json_encode(['ok' => true]);
        exit;
    }

    // --- SETUP (first admin) ---
    if ($action === 'setup') {
        // Only allowed when no users exist
        $stmt = $db->query('SELECT COUNT(*) as cnt FROM users');
        $count = $stmt->fetch()['cnt'];

        if ($count > 0) {
            http_response_code(403);
            echo json_encode(['error' => 'Setup already completed']);
            exit;
        }

        $email = trim($input['email'] ?? '');
        $password = $input['password'] ?? '';
        $name = trim($input['name'] ?? '');

        if (!$email || !$password) {
            http_response_code(400);
            echo json_encode(['error' => 'Email and password required']);
            exit;
        }

        if (strlen($password) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 6 characters']);
            exit;
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);

        $stmt = $db->prepare('INSERT INTO users (email, name, password_hash, role) VALUES (:email, :name, :hash, "admin")');
        $stmt->execute([':email' => $email, ':name' => $name, ':hash' => $hash]);

        $userId = $db->lastInsertId();

        // Auto-login
        $token = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

        $stmt = $db->prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (:token, :user_id, :expires_at)');
        $stmt->execute([':token' => $token, ':user_id' => $userId, ':expires_at' => $expiresAt]);

        setcookie('session_token', $token, [
            'expires' => strtotime('+30 days'),
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
        ]);

        $user = ['id' => (int)$userId, 'email' => $email, 'name' => $name, 'role' => 'admin'];
        echo json_encode(['token' => $token, 'user' => $user], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // --- CHANGE PASSWORD ---
    if ($action === 'change_password') {
        require_once __DIR__ . '/auth_middleware.php';
        $currentUser = requireAuth();

        $currentPassword = $input['current_password'] ?? '';
        $newPassword = $input['new_password'] ?? '';

        if (!$currentPassword || !$newPassword) {
            http_response_code(400);
            echo json_encode(['error' => 'Current and new passwords required']);
            exit;
        }

        if (strlen($newPassword) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'New password must be at least 6 characters']);
            exit;
        }

        // Verify current password
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = :id');
        $stmt->execute([':id' => $currentUser['id']]);
        $row = $stmt->fetch();

        if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Current password is incorrect']);
            exit;
        }

        // Update password
        $hash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $stmt->execute([':hash' => $hash, ':id' => $currentUser['id']]);

        echo json_encode(['ok' => true]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Unknown action: ' . $action]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
