<?php
// Shared helpers for the deploy/ PHP endpoints (index.php,
// member-sponsor-form.php, public-sponsor-form.php, sponsor-submissions.php,
// registrations-upload.php). Centralizes the auth
// check, lock-guarded JSON read/write, and safe-inline-script-embedding
// logic that would otherwise be copy-pasted across four files.

// True if either the current PHP session is already authenticated (the
// normal case for same-origin calls made from the hosted page itself, e.g.
// sponsor edits from the Sponsors tab while logged in) or the request
// supplied a password matching secrets.php's hash (the normal case for
// calls with no shared session, e.g. the offline tool's cross-origin
// "Import from Server").
function carshow_authed($passwordHash, $providedPassword) {
    if (!empty($_SESSION['carshow_authenticated'])) return true;
    $pw = (string)$providedPassword;
    return $pw !== '' && hash_equals($passwordHash, crypt($pw, $passwordHash));
}

function carshow_read_json_list($file) {
    if ($file === null || !is_file($file)) return [];
    $raw = file_get_contents($file);
    $decoded = $raw ? json_decode($raw, true) : [];
    return is_array($decoded) ? $decoded : [];
}

// Lock-guarded overwrite so a public form submission and an officer's edit
// landing at nearly the same moment can't clobber each other.
function carshow_write_json($file, $value) {
    if ($file === null) return false;
    $fh = fopen($file, 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if ($fh) fclose($fh);
        return false;
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($value, JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

// Counts data rows in a CSV string (excludes the header line and any blank
// trailing lines). Shared by registrations-upload.php (CLI path, has the CSV
// as an in-memory string) and registrations-import.php (browser path, reads
// the uploaded file into a string first) so both log identical counts to
// import-history.json regardless of which path did the import.
function carshow_csv_data_row_count($csv) {
    if (!is_string($csv) || trim($csv) === '') return 0;
    $lines = preg_split('/\r\n|\r|\n/', $csv);
    $count = 0;
    foreach (array_slice($lines, 1) as $line) {
        if (trim($line) !== '') $count++;
    }
    return $count;
}

// Appends one record to a JSON-array file under the same lock (read +
// modify + write as one atomic step, so a concurrent append can't be lost).
function carshow_append_json_list($file, $record) {
    if ($file === null) return false;
    $fh = fopen($file, 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if ($fh) fclose($fh);
        return false;
    }
    $size = filesize($file) ?: 0;
    $raw = $size > 0 ? fread($fh, $size) : '';
    $list = $raw ? json_decode($raw, true) : [];
    if (!is_array($list)) $list = [];
    $list[] = $record;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($list, JSON_PRETTY_PRINT));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

// Encodes a PHP value as JSON safe to embed inside an inline <script> block:
// guards the two line-terminator code points JSON leaves unescaped but that
// choke some JS engines inside string literals, and neutralizes "</script"
// so real data containing that literal substring (e.g. a pasted comment)
// can't prematurely close the tag.
function carshow_safe_inline_json($value) {
    $json = json_encode($value);
    $json = str_replace(["\xE2\x80\xA8", "\xE2\x80\xA9"], ['\\u2028', '\\u2029'], $json);
    $json = str_ireplace('</script', '<\\/script', $json);
    return $json;
}

// Minimal SMTP client (AUTH LOGIN, implicit TLS on 465 or STARTTLS on 587) —
// used instead of PHP's raw mail(), which was observed returning success
// while silently failing to actually deliver to Gmail from this Hostinger
// account (no SPF/DKIM behind mail()'s local sendmail path; mail()'s return
// value only confirms local hand-off, not delivery). No external
// library/Composer — self-contained, matching every other deploy/ endpoint.
// Credentials come from secrets.php's $SMTP_* vars; returns false (caller
// should show an error) if they're not configured or sending fails at any
// step of the conversation.
// Splits a comma/semicolon-separated string into validated email addresses,
// silently dropping anything that fails FILTER_VALIDATE_EMAIL. Used for
// settings-driven To/CC/BCC fields that may hold multiple addresses (e.g.
// the New Sponsor Confirmation Email settings card).
function carshow_parse_addr_list($raw) {
    if (!is_string($raw) || trim($raw) === '') return [];
    $out = [];
    foreach (preg_split('/[,;]+/', $raw) as $part) {
        $part = trim($part);
        if ($part !== '' && filter_var($part, FILTER_VALIDATE_EMAIL)) $out[] = $part;
    }
    return $out;
}

function carshow_send_mail($to, $subject, $body, $cc = '', $bcc = '', $html = false) {
    // Plain require (not require_once): require_once tracks inclusion by
    // resolved file path regardless of scope, so if some other code in this
    // request already required secrets.php, require_once here would
    // silently no-op and leave these locals undefined. secrets.php is just
    // variable assignments, so re-running it is harmless.
    $secretsFile = __DIR__ . '/secrets.php';
    if (is_file($secretsFile)) require $secretsFile;
    if (empty($SMTP_HOST) || empty($SMTP_USER) || empty($SMTP_PASS)) return false;

    $port = !empty($SMTP_PORT) ? (int)$SMTP_PORT : 465;
    $from = !empty($SMTP_FROM) ? $SMTP_FROM : $SMTP_USER;
    $target = ($port === 465 ? 'ssl://' : '') . $SMTP_HOST . ':' . $port;

    $sock = @stream_socket_client($target, $errno, $errstr, 15);
    if (!$sock) return false;
    stream_set_timeout($sock, 15);

    // Reads a full (possibly multi-line) reply: SMTP marks the final line of
    // a multi-line response with a space in the 4th column (e.g. "250 OK"
    // vs "250-continues"); anything else means keep reading.
    $read = function () use ($sock) {
        $data = '';
        while (($line = fgets($sock, 515)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $data;
    };
    $write = function ($cmd) use ($sock) { fwrite($sock, $cmd . "\r\n"); };
    $expect = function ($code) use ($read) { return strpos($read(), (string)$code) === 0; };
    $fail = function () use ($sock) { fclose($sock); return false; };

    $read(); // server greeting
    $write('EHLO etccapps.com');
    $read();

    if ($port !== 465) {
        $write('STARTTLS');
        if (!$expect(220)) return $fail();
        if (!stream_socket_enable_crypto($sock, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) return $fail();
        $write('EHLO etccapps.com');
        $read();
    }

    $write('AUTH LOGIN');
    if (!$expect(334)) return $fail();
    $write(base64_encode($SMTP_USER));
    if (!$expect(334)) return $fail();
    $write(base64_encode($SMTP_PASS));
    if (!$expect(235)) return $fail();

    $write('MAIL FROM:<' . $from . '>');
    if (!$expect(250)) return $fail();
    // $to may be a single address (every pre-existing caller) or a
    // comma/semicolon-separated list (settings-driven callers).
    $toList = carshow_parse_addr_list($to);
    if (!$toList && filter_var(trim((string)$to), FILTER_VALIDATE_EMAIL)) $toList = [trim($to)];
    if (!$toList) return $fail();
    foreach ($toList as $toEmail) {
        $write('RCPT TO:<' . $toEmail . '>');
        if (!$expect(250)) return $fail();
    }

    // Add CC recipients
    if (!empty($cc)) {
        $ccList = array_map('trim', explode(',', $cc));
        foreach ($ccList as $ccEmail) {
            if (!empty($ccEmail)) {
                $write('RCPT TO:<' . $ccEmail . '>');
                if (!$expect(250)) return $fail();
            }
        }
    }

    // Add BCC recipients
    if (!empty($bcc)) {
        $bccList = array_map('trim', explode(',', $bcc));
        foreach ($bccList as $bccEmail) {
            if (!empty($bccEmail)) {
                $write('RCPT TO:<' . $bccEmail . '>');
                if (!$expect(250)) return $fail();
            }
        }
    }

    $write('DATA');
    if (!$expect(354)) return $fail();

    $headers = "From: {$from}\r\nTo: " . implode(', ', $toList) . "\r\n";
    if (!empty($cc)) $headers .= "Cc: {$cc}\r\n";
    $contentType = $html ? 'text/html' : 'text/plain';
    $headers .= "Subject: {$subject}\r\n" .
        "MIME-Version: 1.0\r\nContent-Type: {$contentType}; charset=UTF-8\r\n";
    // Dot-stuffing: a line starting with "." in the body must be escaped to
    // ".." or the SMTP server reads it as the end-of-DATA terminator.
    $safeBody = preg_replace('/^\./m', '..', $body);
    $write($headers . "\r\n" . $safeBody . "\r\n.");
    $ok = $expect(250);
    $write('QUIT');
    fclose($sock);
    return $ok;
}

// ---------------------------------------------------------------------------
// Multi-show (per-year) data paths
// ---------------------------------------------------------------------------
// Every car show year gets its own directory under data/, so 2026's sponsors,
// registrations, payments etc. are completely independent of 2027's. Nothing
// outside these three helpers is allowed to build a data path — a single
// choke point is what keeps a bad ?year= from ever reaching the filesystem.

// Strict 4-digit validation. Returns the year as a string, or null. A caller
// that gets null MUST fail the request outright: silently defaulting to some
// other year would write one show's data into another show's files, which is
// far worse than a visible 400.
function carshow_valid_year($raw) {
    $y = trim((string)$raw);
    return preg_match('/^[0-9]{4}$/', $y) === 1 ? $y : null;
}

// data/ itself. Created on demand, with a deny-all .htaccess dropped in the
// first time — so the JSON under it is protected even if the parent
// directory's .htaccess rules are ever lost or overridden by the host.
function carshow_data_root() {
    $root = __DIR__ . '/data';
    if (!is_dir($root) && !@mkdir($root, 0755, true) && !is_dir($root)) return null;
    $deny = $root . '/.htaccess';
    if (!is_file($deny)) {
        @file_put_contents($deny,
            "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    return $root;
}

// data/<year>/, created on demand. Returns null if the year is invalid or the
// directory can't be created (e.g. no write permission on the FTP root) —
// callers surface that as an error rather than writing somewhere unexpected.
function carshow_show_dir($year) {
    $y = carshow_valid_year($year);
    if ($y === null) return null;
    $root = carshow_data_root();
    if ($root === null) return null;
    $dir = $root . '/' . $y;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) return null;
    return $dir;
}

// Full path to one per-year data file, e.g.
// carshow_show_file('2026', 'sponsor-submissions.json').
function carshow_show_file($year, $name) {
    $dir = carshow_show_dir($year);
    return $dir === null ? null : $dir . '/' . $name;
}

// The shows registry: { "current": 2026, "shows": [ {year,name,status,created}, ... ] }.
// An object rather than a list, so it gets its own reader (same reason
// registration-overrides.php has one).
function carshow_shows_path() {
    $root = carshow_data_root();
    return $root === null ? null : $root . '/shows.json';
}

function carshow_read_shows() {
    $path = carshow_shows_path();
    $raw = ($path !== null && is_file($path)) ? json_decode(file_get_contents($path), true) : null;
    if (!is_array($raw)) $raw = [];
    $shows = isset($raw['shows']) && is_array($raw['shows']) ? array_values($raw['shows']) : [];
    $current = carshow_valid_year($raw['current'] ?? '');
    return ['shows' => $shows, 'current' => $current];
}

function carshow_write_shows($registry) {
    $path = carshow_shows_path();
    if ($path === null) return false;
    return carshow_write_json($path, [
        'current' => $registry['current'] ?? null,
        'shows'   => array_values($registry['shows'] ?? [])
    ]);
}

// True if $year names a show that actually exists in the registry. Opening a
// year that was never created (or was deleted) must not silently conjure an
// empty one, so index.php checks this before honouring ?year=.
function carshow_show_exists($year, $registry = null) {
    $y = carshow_valid_year($year);
    if ($y === null) return false;
    if ($registry === null) $registry = carshow_read_shows();
    foreach ($registry['shows'] as $s) {
        if (carshow_valid_year($s['year'] ?? '') === $y) return true;
    }
    return false;
}

// Log of every member-roster import (members-import.php), one entry per
// successful upload: { timestamp, count }. Global, not per-show, same
// reasoning as members-data.json itself (lib.php's own comment on
// carshow_show_files() — the roster is global, so its import log is too).
function carshow_member_import_log_file() {
    $root = carshow_data_root();
    return $root === null ? null : $root . '/member-import-history.json';
}

// The externalApiKey is deliberately NOT per-year: paid-registrations-api.php
// is an external integration whose credential must stay stable when the club
// rolls over to a new show. Lives in data/api-key.json, generated on first use.
function carshow_api_key() {
    $root = carshow_data_root();
    if ($root === null) return '';
    $file = $root . '/api-key.json';
    $raw = is_file($file) ? json_decode(file_get_contents($file), true) : null;
    if (is_array($raw) && !empty($raw['externalApiKey'])) return (string)$raw['externalApiKey'];
    $key = bin2hex(random_bytes(16));
    carshow_write_json($file, ['externalApiKey' => $key]);
    return $key;
}

// Per-year window card. Unlike everything else here this stays flat at the
// FTP root rather than moving under data/, because it's the one file that is
// deliberately fetchable over plain HTTP (the app pulls it with fetch() and
// fills its AcroForm client-side with pdf-lib) — putting it behind the data/
// deny rule would mean writing a PHP reader for no benefit.
function carshow_window_card_name($year) {
    $y = carshow_valid_year($year);
    return $y === null ? null : 'window-card-' . $y . '.pdf';
}

// ---------------------------------------------------------------------------
// One-shot migration: flat single-show layout -> data/<year>/
// ---------------------------------------------------------------------------
// The app shipped for its whole life with one show's data as flat *.json in
// this directory. This folds that into data/2026/ the first time the
// multi-show build runs, and is then permanently a no-op.
//
// Deliberately non-destructive: every legacy file is COPIED, never moved or
// deleted, so redeploying the previous build finds its data exactly where it
// left it. Guarded on data/shows.json's existence (the same guard style as
// SilentAuctionManager's migrateToMultiAuction) so it can never run twice —
// note the guard is the registry file, not the data directory, because a
// half-created data/ from a failed run must still be completable.

define('CARSHOW_LEGACY_YEAR', '2026');

// The per-show data files. This list is the definition of "what belongs to a
// show" — members-data.json (club roster), password-reset.json and
// dev-password-reset.json (auth) are global and deliberately absent.
function carshow_show_files() {
    return [
        'sponsor-submissions.json',
        'sponsor-payments.json',
        'deleted-sponsors.json',
        'deleted-registrations.json',
        'walkin-registrations.json',
        'tshirt-purchases.json',
        'registration-overrides.json',
        'registrations-data.json',
        'paid-registrations-cache.json',
        'app-settings.json',
        'dash-numbers.json',
        'import-history.json',
        'import-request.json',
        'import-schedule-state.json',
        'import-run-status.json'
    ];
}

// ---------------------------------------------------------------------------
// Backups (Setup tab > Backups; see backup.php)
// ---------------------------------------------------------------------------
// Shared here (rather than living only in backup.php) so import-schedule.php
// can call carshow_backup_auto_check() from its own 'check' action without
// requiring the whole of backup.php (which would also execute that file's
// top-level action dispatch).

// Keep at most this many zip files on disk — see carshow_backup_purge().
define('CARSHOW_BACKUP_KEEP', 30);

// backups/ itself. Created on demand, deny-all like every other data
// directory in this app — defense in depth even though every caller already
// gates on carshow_authed() before reaching any of this.
function carshow_backups_dir() {
    $dir = __DIR__ . '/backups';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) return null;
    $deny = $dir . '/.htaccess';
    if (!is_file($deny)) {
        @file_put_contents($deny,
            "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    return $dir;
}

function carshow_backup_history_file() {
    $dir = carshow_backups_dir();
    return $dir === null ? null : $dir . '/backup-history.json';
}

// Global (not per-year) auto-backup settings: { enabled, startDate, endDate,
// lastAutoRunDate }. Lives under data/ alongside shows.json/api-key.json —
// see carshow_data_root() — since backups span every show year, not one.
function carshow_backup_schedule_path() {
    $root = carshow_data_root();
    return $root === null ? null : $root . '/backup-schedule.json';
}
function carshow_read_backup_schedule() {
    $path = carshow_backup_schedule_path();
    $raw = ($path !== null && is_file($path)) ? json_decode(file_get_contents($path), true) : null;
    $s = is_array($raw) ? $raw : [];
    return [
        'enabled' => !empty($s['enabled']),
        'startDate' => (string)($s['startDate'] ?? ''),
        'endDate' => (string)($s['endDate'] ?? ''),
        // Server-owned bookkeeping (see carshow_backup_auto_check()) — a
        // save from the Setup tab must preserve this, never set it directly.
        'lastAutoRunDate' => (string)($s['lastAutoRunDate'] ?? ''),
    ];
}
function carshow_write_backup_schedule($schedule) {
    $path = carshow_backup_schedule_path();
    return $path === null ? false : carshow_write_json($path, $schedule);
}

// Adds every file under $dir to $zip, recursively, nested under $zipPrefix
// inside the archive (so the whole data/ tree lands at "data/..." in the
// zip, exactly matching its layout on the server).
function carshow_zip_add_dir($zip, $dir, $zipPrefix) {
    if (!is_dir($dir)) return;
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY
    );
    foreach ($items as $item) {
        $relative = substr($item->getPathname(), strlen($dir) + 1);
        $zipPath = str_replace('\\', '/', $zipPrefix . '/' . $relative);
        $zip->addFile($item->getPathname(), $zipPath);
    }
}

// Keeps only the newest $keep zip files on disk (oldest deleted first).
// max(1, ...) is a hard floor, independent of whatever CARSHOW_BACKUP_KEEP
// happens to be set to: the most recent backup is NEVER deleted, so the
// server is never left with zero backups even if that constant were ever
// misconfigured to 0.
function carshow_backup_purge($dir, $keep) {
    $keep = max(1, (int)$keep);
    $files = glob($dir . '/*.zip') ?: [];
    if (count($files) <= $keep) return;
    usort($files, function ($a, $b) { return filemtime($a) - filemtime($b); });
    foreach (array_slice($files, 0, count($files) - $keep) as $f) @unlink($f);
}

// How many backup zip files currently exist on disk — shared by
// carshow_backup_purge() (via its own glob) and backup.php's 'delete'
// action, which uses this to refuse deleting the very last one (same "never
// leave zero backups" guarantee carshow_backup_purge()'s max(1, ...) floor
// gives the automatic purge).
function carshow_backup_zip_count($dir) {
    return count(glob($dir . '/*.zip') ?: []);
}

// Does the actual backup: zips the whole data/ tree (every show year, plus
// data/shows.json and data/api-key.json) and the global root-level files
// that live outside data/ — members-data.json, password-reset.json,
// dev-password-reset.json (see this file's own comment on why those are
// global), and every per-year window-card-<year>.pdf template. Deliberately
// EXCLUDES secrets.php and every other code file — same scope
// ftp-deploy.sh's own upload list excludes for the opposite reason (never
// overwrite live data with a stale local copy); this is a data backup, not
// a code backup.
function carshow_run_backup() {
    $dir = carshow_backups_dir();
    if ($dir === null) return ['ok' => false, 'error' => 'Could not create the backups directory.'];

    $fileName = gmdate('YmdHis') . '-CarShowData.zip';
    $zipPath = $dir . '/' . $fileName;

    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        return ['ok' => false, 'error' => 'Could not create the backup zip file.'];
    }

    $dataRoot = carshow_data_root();
    if ($dataRoot !== null) carshow_zip_add_dir($zip, $dataRoot, 'data');

    $rootFiles = ['members-data.json', 'password-reset.json', 'dev-password-reset.json'];
    foreach ((glob(__DIR__ . '/window-card-*.pdf') ?: []) as $f) $rootFiles[] = basename($f);
    foreach ($rootFiles as $name) {
        $path = __DIR__ . '/' . $name;
        if (is_file($path)) $zip->addFile($path, $name);
    }

    $numFiles = $zip->numFiles;
    $zip->close();

    if ($numFiles === 0) {
        @unlink($zipPath);
        return ['ok' => false, 'error' => 'Nothing to back up — no data files were found on the server.'];
    }

    carshow_backup_purge($dir, CARSHOW_BACKUP_KEEP);
    clearstatcache(true, $zipPath);
    return ['ok' => true, 'fileName' => $fileName, 'sizeBytes' => filesize($zipPath), 'fileCount' => $numFiles];
}

// Called from import-schedule.php's 'check' action, which is already polled
// every ~15 minutes by the Windows scheduled task regardless of whether
// anyone has the app open in a browser — piggybacking on that existing
// heartbeat means a daily backup needs no scheduled task of its own. Runs at
// most once per calendar date (server's current default timezone — see
// import-schedule.php's date_default_timezone_set('America/New_York'),
// which is already in effect by the time this is called from there): the
// first poll on/after midnight that finds today's date not yet recorded, so
// "at midnight" in practice means within ~15 minutes after it, the same
// approximation the Import Schedule's own explicit times already make.
// Attempts exactly once per day regardless of outcome (lastAutoRunDate is
// set whether the run succeeded or failed) — a persistently failing backup
// (e.g. disk full) should surface once a day in the log, not spam a retry
// every 15 minutes until fixed.
function carshow_backup_auto_check() {
    $schedule = carshow_read_backup_schedule();
    if (!$schedule['enabled']) return;
    $today = date('Y-m-d');
    if ($schedule['startDate'] !== '' && $today < $schedule['startDate']) return;
    if ($schedule['endDate'] !== '' && $today > $schedule['endDate']) return;
    if ($schedule['lastAutoRunDate'] === $today) return;

    $result = carshow_run_backup();
    $entry = ['timestamp' => gmdate('c'), 'status' => $result['ok'] ? 'success' : 'failed', 'reason' => 'auto'];
    if ($result['ok']) {
        $entry['fileName'] = $result['fileName'];
        $entry['sizeBytes'] = $result['sizeBytes'];
        $entry['fileCount'] = $result['fileCount'];
    } else {
        $entry['error'] = $result['error'];
    }
    carshow_append_json_list(carshow_backup_history_file(), $entry);

    $schedule['lastAutoRunDate'] = $today;
    carshow_write_backup_schedule($schedule);
}

// ---------------------------------------------------------------------------
// Backups > Restore (Setup tab; see backup.php's 'get_backup_years'/'restore')
// ---------------------------------------------------------------------------
// Ported from the sibling Vette Fest app's carshow_restore_backup() (itself
// ported from SilentAuctionManager's restore_backup(), which
// deletes-and-reinserts SQL rows inside a transaction) — there is no SQL
// here, this deletes-and-re-extracts the corresponding data/ subtree
// instead, the file-based equivalent of the same "make the live state match
// the backup" semantics: a WHOLE restore matches the backup EXACTLY
// (something live now that wasn't in the backup gets removed, not left
// alone) while a SCOPED restore only ever touches the one show year asked
// for. CarShow-specific difference from Vette Fest: this app also has a
// global members-data.json and a per-year (but flat, not under data/)
// window-card-<year>.pdf — both handled below; Vette Fest has neither.

// Same filename shape backup.php validates against (CARSHOW_BACKUP_NAME_PATTERN),
// duplicated here as a plain regex rather than depending on backup.php's
// constant, so lib.php doesn't need backup.php loaded first to be safe to call.
function carshow_backup_zip_path($backupDir, $fileName) {
    if (!preg_match('/^[0-9]{14}-CarShowData\.zip$/', (string)$fileName)) return null;
    $path = $backupDir . '/' . $fileName;
    return is_file($path) ? $path : null;
}

// Like carshow_write_json() (same locking discipline), but writes a raw
// string verbatim instead of json_encode()-ing a PHP value — restoring must
// reproduce the backup's bytes exactly, not re-serialize them.
function carshow_write_raw($file, $content) {
    if ($file === null) return false;
    $fh = fopen($file, 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if ($fh) fclose($fh);
        return false;
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, $content);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return true;
}

// Lists the distinct show years found inside one backup zip, with a display
// name/status pulled from the zip's OWN data/shows.json (if present) — so
// the Restore UI can offer real show names instead of bare year numbers,
// same idea as SAM's sam_backup_auction_ids(). A backup with no shows.json
// entry for a year that nonetheless has data/<year>/ files in it (shouldn't
// happen in practice — carshow_run_backup() always includes the whole data/
// tree together — but handled defensively) falls back to "Show <year>".
//
// A year can legitimately appear in shows.json with ZERO data/<year>/ files
// — a show created right before the backup was taken, before anything else
// was ever saved to it. That's still real, restorable data (the show's own
// name/status), not "nothing" — so it's listed here too (fileCount: 0),
// rather than silently vanishing from the Restore dropdown.
function carshow_backup_years_in_zip($backupDir, $fileName) {
    $path = carshow_backup_zip_path($backupDir, $fileName);
    if ($path === null) return null;
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return null;

    $shows = [];
    $showsRaw = $zip->getFromName('data/shows.json');
    if ($showsRaw !== false) {
        $decoded = json_decode($showsRaw, true);
        if (is_array($decoded) && !empty($decoded['shows']) && is_array($decoded['shows'])) {
            foreach ($decoded['shows'] as $s) {
                if (is_array($s) && isset($s['year'])) $shows[(string)$s['year']] = $s;
            }
        }
    }

    $fileCounts = [];
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if (preg_match('#^data/([0-9]{4})/#', $name, $m)) {
            $fileCounts[$m[1]] = ($fileCounts[$m[1]] ?? 0) + 1;
        }
    }
    $zip->close();

    // Union of "has files" and "has a shows.json row" — either alone is
    // enough to make a year worth offering.
    $allYears = $fileCounts;
    foreach ($shows as $year => $s) { if (!array_key_exists($year, $allYears)) $allYears[$year] = 0; }

    $years = [];
    foreach ($allYears as $year => $count) {
        $s = $shows[$year] ?? null;
        $years[] = [
            'year' => $year,
            'name' => ($s && !empty($s['name'])) ? (string)$s['name'] : ('Show ' . $year),
            'status' => $s ? (string)($s['status'] ?? '') : '',
            'fileCount' => $count,
        ];
    }
    usort($years, function ($a, $b) { return (int)$b['year'] - (int)$a['year']; });
    return $years;
}

// Restores the live data/ tree from one backup zip. $year === null restores
// EVERYTHING (every show year, data/shows.json, data/api-key.json, and the
// global members-data.json/password-reset.json/dev-password-reset.json/
// window-card-<year>.pdf files) so the live tree matches the backup exactly
// — including deleting a year directory or global file that exists live now
// but wasn't in the backup. $year (already-validated by the caller) restores
// only that one show's data/<year>/ directory, its own row in shows.json,
// and its own window-card-<year>.pdf (if the backup has one) — every other
// year and every truly-global file (members-data.json, the two
// password-reset files, api-key.json) stay completely untouched.
//
// Every .json entry that's about to be written is decoded and validated
// FIRST, before anything on disk is touched — a corrupted or hand-edited
// backup aborts the whole restore with nothing changed, rather than leaving
// a half-restored data/ tree. A fresh whole-data safety backup is ALWAYS
// taken first, before either kind of restore, so a bad restore is itself
// always recoverable by restoring that safety snapshot.
function carshow_restore_backup($backupDir, $fileName, $year = null) {
    $path = carshow_backup_zip_path($backupDir, $fileName);
    if ($path === null) return ['ok' => false, 'error' => 'Backup file not found on disk — it may have aged past the retention limit.'];

    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return ['ok' => false, 'error' => 'Could not open the backup zip file.'];

    $dataRoot = carshow_data_root();
    if ($dataRoot === null) { $zip->close(); return ['ok' => false, 'error' => 'Could not access the data directory.']; }

    // Collect + validate every entry that will be WRITTEN to data/<year>/,
    // a global root file, or that year's window-card-<year>.pdf. $writes:
    // zip entry name (e.g. "data/2026/registrations-data.json",
    // "members-data.json", or "window-card-2026.pdf") => raw bytes. Every
    // entry lives directly under __DIR__ once its 'data/' prefix (if any) is
    // put back — that's exactly how carshow_run_backup() named them, so no
    // path translation is needed beyond __DIR__ . '/' . $name.
    //
    // "data/shows.json" is deliberately excluded from $writes for a SCOPED
    // restore — it must never be written wholesale (that would silently
    // overwrite every other show's registry row too) — but its content is
    // still needed afterward, just to read ONE year's row out of it for the
    // merge below. So it's captured separately into $showsJsonRaw,
    // regardless of scope, before the zip closes.
    $writes = [];
    $showsJsonRaw = null;
    $prefix = ($year !== null) ? ('data/' . $year . '/') : null;
    $yearWindowCard = ($year !== null) ? ('window-card-' . $year . '.pdf') : null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        $isShowsJson = ($name === 'data/shows.json');
        if ($prefix !== null) {
            // Scoped: only this year's data/<year>/ files, its own window
            // card (if the backup has one), and shows.json (read-only, for
            // the row merge below) are in scope — everything else (other
            // years, and the truly-global members-data.json/password-reset
            // files/api-key.json) is skipped entirely.
            $inScope = $isShowsJson || strpos($name, $prefix) === 0 || ($yearWindowCard !== null && $name === $yearWindowCard);
            if (!$inScope) continue;
        }
        $content = $zip->getFromName($name);
        if ($content === false) { $zip->close(); return ['ok' => false, 'error' => "Could not read $name from the backup."]; }
        if (preg_match('/\.json$/i', $name) && json_decode($content) === null && trim($content) !== 'null') {
            $zip->close();
            return ['ok' => false, 'error' => "$name in the backup is not valid JSON — aborted, nothing was changed."];
        }
        if ($isShowsJson) { $showsJsonRaw = $content; if ($year !== null) continue; } // scoped: read-only, not written verbatim
        $writes[$name] = $content;
    }
    $zip->close();

    // A year with a real row in the backup's shows.json but zero actual
    // data files is a legitimate, meaningful thing to restore (its
    // name/status, from a show created right before that backup was taken,
    // before anything else was ever saved to it) — NOT the same as "this
    // year isn't in the backup at all". So the two are checked together:
    // only truly nothing (no files AND no registry row) fails.
    $backupEntry = null;
    if ($year !== null && $showsJsonRaw !== null) {
        $backupShows = json_decode($showsJsonRaw, true);
        if (is_array($backupShows) && !empty($backupShows['shows']) && is_array($backupShows['shows'])) {
            foreach ($backupShows['shows'] as $s) {
                if (is_array($s) && isset($s['year']) && (string)$s['year'] === $year) { $backupEntry = $s; break; }
            }
        }
    }
    if ($year !== null && empty($writes) && $backupEntry === null) {
        return ['ok' => false, 'error' => "This backup has no data, and no shows-list entry, for show $year."];
    }

    // Safety net first, regardless of scope — cheap, and keeps the recovery
    // story identical either way: restore this file to undo whatever happens
    // next.
    $preRestore = carshow_run_backup();
    if (empty($preRestore['ok'])) {
        return ['ok' => false, 'error' => 'Could not take a safety backup before restoring — aborted without changing anything. (' . ($preRestore['error'] ?? 'unknown error') . ')'];
    }

    $scopeName = 'Everything';

    if ($year === null) {
        // Whole restore: wipe every existing year directory, then delete any
        // global file (or per-year window card) the backup doesn't have —
        // so the live tree ends up matching the backup exactly, not a union
        // of the two.
        foreach (glob($dataRoot . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
            if (preg_match('#[\\\\/][0-9]{4}$#', $dir)) carshow_rrmdir($dir);
        }
        $showsPath = carshow_shows_path();
        if ($showsPath !== null && is_file($showsPath) && !array_key_exists('data/shows.json', $writes)) {
            @unlink($showsPath);
        }
        foreach (['members-data.json', 'password-reset.json', 'dev-password-reset.json'] as $rootFile) {
            if (!array_key_exists($rootFile, $writes)) {
                $target = __DIR__ . '/' . $rootFile;
                if (is_file($target)) @unlink($target);
            }
        }
        foreach ((glob(__DIR__ . '/window-card-*.pdf') ?: []) as $existing) {
            $base = basename($existing);
            if (!array_key_exists($base, $writes)) @unlink($existing);
        }
    } else {
        // Scoped: only this year's directory is wiped/re-extracted. Its row
        // in shows.json is updated in place further below; nothing else in
        // shows.json, no other year, and no global file is touched. Its own
        // window-card-<year>.pdf is overwritten below if the backup has one
        // — otherwise left exactly as-is (never deleted by a scoped restore).
        $yearDir = $dataRoot . '/' . $year;
        if (is_dir($yearDir)) carshow_rrmdir($yearDir);
        $scopeName = $year;
    }

    $filesWritten = 0;
    foreach ($writes as $name => $content) {
        $target = __DIR__ . '/' . $name;
        $dir = dirname($target);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        if (!carshow_write_raw($target, $content)) {
            return ['ok' => false, 'error' => "Could not write $name during restore. A pre-restore safety backup was taken first — see the Backups log.", 'preRestoreBackup' => $preRestore['fileName']];
        }
        $filesWritten++;
    }

    // Scoped restore: merge just this year's row into the LIVE shows.json
    // (replacing it if present, appending it if the live registry had
    // dropped it somehow) from the BACKUP's shows.json — every other year's
    // row, and 'current', stay exactly as they are live. Mirrors SAM
    // restoring just one auction's row in its 'auctions' table on a scoped
    // restore, not the whole table. $backupEntry was already resolved above
    // (needed there too, for the "nothing to restore" guard).
    if ($year !== null && $backupEntry !== null) {
        $registry = carshow_read_shows();
        $found = false;
        foreach ($registry['shows'] as $idx => $s) {
            if (is_array($s) && isset($s['year']) && (string)$s['year'] === $year) {
                $registry['shows'][$idx] = $backupEntry;
                $found = true;
                break;
            }
        }
        if (!$found) $registry['shows'][] = $backupEntry;
        if (!carshow_write_shows($registry)) {
            return ['ok' => false, 'error' => "Restored show $year's data, but could not update its entry in the shows list. A pre-restore safety backup was taken first — see the Backups log.", 'preRestoreBackup' => $preRestore['fileName']];
        }
        $scopeName = (string)($backupEntry['name'] ?? $year);
    }

    return [
        'ok' => true,
        'scope' => $year !== null ? $year : 'all',
        'scopeName' => $scopeName,
        'filesWritten' => $filesWritten,
        'preRestoreBackup' => $preRestore['fileName'],
    ];
}

// Recursive delete — used only by carshow_restore_backup() above, to wipe a
// year's directory (which now legitimately holds a subdirectory,
// data/<year>/logs/, unlike the flat single-level layout
// carshow_show_files() still assumes for shows.php's own show-delete
// action — see that function's comment). Safe here because the only paths
// ever passed in are ones this same function derived from $dataRoot/<year>,
// never anything caller-supplied directly.
function carshow_rrmdir($dir) {
    if (!is_dir($dir)) return;
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $item) {
        if ($item->isDir()) { @rmdir($item->getPathname()); } else { @unlink($item->getPathname()); }
    }
    @rmdir($dir);
}

function carshow_migrate_to_multi_show() {
    $path = carshow_shows_path();
    if ($path === null) return false;          // data/ not creatable — caller reports it
    if (is_file($path)) return true;           // already migrated; the common case

    $year = CARSHOW_LEGACY_YEAR;
    $dir = carshow_show_dir($year);
    if ($dir === null) return false;

    $migrated = false;
    foreach (carshow_show_files() as $name) {
        $legacy = __DIR__ . '/' . $name;
        $target = $dir . '/' . $name;
        if (is_file($legacy) && !is_file($target)) {
            @copy($legacy, $target);
            $migrated = true;
        }
    }

    // The window card is per-year but flat (see carshow_window_card_name).
    // The settings key that names it has to be rewritten to match, or the
    // migrated show would keep pointing at the pre-multi-show filename.
    $legacyCard = __DIR__ . '/window-card.pdf';
    $cardName = carshow_window_card_name($year);
    $targetCard = __DIR__ . '/' . $cardName;
    if (is_file($legacyCard) && !is_file($targetCard)) @copy($legacyCard, $targetCard);

    // externalApiKey becomes global — lift it out of the migrated per-year
    // settings so the external feed's credential survives a show rollover,
    // and drop it from the copy so the two can't drift apart later.
    $settingsFile = $dir . '/app-settings.json';
    if (is_file($settingsFile)) {
        $settings = json_decode(file_get_contents($settingsFile), true);
        if (is_array($settings)) {
            $dirty = false;
            if (!empty($settings['externalApiKey'])) {
                $root = carshow_data_root();
                if ($root !== null && !is_file($root . '/api-key.json')) {
                    carshow_write_json($root . '/api-key.json', ['externalApiKey' => $settings['externalApiKey']]);
                }
                unset($settings['externalApiKey']);
                $dirty = true;
            }
            if (($settings['windowCardPdf'] ?? '') === 'window-card.pdf' && is_file($targetCard)) {
                $settings['windowCardPdf'] = $cardName;
                $dirty = true;
            }
            if ($dirty) carshow_write_json($settingsFile, $settings);
        }
    }

    // Always write the registry, even when there was nothing to copy (a fresh
    // install) — writing it is what makes this run exactly once, ever.
    carshow_write_shows([
        'current' => $year,
        'shows' => [[
            'year'    => (int)$year,
            'name'    => $year . ' Car Show',
            'status'  => 'active',
            'created' => gmdate('c'),
            'migrated' => $migrated
        ]]
    ]);
    return true;
}

// Assembles every per-show (and the two global) data blob the app needs to
// render a show — sponsors, payments, walkins, roster, settings, overrides,
// history, and the CSV pair itself. Single source of truth for this list so
// index.php (page load) and refresh.php (an already-open tab asking "is
// there anything new?") can never drift apart — each just serializes this
// same array differently (index.php as ordered boot-script ingest() calls,
// refresh.php as one flat JSON object for the client to re-ingest itself).
//
// Ordering callers must respect when re-ingesting (see index.php's own boot
// script comments for the full reasoning): ingestSponsors/
// ingestDeletedSponsors before ingestRows (CSV->Sponsor auto-sync reads the
// current sponsor list); ingestDeletedRegistrations/
// ingestRegistrationOverrides before ingestRows (regenerate() applies both
// the moment it runs). This function doesn't enforce order itself — it's a
// data assembler, not a sequencer — callers must ingest in the same order
// index.php's $bootParts does.
function carshow_boot_data($year) {
    $appSettingsDefaults = [
        'walkinFirstNonMember' => 2000,
        'walkInCarShowFee' => 50,
        'walkInNonCarShowFee' => 0,
        'preregistrationFee' => 40,
        'windowCardPdf' => '',
        'tshirtVendorEmail' => '',
        'tshirtEventPurchaseCost' => 0,
        'sponsorEmailTo' => '',
        'sponsorEmailCc' => '',
        'sponsorEmailBcc' => '',
        'sponsorEmailSubject' => 'New Sponsor Submission',
        'eventUrl' => '',
        'autoImportEnabled' => false,
        'autoImportTimes' => [],
        'autoImportIntervalHours' => 0,
        'autoImportStartDate' => '',
        'autoImportEndDate' => ''
    ];
    $appSettingsFile = carshow_show_file($year, 'app-settings.json');
    $appSettingsRaw = is_file($appSettingsFile) ? json_decode(file_get_contents($appSettingsFile), true) : [];
    $appSettings = array_merge($appSettingsDefaults, is_array($appSettingsRaw) ? $appSettingsRaw : []);
    $appSettings['externalApiKey'] = carshow_api_key();

    $dashNumbersFile = carshow_show_file($year, 'dash-numbers.json');
    $dashNumbersRaw = ($dashNumbersFile !== null && is_file($dashNumbersFile)) ? json_decode(file_get_contents($dashNumbersFile), true) : [];
    $dashNumbers = is_array($dashNumbersRaw) ? $dashNumbersRaw : [];

    $data = [
        'sponsors' => carshow_read_json_list(carshow_show_file($year, 'sponsor-submissions.json')),
        'deletedSponsorIds' => carshow_read_json_list(carshow_show_file($year, 'deleted-sponsors.json')),
        'payments' => carshow_read_json_list(carshow_show_file($year, 'sponsor-payments.json')),
        'walkins' => carshow_read_json_list(carshow_show_file($year, 'walkin-registrations.json')),
        'tshirtPurchases' => carshow_read_json_list(carshow_show_file($year, 'tshirt-purchases.json')),
        'dashNumbers' => $dashNumbers,
        'members' => carshow_read_json_list(__DIR__ . '/members-data.json'), // global, not per-show
        'appSettings' => $appSettings,
        'deletedRegistrations' => carshow_read_json_list(carshow_show_file($year, 'deleted-registrations.json')),
        'registrationOverrides' => (function () use ($year) {
            $f = carshow_show_file($year, 'registration-overrides.json');
            $raw = is_file($f) ? json_decode(file_get_contents($f), true) : [];
            return is_array($raw) ? $raw : [];
        })(),
        'importHistory' => carshow_read_json_list(carshow_show_file($year, 'import-history.json')),
        'regCsv' => '',
        'actCsv' => '',
        'generatedAt' => 0,
        'hasRegistrations' => false,
    ];

    $regFile = carshow_show_file($year, 'registrations-data.json');
    if (is_file($regFile)) {
        $reg = json_decode(file_get_contents($regFile), true);
        if (is_array($reg) && !empty($reg['regCsv'])) {
            $data['regCsv'] = (string)$reg['regCsv'];
            $data['actCsv'] = (string)($reg['actCsv'] ?? '');
            $data['generatedAt'] = (int)($reg['generatedAt'] ?? 0);
            $data['hasRegistrations'] = true;
        }
    }

    return $data;
}

// Replaces the global external API key. Separate action rather than a special
// case of the settings save, so the client never round-trips the old value.
function carshow_rotate_api_key() {
    $root = carshow_data_root();
    if ($root === null) return '';
    $key = bin2hex(random_bytes(16));
    carshow_write_json($root . '/api-key.json', ['externalApiKey' => $key]);
    return $key;
}
