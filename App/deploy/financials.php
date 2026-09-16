<?php
// Financials tab (Setup-tab-adjacent, own top-level tab) — a short, manually
// entered (or PDF-upload-parsed — see app.js's handleFinancialsPdfUpload()) summary
// of the show's income/expenses for the year, NOT a transaction ledger. The
// club's real accounting (every Stripe payout, check deposit, vendor line)
// lives in its bookkeeping software and shows up as a full "Account
// Transactions" export when someone needs the detail; this is deliberately
// just the handful of summary categories an officer would want to glance at
// from inside the app (T-Shirts & Dash Plaques, Sponsors, Trophies & Awards,
// Charitable Donations, etc.) with one dollar figure each — either typed in
// by hand, or auto-filled by uploading that detailed report's PDF and
// reviewing what got parsed out of its own "Total <category>" subtotal rows.
//
// Each record is { id, category, type ("income"|"expense"), amount, notes,
// details }. "details" is optional — the individual transaction lines (each
// { date, text, amount }) a category was built from when it came in via
// "Upload Report", kept purely so an officer can expand a category later and
// see what fed it; hand-typed categories simply have an empty details list.
// Stored whole — 'save' replaces the entire list for the year in one shot
// (the Financials tab has no per-row add/delete endpoint of its own; it
// always POSTs its current full set of rows), same "save the whole thing"
// shape app-settings.php uses, simpler than a real per-row API for a list an
// officer edits a few times a year.
//
// Actions: list (default), save, save_report, list_reports, load_report,
// delete_report.
//
// "Reports" (save_report/list_reports/load_report) are a separate, append-
// only history of named snapshots — a whole copy of the current items list
// plus a label and timestamp — stored in its own financials-reports.json so
// an officer can save "as of" points (e.g. right after each PDF import) and
// come back to any of them later without the live edits in progress
// overwriting that history.
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

// Per-show data: every request must name the car show year it belongs to —
// same reasoning as every other per-show endpoint here (index.php appends
// ?year= to this URL in window.__carshowSite).
$year = carshow_valid_year($_GET['year'] ?? ($input['year'] ?? ''));
if ($year === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing or invalid show year.']);
    exit;
}
$file = carshow_show_file($year, 'financials.json');
if ($file === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not open the data directory for ' . $year . '.']);
    exit;
}
$action = (string)($input['action'] ?? 'list');

if ($action === 'list') {
    echo json_encode(['ok' => true, 'items' => carshow_read_json_list($file)]);
    exit;
}

if ($action === 'save') {
    $items = $input['items'] ?? null;
    if (!is_array($items)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Missing items.']);
        exit;
    }
    $clean = financials_clean_items($items);
    if (!carshow_write_json($file, $clean)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not save.']);
        exit;
    }
    echo json_encode(['ok' => true, 'items' => $clean]);
    exit;
}

$reportsFile = carshow_show_file($year, 'financials-reports.json');
if ($reportsFile === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not open the data directory for ' . $year . '.']);
    exit;
}

function financials_clean_details($details) {
    $clean = [];
    foreach ((array)$details as $d) {
        if (!is_array($d)) continue;
        $text = trim((string)($d['text'] ?? ''));
        $date = trim((string)($d['date'] ?? ''));
        if ($text === '' && $date === '' && ($d['amount'] ?? null) === null) continue; // fully blank row
        $clean[] = [
            'date' => $date,
            'text' => $text,
            'amount' => ($d['amount'] ?? null) === null ? null : round((float)$d['amount'], 2),
        ];
    }
    return $clean;
}

function financials_clean_items($items) {
    $clean = [];
    foreach ((array)$items as $item) {
        if (!is_array($item)) continue;
        $category = trim((string)($item['category'] ?? ''));
        if ($category === '') continue;
        $type = (string)($item['type'] ?? 'expense');
        if ($type !== 'income' && $type !== 'expense') $type = 'expense';
        $clean[] = [
            'id' => (string)($item['id'] ?? ('fin' . str_replace('.', '', uniqid('', true)))),
            'category' => $category,
            'type' => $type,
            'amount' => round((float)($item['amount'] ?? 0), 2),
            'notes' => trim((string)($item['notes'] ?? '')),
            'details' => financials_clean_details($item['details'] ?? null),
        ];
    }
    return $clean;
}

if ($action === 'save_report') {
    $clean = financials_clean_items($input['items'] ?? null);
    if (!$clean) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Nothing to save — add at least one line item first.']);
        exit;
    }
    $label = trim((string)($input['label'] ?? ''));
    if ($label === '') $label = 'Report';
    $reports = carshow_read_json_list($reportsFile);
    $reports[] = [
        'id' => 'rpt' . str_replace('.', '', uniqid('', true)),
        'label' => $label,
        'savedAt' => gmdate('c'),
        'items' => $clean,
    ];
    if (!carshow_write_json($reportsFile, $reports)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not save report.']);
        exit;
    }
    echo json_encode(['ok' => true, 'reports' => $reports]);
    exit;
}

if ($action === 'list_reports') {
    echo json_encode(['ok' => true, 'reports' => carshow_read_json_list($reportsFile)]);
    exit;
}

if ($action === 'load_report') {
    $id = (string)($input['id'] ?? '');
    $reports = carshow_read_json_list($reportsFile);
    $found = null;
    foreach ($reports as $r) {
        if (is_array($r) && (string)($r['id'] ?? '') === $id) { $found = $r; break; }
    }
    if ($found === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'That saved report could not be found.']);
        exit;
    }
    echo json_encode(['ok' => true, 'report' => $found]);
    exit;
}

if ($action === 'delete_report') {
    $id = (string)($input['id'] ?? '');
    $reports = carshow_read_json_list($reportsFile);
    $remaining = array_values(array_filter($reports, function ($r) use ($id) {
        return !(is_array($r) && (string)($r['id'] ?? '') === $id);
    }));
    if (count($remaining) === count($reports)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'That saved report could not be found.']);
        exit;
    }
    if (!carshow_write_json($reportsFile, $remaining)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not delete report.']);
        exit;
    }
    echo json_encode(['ok' => true, 'reports' => $remaining]);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
