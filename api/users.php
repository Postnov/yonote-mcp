<?php
/**
 * Users API — CRUD for user management (admin only).
 *
 * GET    /api/users.php          → list all users with project access
 * GET    /api/users.php?id=X     → get single user with project access
 * POST   /api/users.php          → create user {email, name, password, project_ids[]}
 * PUT    /api/users.php?id=X     → update user {name?, email?, password?, project_ids[]?}
 * DELETE /api/users.php?id=X     → delete user + sessions + access
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_middleware.php';

// All endpoints require admin
$currentUser = requireAdmin();

$db = getDB();

function getUserProjectIds($db, $userId) {
    $stmt = $db->prepare('SELECT project_id FROM project_access WHERE user_id = :uid');
    $stmt->execute([':uid' => $userId]);
    return array_map(function($r) { return (int)$r['project_id']; }, $stmt->fetchAll());
}

function syncProjectAccess($db, $userId, $projectIds) {
    // Remove existing access
    $stmt = $db->prepare('DELETE FROM project_access WHERE user_id = :uid');
    $stmt->execute([':uid' => $userId]);

    // Add new access
    if (!empty($projectIds)) {
        $stmt = $db->prepare('INSERT OR IGNORE INTO project_access (project_id, user_id) VALUES (:pid, :uid)');
        foreach ($projectIds as $pid) {
            $stmt->execute([':pid' => (int)$pid, ':uid' => $userId]);
        }
    }
}

function formatUser($row, $projectIds) {
    return [
        'id' => (int)$row['id'],
        'email' => $row['email'],
        'name' => $row['name'],
        'role' => $row['role'],
        'created_at' => $row['created_at'],
        'project_ids' => $projectIds,
    ];
}

// --- GET: List / Get single ---
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = $_GET['id'] ?? null;

    if ($id) {
        $stmt = $db->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();

        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'User not found']);
            exit;
        }

        $projectIds = getUserProjectIds($db, $row['id']);
        echo json_encode(formatUser($row, $projectIds), JSON_UNESCAPED_UNICODE);
    } else {
        $stmt = $db->query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC');
        $rows = $stmt->fetchAll();

        $result = [];
        foreach ($rows as $row) {
            $projectIds = getUserProjectIds($db, $row['id']);
            $result[] = formatUser($row, $projectIds);
        }

        echo json_encode($result, JSON_UNESCAPED_UNICODE);
    }
    exit;
}

// --- POST: Create user ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $email = trim($input['email'] ?? '');
    $name = trim($input['name'] ?? '');
    $password = $input['password'] ?? '';
    $projectIds = $input['project_ids'] ?? [];

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

    // Check unique email
    $stmt = $db->prepare('SELECT id FROM users WHERE email = :email');
    $stmt->execute([':email' => $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'User with this email already exists']);
        exit;
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);

    $stmt = $db->prepare('INSERT INTO users (email, name, password_hash, role) VALUES (:email, :name, :hash, "user")');
    $stmt->execute([':email' => $email, ':name' => $name, ':hash' => $hash]);

    $userId = (int)$db->lastInsertId();

    // Sync project access
    syncProjectAccess($db, $userId, $projectIds);

    $stmt = $db->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = :id');
    $stmt->execute([':id' => $userId]);
    $row = $stmt->fetch();

    $pids = getUserProjectIds($db, $userId);
    echo json_encode(formatUser($row, $pids), JSON_UNESCAPED_UNICODE);
    exit;
}

// --- PUT: Update user ---
if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id parameter']);
        exit;
    }

    $stmt = $db->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $existing = $stmt->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);

    $email = isset($input['email']) ? trim($input['email']) : $existing['email'];
    $name = isset($input['name']) ? trim($input['name']) : $existing['name'];

    // Check email uniqueness if changed
    if ($email !== $existing['email']) {
        $stmt = $db->prepare('SELECT id FROM users WHERE email = :email AND id != :id');
        $stmt->execute([':email' => $email, ':id' => $id]);
        if ($stmt->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => 'Email already in use']);
            exit;
        }
    }

    // Update basic fields
    $stmt = $db->prepare('UPDATE users SET email = :email, name = :name WHERE id = :id');
    $stmt->execute([':email' => $email, ':name' => $name, ':id' => $id]);

    // Update password if provided
    if (!empty($input['password'])) {
        if (strlen($input['password']) < 6) {
            http_response_code(400);
            echo json_encode(['error' => 'Password must be at least 6 characters']);
            exit;
        }
        $hash = password_hash($input['password'], PASSWORD_BCRYPT);
        $stmt = $db->prepare('UPDATE users SET password_hash = :hash WHERE id = :id');
        $stmt->execute([':hash' => $hash, ':id' => $id]);
    }

    // Update project access if provided
    if (isset($input['project_ids'])) {
        syncProjectAccess($db, (int)$id, $input['project_ids']);
    }

    $stmt = $db->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();

    $pids = getUserProjectIds($db, (int)$id);
    echo json_encode(formatUser($row, $pids), JSON_UNESCAPED_UNICODE);
    exit;
}

// --- DELETE: Remove user ---
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id parameter']);
        exit;
    }

    // Prevent deleting yourself
    if ((int)$id === (int)$currentUser['id']) {
        http_response_code(400);
        echo json_encode(['error' => 'Cannot delete your own account']);
        exit;
    }

    $stmt = $db->prepare('SELECT id FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }

    // Cascade: delete sessions and access (FK cascade should handle, but be explicit)
    $stmt = $db->prepare('DELETE FROM sessions WHERE user_id = :id');
    $stmt->execute([':id' => $id]);
    $stmt = $db->prepare('DELETE FROM project_access WHERE user_id = :id');
    $stmt->execute([':id' => $id]);
    $stmt = $db->prepare('DELETE FROM users WHERE id = :id');
    $stmt->execute([':id' => $id]);

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
