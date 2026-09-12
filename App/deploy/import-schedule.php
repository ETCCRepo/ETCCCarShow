<?php
// Bridges the Setup tab's Import Schedule UI (Event URL, the auto-import
// enable/times/date-range settings, and the "Import Now" button) to the
// actual automation — which is a Claude Code scheduled task running on an
// officer's own machine, driving their real Chrome through ClubExpress. This
// endpoint cannot run a browser itself; it only leaves/reads a signal that
// task polls every 5 minutes.
//
// eventUrl / autoImportEnabled / autoImportTimes / autoImportStartDate /
// autoImportEndDate themselves live in app-settings.json (see
// app-settings.php's own defaults/comments) — this file only handles the
// "Import Now" request flag (import-request.json) and the "has this
// slot/request already run" bookkeeping (import-schedule-state.json), both
// per-show, plus the actual should-it-run-right-now decision.
//
// Actions:
//   request   (browser, PHP-session auth)  — officer clicked "Import Now".
//   check     (script, site-password auth) — "is there anything to run now?"
//   mark_run  (script, site-password auth) — "I just ran it for this reason."
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Content-Type: application/json');

require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

// Matches ClubExpress's own displayed event timezone, so an officer typing
// "9:00 AM" in the Setup tab means the same 9:00 AM the scheduled task acts on.
date_default_timezone_set('America/New_York');

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

$action = (string)($input['action'] ?? '');
$year = carshow_valid_year($_GET['year'] ?? ($input['year'] ?? ''));
if ($year === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing or invalid show year.']);
    exit;
}

$requestFile = carshow_show_file($year, 'import-request.json');
$stateFile = carshow_show_file($year, 'import-schedule-state.json');
if ($requestFile === null || $stateFile === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not open the data directory for ' . $year . '.']);
    exit;
}

if ($action === 'request') {
    // Same-origin button click — the PHP session is the only auth this
    // needs, same as every other Setup-tab officer action.
    if (empty($_SESSION['carshow_authenticated'])) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Please log in first.']);
        exit;
    }
    $now = gmdate('c');
    if (!carshow_write_json($requestFile, ['requestedAt' => $now, 'handledAt' => null])) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not save the request.']);
        exit;
    }
    echo json_encode(['ok' => true, 'requestedAt' => $now]);
    exit;
}

// 'check' and 'mark_run' are called by the scheduled-task script, not the
// browser — same site-password auth as upload-registrations.js /
// registrations-upload.php (no PHP session exists for a standalone script).
if ($action === 'check' || $action === 'mark_run') {
    if (!carshow_authed($PASSWORD_HASH, $input['password'] ?? '')) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Incorrect password.']);
        exit;
    }
} else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
    exit;
}

$settingsFile = carshow_show_file($year, 'app-settings.json');
$settingsRaw = is_file($settingsFile) ? json_decode(file_get_contents($settingsFile), true) : [];
$settings = is_array($settingsRaw) ? $settingsRaw : [];
$eventUrl = (string)($settings['eventUrl'] ?? '');
$autoImportEnabled = !empty($settings['autoImportEnabled']);
$autoImportTimes = is_array($settings['autoImportTimes'] ?? null) ? $settings['autoImportTimes'] : [];
$startDate = (string)($settings['autoImportStartDate'] ?? '');
$endDate = (string)($settings['autoImportEndDate'] ?? '');

$request = is_file($requestFile) ? json_decode(file_get_contents($requestFile), true) : null;
// Pending = a request exists and hasn't been handled since it was made (a
// fresh "Import Now" click after an old one was already handled counts as a
// new pending request, since requestedAt moves forward each click).
$pending = is_array($request) && !empty($request['requestedAt'])
    && (empty($request['handledAt']) || strtotime($request['handledAt']) < strtotime($request['requestedAt']));

if ($action === 'check') {
    $shouldRun = false;
    $reason = 'none';
    $today = date('Y-m-d');

    if ($pending) {
        $shouldRun = true;
        $reason = 'manual';
    } elseif ($autoImportEnabled && $autoImportTimes
        && ($startDate === '' || $today >= $startDate)
        && ($endDate === '' || $today <= $endDate)) {
        $nowMinutes = ((int)date('H')) * 60 + (int)date('i');

        $stateRaw = is_file($stateFile) ? json_decode(file_get_contents($stateFile), true) : [];
        $state = is_array($stateRaw) ? $stateRaw : [];
        $ranSlots = ($state['date'] ?? '') === $today && is_array($state['ranSlots'] ?? null) ? $state['ranSlots'] : [];

        foreach ($autoImportTimes as $t) {
            if (!preg_match('/^([0-2][0-9]):([0-5][0-9])$/', (string)$t, $m)) continue;
            $slotMinutes = ((int)$m[1]) * 60 + (int)$m[2];
            // Tolerance wider than the 5-minute poll interval itself, to
            // absorb the scheduled task's own start-time jitter.
            if (abs($nowMinutes - $slotMinutes) <= 6 && !in_array($t, $ranSlots, true)) {
                $shouldRun = true;
                $reason = 'scheduled:' . $t;
                break;
            }
        }
    }

    echo json_encode(['ok' => true, 'shouldRun' => $shouldRun, 'reason' => $reason, 'eventUrl' => $eventUrl]);
    exit;
}

// mark_run — records that a run just happened for the given reason, so the
// next poll doesn't fire it again (a handled manual request, or today's slot).
$reason = (string)($input['reason'] ?? '');
if ($reason === 'manual') {
    if (is_array($request)) {
        $request['handledAt'] = gmdate('c');
        carshow_write_json($requestFile, $request);
    }
} elseif (strpos($reason, 'scheduled:') === 0) {
    $slot = substr($reason, strlen('scheduled:'));
    $today = date('Y-m-d');
    $stateRaw = is_file($stateFile) ? json_decode(file_get_contents($stateFile), true) : [];
    $state = is_array($stateRaw) ? $stateRaw : [];
    $ranSlots = ($state['date'] ?? '') === $today && is_array($state['ranSlots'] ?? null) ? $state['ranSlots'] : [];
    if (!in_array($slot, $ranSlots, true)) $ranSlots[] = $slot;
    carshow_write_json($stateFile, ['date' => $today, 'ranSlots' => $ranSlots]);
} else {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown reason.']);
    exit;
}
echo json_encode(['ok' => true]);
