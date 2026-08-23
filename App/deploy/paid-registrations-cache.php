<?php
// Internal writer for paid-registrations-cache.json — called automatically
// by app.js's syncPaidRegistrationsCache() whenever an officer's browser has
// this app open and something paid-status-related changes (a CSV import, a
// detail-modal Status edit, a Walk-In add/edit/delete, a bulk delete). There
// is no PHP port of logic.js's generate()/allRegistrations() pipeline (see
// regenerate()'s comments in app.js) — rather than duplicate that whole
// pipeline server-side, the browser (which already has the fully-computed,
// always-current registration list) pushes a filtered snapshot here, and the
// EXTERNAL-facing paid-registrations-api.php just serves whatever was last
// pushed.
//
// This is the internal half — same PHP-session-or-password dual auth as
// every other Developer-adjacent endpoint (lib.php's carshow_authed()).
// paid-registrations-api.php (the URL handed to another website) is a
// completely separate file with its OWN, narrower credential
// (app-settings.json's externalApiKey) — an external caller never touches
// this file or the site password.
//
// Action: save (only).
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

header('Content-Type: application/json');
require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

if (!carshow_authed($PASSWORD_HASH, $input['password'] ?? ($_POST['password'] ?? ''))) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Incorrect password.']);
    exit;
}

// Per-show data: every request must name the car show year it belongs to.
// index.php appends ?year= to this endpoint's URL in window.__carshowSite;
// callers with no query string (upload-registrations.js) may send it in the
// JSON body instead. An invalid/missing year is a hard 400 rather than a
// default, because guessing would write one show's data into another's.
$year = carshow_valid_year($_GET['year'] ?? ($input['year'] ?? ''));
if ($year === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing or invalid show year.']);
    exit;
}
$cacheFile = carshow_show_file($year, 'paid-registrations-cache.json');
if ($cacheFile === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not open the data directory for ' . $year . '.']);
    exit;
}
$action = (string)($input['action'] ?? 'save');
if ($action !== 'save') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
    exit;
}

$registrations = $input['registrations'] ?? null;
if (!is_array($registrations)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing registrations.']);
    exit;
}

$data = [
    'generatedAt' => gmdate('c'),
    'registrations' => array_values($registrations),
];

if (!carshow_write_json($cacheFile, $data)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not save.']);
    exit;
}

echo json_encode(['ok' => true]);
