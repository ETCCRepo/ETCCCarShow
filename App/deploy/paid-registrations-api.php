<?php
// EXTERNAL read-only API — the URL another website calls to read this car
// show's paid registrations. Deliberately does NOT use lib.php's
// carshow_authed() (this app's own officer site password) — that credential
// is for officers inside this app, not for a third-party website's server.
// Auth here is a separate, narrower key (data/api-key.json's
// externalApiKey, generated at random on first use — see lib.php's
// carshow_api_key() — and shown/rotated from the Developer > API screen,
// app.js's renderApiPage()). It is global, not per-show.
//
// Serves whatever paid-registrations-cache.php last wrote — see that file's
// comment for why this doesn't recompute anything itself: the officer's
// browser is the only place that runs logic.js's generate() pipeline.
//
// Accepts the key as either an X-Api-Key header or a ?key= query param, so
// it's callable from a plain browser address bar (handy for a developer to
// test with) or from server-side code.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: X-Api-Key, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

header('Content-Type: application/json');
require __DIR__ . '/lib.php';

// The key is GLOBAL (data/api-key.json), not per-show: this is a third-party
// integration whose credential must not change when the club rolls over to a
// new show year. Read it without creating one — an unconfigured app should
// reject the call, not mint a key for an anonymous caller.
$expectedKey = '';
$keyFile = __DIR__ . '/data/api-key.json';
if (is_file($keyFile)) {
    $keyRaw = json_decode(file_get_contents($keyFile), true);
    if (is_array($keyRaw)) $expectedKey = (string)($keyRaw['externalApiKey'] ?? '');
}

$providedKey = (string)($_SERVER['HTTP_X_API_KEY'] ?? ($_GET['key'] ?? ''));

if ($expectedKey === '' || $providedKey === '' || !hash_equals($expectedKey, $providedKey)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid or missing API key.']);
    exit;
}

// Serves the CURRENT show (data/shows.json), not whichever show an officer
// happens to have open — an external caller has no session and no way to
// name a year, so "the show the club is running right now" is the only
// sensible answer. ?year=NNNN overrides it for pulling a past year's numbers.
$registry = carshow_read_shows();
$year = carshow_valid_year($_GET['year'] ?? '');
if ($year === null || !carshow_show_exists($year, $registry)) $year = $registry['current'];
$cacheFile = $year !== null ? carshow_show_file($year, 'paid-registrations-cache.json') : null;
$cache = ($cacheFile !== null && is_file($cacheFile)) ? json_decode(file_get_contents($cacheFile), true) : null;
$registrations = (is_array($cache) && is_array($cache['registrations'] ?? null)) ? $cache['registrations'] : [];
$generatedAt = is_array($cache) ? ($cache['generatedAt'] ?? null) : null;

echo json_encode([
    'ok' => true,
    'year' => $year,
    'generatedAt' => $generatedAt,
    'count' => count($registrations),
    'registrations' => $registrations,
]);
