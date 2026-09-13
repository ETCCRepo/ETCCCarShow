<?php
// Setup tab > Backups — a "Backup Now" button that zips this app's live
// JSON "database" (the data/ tree, plus a few root-level global files —
// see carshow_run_backup() below for the exact list) into deploy/backups/,
// and a permanent log of every run (backup-history.json) so officers can
// see backups are actually happening and catch a run that failed. This is
// a point-in-time snapshot kept ON this server; the ETCCCarShowBackup
// Claude Code skill pulls the same underlying data down to a Windows
// machine over FTP for off-server redundancy — different transport, same
// data, kept for a different failure mode (this server itself going away).
//
// Actions: run (POST, session-or-password), list (GET/POST,
// session-or-password), download (GET, session-or-password).
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

// Keep at most this many zip files on disk — each successful run also
// purges anything beyond the newest N (oldest deleted first). The log
// entries in backup-history.json are NEVER pruned by this — a purged run's
// row stays as a permanent record that a backup happened that day, same as
// import-history.json never getting pruned by import volume. A purged
// entry's Download link 404s (see the 'download' action) rather than
// disappearing from the log.
define('CARSHOW_BACKUP_KEEP', 30);
define('CARSHOW_BACKUP_NAME_PATTERN', '/^[0-9]{14}-CarShowData\.zip$/');

// backups/ itself. Created on demand, deny-all like every other data
// directory in this app — defense in depth even though every action below
// already gates on carshow_authed().
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
function carshow_backup_purge($dir, $keep) {
    $files = glob($dir . '/*.zip') ?: [];
    if (count($files) <= $keep) return;
    usort($files, function ($a, $b) { return filemtime($a) - filemtime($b); });
    foreach (array_slice($files, 0, count($files) - $keep) as $f) @unlink($f);
}

// Does the actual backup: zips the whole data/ tree (every show year, plus
// data/shows.json and data/api-key.json) and the global root-level files
// that live outside data/ — members-data.json, password-reset.json,
// dev-password-reset.json (see lib.php's own comment on why those are
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

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) $input = [];
$action = (string)($input['action'] ?? ($_GET['action'] ?? 'list'));

if (!carshow_authed($PASSWORD_HASH, $input['password'] ?? ($_GET['password'] ?? ''))) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Incorrect password.']);
    exit;
}

$historyFile = carshow_backup_history_file();

if ($action === 'run') {
    $result = carshow_run_backup();
    $entry = ['timestamp' => gmdate('c'), 'status' => $result['ok'] ? 'success' : 'failed'];
    if ($result['ok']) {
        $entry['fileName'] = $result['fileName'];
        $entry['sizeBytes'] = $result['sizeBytes'];
        $entry['fileCount'] = $result['fileCount'];
    } else {
        $entry['error'] = $result['error'];
    }
    carshow_append_json_list($historyFile, $entry);
    header('Content-Type: application/json');
    echo json_encode(['ok' => $result['ok'], 'error' => $result['ok'] ? null : $result['error'], 'entry' => $entry]);
    exit;
}

if ($action === 'list') {
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'history' => carshow_read_json_list($historyFile)]);
    exit;
}

if ($action === 'download') {
    $name = (string)($_GET['name'] ?? ($input['name'] ?? ''));
    $dir = carshow_backups_dir();
    $path = $dir === null ? null : $dir . '/' . $name;
    if (!preg_match(CARSHOW_BACKUP_NAME_PATTERN, $name) || $path === null || !is_file($path)) {
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode(['ok' => false, 'error' => 'Backup file not found — it may have aged past the retention limit (newest ' . CARSHOW_BACKUP_KEEP . ' kept).']);
        exit;
    }
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

http_response_code(400);
header('Content-Type: application/json');
echo json_encode(['ok' => false, 'error' => 'Unknown action.']);
