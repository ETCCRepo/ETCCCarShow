<?php
// Read-only list of this show's import history (import-history.json,
// written by registrations-upload.php / registrations-import.php /
// import-schedule.php's mark_run). index.php already injects this once at
// page load via ingestImportHistory() — this endpoint lets the History tab
// refresh it on demand (app.js calls it every time that tab is selected) so
// a scheduled/manual import that landed since the page was opened shows up
// without needing a full page reload.
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

$history = carshow_read_json_list(carshow_show_file($year, 'import-history.json'));
echo json_encode(['ok' => true, 'history' => $history]);
