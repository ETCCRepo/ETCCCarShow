<?php
session_start();

// Belt-and-suspenders against browser/proxy caching of the gate itself —
// this page's content depends on session state AND on server-side data that
// can change between requests (registrations-upload.php,
// sponsor-submissions.php), so a cached copy is always liable to be wrong.
// Relying on PHP's default session cache limiter wasn't enough on this host.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// $PASSWORD_HASH is defined in secrets.php (gitignored, not committed — see
// secrets.example.php for the template). Generate a new hash with:
//   openssl passwd -6 -salt "$(openssl rand -hex 8)" 'the-password'
// crypt() verifies SHA-512-crypt ($6$) hashes natively, no PHP needed locally.
require __DIR__ . '/secrets.php';
require __DIR__ . '/lib.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'login') {
    header('Content-Type: application/json');
    $pw = (string)($_POST['password'] ?? '');
    $ok = hash_equals($PASSWORD_HASH, crypt($pw, $PASSWORD_HASH));
    if ($ok) {
        session_regenerate_id(true);
        $_SESSION['carshow_authenticated'] = true;
        echo json_encode(['success' => true]);
    } else {
        http_response_code(401);
        echo json_encode(['success' => false]);
    }
    exit;
}

// Separate "Developer" password (app.js's Developer Login screen) — a
// distinct credential from the main site login above, checked against
// $DEV_PASSWORD_HASH (secrets.php). This purely reveals the Developer
// submenu items client-side; it does NOT touch $_SESSION['carshow_authenticated']
// — every Import Members/Registrations link is still independently
// session-gated server-side using the MAIN login session (you already have
// to be logged into the app to reach this prompt at all), so there's no
// separate server session to grant here.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'dev_login') {
    header('Content-Type: application/json');
    if (empty($_SESSION['carshow_authenticated'])) {
        http_response_code(401);
        echo json_encode(['success' => false]);
        exit;
    }
    $pw = (string)($_POST['password'] ?? '');
    $ok = !empty($DEV_PASSWORD_HASH) && hash_equals($DEV_PASSWORD_HASH, crypt($pw, $DEV_PASSWORD_HASH));
    echo json_encode(['success' => $ok]);
    if (!$ok) http_response_code(401);
    exit;
}

if (empty($_SESSION['carshow_authenticated'])) {
    readfile(__DIR__ . '/_login.html');
    exit;
}

header('Content-Type: text/html; charset=utf-8');

// ---------------------------------------------------------------------------
// Which car show (year) is this request for?
// ---------------------------------------------------------------------------
// One-shot, idempotent, non-destructive — folds the pre-multi-show flat JSON
// files into data/2026/ the first time this build runs. See lib.php.
carshow_migrate_to_multi_show();
$registry = carshow_read_shows();

// ?year=NNNN selects a show and remembers it in the session, so a plain
// reload (or the #sponsors redirect back from the public sponsor form) stays
// on the same show. ?year= with an empty value deselects — that's the "Change
// Show" button, which sends the officer back to the Car Shows picker.
//
// Switching shows is a full page load rather than a client-side refetch: the
// boot script below already re-inlines every dataset from scratch on each
// request, so a reload gets the new year's data for free, with no chance of
// one show's records lingering in memory alongside another's.
if (isset($_GET['year'])) {
    $requested = carshow_valid_year($_GET['year']);
    if ($requested !== null && carshow_show_exists($requested, $registry)) {
        $_SESSION['carshow_year'] = $requested;
    } else {
        // Covers both the deliberate deselect (?year=) and a stale link to a
        // show that has since been deleted.
        unset($_SESSION['carshow_year']);
    }
}

// Re-validate on every request, not just when ?year= is present: a show
// deleted from another browser tab must not stay open in this one.
$year = carshow_valid_year($_SESSION['carshow_year'] ?? '');
if ($year !== null && !carshow_show_exists($year, $registry)) {
    unset($_SESSION['carshow_year']);
    $year = null;
}

// app-bundle.html is a plain copy of the built ETCCCarShow.html, uploaded by
// ftp-deploy.sh whenever App/src/ changes — unlike the old _data.html, it
// carries NO baked-in data. Registration/activity CSVs and the sponsor list
// are stitched in fresh below on every request, so a
// registrations-upload.php upload or a sponsor-submissions.php edit is live
// for the very next page load with no rebuild/redeploy step. See README.md.
$bundle = @file_get_contents(__DIR__ . '/app-bundle.html');
if ($bundle === false) {
    http_response_code(500);
    echo 'app-bundle.html is missing on the server — run deploy/ftp-deploy.sh (after node build.js) to upload it.';
    exit;
}

