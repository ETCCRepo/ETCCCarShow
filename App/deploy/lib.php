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
        'app-settings.json'
    ];
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

// Replaces the global external API key. Separate action rather than a special
// case of the settings save, so the client never round-trips the old value.
function carshow_rotate_api_key() {
    $root = carshow_data_root();
    if ($root === null) return '';
    $key = bin2hex(random_bytes(16));
    carshow_write_json($root . '/api-key.json', ['externalApiKey' => $key]);
    return $key;
}
