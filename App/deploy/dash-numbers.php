<?php
// Judging-day "Dash #" placard numbers — dash-numbers.json is a flat object,
// rowKey(rec) -> integer dash number (see app.js's rowKey()/ensureDashNumbers()),
// NOT a list. A car's dash number is assigned once, the first time its window
// card is printed (or the Tally Sheet is generated on demand), and then never
// changes — it's the number physically written on the car's window card, so
// it has to stay stable across reprints and across every later page load.
//
// Numbers are grouped by generation in blocks of 100 (C1 = 100-199, C2 =
// 200-299, ... C8 = 800-899, matching the club's paper Tally Sheet template)
// — app.js computes the actual numbers; this endpoint only ever persists
// whatever it's given.
//
// Actions: list (default), assign.
//
// Auth via lib.php's carshow_authed() — same PHP-session-or-password dual
// check every endpoint here uses.
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
// index.php appends ?year= to this endpoint's URL in window.__carshowSite.
// An invalid/missing year is a hard 400 rather than a default, because
// guessing would write one show's dash numbers into another's.
$year = carshow_valid_year($_GET['year'] ?? ($input['year'] ?? ''));
if ($year === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing or invalid show year.']);
    exit;
}
$file = carshow_show_file($year, 'dash-numbers.json');
if ($file === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not open the data directory for ' . $year . '.']);
    exit;
}
$action = (string)($input['action'] ?? 'list');

function dn_read_map($file) {
    if (!is_file($file)) return [];
    $raw = file_get_contents($file);
    $decoded = $raw ? json_decode($raw, true) : [];
    return is_array($decoded) ? $decoded : [];
}

if ($action === 'list') {
    echo json_encode(['ok' => true, 'dashNumbers' => dn_read_map($file)]);
    exit;
}

// Merges a batch of new assignments into the map — used both for the bulk
// assignment that happens when window cards are printed (many rows at once,
// one round trip) and for a single manual correction. Never removes an
// existing key: once a number is on a printed card it stays reserved even if
// this call is retried or overlaps with another officer's browser.
if ($action === 'assign') {
    $assignments = $input['assignments'] ?? null;
    if (!is_array($assignments) || !$assignments) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing assignments.']);
        exit;
    }
    $map = dn_read_map($file);
    foreach ($assignments as $key => $num) {
        $key = (string)$key;
        if ($key === '' || !is_numeric($num)) continue;
        $map[$key] = (int)$num;
    }
    if (!carshow_write_json($file, $map)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not save.']);
        exit;
    }
    echo json_encode(['ok' => true, 'dashNumbers' => $map]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