// Must run BEFORE the bundled app.js so its init() (which fires on
// DOMContentLoaded — after every inline script in the document, including
// this one, has already run) sees window.__carshowSite already set.
//
// Every per-show endpoint URL carries ?year=<year>. That single decision is
// what keeps the client diff small: app.js has ~15 hand-built fetch() bodies
// against these URLs, and none of them had to learn about years — the URL
// they were already using is now year-scoped. shows.php is deliberately NOT
// year-scoped (it manages the list of years itself).
$yearQuery = $year !== null ? '?year=' . rawurlencode($year) : '';
$perShowUrls = [
    'sponsorsApiUrl' => 'sponsor-submissions.php',
    'walkinsApiUrl' => 'walkin-registrations.php',
    'appSettingsApiUrl' => 'app-settings.php',
    'deletedRegistrationsApiUrl' => 'deleted-registrations.php',
    'deletedSponsorsApiUrl' => 'deleted-sponsors.php',
    'registrationOverridesApiUrl' => 'registration-overrides.php',
    'paidRegistrationsCacheApiUrl' => 'paid-registrations-cache.php',
    'windowCardPdfApiUrl' => 'window-card-pdf.php',
    'sendTshirtOrderEmailApiUrl' => 'send-tshirt-order-email.php',
    'sponsorPaymentsApiUrl' => 'sponsor-payments.php',
    'tshirtPurchasesApiUrl' => 'tshirt-purchases.php'
];
$siteConfig = [];
foreach ($perShowUrls as $key => $file) {
    $siteConfig[$key] = $file . $yearQuery;
}
$siteConfig['showsApiUrl'] = 'shows.php';
// No entry for the window card: it's a flat per-year file
// (window-card-2026.pdf) that app.js fetches by the name it already gets in
// app-settings.windowCardPdf, so there's nothing extra to hand it here.
$siteConfigScript = "<script>window.__carshowSite = " . carshow_safe_inline_json($siteConfig) . ";</script>\n";
$bundle = str_replace('<head>', '<head>' . "\n" . $siteConfigScript, $bundle);

$bootParts = [];

// MUST be first: until the app knows the show list and which show (if any) is
// open, it can't decide whether to render the Car Shows picker or the tabs —
// and ingestShows also sets CONFIG.title from the show's name, which
// ingestRows below bakes into state.result.meta.title.
$bootParts[] = "    window.__carshow.ingestShows(" .
    carshow_safe_inline_json($registry['shows']) . ", " .
    carshow_safe_inline_json($registry['current']) . ", " .
    carshow_safe_inline_json($year) . ");\n";

