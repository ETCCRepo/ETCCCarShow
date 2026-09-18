/* build.js — inline vendor + src into a single self-contained ETCCCarShow.html.
 * Usage: node build.js [outputPath]
 */
var fs = require("fs");
var path = require("path");

var HERE = __dirname;
function read(p) { return fs.readFileSync(path.join(HERE, p), "utf8"); }
// Prevent a stray "</script>" in library text from closing our script tag.
function safeJs(s) { return s.replace(/<\/script>/gi, "<\\/script>"); }

// JSON.stringify safely escapes quotes/backslashes/newlines; also guard the
// two line-terminator code points (U+2028, U+2029) that JSON leaves
// unescaped but that older JS engines choke on inside string literals.
function jsStringLiteral(s) {
  var LS = String.fromCharCode(0x2028);
  var PS = String.fromCharCode(0x2029);
  return JSON.stringify(s).split(LS).join("\\u2028").split(PS).join("\\u2029");
}

// Developer > Run Regression Tests needs the fixture CSVs available in the
// browser with no network/file access — embed them as a global.
var fixturesScript = "window.CarShowFixtures = { regCsv: " +
  jsStringLiteral(read("test/fixtures/registration.csv")) + ", actCsv: " +
  jsStringLiteral(read("test/fixtures/activity.csv")) + " };";

// Embed the logo as a data URI so the output stays a single self-contained
// file (no external image reference) — same source file used by the
// Hostinger deploy's login screen (deploy/ftp-deploy.sh uploads it there).
var logoDataUri = "data:image/png;base64," + fs.readFileSync(path.join(HERE, "assets/ETCClogoWhiteBackground.png")).toString("base64");

// Reports tab banner image — embedded the same way as the logo above, but
// exposed to app.js as a global (rather than baked into a static <img> tag
// here) since the Reports tab is built dynamically by app.js.
var reportsBannerDataUri = "data:image/jpeg;base64," + fs.readFileSync(path.join(HERE, "assets/reports-banner.jpg")).toString("base64");
var reportsBannerScript = "window.__carshowReportsBanner = " + JSON.stringify(reportsBannerDataUri) + ";";

// pdf.js (Financials tab > "Upload Report" — client-side PDF text extraction,
// see app.js's handleFinancialsPdfUpload()). The library script sets window.pdfjsLib
// when loaded as a plain <script> (confirmed: its UMD wrapper does
// `t.pdfjsLib=e()` against globalThis). Its worker CANNOT be inlined as a
// script tag the way the library itself can — pdf.js always fetches the
// worker as a separate script via a URL — so instead the worker's full
// source is embedded as a plain JS string (window.__pdfjsWorkerSrc); app.js
// turns that into a Blob + object URL at runtime, the standard workaround for
// giving a Worker-based library a "file" when everything has to ship as one
// self-contained HTML document with no other files beside it.
var pdfjsWorkerScript = "window.__pdfjsWorkerSrc = " + jsStringLiteral(read("vendor/pdfjs.worker.min.js")) + ";";

var css = read("src/styles.css");
var scripts = [
  read("vendor/papaparse.min.js"),
  read("vendor/exceljs.min.js"),
  read("vendor/pdf-lib.min.js"),
  read("vendor/pdfjs.min.js"),
  pdfjsWorkerScript,
  read("src/config.js"),
  read("src/logic.js"),
  read("src/excel.js"),
  read("src/regression-tests.js"),
  fixturesScript,
  reportsBannerScript,
  read("src/app.js")
].map(safeJs);

// --- version: starts at 1.0, bumps the minor number every time this script
// runs (each run produces the deployed ETCCCarShow.html). The stamped
// version/date are baked into the HTML at build time — not computed at page
// load — so they reflect when THIS artifact was actually built, not today.
var VERSION_PATH = path.join(HERE, "version.json");
var version = { major: 1, minor: 0 };
if (fs.existsSync(VERSION_PATH)) {
  try { version = JSON.parse(fs.readFileSync(VERSION_PATH, "utf8")); } catch (e) { /* fall back to 1.0 */ }
}
var versionString = version.major + "." + version.minor;
var deployedAt = new Date();
fs.writeFileSync(VERSION_PATH, JSON.stringify({
  major: version.major, minor: version.minor + 1, lastBuilt: deployedAt.toISOString()
}, null, 2) + "\n");

