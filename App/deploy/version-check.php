<?php
// Tiny public endpoint so app.js's checkForNewVersion() can poll the
// currently-deployed version. version-check.json itself (written by
// build.js) is intentionally unreachable directly — it's caught by
// .htaccess's blanket "<FilesMatch \.json$> deny all" rule, the same
// protection every data file here gets. That's an HTTP-level rule, though;
// it doesn't stop PHP's own file reads, so this endpoint reads that file
// server-side and republishes just the version string. No auth needed —
// the deployed version number isn't sensitive, unlike the data files that
// rule actually exists to protect.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Content-Type: application/json');
$raw = @file_get_contents(__DIR__ . '/version-check.json');
$data = $raw ? json_decode($raw, true) : null;
echo json_encode(['version' => is_array($data) ? (string)($data['version'] ?? '') : '']);
