<?php
// This show's import history (import-history.json, written by
// registrations-upload.php / registrations-import.php / import-schedule.php's
// mark_run). index.php already injects this once at page load via
// ingestImportHistory() — this endpoint lets the History tab refresh it on
// demand (app.js calls it every time that tab is selected) so a
// scheduled/manual import that landed since the page was opened shows up
// without needing a full page reload. Also handles deleting entries (one,
// several, or all) from the History tab's row checkboxes / Delete button.
//
// Actions: list (default), delete.
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Content-Type: application/json');

require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

if (!carshow_authed($PASSWORD_HASH, $input['password'] ?? ($_GET['password'] ?? ''))) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Incorrect password.']);
    exit;
}

$year = carshow_valid_year($_GET['year'] ?? ($input['year'] ?? ''));
if ($year === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing or invalid show year.']);
    exit;
}

$file = carshow_show_file($year, 'import-history.json');
$action = (string)($input['action'] ?? 'list');

if ($action === 'delete') {
    if (!empty($input['all'])) {
        carshow_write_json($file, []);
        echo json_encode(['ok' => true, 'history' => []]);
        exit;
    }
    // Entries have no stable id field (they've been plain
    // timestamp/regRows/actRows/... records since before this delete feature
    // existed), so timestamps are the identity a delete request names —
    // second-precision ISO 8601, unique in practice since two imports never
    // actually complete in the same second. Anything not in the requested
    // list is kept untouched.
    $timestamps = is_array($input['timestamps'] ?? null) ? $input['timestamps'] : [];
    $current = carshow_read_json_list($file);
    $kept = array_values(array_filter($current, function ($e) use ($timestamps) {
        return !in_array(is_array($e) ? ($e['timestamp'] ?? null) : null, $timestamps, true);
    }));
    if (!carshow_write_json($file, $kept)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not save.']);
        exit;
    }
    echo json_encode(['ok' => true, 'history' => $kept]);
    exit;
}

$history = carshow_read_json_list($file);
echo json_encode(['ok' => true, 'history' => $history]);
