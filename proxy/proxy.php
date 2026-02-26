<?php
/**
 * CORS proxy for Yonote API and DeepSeek API.
 *
 * POST /proxy/proxy.php
 * Body: { "url": "https://...", "method": "POST", "headers": {...}, "body": {...}, "noRedirect": false }
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || !isset($input['url'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

$targetUrl = $input['url'];
$method = strtoupper($input['method'] ?? 'POST');
$headers = $input['headers'] ?? [];
$body = $input['body'] ?? null;
$noRedirect = $input['noRedirect'] ?? false;

// Domain whitelist
$allowed = false;
$allowedDomains = ['.yonote.ru', 'api.deepseek.com'];
foreach ($allowedDomains as $domain) {
    if (strpos(parse_url($targetUrl, PHP_URL_HOST), $domain) !== false) {
        $allowed = true;
        break;
    }
}

// Also allow downloading from S3/storage URLs (for export)
$exportDomains = ['storage.yandexcloud.net', 's3.amazonaws.com', '.storage.googleapis.com'];
foreach ($exportDomains as $domain) {
    if (strpos(parse_url($targetUrl, PHP_URL_HOST), $domain) !== false) {
        $allowed = true;
        break;
    }
}

if (!$allowed) {
    http_response_code(403);
    echo json_encode(['error' => 'Domain not allowed: ' . parse_url($targetUrl, PHP_URL_HOST)]);
    exit;
}

// Build cURL request
$ch = curl_init($targetUrl);

$curlHeaders = [];
foreach ($headers as $key => $value) {
    $curlHeaders[] = "$key: $value";
}

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_HTTPHEADER, $curlHeaders);

if ($noRedirect) {
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_HEADER, true);
} else {
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
}

if ($method === 'POST' && $body !== null) {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
} elseif ($method === 'GET') {
    curl_setopt($ch, CURLOPT_HTTPGET, true);
}

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($error) {
    http_response_code(502);
    echo json_encode(['error' => 'cURL error: ' . $error]);
    exit;
}

if ($noRedirect && ($httpCode >= 300 && $httpCode < 400)) {
    $headerSize = strpos($response, "\r\n\r\n");
    $headerStr = substr($response, 0, $headerSize);
    $location = '';
    foreach (explode("\r\n", $headerStr) as $line) {
        if (stripos($line, 'location:') === 0) {
            $location = trim(substr($line, 9));
            break;
        }
    }
    echo json_encode(['location' => $location], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code($httpCode);
$decoded = json_decode($response, true);
if ($decoded !== null) {
    echo $response;
} else {
    // Binary or text content (e.g., markdown export download)
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['_rawText' => $response], JSON_UNESCAPED_UNICODE);
}
