<?php
/**
 * Projects API — CRUD scaffold for future multi-project support.
 *
 * GET  /api/projects.php          → list all projects
 * POST /api/projects.php          → create project {name, data?}
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db.php';

$db = getDB();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->query('SELECT id, name, data, created_at FROM projects ORDER BY created_at DESC');
    echo json_encode($stmt->fetchAll(), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $name = $input['name'] ?? 'Без названия';
    $data = json_encode($input['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE);

    $stmt = $db->prepare('INSERT INTO projects (name, data) VALUES (:name, :data)');
    $stmt->execute([':name' => $name, ':data' => $data]);

    echo json_encode(['id' => $db->lastInsertId(), 'name' => $name], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
