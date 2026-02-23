<?php
/**
 * Projects API — CRUD for multi-project support.
 *
 * GET  /api/projects.php          → list all projects
 * GET  /api/projects.php?id=X     → get single project
 * POST /api/projects.php          → create project {name, data?}
 * PUT  /api/projects.php?id=X     → update project {name?, data?}
 * DELETE /api/projects.php?id=X   → delete project
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_middleware.php';

$db = getDB();
$currentUser = requireAuth();

$allowedDataKeys = ['tags_page_id', 'default_search_page_id', 'reports_page_id'];

function decodeProjectRow($row) {
    if (isset($row['data']) && is_string($row['data'])) {
        $decoded = json_decode($row['data'], true);
        $row['data'] = is_array($decoded) ? $decoded : new stdClass();
    }
    return $row;
}

function validateDataFields($data, $allowedKeys) {
    if (!is_array($data)) return new stdClass();
    $filtered = [];
    foreach ($data as $key => $value) {
        if (in_array($key, $allowedKeys)) {
            $filtered[$key] = $value;
        }
    }
    return $filtered ?: new stdClass();
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = $_GET['id'] ?? null;

    if ($id) {
        $stmt = $db->prepare('SELECT id, name, data, created_at FROM projects WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            exit;
        }
        // Check access for non-admin users
        if ($currentUser['role'] !== 'admin') {
            $stmt2 = $db->prepare('SELECT id FROM project_access WHERE project_id = :pid AND user_id = :uid');
            $stmt2->execute([':pid' => $id, ':uid' => $currentUser['id']]);
            if (!$stmt2->fetch()) {
                http_response_code(403);
                echo json_encode(['error' => 'Access denied']);
                exit;
            }
        }
        echo json_encode(decodeProjectRow($row), JSON_UNESCAPED_UNICODE);
    } else {
        if ($currentUser['role'] === 'admin') {
            $stmt = $db->query('SELECT id, name, data, created_at FROM projects ORDER BY created_at DESC');
        } else {
            $stmt = $db->prepare('
                SELECT p.id, p.name, p.data, p.created_at
                FROM projects p
                JOIN project_access pa ON pa.project_id = p.id
                WHERE pa.user_id = :uid
                ORDER BY p.created_at DESC
            ');
            $stmt->execute([':uid' => $currentUser['id']]);
        }
        $rows = $stmt->fetchAll();
        $result = array_map('decodeProjectRow', $rows);
        echo json_encode($result, JSON_UNESCAPED_UNICODE);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($currentUser['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $name = $input['name'] ?? 'Без названия';
    $data = validateDataFields($input['data'] ?? [], $allowedDataKeys);
    $dataJson = json_encode($data, JSON_UNESCAPED_UNICODE);

    $stmt = $db->prepare('INSERT INTO projects (name, data) VALUES (:name, :data)');
    $stmt->execute([':name' => $name, ':data' => $dataJson]);

    $newId = $db->lastInsertId();
    $stmt = $db->prepare('SELECT id, name, data, created_at FROM projects WHERE id = :id');
    $stmt->execute([':id' => $newId]);
    $row = $stmt->fetch();

    echo json_encode(decodeProjectRow($row), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    if ($currentUser['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id parameter']);
        exit;
    }

    $stmt = $db->prepare('SELECT id, name, data, created_at FROM projects WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $existing = $stmt->fetch();
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Project not found']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $name = $input['name'] ?? $existing['name'];

    $existingData = json_decode($existing['data'], true) ?: [];
    if (isset($input['data']) && is_array($input['data'])) {
        foreach ($input['data'] as $key => $value) {
            if (in_array($key, $allowedDataKeys)) {
                $existingData[$key] = $value;
            }
        }
    }
    $dataJson = json_encode($existingData ?: new stdClass(), JSON_UNESCAPED_UNICODE);

    $stmt = $db->prepare('UPDATE projects SET name = :name, data = :data WHERE id = :id');
    $stmt->execute([':name' => $name, ':data' => $dataJson, ':id' => $id]);

    $stmt = $db->prepare('SELECT id, name, data, created_at FROM projects WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();

    echo json_encode(decodeProjectRow($row), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if ($currentUser['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
    $id = $_GET['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id parameter']);
        exit;
    }

    $stmt = $db->prepare('SELECT id FROM projects WHERE id = :id');
    $stmt->execute([':id' => $id]);
    if (!$stmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Project not found']);
        exit;
    }

    $stmt = $db->prepare('DELETE FROM projects WHERE id = :id');
    $stmt->execute([':id' => $id]);

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
