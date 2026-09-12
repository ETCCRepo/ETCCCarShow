<?php
// Authenticated endpoint that stores the current Registration/Activity CSV
// pair server-side (registrations-data.json, gitignored, contains PII).
// index.php reads this file fresh on every request, so uploading here makes
// the hosted site's registration data live for the very next page load —
// no node build.js / ftp-deploy.sh cycle needed just to refresh data (that
// flow still applies for actual code changes).
//
// Meant to be called by deploy/upload-registrations.js after exporting
// fresh CSVs from ClubExpress (see that script and README.md), not by the
// browser app directly. Same dual auth as sponsor-submissions.php: PHP
// session (same-origin) or password in the request body.
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Content-Type: application/json');

require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

if (!carshow_authed($PASSWORD_HASH, $input['password'] ?? '')) {
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
$regFile = carshow_show_file($year, 'registrations-data.json');
if ($regFile === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not open the data directory for ' . $year . '.']);
    exit;
}
$regCsv = (string)($input['regCsv'] ?? '');
$actCsv = (string)($input['actCsv'] ?? '');
if ($regCsv === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'regCsv is required.']);
    exit;
}

$generatedAt = isset($input['generatedAt']) ? (int)$input['generatedAt'] : (int)(microtime(true) * 1000);

$data = [
    'regCsv' => $regCsv,
    'actCsv' => $actCsv,
    'generatedAt' => $generatedAt,
    'uploadedAt' => gmdate('c'),
];

if (!carshow_write_json($regFile, $data)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not save.']);
    exit;
}

// Log this import for the History tab — one entry per successful import,
// CLI or browser (see registrations-import.php), oldest first. eventUrl: the
// caller (deploy/upload-registrations.js) may pass the ClubExpress URL it
// actually exported from; if it didn't, fall back to whatever's currently
// configured in the Setup tab (app-settings.json) as a best-effort record —
// right in the common case where nothing's changed since the export.
$eventUrl = (string)($input['eventUrl'] ?? '');
if ($eventUrl === '') {
    $settingsFile = carshow_show_file($year, 'app-settings.json');
    $settingsRaw = is_file($settingsFile) ? json_decode(file_get_contents($settingsFile), true) : [];
    $eventUrl = is_array($settingsRaw) ? (string)($settingsRaw['eventUrl'] ?? '') : '';
}
// logFile: the caller may pass the exact filename it archived this run's log
// under via logs.php (see ETCCCarShowImportData's SKILL.md) — the History
// tab's 📄 icon links to that server-side copy. Absent for anything else
// that calls this endpoint directly without going through that skill.
$logFile = (string)($input['logFile'] ?? '');
$historyFile = carshow_show_file($year, 'import-history.json');
carshow_append_json_list($historyFile, [
    'timestamp' => gmdate('c'),
    'regRows' => carshow_csv_data_row_count($regCsv),
    'actRows' => carshow_csv_data_row_count($actCsv),
    'source' => 'cli',
    'eventUrl' => $eventUrl,
    'outcome' => 'success',
    'logFile' => $logFile,
]);

echo json_encode(['ok' => true]);
