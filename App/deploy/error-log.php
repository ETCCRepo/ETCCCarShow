<?php
// Setup tab > "View Error Log" — the raw text of PHP's own error log for
// this app, written to by every endpoint that requires lib.php (see that
// file's carshow_error_log_path()/ini_set() calls near its top). Not
// per-show-year (unlike logs.php's import logs) — a PHP fatal in, say,
// sponsor-submissions.php has nothing to do with any one car show, so this
// is one file for the whole app.
//
// Action: get (browser, session-or-password) — raw text, most recent lines
// last (tail-style), capped so one huge log can't blow up the response.
session_start();

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];

if (!carshow_authed($PASSWORD_HASH, $input['password'] ?? ($_GET['password'] ?? ''))) {
    http_response_code(401);
    header('Content-Type: text/plain');
    echo 'Incorrect password.';
    exit;
}

header('Content-Type: text/plain; charset=utf-8');

$path = carshow_error_log_path();
if ($path === null || !is_file($path)) {
    echo "No errors logged yet.";
    exit;
}

// Cap what's read, not just what's shown — a runaway log (e.g. a fatal
// error looping every request) shouldn't turn this into a multi-megabyte
// download. Reads the TAIL (most recent) by seeking from the end, since
// the newest entries are what matter for "is something broken right now".
$maxBytes = 500000;
$size = filesize($path);
$fh = fopen($path, 'rb');
if ($fh === false) {
    echo "Could not open the error log.";
    exit;
}
$truncated = $size > $maxBytes;
if ($truncated) fseek($fh, -$maxBytes, SEEK_END);
$text = stream_get_contents($fh);
fclose($fh);

if ($truncated) {
    // Drop a possibly-partial first line left over from seeking mid-file.
    $nl = strpos($text, "\n");
    $text = ($nl === false) ? $text : substr($text, $nl + 1);
    echo "...(earlier entries truncated)...\n";
}
echo $text === '' ? "No errors logged yet." : $text;
