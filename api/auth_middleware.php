<?php
/**
 * Authentication middleware — validates session cookies and enforces access control.
 *
 * requireAuth() → returns user array or exits with 401
 * requireAdmin() → requireAuth() + checks role === 'admin', exits 403 if not
 */

require_once __DIR__ . '/db.php';

function requireAuth() {
    $token = $_COOKIE['session_token'] ?? null;

    if (!$token) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }

    $db = getDB();

    // Clean up expired sessions
    $db->exec("DELETE FROM sessions WHERE expires_at < datetime('now')");

    // Validate session token
    $stmt = $db->prepare("
        SELECT u.id, u.email, u.name, u.role
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = :token AND s.expires_at > datetime('now')
    ");
    $stmt->execute([':token' => $token]);
    $user = $stmt->fetch();

    if (!$user) {
        // Clear invalid cookie
        setcookie('session_token', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        http_response_code(401);
        echo json_encode(['error' => 'Session expired']);
        exit;
    }

    return $user;
}

function requireAdmin() {
    $user = requireAuth();

    if ($user['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }

    return $user;
}