// With no show open the app renders the Car Shows picker and nothing else, so
// there is no point reading — or shipping to the browser — any show's data.
if ($year !== null) {

    // Sponsors MUST be ingested before registrations: ingesting registrations
    // triggers app.js's CSV -> Sponsors-tab auto-sync (any registrant with an
    // Individual Sponsorship fee gets added as a sponsor if not already
    // present), and that check needs the real current sponsor list already in
    // state.sponsors — otherwise it would run against an empty list and
    // re-upsert (overwriting) entries that already exist on the server.
    $sponsors = carshow_read_json_list(carshow_show_file($year, 'sponsor-submissions.json'));
    $bootParts[] = "    window.__carshow.ingestSponsors(" . carshow_safe_inline_json($sponsors) . ");\n";

    // MUST run before the ingestRows() call below, same reason as
    // deleted-registrations further down: syncSponsorsFromRegistrations()
    // excludes tombstoned CSV-synced sponsor ids the moment the CSV is
    // parsed, not just after the fact.
    $deletedSponsorIds = carshow_read_json_list(carshow_show_file($year, 'deleted-sponsors.json'));
    $bootParts[] = "    window.__carshow.ingestDeletedSponsors(" . carshow_safe_inline_json($deletedSponsorIds) . ");\n";

    // Payments (Cash/Check/Credit Card records against a sponsor) — ingested
    // right after sponsors so backfillPaymentDefaults() (triggered inside
    // ingestPayments) sees the real current sponsor list, not an empty one.
    $payments = carshow_read_json_list(carshow_show_file($year, 'sponsor-payments.json'));
    $bootParts[] = "    window.__carshow.ingestPayments(" . carshow_safe_inline_json($payments) . ");\n";

    // Walk-In registrations are independent of the CSV-derived data below —
    // they survive a fresh CSV import, unlike registrations-data.json — so
    // ingestion order relative to it doesn't matter, unlike sponsors above.
    $walkins = carshow_read_json_list(carshow_show_file($year, 'walkin-registrations.json'));
    $bootParts[] = "    window.__carshow.ingestWalkins(" . carshow_safe_inline_json($walkins) . ");\n";

    // Day-of-event t-shirt purchases (T-Shirts tab's Buy T-Shirt) —
    // independent of everything else, just read fresh on every page load.
    $tshirtPurchases = carshow_read_json_list(carshow_show_file($year, 'tshirt-purchases.json'));
    $bootParts[] = "    window.__carshow.ingestTshirtPurchases(" . carshow_safe_inline_json($tshirtPurchases) . ");\n";

    // Member roster (name + member number, if the last CSV import had that
    // column — see members-import.php) — used by the Add Registration form to
    // look up a Walk-In Member's number by name. GLOBAL, not per-show: the
    // club roster isn't an artifact of any one year's event.
    $members = carshow_read_json_list(__DIR__ . '/members-data.json');
    $bootParts[] = "    window.__carshow.ingestMembers(" . carshow_safe_inline_json($members) . ");\n";

    // App-wide settings — defaults here MUST match app-settings.php's
    // $defaults. Per-show: entry fees, the window card and the sponsor
    // confirmation email all legitimately differ year to year.
    $appSettingsFile = carshow_show_file($year, 'app-settings.json');
    $appSettingsRaw = is_file($appSettingsFile) ? json_decode(file_get_contents($appSettingsFile), true) : [];
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
        'sponsorEmailSubject' => 'New Sponsor Submission'
    ];
    $appSettings = array_merge($appSettingsDefaults, is_array($appSettingsRaw) ? $appSettingsRaw : []);
    // externalApiKey is GLOBAL, not per-show (data/api-key.json, generated on
    // first use) — paid-registrations-api.php is an external integration
    // whose credential has to survive a rollover to a new show year.
    $appSettings['externalApiKey'] = carshow_api_key();
    $bootParts[] = "    window.__carshow.ingestAppSettings(" . carshow_safe_inline_json($appSettings) . ");\n";

    // MUST run before the ingestRows() call below — regenerate() (triggered
    // by ingestRows) excludes deleted keys from the freshly-parsed CSV the
    // moment it runs, not just after the fact.
    $deletedKeys = carshow_read_json_list(carshow_show_file($year, 'deleted-registrations.json'));
    $bootParts[] = "    window.__carshow.ingestDeletedRegistrations(" . carshow_safe_inline_json($deletedKeys) . ");\n";

    // Same ordering requirement as deleted-registrations above — regenerate()
    // applies these field-edit patches to the freshly-parsed CSV rows
    // immediately.
    $overridesFile = carshow_show_file($year, 'registration-overrides.json');
    $overridesRaw = is_file($overridesFile) ? json_decode(file_get_contents($overridesFile), true) : [];
    $overrides = is_array($overridesRaw) ? $overridesRaw : [];
    $bootParts[] = "    window.__carshow.ingestRegistrationOverrides(" . carshow_safe_inline_json($overrides) . ");\n";

    $regFile = carshow_show_file($year, 'registrations-data.json');
    if (is_file($regFile)) {
        $reg = json_decode(file_get_contents($regFile), true);
        if (is_array($reg) && !empty($reg['regCsv'])) {
            $bootParts[] =
                "    var REG_CSV = " . carshow_safe_inline_json($reg['regCsv']) . ";\n" .
                "    var ACT_CSV = " . carshow_safe_inline_json($reg['actCsv'] ?? '') . ";\n" .
                "    var GENERATED_AT = new Date(" . (int)($reg['generatedAt'] ?? 0) . ");\n" .
                "    var regRows = Papa.parse(REG_CSV, { header: true, skipEmptyLines: true }).data;\n" .
                "    var actRows = ACT_CSV ? Papa.parse(ACT_CSV, { header: true, skipEmptyLines: true }).data : [];\n" .
                "    window.__carshow.ingestRows(regRows, actRows, GENERATED_AT);\n";
        }
    }

}

$bootScript = "\n<script>\n(function(){\n  function boot(){\n" . implode('', $bootParts) .
    "  }\n  if (document.readyState === \"loading\") document.addEventListener(\"DOMContentLoaded\", boot);\n  else boot();\n})();\n</script>\n";
$bundle = str_replace('</body>', $bootScript . '</body>', $bundle);

echo $bundle;
