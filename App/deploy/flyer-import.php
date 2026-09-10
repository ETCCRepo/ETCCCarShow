<?php
// Officer-only page to replace the car show flyer PDF (CarShowFlyer.pdf, a
// flat file at the web root — same convention as ETCClogoWhiteBackground.png
// and VotingSheet.pdf). The Reports tab's "Print Flyer" button just does
// window.open("CarShowFlyer.pdf"), so overwriting this file here is all it
// takes to change what that button prints — no rebuild/redeploy needed.
//
// Not per-year (unlike window-card-<year>.pdf): the flyer is general
// marketing material, one file. Not written into any settings JSON — the
// filename is fixed.
//
// Gated by the same PHP session as index.php — no separate password prompt,
// but you must already be logged into the app to reach this page.
session_start();
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

require __DIR__ . '/lib.php';

if (empty($_SESSION['carshow_authenticated'])) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><body style="font:15px sans-serif;padding:40px;text-align:center">' .
        '<p>Please <a href="index.php">log in</a> first.</p></body>';
    exit;
}

$FLYER_FILE = __DIR__ . '/CarShowFlyer.pdf';
$errors = [];
$imported = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (empty($_FILES['flyer_pdf']) || $_FILES['flyer_pdf']['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($_FILES['flyer_pdf']['tmp_name'])) {
        $errors[] = 'No PDF uploaded, or the upload failed — choose a PDF file and try again.';
    } else {
        $file = $_FILES['flyer_pdf'];
        if ($file['size'] > 15 * 1024 * 1024) {
            $errors[] = 'PDF is too large (15 MB max).';
        } else {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
            if ($mime !== 'application/pdf') {
                $errors[] = 'That file is not a PDF (' . htmlspecialchars($mime) . ').';
            } else {
                // The existing CarShowFlyer.pdf may have been put there by the
                // FTP deploy; make sure PHP can overwrite it before trying.
                if (is_file($FLYER_FILE) && !is_writable($FLYER_FILE)) {
                    @chmod($FLYER_FILE, 0644);
                }
                if (!move_uploaded_file($file['tmp_name'], $FLYER_FILE)) {
                    $errors[] = 'Could not save the flyer — please try again.';
                } else {
                    @chmod($FLYER_FILE, 0644);
                    clearstatcache(true, $FLYER_FILE);
                    $imported = true;
                }
            }
        }
    }
}

$hasFlyer = is_file($FLYER_FILE);
$flyerSize = $hasFlyer ? round(filesize($FLYER_FILE) / 1024) : 0;
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ETCC Car Show — Import Flyer</title>
<link rel="icon" type="image/png" href="ETCClogoWhiteBackground.png">
<link rel="apple-touch-icon" href="ETCClogoWhiteBackground.png">
<style>
  :root { --red:#b0141e; --red-dark:#7d0e15; --ink:#1a1a1a; --muted:#667085; --line:#e3e6ea; --bg:#f4f6f8; --panel:#fff; --good:#147d3a; }
  * { box-sizing: border-box; }
  body { font: 15px/1.5 "Segoe UI", Arial, sans-serif; color: var(--ink); background: var(--bg); margin:0; padding: 28px 16px 60px; }
  .wrap { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 20px; text-align: center; margin: 0 0 2px; }
  .sub { text-align:center; color:var(--muted); font-size:13px; margin-bottom:22px; }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 22px 24px; }
  .form-row { margin: 14px 0; }
  label { display:block; font-weight:600; font-size:13px; margin-bottom:4px; }
  input[type=file] { width:100%; padding:9px 10px; border:1px solid var(--line); border-radius:7px; font-size:14px; font-family:inherit; background:#fff; }
  .btn { background: var(--red); border: 1px solid var(--red-dark); color:#fff; padding: 11px 18px; border-radius:8px; font-size:15px; font-weight:700; cursor:pointer; width:100%; margin-top:6px; }
  .btn:hover { background: var(--red-dark); }
  .errors { background:#fff5f5; border-left:4px solid var(--red); border-radius:6px; padding:10px 14px; margin-bottom:14px; color:var(--red-dark); font-size:13px; }
  .errors ul { margin:4px 0 0; padding-left:18px; }
  .success { background:#f2fbf5; border:1px solid #bfe2c9; border-radius:8px; padding:12px 14px; margin-bottom:14px; color: var(--good); font-weight:600; font-size:14px; }
  .count { color: var(--muted); font-size:13px; margin-bottom: 14px; }
  .count a { color: var(--red-dark); }
  .back { display:block; text-align:center; margin-top:18px; color: var(--muted); font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Import Car Show Flyer</h1>
  <div class="sub">Replaces the PDF opened by the Reports tab's &ldquo;Print Flyer&rdquo; button</div>
  <div class="panel">
    <?php if ($imported): ?>
      <div class="success">Flyer updated (<?php echo round(filesize($FLYER_FILE) / 1024); ?> KB). The &ldquo;Print Flyer&rdquo; button now opens this PDF.</div>
    <?php endif; ?>
    <?php if ($errors): ?>
      <div class="errors"><strong>Please fix the following:</strong><ul>
        <?php foreach ($errors as $e) echo '<li>' . $e . '</li>'; ?>
      </ul></div>
    <?php endif; ?>
    <div class="count">
      <?php if ($hasFlyer): ?>
        Current flyer: <strong><?php echo $flyerSize; ?> KB</strong> &mdash; <a href="CarShowFlyer.pdf?t=<?php echo filemtime($FLYER_FILE); ?>" target="_blank" rel="noopener">view</a>
      <?php else: ?>
        No flyer uploaded yet.
      <?php endif; ?>
    </div>
    <form method="post" enctype="multipart/form-data">
      <div class="form-row">
        <label for="f-pdf">Flyer PDF (15 MB max)</label>
        <input type="file" id="f-pdf" name="flyer_pdf" accept="application/pdf,.pdf" required>
      </div>
      <button type="submit" class="btn">Import</button>
    </form>
  </div>
  <a class="back" href="index.php">&larr; Back to the app</a>
</div>
</body>
</html>
