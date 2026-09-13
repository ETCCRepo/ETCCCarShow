<?php
// JSON read of member-import-history.json (see members-import.php, which is
// the only thing that writes to it, and lib.php's carshow_member_import_log_file())
// for the Setup tab's "View Log" toggle in the main app — members-import.php
// itself already shows this same log inline on its own standalone page, but
// that page requires navigating away from the app; this lets the Setup tab
// show it without leaving. Global (not per-year), same as the roster itself.
//
// Action: list (only one — this is read-only, no delete/write here).
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

echo json_encode(['ok' => true, 'history' => carshow_read_json_list(carshow_member_import_log_file())]);