// A small, separately-deployed copy of just the version string (plus the
// build timestamp — added so the standalone sponsor-form pages, which
// aren't part of this bundle and never see `deployedAt` any other way, can
// show the same "vX.Y · Deployed ..." footer line the main app does), as a
// plain static JSON file. version.json above never leaves this machine (no
// build tooling runs server-side) — this is the one piece of version info
// that actually reaches the live site, for the client-side "a newer version
// is available" banner (app.js's checkForNewVersion()) to compare itself
// against. Fetched with a cache-busting query string every time, so it works
// as a real version check even though it's a static file a CDN might
// otherwise cache. Written fresh every build, deployed by ftp-deploy.sh.
fs.writeFileSync(path.join(HERE, "deploy", "version-check.json"), JSON.stringify({ version: versionString, deployedAt: deployedAt.toISOString() }) + "\n");

function fmtDateTime(d) {
  function p(n) { return (n < 10 ? "0" : "") + n; }
  var h = d.getHours(), ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return p(d.getMonth() + 1) + "/" + p(d.getDate()) + "/" + d.getFullYear() + " " + p(h) + ":" + p(d.getMinutes()) + " " + ap;
}

var html =
'<!DOCTYPE html>\n' +
'<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>ETCC Car Show — Registration</title>\n' +
// Plain relative link to the deployed PNG (ftp-deploy.sh uploads it to the
// site root as ETCClogoWhiteBackground.png) rather than an inlined base64
// data URI — same technique SilentAuctionManager's index.html uses for its
// favicon. The full-size logo as a ~26KB inline data URI worked for most
// browsers but is unnecessarily heavy for a favicon; a real file request is
// simpler and matches this club's other apps.
'<link rel="icon" type="image/png" href="ETCClogoWhiteBackground.png">\n' +
// iOS Safari ignores a plain <link rel="icon"> for "Add to Home Screen" (and
// is inconsistent about showing it in the tab bar at all) — it specifically
// wants apple-touch-icon. Same file, no separate asset needed.
'<link rel="apple-touch-icon" href="ETCClogoWhiteBackground.png">\n' +
'<style>\n' + css + '\n</style>\n</head>\n<body>\n' +
'<header class="app">\n' +
'  <div class="hdr-left"><img src="' + logoDataUri + '" alt="ETCC Logo" class="hdr-logo"></div>\n' +
'  <div class="hdr-center"><h1>Car Show Manager</h1></div>\n' +
'  <div class="hdr-right"></div>\n' +
'</header>\n' +
'<div class="wrap">\n' +
'  <div id="app"></div>\n' +
'</div>\n' +
'<footer class="app-footer">\n' +
'  <div class="footer-credit">v' + versionString + ' &middot; Deployed ' + fmtDateTime(deployedAt) +
' &middot; Website by <a href="https://businesswebexpress.com" target="_blank" rel="noopener">Business Web Express</a>' +
' &middot; &copy; 2026 East Tennessee Corvette Club &middot; Knoxville, TN &middot; <a href="mailto:etccwebsite.webmanager@gmail.com">etccwebsite.webmanager@gmail.com</a></div>\n' +
'</footer>\n' +
scripts.map(function (s) { return '<script>\n' + s + '\n</script>'; }).join("\n") +
'\n</body>\n</html>\n';

var out = process.argv[2] || path.join(HERE, "ETCCCarShow.html");
fs.writeFileSync(out, html);
var kb = Math.round(Buffer.byteLength(html) / 1024);
console.log("Wrote " + out + " (" + kb + " KB)");
