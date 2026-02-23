<?php
/**
 * Settings API — CRUD for API keys stored in SQLite.
 *
 * GET  /api/settings.php          → all settings
 * POST /api/settings.php          → save setting {key, value}
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
require_once __DIR__ . '/auth_middleware.php';

$db = getDB();
$currentUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->query('SELECT key, value FROM settings');
    $rows = $stmt->fetchAll();
    $settings = [];
    foreach ($rows as $row) {
        $settings[$row['key']] = $row['value'];
    }
    echo json_encode($settings, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($currentUser['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin access required']);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input || !isset($input['key']) || !isset($input['value'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing key or value']);
        exit;
    }

    $key = $input['key'];
    $value = $input['value'];

    // Only allow known settings keys
    $allowedKeys = ['yonote_api_token', 'yonote_base_url', 'deepseek_api_key'];
    if (!in_array($key, $allowedKeys)) {
        http_response_code(400);
        echo json_encode(['error' => 'Unknown setting key: ' . $key]);
        exit;
    }

    $stmt = $db->prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (:key, :value)');
    $stmt->execute([':key' => $key, ':value' => $value]);

    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
