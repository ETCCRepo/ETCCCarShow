/* app.js — DOM wiring and rendering for the hosted site. Globals: CarShowConfig,
 * CarShowLogic, Papa, ExcelJS (ExcelJS/Papa are only exercised here via the
 * Developer > Run Regression Tests round-trip, see runRegressionTests()). The
 * Judging Tally Sheet (printTallySheet() below) is plain HTML + window.print(),
 * same as every other report in the app — it does NOT use excel.js/ExcelJS. */
(function () {
  "use strict";
  var CONFIG = window.CarShowConfig;
  var LOGIC = window.CarShowLogic;

  var state = {
    reg: null,   // { name, rows }
    act: null,   // { name, rows }
    result: null,
    sortCol: null,
    sortDir: 1,
    search: "",
    statusFilter: { paid: true, notpaid: false, cancelled: false, empty: false },
    // ---- Car shows (one per year) ----
    // The app holds a completely separate dataset per show year, stored
    // server-side under data/<year>/. index.php inlines the registry and
    // which show (if any) this session has open via ingestShows(). Until a
    // show is open, renderViews() shows the Car Shows picker and nothing
    // else - the same hard gate SilentAuctionManager puts in front of its
    // workflow screens.
    shows: [],            // [{ year, name, status, created }], newest year first
    currentShow: null,    // the show THIS session has open, or null
    publicShowYear: null, // the show the PUBLIC pages write into (shows.json's "current")
    showsError: null,     // last shows.php failure, shown on the picker
    showsBusy: false,     // a shows.php call is in flight
    showPendingDelete: null, // show awaiting delete confirmation, or null
    inCarShowFilter: false, // Registration tab toolbar's "In Car Show" checkbox — when checked, only rows with In Car Show? = Yes are shown
    tab: "sum",
    detailRow: null,  // registration row currently shown in the detail modal, or null
    zoom: 1,          // table zoom level (1 = 100%); lets all columns fit without scrolling
    sponsorZoom: 1,   // sponsor table zoom level
    zoomAutoFitDone: false,        // both tables default to "Fit" once per session (not
    sponsorZoomAutoFitDone: false, // on every tab switch, so a manual zoom choice sticks)
    payments: [],     // sponsor payment records
    menuOpen: false,      // hamburger dropdown
    settingsOpen: false,  // settings modal
    testsPageOpen: false,  // Regression Tests full-page screen (Developer menu)
    testResults: null,    // { results: [{label, ok, expected, actual}], passed, failed } | null
    testRunning: false,
    testOnlyErrors: false,
    sponsors: [],          // filled by ingestSponsors(), called by index.php's boot script
    sponsorsRefreshing: false, // Sponsors tab's "Refresh" button — a fetch in progress
    sponsorSearch: "",
    sponsorTypeFilter: { premier: true, corporate: true, individual: true },
    sponsorPaidFilter: "all", // "all" | "paid" | "unpaid"
    sponsorSortCol: null, // one of SPONSOR_COLS[].key, or null for the default (by name)
    sponsorSortDir: 1,
    sponsorEditing: null,  // sponsor record being added/edited in the form modal, or null
    sponsorPaymentOpen: false, // sponsor payment recording modal
    sponsorPaymentSponsorId: null, // which sponsor the payment modal is for
    sponsorPaymentError: null, // error message in payment modal
    sponsorSyncError: null, // set when a push to the server fails; shown in the Sponsors tab
    clearSponsorsOpen: false, // "Remove All Sponsors" confirmation modal
    importHelp: null, // Setup tab's "❓ Instructions" modal — { title, steps } or null when closed
    sponsorSelected: {},    // id -> true, for the Sponsors tab's row checkboxes
    deleteSelectedOpen: false, // "Delete selected sponsors" confirmation modal
    developerLoginOpen: false, // "Developer Login" full-page screen (see openDeveloperLogin())
    developerVerifying: false, // password check in flight
    developerUnlocked: false,  // password verified this page load — reveals Settings/Regression Tests/Change Log/API
    developerError: null,      // developer password error message, or null
    changelogOpen: false,      // "Change Log" full page (Developer submenu)
    changelogLoading: false,
    changelogError: null,
    changelogMeta: null,       // { repo, ftp, files, filesDeployed, loc, totalChanges } once loaded
    changelogCommits: null,    // [{ sha, date, time, subject, body, version }] once loaded
    walkins: [],           // manually-added Walk-In Member/Nonmember registrations — filled by
                            // ingestWalkins(), called by index.php's boot script; server-synced
                            // the same way state.sponsors is, independent of the loaded CSVs
    walkinSyncError: null, // set when a push to the server fails; shown in the Add Registration modal
    addRegOpen: false,      // "+ Add Registration" form modal (Registration tab)
    members: [],            // ETCC member roster ({name, lastName, firstName, memberNumber,
                             // phone, email, address, city, state, zip}, whichever the last
                             // import's CSV had columns for) — filled by ingestMembers(); used by
                             // the Add Registration form to fill the whole form by looking up a
                             // Walk-In Member's name (see members-import.php)
    appSettings: {          // filled by ingestAppSettings(); see app-settings.php. Defaults here
                             // are just a fallback for the brief window before that hook runs —
                             // app-settings.php's own $defaults is the real source of truth.
      walkinFirstNonMember: 2000,
      walkInCarShowFee: 50,
      walkInNonCarShowFee: 0,
      preregistrationFee: 40,
      externalApiKey: "",
      windowCardPdf: "",
      tshirtVendorEmail: "",
      tshirtEventPurchaseCost: 0,
      sponsorEmailTo: "",
      sponsorEmailCc: "",
      sponsorEmailBcc: "",
      sponsorEmailSubject: "New Sponsor Submission",
      eventUrl: "",
      autoImportEnabled: false,
      autoImportTimes: [],
      autoImportIntervalHours: 0,
      autoImportStartDate: "",
      autoImportEndDate: "",
      // Reports tab > Sponsor Report builder — the officer-customized column
      // list (array of SPONSOR_COLS keys, in print order), plus a multi-level
      // sort ([{key,dir}], see sponsorReportSortLevels()). An empty column
      // list means "never customized"; sponsorReportColumns() falls back to
      // SPONSOR_REPORT_DEFAULT_KEYS.
      sponsorReportColumns: [],
      sponsorReportSortCols: [{ key: "regDate", dir: "asc" }]
    },
    appSettingsSaving: false,
    appSettingsError: null,   // set when a Settings save fails; shown in the Settings modal
    appSettingsSaved: false,  // brief "Saved" confirmation after a successful save
    // Setup tab > Import Schedule — separate save state from the Settings
    // modal's above (different section of the page, explicit Save button
    // rather than per-field autosave, so this can safely re-render the whole
    // Setup tab on completion without risking the modal's focus-stealing bug).
    importScheduleSaving: false,
    importScheduleError: null,
    importScheduleSaved: false,
    // Setup tab > Import Schedule > "Import Now" button — brief inline status
    // text ("Requested — the next check will run within ~15 minutes." /
    // an error), cleared on next render pass through a fresh click.
    importRequestStatus: null,
    // Setup tab > Setup > "Import Members" > "View Log" — server-side log of
    // every member-roster import (member-import-history.php; written by
    // members-import.php). Null until first opened/loaded, then an array of
    // {timestamp, count}. Never purged — see lib.php's own comment on why.
    memberImportLogPanelOpen: false,
    memberImportLogList: null,
    memberImportLogLoading: false,
    memberImportLogError: null,
    // Setup tab > Backups > "Backup Now" — brief inline status text
    // ("Running…" / "Succeeded — N files, X KB." / "Failed: ..."), cleared on
    // next render pass through a fresh click. Same pattern as
    // importRequestStatus above.
    backupRunning: false,
    backupRunStatus: null,
    // Setup tab > Backups > auto-backup schedule (backup.php
    // get_schedule/save_schedule; actual daily trigger is server-side, see
    // lib.php's carshow_backup_auto_check()) — same enable-checkbox +
    // active-date-range UX as the Import Schedule's own auto-import
    // settings. Null until loaded (on Setup tab select, alongside
    // loadRunStatus()); lastAutoRunDate is server-owned bookkeeping, shown
    // read-only, never sent back on save.
    backupSchedule: null,
    backupScheduleSaving: false,
    backupScheduleError: null,
    backupScheduleSaved: false,
    // Setup tab > Backups > "View Logs" — server-side backup-history.json
    // (see backup.php); null until first opened/loaded, then an array of
    // {timestamp, status, fileName, sizeBytes, fileCount, error}. Never
    // purged server-side (unlike the sync-run logs above) — see backup.php's
    // own comment on why the log entries outlive the zip files they describe.
    backupsPanelOpen: false,
    backupsList: null,
    backupsLoading: false,
    backupsError: null,
    deleteBackupConfirm: null, // timestamp of the backup log entry pending delete confirm, or null
    deleteBackupError: null,   // e.g. "it's the only backup left" — shown in the confirm modal
    // Setup tab > Backups > per-row "↺ Restore" — see openRestoreConfirm()
    // etc. below. restoreConfirm holds the timestamp of the backup log entry
    // being restored (or null); restoreYears is that specific backup's
    // contents (backup.php action=get_backup_years), loaded fresh each time
    // the modal opens rather than cached, since it's a property of the file.
    restoreConfirm: null,
    restoreYears: null,
    restoreYearsLoading: false,
    restoreYearsError: null,
    restoreScope: "",  // "" = everything; else one of restoreYears[].year
    restoreRunning: false,
    restoreError: null,
    // Setup tab > Import Schedule > "View Logs" — server-archived log files
    // (see logs.php); null until first opened/loaded, then an array of
    // {name, size, mtime}. Purged server-side after 7 days.
    logsPanelOpen: false,
    logsList: null,
    logsLoading: false,
    logsError: null,
    // Setup tab > Import Schedule > persisted "Last run" status (see
    // import-schedule.php's mark_start/mark_run/run_status actions) —
    // {startedAt, reason, completedAt, status, error, logFile} | null.
    // Unlike importRequestStatus above (one click's own ephemeral status,
    // reset on reload), this survives reloads and reflects whichever run
    // happened most recently, manual or scheduled.
    runStatus: null,
    // Set true when checkForNewVersion() detects the live site has been
    // redeployed since this page was loaded — shows a "refresh to update"
    // banner rather than forcing a reload, since an officer could be
    // mid-edit somewhere. See that function's own comment for why this is
    // needed at all (Hostinger's edge/CDN and mobile browsers can hold onto
    // an old page for a surprisingly long time).
    newVersionAvailable: false,
    // Setup tab > Import Schedule > "Automation" line — ISO timestamp of the
    // last time the Windows scheduled task (deploy/sync-registrations.js) polled import-schedule.php's
    // check action (its heartbeat). Null until loadRunStatus() fetches it.
    // A stale value is the only way this app can tell the task isn't running
    // at all, since that failure never reaches mark_start/mark_run.
    lastPollAt: null,
    apiPageOpen: false,       // Developer > API full-page screen
    apiKeyRevealed: false,
    apiTesting: false,
    apiTestResult: null,      // { status, ok, bodyText } | null
    apiRotating: false,
    apiRotateError: null,
    windowCardUploading: false,
    windowCardError: null,
    windowCardPdfVersion: 0, // bumped on every successful upload, for cache-busting the fetch() that fills it
    emailTo: "",              // editable To recipient; defaulted from tshirtVendorEmail when opened
    emailSubject: "",         // editable; defaulted when T-Shirts tab is opened
    emailBody: "",            // editable; defaulted when T-Shirts tab is opened
    emailCc: "",              // editable CC recipients
    emailBcc: "",             // editable BCC recipients
    emailSending: false,
    emailSendError: null,
    emailSent: false,         // brief "Sent!" confirmation after a successful send
    tshirtOrderPageOpen: false, // T-Shirts tab > "T-Shirt Order Email" full-page screen
    tshirtPurchasePageOpen: false, // T-Shirts tab > "Order T-Shirt" full-page screen
    // Reports tab > "Sponsor Report" full-page screen — a live print preview
    // (left) beside a column/sort builder (right). The layout itself lives in
    // appSettings (persisted per show, see sponsorReportColumns()); only the
    // open flag and the in-flight drag live here.
    sponsorReportPageOpen: false,
    sponsorReportDragKey: null, // key of the Selected-column row currently being dragged
    // Registration/Member/T-Shirt Report full-page screens — same "preview +
    // builder" pattern as Sponsor Report above, generalized (see
    // REG_REPORT_SPEC / genReportColumns() etc.). regReportDragKey/
    // memberReportDragKey/tshirtReportDragKey are set dynamically by
    // buildGenReportColumnRow() using each spec's own key.
    regReportPageOpen: false,
    memberReportPageOpen: false,
    tshirtReportPageOpen: false,
    carshowReportPageOpen: false,
    tshirtPurchases: [],       // day-of-event walk-up sales — filled by ingestTshirtPurchases()
    importHistory: [],        // one entry per successful CSV import — filled by ingestImportHistory()
    historySelected: {},       // History tab row checkboxes: entry.timestamp -> true
    deleteHistoryConfirm: null, // "selected" | "all" | null — which confirm dialog is open
    // Financials tab — { id, category, amount, notes }[] for the currently
    // open show year, loaded once per session the first time that tab is
    // opened (see buildTabs()'s "financials" case) rather than as part of
    // the shared boot payload. Autosaves the whole list on every edit, no
    // Save button — same convention as the Import Schedule/Backups sections.
    financials: [],
    financialsLoaded: false,
    financialsLoading: false,
    financialsSaving: false,
    financialsSaved: false,
    financialsError: null,
    // Financials tab > "Upload Report" — client-side PDF parsing (see
    // handleFinancialsPdfUpload()). Every category it finds is appended
    // straight onto state.financials and saved — no separate review step;
    // an unwanted category is just deleted afterward like any other row.
    financialsUploadParsing: false,
    financialsUploadError: null,
    // Financials tab (main list) — which saved categories currently have
    // their transaction-detail list expanded, keyed by item id. Kept outside
    // state.financials itself since that array gets wholesale-replaced by
    // whatever the server echoes back on every save.
    financialsExpandedIds: {},
    // Financials tab navigation — the tab opens on a three-choice menu
    // (Import / View / Project), not straight into an editor:
    //   "menu"   → buildFinancialsMenu()
    //   "picker" → buildFinancialsPicker(), listing this show's live
    //              financials plus every saved report to pick from;
    //              financialsPickerMode says which choice opened it
    //   "editor" → buildFinancialsEditor(), showing financialsEditItems
    // financialsSource records WHERE the editor's items came from, which is
    // also where its saves go back to: { kind: "live" } is this show's own
    // financials.json, { kind: "report", id, label } is one saved snapshot.
    // financialsProjecting = "Project" mode: every existing field is
    // read-only and a separate editable Projected amount sits beside it.
    // financialsSource always carries the show year it belongs to, since
    // this tab can open a PAST show's financials, and every save has to go
    // back to that year's own file rather than the open show's.
    financialsScreen: "menu",
    financialsPickerMode: "view",
    financialsSource: { kind: "live", year: "" },
    financialsEditItems: [],
    financialsProjecting: false,
    // Every show's financials + saved reports, for the picker (financials.php's
    // list_all). Refetched each time the picker opens, so counts can't go
    // stale behind a save.
    financialsAll: [],
    financialsAllLoading: false,
    financialsAllLoaded: false,
    financialsAllError: null,
    // Financials tab > "Save Report" — named, timestamped snapshots of a
    // whole financials list, kept per show year separately from that year's
    // own live list (see financials.php's save_report/update_report/
    // delete_report actions). They reach the UI through financialsAll above,
    // which is what the View/Project picker lists.
    financialsSavingReport: false,
    // rowKey(r) -> integer Dash # (the judging-day placard number, e.g. 100,
    // 101, 200...) — assigned once per car by ensureDashNumbers() and then
    // never changed, since it's the number physically printed on that car's
    // window card. Filled by ingestDashNumbers(); see App/deploy/dash-numbers.php.
    dashNumbers: {},
    dashNumberSyncError: null,
    tshirtPurchaseName: "",    // Order T-Shirt form's in-progress Name field
    tshirtPurchaseCost: "",    // Order T-Shirt form's in-progress Cost field (defaults from settings when opened)
    tshirtPurchaseReason: "Walk-in", // Order T-Shirt form's in-progress Reason field (Walk-in/Member)
    tshirtPurchaseSize: "",    // Order T-Shirt form's in-progress T-Shirt Size field (e.g. "Men's Large")
    tshirtPurchasePaymentType: "Cash", // Order T-Shirt form's in-progress Payment Type field
    tshirtPurchaseCheckNum: "", // Order T-Shirt form's in-progress Check # field (only used when Payment Type is Check)
    tshirtPurchaseSyncError: null, // set when persisting an add/delete fails
    deletedCsvKeys: {},       // csvRegKey(rec) -> true, for CSV-derived rows removed via the
                               // Registration tab's checkbox/bulk-delete — filled by
                               // ingestDeletedRegistrations(); excluded from state.result.registrations
                               // in regenerate(), so they stay gone across reloads/re-imports too
    deletedSponsorIds: {},     // csvSponsorId(rec) -> true, for CSV-auto-synced sponsors removed via
                               // the Sponsors tab's Delete — filled by ingestDeletedSponsors() and by
                               // refreshSponsorsFromServer(); excluded by syncSponsorsFromRegistrations()
                               // so they stay gone across reloads/refreshes/re-imports too
    regSelected: {},           // rowKey(r) -> true, for the Registration tab's row checkboxes
    deleteRegSelectedOpen: false, // "Delete selected registrations" confirmation modal
    regDeleteSyncError: null,  // set when persisting a CSV-row deletion fails
    csvOverrides: {},          // csvRegKey(rec) -> patch object, for CSV-derived rows edited via
                                // the detail modal's Edit mode — filled by
                                // ingestRegistrationOverrides(); applied on top of
                                // state.result.registrations in regenerate(), so edits survive
                                // reloads/re-imports too (see registration-overrides.php)
    detailEditError: null      // set when saving a detail-modal edit fails
  };

  // Populated in init() below from window.__carshowSite, which
  // deploy/index.php injects as { sponsorsApiUrl: "...", walkinsApiUrl: "..." }
  // in the very first inline script, before app.js runs. Read inside init()
  // rather than at module-load time, since init() is what's guaranteed to run
  // after every inline script in the document, including this one. The Sponsors tab is
  // server-authoritative: state.sponsors is fetched fresh (via
  // ingestSponsors(), called by index.php's boot script), and every
  // add/edit/delete is pushed straight to sponsorsApiUrl — so every officer
  // viewing the site sees the same live list.
  var SITE_CONFIG = {};
  // Setup tab > Import Schedule > "Import Now" polling timer handle — plain
  // module var, not app state, since it's a live JS interval id rather than
  // anything rendered. See requestImportNow()/pollImportRequestStatus() below.
  var importRequestPollTimer = null;

  var NUMERIC_BASE = { "Reg #": 1, "Total Fee": 1, "Individual Sponsorship": 1, "Year": 1, "#": 1 };
  // These headers are far wider than their data (a few digits, "Yes"/"No") —
  // force-wrapping them onto two lines shrinks the column to fit the data
  // instead of the label, narrowing the overall row width.
  var NARROW_HEADER_COLS = { "Individual Sponsorship": 1, "In Car Show?": 1 };
  var CURRENCY_COLS = { "Total Fee": 1, "Individual Sponsorship": 1 };
  // The one currency formatter every money value in this app should go
  // through — always 2 decimals, comma-grouped for anything over 999 (e.g.
  // Summary's Total Income), so no field shows a bare "$845" next to
  // another showing "$845.00".
  function fmtMoney(v) { return v === "" || v == null ? "" : "$" + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  // Phone display formatting reuses LOGIC.formatPhone (logic.js) — the same
  // function generate() already runs CSV/manual registration phones
  // through — instead of a separate app.js copy, so there's one
  // implementation and one regression-tested set of rules for both.
  // Sponsors' phones (CSV auto-sync, member-sponsor-form.php submissions) never
  // flow through generate(), so this call is still needed for those; for
  // Registration rows it's a harmless no-op re-format of an already-
  // formatted value.
  function fmtPhone(v) { return v == null || v === "" ? v : LOGIC.formatPhone(v); }
  // "Reg Date" comes straight from the ClubExpress CSV export as an unpadded,
  // seconds-included string (e.g. "7/8/2026 7:55:00 AM") — reformat it through
  // fmtDate() (defined below) so it lines up with every other date/time shown
  // in the app (2-digit month/day/hour, no seconds).
  var DATE_COLS = { "Reg Date": 1 };
  function fmtCsvDate(v) {
    if (v == null || v === "") return v;
    var d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return fmtDate(d);
  }
  function isShirtCol(c) { return state.result && state.result.shirtColumns.indexOf(c) !== -1; }
  function isNumericCol(c) { return NUMERIC_BASE[c] || isShirtCol(c); }

  // ---------- status filter ----------
  // ClubExpress "Status" values collapse into 4 buckets for the filter: an
  // exact "Paid"/"Cancelled" match, blank (no status), or anything else counts
  // as Not Paid (covers "Not paid in time limit", "Open", etc.).
  var STATUS_BUCKETS = [
    { key: "paid", label: "Paid" },
    { key: "notpaid", label: "Not Paid" },
    { key: "cancelled", label: "Cancelled" },
    { key: "empty", label: "Empty" }
  ];
  function classifyStatus(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return "empty";
    var low = s.toLowerCase();
    if (low === "cancelled") return "cancelled";
    if (low === "paid") return "paid";
    return "notpaid";
  }

  // ---------- shirts: 24 sparse columns collapsed into one summary column ----------
  var SHIRTS_COL = "__shirts";
  var GROUP_SHORT = null; // lazy-built from CONFIG.GROUPS: "Men's Free" -> "M Free", "Men's Xtra" -> "M Purchased", etc.
  function groupShort(groupKey) {
    if (!GROUP_SHORT) {
      GROUP_SHORT = {};
      // "Xtra" reads as "Purchased" here too (same rename as shirtMatrix()'s
      // column headers) — g.label itself stays "Men's Xtra"/etc., since it's
      // also the literal CSV column-name prefix (config.js's SHIRT_BUCKETS)
      // used for import matching well beyond this display.
      CONFIG.GROUPS.forEach(function (g) {
        GROUP_SHORT[g.key] = g.label.replace("Men's", "M").replace("Women's", "W").replace("Xtra", "Purchased");
      });
    }
    return GROUP_SHORT[groupKey];
  }
  // Every shirt bucket this row has 1+ of, as { label, qty } — used by both the
  // table's compact summary cell and the detail modal's full breakdown.
  function shirtSummaryParts(row) {
    var parts = [];
    CONFIG.SHIRT_BUCKETS.forEach(function (b) {
      var qty = Number(row[b.col]) || 0;
      if (qty > 0) parts.push({ label: groupShort(b.groupKey) + " " + b.sizeKey, qty: qty });
    });
    return parts;
  }
  function shirtSummaryText(row) {
    return shirtSummaryParts(row).map(function (p) { return p.label + (p.qty > 1 ? " ×" + p.qty : ""); }).join(", ");
  }
  function shirtTotal(row) {
    return shirtSummaryParts(row).reduce(function (sum, p) { return sum + p.qty; }, 0);
  }
  // "SM"/"MED"/etc -> "Small"/"Medium"/etc — used by the T-Shirt Report's
  // per-size rows (see TSHIRT_REPORT_SPEC) for a spelled-out size, rather
  // than shirtSummaryText()'s compact "M Free SM" form meant for a narrow
  // table cell.
  var SIZE_LABEL_BY_KEY = null;
  function sizeLabel(sizeKey) {
    if (!SIZE_LABEL_BY_KEY) {
      SIZE_LABEL_BY_KEY = {};
      CONFIG.SIZES.forEach(function (s) { SIZE_LABEL_BY_KEY[s.key] = s.label; });
    }
    return SIZE_LABEL_BY_KEY[sizeKey] || sizeKey;
  }

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  // A money input always shown with a "$" prefix, so every dollar figure an
  // officer types looks like currency, not a bare number (this used to only
  // exist on the Order T-Shirt Cost field — every other money input lacked it).
  // Returns { input, wrap } — append wrap, read/write input as usual.
  function moneyInput(attrs) {
    attrs = attrs || {};
    attrs.type = attrs.type || "number";
    if (attrs.type === "number") {
      attrs.step = attrs.step || "0.01";
      attrs.min = attrs.min || "0";
    }
    attrs.placeholder = attrs.placeholder || "0.00";
    attrs.style = (attrs.style ? attrs.style + "; " : "") + "padding-left:20px; width:100%";
    var input = el("input", attrs);
    var wrap = el("div", { style: "position:relative; flex:1" }, [
      el("span", { style: "position:absolute; left:8px; top:50%; transform:translateY(-50%); color:#666", text: "$" }),
      input
    ]);
    return { input: input, wrap: wrap };
  }

  function debounce(fn, delay) {
    var timeoutId = null;
    return function () {
      var args = arguments;
      var context = this;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(function () { fn.apply(context, args); }, delay);
    };
  }

  // generatedAt defaults to "now", but callers with a real known ingestion
  // time — index.php's boot script, replaying the CSVs it stored on this
  // page load — should pass it explicitly so "CSVs loaded:" reflects when
  // the export actually happened, not whenever a visitor opens the page.
  function regenerate(generatedAt) {
    if (!state.reg) { state.result = null; renderViews(); return; }
    state.result = LOGIC.generate(state.reg.rows, state.act ? state.act.rows : [], {
      regFileName: state.reg.name,
      actFileName: state.act ? state.act.name : "",
      generatedAt: generatedAt || new Date()
    });
    // Exclude rows removed via the Registration tab's checkbox/bulk-delete,
    // then re-apply any detail-modal field edits, then backfill Spouse First
    // Name from the member roster — generate() has no notion of any of the
    // three, so all run against its fresh output every time. Order matters:
    // all three must run before syncSponsorsFromRegistrations() so a
    // deleted/edited/backfilled row's Individual Sponsorship (Text) is
    // reflected in the sync.
    if (state.result.ok) {
      state.result.registrations = state.result.registrations
        .filter(function (r) { return !state.deletedCsvKeys[csvRegKey(r)]; })
        .map(function (r) {
          var patch = state.csvOverrides[csvRegKey(r)];
          return patch ? applyRecordPatch(r, patch) : r;
        })
        .map(fillSpouseFirstNameFromRoster);
    }
    state.sortCol = null; state.sortDir = 1;
    syncSponsorsFromRegistrations();
    // A CSV (re)import can introduce brand-new Individual Sponsorship
    // registrants — backfill their payment record (Credit Card/$100/regDate)
    // immediately so the Sponsors tab's payment columns aren't blank until
    // the next full page load re-runs ingestPayments(). See also
    // upsertSponsor()'s own call, which covers the "+ Add Sponsor"/Edit
    // Sponsor path (individual sponsor added directly, not via CSV).
    backfillSponsorDonations();
    backfillPaymentDefaults();
    syncPaidRegistrationsCache();
    renderViews();
  }

  // Any registrant with a nonzero Individual Sponsorship fee becomes a real
  // row in the Sponsors tab (type "individual"), so they're counted in the
  // Summary tab's Individual Sponsors card instead of a separate raw-CSV
  // figure. Insert-only, matched by a stable id — reloading the same CSVs
  // never creates duplicates, and never overwrites a sponsor an officer has
  // since edited by hand (e.g. added a website).
  //
  // The id is derived from Reg Date + name, NOT Reg #: non-member
  // registrants get a Reg # auto-assigned fresh by generate() on
  // every load (see regenerate() -> LOGIC.generate()), and that assignment
  // depends on row order, so the same numeric value could mean a different
  // person on a re-export. Reg Date (the registration transaction's own
  // timestamp) plus name is stable for the same person's same registration
  // across exports, and distinct across different people.
  // Stable identity for a CSV-derived registration row across re-exports —
  // shared by csvSponsorId() below (prefixed, its own namespace) and the
  // Registration tab's checkbox-delete and detail-modal-edit features
  // (unprefixed, used directly as a key into state.deletedCsvKeys/
  // state.csvOverrides — see rowKey()).
  function csvRegKey(rec) {
    var raw = String(rec["Reg Date"] || "") + "_" + String(rec["Last Name"] || "") + "_" + String(rec["First Name"] || "");
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  }
  function csvSponsorId(rec) { return "csvind_" + csvRegKey(rec); }

  // Merges an edit patch onto a copy of a record, recomputing Gen if Year was
  // part of the patch (Gen is derived, never directly editable — see
  // EDITABLE_FIELDS/renderDetailModal), and re-applying the Individual
  // Sponsorship Text default in case the edit is what pushed Individual
  // Sponsorship above 0 (see applySponsorshipTextDefault — a no-op if Text is
  // already set, whether that's from a prior default or an officer's own
  // edit). Shared by regenerate() (re-applying a persisted CSV-row edit every
  // load) and the detail modal's Save handler (building the just-edited
  // record to show immediately, before the next reload).
  function applyRecordPatch(rec, patch) {
    var merged = {};
    Object.keys(rec).forEach(function (k) { merged[k] = rec[k]; });
    Object.keys(patch).forEach(function (k) { merged[k] = patch[k]; });
    if (Object.prototype.hasOwnProperty.call(patch, "Year")) {
      merged["Gen"] = LOGIC.genFromYear(LOGIC.toInt(patch["Year"]));
    }
    LOGIC.applySponsorshipTextDefault(merged);
    return merged;
  }

  // Backfills Spouse First Name from the member roster (members-data.json,
  // via Setup > Import Members) for a CSV-imported registration whose
  // own Reg # (the registrant's real ETCC member number) matches a
  // roster entry with a spouseFirstName on file — see members-import.php's
  // comment. Insert-only, same as applySponsorshipTextDefault: never
  // overwrites an officer's own detail-modal edit. Non-members (an
  // auto-assigned placeholder Reg #) never match any roster entry,
  // which is correct — there's no roster record to backfill from. Skips the
  // fill (leaves it blank) if the roster's spouseFirstName is the same as
  // the registrant's own First Name (case-insensitive) — some roster rows
  // for a single member carry their own name in that column rather than
  // leaving it blank, which would otherwise read as a self-referential
  // "spouse". Routed through applyRecordPatch so Individual Sponsorship
  // Text's own default recomputes too, in case a spouse name showing up is
  // what makes "First and Spouse Last" possible for a sponsor whose text is
  // still blank.
  function fillSpouseFirstNameFromRoster(rec) {
    if (rec["Spouse First Name"]) return rec;
    var num = Number(rec["Reg #"]);
    if (!num) return rec;
    var match = state.members.filter(function (m) { return Number(m.memberNumber) === num; })[0];
    if (!match || !match.spouseFirstName) return rec;
    var spouse = String(match.spouseFirstName).trim();
    var own = String(rec["First Name"] || "").trim();
    if (spouse.toLowerCase() === own.toLowerCase()) return rec;
    return applyRecordPatch(rec, { "Spouse First Name": spouse });
  }

  function syncSponsorsFromRegistrations() {
    if (!state.result || !state.result.ok) return;
    var byId = {};
    state.sponsors.forEach(function (s) { byId[s.id] = s; });
    state.result.registrations.forEach(function (rec) {
      var fee = rec["Individual Sponsorship"];
      if (fee === "" || fee == null || Number(fee) <= 0) return;
      var id = csvSponsorId(rec);
      if (state.deletedSponsorIds[id]) return;
      var existing = byId[id];
      if (existing) {
        // Backfill Reg Date / Ind. Spon. Text on sponsors synced before those
        // columns existed. Reg Date is safe to patch unconditionally — it's
        // derived, system-set data nobody hand-edits. Ind. Spon. Text is only
        // backfilled the one time it's missing; afterward it's insert-only
        // like every other copied field (phone, email, Member, ...), so an
        // officer's own edit to a sponsor's displayed acknowledgment text
        // survives future re-syncs.
        var patch = {};
        if (!existing.regDate && rec["Reg Date"]) patch.regDate = rec["Reg Date"];
        if (!existing.individualSponsorshipText && rec["Ind. Spon. Text"]) patch.individualSponsorshipText = rec["Ind. Spon. Text"];
        if (Object.keys(patch).length) {
          var patched = {};
          Object.keys(existing).forEach(function (k) { patched[k] = existing[k]; });
          Object.keys(patch).forEach(function (k) { patched[k] = patch[k]; });
          byId[id] = patched;
          upsertSponsor(patched);
        }
        return;
      }
      var cityStateZip = [rec["City"], rec["State"]].filter(Boolean).join(", ") + (rec["Zip"] ? " " + rec["Zip"] : "");
      var sponsorName = (rec["Last Name"] || "") + (rec["First Name"] ? ", " + rec["First Name"] : "");
      var isMember = Number(rec["Reg #"]) < CONFIG.firstNonMember;
      upsertSponsor({
        id: id,
        name: sponsorName,
        regDate: rec["Reg Date"] || "",
        contactPerson: "",
        phone: rec["Phone"] || "",
        email: rec["Email"] || "",
        address: [rec["Address"], cityStateZip].filter(Boolean).join(", "),
        website: "",
        etccMemberName: isMember ? sponsorName : "",
        sponsorType: "individual",
        shirtSize: rec._sponsorShirtSize || "",
        individualSponsorshipText: rec["Ind. Spon. Text"] || ""
      });
    });
  }

  // ---------- views ----------
  // NOTE: do not reintroduce JS-measured table heights here. Two attempts
  // (2026-09-12) both made this worse on real devices:
  //   1. window.innerHeight - table.top: produced a uniformly tiny height.
  //   2. footer.top - table.top: CIRCULAR — the footer sits below the table,
  //      so its position depends on the table's current height. A small
  //      table keeps the footer high, which computes an even smaller height
  //      on the next render, collapsing progressively (iPad went 5 rows ->
  //      2 rows). Desktop happened to stabilize; iPad did not.
  // Sizing lives in styles.css (.tablewrap) as plain CSS, where it's
  // deterministic and can't feed back on itself.
  function renderViews() {
    var app = $("#app");
    app.innerHTML = "";

    if (state.newVersionAvailable) {
      var refreshLink = el("a", { href: "#" }, ["Refresh now"]);
      refreshLink.addEventListener("click", function (e) { e.preventDefault(); location.reload(); });
      app.appendChild(el("div", {
        class: "no-print",
        style: "background:#fff8e6; border:1px solid #f0d58c; border-radius:8px; padding:8px 14px; margin-bottom:12px; font-size:13px"
      }, ["🔄 A newer version of this app has been deployed. ", refreshLink, " to get the latest (your place won't be lost — reopen the same show after)."]));
    }

    // The Car Shows picker is the landing screen: every session starts here
    // and stays here until a show is opened. Nothing below this point makes sense
    // without one: every tab reads data belonging to a specific year, and
    // index.php deliberately ships none of it until a show is selected.
    if (!state.currentShow) {
      app.appendChild(buildShowsPage());
      renderDeleteShowConfirm();
      return;
    }

    app.appendChild(buildTabs());

    // Sponsors are manually entered and independent of the loaded CSVs, so
    // this tab works even before a registration CSV pair has been imported.
    if (state.tab === "sponsors") {
      app.appendChild(buildSponsorsToolbar());
      app.appendChild(buildSponsorsView());
      return;
    }

    // T-Shirts tab shows email composer and report; also works without CSV data.
    if (state.tab === "tsh") {
      app.appendChild(buildTshirtView());
      return;
    }

    // Reports tab is just a launcher into the four full-page report screens
    // below; also works without CSV data (each report screen handles its own
    // empty state).
    if (state.tab === "reports") {
      app.appendChild(buildReportsView());
      return;
    }

    // Setup tab — the officer-facing home for the import pages (members,
    // registrations, flyer). Each opens its own standalone PHP page; all are
    // gated server-side by the main login session, so no CSV data or
    // Developer unlock is needed to reach them.
    if (state.tab === "setup") {
      app.appendChild(buildSetupView());
      return;
    }

    // History tab — a log of every successful registration-data import for
    // this show (timestamp, row counts, source). Independent of whether a
    // CSV pair is currently loaded, same reasoning as Sponsors/T-Shirts/
    // Reports/Setup above.
    if (state.tab === "history") {
      app.appendChild(buildHistoryView());
      return;
    }

    // Financials tab — a short, hand-entered expense summary for this show
    // year (see financials.php's own header comment for why this is a
    // summary, not a transaction ledger). Manually entered and independent
    // of the loaded CSVs, same reasoning as Sponsors/T-Shirts above.
    if (state.tab === "financials") {
      app.appendChild(buildFinancialsView());
      return;
    }

    if (!state.result) {
      app.appendChild(el("div", { class: "empty-state" },
        ["No registration data loaded yet — use the Setup tab → Import Registrations to load the first CSV export."]));
      return;
    }
    if (!state.result.ok) {
      app.appendChild(el("div", { class: "panel" }, [
        el("h3", { text: "Could not generate" }),
        el("ul", { class: "messages" }, state.result.messages.map(function (m) { return el("li", { text: m }); }))
      ]));
      return;
    }
    if (state.tab === "reg") app.appendChild(buildLoadedInfo());
    if (state.tab === "reg" && state.regDeleteSyncError) {
      app.appendChild(el("div", { class: "messages", style: "margin-bottom:10px" }, [state.regDeleteSyncError]));
    }
    if (state.tab === "reg" && state.dashNumberSyncError) {
      app.appendChild(el("div", { class: "messages", style: "margin-bottom:10px" }, [state.dashNumberSyncError]));
    }
    var toolbar = state.tab === "reg" ? buildRegToolbar() : buildSummaryToolbar();
    app.appendChild(toolbar);
    app.appendChild(state.tab === "reg" ? buildRegView() : buildSummaryView());
  }

  function buildTabs() {
    var mk = function (id, label) {
      var t = el("div", { class: "tab" + (state.tab === id ? " active" : ""), text: label });
      t.addEventListener("click", function () {
        state.tab = id;
        renderViews();
        // Every tab re-pulls the show's data on selection — a scheduled or
        // manual import (or another officer's edit) that landed after this
        // page was opened should show up without a full reload, on whichever
        // tab you're looking at, not just History/Setup.
        refreshShowData();
        // Setup tab additionally needs the persisted "Last run" status,
        // which isn't part of the general show-data refresh above.
        if (id === "setup") { loadRunStatus(); loadBackupSchedule(); }
        // Financials isn't part of carshow_boot_data()'s inlined payload
        // (see financials.php's own comment on why it's a separate file) —
        // load fresh, once, the first time this tab is opened this session.
        if (id === "financials") {
          // Selecting the tab always lands back on its Import/View/Project
          // menu, so a half-finished editor from earlier in the session isn't
          // what greets you on the way back.
          state.financialsScreen = "menu";
          state.financialsSource = { kind: "live", year: financialsCurrentYear() };
          if (!state.financialsLoaded) loadFinancials();
        }
      });
      return t;
    };
    return el("div", { class: "tabs no-print" }, [mk("sum", "Summary"), mk("reg", "Registration"), mk("sponsors", "Sponsors"), mk("tsh", "T-Shirts"), mk("reports", "Reports"), mk("setup", "Setup"), mk("history", "History"), mk("financials", "Financials")]);
  }

  // ---------- Car Shows picker (the landing screen, shown before the tabs) ----------
  // Modeled on SilentAuctionManager's home auctions list. Opening a show is a
  // full page load (?year=NNNN) rather than a client-side swap: index.php
  // re-inlines every dataset from scratch on each request, so a reload gets
  // the new year's data with no chance of one show's records lingering in
  // memory alongside another's.

  // The header bar and browser tab both name the show that's open, so it's
  // obvious at a glance which year is being edited — the single most
  // important thing to get wrong now that there's more than one. Both fall
  // back to the plain product name on the picker, where no show is open.
  // build.js ships that plain name as the static markup, so this only ever
  // needs to write over it.
  function applyShowTitle() {
    var year = state.currentShow ? String(state.currentShow.year) : "";
    var heading = year ? year + " Car Show Manager" : "Car Show Manager";
    var h1 = document.querySelector("header.app h1");
    if (h1) h1.textContent = heading;
    document.title = year ? year + " ETCC Car Show — Registration" : "ETCC Car Show — Registration";
  }

  function openShow(year) { location.href = "?year=" + encodeURIComponent(year); }
  function closeShow() { location.href = "?year="; }

  // Every mutation goes through shows.php and then adopts the list it returns,
  // rather than patching state locally the way the sponsor/walk-in pushes do.
  // The registry is tiny, these actions are rare and deliberate, and a wrong
  // local guess here would show the officer a car show that doesn't exist (or
  // hide one that does).
  function pushShowAction(payload, onDone) {
    if (!SITE_CONFIG.showsApiUrl) return;
    state.showsBusy = true;
    state.showsError = null;
    renderViews();
    fetch(SITE_CONFIG.showsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      state.showsBusy = false;
      if (!r.ok || !r.data || !r.data.ok) {
        state.showsError = (r.data && r.data.error) || "That did not work - please try again.";
        renderViews();
        return;
      }
      state.shows = Array.isArray(r.data.shows) ? r.data.shows : [];
      state.publicShowYear = r.data.current ? String(r.data.current) : null;
      renderViews();
      if (onDone) onDone(r.data);
    }).catch(function () {
      state.showsBusy = false;
      state.showsError = "Could not reach the server - check your connection and try again.";
      renderViews();
    });
  }

  function createShow() {
    var year = prompt("What year is this car show?", String(new Date().getFullYear()));
    if (year === null) return;
    year = LOGIC.validShowYear(year);
    if (year === null) {
      state.showsError = "Enter a four-digit year, for example 2027.";
      renderViews();
      return;
    }
    var name = prompt("Name for this car show:", year + " Car Show");
    if (name === null) return;
    // Land straight in the new show rather than making the officer click it -
    // creating one is only ever a prelude to working in it.
    pushShowAction({ action: "create", year: year, name: String(name).trim() }, function () {
      openShow(year);
    });
  }

  function renameShow(show) {
    var name = prompt("Name for this car show:", show.name || "");
    if (name === null || !String(name).trim()) return;
    pushShowAction({ action: "rename", year: show.year, name: String(name).trim() });
  }

  // Archiving is presentational here (it labels the row) - unlike
  // SilentAuctionManager an archived show is NOT read-only, because a past
  // show's records still get corrected after the fact.
  function setShowStatus(show, archived) {
    pushShowAction({ action: archived ? "archive" : "unarchive", year: show.year });
  }

  // Which show the PUBLIC pages write into: the sponsor sign-up forms and the
  // public sponsor list have no session and no ?year=, so this is how they
  // know where a walk-up submission belongs. Deliberately independent of
  // which show this officer has open, so reviewing last year's numbers can't
  // silently redirect this year's submissions.
  function setPublicShow(show) {
    pushShowAction({ action: "set_current", year: show.year });
  }

  function confirmDeleteShow(show) { state.showPendingDelete = show; renderViews(); }
  function cancelDeleteShow() { state.showPendingDelete = null; state.showsError = null; renderViews(); }
  function deleteShow(show, devPassword) {
    pushShowAction({ action: "delete", year: show.year, devPassword: devPassword }, function () {
      state.showPendingDelete = null;
      renderViews();
    });
  }

  function buildShowsPage() {
    var kids = [];

    var newBtn = el("button", { class: "btn primary" }, ["+ New Car Show"]);
    newBtn.addEventListener("click", createShow);
    if (state.showsBusy) newBtn.setAttribute("disabled", "disabled");
    kids.push(el("div", { class: "shows-head" }, [
      el("h3", { text: "Car Shows" }),
      el("span", { class: "spacer" }),
      newBtn
    ]));

    if (state.showsError && !state.showPendingDelete) {
      kids.push(el("div", { class: "messages", style: "margin-bottom:10px" }, [state.showsError]));
    }

    if (!state.shows.length) {
      kids.push(el("div", { class: "empty-state" },
        ["No car shows yet - click + New Car Show to set up the first one."]));
      return el("div", { class: "panel shows-panel" }, kids);
    }

    var head = el("tr", {}, [
      el("th", { text: "Car Show" }),
      el("th", { text: "Status" }),
      el("th", { text: "Public sign-ups" }),
      el("th", { text: "" })
    ]);

    var rows = state.shows.map(function (s) {
      var year = String(s.year);
      var archived = s.status === "archived";
      var isPublic = state.publicShowYear === year;

      var nameLink = el("a", { class: "show-open", href: "#", text: s.name || (year + " Car Show") });
      nameLink.addEventListener("click", function (e) { e.preventDefault(); openShow(year); });

      var statusBadge = el("span", {
        class: "badge " + (archived ? "badge-muted" : "badge-ok"),
        text: archived ? "ARCHIVED" : "ACTIVE"
      });

      var publicCell;
      if (isPublic) {
        publicCell = el("span", { class: "badge badge-accent", text: "CURRENT" });
      } else {
        publicCell = el("button", { class: "btn btn-sm" }, ["Make current"]);
        publicCell.addEventListener("click", function () { setPublicShow(s); });
        if (state.showsBusy) publicCell.setAttribute("disabled", "disabled");
      }

      var openBtn = el("button", { class: "btn btn-sm" }, ["Open"]);
      openBtn.addEventListener("click", function () { openShow(year); });
      var renameBtn = el("button", { class: "btn btn-sm" }, ["Rename"]);
      renameBtn.addEventListener("click", function () { renameShow(s); });
      var archiveBtn = el("button", { class: "btn btn-sm" }, [archived ? "Unarchive" : "Archive"]);
      archiveBtn.addEventListener("click", function () { setShowStatus(s, !archived); });
      var deleteBtn = el("button", { class: "btn btn-sm btn-warn" }, ["Delete"]);
      deleteBtn.addEventListener("click", function () { confirmDeleteShow(s); });
      if (state.showsBusy) {
        [renameBtn, archiveBtn, deleteBtn].forEach(function (b) { b.setAttribute("disabled", "disabled"); });
      }

      return el("tr", {}, [
        el("td", {}, [nameLink]),
        el("td", {}, [statusBadge]),
        el("td", {}, [publicCell]),
        el("td", { class: "show-actions" }, [openBtn, renameBtn, archiveBtn, deleteBtn])
      ]);
    });

    kids.push(el("table", { class: "grid shows-grid" }, [
      el("thead", {}, [head]),
      el("tbody", {}, rows)
    ]));
    kids.push(el("div", { class: "shows-note" }, [
      "Each car show keeps its own registrations, sponsors, payments and t-shirt orders. " +
      "The show marked CURRENT is the one the public sponsor sign-up forms and the public " +
      "sponsor list use."
    ]));

    return el("div", { class: "panel shows-panel" }, kids);
  }

  // Deleting a show throws away a whole year of records and cannot be undone,
  // so it takes the Developer password - the same second credential
  // SilentAuctionManager requires before deleting an auction. The server
  // checks it too (shows.php); this is not the gate, just where it's asked.
  function renderDeleteShowConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    var show = state.showPendingDelete;
    if (!show) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", cancelDeleteShow);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: "Delete " + (show.name || show.year) + "?" }),
      el("span", { class: "spacer" }),
      closeBtn
    ]);

    var pw = el("input", { type: "password", placeholder: "Developer password", autocomplete: "off" });
    var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" },
      ["Yes, Delete This Car Show"]);
    yesBtn.addEventListener("click", function () { deleteShow(show, pw.value); });
    var noBtn = el("button", { class: "btn" }, ["Cancel"]);
    noBtn.addEventListener("click", cancelDeleteShow);
    if (state.showsBusy) yesBtn.setAttribute("disabled", "disabled");
    // Enter submits, so the password field behaves like the login prompt.
    pw.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); deleteShow(show, pw.value); }
    });

    var body = el("div", { class: "modal-body" }, [
      el("p", {}, ["This permanently deletes every registration, sponsor, payment and t-shirt " +
        "record for " + (show.name || show.year) + ". This cannot be undone."]),
      el("p", {}, ["Enter the Developer password to confirm:"]),
      pw
    ]);
    if (state.showsError) {
      body.appendChild(el("div", { class: "messages", style: "margin-top:10px" }, [state.showsError]));
    }
    body.appendChild(el("div", { class: "settings-actions" }, [yesBtn, noBtn]));

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", cancelDeleteShow);
    host.appendChild(backdrop);
    pw.focus();
  }

  // CSVs are (re)ingested synchronously right before regenerate() runs, so
  // meta.generatedAt doubles as "when the currently-loaded CSVs were loaded".
  function buildLoadedInfo() {
    return el("div", { class: "loadedinfo" }, ["CSVs loaded: " + fmtDate(state.result.meta.generatedAt)]);
  }

  function buildRegToolbar() {
    var search = el("input", { type: "search", placeholder: "Search name, club, email…", value: state.search });
    search.addEventListener("input", function () { state.search = search.value; renderRegBody(); });

    var inCarShowCb = el("input", { type: "checkbox" }); inCarShowCb.checked = state.inCarShowFilter;
    inCarShowCb.addEventListener("change", function () { state.inCarShowFilter = inCarShowCb.checked; renderRegBody(); });
    var statusGroup = el("span", { class: "statusgroup" }, [
      el("span", { class: "hint" }, ["Status:"])
    ].concat(STATUS_BUCKETS.map(function (b) {
      var cb = el("input", { type: "checkbox" }); cb.checked = state.statusFilter[b.key];
      cb.addEventListener("change", function () { state.statusFilter[b.key] = cb.checked; renderRegBody(); });
      return el("label", {}, [cb, document.createTextNode(" " + b.label)]);
    })).concat([el("label", {}, [inCarShowCb, document.createTextNode(" In Car Show")])]));

    var delBtn = el("button", { class: "btn", id: "regDeleteBtn", disabled: "disabled" }, ["🗑 Delete"]);
    delBtn.addEventListener("click", openDeleteRegSelectedConfirm);

    var printCardsBtn = el("button", { class: "btn", id: "regPrintCardsBtn", disabled: "disabled" }, ["🪟 Print Window Cards"]);
    printCardsBtn.addEventListener("click", printSelectedWindowCards);

    var exportBtn = el("button", { class: "btn", title: "Export exactly what's shown — current search/filters, collapsed Shirts column" }, ["⬇ Export"]);
    exportBtn.addEventListener("click", exportRegistrationCsv);

    var addBtn = el("button", { class: "btn primary" }, ["+ Add Registration"]);
    addBtn.addEventListener("click", openAddRegistration);

    var zoomOut = el("button", { class: "btn", title: "Zoom out" }, ["−"]);
    zoomOut.addEventListener("click", function () { setZoom(state.zoom - 0.1); });
    var zoomIn = el("button", { class: "btn", title: "Zoom in" }, ["+"]);
    zoomIn.addEventListener("click", function () { setZoom(state.zoom + 0.1); });
    var zoomFit = el("button", { class: "btn", title: "Shrink just enough to fit every column on screen" }, ["Fit"]);
    zoomFit.addEventListener("click", fitZoom);
    var zoomLabel = el("span", { class: "count", text: Math.round(state.zoom * 100) + "%" });
    var zoomGroup = el("span", { class: "zoomgroup" }, [zoomOut, zoomLabel, zoomIn, zoomFit]);

    var count = el("span", { class: "count", id: "rowcount" });
    var kids = [
      search,
      addBtn,
      statusGroup,
      count,
      el("span", { class: "spacer" }),
      zoomGroup
    ];
    kids.push(exportBtn, printCardsBtn, delBtn);
    return el("div", { class: "toolbar no-print" }, kids);
  }
  function buildSummaryToolbar() {
    var exportBtn = el("button", { class: "btn" }, ["⬇ Export"]);
    exportBtn.addEventListener("click", exportSummaryCsv);
    return el("div", { class: "toolbar no-print" }, [el("span", { class: "spacer" }), exportBtn]);
  }
  // Summary tab's "⬇ Export" — the dashboard is several unrelated
  // panels (overview, sponsors, two shirt matrices, walk-in purchases, car
  // show generations, clubs), not one table, so this is one CSV with a
  // blank-line-separated section per panel rather than exportGenReportCsv()'s
  // single-table shape. Pulls straight from the same data functions
  // buildSummaryView()'s panels call (LOGIC.summarizeRecords(),
  // sponsorStatsByType(), paidRegShirtTotals(), etc.) rather than reading the
  // rendered DOM, so it stays correct even if that view's layout changes.
  function exportSummaryCsv() {
    var s = LOGIC.summarizeRecords(allRegistrations(), CONFIG);
    var sponsorFunds = sponsorStatsByType("premier").total + sponsorStatsByType("corporate").total;
    var tshirtPurchaseTotal = state.tshirtPurchases.reduce(function (sum, p) { return sum + (Number(p.cost) || 0); }, 0);
    var totalIncome = Number(s.funds) + sponsorFunds + tshirtPurchaseTotal;
    var lines = [];
    function section(title) { if (lines.length) lines.push(""); lines.push(csvField(title)); }
    function row(cells) { lines.push(cells.map(csvField).join(",")); }

    section("Overview");
    row(["Registrations", s.registrations]);
    row(["Total Income", fmtMoney(totalIncome)]);

    section("Sponsors by Type");
    row(["Type", "Count", "Total"]);
    ["individual", "corporate", "premier"].forEach(function (t) {
      var stats = sponsorStatsByType(t);
      row([stats.label, stats.count, fmtMoney(stats.total)]);
    });

    // "Xtra" -> "Purchased" in this header row too, same rename as
    // shirtMatrix()'s on-screen column headers (g.label itself is untouched).
    section("Registration Shirts");
    row(["Size"].concat(CONFIG.GROUPS.map(function (g) { return g.label.replace("Xtra", "Purchased"); })));
    CONFIG.SIZES.forEach(function (sz) {
      row([sz.label].concat(CONFIG.GROUPS.map(function (g) { return s.shirtTotals[g.key + sz.key] || 0; })));
    });

    section("Total Shirts Needed For Event (paid registrations + all sponsors)");
    var totals = paidRegShirtTotals();
    var sponsorCounts = allSponsorShirtCounts();
    row(["Size", "Men's", "Women's"]);
    CONFIG.SIZES.forEach(function (sz) {
      var regMens = 0, regWomens = 0;
      CONFIG.GROUPS.forEach(function (g) {
        var val = totals[g.key + sz.key] || 0;
        if (g.gender === "Men's") regMens += val; else regWomens += val;
      });
      row([sz.label, regMens + sponsorCounts[sz.key].mens, regWomens + sponsorCounts[sz.key].womens]);
    });

    section("Walk-In T-Shirt Purchases");
    row(["Purchases", state.tshirtPurchases.length]);
    row(["Total", fmtMoney(tshirtPurchaseTotal)]);
    var purchCounts = tshirtPurchaseShirtCounts();
    row(["Size", "Men's", "Women's"]);
    CONFIG.SIZES.forEach(function (sz) { row([sz.label, purchCounts[sz.key].mens, purchCounts[sz.key].womens]); });

    section("Car Show (Judges: " + s.judges + ")");
    row(["Generation", "Years", "At Event", "In Car Show"]);
    s.gens.forEach(function (g) { row([g.gen, g.from + "–" + g.to, g.atEvent, g.inCarShow]); });

    section("Clubs");
    row(["Club", "Attendees"]);
    s.clubs.forEach(function (c) { row([c.name, c.attendees]); });

    downloadTextFile("Summary-" + dateInputValue(new Date()) + ".csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  // ---------- print (Registration tab: print every column, not just what's on screen) ----------
  // The on-screen table deliberately collapses 24 shirt columns into one summary
  // column and only shows what's currently sorted/searched/scrolled — printing
  // should still give a complete paper record, so this builds a separate,
  // print-only table with every column instead of reusing the visible one.
  function clearPrintHost() { var host = $("#printHost"); if (host) host.innerHTML = ""; }

  // Shared logo + centered title header, and a report-date footer, used by
  // every print report below (printGenReport/printSummaryReport/
  // printSponsorReport/printTallySheet/etc.) so they all look like one
  // consistent document. Real
  // "Page n of m" numbering isn't something the app can compute itself —
  // browsers don't expose a total page count to print CSS/JS — so that part
  // is left to the browser's own print dialog "Headers and footers" option,
  // which already prints real page numbers.
  function buildPrintHeader(title) {
    var headerLogo = $("header.app img.hdr-logo");
    var kids = [];
    if (headerLogo) kids.push(el("img", { src: headerLogo.src, class: "print-logo", alt: "ETCC Logo" }));
    kids.push(el("h2", { text: title }));
    return el("div", { class: "print-report-head" }, kids);
  }
  function buildPrintFooter() {
    return el("div", { class: "print-report-foot", text: "Report Date: " + fmtDate(new Date()) });
  }

  // Base (non-shirt) columns, plus one "Shirts" summary column standing in for
  // the 24 individual shirt-size buckets (which are almost always zero) — this
  // is what shrinks the table enough to avoid horizontal scrolling for most rows.
  // FreeTShirtSize / FreeTShirtSize Comments are also dropped from the on-screen
  // table as redundant with the Shirts summary column (still shown in the detail
  // modal). Individual Sponsorship stays visible here (unlike the Summary tab's
  // card, which was removed) even though those registrants are also synced into
  // the Sponsors tab (see syncSponsorsFromRegistrations) — both views are kept
  // in sync from the same CSV data. The Excel export is unaffected and still
  // lists everything, including all 24 individual shirt buckets, since that
  // detail matters for ordering shirts even though it's noise on screen.
  function visibleColumns() {
    var base = state.result.columns.filter(function (c) {
      return !isShirtCol(c) && c !== "FreeTShirtSize" && c !== "FreeTShirtSize Comments";
    });
    base.push(SHIRTS_COL);
    return base;
  }
  // Plain-text value for one column of one row, same formatting renderRegBody()
  // applies per column (Shirts summary, money, CSV dates, phone) — used by
  // exportRegistrationCsv() so the export matches the on-screen table exactly
  // (minus the Email column's mailto: link, which CSV has no use for).
  function regCellText(r, c) {
    if (c === SHIRTS_COL) return shirtSummaryText(r);
    if (CURRENCY_COLS[c]) return fmtMoney(r[c]);
    if (DATE_COLS[c]) return fmtCsvDate(r[c]);
    if (c === "Phone") return fmtPhone(r[c]);
    var v = r[c];
    return v == null ? "" : String(v);
  }
  // Registration tab's "⬇ Export" — exactly what's currently on screen:
  // visibleRows() already applies the search box and Status/In Car Show
  // filters, and visibleColumns() is the same collapsed-shirts column set
  // the table itself renders (the Reports tab's own "Registration Report",
  // REG_REPORT_SPEC, is the separate full-detail/user-configurable export;
  // this one is deliberately just "what I'm looking at right now").
  function exportRegistrationCsv() {
    var rows = visibleRows();
    if (!rows.length) return;
    var cols = visibleColumns();
    var lines = [cols.map(function (c) { return csvField(c === SHIRTS_COL ? "Shirts" : c); }).join(",")];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { return csvField(regCellText(r, c)); }).join(","));
    });
    downloadTextFile("Registrations-" + dateInputValue(new Date()) + ".csv",
      "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  function buildRegView() {
    var cols = visibleColumns();
    var thead = el("thead"), htr = el("tr");

    var selectAllCb = el("input", { type: "checkbox", id: "regSelectAll", title: "Select all" });
    selectAllCb.addEventListener("change", function () { toggleSelectAllReg(selectAllCb.checked); });
    htr.appendChild(el("th", { class: "no-print" + pinnedClass(0) }, [selectAllCb]));

    cols.forEach(function (c, idx) {
      var label = c === SHIRTS_COL ? "Shirts" : c;
      // Non-breaking space so this short header never wraps between "Reg"
      // and "#" even at a narrow column width (table.grid thead th uses
      // white-space: normal so longer headers like "Spouse First Name" can
      // wrap onto two lines) — c itself (used for sort/lookup) is untouched.
      if (label === "Reg #") label = "Reg #";
      var arrow = state.sortCol === c ? (state.sortDir === 1 ? " ▲" : " ▼") : "";
      var th = el("th", { class: (c === SHIRTS_COL ? "shirtsum" : (isNumericCol(c) ? "num" : "")) +
          (NARROW_HEADER_COLS[c] ? " narrow-hdr" : "") + pinnedClass(idx + 1) },
        [label, el("span", { class: "arrow", text: arrow })]);
      th.addEventListener("click", function () {
        if (state.sortCol === c) state.sortDir = -state.sortDir; else { state.sortCol = c; state.sortDir = 1; }
        renderViews();
      });
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    // zoom goes on the TABLE, never on .tablewrap. `zoom` rescales the
    // element's own lengths, so a zoomed .tablewrap renders its max-height at
    // zoom x the authored value — at the ~60% fit-zoom this picks on a wide
    // screen that silently cut the visible table (and the row count with it)
    // to 60% of what the CSS asked for, differently on every screen width.
    // See updatePinnedOffsets()'s note: this is the same "zoom rescales
    // lengths" trap, and it's what broke the JS height attempts too.
    var table = el("table", { class: "grid", style: "zoom:" + state.zoom }, [thead, el("tbody", { id: "regbody" })]);
    var wrap = el("div", { class: "tablewrap fill" }, [table]);
    setTimeout(function () {
      renderRegBody();
      if (!state.zoomAutoFitDone) { state.zoomAutoFitDone = true; fitZoom(); }
    }, 0);
    return wrap;
  }

  // ---------- pinned columns (checkbox + Reg Type + Last Name + First Name stay visible while scrolling) ----------
  // Each pinned cell is `position: sticky`; every one after the first needs
  // its `left` set to the summed rendered width of the pinned cells before
  // it, or they'd all sit at left:0 and overlap/mangle each other.
  var PINNED_COUNT = 5; // checkbox, Reg #, Reg Type, Last Name, First Name
  function pinnedClass(idx) {
    return idx < PINNED_COUNT ? " pinned pin-" + (idx + 1) : "";
  }
  function updatePinnedOffsets() {
    var table = $(".tablewrap table.grid");
    var headRow = table && table.querySelector("thead tr");
    if (!headRow) return;
    // getBoundingClientRect is in post-zoom (visual) px; the `zoom` CSS property
    // re-scales inline-style lengths too, so divide back out or the offset
    // would be applied twice.
    var offset = 0;
    for (var i = 0; i < PINNED_COUNT; i++) {
      var cell = headRow.children[i];
      if (!cell) break;
      var cells = table.querySelectorAll(".pin-" + (i + 1));
      for (var j = 0; j < cells.length; j++) cells[j].style.left = offset + "px";
      offset += cell.getBoundingClientRect().width / state.zoom;
    }
  }

  // ---------- zoom (shrink the table so all columns fit without horizontal scrolling) ----------
  function setZoom(z) {
    state.zoom = Math.max(0.3, Math.min(1.5, z));
    renderViews();
  }
  function setSponsorZoom(z) {
    state.sponsorZoom = Math.max(0.3, Math.min(1.5, z));
    renderViews();
  }
  // Measure how wide the table naturally wants to be vs. how much room is
  // actually available, and pick a zoom level that makes every column fit —
  // instead of making the user guess a percentage via the +/- buttons.
  // The zoom now lives on the table (see buildRegView), so measure and
  // restore it there — .tablewrap itself is never zoomed.
  function fitZoom() {
    var wrap = $(".tablewrap");
    var table = wrap && wrap.querySelector("table.grid");
    if (!wrap || !table) return;
    var availableWidth = wrap.clientWidth; // the unzoomed scroll container
    var priorZoom = table.style.zoom;
    table.style.zoom = "1"; // measure at true scale, independent of current zoom
    var naturalWidth = table.scrollWidth;
    table.style.zoom = priorZoom;
    if (!naturalWidth) return;
    setZoom(availableWidth / naturalWidth);
  }
  function fitSponsorZoom() {
    var wrap = $(".tablewrap");
    var table = wrap && wrap.querySelector("table.grid");
    if (!wrap || !table) return;
    var availableWidth = wrap.clientWidth;
    var priorZoom = table.style.zoom;
    table.style.zoom = "1";
    var naturalWidth = table.scrollWidth;
    table.style.zoom = priorZoom;
    if (!naturalWidth) return;
    setSponsorZoom(availableWidth / naturalWidth);
  }

  // CSV-derived registrations plus manually-added Walk-In Member/Nonmember
  // rows — the single merge point everything downstream (table body, search,
  // sort, print, detail modal Prev/Next, live Summary tab) reads through, so
  // walk-ins behave identically to a CSV row everywhere except persistence.
  function allRegistrations() {
    return (state.result ? state.result.registrations : []).concat(state.walkins);
  }

  // Keeps the external Paid Registrations API's server-side cache in sync
  // with whatever this browser currently shows. There's no PHP port of
  // logic.js's generate() pipeline (see regenerate() above) — rather than
  // duplicate that whole thing server-side, this pushes a filtered snapshot
  // to paid-registrations-cache.php every time something registration-status-
  // related changes (CSV import, a Status edit, a Walk-In add/edit/delete, a
  // bulk delete). Fire-and-forget, same as the other *ToServer pushes below —
  // the external API just serves a slightly stale snapshot until the next
  // successful sync if this fails. See deploy/paid-registrations-cache.php
  // and deploy/paid-registrations-api.php.
  function syncPaidRegistrationsCache() {
    if (!SITE_CONFIG.paidRegistrationsCacheApiUrl) return;
    var registrations = allRegistrations()
      .filter(function (r) { return classifyStatus(r["Status"]) === "paid"; })
      .map(function (r) {
        // Source field renamed to "Reg #" internally — the external
        // API's own JSON field name (memberNumber) is a stable public
        // contract and stays as-is regardless of this internal rename.
        var mn = r["Reg #"];
        return {
          memberNumber: mn === "" || mn == null ? null : Number(mn),
          firstName: r["First Name"] || "",
          lastName: r["Last Name"] || "",
          phone: r["Phone"] || "",
          email: r["Email"] || ""
        };
      });
    fetch(SITE_CONFIG.paidRegistrationsCacheApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", registrations: registrations })
    }).catch(function () { /* best-effort — see comment above */ });
  }

  // Stable selection/deletion key for any registration row — a walk-in's own
  // .id if it has one, otherwise its csvRegKey(). Used by the Registration
  // tab's row checkboxes and by deleteSelectedReg() to route each selected
  // row to the right deletion mechanism (see below).
  function rowKey(r) { return r.id || csvRegKey(r); }

  // ---------- Dash # (judging-day placard numbers) ----------
  // Every registration whose "In Car Show?" is exactly "Yes" — the roster
  // the Judging Tally Sheet is built from and the only rows that ever get a
  // window card. Same "Yes" check printSelectedWindowCards() already uses.
  function carsInShow() {
    return allRegistrations().filter(function (r) {
      return String(r["In Car Show?"]).trim().toLowerCase() === "yes";
    });
  }

  // Assigns a Dash # to every row in `rows` that doesn't already have one in
  // state.dashNumbers, then pushes just the new assignments to the server in
  // one batch. Idempotent and additive — an already-assigned row (its number
  // is physically on a printed window card) is never touched or renumbered,
  // even if it's re-passed here later.
  //
  // The actual numbering (which block, which number is next) is
  // LOGIC.nextDashNumber() — a pure function covered by the regression suite
  // — recomputed against the live state.dashNumbers map on every row rather
  // than a locally precomputed watermark, so `rows` being a subset (a
  // reprint of a handful of cards, say) can never hand out a number that
  // collides with a car outside it that already has one.
  //
  // Local state is updated synchronously (before this returns) so callers —
  // printSelectedWindowCards()/printTallySheetForShow() — can rely on
  // state.dashNumbers being complete immediately after calling this, without
  // waiting on the network push.
  function ensureDashNumbers(rows) {
    var assignments = {};
    rows.forEach(function (r) {
      var key = rowKey(r);
      if (state.dashNumbers[key] != null) return;
      var next = LOGIC.nextDashNumber(r["Gen"], state.dashNumbers, CONFIG.corvetteGenerations);
      if (next == null) return;
      state.dashNumbers[key] = next;
      assignments[key] = next;
    });
    if (Object.keys(assignments).length) pushDashNumbersToServer(assignments);
  }

  // Fire-and-forget, same optimistic-local-update-then-push pattern as every
  // other *ToServer function — state.dashNumbers is already correct locally
  // by the time this is called (see ensureDashNumbers above), so a failure
  // here only means the NEXT page load would re-derive slightly different
  // (but still valid/non-colliding) numbers for whatever didn't save; it
  // does not block printing or the Tally Sheet download in the meantime.
  function pushDashNumbersToServer(assignments) {
    if (!SITE_CONFIG.dashNumbersApiUrl) return;
    fetch(SITE_CONFIG.dashNumbersApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", assignments: assignments })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.dashNumberSyncError = null;
    }).catch(function () {
      state.dashNumberSyncError = "Could not save the new Dash # assignments to the server — reload before printing again to avoid duplicates.";
      renderViews();
    });
  }

  // Builds the Judging Tally Sheet as an HTML table into #printHost and opens
  // the browser's print preview — same convention every other report in the
  // app uses (printGenReport/printSummaryReport/etc., see buildPrintHeader()
  // above), rather than a spreadsheet file download.
  // Assumes every row in `cars` already has a Dash # (the caller runs
  // ensureDashNumbers() first). One row per registered car, grouped by
  // generation (the Car Class label only on that block's first row) — no
  // blank buffer/separator rows, so the printed sheet is exactly as long as
  // the actual roster. Mirrors excel.js's buildTallySheet() column set, but
  // that Excel version is no longer reachable from the UI; it's kept only
  // for the regression suite's round-trip coverage (see excel.js's own
  // comment) and still has its own buffer rows for that context.
  function printTallySheet(cars) {
    var host = $("#printHost");
    host.innerHTML = "";

    var thead = el("thead", {}, [el("tr", {}, [
      el("th", { text: "Car Class" }), el("th", { text: "Dash #" }),
      el("th", { text: "General Votes" }), el("th", { text: "Best of Show Votes" }),
      el("th", { text: "Owner" }), el("th", { text: "Year" }), el("th", { text: "Color" })
    ])]);

    var bodyRows = [];
    function dataRow(cells) {
      bodyRows.push(el("tr", {}, cells.map(function (v) {
        return el("td", { text: v == null ? "" : String(v) });
      })));
    }

    var carsWithDash = cars.map(function (r) { return { rec: r, dashNumber: state.dashNumbers[rowKey(r)] }; });
    LOGIC.tallySheetRows(carsWithDash, CONFIG.corvetteGenerations).forEach(function (row) {
      dataRow([row.carClass, row.dashNumber, "", "", row.owner, row.year, row.color]);
    });

    var tbody = el("tbody", {}, bodyRows);
    var title = CONFIG.title.replace(/\s*Registration List$/, "") + " — Judging Tally Sheet";
    host.appendChild(buildPrintHeader(title));
    host.appendChild(el("table", { class: "grid report-table tally-print-table" }, [thead, tbody]));

    // ---- Summary block — same shape as excel.js's buildTallySheet(): total
    // cars, then a count + percentage per generation.
    var summary = LOGIC.tallySheetSummary(cars, CONFIG.corvetteGenerations);
    var summaryRows = [];
    summaryRows.push(el("tr", {}, [
      el("td", { class: "tally-summary-label", text: "Total Cars Entered in the show" }),
      el("td", { text: String(summary.total) })
    ]));
    summary.byGen.forEach(function (g) {
      summaryRows.push(el("tr", {}, [
        el("td", { class: "tally-summary-label", text: g.gen }),
        el("td", { text: g.count + " (" + g.pct + "%)" })
      ]));
    });
    // Decided live at the show, not derivable from registration data — left
    // blank for hand-writing on the printed page, same as the club's own
    // paper template.
    ["Most participation from visiting club", "Best of Show", "Dealers Choice"].forEach(function (label) {
      summaryRows.push(el("tr", {}, [el("td", { class: "tally-summary-label", text: label }), el("td", { text: "" })]));
    });
    host.appendChild(el("table", { class: "grid report-table tally-summary-table" }, [el("tbody", {}, summaryRows)]));

    host.appendChild(buildPrintFooter());
    window.print();
  }

  // ---------- Registration tab row selection + bulk delete ----------
  function selectedRegKeys() { return Object.keys(state.regSelected); }
  function setRegSelected(key, checked) {
    if (checked) state.regSelected[key] = true; else delete state.regSelected[key];
  }
  function toggleSelectAllReg(checked) {
    visibleRows().forEach(function (r) { setRegSelected(rowKey(r), checked); });
    renderRegBody();
  }
  function openDeleteRegSelectedConfirm() {
    if (!selectedRegKeys().length) return;
    state.deleteRegSelectedOpen = true;
    renderDeleteRegSelectedConfirm();
  }
  function closeDeleteRegSelectedConfirm() { state.deleteRegSelectedOpen = false; renderDeleteRegSelectedConfirm(); }
  // Walk-In rows are deleted immediately via removeWalkin(). CSV-derived rows
  // have no per-row server record to delete — instead their csvRegKey() is
  // added to state.deletedCsvKeys and persisted to deleted-registrations.json,
  // and regenerate() excludes any matching key from every future CSV parse
  // (including a fresh re-import that still contains the same row) — see
  // that function's comment.
  function deleteSelectedReg() {
    var rows = allRegistrations();
    var byKey = {};
    rows.forEach(function (r) { byKey[rowKey(r)] = r; });
    var csvKeysDeleted = [];
    selectedRegKeys().forEach(function (key) {
      var r = byKey[key];
      if (!r) return;
      if (r.id) {
        removeWalkin(r.id);
      } else {
        state.deletedCsvKeys[key] = true;
        csvKeysDeleted.push(key);
      }
    });
    if (csvKeysDeleted.length && state.result && state.result.ok) {
      state.result.registrations = state.result.registrations.filter(function (r) {
        return !state.deletedCsvKeys[csvRegKey(r)];
      });
      pushDeletedRegistrationsToServer(csvKeysDeleted);
    }
    state.regSelected = {};
    syncPaidRegistrationsCache();
    renderViews();
  }
  function pushDeletedRegistrationsToServer(keys) {
    if (!SITE_CONFIG.deletedRegistrationsApiUrl) return;
    fetch(SITE_CONFIG.deletedRegistrationsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", keys: keys })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.regDeleteSyncError = null;
    }).catch(function () {
      state.regDeleteSyncError = "Could not save that deletion to the server — it'll reappear if the page is reloaded before this succeeds. Check your connection and try again.";
      renderViews();
    });
  }
  // Persists a CSV row's detail-modal edit. Fire-and-forget like the deletion
  // push above — the local state.csvOverrides/table already reflect the edit
  // immediately; a failure here just means it could revert on the next reload
  // if not retried.
  function pushRegistrationOverrideToServer(key, patch) {
    if (!SITE_CONFIG.registrationOverridesApiUrl) return;
    fetch(SITE_CONFIG.registrationOverridesApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "upsert", key: key, patch: patch })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.detailEditError = null;
    }).catch(function () {
      state.detailEditError = "Could not save that edit to the server — it'll revert if the page is reloaded before this succeeds. Check your connection and try again.";
      renderViews();
    });
  }
  function pushRegistrationOverrideDeleteToServer(key) {
    if (!SITE_CONFIG.registrationOverridesApiUrl) return;
    fetch(SITE_CONFIG.registrationOverridesApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", key: key })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.detailEditError = null;
    }).catch(function () {
      state.detailEditError = "Could not clear that row's edits on the server — they'll come back if the page is reloaded before this succeeds. Check your connection and try again.";
      renderViews();
    });
  }
  function renderDeleteRegSelectedConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.deleteRegSelectedOpen) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeDeleteRegSelectedConfirm);
    var count = selectedRegKeys().length;
    var head = el("div", { class: "modal-head" }, [el("h3", { text: "Delete " + count + " Registration" + (count === 1 ? "" : "s") + "?" }), el("span", { class: "spacer" }), closeBtn]);

    var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" }, ["Yes, Delete"]);
    yesBtn.addEventListener("click", function () { closeDeleteRegSelectedConfirm(); deleteSelectedReg(); });
    var noBtn = el("button", { class: "btn" }, ["Cancel"]);
    noBtn.addEventListener("click", closeDeleteRegSelectedConfirm);

    var body = el("div", { class: "modal-body" }, [
      el("p", {}, ["This permanently removes the " + count + " selected registration" + (count === 1 ? "" : "s") +
        ". Walk-In rows are deleted outright; CSV-imported rows are excluded going forward — including from a " +
        "later CSV re-import that still contains the same row. This cannot be undone from the app."]),
      el("div", { class: "settings-actions" }, [yesBtn, noBtn])
    ]);

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeDeleteRegSelectedConfirm);
    host.appendChild(backdrop);
  }

  // The next unassigned Walk-In Nonmember number — a pool deliberately
  // separate from the CSV import's own nonmember auto-numbering (which stays
  // hardcoded at CONFIG.firstNonMember/8001; see generate() in logic.js).
  // Starts from the officer-configurable Developer > Settings value
  // (state.appSettings.walkinFirstNonMember, default 2000) and advances past
  // any Walk-In Nonmembers already added, so two added back to back never
  // collide with each other.
  function nextAvailableWalkinNumber() {
    var next = Number(state.appSettings.walkinFirstNonMember) || 2000;
    state.walkins.forEach(function (w) {
      var n = Number(w["Reg #"]);
      if (n >= next) next = n + 1;
    });
    return next;
  }

  function sortedRows() {
    var rows = allRegistrations();
    if (state.sortCol) {
      var c = state.sortCol, dir = state.sortDir;
      if (c === SHIRTS_COL) {
        rows.sort(function (a, b) { return (shirtTotal(a) - shirtTotal(b)) * dir; });
        return rows;
      }
      var num = isNumericCol(c);
      var isDate = !!DATE_COLS[c];
      rows.sort(function (a, b) {
        var av = a[c], bv = b[c];
        if (num) { av = av === "" || av == null ? -Infinity : Number(av); bv = bv === "" || bv == null ? -Infinity : Number(bv); return (av - bv) * dir; }
        if (isDate) {
          var ad = av ? new Date(av).getTime() : NaN, bd = bv ? new Date(bv).getTime() : NaN;
          ad = isNaN(ad) ? -Infinity : ad; bd = isNaN(bd) ? -Infinity : bd;
          return (ad - bd) * dir;
        }
        av = String(av == null ? "" : av).toLowerCase(); bv = String(bv == null ? "" : bv).toLowerCase();
        return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      });
    }
    return rows;
  }

  // The exact set of rows currently on screen, in order — shared by the table
  // body and the detail modal's Prev/Next so paging through the modal follows
  // the same sort/search state the user has the table set to.
  function visibleRows() {
    var cols = visibleColumns();
    var q = state.search.trim().toLowerCase();
    return sortedRows().filter(function (r) {
      // "In Car Show" is its own independent filter, not ANDed with the
      // Status checkboxes — checking it shows every In Car Show row
      // regardless of which (if any) Status boxes are checked.
      if (state.inCarShowFilter) {
        if (String(r["In Car Show?"]).trim().toLowerCase() !== "yes") return false;
      } else if (!state.statusFilter[classifyStatus(r["Status"])]) {
        return false;
      }
      if (!q) return true;
      return cols.some(function (c) {
        var v = c === SHIRTS_COL ? shirtSummaryText(r) : r[c];
        return String(v == null ? "" : v).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  function renderRegBody() {
    if (state.tab !== "reg") return;
    var body = $("#regbody"); if (!body) return;
    var cols = visibleColumns();
    var rows = visibleRows();
    var frag = document.createDocumentFragment();
    rows.forEach(function (r) {
      var key = rowKey(r);
      var tr = el("tr");
      tr.title = "Click for full details";
      tr.addEventListener("click", function () { openDetail(r); });

      var cb = el("input", { type: "checkbox" });
      cb.checked = !!state.regSelected[key];
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
      cb.addEventListener("change", function () { setRegSelected(key, cb.checked); renderRegBody(); });
      tr.appendChild(el("td", { class: "no-print" + pinnedClass(0) }, [cb]));

      cols.forEach(function (c, idx) {
        var v, cls = "";
        if (c === "Email" && r[c]) {
          var mailLink = el("a", { href: "mailto:" + r[c], text: r[c] });
          mailLink.addEventListener("click", function (e) { e.stopPropagation(); });
          tr.appendChild(el("td", { class: cls.trim() + pinnedClass(idx + 1) }, [mailLink]));
          return;
        }
        if (c === SHIRTS_COL) { cls = "shirtsum"; v = shirtSummaryText(r); }
        else if (CURRENCY_COLS[c]) { cls = "num"; v = fmtMoney(r[c]); }
        else if (DATE_COLS[c]) { v = fmtCsvDate(r[c]); }
        else if (c === "Phone") { v = fmtPhone(r[c]); }
        else if (isNumericCol(c)) { cls = "num"; v = r[c]; v = v == null ? "" : v; }
        else { v = r[c]; }
        cls += pinnedClass(idx + 1);
        tr.appendChild(el("td", { class: cls.trim(), text: v == null ? "" : String(v) }));
      });
      frag.appendChild(tr);
    });
    body.innerHTML = "";
    body.appendChild(frag);
    updatePinnedOffsets();
    var rc = $("#rowcount");
    if (rc) rc.textContent = rows.length + " of " + allRegistrations().length + " rows shown";
    var selectAllCb = $("#regSelectAll");
    if (selectAllCb) {
      var visibleKeys = rows.map(rowKey);
      var selectedVisible = visibleKeys.filter(function (k) { return state.regSelected[k]; });
      selectAllCb.checked = visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;
      selectAllCb.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleKeys.length;
    }
    var delBtn = $("#regDeleteBtn");
    if (delBtn) {
      var n = selectedRegKeys().length;
      delBtn.textContent = "🗑 Delete" + (n ? " (" + n + ")" : "");
      if (n) delBtn.removeAttribute("disabled"); else delBtn.setAttribute("disabled", "disabled");
    }
    var printCardsBtn = $("#regPrintCardsBtn");
    if (printCardsBtn) {
      var byKey = {};
      allRegistrations().forEach(function (r) { byKey[rowKey(r)] = r; });
      var printable = selectedRegKeys().filter(function (key) {
        var r = byKey[key];
        return r && String(r["In Car Show?"]).trim().toLowerCase() === "yes";
      }).length;
      printCardsBtn.textContent = "🪟 Print Window Cards" + (printable ? " (" + printable + ")" : "");
      if (printable) printCardsBtn.removeAttribute("disabled"); else printCardsBtn.setAttribute("disabled", "disabled");
    }
  }

  // ---------- detail modal ----------
  // Click any row to see every field for that one registration without scrolling —
  // grouped into readable sections instead of the table's 40+ side-by-side columns.
  var DETAIL_SECTIONS = [
    { title: "Registration", cols: ["Reg Date", "Reg Type", "Status", "Total Fee", "Payment Type", "Check #", "Individual Sponsorship", "Spouse First Name", "#"] },
    { title: "Contact", cols: ["Phone", "Email", "Address", "City", "State", "Zip"] },
    { title: "Vehicle", cols: ["Year", "Model", "Color", "Gen", "In Car Show?"] }
  ];
  // Reg Date, Reg Type, and Gen are deliberately excluded — system/derived
  // values, never hand-edited. Gen recomputes automatically if Year changes
  // (see applyRecordPatch). Shirts (a separate section below, not part of
  // DETAIL_SECTIONS) stay read-only too — a 24-bucket editor is a separate,
  // bigger task than these plain text/select fields. Spouse First Name has
  // no CSV source at all (see config.js) — editing here is the only way to
  // set it. Ind. Spon. Text isn't shown/editable here anymore (removed from
  // the Registration tab/detail modal) — it's still computed on every record
  // (see applySponsorshipTextDefault in logic.js) and feeds the Sponsors
  // tab's own Ind. Spon. Text column at sync time, just not a
  // baseColumnOrder column here.
  var EDITABLE_FIELDS = {
    "Reg #": 1, "Last Name": 1, "First Name": 1, "Club Name": 1, "Status": 1, "Total Fee": 1, "Payment Type": 1, "Check #": 1, "Individual Sponsorship": 1,
    "Spouse First Name": 1, "#": 1,
    "Phone": 1, "Email": 1, "Address": 1, "City": 1, "State": 1, "Zip": 1,
    "Year": 1, "Model": 1, "Color": 1, "Gen": 1, "In Car Show?": 1
  };
  var INT_EDIT_FIELDS = { "Reg #": 1, "#": 1, "Year": 1 };
  var NUM_EDIT_FIELDS = { "Total Fee": 1, "Individual Sponsorship": 1 };

  function openDetail(row) { state.detailRow = row; state.detailEditError = null; renderDetailModal(); }
  function closeDetail() { state.detailRow = null; state.detailEditError = null; renderDetailModal(); }
  function stepDetail(dir) {
    var list = visibleRows(), i = list.indexOf(state.detailRow);
    if (i === -1) return;
    var next = list[i + dir];
    if (next) { state.detailRow = next; state.detailEditError = null; renderDetailModal(); }
  }

  // Builds one <li> for column c — always editable for EDITABLE_FIELDS,
  // read-only otherwise. Registers editable inputs on fieldEls so
  // saveDetailEdit() can read every field back out at Save time.
  function detailFieldItem(r, c, fieldEls) {
    if (EDITABLE_FIELDS[c]) {
      var input;
      if (c === "In Car Show?") {
        input = el("select", {});
        ["No", "Yes"].forEach(function (v) {
          var o = el("option", { value: v, text: v });
          if (String(r[c]) === v) o.setAttribute("selected", "selected");
          input.appendChild(o);
        });
      } else if (c === "Payment Type") {
        var currentPT = r[c] == null ? "" : String(r[c]);
        input = el("select", {});
        [["", "— none —"], ["Cash", "Cash"], ["Check", "Check"], ["Credit Card", "Credit Card"]].forEach(function (pair) {
          var o = el("option", { value: pair[0], text: pair[1] });
          if (pair[0] === currentPT) o.setAttribute("selected", "selected");
          input.appendChild(o);
        });
      } else if (c === "Status") {
        var current = r[c] == null ? "" : String(r[c]);
        var opts = ["Paid", "Not Paid", "Cancelled"];
        if (current && opts.indexOf(current) === -1) opts.unshift(current);
        input = el("select", {});
        opts.forEach(function (v) {
          var o = el("option", { value: v, text: v });
          if (v === current) o.setAttribute("selected", "selected");
          input.appendChild(o);
        });
      } else if (NUM_EDIT_FIELDS[c]) {
        var moneyField = moneyInput({ type: "text", value: r[c] == null ? "" : String(r[c]) });
        input = moneyField.input;
        fieldEls[c] = input;
        return li(c, "", moneyField.wrap);
      } else {
        input = el("input", { type: "text", value: r[c] == null ? "" : String(r[c]) });
      }
      fieldEls[c] = input;
      return li(c, "", input);
    }
    var v = CURRENCY_COLS[c] ? fmtMoney(r[c]) : DATE_COLS[c] ? fmtCsvDate(r[c]) : r[c];
    return li(c, v == null || v === "" ? "—" : String(v));
  }

  // targetRow is the record these fieldEls were rendered for, captured at
  // render time — NOT re-read from state.detailRow when the save actually
  // fires. The autosave below is debounced 1500ms, so a Prev/Next step (or a
  // close) can land first; resolving the row late wrote the record the user
  // had been editing on top of whichever record was selected when the timer
  // fired. Since the patch carries every editable field, that silently
  // overwrote a whole registration with another one's data.
  function saveDetailEdit(fieldEls, targetRow) {
    var r = targetRow || state.detailRow;
    if (!r) return;
    var patch = {};
    Object.keys(EDITABLE_FIELDS).forEach(function (c) {
      var input = fieldEls[c];
      if (!input) return;
      var raw = input.value;
      if (INT_EDIT_FIELDS[c]) patch[c] = LOGIC.toInt(raw);
      else if (NUM_EDIT_FIELDS[c]) patch[c] = LOGIC.toNum(raw);
      else patch[c] = raw.trim();
    });

    var merged;
    if (r.id) {
      // Walk-In row — already has a full server record; merge and push it directly.
      merged = applyRecordPatch(r, patch);
      upsertWalkin(merged);
    } else {
      // CSV-derived row — no per-row server record of its own, so persist just
      // the patch, keyed by the row's stable identity (see csvRegKey/regenerate()).
      var key = csvRegKey(r);
      state.csvOverrides[key] = patch;
      pushRegistrationOverrideToServer(key, patch);
      merged = applyRecordPatch(r, patch);
      if (state.result && state.result.ok) {
        state.result.registrations = state.result.registrations.map(function (row) {
          return csvRegKey(row) === key ? merged : row;
        });
      }
    }
    // Only re-point/redraw the modal when it's still showing the row we just
    // saved — a late autosave for a row the user has already stepped away from
    // must persist, but must not yank the modal back to it.
    if (state.detailRow === r) {
      state.detailRow = merged;
      renderDetailModal();
    }
    syncPaidRegistrationsCache();
    if (state.tab === "reg") renderRegBody();
  }

  // Throws away every stored detail-modal edit for this CSV-derived row and
  // rebuilds it from the CSV. regenerate() re-runs the whole pipeline, which
  // also re-runs syncSponsorsFromRegistrations() — so a row whose Individual
  // Sponsorship had been clobbered reappears on the Sponsors tab immediately.
  function revertDetailOverride() {
    var r = state.detailRow;
    if (!r || r.id) return;
    var key = csvRegKey(r);
    delete state.csvOverrides[key];
    pushRegistrationOverrideDeleteToServer(key);
    closeDetail();
    // Preserve the existing "CSVs loaded:" stamp — this is a re-derive of
    // already-loaded data, not a fresh import.
    regenerate(state.result && state.result.meta ? state.result.meta.generatedAt : null);
    renderViews();
  }

  function deleteDetailRow() {
    var r = state.detailRow;
    if (!r) return;
    if (r.id) {
      removeWalkin(r.id);
    } else {
      var key = csvRegKey(r);
      state.deletedCsvKeys[key] = true;
      pushDeletedRegistrationsToServer([key]);
      if (state.result && state.result.ok) {
        state.result.registrations = state.result.registrations.filter(function (row) {
          return !state.deletedCsvKeys[csvRegKey(row)];
        });
      }
    }
    closeDetail();
    syncPaidRegistrationsCache();
    renderViews();
  }

  function renderDetailModal() {
    var host = $("#detailHost");
    if (!host) return;
    host.innerHTML = "";
    var r = state.detailRow;
    if (!r) return;
    var list = visibleRows(), i = list.indexOf(r);
    var fieldEls = {};

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeDetail);
    var prevBtn = el("button", { class: "btn" }, ["‹ Prev"]);
    if (i <= 0) prevBtn.setAttribute("disabled", "disabled");
    prevBtn.addEventListener("click", function () { stepDetail(-1); });
    var nextBtn = el("button", { class: "btn" }, ["Next ›"]);
    if (i === -1 || i >= list.length - 1) nextBtn.setAttribute("disabled", "disabled");
    nextBtn.addEventListener("click", function () { stepDetail(1); });
    var printCardBtn = el("button", { class: "btn" }, ["🪟 Print Window Card"]);
    printCardBtn.addEventListener("click", function () { printWindowCard(r); });

    var name = (r["Last Name"] || "") + (r["First Name"] ? ", " + r["First Name"] : "");
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: name || "Registration" }),
      el("span", { class: "count", text: i > -1 ? (i + 1) + " of " + list.length : "" }),
      prevBtn, nextBtn, printCardBtn, closeBtn
    ]);

    var body = el("div", { class: "modal-body" }, [
      el("ul", { class: "meta-list" }, [
        detailFieldItem(r, "Reg #", fieldEls),
        detailFieldItem(r, "Club Name", fieldEls)
      ])
    ]);
    DETAIL_SECTIONS.forEach(function (sec) {
      var cols = sec.cols.filter(function (c) { return state.result.columns.indexOf(c) !== -1; });
      var items = cols.map(function (c) { return detailFieldItem(r, c, fieldEls); });
      if (items.length) body.appendChild(el("div", { class: "modal-section" }, [el("h4", { text: sec.title }), el("ul", { class: "meta-list" }, items)]));
    });

    var parts = shirtSummaryParts(r);
    var shirtItems = parts.length ? parts.map(function (p) { return li(p.label, String(p.qty)); })
      : [el("li", { class: "hint", text: "No shirts on this registration." })];
    body.appendChild(el("div", { class: "modal-section" }, [el("h4", { text: "Shirts" }), el("ul", { class: "meta-list" }, shirtItems)]));

    var autoSaveDetail = debounce(function () { saveDetailEdit(fieldEls, r); }, 1500);
    Object.keys(fieldEls).forEach(function (key) {
      fieldEls[key].addEventListener("input", autoSaveDetail);
      fieldEls[key].addEventListener("change", autoSaveDetail);
    });

    var saveBtn = el("button", { class: "btn primary" }, ["Save"]);
    saveBtn.addEventListener("click", function () { saveDetailEdit(fieldEls, r); });
    var cancelBtn = el("button", { class: "btn" }, ["Cancel"]);
    cancelBtn.addEventListener("click", closeDetail);
    var actions = [saveBtn, cancelBtn];
    // Only meaningful for a CSV-derived row that actually has stored edits —
    // a walk-in row (r.id) has no CSV original to fall back to.
    if (!r.id && state.csvOverrides[csvRegKey(r)]) {
      var revertBtn = el("button", { class: "btn" }, ["Revert to CSV"]);
      revertBtn.addEventListener("click", revertDetailOverride);
      actions.push(revertBtn);
    }
    if (r.id) {
      var delBtn = el("button", { class: "btn", style: "color:var(--warn)" }, ["Delete"]);
      delBtn.addEventListener("click", deleteDetailRow);
      actions.push(delBtn);
    }
    // Actions are PINNED at the top of the form, together with the header,
    // rather than sitting at the bottom — the form is long enough that the
    // buttons used to be off-screen until you scrolled all the way down. Both
    // live in one sticky block (.modal-sticky) so they stay visible while the
    // fields scroll underneath. The save-error line is pinned with them, so a
    // failed save is reported where the officer just clicked.
    var actionsBar = el("div", { class: "modal-actions" }, [el("div", { class: "settings-actions" }, actions)]);
    if (state.detailEditError) actionsBar.appendChild(el("div", { class: "form-error" }, [state.detailEditError]));
    var pinned = el("div", { class: "modal-sticky" }, [head, actionsBar]);

    var modal = el("div", { class: "modal" }, [pinned, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeDetail);
    host.appendChild(backdrop);
  }

  // ---------- summary ----------
  // Always computed from the full loaded dataset (allRegistrations()) —
  // deliberately NOT gated by the Registration tab's search box or Status/
  // In Car Show checkboxes, so this tab always reflects everything loaded,
  // not just whatever happens to be checked/searched over there.
  function buildSummaryView() {
    var s = LOGIC.summarizeRecords(allRegistrations(), CONFIG);
    // Total Income = registrations' own Total Fee (s.funds, includes each
    // registrant's own Individual Sponsorship add-on fee, since that's part
    // of their registration) + Premier/Corporate sponsor fees (standalone
    // businesses with no registration of their own) + Walk-In T-Shirt
    // purchases (day-of sales). Individual sponsors are deliberately excluded
    // here — their $100 is already counted once via the registrant's own
    // Total Fee, so adding sponsorStatsByType("individual").total too would
    // double it.
    var sponsorFunds = sponsorStatsByType("premier").total + sponsorStatsByType("corporate").total;
    var tshirtPurchaseTotal = state.tshirtPurchases.reduce(function (sum, p) { return sum + (Number(p.cost) || 0); }, 0);
    var totalIncome = Number(s.funds) + sponsorFunds + tshirtPurchaseTotal;
    var m = state.result.meta, C = CONFIG;
    var container = el("div", { class: "view" });

    // status + meta
    var statusCls = m.errorCount === 0 ? "status good" : "status warn";
    container.appendChild(el("div", { class: "panel" }, [
      el("h3", { text: state.result.meta.title }),
      el("ul", { class: "meta-list" }, [
        li("Generated", fmtDate(m.generatedAt) + "  —  ", el("span", { class: statusCls, text: m.statusMessage })),
        li("Registration file", m.regFileName + "  (" + m.regRows + " rows)"),
        li("Activity file", m.actFileName ? m.actFileName + "  (" + m.actRows + " rows)" : "— none loaded —"),
        li("Registrations", String(s.registrations) + " — all loaded registrations, independent of the Registration tab's search/status filters")
      ])
    ]));

    // Registrations + Total Income by category — one line: the headline
    // Registrations/Total Income figures, then the same three components
    // totalIncome sums (registration fees, Premier/Corporate sponsor fees,
    // Walk-In T-Shirt purchases) broken out, PLUS Individual Sponsors shown
    // for visibility only — it's a muted figure since that $ is already
    // inside Registration Fees (each individual sponsor's fee rides on
    // their own registration's Total Fee), same double-counting reason
    // totalIncome's own comment gives; it isn't summed into Total Income.
    (function () {
      var premierTotal = sponsorStatsByType("premier").total;
      var corporateTotal = sponsorStatsByType("corporate").total;
      var individualTotal = sponsorStatsByType("individual").total;
      // One inline "Label: $amount" (or bare number, for Registrations) run
      // per figure, all on a single line — wrapping only if the panel is
      // too narrow to fit them. The Individual Sponsors caveat is a hover
      // tooltip instead of its own footnote line, to keep this to one line.
      function stat(label, value, opts) {
        opts = opts || {};
        var kids = [
          el("span", { style: "color:var(--muted)", text: label + ": " }),
          el("span", { style: "font-weight:700" + (opts.muted ? "; color:var(--muted); font-weight:600" : ""), text: opts.raw ? String(value) : fmtMoney(value) })
        ];
        var wrap = el("span", { style: "white-space:nowrap" }, kids);
        if (opts.title) wrap.title = opts.title;
        return wrap;
      }
      var sep = function () { return el("span", { style: "color:var(--line)", text: "|" }); };
      container.appendChild(el("div", { class: "panel", style: "padding:10px 14px; margin-bottom:10px" }, [
        el("div", { style: "font-weight:700; color:var(--red-dark); font-size:15px; margin-bottom:6px", text: "Summary" }),
        el("div", { style: "display:flex; align-items:baseline; flex-wrap:wrap; gap:8px 14px; font-size:13px" }, [
          stat("Registrations", s.registrations, { raw: true }), sep(),
          stat("Total Income", totalIncome), sep(),
          stat("Registration Fees", Number(s.funds) || 0), sep(),
          stat("Premier Sponsors", premierTotal), sep(),
          stat("Corporate Sponsors", corporateTotal), sep(),
          stat("Walk-In T-Shirts", tshirtPurchaseTotal), sep(),
          stat("Individual Sponsors (included in Registration Fees)", individualTotal, { muted: true, title: "Already counted in Registration Fees — not added into Total Income." })
        ])
      ]));
    })();

    // sponsor cards (independent of the loaded CSVs — reads state.sponsors directly)
    container.appendChild(el("div", { class: "panel" }, [
      el("h3", { text: "Sponsors" }),
      el("div", { class: "cards sponsor-cards" }, [
        sponsorSummaryCard("individual"), sponsorSummaryCard("corporate"), sponsorSummaryCard("premier")
      ])
    ]));

    // shirts matrices — registration-only, plus a combined (registration +
    // sponsor) matrix — as a pair of cards side by side, same "cards
    // sponsor-cards" / "sponsor-card" styling as the Sponsors panel above
    // (compact table font/padding included) so both panels read as one system.
    container.appendChild(el("div", { class: "panel" }, [
      el("div", { class: "cards sponsor-cards" }, [
        el("div", { class: "sponsor-card" }, [el("div", { class: "sponsor-card-head", text: "Registration Shirts" }), shirtMatrix(s)]),
        el("div", { class: "sponsor-card" }, [
          el("div", { class: "sponsor-card-head", text: "Total Shirts Needed For Event" }),
          el("div", { style: "font-size:11px; color:var(--muted); margin:-6px 0 8px", text: "Paid registrations + all sponsors (excludes Walk-In T-Shirt purchases)" }),
          combinedShirtMatrix()
        ])
      ])
    ]));

    // Walk-In T-Shirt purchases, Car Show generations, and Clubs — three
    // unrelated-but-compact panels combined into one row (same "cards
    // sponsor-cards" 3-column layout the Sponsors/Shirts rows above use),
    // each still its own "sponsor-card" with its own head, since side by
    // side by side reads better than three separate full-width panels for
    // tables this short.
    var clubRows = s.clubs.map(function (c) {
      return el("tr", {}, [el("td", { class: "lbl", text: c.name }), el("td", { text: String(c.attendees) })]);
    });
    container.appendChild(el("div", { class: "panel" }, [
      el("div", { class: "cards sponsor-cards" }, [
        el("div", { class: "sponsor-card" }, [
          el("div", { class: "sponsor-card-head", text: "Walk-In T-Shirt Purchases" }),
          el("div", { class: "sponsor-card-stats" }, [
            el("div", {}, [el("div", { class: "stat-v", text: String(state.tshirtPurchases.length) }), el("div", { class: "stat-k", text: "Purchases" })]),
            el("div", {}, [el("div", { class: "stat-v", text: fmtMoney(tshirtPurchaseTotal) }), el("div", { class: "stat-k", text: "Total" })])
          ]),
          tshirtPurchaseSizeMatrix()
        ]),
        el("div", { class: "sponsor-card" }, [
          el("div", { class: "sponsor-card-head", text: "Car Show" }),
          el("div", { style: "margin-bottom:8px" }, ["Judges: " + s.judges]),
          genMatrix(s)
        ]),
        el("div", { class: "sponsor-card" }, [
          el("div", { class: "sponsor-card-head", text: "Clubs" }),
          el("table", { class: "matrix" }, [
            el("thead", {}, [el("tr", {}, [el("th", { class: "lbl", text: "Club" }), el("th", { text: "Attendees" })])]),
            el("tbody", {}, clubRows)
          ])
        ])
      ])
    ]));

    // messages
    if (state.result.messages.length) {
      container.appendChild(el("div", { class: "panel" }, [
        el("h3", { text: "Messages (" + state.result.messages.length + ")" }),
        el("ul", { class: "messages" }, state.result.messages.map(function (x) { return el("li", { text: x }); }))
      ]));
    }
    return container;
  }
  function li(k, v, extra) {
    var kids = [el("span", { class: "k", text: k }), document.createTextNode(v)];
    if (extra) kids.push(extra);
    return el("li", {}, kids);
  }

  // Appends "Total Men's" / "Total Women's" / "Grand Total" columns (row-wise
  // sums, using each group's gender) and a bottom "Total" footer row
  // (column-wise sums) — shared by every shirt-size matrix on the Summary/
  // T-Shirts tabs so they all present totals the same way.
  function withShirtMatrixTotals(head, sizeRows, groups) {
    head.appendChild(el("th", { text: "Total Men's" }));
    head.appendChild(el("th", { text: "Total Women's" }));
    head.appendChild(el("th", { text: "Grand Total" }));
    var colTotals = groups.map(function () { return 0; });
    var mensTotal = 0, womensTotal = 0;
    var body = sizeRows.map(function (row) {
      var mensSum = 0, womensSum = 0;
      row.vals.forEach(function (val, i) {
        colTotals[i] += val;
        if (groups[i].gender === "Men's") mensSum += val; else womensSum += val;
      });
      mensTotal += mensSum;
      womensTotal += womensSum;
      row.cells.push(el("td", { class: mensSum ? "" : "z", text: String(mensSum) }));
      row.cells.push(el("td", { class: womensSum ? "" : "z", text: String(womensSum) }));
      row.cells.push(el("td", { class: (mensSum + womensSum) ? "" : "z", text: String(mensSum + womensSum) }));
      return el("tr", {}, row.cells);
    });
    var footerCells = [el("td", { class: "lbl", text: "Total" })];
    colTotals.forEach(function (t) { footerCells.push(el("td", { style: "font-weight:600", text: String(t) })); });
    footerCells.push(el("td", { style: "font-weight:600", text: String(mensTotal) }));
    footerCells.push(el("td", { style: "font-weight:600", text: String(womensTotal) }));
    footerCells.push(el("td", { style: "font-weight:600", text: String(mensTotal + womensTotal) }));
    body.push(el("tr", {}, footerCells));
    return body;
  }
  function shirtMatrix(s) {
    var C = CONFIG;
    // "Xtra" reads as "Purchased" here (and only here — this is the one
    // matrix that splits Free vs. paid-additional shirts into their own
    // columns) — g.label itself stays "Men's Xtra"/etc. unchanged, since
    // it's also the literal CSV column-name prefix (config.js's
    // SHIRT_BUCKETS) used for import matching well beyond this display.
    var head = el("tr", {}, [el("th", { class: "lbl", text: "Size" })].concat(
      C.GROUPS.map(function (g) { return el("th", { text: g.label.replace("Xtra", "Purchased") }); })));
    var sizeRows = C.SIZES.map(function (sz) {
      var vals = C.GROUPS.map(function (g) { return s.shirtTotals[g.key + sz.key] || 0; });
      var cells = [el("td", { class: "lbl", text: sz.label })].concat(
        vals.map(function (val) { return el("td", { class: val ? "" : "z", text: String(val) }); }));
      return { cells: cells, vals: vals };
    });
    var body = withShirtMatrixTotals(head, sizeRows, C.GROUPS);
    return el("table", { class: "matrix" }, [el("thead", {}, [head]), el("tbody", {}, body)]);
  }
  // Every sponsor of any type can order one or more shirts (no Free/Xtra
  // distinction like registrants — see CONFIG.SPONSOR_SIZE_INDEX; and see
  // LOGIC.sponsorShirtSizes for how a sponsor's shirt order is normalized to
  // a list), so this tallies all of state.sponsors regardless of
  // sponsorType, unlike sponsorStatsByType() which is per-type for the
  // Sponsors summary cards.
  function allSponsorShirtCounts() {
    var counts = {};
    CONFIG.SIZES.forEach(function (sz) { counts[sz.key] = { mens: 0, womens: 0 }; });
    state.sponsors.forEach(function (sp) {
      LOGIC.sponsorShirtSizes(sp).forEach(function (size) {
        var info = CONFIG.SPONSOR_SIZE_INDEX[size];
        if (!info || !counts[info.sizeKey]) return;
        if (info.gender === "Men's") counts[info.sizeKey].mens++; else counts[info.sizeKey].womens++;
      });
    });
    return counts;
  }
  // Purchase-size counts for Walk-In T-Shirt sales (Order T-Shirt screen) —
  // each purchase's size is one of CONFIG.SPONSOR_SHIRT_SIZES's "Men's/
  // Women's <size>" strings (same set used by the Sponsors tab's T-Shirt
  // field), so CONFIG.SPONSOR_SIZE_INDEX maps it straight to { gender,
  // sizeKey }. Shared by combinedShirtMatrix() and tshirtPurchaseSizeMatrix().
  function tshirtPurchaseShirtCounts() {
    var C = CONFIG;
    var counts = {};
    C.SIZES.forEach(function (sz) { counts[sz.key] = { mens: 0, womens: 0 }; });
    state.tshirtPurchases.forEach(function (p) {
      var info = p.size && C.SPONSOR_SIZE_INDEX[p.size];
      if (!info || !counts[info.sizeKey]) return;
      if (info.gender === "Men's") counts[info.sizeKey].mens++; else counts[info.sizeKey].womens++;
    });
    return counts;
  }

  // Appends a "Grand Total" column (Men's + Women's, per row) and a bottom
  // "Total" footer row (Men's/Women's/Grand Total column sums) to a plain
  // Size/Men's/Women's matrix — shared by every such table on the Summary
  // tab (combinedShirtMatrix, tshirtPurchaseSizeMatrix, sponsorSummaryCard).
  function withGenderMatrixTotals(head, rows) {
    head.appendChild(el("th", { text: "Grand Total" }));
    var mensTotal = 0, womensTotal = 0;
    var body = rows.map(function (row) {
      mensTotal += row.mens;
      womensTotal += row.womens;
      row.cells.push(el("td", { class: (row.mens + row.womens) ? "" : "z", text: String(row.mens + row.womens) }));
      return el("tr", {}, row.cells);
    });
    body.push(el("tr", {}, [
      el("td", { class: "lbl", text: "Total" }),
      el("td", { style: "font-weight:600", text: String(mensTotal) }),
      el("td", { style: "font-weight:600", text: String(womensTotal) }),
      el("td", { style: "font-weight:600", text: String(mensTotal + womensTotal) })
    ]));
    return body;
  }
  // Registration shirtTotals, scoped to only registrations whose Status
  // classifies as "paid" — shared by combinedShirtMatrix() and
  // tshirtOrderShirtCounts() (the T-Shirt Order Email) so both agree on
  // what "how many shirts do we actually need to order" means: don't count
  // someone who never completed payment.
  function paidRegShirtTotals() {
    var paidRows = allRegistrations().filter(function (r) { return classifyStatus(r["Status"]) === "paid"; });
    return LOGIC.summarizeRecords(paidRows, CONFIG).shirtTotals;
  }
  // Paid-registration shirts (Free+Xtra collapsed to just gender) plus
  // sponsor shirts, per size — deliberately excludes Walk-In T-Shirt
  // purchases (those are day-of-event sales already fulfilled on the spot,
  // not part of what needs to be ordered ahead of time) — as opposed to the
  // registration-only breakdown in shirtMatrix() (which is unfiltered).
  function combinedShirtMatrix() {
    var C = CONFIG;
    var totals = paidRegShirtTotals();
    var sponsorCounts = allSponsorShirtCounts();
    var head = el("tr", {}, [el("th", { class: "lbl", text: "Size" }), el("th", { text: "Men's" }), el("th", { text: "Women's" })]);
    var rows = C.SIZES.map(function (sz) {
      var regMens = 0, regWomens = 0;
      C.GROUPS.forEach(function (g) {
        var val = totals[g.key + sz.key] || 0;
        if (g.gender === "Men's") regMens += val; else regWomens += val;
      });
      var mens = regMens + sponsorCounts[sz.key].mens;
      var womens = regWomens + sponsorCounts[sz.key].womens;
      var cells = [
        el("td", { class: "lbl", text: sz.label }),
        el("td", { class: mens ? "" : "z", text: String(mens) }),
        el("td", { class: womens ? "" : "z", text: String(womens) })
      ];
      return { cells: cells, mens: mens, womens: womens };
    });
    var body = withGenderMatrixTotals(head, rows);
    return el("table", { class: "matrix" }, [el("thead", {}, [head]), el("tbody", {}, body)]);
  }

  // Size breakdown for Walk-In T-Shirt purchases (Summary tab).
  function tshirtPurchaseSizeMatrix() {
    var C = CONFIG;
    var counts = tshirtPurchaseShirtCounts();
    var head = el("tr", {}, [el("th", { class: "lbl", text: "Size" }), el("th", { text: "Men's" }), el("th", { text: "Women's" })]);
    var rows = C.SIZES.map(function (sz) {
      var mens = counts[sz.key].mens, womens = counts[sz.key].womens;
      var cells = [
        el("td", { class: "lbl", text: sz.label }),
        el("td", { class: mens ? "" : "z", text: String(mens) }),
        el("td", { class: womens ? "" : "z", text: String(womens) })
      ];
      return { cells: cells, mens: mens, womens: womens };
    });
    var body = withGenderMatrixTotals(head, rows);
    return el("table", { class: "matrix" }, [el("thead", {}, [head]), el("tbody", {}, body)]);
  }

  // Shirt totals for the T-Shirt Order Email (Developer > 📧 T-Shirt Order
  // Email) — same "registration shirts collapsed to gender, plus every
  // sponsor's own pick" combination as combinedShirtMatrix() above, but
  // scoped to only registrations whose Status classifies as "paid" (an
  // explicit choice — a shirt order shouldn't include people who never
  // completed payment), and returning plain data rather than a DOM table so
  // it can feed the email's plain-text body.
  function tshirtOrderShirtCounts() {
    var totals = paidRegShirtTotals();
    var sponsorCounts = allSponsorShirtCounts();
    return CONFIG.SIZES.map(function (sz) {
      var mens = 0, womens = 0;
      CONFIG.GROUPS.forEach(function (g) {
        var val = totals[g.key + sz.key] || 0;
        if (g.gender === "Men's") mens += val; else womens += val;
      });
      mens += sponsorCounts[sz.key].mens;
      womens += sponsorCounts[sz.key].womens;
      return { label: sz.label, mens: mens, womens: womens };
    });
  }
  function tshirtEmailSponsorList(typeKey) {
    return state.sponsors
      .filter(function (sp) { return sp.sponsorType === typeKey; })
      .slice()
      .sort(function (a, b) { return sponsorSortValue(a, "regDate") - sponsorSortValue(b, "regDate"); });
  }
  // "M/D" (no leading zeros, no year/time) — same raw source
  // sponsorFieldText()'s "regDate" case reads (s.regDate from the CSV
  // auto-sync, or s.submittedAt from a web sponsor-form submission), just
  // formatted short for the T-Shirt Order Email's Premier/Corporate lines.
  function tshirtEmailRegDateShort(sp) {
    var raw = sp.regDate || sp.submittedAt;
    if (!raw) return "";
    var d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  // Plain text (not HTML) — carshow_send_mail() only sends text/plain, and a
  // plain-text preview is trivially exact: what's shown is byte-for-byte
  // what gets sent, with no separate HTML-rendering path to drift from it.
  function buildTshirtOrderEmailBody() {
    var lines = ["ETCC Car Show — T-Shirt Order", ""];
    function section(title, list, textFn) {
      lines.push(title);
      if (!list.length) {
        lines.push("  (none)");
      } else {
        list.forEach(function (item) { lines.push("  - " + textFn(item)); });
      }
      lines.push("");
    }
    // Premier/Corporate lines carry a trailing "(M/D)" reg date — ordering
    // ascending by that same date (already tshirtEmailSponsorList()'s sort)
    // means the printed date always increases down the list, at a glance
    // confirming nothing is out of order. Individual Sponsors below
    // deliberately doesn't get a date suffix — not asked for, and that list
    // often reads "(Text)" already via individualSponsorshipText.
    function withRegDate(sp) {
      var label = sp.individualSponsorshipText || sp.name;
      var short = tshirtEmailRegDateShort(sp);
      return short ? label + " (" + short + ")" : label;
    }
    section("PREMIER SPONSORS", tshirtEmailSponsorList("premier"), withRegDate);
    section("CORPORATE SPONSORS", tshirtEmailSponsorList("corporate"), withRegDate);
    section("INDIVIDUAL SPONSORS", tshirtEmailSponsorList("individual"), function (sp) {
      return sp.individualSponsorshipText || sp.name;
    });
    lines.push("SHIRT COUNTS (Paid registrations + all sponsors, by size)");
    tshirtOrderShirtCounts().forEach(function (c) {
      lines.push("  " + c.label + " — Men's: " + c.mens + ", Women's: " + c.womens);
    });
    return lines.join("\n");
  }

  function genMatrix(s) {
    var head = el("tr", {}, [
      el("th", { class: "lbl", text: "Generation" }), el("th", { text: "Years" }),
      el("th", { text: "At Event" }), el("th", { text: "In Car Show" })
    ]);
    var body = s.gens.map(function (g) {
      return el("tr", {}, [
        el("td", { class: "lbl", text: g.gen }),
        el("td", { text: g.from + "–" + g.to }),
        el("td", { class: g.atEvent ? "" : "z", text: String(g.atEvent) }),
        el("td", { class: g.inCarShow ? "" : "z", text: String(g.inCarShow) })
      ]);
    });
    var atEventTotal = s.gens.reduce(function (sum, g) { return sum + g.atEvent; }, 0);
    var inCarShowTotal = s.gens.reduce(function (sum, g) { return sum + g.inCarShow; }, 0);
    body.push(el("tr", {}, [
      el("td", { class: "lbl", style: "font-weight:600", text: "Total" }),
      el("td", {}),
      el("td", { style: "font-weight:600", text: String(atEventTotal) }),
      el("td", { style: "font-weight:600", text: String(inCarShowTotal) })
    ]));
    return el("table", { class: "matrix" }, [el("thead", {}, [head]), el("tbody", {}, body)]);
  }

  // ---------- sponsors ----------
  // Manually entered/edited, stored in localStorage — not derived from the CSV
  // exports, so this tab (and its data) is independent of whatever registration
  // data happens to be loaded.
  var SPONSOR_COLS = [
    { key: "name", label: "Sponsor Name" },
    { key: "etccMemberName", label: "Member" },
    { key: "regDate", label: "Reg Date" },
    { key: "sponsorType", label: "Sponsor Type" },
    { key: "donation", label: "Donation" },
    { key: "lastPaymentDate", label: "Payment Date" },
    { key: "lastPaymentType", label: "Type" },
    { key: "lastPaymentCheckNum", label: "Check #" },
    { key: "lastPaymentAmount", label: "Paid" },
    { key: "shirtSize", label: "T-Shirt" },
    { key: "contactPerson", label: "Contact Person" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "website", label: "Website" },
    { key: "individualSponsorshipText", label: "T-Shirt Text" }
  ];
  function sponsorTypeLabel(key) {
    var t = CONFIG.SPONSOR_TYPES.filter(function (x) { return x.key === key; })[0];
    return t ? t.label : (key || "");
  }

  // Per-type totals + shirt-size breakdown for the Summary tab's sponsor cards.
  // A sponsor can order more than one shirt (see LOGIC.sponsorShirtSizes),
  // so this tallies every size each sponsor of this type ordered, not just
  // their first — no free/xtra quantities like registrants have, though.
  function sponsorStatsByType(typeKey) {
    var typeCfg = CONFIG.SPONSOR_TYPES.filter(function (t) { return t.key === typeKey; })[0];
    var matches = state.sponsors.filter(function (s) { return s.sponsorType === typeKey; });
    var sizeCounts = {};
    CONFIG.SIZES.forEach(function (sz) { sizeCounts[sz.key] = { mens: 0, womens: 0 }; });
    matches.forEach(function (s) {
      LOGIC.sponsorShirtSizes(s).forEach(function (size) {
        var info = CONFIG.SPONSOR_SIZE_INDEX[size];
        if (!info || !sizeCounts[info.sizeKey]) return;
        if (info.gender === "Men's") sizeCounts[info.sizeKey].mens++; else sizeCounts[info.sizeKey].womens++;
      });
    });
    // Sum what's actually been PAID, not what's pledged — a sponsor's own
    // "donation" field (SPONSOR_COLS' "Donation") is the amount owed, set
    // when they're added/backfilled, but this total should only count money
    // actually collected: each sponsor's last recorded payment amount (0 if
    // none yet). A sponsor whose Donation is $0 already has a $0 payment on
    // file (see public-sponsor-form.php/member-sponsor-form.php), which
    // correctly contributes nothing here either way.
    var total = matches.reduce(function (sum, s) {
      var payment = getLastPaymentForSponsor(s.id);
      return sum + (payment ? Number(payment.amount) || 0 : 0);
    }, 0);
    return {
      label: typeCfg ? typeCfg.label.replace(/\s*\(\$[\d,]+\)\s*$/, "") : typeKey,
      count: matches.length,
      total: total,
      sizeCounts: sizeCounts
    };
  }

  function sponsorSummaryCard(typeKey) {
    var stats = sponsorStatsByType(typeKey);
    var head = el("tr", {}, [el("th", { class: "lbl", text: "Size" }), el("th", { text: "Men's" }), el("th", { text: "Women's" })]);
    var rows = CONFIG.SIZES.map(function (sz) {
      var c = stats.sizeCounts[sz.key];
      var cells = [
        el("td", { class: "lbl", text: sz.label }),
        el("td", { class: c.mens ? "" : "z", text: String(c.mens) }),
        el("td", { class: c.womens ? "" : "z", text: String(c.womens) })
      ];
      return { cells: cells, mens: c.mens, womens: c.womens };
    });
    var body = withGenderMatrixTotals(head, rows);
    var table = el("table", { class: "matrix" }, [el("thead", {}, [head]), el("tbody", {}, body)]);
    return el("div", { class: "sponsor-card" }, [
      el("div", { class: "sponsor-card-head", text: stats.label + " Sponsors" }),
      el("div", { class: "sponsor-card-stats" }, [
        el("div", {}, [el("div", { class: "stat-v", text: String(stats.count) }), el("div", { class: "stat-k", text: stats.count === 1 ? "Sponsor" : "Sponsors" })]),
        el("div", {}, [el("div", { class: "stat-v", text: fmtMoney(stats.total) }), el("div", { class: "stat-k", text: "Total" })])
      ]),
      table
    ]);
  }
  // See LOGIC.pickLatestPayment's comment (logic.js) for why this sorts by
  // recordedAt rather than date.
  function getLastPaymentForSponsor(sponsorId) {
    var sponsorPayments = state.payments.filter(function (p) { return p.sponsorId === sponsorId; });
    return LOGIC.pickLatestPayment(sponsorPayments);
  }
  // True when there's no payment on file yet, or the last one's amount is 0 —
  // the Sponsors table shows a "Mark Paid…" button in the Amount column for
  // these, opening Edit Sponsor's Record Payment section so an officer can
  // enter the actual amount/type/check # instead of assuming a default.
  // Exception: a sponsor whose Donation is pledged at $0 owes nothing, so
  // they're never "unpaid" regardless of payment history — the public
  // sponsor forms already record a $0 payment dated today for exactly this
  // case (see public-sponsor-form.php/member-sponsor-form.php's own
  // comment), so this only matters if that record is ever missing/edited.
  function sponsorAmountIsZero(s) {
    if (Number(s.donation) === 0) return false;
    var payment = getLastPaymentForSponsor(s.id);
    return !payment || !payment.amount || Number(payment.amount) === 0;
  }

  function sponsorFieldText(s, colKey) {
    if (colKey === "sponsorType") return sponsorTypeLabel(s.sponsorType);
    if (colKey === "donation") return s.donation == null || s.donation === "" ? "" : fmtMoney(s.donation);
    if (colKey === "lastPaymentDate") {
      var payment = getLastPaymentForSponsor(s.id);
      return payment ? fmtDate(payment.date) : "";
    }
    if (colKey === "lastPaymentType") {
      var payment = getLastPaymentForSponsor(s.id);
      return payment ? payment.paymentType : "";
    }
    if (colKey === "lastPaymentCheckNum") {
      var payment = getLastPaymentForSponsor(s.id);
      return payment ? (payment.checkNum || "—") : "";
    }
    if (colKey === "lastPaymentAmount") {
      var payment = getLastPaymentForSponsor(s.id);
      return payment ? fmtMoney(payment.amount) : "";
    }
    // regDate isn't a single stored field — it depends on where the sponsor
    // came from: the CSV auto-sync stores the registration's own "Reg Date"
    // (already a formatted string, see syncSponsorsFromRegistrations), while
    // a "Become a Car Show Sponsor" web submission has no CSV row at all, so
    // it uses member-sponsor-form.php's submittedAt (ISO string) instead, formatted
    // to match. Manually-added sponsors with neither show blank.
    if (colKey === "regDate") {
      if (s.regDate) return fmtCsvDate(s.regDate);
      if (s.submittedAt) return fmtDate(s.submittedAt);
      return "";
    }
    if (colKey === "phone") return fmtPhone(s.phone) || "";
    // A sponsor can order more than one shirt (see LOGIC.sponsorShirtSizes) —
    // shown as a comma list here rather than just the first.
    if (colKey === "shirtSize") return LOGIC.sponsorShirtSizes(s).join(", ");
    var v = s[colKey];
    return v == null ? "" : String(v);
  }
  // Column-specific sort values: dates/amounts compare numerically (via their
  // underlying Date/Number, not their formatted display string — sorting
  // "$100.00" vs "$20.00" as text would put $100 first), everything else
  // falls back to sponsorFieldText()'s lowercased display string.
  function sponsorSortValue(s, colKey) {
    if (colKey === "regDate") {
      var raw = s.regDate || s.submittedAt;
      var d = raw ? new Date(raw) : null;
      return d && !isNaN(d.getTime()) ? d.getTime() : -Infinity;
    }
    if (colKey === "lastPaymentDate" || colKey === "lastPaymentAmount") {
      var payment = getLastPaymentForSponsor(s.id);
      if (colKey === "lastPaymentAmount") return payment ? Number(payment.amount) || 0 : 0;
      return payment && payment.date ? parseMaybeDateOnly(payment.date).getTime() : -Infinity;
    }
    if (colKey === "donation") return Number(s.donation) || 0;
    return sponsorFieldText(s, colKey).toLowerCase();
  }
  function sortedSponsors() {
    var col = state.sponsorSortCol, dir = state.sponsorSortDir;
    return state.sponsors.slice().sort(function (a, b) {
      if (col) {
        var av = sponsorSortValue(a, col), bv = sponsorSortValue(b, col);
        if (av < bv) return -dir;
        if (av > bv) return dir;
        return 0;
      }
      var an = (a.name || "").toLowerCase(), bn = (b.name || "").toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  }
  function visibleSponsors() {
    var q = state.sponsorSearch.trim().toLowerCase();
    var list = sortedSponsors().filter(function (s) { return state.sponsorTypeFilter[s.sponsorType] !== false; });
    if (state.sponsorPaidFilter === "unpaid") list = list.filter(sponsorAmountIsZero);
    else if (state.sponsorPaidFilter === "paid") list = list.filter(function (s) { return !sponsorAmountIsZero(s); });
    if (!q) return list;
    return list.filter(function (s) {
      return SPONSOR_COLS.some(function (c) { return sponsorFieldText(s, c.key).toLowerCase().indexOf(q) !== -1; });
    });
  }
  // Local state is updated optimistically; the write additionally
  // (asynchronously) goes to the server — every officer viewing the site
  // reads that same server copy on their next page load.
  function upsertSponsor(record) {
    var idx = -1;
    state.sponsors.forEach(function (s, i) { if (s.id === record.id) idx = i; });
    if (idx === -1) state.sponsors.push(record); else state.sponsors[idx] = record;
    pushSponsorToServer("upsert", { sponsor: record });
    // Covers a brand-new Individual Sponsorship added directly (Edit Sponsor
    // modal's Save, or a member-sponsor-form.php submission ingested via
    // ingestSponsors) — backfillPaymentDefaults() no-ops for sponsors that
    // already have a payment record, so this is safe to call unconditionally.
    // backfillSponsorDonations() is likewise a no-op here in the common case
    // (buildSponsorRecord() already sets `donation` on every save) — this
    // covers records upserted some other way (e.g. a CSV sync record with no
    // donation field at all).
    backfillSponsorDonations();
    backfillPaymentDefaults();
  }
  // CSV-auto-synced sponsors (id shape "csvind_..." — see csvSponsorId())
  // would otherwise reappear on the next sync as long as the underlying
  // registration's Individual Sponsorship fee is still there, so their id is
  // also tombstoned in deleted-sponsors.json (mirrors deleted-registrations.json
  // for the Registration tab) and excluded by syncSponsorsFromRegistrations()
  // from then on. Web-submitted/manually-added sponsors aren't re-synced, so
  // the plain server delete below is already permanent for them.
  function removeSponsor(id) {
    state.sponsors = state.sponsors.filter(function (s) { return s.id !== id; });
    pushSponsorToServer("delete", { id: id });
    if (id.indexOf("csvind_") === 0) {
      state.deletedSponsorIds[id] = true;
      pushDeletedSponsorsToServer([id]);
    }
  }
  function pushDeletedSponsorsToServer(ids) {
    if (!SITE_CONFIG.deletedSponsorsApiUrl) return;
    fetch(SITE_CONFIG.deletedSponsorsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", ids: ids })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.sponsorSyncError = null;
    }).catch(function () {
      state.sponsorSyncError = "Could not save that deletion to the server — it'll reappear if the page is reloaded before this succeeds. Check your connection and try again.";
      if (state.tab === "sponsors") renderViews();
    });
  }

  // ---------- walk-in registrations (Registration tab's "+ Add Registration") ----------
  // Same optimistic-local-update-then-server-push pattern as sponsors above —
  // see upsertSponsor/pushSponsorToServer's comments.
  function upsertWalkin(record) {
    var idx = -1;
    state.walkins.forEach(function (w, i) { if (w.id === record.id) idx = i; });
    if (idx === -1) state.walkins.push(record); else state.walkins[idx] = record;
    pushWalkinToServer("upsert", { registration: record });
    syncPaidRegistrationsCache();
  }
  function removeWalkin(id) {
    state.walkins = state.walkins.filter(function (w) { return w.id !== id; });
    pushWalkinToServer("delete", { id: id });
    syncPaidRegistrationsCache();
  }
  function pushWalkinToServer(action, payload) {
    if (!SITE_CONFIG.walkinsApiUrl) return;
    var body = { action: action };
    Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
    fetch(SITE_CONFIG.walkinsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.walkinSyncError = null;
      renderViews();
    }).catch(function () {
      state.walkinSyncError = "Could not save that change to the server — check your connection and try again.";
      renderViews();
    });
  }

  // ---------- t-shirt purchases (T-Shirts tab's "🛒 Order T-Shirt") ----------
  // Same optimistic-local-update-then-server-push pattern as sponsors/walkins
  // above — see upsertSponsor/pushSponsorToServer's comments.
  function upsertTshirtPurchase(record) {
    var idx = -1;
    state.tshirtPurchases.forEach(function (p, i) { if (p.id === record.id) idx = i; });
    if (idx === -1) state.tshirtPurchases.push(record); else state.tshirtPurchases[idx] = record;
    pushTshirtPurchaseToServer("upsert", { purchase: record });
  }
  function removeTshirtPurchase(id) {
    state.tshirtPurchases = state.tshirtPurchases.filter(function (p) { return p.id !== id; });
    pushTshirtPurchaseToServer("delete", { id: id });
  }
  function pushTshirtPurchaseToServer(action, payload) {
    if (!SITE_CONFIG.tshirtPurchasesApiUrl) return;
    var body = { action: action };
    Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
    fetch(SITE_CONFIG.tshirtPurchasesApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.tshirtPurchaseSyncError = null;
      renderTshirtPurchasePage();
    }).catch(function () {
      state.tshirtPurchaseSyncError = "Could not save that change to the server — check your connection and try again.";
      renderTshirtPurchasePage();
    });
  }

  // ---------- row selection (Sponsors tab checkboxes) ----------
  function selectedSponsorIds() { return Object.keys(state.sponsorSelected); }
  function setSponsorSelected(id, checked) {
    if (checked) state.sponsorSelected[id] = true; else delete state.sponsorSelected[id];
  }
  function toggleSelectAllSponsors(checked) {
    visibleSponsors().forEach(function (s) { setSponsorSelected(s.id, checked); });
    renderSponsorsBody();
  }
  // Removes every selected sponsor the same way the single-delete path does
  // (one removeSponsor() call per id — no batch endpoint exists on the server,
  // and at this club's scale a handful of sequential fire-and-forget deletes
  // is an acceptable tradeoff versus adding one).
  function deleteSelectedSponsors() {
    selectedSponsorIds().forEach(function (id) { removeSponsor(id); });
    state.sponsorSelected = {};
    renderViews();
  }
  // Fire-and-forget (with a visible failure indicator) rather than blocking the
  // UI on a round-trip — the local list already reflects the change immediately.
  // No re-fetch/merge afterward: two officers editing at the exact same moment
  // is rare enough for this club-sized app that "last write wins, reload to see
  // others' changes" is an acceptable tradeoff versus building real-time sync.
  function pushSponsorToServer(action, payload) {
    if (!SITE_CONFIG.sponsorsApiUrl) return;
    var body = { action: action };
    Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
    fetch(SITE_CONFIG.sponsorsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.sponsorSyncError = null;
      if (state.tab === "sponsors") renderViews();
    }).catch(function () {
      state.sponsorSyncError = "Could not save that change to the server — check your connection and try again.";
      if (state.tab === "sponsors") renderViews();
    });
  }

  // Re-fetches sponsors, their deleted-CSV-sponsor tombstones, and payments —
  // the three pieces of server state the Sponsors tab depends on — and
  // re-renders in place. Deliberately NOT a location.reload(): a full reload
  // re-runs the whole app boot, which is a lot of churn for what's meant to
  // be a quick "did someone else just add a sponsor" check. Registrations/CSV data is NOT re-fetched
  // here (there's no live endpoint for it — see index.php's boot script) so
  // syncSponsorsFromRegistrations() re-runs against whatever CSV is already
  // loaded in this tab, same as it would on a normal page load.
  function refreshSponsorsFromServer() {
    if (!SITE_CONFIG.sponsorsApiUrl) return;
    state.sponsorsRefreshing = true;
    state.sponsorSyncError = null;
    renderViews();
    var fetchJson = function (url, action) {
      if (!url) return Promise.resolve(null);
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action })
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
    };
    Promise.all([
      fetchJson(SITE_CONFIG.sponsorsApiUrl, "list"),
      fetchJson(SITE_CONFIG.sponsorPaymentsApiUrl, "list"),
      fetchJson(SITE_CONFIG.deletedSponsorsApiUrl, "list")
    ]).then(function (results) {
      var sponsorsRes = results[0], paymentsRes = results[1], deletedRes = results[2];
      if (sponsorsRes && sponsorsRes.ok) state.sponsors = Array.isArray(sponsorsRes.sponsors) ? sponsorsRes.sponsors : [];
      if (deletedRes && deletedRes.ok) {
        state.deletedSponsorIds = {};
        (Array.isArray(deletedRes.ids) ? deletedRes.ids : []).forEach(function (id) { state.deletedSponsorIds[id] = true; });
      }
      if (paymentsRes && paymentsRes.ok) state.payments = Array.isArray(paymentsRes.payments) ? paymentsRes.payments : [];
      syncSponsorsFromRegistrations();
      if (sponsorsRes && sponsorsRes.ok) backfillSponsorDonations();
      if (paymentsRes && paymentsRes.ok) backfillPaymentDefaults();
      state.sponsorsRefreshing = false;
      renderViews();
    }).catch(function () {
      state.sponsorsRefreshing = false;
      state.sponsorSyncError = "Could not refresh from the server — check your connection and try again.";
      renderViews();
    });
  }

  // ---------- remove all sponsors ----------
  function openClearSponsorsConfirm() { state.clearSponsorsOpen = true; renderClearSponsorsConfirm(); }
  function closeClearSponsorsConfirm() { state.clearSponsorsOpen = false; renderClearSponsorsConfirm(); }
  function clearAllSponsors() {
    // Unlike removeSponsor(), this is a full reset (new season/event) rather
    // than a per-row permanent delete, so CSV-auto-synced sponsors (id shape
    // "csvind_...") are deliberately left un-tombstoned here — they should
    // reappear on the next sync against the new event's registrations.
    state.sponsors = [];
    pushSponsorToServer("clear", {});
    renderViews();
  }
  function renderClearSponsorsConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.clearSponsorsOpen) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeClearSponsorsConfirm);
    var head = el("div", { class: "modal-head" }, [el("h3", { text: "Remove All Sponsors?" }), el("span", { class: "spacer" }), closeBtn]);

    var count = state.sponsors.length;
    var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" },
      ["Yes, Remove All"]);
    yesBtn.addEventListener("click", function () { closeClearSponsorsConfirm(); clearAllSponsors(); });
    var noBtn = el("button", { class: "btn" }, ["Cancel"]);
    noBtn.addEventListener("click", closeClearSponsorsConfirm);

    var body = el("div", { class: "modal-body" }, [
      el("p", {}, ["This permanently removes all " + count + " sponsor" + (count === 1 ? "" : "s") +
        " from the server. This cannot be undone."]),
      el("div", { class: "settings-actions" }, [yesBtn, noBtn])
    ]);

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeClearSponsorsConfirm);
    host.appendChild(backdrop);
  }

  // ---------- delete selected sponsors ----------
  function openDeleteSelectedConfirm() {
    if (!selectedSponsorIds().length) return;
    state.deleteSelectedOpen = true;
    renderDeleteSelectedConfirm();
  }
  function closeDeleteSelectedConfirm() { state.deleteSelectedOpen = false; renderDeleteSelectedConfirm(); }
  function renderDeleteSelectedConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.deleteSelectedOpen) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeDeleteSelectedConfirm);
    var count = selectedSponsorIds().length;
    var head = el("div", { class: "modal-head" }, [el("h3", { text: "Delete " + count + " Sponsor" + (count === 1 ? "" : "s") + "?" }), el("span", { class: "spacer" }), closeBtn]);

    var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" },
      ["Yes, Delete"]);
    yesBtn.addEventListener("click", function () { closeDeleteSelectedConfirm(); deleteSelectedSponsors(); });
    var noBtn = el("button", { class: "btn" }, ["Cancel"]);
    noBtn.addEventListener("click", closeDeleteSelectedConfirm);

    var body = el("div", { class: "modal-body" }, [
      el("p", {}, ["This permanently removes the " + count + " selected sponsor" + (count === 1 ? "" : "s") +
        " from the server. This cannot be undone."]),
      el("div", { class: "settings-actions" }, [yesBtn, noBtn])
    ]);

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeDeleteSelectedConfirm);
    host.appendChild(backdrop);
  }

  function buildSponsorsToolbar() {
    var search = el("input", { type: "search", placeholder: "Search sponsors…", value: state.sponsorSearch });
    search.addEventListener("input", function () { state.sponsorSearch = search.value; renderSponsorsBody(); });
    var typeGroup = el("span", { class: "statusgroup" }, CONFIG.SPONSOR_TYPES.map(function (t) {
      var cb = el("input", { type: "checkbox" }); cb.checked = state.sponsorTypeFilter[t.key];
      cb.addEventListener("change", function () { state.sponsorTypeFilter[t.key] = cb.checked; renderSponsorsBody(); });
      var label = t.label.replace(/\s*\(\$[\d,]+\)\s*$/, "");
      return el("label", {}, [cb, document.createTextNode(" " + label)]);
    }));
    var paidSelect = el("select", {}, [
      el("option", { value: "all", text: "All" }),
      el("option", { value: "paid", text: "Paid" }),
      el("option", { value: "unpaid", text: "Unpaid" })
    ]);
    paidSelect.value = state.sponsorPaidFilter;
    paidSelect.addEventListener("change", function () { state.sponsorPaidFilter = paidSelect.value; renderSponsorsBody(); });
    var paidGroup = el("label", { class: "statusgroup" }, [document.createTextNode("Paid: "), paidSelect]);
    var count = el("span", { class: "count", id: "sponsorcount" });
    // Adding a sponsor goes through the same public "Become a Car Show
    // Sponsor" form (member-sponsor-form.php) anyone else uses, instead of the
    // in-app modal — keeps one path for entries to land in
    // sponsor-submissions.json. The from=app marker tells that page a
    // successful submission came from inside this app (vs. a link on
    // ClubExpress/the club's main site) — see its post-submit redirect.
    var addBtn = el("button", { class: "btn primary" }, ["+ Add Sponsor"]);
    addBtn.addEventListener("click", function () { window.open("member-sponsor-form.php?from=app", "_blank", "noopener"); });
    // Re-fetches just the sponsor-related data in place — NOT a page reload.
    // Picks up whatever another officer (or the public sign-up form) has
    // added/changed since this tab was opened.
    var refreshBtn = el("button", { class: "btn", title: "Reload sponsor data from the server" },
      [state.sponsorsRefreshing ? "Refreshing…" : "🔄 Refresh"]);
    if (state.sponsorsRefreshing) refreshBtn.setAttribute("disabled", "disabled");
    refreshBtn.addEventListener("click", refreshSponsorsFromServer);
    var delBtn = el("button", { class: "btn", id: "sponsorDeleteBtn", disabled: "disabled" }, ["🗑 Delete"]);
    delBtn.addEventListener("click", openDeleteSelectedConfirm);
    var zoomOut = el("button", { class: "btn", title: "Zoom out" }, ["−"]);
    zoomOut.addEventListener("click", function () { setSponsorZoom(state.sponsorZoom - 0.1); });
    var zoomIn = el("button", { class: "btn", title: "Zoom in" }, ["+"]);
    zoomIn.addEventListener("click", function () { setSponsorZoom(state.sponsorZoom + 0.1); });
    var zoomFit = el("button", { class: "btn", title: "Shrink just enough to fit every column on screen" }, ["Fit"]);
    zoomFit.addEventListener("click", fitSponsorZoom);
    var zoomLabel = el("span", { class: "count", text: Math.round(state.sponsorZoom * 100) + "%" });
    var zoomGroup = el("span", { class: "zoomgroup" }, [zoomOut, zoomLabel, zoomIn, zoomFit]);
    var kids = [search, typeGroup, paidGroup, count, el("span", { class: "spacer" }), zoomGroup];
    kids.push(delBtn, addBtn, refreshBtn);
    return el("div", { class: "toolbar no-print" }, kids);
  }

  function buildSponsorsView() {
    var container = el("div", { class: "view" });
    if (state.sponsorSyncError) {
      container.appendChild(el("div", { class: "messages", style: "margin-bottom:10px" }, [state.sponsorSyncError]));
    }
    var selectAllCb = el("input", { type: "checkbox", id: "sponsorSelectAll", title: "Select all" });
    selectAllCb.addEventListener("change", function () { toggleSelectAllSponsors(selectAllCb.checked); });
    var thead = el("thead", {}, [el("tr", {}, [el("th", { class: "no-print" }, [selectAllCb])]
      .concat(SPONSOR_COLS.map(function (c) {
        var arrow = state.sponsorSortCol === c.key ? (state.sponsorSortDir === 1 ? " ▲" : " ▼") : "";
        var th = el("th", {}, [c.label, el("span", { class: "arrow", text: arrow })]);
        th.addEventListener("click", function () {
          if (state.sponsorSortCol === c.key) state.sponsorSortDir = -state.sponsorSortDir;
          else { state.sponsorSortCol = c.key; state.sponsorSortDir = 1; }
          renderViews();
        });
        return th;
      }))
      .concat([el("th", { class: "no-print", text: "" })]))]);
    // zoom on the table, not the wrap — see buildRegView()'s note.
    var table = el("table", { class: "grid", style: "zoom:" + state.sponsorZoom }, [thead, el("tbody", { id: "sponsorbody" })]);
    container.appendChild(el("div", { class: "tablewrap fill" }, [table]));
    setTimeout(function () {
      renderSponsorsBody();
      if (!state.sponsorZoomAutoFitDone) { state.sponsorZoomAutoFitDone = true; fitSponsorZoom(); }
    }, 0);
    return container;
  }

  function renderSponsorsBody() {
    if (state.tab !== "sponsors") return;
    var body = $("#sponsorbody"); if (!body) return;
    var rows = visibleSponsors();
    var frag = document.createDocumentFragment();
    rows.forEach(function (s) {
      var tr = el("tr", {});
      tr.title = "Click for full details";
      tr.addEventListener("click", function () { openSponsorForm(s); });
      var cb = el("input", { type: "checkbox" });
      cb.checked = !!state.sponsorSelected[s.id];
      cb.addEventListener("click", function (e) { e.stopPropagation(); });
      cb.addEventListener("change", function () { setSponsorSelected(s.id, cb.checked); renderSponsorsBody(); });
      tr.appendChild(el("td", { class: "no-print" }, [cb]));
      SPONSOR_COLS.forEach(function (c) {
        if (c.key === "lastPaymentAmount" && sponsorAmountIsZero(s)) {
          // Opens a small dedicated payment modal (Payment Type/Check #/
          // Amount only) instead of blindly logging a full-fee Cash payment —
          // an officer needs to record whatever was actually paid, which
          // isn't always the full fee in cash.
          var markPaidBtn = el("button", { class: "btn", style: "padding:2px 8px; font-size:12px" }, ["Mark Paid…"]);
          markPaidBtn.addEventListener("click", function (e) { e.stopPropagation(); openPaymentModal(s); });
          tr.appendChild(el("td", {}, [markPaidBtn]));
        } else if (c.key === "email" && s.email) {
          var mailLink = el("a", { href: "mailto:" + s.email, text: s.email });
          mailLink.addEventListener("click", function (e) { e.stopPropagation(); });
          tr.appendChild(el("td", {}, [mailLink]));
        } else if (c.key === "website" && s.website) {
          var websiteHref = /^https?:\/\//i.test(s.website) ? s.website : "https://" + s.website;
          var siteLink = el("a", { href: websiteHref, target: "_blank", rel: "noopener", text: s.website });
          siteLink.addEventListener("click", function (e) { e.stopPropagation(); });
          tr.appendChild(el("td", {}, [siteLink]));
        } else {
          tr.appendChild(el("td", { text: sponsorFieldText(s, c.key) }));
        }
      });
      tr.appendChild(el("td", { class: "no-print" }));
      frag.appendChild(tr);
    });
    body.innerHTML = "";
    body.appendChild(frag);
    var rc = $("#sponsorcount");
    if (rc) rc.textContent = rows.length + " of " + state.sponsors.length + " sponsors shown";
    if (!state.sponsors.length) {
      body.appendChild(el("tr", {}, [el("td", { class: "hint", colspan: String(SPONSOR_COLS.length + 2), text: "No sponsors yet — click “+ Add Sponsor” to add one." })]));
    }
    var selectAllCb = $("#sponsorSelectAll");
    if (selectAllCb) {
      var visibleIds = rows.map(function (s) { return s.id; });
      var selectedVisible = visibleIds.filter(function (id) { return state.sponsorSelected[id]; });
      selectAllCb.checked = visibleIds.length > 0 && selectedVisible.length === visibleIds.length;
      selectAllCb.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
    }
    var delBtn = $("#sponsorDeleteBtn");
    if (delBtn) {
      var n = selectedSponsorIds().length;
      delBtn.textContent = "🗑 Delete" + (n ? " (" + n + ")" : "");
      if (n) delBtn.removeAttribute("disabled"); else delBtn.setAttribute("disabled", "disabled");
    }
  }

  // ---------- sponsor add/edit form modal ----------
  var SPONSOR_FORM_FIELDS = [
    { key: "name", label: "Sponsor Name", required: true },
    { key: "contactPerson", label: "Contact Person" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "address", label: "Address" },
    { key: "website", label: "Website" },
    { key: "etccMemberName", label: "Member" },
    { key: "individualSponsorshipText", label: "T-Shirt Text" }
  ];
  function blankSponsor() {
    return {
      id: null, name: "", contactPerson: "", phone: "", email: "", address: "", website: "",
      etccMemberName: "", sponsorType: CONFIG.SPONSOR_TYPES[0].key, donation: CONFIG.SPONSOR_TYPES[0].fee,
      shirtSizes: [], individualSponsorshipText: ""
    };
  }
  function openSponsorForm(sponsor) {
    var src = sponsor || blankSponsor();
    var copy = {};
    Object.keys(src).forEach(function (k) { copy[k] = src[k]; });
    // Normalize to the plural array once, here, so the rest of the modal
    // (and buildSponsorRecord below) only ever deals with one shape — even
    // for a sponsor saved before "order more than one shirt" existed and
    // only has the old singular shirtSize field.
    copy.shirtSizes = LOGIC.sponsorShirtSizes(copy);
    state.sponsorEditing = copy;
    renderSponsorFormModal();
  }
  function closeSponsorForm() { state.sponsorEditing = null; renderSponsorFormModal(); }

  // shirtValues: every non-blank size currently chosen in the modal's
  // repeatable shirt-size rows, in order — see the "T-Shirt(s)" section of
  // renderSponsorFormModal() below. shirtSizes is the current, canonical
  // field; shirtSize (singular, first entry or "") is kept alongside it
  // purely for any older code/report that still reads the old field name —
  // see LOGIC.sponsorShirtSizes's own comment.
  function buildSponsorRecord(editing, fieldEls, typeSel, shirtValues, donationInput) {
    var name = fieldEls.name.value.trim();
    if (!name) return null;
    return {
      id: editing.id || ("sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      name: name,
      regDate: editing.regDate || "",
      submittedAt: editing.submittedAt,
      contactPerson: fieldEls.contactPerson.value.trim(),
      phone: fieldEls.phone.value.trim(),
      email: fieldEls.email.value.trim(),
      address: fieldEls.address.value.trim(),
      website: fieldEls.website.value.trim(),
      etccMemberName: fieldEls.etccMemberName.value.trim(),
      individualSponsorshipText: fieldEls.individualSponsorshipText.value.trim() || name,
      sponsorType: typeSel.value,
      donation: donationInput.value.trim() === "" ? 0 : Number(donationInput.value),
      shirtSizes: shirtValues,
      shirtSize: shirtValues[0] || ""
    };
  }

  function renderSponsorFormModal() {
    var host = $("#sponsorFormHost");
    if (!host) return;
    host.innerHTML = "";
    var editing = state.sponsorEditing;
    if (!editing) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeSponsorForm);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: editing.id ? "Edit Sponsor" : "Add Sponsor" }),
      el("span", { class: "spacer" }), closeBtn
    ]);

    var body = el("div", { class: "modal-body" });
    var fieldEls = {};
    SPONSOR_FORM_FIELDS.forEach(function (f) {
      var input = el("input", { type: "text", value: editing[f.key] || "" });
      if (f.key === "individualSponsorshipText") input.setAttribute("placeholder", editing.name || "");
      fieldEls[f.key] = input;
      body.appendChild(el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: f.label + (f.required ? " *" : "") }),
        input
      ]));
    });
    fieldEls.name.addEventListener("input", function () {
      fieldEls.individualSponsorshipText.setAttribute("placeholder", fieldEls.name.value.trim());
    });

    var regDateText = editing.regDate || (editing.submittedAt ? fmtDate(editing.submittedAt) : "") || "—";
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Reg Date" }),
      el("div", { class: "form-value", text: regDateText })
    ]));

    var typeSel = el("select", {});
    CONFIG.SPONSOR_TYPES.forEach(function (t) {
      var o = el("option", { value: t.key, text: t.label });
      if (editing.sponsorType === t.key) o.setAttribute("selected", "selected");
      typeSel.appendChild(o);
    });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Sponsor Type" }), typeSel]));

    // ---- Donation — defaults per Sponsor Type (Premier $250, Corporate/
    // Individual $100 — CONFIG.SPONSOR_TYPES' own `fee`), editable, and
    // re-applied whenever Sponsor Type changes UNLESS this field has been
    // manually touched — same "don't clobber a deliberate override" rule
    // the public sponsor forms' matching JS uses. This is what
    // sponsorStatsByType() sums for the Summary tab's sponsor totals (not
    // actual payments — see that function's own comment) and what
    // sponsorAmountIsZero() treats as "nothing owed" when it's $0.
    var donationField = moneyInput({ value: editing.donation != null ? String(editing.donation) : "" });
    var donationInput = donationField.input;
    var donationTouched = false;
    donationInput.addEventListener("input", function () { donationTouched = true; });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Donation" }), donationField.wrap]));

    // ---- T-Shirt(s) — a sponsor can order more than one, each its own
    // size (e.g. one for each of several employees). One <select> per shirt
    // ordered, a "+ Add Another Shirt" button appends a blank one, and each
    // row past the first gets a "✕" to remove it. Plain DOM add/remove
    // (not a full modal re-render) so this doesn't disturb focus or the
    // debounced autosave below while an officer is mid-edit elsewhere in
    // the form. buildSponsorRecord() reads every row's current value at
    // save time via getShirtSizeValues() — nothing needs to track them in a
    // separate array.
    function buildShirtSelect(value) {
      var sel = el("select", {});
      sel.appendChild(el("option", { value: "", text: "— none —" }));
      CONFIG.SPONSOR_SHIRT_SIZES.forEach(function (sz) {
        var o = el("option", { value: sz, text: sz });
        if (value === sz) o.setAttribute("selected", "selected");
        sel.appendChild(o);
      });
      return sel;
    }
    function updateShirtRemoveButtons() {
      var showRemove = shirtRowsWrap.children.length > 1;
      Array.prototype.forEach.call(shirtRowsWrap.children, function (row) {
        row.querySelector(".shirt-remove-btn").style.display = showRemove ? "" : "none";
      });
    }
    function addShirtRow(value) {
      var sel = buildShirtSelect(value);
      var removeBtn = el("button", { type: "button", class: "btn shirt-remove-btn", title: "Remove this shirt", style: "padding:6px 10px" }, ["✕"]);
      var row = el("div", { style: "display:flex; gap:6px; margin-bottom:6px" }, [sel, removeBtn]);
      removeBtn.addEventListener("click", function () {
        shirtRowsWrap.removeChild(row);
        updateShirtRemoveButtons();
        autoSaveSponsor();
      });
      shirtRowsWrap.appendChild(row);
      updateShirtRemoveButtons();
    }
    function getShirtSizeValues() {
      return Array.prototype.map.call(shirtRowsWrap.querySelectorAll("select"), function (s) { return s.value; })
        .filter(function (v) { return v; });
    }
    var shirtRowsWrap = el("div", {});
    (editing.shirtSizes.length ? editing.shirtSizes : [""]).forEach(function (v) { addShirtRow(v); });
    var addShirtBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["+ Add Another Shirt"]);
    addShirtBtn.addEventListener("click", function () { addShirtRow(""); });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "T-Shirt(s)" }),
      el("div", {}, [shirtRowsWrap, addShirtBtn])
    ]));
    // Delegated (not per-select) so a row added/removed after this point is
    // covered automatically — see fieldsToWatch below, which does NOT
    // include the individual shirt <select>s for the same reason.
    shirtRowsWrap.addEventListener("input", function () { autoSaveSponsor(); });
    shirtRowsWrap.addEventListener("change", function () { autoSaveSponsor(); });

    body.appendChild(el("div", { style: "border-top: 1px solid var(--line); margin: 20px 0; padding-top: 20px" }, [
      el("h4", { text: "Record Payment", style: "margin: 0 0 15px 0; font-size: 13px; color: var(--muted); text-transform: uppercase" })
    ]));

    // Pre-fill from this sponsor's actual payment record (e.g. one already
    // created by backfillPaymentDefaults()) if one exists, instead of always
    // showing generic today's-date/blank fields — so re-opening an already
    // backfilled Individual Sponsorship shows what was actually recorded.
    var existingPayment = editing.id ? getLastPaymentForSponsor(editing.id) : null;

    var paymentTypeSelect = el("select", {});
    // "Unpaid" isn't a real payment method — it's an escape hatch for a
    // payment recorded in error: selecting it and saving records a $0
    // payment, which is exactly what sponsorAmountIsZero() already treats as
    // "no payment on file", so the sponsor flips back to showing "Mark
    // Paid…" in the Sponsors table instead of a wrong amount.
    ["Cash", "Check", "Credit Card", "Unpaid"].forEach(function (t) {
      paymentTypeSelect.appendChild(el("option", { value: t, text: t }));
    });
    if (existingPayment) paymentTypeSelect.value = existingPayment.paymentType;
    else if (editing.sponsorType === "individual") paymentTypeSelect.value = "Credit Card";
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Payment Type" }),
      paymentTypeSelect
    ]));

    // Defaults to this sponsor's own Donation (falling back to the flat
    // per-type fee only if Donation is somehow unset — backfillSponsorDonations()
    // means that's not expected in practice), not a hardcoded "$100 if
    // Individual, otherwise blank" like before Donation existed.
    var defaultAmount = existingPayment ? existingPayment.amount
      : (editing.donation != null && editing.donation !== "" ? editing.donation
        : (editing.sponsorType === "individual" ? "100" : ""));
    var paymentAmountField = moneyInput({ value: defaultAmount });
    var paymentAmountInput = paymentAmountField.input;
    var amountRow = el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Amount" }),
      paymentAmountField.wrap
    ]);
    body.appendChild(amountRow);

    var defaultDate = existingPayment ? dateInputValue(existingPayment.date) : new Date().toISOString().split("T")[0];
    var paymentDateInput = el("input", { type: "date", value: defaultDate });
    var dateRow = el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Date Received" }),
      paymentDateInput
    ]);
    body.appendChild(dateRow);

    var checkNumInput = el("input", { type: "text", placeholder: "Check #", value: existingPayment ? (existingPayment.checkNum || "") : "" });
    var checkNumRow = el("div", { class: "form-row", style: "display:" + (paymentTypeSelect.value === "Check" ? "" : "none") }, [
      el("span", { class: "form-label", text: "Check #" }),
      checkNumInput
    ]);
    function syncPaymentRows() {
      var unpaid = paymentTypeSelect.value === "Unpaid";
      checkNumRow.style.display = paymentTypeSelect.value === "Check" ? "" : "none";
      amountRow.style.display = unpaid ? "none" : "";
      dateRow.style.display = unpaid ? "none" : "";
    }
    paymentTypeSelect.addEventListener("change", syncPaymentRows);
    syncPaymentRows();
    body.appendChild(checkNumRow);

    // Individual Sponsorships default to a $100 Credit Card payment — re-apply
    // whenever Sponsor Type changes (not just on initial render), so picking
    // "Individual" while adding a new sponsor also defaults these fields.
    typeSel.addEventListener("change", function () {
      if (typeSel.value === "individual") {
        paymentTypeSelect.value = "Credit Card";
        paymentAmountInput.value = "100";
        syncPaymentRows();
      }
      if (!donationTouched) {
        var typeCfg = CONFIG.SPONSOR_TYPES.filter(function (t) { return t.key === typeSel.value; })[0];
        donationInput.value = typeCfg ? String(typeCfg.fee) : "";
      }
    });

    // Appended to the pinned actions bar below (not the body), so "Sponsor
    // Name is required." appears right beside the Save button that raised it.
    var errorMsg = el("div", { class: "form-error" });

    var autoSaveSponsor = debounce(function () {
      var record = buildSponsorRecord(editing, fieldEls, typeSel, getShirtSizeValues(), donationInput);
      if (record) { upsertSponsor(record); renderSponsorsBody(); }
    }, 1500);
    var fieldsToWatch = [fieldEls.name, fieldEls.contactPerson, fieldEls.phone, fieldEls.email, fieldEls.address, fieldEls.website, fieldEls.etccMemberName, fieldEls.individualSponsorshipText, typeSel, donationInput];
    fieldsToWatch.forEach(function (field) {
      field.addEventListener("input", autoSaveSponsor);
      field.addEventListener("change", autoSaveSponsor);
    });

    var saveBtn = el("button", { class: "btn primary" }, ["Save"]);
    saveBtn.addEventListener("click", function () {
      var record = buildSponsorRecord(editing, fieldEls, typeSel, getShirtSizeValues(), donationInput);
      if (!record) { errorMsg.textContent = "Sponsor Name is required."; return; }
      upsertSponsor(record);

      var paymentAmount = paymentAmountInput.value.trim();
      if (paymentTypeSelect.value === "Unpaid") {
        recordPayment({
          id: "pay" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          sponsorId: editing.id,
          sponsorName: record.name,
          paymentType: "Unpaid",
          checkNum: "",
          date: new Date().toISOString().split("T")[0],
          amount: 0,
          recordedAt: new Date().toISOString()
        });
      } else if (paymentAmount) {
        var payment = {
          id: "pay" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          sponsorId: editing.id,
          sponsorName: record.name,
          paymentType: paymentTypeSelect.value,
          checkNum: paymentTypeSelect.value === "Check" ? checkNumInput.value.trim() : "",
          date: paymentDateInput.value,
          amount: Number(paymentAmount),
          recordedAt: new Date().toISOString()
        };
        recordPayment(payment);
      }

      closeSponsorForm();
      renderSponsorsBody();
    });
    var cancelBtn = el("button", { class: "btn" }, ["Cancel"]);
    cancelBtn.addEventListener("click", closeSponsorForm);
    var actions = [saveBtn, cancelBtn];
    if (editing.id) {
      var delBtn = el("button", { class: "btn", style: "color:var(--warn)" }, ["Delete"]);
      delBtn.addEventListener("click", function () {
        removeSponsor(editing.id);
        closeSponsorForm();
        renderSponsorsBody();
      });
      actions.push(delBtn);
    }
    // Pinned with the header, same as the registration detail modal (see
    // renderDetailModal()) — the payment section makes this form long enough
    // that Save/Cancel/Delete used to be off-screen until you scrolled down.
    var actionsBar = el("div", { class: "modal-actions" }, [el("div", { class: "settings-actions" }, actions), errorMsg]);
    var pinned = el("div", { class: "modal-sticky" }, [head, actionsBar]);

    var modal = el("div", { class: "modal" }, [pinned, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeSponsorForm);
    host.appendChild(backdrop);
  }

  // ---------- sponsor payment recording modal ----------
  // Opened from the Sponsors table's "Mark Paid…" button — scoped to one
  // already-known sponsor (no sponsor picker), just the fields an officer
  // actually needs at that moment: Payment Type, Check # (Check only), and
  // Amount. Date is always "now" — this modal only exists for logging a
  // payment as it's collected, not backdating one.
  function openPaymentModal(sponsor) {
    state.sponsorPaymentSponsorId = sponsor.id;
    state.sponsorPaymentError = null;
    state.sponsorPaymentOpen = true;
    renderPaymentModal();
  }
  function closePaymentModal() {
    state.sponsorPaymentOpen = false;
    state.sponsorPaymentSponsorId = null;
    renderPaymentModal();
  }

  function renderPaymentModal() {
    var host = $("#paymentHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.sponsorPaymentOpen) return;
    var sponsor = state.sponsors.filter(function (s) { return s.id === state.sponsorPaymentSponsorId; })[0];
    if (!sponsor) { closePaymentModal(); return; }

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closePaymentModal);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: "Record Payment — " + sponsor.name }),
      el("span", { class: "spacer" }), closeBtn
    ]);

    var body = el("div", { class: "modal-body" });
    function row(label, input, required) {
      body.appendChild(el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: label + (required ? " *" : "") }),
        input
      ]));
    }

    var typeSel = el("select", {});
    ["Cash", "Check", "Credit Card"].forEach(function (t) {
      typeSel.appendChild(el("option", { value: t, text: t }));
    });
    typeSel.value = sponsor.sponsorType === "individual" ? "Credit Card" : "Cash";
    row("Payment Type", typeSel, true);

    var checkNumInput = el("input", { type: "text", placeholder: "Check #" });
    var checkNumRow = el("div", { class: "form-row", style: "display:" + (typeSel.value === "Check" ? "" : "none") }, [
      el("span", { class: "form-label", text: "Check #" }),
      checkNumInput
    ]);
    typeSel.addEventListener("change", function () {
      checkNumRow.style.display = typeSel.value === "Check" ? "" : "none";
    });
    body.appendChild(checkNumRow);

    // Defaults to this sponsor's own Donation (what's actually pledged/owed —
    // may have been overridden from the Sponsor Type's flat default when it
    // was set), not a generic per-type fee.
    var typeCfg = CONFIG.SPONSOR_TYPES.filter(function (t) { return t.key === sponsor.sponsorType; })[0];
    var defaultAmount = sponsor.donation != null && sponsor.donation !== "" ? sponsor.donation : (typeCfg ? typeCfg.fee : "");
    var amountField = moneyInput({ value: String(defaultAmount) });
    var amountInput = amountField.input;
    row("Payment Amount", amountField.wrap, true);

    // Lives in the pinned actions bar below, beside Record Payment.
    var errorMsg = el("div", { class: "form-error" });

    var recordBtn = el("button", { class: "btn primary" }, ["Record Payment"]);
    recordBtn.addEventListener("click", function () {
      var paymentType = typeSel.value.trim();
      var checkNum = checkNumInput.value.trim();
      var amount = amountInput.value.trim();

      if (!paymentType || !amount) {
        errorMsg.textContent = "Please fill in all required fields.";
        return;
      }
      if (paymentType === "Check" && !checkNum) {
        errorMsg.textContent = "Check number is required for check payments.";
        return;
      }

      // date is the full current timestamp (not just a bare YYYY-MM-DD) —
      // this modal only ever logs a payment as it's collected right now, so
      // the date shown should reflect the actual time it was recorded, not
      // just today's date at midnight.
      recordPayment({
        id: "pay" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
        paymentType: paymentType,
        checkNum: paymentType === "Check" ? checkNum : "",
        date: new Date().toISOString(),
        amount: Number(amount),
        recordedAt: new Date().toISOString()
      });
      closePaymentModal();
    });
    var cancelBtn = el("button", { class: "btn" }, ["Cancel"]);
    cancelBtn.addEventListener("click", closePaymentModal);
    // Pinned with the header — same pattern as renderDetailModal() /
    // renderSponsorFormModal(), so every form in the app keeps its buttons in
    // the same place.
    var actionsBar = el("div", { class: "modal-actions" }, [el("div", { class: "settings-actions" }, [recordBtn, cancelBtn]), errorMsg]);
    var pinned = el("div", { class: "modal-sticky" }, [head, actionsBar]);

    var modal = el("div", { class: "modal" }, [pinned, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closePaymentModal);
    host.appendChild(backdrop);
  }

  // Same fallback sponsorFieldText() uses for the "Reg Date" column: sponsors
  // synced from a CSV registration have a real regDate string; sponsors added
  // via the external member-sponsor-form.php (or the in-app Add flow) only ever get
  // submittedAt, so fall back to that (formatted to match) rather than
  // silently skipping the backfill for them.
  function sponsorRegDateForPayment(sponsor) {
    if (sponsor.regDate) return String(sponsor.regDate);
    if (sponsor.submittedAt) return fmtDate(sponsor.submittedAt);
    return "";
  }

  // Fills in a missing Donation (SPONSOR_COLS' "donation") for any sponsor
  // saved before that field existed — CSV-auto-synced sponsors and older
  // submissions/manual adds alike — with that Sponsor Type's default fee
  // (CONFIG.SPONSOR_TYPES' own `fee`: Premier $250, Corporate/Individual
  // $100), the same default the Add/Edit Sponsor modal and the public
  // sponsor forms use. Idempotent — only ever touches a sponsor whose
  // donation is null/undefined/"", never overwrites one that's already set
  // (including a deliberate $0), so this is safe to call unconditionally on
  // every load/save, same pattern as backfillPaymentDefaults() below.
  function backfillSponsorDonations() {
    var changed = [];
    state.sponsors.forEach(function (s) {
      if (s.donation === undefined || s.donation === null || s.donation === "") {
        var typeCfg = CONFIG.SPONSOR_TYPES.filter(function (t) { return t.key === s.sponsorType; })[0];
        s.donation = typeCfg ? typeCfg.fee : 0;
        changed.push(s);
      }
    });
    changed.forEach(function (s) { pushSponsorToServer("upsert", { sponsor: s }); });
  }

  function backfillPaymentDefaults() {
    var newPayments = [];

    // Fill missing amounts in existing payments
    state.payments.forEach(function (payment) {
      if (payment.amount === null || payment.amount === undefined || payment.amount === "") {
        var sponsor = state.sponsors.find(function (s) { return s.id === payment.sponsorId; });
        if (sponsor && sponsor.sponsorType === "individual") {
          payment.amount = 100;
        }
      }
    });

    // Create default payment records for individual sponsors without any payments
    state.sponsors.forEach(function (sponsor) {
      if (sponsor.sponsorType === "individual") {
        var hasPayment = state.payments.some(function (p) { return p.sponsorId === sponsor.id; });
        var regDate = sponsorRegDateForPayment(sponsor);
        if (!hasPayment && regDate) {
          var defaultPayment = {
            id: "pay" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            sponsorId: sponsor.id,
            sponsorName: sponsor.name,
            paymentType: "Credit Card",
            checkNum: "",
            date: regDate,
            amount: 100,
            recordedAt: new Date().toISOString()
          };
          state.payments.push(defaultPayment);
          newPayments.push(defaultPayment);
        }
      }
    });

    // Persist backfilled payments to server
    if (newPayments.length && SITE_CONFIG.sponsorPaymentsApiUrl) {
      newPayments.forEach(function (payment) {
        fetch(SITE_CONFIG.sponsorPaymentsApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", payment: payment })
        }).catch(function () {
          // Silently fail — backfilled data is already in memory
        });
      });
    }
  }

  function backfillIndividualSponsorPayments() {
    var newPayments = [];
    var count = 0;
    state.sponsors.forEach(function (sponsor) {
      if (sponsor.sponsorType === "individual") {
        var hasPayment = state.payments.some(function (p) { return p.sponsorId === sponsor.id; });
        var regDate = sponsorRegDateForPayment(sponsor);
        if (!hasPayment && regDate) {
          var defaultPayment = {
            id: "pay" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
            sponsorId: sponsor.id,
            sponsorName: sponsor.name,
            paymentType: "Credit Card",
            checkNum: "",
            date: regDate,
            amount: 100,
            recordedAt: new Date().toISOString()
          };
          state.payments.push(defaultPayment);
          newPayments.push(defaultPayment);
          count++;
        }
      }
    });

    if (newPayments.length && SITE_CONFIG.sponsorPaymentsApiUrl) {
      newPayments.forEach(function (payment) {
        fetch(SITE_CONFIG.sponsorPaymentsApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add", payment: payment })
        }).catch(function () {
          // Silently fail — backfilled data is already in memory
        });
      });
    }

    renderSponsorsBody();
    return "Backfilled " + count + " individual sponsor payment records.";
  }

  function recordPayment(payment) {
    state.payments.push(payment);
    renderViews();
    if (!SITE_CONFIG.sponsorPaymentsApiUrl) return;
    fetch(SITE_CONFIG.sponsorPaymentsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", payment: payment })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.sponsorPaymentError = null;
    }).catch(function () {
      state.sponsorPaymentError = "Could not record payment — check your connection and try again.";
      renderPaymentModal();
    });
  }

  // ---------- "+ Add Registration" form modal (Registration tab) ----------
  // Add-only — there's no dedicated "edit a walk-in" form here. A mistake
  // made while filling this out is corrected afterward via the detail
  // modal's Edit mode (see renderDetailModal/EDITABLE_FIELDS) or, for a
  // wrong Reg Type/regretted entry entirely, the Registration tab's
  // checkbox/bulk-delete + re-adding.
  function openAddRegistration() { state.addRegOpen = true; renderAddRegistrationModal(); }
  function closeAddRegistration() { state.addRegOpen = false; renderAddRegistrationModal(); }

  function renderAddRegistrationModal() {
    var host = $("#addRegHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.addRegOpen) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeAddRegistration);
    var head = el("div", { class: "modal-head" }, [el("h3", { text: "Add Registration" }), el("span", { class: "spacer" }), closeBtn]);

    var body = el("div", { class: "modal-body" });
    function row(label, input, required) {
      var div = el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: label + (required ? " *" : "") }),
        input
      ]);
      body.appendChild(div);
      return div;
    }

    var regTypeSel = el("select", {});
    [CONFIG.REG_TYPE.WALKIN_MEMBER, CONFIG.REG_TYPE.WALKIN_NONMEMBER].forEach(function (v) {
      regTypeSel.appendChild(el("option", { value: v, text: v }));
    });
    row("Reg Type", regTypeSel);

    // Walk-In Member only: type a name and pick a match from the imported
    // roster (state.members, from Setup > Import Members) to auto-fill
    // the whole form — Last/First Name, Reg #, and whichever contact
    // fields that roster entry has — same "Last, First" datalist pattern
    // member-sponsor-form.php's "ETCC Member Name" field uses. Manual entry still
    // works if the person isn't in the roster, or the last import didn't
    // include a given field (left untouched in that case).
    var lookupList = el("datalist", { id: "addRegMemberList" });
    state.members.forEach(function (m) { lookupList.appendChild(el("option", { value: m.name })); });
    var lookupInput = el("input", { type: "text", list: "addRegMemberList", autocomplete: "off", placeholder: "Start typing a last name…" });
    var lookupRow = el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Look Up Member" }), lookupInput]);
    body.appendChild(lookupRow);
    body.appendChild(lookupList);

    var lastNameInput = el("input", { type: "text" });
    row("Last Name", lastNameInput, true);
    var firstNameInput = el("input", { type: "text" });
    row("First Name", firstNameInput, true);

    lookupInput.addEventListener("input", function () {
      var q = lookupInput.value.trim().toLowerCase();
      var match = state.members.filter(function (m) { return m.name.toLowerCase() === q; })[0];
      if (!match) return;
      lastNameInput.value = match.lastName || "";
      firstNameInput.value = match.firstName || "";
      if (match.memberNumber) regNumberInput.value = match.memberNumber;
      clubNameInput.value = "ETCC"; // every roster entry is, by definition, an ETCC member
      if (match.phone) phoneInput.value = match.phone;
      if (match.email) emailInput.value = match.email;
      if (match.address) addressInput.value = match.address;
      if (match.city) cityInput.value = match.city;
      if (match.state) stateInput.value = match.state;
      if (match.zip) zipInput.value = match.zip;
      if (match.year) yearInput.value = match.year;
      if (match.model) modelInput.value = match.model;
      if (match.color) colorInput.value = match.color;
    });

    // Walk-In Member: officer types (or looks up above) the person's real
    // member number. Walk-In Nonmember: auto-assigned from a numbering pool
    // deliberately separate from the CSV import's own nonmember numbers (see
    // nextAvailableWalkinNumber()) and locked, so two walk-ins added back to
    // back never collide.
    var regNumberInput = el("input", { type: "text" });
    row("Reg #", regNumberInput, true);
    function syncRegNumberField() {
      lookupRow.style.display = regTypeSel.value === CONFIG.REG_TYPE.WALKIN_MEMBER ? "" : "none";
      if (regTypeSel.value === CONFIG.REG_TYPE.WALKIN_NONMEMBER) {
        regNumberInput.value = String(nextAvailableWalkinNumber());
        regNumberInput.setAttribute("disabled", "disabled");
      } else {
        regNumberInput.value = "";
        regNumberInput.removeAttribute("disabled");
      }
    }
    regTypeSel.addEventListener("change", syncRegNumberField);
    syncRegNumberField();

    // In Car Show? lives right after Reg # since it gates both the fee
    // default below and whether the Vehicle fields (Year/Model/Color) show
    // at all — a walk-in who isn't entering the car show has no vehicle to
    // record.
    var inCarShowSel = el("select", {});
    ["No", "Yes"].forEach(function (v) { inCarShowSel.appendChild(el("option", { value: v, text: v })); });
    inCarShowSel.addEventListener("change", function () {
      feeInput.value = String(inCarShowSel.value === "Yes" ? state.appSettings.walkInCarShowFee : state.appSettings.walkInNonCarShowFee);
      syncVehicleFieldsVisibility();
    });
    row("In Car Show?", inCarShowSel, true);

    var clubNameInput = el("input", { type: "text" });
    row("Club Name", clubNameInput);
    var phoneInput = el("input", { type: "text" });
    row("Phone", phoneInput, true);
    var emailInput = el("input", { type: "text" });
    row("Email", emailInput, true);
    var addressInput = el("input", { type: "text" });
    row("Address", addressInput);
    var cityInput = el("input", { type: "text" });
    row("City", cityInput);
    var stateInput = el("input", { type: "text" });
    row("State", stateInput);
    var zipInput = el("input", { type: "text" });
    row("Zip", zipInput);
    var yearInput = el("input", { type: "text" });
    var yearRow = row("Corvette Year", yearInput);
    var modelInput = el("input", { type: "text" });
    var modelRow = row("Model", modelInput);
    var colorInput = el("input", { type: "text" });
    var colorRow = row("Color", colorInput);
    function syncVehicleFieldsVisibility() {
      var show = inCarShowSel.value === "Yes";
      yearRow.style.display = show ? "" : "none";
      modelRow.style.display = show ? "" : "none";
      colorRow.style.display = show ? "" : "none";
    }
    syncVehicleFieldsVisibility();

    // Total Fee Collected is filled in from Developer > Settings' matching fee
    // whenever In Car Show? changes (still freely editable after that, e.g.
    // for a partial payment or a manually negotiated amount).
    var feeField = moneyInput({ type: "text" });
    var feeInput = feeField.input;
    feeInput.value = String(state.appSettings.walkInNonCarShowFee); // matches inCarShowSel's default ("No")

    row("Total Fee", feeField.wrap);

    // Same Payment Type (Cash/Check/Credit Card) + conditional Check # pattern
    // as Order T-Shirt and the Sponsors tab's payment forms. "Unpaid" is the
    // same escape hatch used by the Sponsors payment forms (see
    // renderSponsorForm()) — it isn't a real payment method, it just means
    // no payment has been collected yet; Status is derived from it below
    // instead of showing its own separate field.
    var paymentTypeSel = el("select", {});
    ["Unpaid", "Cash", "Check", "Credit Card"].forEach(function (t) { paymentTypeSel.appendChild(el("option", { value: t, text: t })); });
    paymentTypeSel.addEventListener("change", function () {
      checkNumRow.style.display = paymentTypeSel.value === "Check" ? "" : "none";
    });
    row("Payment Type", paymentTypeSel);

    var checkNumInput = el("input", { type: "text" });
    var checkNumRow = el("div", { class: "form-row", style: "display:none" }, [
      el("span", { class: "form-label", text: "Check #" }), checkNumInput
    ]);
    body.appendChild(checkNumRow);

    if (state.walkinSyncError) {
      body.appendChild(el("div", { class: "messages", style: "margin-bottom:10px" }, [state.walkinSyncError]));
    }
    // Lives in the pinned actions bar below, beside Save — the required-field
    // messages ("Last Name is required." etc.) show where the officer clicked.
    var errorMsg = el("div", { class: "form-error" });

    // Switching Reg Type mid-fill-out usually means the officer picked the
    // wrong one and is starting over — clear every other field rather than
    // leave stale values from the previous type sitting under the new one.
    // syncRegNumberField (registered first, above) already handles Reg #
    // specially, so it's left out here.
    function clearOtherFields() {
      lookupInput.value = "";
      lastNameInput.value = "";
      firstNameInput.value = "";
      clubNameInput.value = "";
      phoneInput.value = "";
      emailInput.value = "";
      addressInput.value = "";
      cityInput.value = "";
      stateInput.value = "";
      zipInput.value = "";
      yearInput.value = "";
      modelInput.value = "";
      colorInput.value = "";
      inCarShowSel.value = "No";
      syncVehicleFieldsVisibility();
      feeInput.value = String(state.appSettings.walkInNonCarShowFee);
      paymentTypeSel.value = "Unpaid";
      checkNumInput.value = "";
      checkNumRow.style.display = "none";
      errorMsg.textContent = "";
    }
    regTypeSel.addEventListener("change", clearOtherFields);

    var saveBtn = el("button", { class: "btn primary" }, ["Save"]);
    saveBtn.addEventListener("click", function () {
      var lastName = lastNameInput.value.trim();
      if (!lastName) { errorMsg.textContent = "Last Name is required."; return; }
      if (!firstNameInput.value.trim()) { errorMsg.textContent = "First Name is required."; return; }
      if (!regNumberInput.value.trim()) { errorMsg.textContent = "Reg # is required."; return; }
      if (!phoneInput.value.trim()) { errorMsg.textContent = "Phone is required."; return; }
      if (!emailInput.value.trim()) { errorMsg.textContent = "Email is required."; return; }
      if (paymentTypeSel.value === "Check" && !checkNumInput.value.trim()) {
        errorMsg.textContent = "Check # is required for a Check payment.";
        return;
      }
      // A $0 Total Fee (e.g. a Walk-In not entering the car show) has nothing
      // to actually collect payment for — force Payment Type to Cash rather
      // than leaving it on Unpaid, so it doesn't show as still owing money.
      var effectivePaymentType = (LOGIC.toNum(feeInput.value.trim()) === 0) ? "Cash" : paymentTypeSel.value;
      var record = LOGIC.buildManualRegistration({
        id: "wk" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        regType: regTypeSel.value,
        lastName: lastName,
        firstName: firstNameInput.value.trim(),
        memberNumber: regNumberInput.value.trim(),
        nextAvailableMemberNumber: nextAvailableWalkinNumber(),
        clubName: clubNameInput.value.trim(),
        phone: phoneInput.value.trim(),
        email: emailInput.value.trim(),
        address: addressInput.value.trim(),
        city: cityInput.value.trim(),
        state: stateInput.value.trim(),
        zip: zipInput.value.trim(),
        year: yearInput.value.trim(),
        model: modelInput.value.trim(),
        color: colorInput.value.trim(),
        inCarShow: inCarShowSel.value,
        totalFee: feeInput.value.trim(),
        paymentType: effectivePaymentType,
        checkNum: checkNumInput.value.trim(),
        status: effectivePaymentType === "Unpaid" ? "Not Paid" : "Paid",
        regDate: fmtDate(new Date())
      }, CONFIG);
      upsertWalkin(record);
      closeAddRegistration();
      if (state.tab === "reg") renderRegBody();
    });
    var cancelBtn = el("button", { class: "btn" }, ["Cancel"]);
    cancelBtn.addEventListener("click", closeAddRegistration);
    // Pinned with the header — same pattern as the app's other forms (see
    // renderDetailModal()).
    var actionsBar = el("div", { class: "modal-actions" }, [el("div", { class: "settings-actions" }, [saveBtn, cancelBtn]), errorMsg]);
    var pinned = el("div", { class: "modal-sticky" }, [head, actionsBar]);

    var modal = el("div", { class: "modal wide" }, [pinned, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeAddRegistration);
    host.appendChild(backdrop);
  }

  // Fills one copy of the uploaded Car Show Window Card PDF template
  // (Developer > Settings) with a single registrant's Owner/CarNumber/Year/
  // Model/Generation AcroForm fields, then flattens it (bakes the field
  // values into the page content, removing the interactive form) so it
  // copies cleanly into the merged multi-card document below without any
  // field-name collisions between cards. A field missing from the template
  // (e.g. an officer uploads a template that dropped one) is silently
  // skipped rather than treated as an error — same tolerant-optional-field
  // philosophy as members-import.php's column detection.
  //
  // CarNumber is the row's judging-day Dash # (state.dashNumbers), not its
  // registration Reg # — this is the number judges use on the Tally Sheet to
  // record votes, and it's what makes the printed window card and the paper
  // tally sheet reference the same car. Callers (printWindowCards() below)
  // always run ensureDashNumbers() first, so this is normally already
  // assigned; a car printed with no Gen (so no dash-number bucket exists,
  // e.g. a missing Year) falls back to its Reg # rather than printing blank.
  //
  // Text is rendered bold and at a fixed larger size (not the template's own
  // default appearance) — setFontSize() per field plus a single
  // form.updateFieldAppearances(boldFont) call (regenerates every field's
  // appearance stream using that font) right before flatten().
  var WINDOW_CARD_FIELD_FONT_SIZE = 39.6; // 36 + 10%
  function fillOneWindowCard(templateBytes, r) {
    var PDFLib = window.PDFLib;
    return PDFLib.PDFDocument.load(templateBytes).then(function (doc) {
      return doc.embedFont(PDFLib.StandardFonts.HelveticaBold).then(function (boldFont) {
        var form = doc.getForm();
        var name = (r["First Name"] || "") + (r["Last Name"] ? " " + r["Last Name"] : "");
        var dashNumber = state.dashNumbers[rowKey(r)];
        var values = {
          Owner: name,
          CarNumber: String(dashNumber != null ? dashNumber : (r["Reg #"] || "")),
          Year: String(r["Year"] || ""),
          Model: String(r["Model"] || ""),
          Generation: String(r["Gen"] || "")
        };
        Object.keys(values).forEach(function (key) {
          try {
            var field = form.getTextField(key);
            field.setText(values[key]);
            field.setFontSize(WINDOW_CARD_FIELD_FONT_SIZE);
          } catch (e) { /* field not in this template */ }
        });
        try {
          form.updateFieldAppearances(boldFont);
          form.flatten();
        } catch (e) { /* leave fields unflattened rather than fail the whole print */ }
        return doc;
      });
    });
  }

  // One registrant's window card — the uploaded Car Show Window Card PDF
  // template (Developer > Settings), filled with that registrant's fields
  // via pdf-lib (vendored client-side; see fillOneWindowCard above). Each
  // filled card is embedded (not just copied) onto its own fresh 8.5x11in
  // landscape output page, scaled down and centered so it occupies at most
  // 75% of that page's width and 75% of its height (whichever is more
  // constraining, so the template's own aspect ratio is preserved rather
  // than stretched) — the template's native page size is a print-shop
  // design canvas much larger than a normal sheet, not meant to be printed
  // at 1:1. One output page per row in `list`, merged into a single
  // multi-page PDF and opened in a new tab (the browser's own PDF viewer
  // handles printing from there — more reliable across browsers than trying
  // to script window.print() against content this app doesn't control the
  // rendering of). Used both by the detail modal's single-row button
  // (printWindowCard, a 1-element wrapper below) and the Registration tab's
  // bulk "Print Window Cards" button (printSelectedWindowCards).
  function printWindowCards(list) {
    if (!list.length) return;
    // Every window card printed needs a Dash # on it (see fillOneWindowCard
    // above) — assign one to anything in this batch that doesn't have one
    // yet, before filling any PDFs. Cheap/no-op for rows already assigned.
    ensureDashNumbers(list);
    var pdfName = state.appSettings.windowCardPdf;
    if (!pdfName) {
      alert("No Car Show Window Card template uploaded yet — upload one in Developer > Settings first.");
      return;
    }
    var PDFLib = window.PDFLib;
    if (!PDFLib) {
      alert("PDF library failed to load — try reloading the page.");
      return;
    }
    var SHEET_W = 792; // 11in landscape US Letter, in PDF points (72/in)
    var SHEET_H = 612; // 8.5in
    fetch(pdfName + "?v=" + state.windowCardPdfVersion)
      .then(function (res) {
        if (!res.ok) throw new Error("Could not load the window card template.");
        return res.arrayBuffer();
      })
      .then(function (templateBytes) {
        return PDFLib.PDFDocument.create().then(function (outDoc) {
          var chain = Promise.resolve();
          list.forEach(function (r) {
            chain = chain
              .then(function () { return fillOneWindowCard(templateBytes, r); })
              .then(function (filledDoc) {
                return outDoc.embedPage(filledDoc.getPages()[0]).then(function (embedded) {
                  var scale = Math.min((SHEET_W * 0.75) / embedded.width, (SHEET_H * 0.75) / embedded.height);
                  var w = embedded.width * scale;
                  var h = embedded.height * scale;
                  var page = outDoc.addPage([SHEET_W, SHEET_H]);
                  page.drawPage(embedded, { x: (SHEET_W - w) / 2, y: (SHEET_H - h) / 2, width: w, height: h });
                });
              });
          });
          return chain.then(function () { return outDoc.save(); });
        });
      })
      .then(function (bytes) {
        var blob = new Blob([bytes], { type: "application/pdf" });
        window.open(URL.createObjectURL(blob), "_blank");
      })
      .catch(function (err) {
        alert("Could not generate the window card PDF: " + (err && err.message || err));
      });
  }
  function printWindowCard(r) { printWindowCards([r]); }

  // Registration tab's bulk "Print Window Cards" button — only the checked
  // rows whose In Car Show? is exactly "Yes" actually print; a selected row
  // with any other value is silently skipped (see the toolbar button's own
  // count, which already only counts qualifying rows, so nothing here comes
  // as a surprise at print time). Prints ONLY — it does not touch the Tally
  // Sheet; use the separate "📋 Print Tally Sheet" button (printTallySheetForShow
  // below) for that. printWindowCards() below still assigns a Dash # to any
  // printed row that doesn't already have one (every printed card needs a
  // number on it), but only for this batch, not the whole roster.
  function printSelectedWindowCards() {
    var byKey = {};
    allRegistrations().forEach(function (r) { byKey[rowKey(r)] = r; });
    var toPrint = selectedRegKeys()
      .map(function (key) { return byKey[key]; })
      .filter(function (r) { return r && String(r["In Car Show?"]).trim().toLowerCase() === "yes"; });
    if (!toPrint.length) return;
    printWindowCards(toPrint);
  }

  // Reports tab's standalone "📋 Print Tally Sheet" button — the only place
  // the Tally Sheet is generated from. Assigns Dash # numbers across the WHOLE
  // In-Car-Show roster (not just whatever's been printed so far) so the
  // printed sheet always lists every car currently showing, with a number
  // for each, then opens the browser's print preview. Doesn't print or
  // reprint any window cards.
  function printTallySheetForShow() {
    var allShow = carsInShow();
    if (!allShow.length) return;
    ensureDashNumbers(allShow);
    printTallySheet(allShow);
  }

  // A bare "YYYY-MM-DD" string (what <input type=date> — e.g. the payment
  // date field — produces) is a plain calendar day with no time-of-day
  // attached. new Date("2026-07-12") parses that as UTC midnight, so
  // displaying it with local getters (below) can shift it back to the
  // previous evening in any timezone behind UTC. Parse it as a local date
  // instead so it always shows as midnight on the day actually picked.
  function parseMaybeDateOnly(d) {
    if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      var parts = d.split("-");
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    return d instanceof Date ? d : new Date(d);
  }
  function fmtDate(d) {
    d = parseMaybeDateOnly(d);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    var h = d.getHours(), ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return p(d.getMonth() + 1) + "/" + p(d.getDate()) + "/" + d.getFullYear() + " " + p(h) + ":" + p(d.getMinutes()) + " " + ap;
  }

  // Converts any parseable date string/Date (e.g. a raw CSV "Reg Date" like
  // "7/8/2026 7:55:00 AM") into the "YYYY-MM-DD" shape <input type=date>
  // requires — falls back to today if the value can't be parsed.
  function dateInputValue(d) {
    var parsed = parseMaybeDateOnly(d);
    if (isNaN(parsed.getTime())) parsed = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return parsed.getFullYear() + "-" + p(parsed.getMonth() + 1) + "-" + p(parsed.getDate());
  }

  // ---------- header menu (hamburger) / settings ----------
  // Order: Logout, Developer (password-gated — reveals Settings / Run
  // Regression Tests / Change Log / API once unlocked).
  function buildHeaderMenu() {
    var header = $("header.app");
    if (!header) return;
    // SilentAuctionManager-style: 3-bar icon (animates into an X via the
    // .open class), sitting at the far left of the header, opening a
    // fixed off-canvas drawer from the left with a backdrop — see
    // .hamburger-btn/.hdr-nav-backdrop/.hdr-menu in styles.css.
    var hamburgerBtn = el("button", { id: "hamburgerBtn", class: "hamburger-btn", title: "Menu", "aria-label": "Menu", "aria-expanded": "false" }, [
      el("span", { class: "bar" }), el("span", { class: "bar" }), el("span", { class: "bar" })
    ]);
    hamburgerBtn.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(); });
    // Goes inside .hdr-left (before the logo), not header.firstChild — the
    // header is now a 3-column grid (see header.app in styles.css) and a 4th
    // top-level child here would break the centered title.
    var hdrLeft = header.querySelector(".hdr-left") || header;
    hdrLeft.insertBefore(hamburgerBtn, hdrLeft.firstChild);

    var backdrop = el("div", { id: "hdrNavBackdrop", class: "hdr-nav-backdrop" });
    backdrop.addEventListener("click", closeMenu);
    var menu = el("div", { id: "hdrMenu", class: "hdr-menu" });
    document.body.appendChild(backdrop);
    document.body.appendChild(menu);
    document.addEventListener("click", closeMenu);
    renderHeaderMenu();
  }
  function toggleMenu() { state.menuOpen = !state.menuOpen; renderHeaderMenu(); }
  function closeMenu() {
    if (!state.menuOpen) return;
    state.menuOpen = false;
    renderHeaderMenu();
  }
  // Checks against a SEPARATE Developer password (index.php's action=dev_login,
  // $DEV_PASSWORD_HASH in secrets.php) — a distinct credential from the main
  // site login, without ever exposing either hash to this script. This step
  // only hides the Settings / Regression Tests / Change Log / API menu items
  // until the Developer password is entered; each of those still does its own
  // server-side auth. (The import pages moved to the always-visible Setup tab
  // and are gated only by the MAIN login session — see members-import.php /
  // registrations-import.php / flyer-import.php.)
  function submitDeveloperPassword(password) {
    return fetch(location.pathname, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "action=dev_login&password=" + encodeURIComponent(password)
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.success) {
          state.developerUnlocked = true;
          state.developerLoginOpen = false;
          state.developerError = null;
          renderDeveloperLoginPage();
        } else {
          state.developerError = "Incorrect password.";
          renderDeveloperLoginPage();
        }
        renderHeaderMenu();
      })
      .catch(function () {
        state.developerError = "Could not verify — check your connection and try again.";
        renderDeveloperLoginPage();
      });
  }
  // ---------- Developer Login (full-page screen) ----------
  // Was previously a cramped inline password row inside the hamburger
  // dropdown, with no way to recover from a forgotten/wrong password short
  // of guessing again. Now its own full page (same buildPageBanner pattern
  // as Settings/Change Log/API) with a real "Forgot password?" link to the
  // same reset flow the main login screen already has (forgot-password.php
  // -> emails a time-limited reset link to the club's admin inbox — this
  // site has one shared password, so Developer and the main login gate are
  // literally the same credential; a reset there fixes both).
  function openDeveloperLogin() {
    state.developerLoginOpen = true;
    state.developerError = null;
    renderDeveloperLoginPage();
  }
  function closeDeveloperLogin() { state.developerLoginOpen = false; renderDeveloperLoginPage(); }

  // Same full-screen gradient-card look as _login.html's main site login gate
  // (see .dev-login-* in styles.css) — an in-app overlay, not the app's usual
  // modal or full-page-banner treatment, plus a close (✕) button since this
  // is reachable without leaving the app (the real login page has nothing to
  // "close" back to).
  function renderDeveloperLoginPage() {
    var host = $("#developerLoginHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.developerLoginOpen) return;

    var headerLogo = $("header.app img.hdr-logo");
    var logoImg = headerLogo ? el("img", { src: headerLogo.src, class: "dev-login-logo", alt: "ETCC Logo" }) : null;

    var closeBtn = el("button", { class: "dev-login-close", title: "Cancel" }, ["✕"]);
    closeBtn.addEventListener("click", closeDeveloperLogin);

    var pwInput = el("input", { type: "password", class: "dev-login-input", placeholder: "Enter Developer password" });
    var submit = function () {
      if (!pwInput.value) return;
      state.developerVerifying = true;
      renderDeveloperLoginPage();
      submitDeveloperPassword(pwInput.value).then(function () { state.developerVerifying = false; });
    };
    var goBtn = el("button", { class: "dev-login-btn" }, [state.developerVerifying ? "Checking…" : "Unlock"]);
    if (state.developerVerifying) goBtn.setAttribute("disabled", "disabled");
    goBtn.addEventListener("click", submit);
    pwInput.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });

    var kids = [closeBtn];
    if (logoImg) kids.push(logoImg);
    kids.push(el("h1", { class: "dev-login-title", text: "Developer Login" }));
    kids.push(el("p", { class: "dev-login-subtitle" },
      ["Unlocks Settings, Regression Tests, Change Log, and API — a separate " +
       "password from the main site login."]));
    kids.push(pwInput);
    if (state.developerError) kids.push(el("div", { class: "dev-login-error" }, [state.developerError]));
    kids.push(goBtn);
    kids.push(el("div", { class: "dev-login-hint" }, [
      el("a", { href: "dev-forgot-password.php", target: "_blank", rel: "noopener" }, ["Forgot Developer password?"])
    ]));

    var container = el("div", { class: "dev-login-container" }, kids);
    var screen = el("div", { class: "dev-login-screen" }, [container]);
    host.appendChild(screen);
    pwInput.focus();
  }

  function buildDeveloperMenuItems() {
    if (state.developerUnlocked) {
      // Import Members / Import Registrations moved to the Setup tab (a plain
      // officer tool, no Developer unlock needed) — see buildSetupView().
      var settings = el("button", { class: "hdr-menu-item" }, ["⚙ Settings"]);
      settings.addEventListener("click", function (e) { e.stopPropagation(); closeMenu(); openSettings(); });
      var regTests = el("button", { class: "hdr-menu-item" }, ["🧪 Run Regression Tests"]);
      regTests.addEventListener("click", function (e) { e.stopPropagation(); closeMenu(); openTestsPage(); });
      var changelog = el("button", { class: "hdr-menu-item" }, ["📋 Change Log"]);
      changelog.addEventListener("click", function (e) { e.stopPropagation(); closeMenu(); openChangelog(); });
      var apiItem = el("button", { class: "hdr-menu-item" }, ["🔌 API"]);
      apiItem.addEventListener("click", function (e) { e.stopPropagation(); closeMenu(); openApiPage(); });
      return [settings, regTests, changelog, apiItem];
    }
    var devBtn = el("button", { class: "hdr-menu-item" }, ["🛠 Developer"]);
    devBtn.addEventListener("click", function (e) { e.stopPropagation(); closeMenu(); openDeveloperLogin(); });
    return [devBtn];
  }
  function renderHeaderMenu() {
    var menu = $("#hdrMenu");
    if (!menu) return;
    var backdrop = $("#hdrNavBackdrop");
    var btn = $("#hamburgerBtn");
    menu.classList.toggle("open", state.menuOpen);
    if (backdrop) backdrop.classList.toggle("open", state.menuOpen);
    if (btn) {
      btn.classList.toggle("open", state.menuOpen);
      btn.setAttribute("aria-expanded", state.menuOpen ? "true" : "false");
    }
    menu.innerHTML = "";
    var logoutItem = el("a", { class: "hdr-menu-item", href: "logout.php" }, ["🚪 Logout"]);
    logoutItem.addEventListener("click", closeMenu);
    var items = [];
    // Only offered when a show is open - from the picker itself there is
    // nothing to change back to.
    if (state.currentShow) {
      var changeShowItem = el("a", { class: "hdr-menu-item", href: "#" }, ["🗓️ Change Car Show"]);
      changeShowItem.addEventListener("click", function (e) {
        e.preventDefault();
        closeMenu();
        closeShow();
      });
      items.push(changeShowItem);
    }
    items = items.concat([logoutItem], buildDeveloperMenuItems());
    items.forEach(function (it) { menu.appendChild(it); });
  }

  function openSettings() { state.settingsOpen = true; renderSettingsModal(); }
  function closeSettings() { state.settingsOpen = false; renderSettingsModal(); }

  // Optimistic local update, then push to the server — same pattern as
  // upsertSponsor/upsertWalkin. Every officer viewing the site picks up the
  // new value on their next page load.
  function saveAppSettings(patch) {
    Object.keys(patch).forEach(function (k) { state.appSettings[k] = patch[k]; });
    state.appSettingsSaving = true;
    state.appSettingsError = null;
    state.appSettingsSaved = false;
    // Deliberately no renderSettingsModal() here: this fires on every field's
    // blur, and a synchronous full re-render tears down and rebuilds every
    // input element on the page — which steals focus mid-Tab when a user
    // tabs quickly through several fields in the same card (e.g. New Sponsor
    // Confirmation Email's To/CC/BCC/Subject), so keystrokes typed into the
    // next field land on a DOM node the browser already forgot about and
    // never make it into state. Only re-render once the request actually
    // settles, when there's no in-progress keyboard interaction to disrupt.
    if (!SITE_CONFIG.appSettingsApiUrl) { state.appSettingsSaving = false; renderSettingsModal(); return; }
    fetch(SITE_CONFIG.appSettingsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", settings: patch })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.appSettingsSaving = false;
      state.appSettingsSaved = true;
      renderSettingsModal();
    }).catch(function () {
      state.appSettingsSaving = false;
      state.appSettingsError = "Could not save — check your connection and try again.";
      renderSettingsModal();
    });
  }

  // Setup tab > Import Schedule's own save — same app-settings.php endpoint
  // and patch shape as saveAppSettings() above, but a SEPARATE function
  // rather than reusing it: saveAppSettings deliberately skips re-rendering
  // until its request settles (see the comment on it) because it's wired to
  // per-field blur events that fire while someone might still be tabbing
  // through the Settings modal. This one is wired to a single explicit Save
  // button click instead, so re-rendering immediately (to show "Saving…")
  // and again on completion carries none of that focus-stealing risk.
  function saveImportScheduleSettings(patch) {
    Object.keys(patch).forEach(function (k) { state.appSettings[k] = patch[k]; });
    state.importScheduleSaving = true;
    state.importScheduleError = null;
    state.importScheduleSaved = false;
    renderViews();
    if (!SITE_CONFIG.appSettingsApiUrl) { state.importScheduleSaving = false; renderViews(); return; }
    fetch(SITE_CONFIG.appSettingsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", settings: patch })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.importScheduleSaving = false;
      state.importScheduleSaved = true;
      renderViews();
    }).catch(function () {
      state.importScheduleSaving = false;
      state.importScheduleError = "Could not save — check your connection and try again.";
      renderViews();
    });
  }

  // Setup tab > Import Schedule > "Import Now" — leaves a request flag
  // (import-schedule.php action=request) for the Windows scheduled task
  // (deploy/sync-registrations.js) on an officer's machine to pick up on its
  // next poll (every ~15 minutes).
  // This endpoint cannot itself drive a browser through ClubExpress, so
  // there's an inherent delay — the status text says so rather than implying
  // anything happens instantly.
  function requestImportNow() {
    if (!SITE_CONFIG.importScheduleApiUrl) return;
    stopImportRequestPolling();
    state.importRequestStatus = "Requesting…";
    renderViews();
    fetch(SITE_CONFIG.importScheduleApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok) {
          state.importRequestStatus = "Requested — the next scheduled check (within ~15 minutes) will run the import.";
          startImportRequestPolling(r.data.requestedAt);
        } else {
          state.importRequestStatus = "Could not request an import — please try again.";
        }
        renderViews();
      }).catch(function () {
        state.importRequestStatus = "Could not request an import — check your connection and try again.";
        renderViews();
      });
  }

  // Polls import-schedule.php's 'status' action every 30s until the
  // scheduled task marks this specific request handled (handledAt catches up
  // to the requestedAt this click produced — comparing timestamps, not just
  // "handledAt is set", so a stale handledAt from a PRIOR click can't be
  // mistaken for this one having run), then flips the status text from
  // "Requested…" to "Ran at <time>". Capped at 40 attempts (~20 minutes) so a
  // page left open indefinitely doesn't poll forever if something's stuck.
  function stopImportRequestPolling() {
    if (importRequestPollTimer) { clearInterval(importRequestPollTimer); importRequestPollTimer = null; }
  }
  function startImportRequestPolling(requestedAt) {
    var attempts = 0;
    importRequestPollTimer = setInterval(function () {
      attempts++;
      if (attempts > 40) { stopImportRequestPolling(); return; }
      fetch(SITE_CONFIG.importScheduleApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status" })
      }).then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.ok && data.handledAt && (!requestedAt || new Date(data.handledAt) >= new Date(requestedAt))) {
            var when = fmtDate(new Date(data.handledAt));
            state.importRequestStatus = data.lastStatus === "failed"
              ? "Failed at " + when + (data.lastError ? ": " + data.lastError : "") + " — see the History tab's log for details."
              : "Succeeded at " + when + ".";
            stopImportRequestPolling();
            renderViews();
          }
        }).catch(function () { /* transient network hiccup — keep polling, don't surface it */ });
    }, 30000);
  }

  // Re-pulls every bit of this show's server data and re-ingests it, without
  // a full page reload — called on every tab selection (see buildTabs()) so
  // a scheduled/manual import, or another officer's edit, that landed after
  // this page opened shows up right away on whichever tab you're looking at.
  // refresh.php returns exactly what carshow_boot_data() (lib.php) assembles
  // — the same thing index.php's own boot script ingests at page load — so
  // this must re-ingest in that SAME order (see that function's own comment
  // for why: sponsors/deletedSponsors and deletedRegistrations/overrides
  // each have to land before ingestRows, which triggers the CSV-driven
  // auto-sync/regenerate logic that reads them). Silent on failure — the
  // page just keeps showing whatever it already had rather than surfacing an
  // error for a background refresh nobody explicitly asked to retry.
  function refreshShowData() {
    if (!state.currentShow || !SITE_CONFIG.refreshApiUrl) return;
    fetch(SITE_CONFIG.refreshApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (!r.ok || !r.data || !r.data.ok) return;
        var d = r.data;
        API.ingestSponsors(d.sponsors);
        API.ingestDeletedSponsors(d.deletedSponsorIds);
        API.ingestPayments(d.payments);
        API.ingestWalkins(d.walkins);
        API.ingestTshirtPurchases(d.tshirtPurchases);
        API.ingestDashNumbers(d.dashNumbers);
        API.ingestMembers(d.members);
        API.ingestAppSettings(d.appSettings);
        API.ingestDeletedRegistrations(d.deletedRegistrations);
        API.ingestRegistrationOverrides(d.registrationOverrides);
        API.ingestImportHistory(d.importHistory);
        if (d.hasRegistrations) {
          var regRows = Papa.parse(d.regCsv, { header: true, skipEmptyLines: true }).data;
          var actRows = d.actCsv ? Papa.parse(d.actCsv, { header: true, skipEmptyLines: true }).data : [];
          API.ingestRows(regRows, actRows, new Date(d.generatedAt));
        }
        renderViews();
      }).catch(function () { /* keep showing whatever's already loaded */ });
  }

  // History tab — row checkboxes + Delete Selected/Delete All, same UX as
  // the Registration/Sponsors tabs' bulk-delete. Entries have no id field
  // (see import-history.php), so selection/deletion key off `timestamp` —
  // second-precision, unique in practice since two imports never actually
  // complete in the same second.
  function selectedHistoryTimestamps() { return Object.keys(state.historySelected); }
  function toggleHistorySelected(ts, checked) {
    if (checked) state.historySelected[ts] = true; else delete state.historySelected[ts];
  }
  function openDeleteHistoryConfirm(mode) {
    if (mode === "selected" && !selectedHistoryTimestamps().length) return;
    state.deleteHistoryConfirm = mode;
    renderDeleteHistoryConfirm();
  }
  function closeDeleteHistoryConfirm() { state.deleteHistoryConfirm = null; renderDeleteHistoryConfirm(); }
  function performDeleteHistory() {
    var mode = state.deleteHistoryConfirm;
    closeDeleteHistoryConfirm();
    if (!SITE_CONFIG.importHistoryApiUrl) return;
    var body = mode === "all" ? { action: "delete", all: true } : { action: "delete", timestamps: selectedHistoryTimestamps() };
    fetch(SITE_CONFIG.importHistoryApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok && Array.isArray(r.data.history)) {
          state.importHistory = r.data.history;
          state.historySelected = {};
        }
        renderViews();
      }).catch(function () { renderViews(); });
  }
  function renderDeleteHistoryConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.deleteHistoryConfirm) return;

    var all = state.deleteHistoryConfirm === "all";
    var count = all ? state.importHistory.length : selectedHistoryTimestamps().length;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeDeleteHistoryConfirm);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: "Delete " + (all ? "all " + count : count) + " Import Histor" + (count === 1 ? "y" : "ies") + " entr" + (count === 1 ? "y" : "ies") + "?" }),
      el("span", { class: "spacer" }), closeBtn
    ]);

    var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" }, ["Yes, Delete"]);
    yesBtn.addEventListener("click", performDeleteHistory);
    var noBtn = el("button", { class: "btn" }, ["Cancel"]);
    noBtn.addEventListener("click", closeDeleteHistoryConfirm);

    var body = el("div", { class: "modal-body" }, [
      el("p", {}, ["This permanently removes " + (all ? "the entire Import History log" : count + " selected entr" + (count === 1 ? "y" : "ies")) +
        " from the server. It does not affect the actual registration data those imports loaded — only this log. This cannot be undone."]),
      el("div", { class: "settings-actions" }, [yesBtn, noBtn])
    ]);

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeDeleteHistoryConfirm);
    host.appendChild(backdrop);
  }

  // Setup tab > Import Schedule > persisted "Last run" status — fetched on
  // Setup tab select (see buildTabs()) and again by startImportRequestPolling
  // whenever an Import Now click's own polling resolves, so both the
  // one-click status text and this always-visible line update together.
  function loadRunStatus() {
    if (!SITE_CONFIG.importScheduleApiUrl) return;
    fetch(SITE_CONFIG.importScheduleApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run_status" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok) {
          state.runStatus = r.data.runStatus || null;
          state.lastPollAt = r.data.lastPollAt || null;
          if (state.tab === "setup") renderViews();
        }
      }).catch(function () { /* keep showing whatever's already loaded */ });
  }

  // Setup tab > Backups > "Backup Now" (backup.php action=run) — zips the
  // live data server-side and appends one entry to backup-history.json.
  // Unlike requestImportNow() above, this isn't a request for something
  // else to pick up later — the server does the whole thing synchronously
  // and this resolves with the real outcome, so there's no polling.
  function requestBackupNow() {
    if (!SITE_CONFIG.backupApiUrl || state.backupRunning) return;
    state.backupRunning = true;
    state.backupRunStatus = "Running…";
    renderViews();
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.backupRunning = false;
        if (r.ok && r.data && r.data.ok && r.data.entry) {
          var e = r.data.entry;
          var kb = Math.max(1, Math.round((e.sizeBytes || 0) / 1024));
          state.backupRunStatus = "Succeeded — " + (e.fileCount || 0) + " files, " + kb + " KB.";
          if (state.backupsList !== null) state.backupsList.push(e);
        } else {
          state.backupRunStatus = "Failed" + (r.data && r.data.error ? ": " + r.data.error : " — please try again.");
        }
        renderViews();
      }).catch(function () {
        state.backupRunning = false;
        state.backupRunStatus = "Failed — check your connection and try again.";
        renderViews();
      });
  }

  // Setup tab > Backups > auto-backup schedule — loads/saves backup.php's
  // get_schedule/save_schedule actions. Same shape as
  // saveImportScheduleSettings() below but its own small JSON (not part of
  // per-show app-settings.json), since backups aren't scoped to one show.
  function loadBackupSchedule() {
    if (!SITE_CONFIG.backupApiUrl) return;
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_schedule" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok && r.data.schedule) {
          state.backupSchedule = r.data.schedule;
          if (state.tab === "setup") renderViews();
        }
      }).catch(function () { /* keep showing whatever's already loaded */ });
  }
  function saveBackupSchedule(settings) {
    if (!SITE_CONFIG.backupApiUrl) return;
    state.backupScheduleSaving = true;
    state.backupScheduleError = null;
    state.backupScheduleSaved = false;
    renderViews();
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: "save_schedule" }, settings))
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.backupScheduleSaving = false;
        if (r.ok && r.data && r.data.ok && r.data.schedule) {
          state.backupSchedule = r.data.schedule;
          state.backupScheduleSaved = true;
        } else {
          state.backupScheduleError = "Could not save.";
        }
        renderViews();
      }).catch(function () {
        state.backupScheduleSaving = false;
        state.backupScheduleError = "Could not save — check your connection.";
        renderViews();
      });
  }

  // Setup tab > Backups > "View Logs" (backup.php action=list) — same
  // toggle/load pattern as toggleLogsPanel()/loadLogsList() below, against
  // the permanent backup-history.json log instead of the purged sync logs.
  function toggleBackupsPanel() {
    state.backupsPanelOpen = !state.backupsPanelOpen;
    if (state.backupsPanelOpen && state.backupsList === null) {
      loadBackupsList();
      return; // loadBackupsList() already re-renders
    }
    renderViews();
  }
  function loadBackupsList() {
    if (!SITE_CONFIG.backupApiUrl) return;
    state.backupsLoading = true;
    state.backupsError = null;
    renderViews();
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.backupsLoading = false;
        if (r.ok && r.data && r.data.ok) {
          state.backupsList = r.data.history || [];
        } else {
          state.backupsError = "Could not load the backup log.";
        }
        renderViews();
      }).catch(function () {
        state.backupsLoading = false;
        state.backupsError = "Could not load the backup log — check your connection.";
        renderViews();
      });
  }

  // Setup tab > Backups > per-row "🗑" delete — removes one backup-history.json
  // entry and its zip file (if any). Same confirm-modal shape as
  // openDeleteHistoryConfirm()/closeDeleteHistoryConfirm()/performDeleteHistory()
  // above, but keyed to a single timestamp rather than a selected/all mode —
  // there's no bulk-select UI for this log. backup.php's 'delete' action
  // refuses to remove the very last backup file on the server (see its own
  // comment); that error surfaces here rather than silently no-op'ing.
  function openDeleteBackupConfirm(timestamp) {
    state.deleteBackupConfirm = timestamp;
    state.deleteBackupError = null;
    renderDeleteBackupConfirm();
  }
  function closeDeleteBackupConfirm() {
    state.deleteBackupConfirm = null;
    state.deleteBackupError = null;
    renderDeleteBackupConfirm();
  }
  function performDeleteBackup() {
    var timestamp = state.deleteBackupConfirm;
    if (!timestamp || !SITE_CONFIG.backupApiUrl) return;
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", timestamp: timestamp })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok && Array.isArray(r.data.history)) {
          state.backupsList = r.data.history;
          state.deleteBackupConfirm = null;
          state.deleteBackupError = null;
          renderDeleteBackupConfirm();
          renderViews();
        } else {
          state.deleteBackupError = (r.data && r.data.error) || "Could not delete — please try again.";
          renderDeleteBackupConfirm();
        }
      }).catch(function () {
        state.deleteBackupError = "Could not delete — check your connection.";
        renderDeleteBackupConfirm();
      });
  }
  function renderDeleteBackupConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.deleteBackupConfirm) return;

    var entry = (state.backupsList || []).filter(function (r) { return r.timestamp === state.deleteBackupConfirm; })[0];
    var label = entry && entry.fileName ? entry.fileName : (entry && entry.timestamp ? fmtDate(new Date(entry.timestamp)) : "this backup");

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeDeleteBackupConfirm);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: "Delete this backup?" }),
      el("span", { class: "spacer" }), closeBtn
    ]);

    var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" }, ["Yes, Delete"]);
    yesBtn.addEventListener("click", performDeleteBackup);
    var noBtn = el("button", { class: "btn" }, ["Cancel"]);
    noBtn.addEventListener("click", closeDeleteBackupConfirm);

    var bodyKids = [
      el("p", {}, ["This permanently deletes " + label + " and its log entry from the server. This cannot be undone."]),
      el("div", { class: "settings-actions" }, [yesBtn, noBtn])
    ];
    if (state.deleteBackupError) bodyKids.push(el("div", { class: "form-error" }, [state.deleteBackupError]));
    var body = el("div", { class: "modal-body" }, bodyKids);

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeDeleteBackupConfirm);
    host.appendChild(backdrop);
  }

  // Setup tab > Backups > per-row "↺ Restore" — modeled on
  // SilentAuctionManager's restoreBackupEntry() (via the sibling Vette Fest
  // app's own port of it), adapted to this app's own modal convention (a
  // Developer-password confirm, same shape as shows.php's own show-delete
  // gate). Opening the modal loads this SPECIFIC backup's contents
  // (get_backup_years) fresh every time, since which shows it contains is a
  // property of the file, not something worth caching in app state.
  function openRestoreConfirm(timestamp) {
    state.restoreConfirm = timestamp;
    state.restoreYears = null;
    state.restoreYearsError = null;
    state.restoreScope = "";
    state.restoreError = null;
    loadRestoreYears(timestamp); // sets restoreYearsLoading and renders itself
  }
  function closeRestoreConfirm() {
    state.restoreConfirm = null;
    state.restoreYears = null;
    state.restoreYearsError = null;
    state.restoreScope = "";
    state.restoreError = null;
    renderRestoreConfirm();
  }
  function loadRestoreYears(timestamp) {
    if (!SITE_CONFIG.backupApiUrl) return;
    state.restoreYearsLoading = true;
    renderRestoreConfirm();
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_backup_years", timestamp: timestamp })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.restoreYearsLoading = false;
        // The modal may have been closed (or reopened on a different row)
        // while this was in flight — ignore a stale response.
        if (state.restoreConfirm !== timestamp) return;
        if (r.ok && r.data && r.data.ok) {
          state.restoreYears = r.data.years || [];
        } else {
          state.restoreYearsError = (r.data && r.data.error) || "Could not read this backup's contents.";
        }
        renderRestoreConfirm();
      }).catch(function () {
        state.restoreYearsLoading = false;
        if (state.restoreConfirm !== timestamp) return;
        state.restoreYearsError = "Could not read this backup's contents — check your connection.";
        renderRestoreConfirm();
      });
  }
  // Restoring can rewrite registrations, overrides, settings, the roster,
  // and even which shows exist at all — far more than any single fetch's
  // normal "update this one piece of state" pattern can safely patch in
  // place. Same choice SAM's own restoreBackupEntry() makes
  // (location.reload()): on success, reload the whole page so every tab
  // reflects the restored data, rather than trying to enumerate everything
  // that might now be stale.
  function performRestore(devPassword) {
    var timestamp = state.restoreConfirm;
    if (!timestamp || !SITE_CONFIG.backupApiUrl) return;
    state.restoreRunning = true;
    state.restoreError = null;
    renderRestoreConfirm();
    fetch(SITE_CONFIG.backupApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", timestamp: timestamp, year: state.restoreScope, devPassword: devPassword })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok) {
          window.location.reload();
          return;
        }
        state.restoreRunning = false;
        state.restoreError = (r.data && r.data.error) || "Restore failed — please try again.";
        renderRestoreConfirm();
      }).catch(function () {
        state.restoreRunning = false;
        state.restoreError = "Restore failed — check your connection and try again.";
        renderRestoreConfirm();
      });
  }
  function renderRestoreConfirm() {
    var host = $("#confirmHost");
    if (!host) return;
    host.innerHTML = "";
    var timestamp = state.restoreConfirm;
    if (!timestamp) return;

    var entry = (state.backupsList || []).filter(function (r) { return r.timestamp === timestamp; })[0];
    var fileLabel = entry && entry.fileName ? entry.fileName : "this backup";

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeRestoreConfirm);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: "Restore from " + fileLabel + "?" }),
      el("span", { class: "spacer" }), closeBtn
    ]);

    var bodyKids = [];

    if (state.restoreYearsLoading) {
      bodyKids.push(el("p", {}, ["Loading this backup's contents…"]));
    } else if (state.restoreYearsError) {
      bodyKids.push(el("div", { class: "form-error" }, [state.restoreYearsError]));
    } else {
      var years = state.restoreYears || [];
      var scopeSel = el("select", {});
      scopeSel.appendChild(el("option", { value: "", text: "Everything (every show, plus global settings)" }));
      years.forEach(function (y) {
        scopeSel.appendChild(el("option", {
          value: y.year,
          text: (y.name || y.year) + " (" + y.year + ") — " + y.fileCount + " file" + (y.fileCount === 1 ? "" : "s")
        }));
      });
      scopeSel.value = state.restoreScope;
      scopeSel.addEventListener("change", function () { state.restoreScope = scopeSel.value; renderRestoreConfirm(); });

      var scopeIsAll = state.restoreScope === "";
      var scopeWarning = scopeIsAll
        ? "This REPLACES EVERYTHING — every show's registrations, sponsors, payments, overrides, settings, and " +
          "the member roster, plus the site/Developer password-reset state — with what was in that backup. Any " +
          "show created since, or any global file this backup doesn't have, is deleted, not just overwritten."
        : "This REPLACES ONLY the \"" + (years.filter(function (y) { return y.year === state.restoreScope; })[0] || {}).name +
          "\" show's data with what was in that backup — every other show, and global settings (including the " +
          "member roster), are left untouched.";

      bodyKids.push(el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Restore" }), scopeSel
      ]));
      bodyKids.push(el("p", { style: "color:var(--warn)" }, [scopeWarning]));
      bodyKids.push(el("p", {}, [
        "A safety backup of the CURRENT data is taken automatically right before restoring, so this can itself " +
        "be undone by restoring that safety backup afterward. This cannot be undone directly."
      ]));

      var pw = el("input", { type: "password", placeholder: "Developer password", autocomplete: "off" });
      var yesBtn = el("button", { class: "btn primary", style: "background:var(--warn);border-color:var(--red-dark)" }, ["Yes, Restore"]);
      if (state.restoreRunning) yesBtn.setAttribute("disabled", "disabled");
      yesBtn.addEventListener("click", function () { performRestore(pw.value); });
      pw.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); performRestore(pw.value); }
      });
      var noBtn = el("button", { class: "btn" }, ["Cancel"]);
      noBtn.addEventListener("click", closeRestoreConfirm);

      bodyKids.push(el("p", {}, ["Enter the Developer password to confirm:"]));
      bodyKids.push(pw);
      bodyKids.push(el("div", { class: "settings-actions" }, [yesBtn, noBtn]));
      if (state.restoreRunning) bodyKids.push(el("div", { class: "hint" }, ["Restoring… this may take a moment."]));
    }
    if (state.restoreError) bodyKids.push(el("div", { class: "form-error" }, [state.restoreError]));

    var body = el("div", { class: "modal-body" }, bodyKids);
    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeRestoreConfirm);
    host.appendChild(backdrop);
  }

  // Setup tab > Setup > "Import Members" > "View Log" — same toggle/load
  // pattern as toggleLogsPanel()/loadLogsList() below, against
  // member-import-history.php instead of the sync-run logs. Lets the Setup
  // tab show this log without navigating to members-import.php's own
  // standalone page (which shows the same log inline as a fallback).
  function toggleMemberImportLogPanel() {
    state.memberImportLogPanelOpen = !state.memberImportLogPanelOpen;
    if (state.memberImportLogPanelOpen && state.memberImportLogList === null) {
      loadMemberImportLog();
      return; // loadMemberImportLog() already re-renders
    }
    renderViews();
  }
  function loadMemberImportLog() {
    if (!SITE_CONFIG.memberImportHistoryApiUrl) return;
    state.memberImportLogLoading = true;
    state.memberImportLogError = null;
    renderViews();
    fetch(SITE_CONFIG.memberImportHistoryApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.memberImportLogLoading = false;
        if (r.ok && r.data && r.data.ok) {
          state.memberImportLogList = r.data.history || [];
        } else {
          state.memberImportLogError = "Could not load the import log.";
        }
        renderViews();
      }).catch(function () {
        state.memberImportLogLoading = false;
        state.memberImportLogError = "Could not load the import log — check your connection.";
        renderViews();
      });
  }

  // Setup tab > Import Schedule > "View Logs" — server-archived log files
  // (logs.php action=list/get), so the directory is browsable from any
  // machine logged into the site, not just the one that ran the import.
  function toggleLogsPanel() {
    state.logsPanelOpen = !state.logsPanelOpen;
    if (state.logsPanelOpen && state.logsList === null) {
      loadLogsList();
      return; // loadLogsList() already re-renders
    }
    renderViews();
  }
  function loadLogsList() {
    if (!SITE_CONFIG.logsApiUrl) return;
    state.logsLoading = true;
    state.logsError = null;
    renderViews();
    fetch(SITE_CONFIG.logsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.logsLoading = false;
        if (r.ok && r.data && r.data.ok) {
          state.logsList = r.data.files || [];
        } else {
          state.logsError = "Could not load the log list.";
        }
        renderViews();
      }).catch(function () {
        state.logsLoading = false;
        state.logsError = "Could not load the log list — check your connection.";
        renderViews();
      });
  }

  // Multipart upload (not JSON like every other settings save, since it's a
  // real file) for the Car Show Window Card fillable PDF template — see
  // window-card-pdf.php, which saves it to disk and updates
  // app-settings.json's windowCardPdf key server-side. Same session-cookie
  // auth as every other same-origin write in this app (no password field
  // needed — carshow_authed() checks the session first).
  function uploadWindowCardPdf(file) {
    if (!SITE_CONFIG.windowCardPdfApiUrl) return;
    state.windowCardUploading = true;
    state.windowCardError = null;
    renderSettingsModal();
    var body = new FormData();
    body.append("pdf", file);
    fetch(SITE_CONFIG.windowCardPdfApiUrl, { method: "POST", body: body })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.windowCardUploading = false;
        if (r.ok && r.data && r.data.ok) {
          state.appSettings.windowCardPdf = r.data.windowCardPdf;
          state.windowCardPdfVersion++;
        } else {
          state.windowCardError = (r.data && r.data.error) || "Upload failed.";
        }
        renderSettingsModal();
      })
      .catch(function () {
        state.windowCardUploading = false;
        state.windowCardError = "Could not upload — check your connection and try again.";
        renderSettingsModal();
      });
  }

  // Runs the same fixture-based assertions as test/run-tests.js, entirely in
  // this tab (src/regression-tests.js + embedded fixture CSVs, both baked
  // into the build) — it never touches whatever CSVs the user currently has
  // loaded, since it works on its own copy of reg/act rows.
  function runRegressionTests() {
    if (!window.CarShowRegressionTests || !window.CarShowFixtures) {
      state.testResults = { results: [{ label: "Regression test module not available in this build", ok: false, expected: "available", actual: "missing" }], passed: 0, failed: 1 };
      renderTestsPage();
      return;
    }
    state.testRunning = true;
    renderTestsPage();
    var F = window.CarShowFixtures;
    var reg = Papa.parse(F.regCsv, { header: true, skipEmptyLines: true }).data;
    var act = Papa.parse(F.actCsv, { header: true, skipEmptyLines: true }).data;
    var built = window.CarShowRegressionTests.assertionList(reg, act);
    return window.CarShowRegressionTests.excelAssertionList(built.out, ExcelJS).then(function (excelResults) {
      var all = built.results.concat(excelResults);
      var passed = all.filter(function (r) { return r.ok; }).length;
      state.testResults = { results: all, passed: passed, failed: all.length - passed };
      state.testRunning = false;
      renderTestsPage();
    }).catch(function (err) {
      state.testResults = { results: built.results.concat([{ label: "Excel round-trip threw", ok: false, expected: "no throw", actual: String(err && err.message || err) }]), passed: 0, failed: 1 };
      state.testRunning = false;
      renderTestsPage();
    });
  }

  // ---------- Regression Tests (full-page screen) ----------
  // Selecting "Run Regression Tests" from the Developer menu opens this page
  // and immediately kicks off a run (rather than opening Settings and making
  // the officer press a separate button) — see PROJECT_STATUS.md.
  function openTestsPage() {
    state.testsPageOpen = true;
    runRegressionTests();
  }
  function closeTestsPage() { state.testsPageOpen = false; renderTestsPage(); }

  function renderTestsPage() {
    var host = $("#testsHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.testsPageOpen) return;

    var head = buildPageBanner(closeTestsPage, "Regression Tests");

    var runBtn = el("button", { class: "btn primary" }, [state.testRunning ? "Running…" : "Run Again"]);
    if (state.testRunning) runBtn.setAttribute("disabled", "disabled");
    runBtn.addEventListener("click", runRegressionTests);

    var onlyErrCb = el("input", { type: "checkbox" });
    onlyErrCb.checked = state.testOnlyErrors;
    onlyErrCb.addEventListener("change", function () { state.testOnlyErrors = onlyErrCb.checked; renderTestsPage(); });
    var onlyErrLabel = el("label", {}, [onlyErrCb, document.createTextNode(" Only show errors")]);

    var body = el("div", { class: "api-page-inner" });
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:4px" }, ["Runs this app's fixture-based test suite in this tab. It uses its own sample data and never touches whatever CSVs you currently have loaded."]));
    body.appendChild(el("div", { class: "settings-actions" }, [runBtn, onlyErrLabel]));

    if (state.testResults) {
      var r = state.testResults;
      var summaryCls = r.failed === 0 ? "good" : "warn";
      body.appendChild(el("div", { class: "test-summary " + summaryCls }, [r.passed + " passed, " + r.failed + " failed"]));
      var shown = state.testOnlyErrors ? r.results.filter(function (t) { return !t.ok; }) : r.results;
      if (!shown.length) {
        body.appendChild(el("div", { class: "hint" }, [state.testOnlyErrors ? "No errors — all checks passed." : "No results."]));
      } else {
        body.appendChild(el("ul", { class: "test-list" }, shown.map(function (t) {
          var kids = [(t.ok ? "✓ " : "✗ ") + t.label];
          if (!t.ok) kids.push(el("div", { class: "expect" }, ["expected " + JSON.stringify(t.expected) + " — got " + JSON.stringify(t.actual)]));
          return el("li", { class: t.ok ? "pass" : "fail" }, kids);
        })));
      }
    }

    var bodyWrap = el("div", { class: "api-page-body" }, [body]);
    var page = el("div", { class: "api-page" }, [head, bodyWrap]);
    host.appendChild(page);
  }

  function renderSettingsModal() {
    var host = $("#settingsHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.settingsOpen) return;

    var head = buildPageBanner(closeSettings, "Settings");

    var body = el("div", { class: "api-page-inner" });

    // ---- Walk-In Registration Settings ----
    body.appendChild(el("h4", { text: "Walk-In Registration Settings" }));
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:4px" },
      ["The starting number auto-assigned to a Walk-In Nonmember on the Registration tab's " +
       "“+ Add Registration” form. Separate from the CSV import's own nonmember numbering."]));
    var firstNonMemberInput = el("input", { type: "text", value: String(state.appSettings.walkinFirstNonMember) });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "First NonMember Number" }), firstNonMemberInput
    ]));

    // ---- Car Show Window Card ----
    body.appendChild(el("h4", { text: "Car Show Window Card" }));
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:4px" },
      ["Fillable PDF template for printed window cards (Registration tab's detail modal → " +
       "🪟 Print Window Card). Each registrant's Name, Reg #, Year, Model, and Generation are " +
       "filled into the template's Owner/CarNumber/Year/Model/Generation form fields."]));
    if (state.appSettings.windowCardPdf) {
      var windowCardLink = el("a", {
        href: state.appSettings.windowCardPdf + "?v=" + state.windowCardPdfVersion,
        target: "_blank", rel: "noopener", text: "View current template (" + state.appSettings.windowCardPdf + ")"
      });
      body.appendChild(el("div", { style: "margin:6px 0" }, [windowCardLink]));
    } else {
      body.appendChild(el("div", { class: "hint" }, ["No template uploaded yet."]));
    }
    var windowCardFileInput = el("input", { type: "file", accept: "application/pdf" });
    if (state.windowCardUploading) windowCardFileInput.setAttribute("disabled", "disabled");
    windowCardFileInput.addEventListener("change", function () {
      var f = windowCardFileInput.files && windowCardFileInput.files[0];
      if (!f) return;
      uploadWindowCardPdf(f);
    });
    body.appendChild(el("div", { class: "form-row" }, [windowCardFileInput, state.windowCardUploading ? el("span", { class: "count" }, ["Uploading…"]) : null].filter(Boolean)));
    if (state.windowCardError) body.appendChild(el("div", { class: "form-error" }, [state.windowCardError]));

    // ---- Registration Fees ----
    body.appendChild(el("h4", { text: "Registration Fees" }));
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:4px" },
      ["The Add Registration form's Total Fee Collected auto-fills from Car Show or Non Car Show " +
       "based on the In Car Show? field (still editable there). Preregistration is a reference figure " +
       "only — CSV-preregistered attendees' fees come from ClubExpress, not this setting."]));
    var carShowFeeField = moneyInput({ type: "text", value: String(state.appSettings.walkInCarShowFee) });
    var carShowFeeInput = carShowFeeField.input;
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Walk-In Car Show Registration" }), carShowFeeField.wrap]));
    var nonCarShowFeeField = moneyInput({ type: "text", value: String(state.appSettings.walkInNonCarShowFee) });
    var nonCarShowFeeInput = nonCarShowFeeField.input;
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Walk-In Non Car Show Registration" }), nonCarShowFeeField.wrap]));
    var preregFeeField = moneyInput({ type: "text", value: String(state.appSettings.preregistrationFee) });
    var preregFeeInput = preregFeeField.input;
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Preregistration" }), preregFeeField.wrap]));

    // ---- T-Shirt Vendor ----
    body.appendChild(el("h4", { text: "T-Shirt Vendor" }));
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:4px" },
      ["Reference contact only — not used to send anything automatically anywhere in the app."]));
    var tshirtVendorEmailInput = el("input", { type: "text", value: state.appSettings.tshirtVendorEmail || "" });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Vendor Email" }), tshirtVendorEmailInput]));
    body.appendChild(el("div", { class: "hint", style: "margin:6px 0 4px" },
      ["Reference figure for officers selling shirts at the event — not applied anywhere automatically."]));
    var tshirtPurchaseCostField = moneyInput({ type: "text", value: String(state.appSettings.tshirtEventPurchaseCost) });
    var tshirtPurchaseCostInput = tshirtPurchaseCostField.input;
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Cost to Purchase at Event" }), tshirtPurchaseCostField.wrap]));

    // ---- New Sponsor Confirmation Email ----
    body.appendChild(el("h4", { text: "New Sponsor Confirmation Email" }));
    body.appendChild(el("div", { class: "hint", style: "margin-bottom:4px" },
      ["Sent whenever a sponsorship is submitted through the public sponsor sign-up form " +
       "(member-sponsor-form.php). Leave To blank to default it to the Member Email entered on " +
       "the form itself; sending is only skipped if both are blank. To/CC/BCC each accept " +
       "multiple comma-separated addresses."]));
    var sponsorEmailToInput = el("input", { type: "text", value: state.appSettings.sponsorEmailTo || "" });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "To" }), sponsorEmailToInput]));
    var sponsorEmailCcInput = el("input", { type: "text", value: state.appSettings.sponsorEmailCc || "" });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "CC" }), sponsorEmailCcInput]));
    var sponsorEmailBccInput = el("input", { type: "text", value: state.appSettings.sponsorEmailBcc || "" });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "BCC" }), sponsorEmailBccInput]));
    var sponsorEmailSubjectInput = el("input", { type: "text", value: state.appSettings.sponsorEmailSubject || "" });
    body.appendChild(el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Subject" }), sponsorEmailSubjectInput]));

    // Auto-save: every field above saves itself (no Save button) as soon as
    // it loses focus, validating and building the same full patch each time
    // so unrelated fields stay in sync with whatever's currently on screen.
    function autoSaveSettings() {
      var fields = [
        ["walkinFirstNonMember", firstNonMemberInput, "First NonMember Number"],
        ["walkInCarShowFee", carShowFeeInput, "Walk-In Car Show Registration"],
        ["walkInNonCarShowFee", nonCarShowFeeInput, "Walk-In Non Car Show Registration"],
        ["preregistrationFee", preregFeeInput, "Preregistration"],
        ["tshirtEventPurchaseCost", tshirtPurchaseCostInput, "Cost to Purchase at Event"]
      ];
      var patch = {};
      for (var i = 0; i < fields.length; i++) {
        var key = fields[i][0], n = parseInt(fields[i][1].value, 10);
        var min = key === "walkinFirstNonMember" ? 1 : 0;
        if (isNaN(n) || n < min) {
          state.appSettingsError = fields[i][2] + " must be a whole number" + (min ? " greater than 0." : " (0 or more).");
          renderSettingsModal();
          return;
        }
        patch[key] = n;
      }
      var vendorEmail = tshirtVendorEmailInput.value.trim();
      if (vendorEmail && vendorEmail.indexOf("@") === -1) {
        state.appSettingsError = "Vendor Email doesn't look like a valid email address.";
        renderSettingsModal();
        return;
      }
      patch.tshirtVendorEmail = vendorEmail;

      var sponsorEmailFields = [
        ["sponsorEmailTo", sponsorEmailToInput, "To"],
        ["sponsorEmailCc", sponsorEmailCcInput, "CC"],
        ["sponsorEmailBcc", sponsorEmailBccInput, "BCC"]
      ];
      for (var j = 0; j < sponsorEmailFields.length; j++) {
        var addrVal = sponsorEmailFields[j][1].value.trim();
        if (addrVal && addrVal.split(/[,;]+/).some(function (a) { return a.trim() && a.trim().indexOf("@") === -1; })) {
          state.appSettingsError = "New Sponsor Confirmation Email " + sponsorEmailFields[j][2] + " doesn't look like a valid email address.";
          renderSettingsModal();
          return;
        }
        patch[sponsorEmailFields[j][0]] = addrVal;
      }
      patch.sponsorEmailSubject = sponsorEmailSubjectInput.value.trim() || "New Sponsor Submission";
      saveAppSettings(patch);
    }
    [
      firstNonMemberInput, carShowFeeInput, nonCarShowFeeInput, preregFeeInput,
      tshirtVendorEmailInput, tshirtPurchaseCostInput,
      sponsorEmailToInput, sponsorEmailCcInput, sponsorEmailBccInput, sponsorEmailSubjectInput
    ].forEach(function (input) { input.addEventListener("blur", autoSaveSettings); });

    var settingsStatus = [];
    if (state.appSettingsSaving) settingsStatus.push(el("span", { class: "count" }, ["Saving…"]));
    else if (state.appSettingsSaved) settingsStatus.push(el("span", { class: "count", style: "color:var(--good)" }, ["Saved."]));
    if (settingsStatus.length) body.appendChild(el("div", { class: "settings-actions" }, settingsStatus));
    if (state.appSettingsError) {
      body.appendChild(el("div", { class: "form-error" }, [state.appSettingsError]));
    }

    var bodyWrap = el("div", { class: "api-page-body" }, [body]);
    var page = el("div", { class: "api-page" }, [head, bodyWrap]);
    host.appendChild(page);
  }

  // Change Log (Developer submenu) — modeled on
  // SilentAuctionManager's Change Log screen: pulls commit history straight
  // from the public GitHub repo's REST API (no server endpoint of our own
  // needed) and shows the same repo-stats + commit-table shape. Re-fetched
  // fresh every time the modal opens, same as SAM.
  var CHANGELOG_OWNER = "ETCCRepo";
  var CHANGELOG_REPO = "ETCCCarShow";
  var CHANGELOG_FTP = "ftp.etccapps.com → /apps/carshow/";
  // Basenames ftp-deploy.sh actually uploads (see that file) — used to count
  // "Files Deployed" out of the repo's full file tree.
  var CHANGELOG_DEPLOYED_FILES = [
    "ETCCCarShow.html", "_login.html", "index.php", "lib.php", "member-sponsor-form.php",
    "sponsor-submissions.php", "registrations-upload.php", "members-import.php",
    "registrations-import.php", "flyer-import.php", "forgot-password.php", "reset-password.php",
    "logout.php", "ETCClogoWhiteBackground.png", ".htaccess"
  ];
  var CHANGELOG_TEXT_EXTS = ["html", "js", "css", "md", "php", "json", "txt", "sh", "htaccess"];

  function openChangelog() {
    state.changelogOpen = true;
    renderChangelogPage();
    loadChangelogData();
  }
  function closeChangelog() { state.changelogOpen = false; renderChangelogPage(); }

  // Exact total commit count via GitHub's pagination Link header: request one
  // commit per page, then read the rel="last" page number (= total commits).
  function fetchTotalCommitCount(base) {
    return fetch(base + "/commits?per_page=1").then(function (res) {
      if (!res.ok) return null;
      var link = res.headers.get("Link");
      if (link) {
        var m = link.match(/[?&]page=(\d+)>;\s*rel="last"/);
        if (m) return parseInt(m[1], 10);
      }
      return res.json().then(function (arr) { return Array.isArray(arr) ? arr.length : 0; });
    }).catch(function () { return null; });
  }

  function loadChangelogData() {
    state.changelogLoading = true;
    state.changelogError = null;
    renderChangelogPage();
    var base = "https://api.github.com/repos/" + CHANGELOG_OWNER + "/" + CHANGELOG_REPO;
    var commits, fileCount = "—", deployedCount = "—";

    Promise.all([
      fetch(base + "/commits?per_page=100"),
      fetch(base + "/git/trees/HEAD?recursive=1")
    ]).then(function (results) {
      var commitsRes = results[0], treeRes = results[1];
      if (!commitsRes.ok) throw new Error("GitHub API error: " + commitsRes.status);
      return commitsRes.json().then(function (c) {
        commits = c;
        if (!treeRes.ok) return [];
        return treeRes.json().then(function (tree) {
          var blobs = (tree.tree || []).filter(function (n) { return n.type === "blob"; });
          fileCount = blobs.length;
          deployedCount = blobs.filter(function (n) {
            var name = n.path.split("/").pop();
            return CHANGELOG_DEPLOYED_FILES.indexOf(name) !== -1;
          }).length;
          return blobs.filter(function (n) {
            var ext = n.path.split(".").pop().toLowerCase();
            return CHANGELOG_TEXT_EXTS.indexOf(ext) !== -1;
          });
        });
      });
    }).then(function (textBlobs) {
      return Promise.all(textBlobs.map(function (n) {
        return fetch(base + "/git/blobs/" + n.sha, { headers: { Accept: "application/vnd.github.raw+json" } })
          .then(function (r) { return r.ok ? r.text() : ""; })
          .catch(function () { return ""; });
      }));
    }).then(function (blobTexts) {
      var loc = blobTexts.reduce(function (sum, txt) {
        return sum + (txt.match(/\n/g) || []).length + (txt ? 1 : 0);
      }, 0);
      return fetchTotalCommitCount(base).then(function (totalCommits) {
        state.changelogMeta = {
          repo: CHANGELOG_OWNER + "/" + CHANGELOG_REPO,
          ftp: CHANGELOG_FTP,
          files: String(fileCount),
          filesDeployed: String(deployedCount),
          loc: loc.toLocaleString(),
          totalChanges: (totalCommits != null) ? String(totalCommits) : (commits.length + (commits.length === 100 ? "+" : ""))
        };
        state.changelogCommits = commits.map(function (c) {
          var d = new Date(c.commit.author.date);
          var lines = c.commit.message.split("\n");
          var subject = lines[0];
          var verMatch = subject.match(/\(v[\d.]+\)/);
          var version = verMatch ? verMatch[0].replace(/[()]/g, "") : "";
          var body = lines.slice(1).filter(function (l) {
            return !/^\s*(Co-Authored-By|Signed-off-by):/i.test(l);
          }).join("\n").trim();
          return { sha: c.sha.substring(0, 7), date: d, subject: subject, body: body, version: version, fullSha: c.sha };
        });
        state.changelogLoading = false;
        renderChangelogPage();
      });
    }).catch(function (err) {
      state.changelogLoading = false;
      state.changelogError = "Failed to load change log: " + (err && err.message || err);
      renderChangelogPage();
    });
  }

  function fmtChangelogDate(d) {
    var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    var h = d.getHours(), ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " · " + p(h) + ":" + p(d.getMinutes()) + " " + ap;
  }

  // Full page, not a centered modal — matches SilentAuctionManager, where
  // Change Log is its own nav "screen" rather than a dialog.
  function renderChangelogPage() {
    var host = $("#changelogHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.changelogOpen) return;

    var head = buildPageBanner(closeChangelog);

    var body = el("div", { class: "changelog-page-inner" }, []);

    if (state.changelogMeta) {
      var m = state.changelogMeta;
      var statDefs = [
        ["Repository", m.repo], ["FTP Deployment Path", m.ftp], ["Files in Repo", m.files],
        ["Files Deployed", m.filesDeployed], ["Lines of Code", m.loc], ["Total Changes", m.totalChanges]
      ];
      body.appendChild(el("div", { class: "changelog-card" }, [
        el("div", { class: "changelog-meta" }, statDefs.map(function (s) {
          return el("div", {}, [
            el("div", { class: "k" }, [s[0]]),
            el("div", { class: "v" }, [s[1]])
          ]);
        }))
      ]));
    }

    if (state.changelogLoading) {
      body.appendChild(el("div", { class: "hint" }, ["Loading commits…"]));
    } else if (state.changelogError) {
      body.appendChild(el("div", { class: "form-error" }, [state.changelogError]));
    } else if (state.changelogCommits) {
      var table = el("table", { class: "grid" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, ["Date"]), el("th", {}, ["Version"]), el("th", {}, ["Message"]), el("th", {}, ["SHA"])
        ])]),
        el("tbody", {}, state.changelogCommits.map(function (c) {
          var msgKids = [el("div", { style: "font-weight:600" }, [c.subject])];
          if (c.body) msgKids.push(el("div", { class: "changelog-body" }, [c.body]));
          var link = el("a", { href: "https://github.com/" + CHANGELOG_OWNER + "/" + CHANGELOG_REPO + "/commit/" + c.fullSha, target: "_blank", rel: "noopener", class: "changelog-sha" }, [c.sha]);
          return el("tr", {}, [
            el("td", {}, [fmtChangelogDate(c.date)]),
            el("td", {}, c.version ? [el("span", { class: "changelog-ver" }, [c.version])] : []),
            el("td", { style: "white-space:normal" }, msgKids),
            el("td", {}, [link])
          ]);
        }))
      ]);
      body.appendChild(el("div", { class: "changelog-card flush" }, [
        el("div", { class: "changelog-table-wrap" }, [table])
      ]));
    }

    var bodyWrap = el("div", { class: "changelog-page-body" }, [body]);
    var page = el("div", { class: "changelog-page" }, [head, bodyWrap]);
    host.appendChild(page);
  }

  // Developer > API — a full page (same reasoning as Change Log above) for
  // testing/handing out the URL another website uses to read this event's
  // paid registrations. There's no server-side compute for this endpoint to
  // trigger (see syncPaidRegistrationsCache()) — this page just shows the
  // already-live URL/key and lets an officer fire the exact same request an
  // external caller would make.
  function openApiPage() { state.apiPageOpen = true; state.apiTestResult = null; renderApiPage(); }
  function closeApiPage() { state.apiPageOpen = false; renderApiPage(); }

  // The absolute URL another website calls — built from this page's own
  // location so it's correct on any host this app is deployed to, not
  // hardcoded to etccapps.com.
  function apiUrl(key) {
    return location.href.slice(0, location.href.lastIndexOf("/") + 1) +
      "paid-registrations-api.php?key=" + encodeURIComponent(key || "");
  }

  // Fires the literal request an external caller would make — credentials
  // "omit" so this browser's own login session cookie is never sent, same as
  // a cross-origin server would experience (the endpoint only ever checks
  // the API key, never the session, but this keeps the test honest).
  function testApiUrl() {
    state.apiTesting = true;
    state.apiTestResult = null;
    renderApiPage();
    fetch(apiUrl(state.appSettings.externalApiKey), { credentials: "omit" }).then(function (res) {
      return res.text().then(function (text) {
        var pretty = text;
        try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { /* show raw text as-is */ }
        state.apiTestResult = { status: res.status, ok: res.ok, bodyText: pretty };
        state.apiTesting = false;
        renderApiPage();
      });
    }).catch(function (err) {
      state.apiTestResult = { status: 0, ok: false, bodyText: "Request failed: " + (err && err.message || err) };
      state.apiTesting = false;
      renderApiPage();
    });
  }

  // Rotating generates a brand-new key server-side (see app-settings.php's
  // rotate_api_key action) and immediately invalidates the old one — any
  // website still using the old URL starts getting 401s right away.
  function rotateApiKey() {
    if (!SITE_CONFIG.appSettingsApiUrl) return;
    state.apiRotating = true;
    state.apiRotateError = null;
    renderApiPage();
    fetch(SITE_CONFIG.appSettingsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rotate_api_key" })
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }).then(function (data) {
      if (data && data.ok && data.settings && data.settings.externalApiKey) {
        state.appSettings.externalApiKey = data.settings.externalApiKey;
      }
      state.apiRotating = false;
      state.apiTestResult = null;
      renderApiPage();
    }).catch(function () {
      state.apiRotating = false;
      state.apiRotateError = "Could not rotate — check your connection and try again.";
      renderApiPage();
    });
  }

  function renderApiPage() {
    var host = $("#apiHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.apiPageOpen) return;

    var head = buildPageBanner(closeApiPage);

    var body = el("div", { class: "api-page-inner" });

    body.appendChild(el("div", { class: "api-card" }, [
      el("p", {}, ["Read-only feed for another website to consume. Returns Member Number, First " +
        "Name, Last Name, Phone, and Email for every registration currently showing a Paid status " +
        "(CSV-imported and Walk-In alike). This app pushes a fresh snapshot to the server automatically " +
        "whenever an officer has it open and something paid-related changes, so the feed stays current " +
        "as long as this app gets opened regularly."])
    ]));

    var key = state.appSettings.externalApiKey || "";
    var url = apiUrl(key);
    var urlInput = el("input", { type: "text", readonly: "readonly", value: url, class: "api-url-input" });
    urlInput.addEventListener("click", function () { urlInput.select(); });
    var copyUrlBtn = el("button", { class: "btn" }, ["Copy URL"]);
    copyUrlBtn.addEventListener("click", function () {
      urlInput.select();
      if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
    });
    body.appendChild(el("div", { class: "api-card" }, [
      el("h4", { text: "URL for the other website to call" }),
      el("div", { class: "form-row" }, [urlInput, copyUrlBtn])
    ]));

    var keyInput = el("input", {
      type: state.apiKeyRevealed ? "text" : "password", readonly: "readonly", value: key, class: "api-url-input"
    });
    var toggleBtn = el("button", { class: "btn" }, [state.apiKeyRevealed ? "Hide" : "Show"]);
    toggleBtn.addEventListener("click", function () { state.apiKeyRevealed = !state.apiKeyRevealed; renderApiPage(); });
    var rotateBtn = el("button", { class: "btn" }, [state.apiRotating ? "Rotating…" : "Rotate Key"]);
    if (state.apiRotating) rotateBtn.setAttribute("disabled", "disabled");
    rotateBtn.addEventListener("click", rotateApiKey);
    var keyCardKids = [
      el("h4", { text: "API Key" }),
      el("div", { class: "hint", style: "margin-bottom:4px" },
        ["Rotating immediately invalidates the old key — update the other website's copy of the URL " +
         "above right after rotating, or its requests will start failing."]),
      el("div", { class: "form-row" }, [keyInput, toggleBtn, rotateBtn])
    ];
    if (state.apiRotateError) keyCardKids.push(el("div", { class: "form-error" }, [state.apiRotateError]));
    body.appendChild(el("div", { class: "api-card" }, keyCardKids));

    var testBtn = el("button", { class: "btn primary" }, [state.apiTesting ? "Testing…" : "Test This URL"]);
    if (state.apiTesting) testBtn.setAttribute("disabled", "disabled");
    testBtn.addEventListener("click", testApiUrl);
    var testCardKids = [
      el("h4", { text: "Test" }),
      el("div", { class: "hint", style: "margin-bottom:4px" },
        ["Fires the exact same request another website would make (no login session involved) and shows the raw response."]),
      el("div", { class: "settings-actions" }, [testBtn])
    ];
    if (state.apiTestResult) {
      var t = state.apiTestResult;
      testCardKids.push(el("div", { class: t.ok ? "test-summary good" : "test-summary warn" }, ["HTTP " + t.status]));
      testCardKids.push(el("pre", { class: "api-response" }, [t.bodyText]));
    }
    body.appendChild(el("div", { class: "api-card" }, testCardKids));

    var bodyWrap = el("div", { class: "api-page-body" }, [body]);
    var page = el("div", { class: "api-page" }, [head, bodyWrap]);
    host.appendChild(page);
  }

  // T-Shirt Report is now the generic preview+builder screen — see
  // TSHIRT_REPORT_SPEC / openGenReportPage() further down.

  // T-Shirt Order Email (T-Shirts tab) — Premier/Corporate/Individual sponsor
  // sections plus a combined shirt-count breakdown (see buildTshirtOrderEmailBody()
  // above). To defaults from the Vendor Email address in Developer > Settings >
  // T-Shirt Vendor but is editable per-send (see state.emailTo) — send-tshirt-
  // order-email.php accepts an explicit "to" and falls back to the configured
  // Vendor Email only if none is supplied.
  function sendTshirtOrderEmail() {
    if (!SITE_CONFIG.sendTshirtOrderEmailApiUrl) return;
    if (!state.emailTo) {
      state.emailSendError = "No recipient set — type a To address, or add one in Developer > Settings first.";
      renderTshirtOrderPage();
      return;
    }
    state.emailSending = true;
    state.emailSendError = null;
    state.emailSent = false;
    renderTshirtOrderPage();
    fetch(SITE_CONFIG.sendTshirtOrderEmailApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: state.emailTo, subject: state.emailSubject, body: state.emailBody, cc: state.emailCc, bcc: state.emailBcc })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.emailSending = false;
        if (r.ok && r.data && r.data.ok) {
          state.emailSent = true;
        } else {
          state.emailSendError = (r.data && r.data.error) || "Send failed.";
        }
        renderTshirtOrderPage();
      })
      .catch(function () {
        state.emailSending = false;
        state.emailSendError = "Could not send — check your connection and try again.";
        renderTshirtOrderPage();
      });
  }

  function buildTshirtView() {
    var wrap = el("div", { class: "view tshirt-view" });

    // Total Shirts Needed For Event card (from Summary tab)
    if (state.result && state.result.ok) {
      wrap.appendChild(el("div", { class: "panel" }, [
        el("div", { class: "cards sponsor-cards" }, [
          el("div", { class: "sponsor-card" }, [
            el("div", { class: "sponsor-card-head", text: "Total Shirts Needed For Event" }),
            el("div", { style: "font-size:11px; color:var(--muted); margin:-6px 0 8px", text: "Paid registrations + all sponsors (excludes Walk-In T-Shirt purchases)" }),
            combinedShirtMatrix()
          ])
        ])
      ]));
    }

    // Navigation into the two full-page screens below — T-Shirt Report itself
    // is only on the Reports tab now (see TSHIRT_REPORT_SPEC / openGenReportPage()).
    var orderBtn = el("button", { class: "btn primary" }, ["📧 T-Shirt Order Email"]);
    orderBtn.addEventListener("click", openTshirtOrderPage);
    var purchaseBtn = el("button", { class: "btn" }, ["🛒 Order T-Shirt"]);
    purchaseBtn.addEventListener("click", openTshirtPurchasePage);
    wrap.appendChild(el("div", { class: "panel" }, [
      el("div", { class: "settings-actions" }, [orderBtn, purchaseBtn])
    ]));

    return wrap;
  }

  // ---------- Page banner helper (shared by all full-page overlays) ----------
  // Single-line banner: Back button + logo on the left, "Car Show Manager"
  // (plus an optional pageTitle sub-line naming the specific screen, e.g.
  // "T-Shirt Order Email") centered — grid layout so the title stays
  // centered on the page regardless of the left content's width.
  // printCallback is optional — when given, a "🖨 Print" button appears in
  // the banner's upper-right corner (same position on every full-page report
  // screen that has one), instead of each screen placing its own print
  // button somewhere in its body. exportCallback is likewise optional — when
  // given, a "⬇ Export" button appears immediately to Print's LEFT.
  function buildPageBanner(closeCallback, pageTitle, printCallback, exportCallback) {
    var headerLogo = $("header.app img.hdr-logo");
    var logoImg = headerLogo ? el("img", { src: headerLogo.src, style: "height:40px" }) : null;
    var leftKids = [];
    if (closeCallback) {
      var closeBtn = el("button", { class: "btn" }, ["← Back"]);
      closeBtn.addEventListener("click", closeCallback);
      leftKids.push(closeBtn);
    }
    if (logoImg) leftKids.push(logoImg);
    var centerKids = [el("h2", { text: "Car Show Manager", style: "margin: 0" })];
    if (pageTitle) centerKids.push(el("h3", { text: pageTitle, style: "margin: 4px 0 0; color: var(--muted); font-weight: 600" }));
    var rightKids = [];
    if (exportCallback) {
      var exportBtn = el("button", { class: "btn" }, ["⬇ Export"]);
      exportBtn.addEventListener("click", exportCallback);
      rightKids.push(exportBtn);
    }
    if (printCallback) {
      var printBtn = el("button", { class: "btn" }, ["🖨 Print"]);
      printBtn.addEventListener("click", printCallback);
      rightKids.push(printBtn);
    }
    return el("div", { class: "api-page-head", style: "display: grid; grid-template-columns: 1fr auto 1fr; align-items: center" }, [
      el("div", { style: "display: flex; align-items: center; gap: 10px; justify-self: start" }, leftKids),
      el("div", { style: "justify-self: center; text-align: center" }, centerKids),
      el("div", { style: "display: flex; align-items: center; gap: 8px; justify-self: end" }, rightKids)
    ]);
  }

  // ---------- T-Shirt Order Email (full-page screen) ----------
  function openTshirtOrderPage() {
    if (!state.emailTo) state.emailTo = state.appSettings.tshirtVendorEmail || "";
    if (!state.emailSubject) state.emailSubject = "ETCC Car Show — T-Shirt Order";
    if (!state.emailBody) state.emailBody = buildTshirtOrderEmailBody();
    state.tshirtOrderPageOpen = true;
    renderTshirtOrderPage();
  }
  function closeTshirtOrderPage() { state.tshirtOrderPageOpen = false; renderTshirtOrderPage(); }

  function renderTshirtOrderPage() {
    var host = $("#tshirtOrderHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.tshirtOrderPageOpen) return;

    var head = buildPageBanner(closeTshirtOrderPage, "T-Shirt Order Email");

    var body = el("div", { class: "api-page-inner" });

    if (!state.emailTo) state.emailTo = state.appSettings.tshirtVendorEmail || "";
    var toInput = el("input", { type: "text", value: state.emailTo || "", placeholder: "email@example.com" });
    toInput.addEventListener("input", function () { state.emailTo = toInput.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "To" }), toInput
    ]));
    if (!state.emailTo) {
      body.appendChild(el("div", { class: "form-error", text: "No Vendor Email set — add one in Developer > Settings > T-Shirt Vendor, or type a recipient above." }));
    }

    var subjectInput = el("input", { type: "text", value: state.emailSubject || "" });
    subjectInput.addEventListener("input", function () { state.emailSubject = subjectInput.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Subject" }), subjectInput
    ]));

    var ccInput = el("input", { type: "text", value: state.emailCc || "", placeholder: "email@example.com" });
    ccInput.addEventListener("input", function () { state.emailCc = ccInput.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "CC" }), ccInput
    ]));

    var bccInput = el("input", { type: "text", value: state.emailBcc || "", placeholder: "email@example.com" });
    bccInput.addEventListener("input", function () { state.emailBcc = bccInput.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "BCC" }), bccInput
    ]));

    var bodyTextarea = el("textarea", { rows: "40", style: "width:100%; font-family:monospace; font-size:13px; padding:8px; border:1px solid #ccc; resize:vertical" });
    bodyTextarea.value = state.emailBody || "";
    bodyTextarea.addEventListener("input", function () { state.emailBody = bodyTextarea.value; });
    body.appendChild(el("div", { class: "form-group" }, [
      el("label", { text: "Message Body (editable):" }),
      bodyTextarea
    ]));

    var sendBtn = el("button", { class: "btn primary" }, [state.emailSending ? "Sending…" : "Send"]);
    if (state.emailSending || !state.emailTo) sendBtn.setAttribute("disabled", "disabled");
    sendBtn.addEventListener("click", sendTshirtOrderEmail);
    var actionRow = el("div", { class: "settings-actions" }, [sendBtn]);
    if (state.emailSent) actionRow.appendChild(el("div", { class: "test-summary good", text: "Sent!" }));
    if (state.emailSendError) actionRow.appendChild(el("div", { class: "form-error", text: state.emailSendError }));
    body.appendChild(actionRow);

    var bodyWrap = el("div", { class: "api-page-body" }, [body]);
    var page = el("div", { class: "api-page" }, [head, bodyWrap]);
    host.appendChild(page);
  }

  // ---------- Reports tab ----------
  // Car Show Summary Report, Tally Sheet, Voting Sheet, and Flyer print
  // straight to the browser's print dialog with no intermediate on-screen
  // page. Registration/Member/T-Shirt/Sponsor Report each open a builder
  // screen first (preview + column/sort picker) and print from there — see
  // openGenReportPage() and openSponsorReportPage().
  function buildReportsView() {
    var summaryBtn = el("button", { class: "btn" }, ["📊 Car Show Summary Report"]);
    summaryBtn.addEventListener("click", printSummaryReport);
    var regBtn = el("button", { class: "btn" }, ["📋 Registration Report"]);
    regBtn.addEventListener("click", function () { openGenReportPage(REG_REPORT_SPEC); });
    var memberBtn = el("button", { class: "btn" }, ["👥 Member Report"]);
    memberBtn.addEventListener("click", function () { openGenReportPage(MEMBER_REPORT_SPEC); });
    var sponsorBtn = el("button", { class: "btn" }, ["🤝 Sponsor Report"]);
    sponsorBtn.addEventListener("click", openSponsorReportPage);
    var tshirtBtn = el("button", { class: "btn" }, ["👕 T-Shirt Report"]);
    tshirtBtn.addEventListener("click", function () { openGenReportPage(TSHIRT_REPORT_SPEC); });
    var carshowBtn = el("button", { class: "btn" }, ["🏁 Car Show Report"]);
    carshowBtn.addEventListener("click", function () { openGenReportPage(CARSHOW_REPORT_SPEC); });
    // Moved here from the Registration tab toolbar — not selection-dependent
    // like Print Window Cards, always enabled once there's at least one In
    // Car Show car, so an officer can pull a fresh paper copy at any time
    // (e.g. after a batch of Status/In Car Show edits) without needing to
    // reprint any window cards first.
    var tallyBtn = el("button", { class: "btn", id: "reportsTallySheetBtn", title: "Print the judging Tally Sheet (assigns Dash #s to any newly-added cars)" },
      ["📋 Print Tally Sheet"]);
    tallyBtn.addEventListener("click", printTallySheetForShow);
    if (!carsInShow().length) tallyBtn.setAttribute("disabled", "disabled");
    var votingBtn = el("button", { class: "btn" }, ["🗳️ Print Voting Sheet"]);
    votingBtn.addEventListener("click", printVotingSheet);
    var flyerBtn = el("button", { class: "btn" }, ["🖨️ Print Flyer"]);
    flyerBtn.addEventListener("click", printFlyer);
    var buttonCol = el("div", { class: "settings-actions", style: "flex-direction: column; align-items: flex-start" }, [summaryBtn, regBtn, memberBtn, sponsorBtn, tshirtBtn, carshowBtn, tallyBtn, votingBtn, flyerBtn]);
    var row = el("div", { class: "reports-row" }, []);
    if (window.__carshowReportsBanner) {
      row.appendChild(el("img", { src: window.__carshowReportsBanner, class: "reports-banner", alt: "Reports" }));
    }
    row.appendChild(buttonCol);
    return el("div", { class: "view reports-view" }, [
      el("div", { class: "panel" }, [
        el("h3", { text: "Reports" }),
        row
      ])
    ]);
  }

  // ---------- Setup tab ----------
  // Launchers into the three standalone import pages. Each is its own PHP
  // page (opened in a new tab) gated server-side by the main login session —
  // Import Members and Import Registrations used to live behind the
  // Developer-menu unlock; they're plain officer tools now. Import Flyer
  // (flyer-import.php) uploads a replacement CarShowFlyer.pdf, the file the
  // Reports tab's "Print Flyer" button opens.
  // Shared by buildSetupView() and buildImportScheduleSection()'s Manual
  // subsection — a launcher link (opens its standalone PHP page in a new
  // tab) with a hint line, optionally paired with one or more extra buttons
  // (e.g. "❓ Instructions", "📂 View Log") and/or extra content rendered
  // below the hint (e.g. a log panel toggled open by one of those buttons).
  function buildSetupLauncher(href, label, hint, extraBtn, extraContent) {
    var link = el("a", { class: "btn", href: href, target: "_blank", rel: "noopener" }, [label]);
    var extras = extraBtn ? (Array.isArray(extraBtn) ? extraBtn : [extraBtn]) : [];
    var linkRow = extras.length ? el("div", { style: "display:flex; align-items:center; gap:8px; flex-wrap:wrap" }, [link].concat(extras)) : link;
    var kids = [linkRow, el("div", { class: "setup-hint", text: hint })];
    if (extraContent) kids.push(extraContent);
    return el("div", { class: "setup-item" }, kids);
  }
  function buildImportHelpBtn(title, steps) {
    var btn = el("button", { class: "btn", type: "button", title: "How to export this CSV from ClubExpress" }, ["❓ Instructions"]);
    btn.addEventListener("click", function () { openImportHelp(title, steps); });
    return btn;
  }

  // Setup tab > Setup > "Import Members" > "View Log" panel content — see
  // toggleMemberImportLogPanel()/loadMemberImportLog() above. Returns null
  // when the panel is closed (buildSetupLauncher skips rendering it at all).
  function buildMemberImportLogPanel() {
    if (!state.memberImportLogPanelOpen) return null;
    if (state.memberImportLogLoading) return el("div", { class: "hint", style: "margin-top:6px" }, ["Loading…"]);
    if (state.memberImportLogError) return el("div", { class: "form-error", style: "margin-top:6px" }, [state.memberImportLogError]);
    if (state.memberImportLogList && state.memberImportLogList.length) {
      var rows = state.memberImportLogList.slice().reverse();
      return el("table", { class: "grid", style: "margin-top:8px; max-width:360px" }, [
        el("thead", {}, [el("tr", {}, [el("th", { text: "Imported" }), el("th", { text: "Members" })])]),
        el("tbody", {}, rows.map(function (r) {
          return el("tr", {}, [
            el("td", { text: r.timestamp ? fmtDate(new Date(r.timestamp)) : "" }),
            el("td", { text: r.count != null ? String(r.count) : "" })
          ]);
        }))
      ]);
    }
    if (state.memberImportLogList) return el("div", { class: "hint", style: "margin-top:6px" }, ["No imports recorded yet."]);
    return null;
  }

  function buildSetupView() {
    var mk = buildSetupLauncher;
    var helpBtn = buildImportHelpBtn;

    var memberLogToggleBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" },
      [state.memberImportLogPanelOpen ? "▲ Hide Log" : "📂 View Log"]);
    memberLogToggleBtn.addEventListener("click", toggleMemberImportLogPanel);
    var memberLogPanel = buildMemberImportLogPanel();

    var col = el("div", { class: "settings-actions", style: "flex-direction: column; align-items: flex-start; gap: 14px" }, [
      mk("members-import.php", "👥 Import Members", "Upload the ETCC membership roster CSV (used for name lookup / sponsor-form validation).",
        [helpBtn("Exporting the Member CSV from ClubExpress", MEMBER_IMPORT_STEPS), memberLogToggleBtn], memberLogPanel),
      mk("flyer-import.php", "🖼️ Import Flyer", "Upload a replacement car show flyer PDF (opened by the Reports tab's Print Flyer button).")
    ]);
    return el("div", { class: "view setup-view" }, [
      el("div", { class: "panel" }, [
        el("h3", { text: "Setup" }),
        col
      ]),
      buildImportScheduleSection(),
      buildBackupsSection()
    ]);
  }

  // Setup tab > Backups — "Backup Now" (backup.php action=run, synchronous —
  // see requestBackupNow() above) plus a permanent, color-coded log of every
  // run (green = success, red = failure), same row-coloring idea as
  // .test-list li.pass/.fail in styles.css. Distinct from the Import
  // Schedule's own log-of-sync-runs above: this is the app's *data*
  // (registrations, sponsors, payments, etc. — see backup.php's own header
  // comment) being snapshotted, not ClubExpress imports.
  function buildBackupsSection() {
    var runBtn = el("button", { type: "button", class: "btn primary" }, ["💾 Backup Now"]);
    if (state.backupRunning) runBtn.setAttribute("disabled", "disabled");
    runBtn.addEventListener("click", requestBackupNow);
    var runRow = el("div", { style: "display:flex; align-items:center; gap:10px" }, [runBtn]);
    if (state.backupRunStatus) {
      var isFailed = state.backupRunStatus.indexOf("Failed") === 0;
      var isSucceeded = state.backupRunStatus.indexOf("Succeeded") === 0;
      var statusStyle = isFailed ? "color:var(--warn)" : (isSucceeded ? "color:var(--good)" : "");
      runRow.appendChild(el("span", { class: "count", style: statusStyle }, [state.backupRunStatus]));
    }

    var toggleBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" },
      [state.backupsPanelOpen ? "▲ Hide Logs" : "📂 View Logs"]);
    toggleBtn.addEventListener("click", toggleBackupsPanel);

    var kids = [
      el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "" }), runRow]),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Backup Log" }),
        el("div", {}, [toggleBtn])
      ])
    ];

    if (state.backupsPanelOpen) {
      if (state.backupsLoading) {
        kids.push(el("div", { class: "hint" }, ["Loading…"]));
      } else if (state.backupsError) {
        kids.push(el("div", { class: "form-error" }, [state.backupsError]));
      } else if (state.backupsList && state.backupsList.length) {
        var rows = state.backupsList.slice().reverse();
        kids.push(el("table", { class: "grid", style: "margin-top:8px" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { text: "Run" }), el("th", { text: "Trigger" }), el("th", { text: "Status" }), el("th", { text: "Details" }), el("th", { text: "" })
          ])]),
          el("tbody", {}, rows.map(function (r) {
            var ok = r.status === "success";
            var rowClass = ok ? "backup-row-ok" : "backup-row-fail";
            var triggerLabel = r.reason === "auto" ? "Auto" : r.reason === "restore" ? "Restore" : r.reason === "pre-restore" ? "Pre-Restore" : "Manual";
            var details;
            if (r.reason === "restore") {
              // A restore row's own "backup file" is the source it restored
              // FROM, which may since have been purged — no download/restore
              // link for the row itself, just a record of what happened.
              var scopeLabel = (r.scope && r.scope !== "all") ? (" [show: " + (r.scopeName || r.scope) + "]") : " [everything]";
              details = ok
                ? el("span", {}, ["Restored from " + (r.restoredFrom || "unknown") + scopeLabel + " (" + (r.filesWritten || 0) + " files)"])
                : el("span", { text: "Restore from " + (r.restoredFrom || "unknown") + " failed: " + (r.error || "Unknown error") });
            } else if (ok) {
              var kb = Math.max(1, Math.round((r.sizeBytes || 0) / 1024));
              var link = el("a", {
                href: SITE_CONFIG.backupApiUrl + "?action=download&name=" + encodeURIComponent(r.fileName),
                target: "_blank", rel: "noopener", text: r.fileName
              });
              details = el("span", {}, [link, document.createTextNode(" — " + (r.fileCount || 0) + " files, " + kb + " KB")]);
            } else {
              details = el("span", { text: r.error || "Unknown error" });
            }
            // Restore is only offered for a row that still has a real file on
            // disk (a successful backup or pre-restore snapshot, not a
            // "restore" record row itself, which has no file of its own).
            var canRestore = ok && r.reason !== "restore" && r.fileName;
            var actionBtns = [];
            if (canRestore) {
              var restoreBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:2px 8px; margin-right:4px", title: "Restore from this backup" }, ["↺ Restore"]);
              restoreBtn.addEventListener("click", function () { openRestoreConfirm(r.timestamp); });
              actionBtns.push(restoreBtn);
            }
            var deleteBtn = el("button", { type: "button", class: "btn btn-warn", style: "font-size:12px; padding:2px 8px", title: "Delete this backup" }, ["🗑"]);
            deleteBtn.addEventListener("click", function () { openDeleteBackupConfirm(r.timestamp); });
            actionBtns.push(deleteBtn);
            return el("tr", { class: rowClass }, [
              el("td", { text: r.timestamp ? fmtDate(new Date(r.timestamp)) : "" }),
              el("td", { text: triggerLabel }),
              el("td", { text: ok ? "✅ Success" : "❌ Failed" }),
              el("td", {}, [details]),
              el("td", { style: "white-space:nowrap" }, actionBtns)
            ]);
          }))
        ]));
      } else if (state.backupsList) {
        kids.push(el("div", { class: "hint" }, ["No backups recorded yet."]));
      }
    }

    return el("div", { class: "panel", style: "margin-top:16px" }, [
      el("h3", { text: "Backups" }),
      el("div", { class: "hint", style: "margin-bottom:10px" }, [
        "Zips the app's live data (registrations, sponsors, payments, t-shirts, etc.) into a dated file " +
        "kept on the server, for point-in-time recovery independent of the live JSON files. Only the newest " +
        "30 backup files are kept on disk; this log is kept permanently, even for a purged or failed run."
      ]),
      el("div", {}, kids),
      buildAutoBackupFields()
    ]);
  }

  // Setup tab > Backups > auto-backup schedule — enable checkbox + active
  // date range, same UX as the Import Schedule's own auto-import settings
  // (see buildImportScheduleSection() below). The actual daily trigger is
  // server-side (lib.php's carshow_backup_auto_check(), piggybacked on the
  // Import Schedule's existing ~15-minute poll) — this only edits the
  // settings it reads.
  function buildAutoBackupFields() {
    var s = state.backupSchedule || { enabled: false, startDate: "", endDate: "", lastAutoRunDate: "" };

    var enableCb = el("input", { type: "checkbox" }); enableCb.checked = !!s.enabled;
    var startDateInput = el("input", { type: "date", value: s.startDate || "" });
    var endDateInput = el("input", { type: "date", value: s.endDate || "" });

    // Auto-save: no Save button, same convention as the Import Schedule
    // section above and the Settings modal's autoSaveSettings() — "change"
    // for these checkbox/date fields, which have no meaningful "still
    // typing" state a "blur"-triggered save would need to wait out.
    function autoSaveBackupSchedule() {
      saveBackupSchedule({
        enabled: enableCb.checked,
        startDate: startDateInput.value,
        endDate: endDateInput.value
      });
    }
    enableCb.addEventListener("change", autoSaveBackupSchedule);
    startDateInput.addEventListener("change", autoSaveBackupSchedule);
    endDateInput.addEventListener("change", autoSaveBackupSchedule);

    var saveStatus = [];
    if (state.backupScheduleSaving) saveStatus.push(el("span", { class: "count" }, ["Saving…"]));
    else if (state.backupScheduleSaved) saveStatus.push(el("span", { class: "count", style: "color:var(--good)" }, ["Saved."]));
    if (state.backupScheduleError) saveStatus.push(el("div", { class: "form-error" }, [state.backupScheduleError]));

    var lastRunLine = s.lastAutoRunDate
      ? el("div", { class: "hint", style: "margin-top:4px" }, ["Last automatic backup: " + s.lastAutoRunDate + "."])
      : null;

    var fields = [
      el("div", { class: "hint", style: "margin:10px 0" }, [
        "Runs once a day at midnight (America/New_York), only while enabled and within the active dates below " +
        "— piggybacked on the same ~15-minute heartbeat the Import Schedule uses, so it takes effect within a " +
        "few minutes of midnight, not instantly."
      ]),
      el("div", { class: "form-row" }, [
        el("label", {}, [enableCb, document.createTextNode(" Enable automatic backups")])
      ]),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Active dates" }),
        el("div", { style: "display:flex; gap:8px; align-items:center" }, [
          startDateInput, document.createTextNode("to"), endDateInput
        ])
      ]),
      el("div", { class: "settings-actions" }, saveStatus)
    ];
    if (lastRunLine) fields.push(lastRunLine);

    return el("div", { style: "margin-top:14px; padding-top:14px; border-top:1px solid var(--line)" }, fields);
  }

  // Setup tab > Import Schedule > "Log Directory" — server-archived run logs
  // (logs.php), browsable from any machine logged into the site. Purged
  // after 7 days — see logs.php's CARSHOW_LOG_PURGE_DAYS. This is the
  // authoritative copy of each run's log (deploy/sync-registrations.js keeps
  // only a one-line-per-failure local file for debugging Task Scheduler).
  function buildLogDirectoryField() {
    var toggleBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" },
      [state.logsPanelOpen ? "▲ Hide Logs" : "📂 View Logs"]);
    toggleBtn.addEventListener("click", toggleLogsPanel);

    var kids = [
      el("div", {}, [toggleBtn]),
      el("div", { class: "setup-hint" }, [
        "Each import run's log is archived here — viewable from anywhere, purged automatically after 7 days."
      ])
    ];

    if (state.logsPanelOpen) {
      if (state.logsLoading) {
        kids.push(el("div", { class: "hint" }, ["Loading…"]));
      } else if (state.logsError) {
        kids.push(el("div", { class: "form-error" }, [state.logsError]));
      } else if (state.logsList && state.logsList.length) {
        kids.push(el("table", { class: "grid", style: "margin-top:8px" }, [
          el("thead", {}, [el("tr", {}, [el("th", { text: "Log" }), el("th", { text: "Saved" }), el("th", { text: "Size" })])]),
          el("tbody", {}, state.logsList.map(function (f) {
            var link = el("a", {
              href: SITE_CONFIG.logsApiUrl + "&action=get&name=" + encodeURIComponent(f.name),
              target: "_blank", rel: "noopener", text: f.name
            });
            return el("tr", {}, [
              el("td", {}, [link]),
              el("td", { text: f.mtime ? fmtDate(new Date(f.mtime)) : "" }),
              el("td", { text: Math.max(1, Math.round(f.size / 1024)) + " KB" })
            ]);
          }))
        ]));
      } else if (state.logsList) {
        kids.push(el("div", { class: "hint" }, ["No logs archived yet (or all have aged past the 7-day retention window)."]));
      }
    }

    return el("div", {}, kids);
  }

  // Setup tab > Import Schedule > persisted "Last run" line — reads
  // state.runStatus (fetched by loadRunStatus(), see buildTabs()'s Setup-tab
  // select handler). Distinct from the Import Now button's own ephemeral
  // status text: this reflects whichever run happened most recently
  // (manual or scheduled), and survives page reloads.
  // Setup tab > Import Schedule > "Automation" line — is the Windows scheduled
  // task (deploy/sync-registrations.js) on the officer's machine actually
  // alive? It checks in with import-schedule.php every ~15 minutes; a
  // heartbeat older than that means it isn't running (machine off or asleep,
  // the task's account signed out — it's registered Interactive — or the task
  // disabled/removed). This is the only symptom the app can show for that
  // class of failure, since a task that can't start never reports anything else.
  function buildAutomationStatusLine() {
    if (!state.lastPollAt) {
      return el("div", { class: "hint", style: "margin-bottom:4px" },
        ["Automation: no check-in recorded yet — the scheduled task may not have run since this was set up."]);
    }
    var last = new Date(state.lastPollAt);
    var minsAgo = Math.max(0, Math.round((Date.now() - last.getTime()) / 60000));
    // Two poll intervals of slack (plus the task's own start jitter) before
    // calling it stale — a single skipped poll isn't worth alarming about.
    var healthy = minsAgo <= 35;
    var agoText = minsAgo < 1 ? "just now" : (minsAgo === 1 ? "1 minute ago" : minsAgo + " minutes ago");
    var msg = healthy
      ? "Automation: ✅ running — last checked in " + agoText + " (" + fmtDate(last) + ")."
      : "Automation: ⚠️ last checked in " + agoText + " (" + fmtDate(last) + "). Expected every ~15 minutes — " +
        "the scheduled task isn't running. Check that the import machine is on and its Windows account is signed in, " +
        "then open Task Scheduler there and look at \"carshow-sync-registrations\" (Last Run Result 0 = fine).";
    return el("div", {
      class: healthy ? "hint" : "",
      style: "margin-bottom:4px" + (healthy ? "" : "; color:var(--warn); font-size:13px")
    }, [msg]);
  }

  function buildLastRunLine() {
    var rs = state.runStatus;
    if (!rs || !rs.startedAt) {
      return el("div", { class: "hint", style: "margin-bottom:10px" }, ["Last run: none recorded yet."]);
    }
    var reasonText = rs.reason === "manual" ? "Import Now"
      : (rs.reason && rs.reason.indexOf("scheduled:") === 0 ? "scheduled " + rs.reason.slice("scheduled:".length) : (rs.reason || ""));
    var parts = ["Last run: started " + fmtDate(new Date(rs.startedAt)) + (reasonText ? " (" + reasonText + ")" : "")];
    var style = "margin-bottom:10px";
    if (!rs.completedAt) {
      parts.push(" — still running, or the scheduled task didn't get a chance to report completion.");
    } else if (rs.status === "failed") {
      parts.push(" — ❌ Failed at " + fmtDate(new Date(rs.completedAt)) + (rs.error ? ": " + rs.error : "") + ".");
      style += "; color:var(--warn)";
    } else {
      parts.push(" — ✅ Succeeded at " + fmtDate(new Date(rs.completedAt)) + ".");
      style += "; color:var(--good)";
    }
    return el("div", { style: style }, [parts.join("")]);
  }

  // Setup tab > Import Schedule — the ClubExpress event URL (read by
  // deploy/sync-registrations.js via import-schedule.php's 'check', instead of
  // a hardcoded URL that goes stale every year), an "Import Now" button, and an auto-import schedule
  // (enable checkbox, one or more daily times, and an optional active-date
  // range). None of this runs anything itself — see import-schedule.php's
  // header comment and app.js's requestImportNow()/saveImportScheduleSettings()
  // above for how it actually reaches the scheduled task on an officer's
  // machine, which is the only thing that can drive a real ClubExpress export.
  function buildImportScheduleSection() {
    var s = state.appSettings;

    var eventUrlInput = el("input", { type: "text", value: s.eventUrl || "", placeholder: "https://www.etccwebsite.com/content.aspx?...&item_id=..." });

    var importNowBtn = el("button", { type: "button", class: "btn primary" }, ["▶ Import Now"]);
    importNowBtn.addEventListener("click", requestImportNow);
    var importNowRow = el("div", { style: "display:flex; align-items:center; gap:10px" }, [importNowBtn]);
    if (state.importRequestStatus) {
      var isFailed = state.importRequestStatus.indexOf("Failed at ") === 0;
      var isSucceeded = state.importRequestStatus.indexOf("Succeeded at ") === 0;
      var statusStyle = isFailed ? "color:var(--warn)" : (isSucceeded ? "color:var(--good)" : "");
      importNowRow.appendChild(el("span", { class: "count", style: statusStyle }, [state.importRequestStatus]));
    }

    var enableCb = el("input", { type: "checkbox" }); enableCb.checked = !!s.autoImportEnabled;

    var startDateInput = el("input", { type: "date", value: s.autoImportStartDate || "" });
    var endDateInput = el("input", { type: "date", value: s.autoImportEndDate || "" });

    // One <input type=time> per configured daily run time, same repeatable
    // add/remove-row pattern as the Sponsors tab's "+ Add Another Shirt"
    // rows — plain DOM add/remove rather than tracking a parallel array in
    // state, since Save reads every row's current value straight off the DOM.
    var timesWrap = el("div", {});
    // Shared by the Save button and removeBtn's instant-delete-save below —
    // reads every field's current DOM value into the same patch shape
    // saveImportScheduleSettings() expects.
    function collectScheduleSettings() {
      var times = Array.prototype.map.call(timesWrap.querySelectorAll("input[type=time]"), function (i) { return i.value; })
        .filter(function (v) { return v; });
      return {
        eventUrl: eventUrlInput.value.trim(),
        autoImportEnabled: enableCb.checked,
        autoImportTimes: times,
        autoImportIntervalHours: Number(intervalSel.value),
        autoImportStartDate: startDateInput.value,
        autoImportEndDate: endDateInput.value
      };
    }
    function addTimeRow(value) {
      var input = el("input", { type: "time", value: value || "" });
      var removeBtn = el("button", { type: "button", class: "btn", style: "padding:4px 10px" }, ["✕"]);
      var row = el("div", { style: "display:flex; gap:6px; margin-bottom:6px; align-items:center" }, [input, removeBtn]);
      // Editing a time's value, and removing the row entirely, both save
      // immediately — there's no separate Save button on this section (see
      // this function's own autoSaveSchedule() further down). A deleted or
      // half-edited time otherwise kept firing on the server until someone
      // remembered to click a manual Save (exactly how Vette Fest ended up
      // with two leftover test times still running daily well after they
      // were meant to be gone).
      input.addEventListener("change", function () { saveImportScheduleSettings(collectScheduleSettings()); });
      removeBtn.addEventListener("click", function () {
        timesWrap.removeChild(row);
        saveImportScheduleSettings(collectScheduleSettings());
      });
      timesWrap.appendChild(row);
    }
    (s.autoImportTimes || []).forEach(function (t) { addTimeRow(t); });
    var addTimeBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["+ Add Time"]);
    addTimeBtn.addEventListener("click", function () { addTimeRow(""); });

    // "Every N hours, on the hour" — a simpler alternative (or addition) to
    // picking explicit times one at a time. 0 = off. Active alongside any
    // explicit times above, not instead of them — see import-schedule.php's
    // 'check' action, which unions both into one slot list.
    var intervalSel = el("select", {});
    [
      [0, "Off"], [1, "Every hour"], [2, "Every 2 hours"], [3, "Every 3 hours"],
      [4, "Every 4 hours"], [6, "Every 6 hours"], [8, "Every 8 hours"], [12, "Every 12 hours"]
    ].forEach(function (opt) {
      var o = el("option", { value: String(opt[0]), text: opt[1] });
      if (Number(s.autoImportIntervalHours) === opt[0]) o.setAttribute("selected", "selected");
      intervalSel.appendChild(o);
    });

    // Auto-save: every field in this section saves itself (no Save button)
    // as soon as it's committed — "blur" for the free-text Event URL,
    // "change" for the checkbox/date/select fields (which have no
    // meaningful "still typing" state the way a text field does). Same
    // pattern as the Settings modal's autoSaveSettings() above. Times are
    // wired individually in addTimeRow() below — both editing an existing
    // time and removing one save immediately, since a stale time otherwise
    // keeps firing on the server until someone remembers to click a
    // separate Save (see addTimeRow's own comment for the incident that
    // motivated this).
    function autoSaveSchedule() { saveImportScheduleSettings(collectScheduleSettings()); }
    eventUrlInput.addEventListener("blur", autoSaveSchedule);
    enableCb.addEventListener("change", autoSaveSchedule);
    startDateInput.addEventListener("change", autoSaveSchedule);
    endDateInput.addEventListener("change", autoSaveSchedule);
    intervalSel.addEventListener("change", autoSaveSchedule);

    var saveStatus = [];
    if (state.importScheduleSaving) saveStatus.push(el("span", { class: "count" }, ["Saving…"]));
    else if (state.importScheduleSaved) saveStatus.push(el("span", { class: "count", style: "color:var(--good)" }, ["Saved."]));
    if (state.importScheduleError) saveStatus.push(el("div", { class: "form-error" }, [state.importScheduleError]));

    // Manual subsection — the browser-upload alternative to Import Now. Moved
    // here (out of the plain Setup import-launcher list above) since it's the
    // fallback path for the same job this whole section automates: pick the
    // two CSVs by hand when Import Now/the schedule isn't available or
    // convenient (e.g. the automation machine is off, or an officer already
    // has the files and doesn't want to wait for a poll).
    var manualSection = el("div", { style: "margin-top:18px; padding-top:14px; border-top:1px solid var(--line)" }, [
      el("h4", { text: "Manual", style: "margin:0 0 8px" }),
      buildSetupLauncher("registrations-import.php", "📋 Import Registrations",
        "Upload the ClubExpress registration + activity CSV export for the current show, by hand, right now.",
        buildImportHelpBtn("Exporting the Registration CSV from ClubExpress", REGISTRATION_IMPORT_STEPS))
    ]);

    return el("div", { class: "panel", style: "margin-top:16px" }, [
      el("h3", { text: "Import Schedule" }),
      el("div", { class: "hint", style: "margin-bottom:10px" }, [
        "Controls the automation that pulls fresh ClubExpress data. A web page can't drive ClubExpress " +
        "itself, so the work is done by a Windows scheduled task on an officer's machine that checks in " +
        "here every ~15 minutes — Import Now and scheduled times take effect within a few minutes, not instantly. " +
        "If an import reports \"ClubExpress session not logged in\", run deploy/clubexpress-login.js on that " +
        "machine and sign in with Remember Me ticked."
      ]),
      buildAutomationStatusLine(),
      buildLastRunLine(),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Scheduled Task" }),
        el("div", {}, [
          // install-scheduled-task.cmd is a plain launcher for the repo's
          // install-scheduled-task.ps1 (-Interactive); it's uploaded by
          // ftp-deploy.sh and holds no secrets, only the local repo path.
          // Ported from the Vette Fest app's own Setup tab.
          el("div", {}, [
            el("a", { class: "btn btn-sm", href: "install-scheduled-task.cmd", download: "install-scheduled-task.cmd" },
              ["⬇ Download task installer"])
          ]),
          el("div", { class: "setup-hint" }, [
            "Windows task \"carshow-sync-registrations\" checks in every 15 minutes. Run the installer on the " +
            "machine with the repo to create it. Healthy = Task Scheduler's Last Run Result 0. " +
            "If imports say \"not logged in\", run deploy/clubexpress-login.js and tick Remember Me."
          ])
        ])
      ]),
      el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "Event URL" }), eventUrlInput]),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Log Directory" }),
        buildLogDirectoryField()
      ]),
      el("div", { class: "form-row" }, [el("span", { class: "form-label", text: "" }), importNowRow]),
      el("div", { class: "form-row" }, [
        el("label", {}, [enableCb, document.createTextNode(" Enable automatic imports")])
      ]),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Active dates" }),
        el("div", { style: "display:flex; gap:8px; align-items:center" }, [
          startDateInput, document.createTextNode("to"), endDateInput
        ])
      ]),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Times" }),
        el("div", {}, [timesWrap, addTimeBtn])
      ]),
      el("div", { class: "form-row" }, [
        el("span", { class: "form-label", text: "Interval" }),
        el("div", {}, [
          intervalSel,
          el("div", { class: "setup-hint" }, ["Runs alongside any Times above, not instead of them."])
        ])
      ]),
      el("div", { class: "settings-actions" }, saveStatus),
      manualSection
    ]);
  }

  // History tab — read-only log of every successful registration-data
  // import for this show (registrations-upload.php's CLI path and
  // registrations-import.php's browser path both append one entry via
  // carshow_append_json_list; see index.php's ingestImportHistory boot
  // call). Newest first, since that's almost always the entry someone
  // wants to check ("did today's import actually happen?").
  function buildHistoryView() {
    var rows = state.importHistory.slice().reverse();
    // Prune stale selections (e.g. after a delete, or a fresh reload changed
    // which timestamps exist) so a leftover checked box can't silently
    // target an entry that isn't shown anymore.
    var liveTimestamps = {};
    rows.forEach(function (r) { if (r.timestamp) liveTimestamps[r.timestamp] = true; });
    Object.keys(state.historySelected).forEach(function (ts) { if (!liveTimestamps[ts]) delete state.historySelected[ts]; });

    var body;
    var toolbar = null;
    if (!rows.length) {
      body = el("div", { class: "empty-state" }, ["No imports recorded yet — this fills in the next time a CSV pair is imported via the Setup tab."]);
    } else {
      var selectedCount = selectedHistoryTimestamps().length;
      var selectAllCb = el("input", { type: "checkbox" });
      selectAllCb.checked = rows.length > 0 && selectedCount === rows.length;
      selectAllCb.addEventListener("change", function () {
        rows.forEach(function (r) { if (r.timestamp) toggleHistorySelected(r.timestamp, selectAllCb.checked); });
        renderViews();
      });

      var deleteSelectedBtn = el("button", { class: "btn btn-warn" }, ["🗑 Delete Selected" + (selectedCount ? " (" + selectedCount + ")" : "")]);
      if (!selectedCount) deleteSelectedBtn.setAttribute("disabled", "disabled");
      deleteSelectedBtn.addEventListener("click", function () { openDeleteHistoryConfirm("selected"); });
      var deleteAllBtn = el("button", { class: "btn btn-warn" }, ["🗑 Delete All"]);
      deleteAllBtn.addEventListener("click", function () { openDeleteHistoryConfirm("all"); });
      toolbar = el("div", { class: "settings-actions", style: "margin-bottom:10px" }, [deleteSelectedBtn, deleteAllBtn]);

      var table = el("table", { class: "grid" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", {}, [selectAllCb]),
          el("th", { text: "" }),
          el("th", { text: "Log" }),
          el("th", { text: "Imported" }),
          el("th", { text: "Registrations" }),
          el("th", { text: "Activities" }),
          el("th", { text: "Source" }),
          el("th", { text: "Event URL" })
        ])]),
        el("tbody", {}, rows.map(function (r) {
          var failed = r.outcome === "failed";
          var outcomeCell = el("td", {
            title: failed ? ("Failed" + (r.error ? ": " + r.error : "")) : "Succeeded",
            style: "text-align:center"
          }, [failed ? "❌" : "✅"]);

          var cb = el("input", { type: "checkbox" });
          cb.checked = !!(r.timestamp && state.historySelected[r.timestamp]);
          cb.addEventListener("change", function () { toggleHistorySelected(r.timestamp, cb.checked); renderViews(); });
          var selectCell = el("td", { style: "text-align:center" }, [cb]);

          // Right next to the outcome icon (not squeezed past a long Event
          // URL column at the far right) so it's actually noticeable —
          // labeled with its own header rather than blank.
          var logCell;
          if (r.logFile && SITE_CONFIG.logsApiUrl) {
            // Logs are archived server-side (logs.php) — viewable by anyone
            // logged into the site, not just the machine that ran the
            // import. Purged after 7 days.
            var logLink = el("a", {
              class: "btn btn-sm",
              href: SITE_CONFIG.logsApiUrl + "&action=get&name=" + encodeURIComponent(r.logFile),
              title: "View log (" + r.logFile + ")",
              target: "_blank", rel: "noopener"
            }, ["📄 Log"]);
            logCell = el("td", { style: "text-align:center; white-space:nowrap" }, [logLink]);
          } else {
            logCell = el("td", { style: "text-align:center; color:var(--muted)" }, ["—"]);
          }

          return el("tr", {}, [
            selectCell,
            outcomeCell,
            logCell,
            el("td", { text: r.timestamp ? fmtDate(new Date(r.timestamp)) : "" }),
            el("td", { text: String(r.regRows != null ? r.regRows : "—") }),
            el("td", { text: String(r.actRows != null ? r.actRows : "—") }),
            el("td", { text: r.source === "cli" ? "Scheduled sync" : "Manual upload" }),
            el("td", { style: "max-width:260px; white-space:normal; overflow-wrap:break-word; word-break:break-all" }, [r.eventUrl || "—"])
          ]);
        }))
      ]);
      body = el("div", { class: "tablewrap" }, [table]);
    }
    return el("div", { class: "view history-view" }, [
      el("div", { class: "panel" }, [
        el("h3", { text: "Import History" }),
        toolbar,
        body
      ].filter(Boolean))
    ]);
  }

  // ---------- Financials tab ----------
  // A short, hand-entered summary of this show year's expenses (Category,
  // Amount, optional Notes) — see financials.php's own header comment for
  // why this is a summary an officer types in from the club's real
  // accounting report, not a live transaction feed pulled from anywhere.
  // Suggested categories (a datalist, not a fixed enum — any text is
  // accepted) match the categories that actually appear on the club's own
  // "Account Transactions" report for the Car Show fund.
  var FINANCIALS_SUGGESTED_CATEGORIES = [
    "Show Expenses (food, supplies, misc.)",
    "T-Shirts & Dash Plaques",
    "Trophies & Awards",
    "Charitable Donations",
    "Prize Money"
  ];

  // ---- "Upload Report" PDF parsing ----
  // Targets the club's own "Account Transactions" export (accounting
  // software report, one PDF per year) — the exact shape confirmed against a
  // real 2025 export. That report groups every transaction under a named
  // category ("Car Show - Reeder:Sponsors", "Grants - Charities-
  // Contributions", etc.), each ending in a "Total <category> <debit>
  // <credit>" subtotal row, plus one final unlabeled "Total <debit>
  // <credit>" grand-total row. This deliberately reads ONLY those subtotal
  // rows — not each individual transaction line — since that's already
  // exactly the category-level summary this tab wants; nothing here tries to
  // reproduce the full transaction ledger.
  //
  // Lazily points pdf.js at its worker the first time it's actually needed —
  // window.__pdfjsWorkerSrc is the worker's full source, embedded as a
  // string by build.js (a Worker can't be constructed from inline script the
  // way the main library can; a Blob + object URL is the standard
  // workaround when everything has to ship as one self-contained HTML file
  // with nothing else alongside it).
  var pdfjsWorkerReady = false;
  function ensurePdfjsWorker() {
    if (pdfjsWorkerReady) return;
    if (!window.pdfjsLib || !window.__pdfjsWorkerSrc) return;
    var blob = new Blob([window.__pdfjsWorkerSrc], { type: "text/javascript" });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
    pdfjsWorkerReady = true;
  }

  // Extracts the PDF's text as an array of visual LINES (not pdf.js's raw
  // per-glyph-run items) — items are grouped by their rounded Y position
  // (page coordinates, so larger Y = higher on the page) and read left to
  // right within each group, which reconstructs each printed row of the
  // report as one string, in top-to-bottom reading order, across every page.
  function extractPdfLines(arrayBuffer) {
    ensurePdfjsWorker();
    return window.pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (doc) {
      var pageNums = [];
      for (var p = 1; p <= doc.numPages; p++) pageNums.push(p);
      var chain = Promise.resolve();
      var lines = [];
      pageNums.forEach(function (p) {
        chain = chain.then(function () { return doc.getPage(p); })
          .then(function (page) { return page.getTextContent(); })
          .then(function (content) {
            var byY = {};
            content.items.forEach(function (it) {
              var y = Math.round(it.transform[5]);
              (byY[y] = byY[y] || []).push({ str: it.str, x: it.transform[4] });
            });
            Object.keys(byY).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
              var line = byY[y].sort(function (a, b) { return a.x - b.x; })
                .map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim();
              if (line) lines.push(line);
            });
          });
      });
      return chain.then(function () { return lines; });
    });
  }

  // Every category in the club's report lives under the "Car Show" fund, so
  // its name is repeated on every single row ("Car Show - Reeder:Sponsors",
  // "Car Show-Reeder: T-Shirts", ...) — redundant once it's already sitting
  // on the Financials tab's Car Show data, so it's stripped here, along with
  // whatever separator punctuation is left dangling where it used to be.
  function cleanFinancialsCategoryName(name) {
    var cleaned = (name || "")
      .replace(/car\s*show/gi, "")
      .replace(/reeder/gi, "")
      .replace(/^[\s:\-]+|[\s:\-]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned || (name || "").trim(); // fall back if nothing but noise words was left
  }

  var FINANCIALS_PDF_NUM = "([\\d,]+\\.\\d{2}|-)";
  var FINANCIALS_PDF_GRAND_RE = new RegExp("^" + FINANCIALS_PDF_NUM + "\\s+" + FINANCIALS_PDF_NUM + "$");
  var FINANCIALS_PDF_TWO_RE = new RegExp("^(.*?)\\s+" + FINANCIALS_PDF_NUM + "\\s+" + FINANCIALS_PDF_NUM + "$");
  var FINANCIALS_PDF_ONE_RE = new RegExp("^(.*?)\\s+" + FINANCIALS_PDF_NUM + "$");
  var FINANCIALS_PDF_NEXTLINE_RE = new RegExp("^" + FINANCIALS_PDF_NUM + "\\s+" + FINANCIALS_PDF_NUM + "$");
  function financialsPdfAmount(tok) {
    return (tok === "-" || tok == null) ? 0 : parseFloat(tok.replace(/,/g, ""));
  }
  // Splits one "Total ..." line's tail into category text + its Debit/Credit
  // figures. A category whose own name happens to wrap across two printed
  // lines (long enough to need it) lands its amounts on the NEXT line
  // instead of this one — extractFinancialsCategories() below handles that
  // by falling back to the following line when this one has no numbers at
  // all, at the cost of only capturing that category's name up to the wrap
  // (still identifiable; the officer can rename it in the review step).
  function splitFinancialsTotalLine(text) {
    var grand = text.match(FINANCIALS_PDF_GRAND_RE);
    if (grand) return { grand: true, debit: financialsPdfAmount(grand[1]), credit: financialsPdfAmount(grand[2]) };
    var two = text.match(FINANCIALS_PDF_TWO_RE);
    if (two) return { category: two[1].trim(), debit: financialsPdfAmount(two[2]), credit: financialsPdfAmount(two[3]) };
    var one = text.match(FINANCIALS_PDF_ONE_RE);
    if (one) return { category: one[1].trim(), single: financialsPdfAmount(one[2]) };
    return null;
  }
  // Turns the raw lines sitting between a category's header row and its
  // "Total ..." row into per-transaction detail entries — the report prints
  // one row per transaction there, each ending in its own amount (or a
  // Debit/Credit pair). The category name itself is usually repeated as a
  // header line right before its first transaction; that line is dropped
  // since it carries no amount of its own and would otherwise show up as a
  // bogus zero-amount "detail".
  //
  // Each real transaction's Date/Name/Memo/Split columns often wrap across
  // more than one printed line (the report's columns are narrow), so a
  // "transaction" and a "printed line" aren't the same thing here. Rather
  // than guess which lines belong together (and risk silently merging two
  // real line items into one, or dropping one), this keeps EVERY raw line
  // that survives the category-header filter as its own detail entry,
  // pulling a date and/or amount out of that single line when one is
  // present and leaving it blank otherwise — nothing is ever combined or
  // discarded, so the officer sees exactly what the PDF printed and can
  // merge/edit/delete by hand in the review screen if a transaction's
  // wrapped across more than one row.
  var FINANCIALS_DETAIL_DATE_RE = /[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/;
  var FINANCIALS_DETAIL_MONEY_RE = /-?[\d,]+\.\d{2}/g;

  // A wrapped transaction's fragment lines carry no amount of their own (or
  // print as $0.00), with the real amount landing on just one of the lines —
  // so those zero/blank fragments are folded into whichever ACTUAL-amount
  // line is closest to them (their Name/Memo/Split text prepended or
  // appended, in original printed order) rather than left as their own
  // bogus $0.00 "transactions". A run of fragments with no non-zero line
  // anywhere in the category (rare) is left as-is — nothing to merge into.
  function mergeFinancialsZeroDetails(details) {
    var nonzeroIdx = [];
    details.forEach(function (d, i) { if (d.amount !== null && d.amount !== 0) nonzeroIdx.push(i); });
    if (!nonzeroIdx.length) return details;
    var groups = {};
    nonzeroIdx.forEach(function (i) { groups[i] = { entry: details[i], before: [], after: [] }; });
    details.forEach(function (d, i) {
      if (d.amount !== null && d.amount !== 0) return;
      var nearest = nonzeroIdx[0], bestDist = Math.abs(i - nonzeroIdx[0]);
      nonzeroIdx.forEach(function (ni) {
        var dist = Math.abs(i - ni);
        if (dist < bestDist) { bestDist = dist; nearest = ni; }
      });
      (i < nearest ? groups[nearest].before : groups[nearest].after).push(d);
    });
    return nonzeroIdx.map(function (i) {
      var g = groups[i];
      var textParts = g.before.map(function (d) { return d.text; })
        .concat([g.entry.text])
        .concat(g.after.map(function (d) { return d.text; }))
        .filter(Boolean);
      var date = g.entry.date || g.before.concat(g.after).map(function (d) { return d.date; }).filter(Boolean)[0] || "";
      return { date: date, text: textParts.join(" ").replace(/\s+/g, " ").trim(), amount: g.entry.amount };
    });
  }

  function extractFinancialsDetailLines(rawLines, categoryName) {
    var lines = rawLines.filter(function (l) { return l && l.trim() && l.trim() !== categoryName.trim(); });
    var details = lines.map(function (l) {
      var dateMatch = l.match(FINANCIALS_DETAIL_DATE_RE);
      var moneyMatches = l.match(FINANCIALS_DETAIL_MONEY_RE);
      var amount = null;
      var text = l;
      if (moneyMatches && moneyMatches.length) {
        var amountTok = moneyMatches[moneyMatches.length - 1];
        amount = financialsPdfAmount(amountTok);
        text = text.replace(new RegExp("\\s*" + amountTok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*"), " ");
      }
      if (dateMatch) text = text.replace(dateMatch[0], " ");
      text = text.replace(/\s+/g, " ").replace(/^[\s,-]+|[\s,-]+$/g, "").trim();
      return { date: dateMatch ? dateMatch[0] : "", text: text, amount: amount };
    });
    return mergeFinancialsZeroDetails(details);
  }

  // Walks the extracted lines, returns { categories: [{category, debit,
  // credit, details}], grandTotal: {debit, credit} | null }. "details" is
  // every line printed between this category's header and its own "Total
  // ..." row, for the review screen's per-category expand.
  function extractFinancialsCategories(lines) {
    var categories = [];
    var grandTotal = null;
    var sectionStart = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf("Total ") !== 0) continue;
      var rest = line.slice(6).trim();
      var parsed = splitFinancialsTotalLine(rest);
      if (parsed) {
        if (parsed.grand) {
          grandTotal = { debit: parsed.debit, credit: parsed.credit };
        } else if (parsed.single != null) {
          categories.push({ category: parsed.category, debit: parsed.single, credit: 0, details: extractFinancialsDetailLines(lines.slice(sectionStart, i), parsed.category) });
        } else {
          categories.push({ category: parsed.category, debit: parsed.debit, credit: parsed.credit, details: extractFinancialsDetailLines(lines.slice(sectionStart, i), parsed.category) });
        }
        sectionStart = i + 1;
        continue;
      }
      var next = lines[i + 1] || "";
      var nextMatch = next.match(FINANCIALS_PDF_NEXTLINE_RE);
      if (nextMatch) {
        categories.push({ category: rest, debit: financialsPdfAmount(nextMatch[1]), credit: financialsPdfAmount(nextMatch[2]), details: extractFinancialsDetailLines(lines.slice(sectionStart, i), rest) });
        i++; // consume the line the numbers came from
        sectionStart = i + 1;
      }
      // else: an unparseable "Total ..." line is silently skipped — the
      // review step below still shows the grand total for a sanity check
      // against whatever categories WERE found.
    }
    return { categories: categories, grandTotal: grandTotal };
  }

  // Reads the uploaded File, extracts + parses it, and appends every category
  // it found straight onto the Financials tab's list (no separate review
  // step — this lands directly back on the tab, already saved, where every
  // field is editable and any category can just be deleted if unwanted).
  // Each category becomes one line item: net = debit - credit; net > 0 is an
  // expense of that amount, net < 0 is income of the (positive) difference —
  // the same "what actually happened financially" framing this tab's own
  // Income/Expense split uses elsewhere, since a category can legitimately
  // carry both a debit and a credit (e.g. cash pulled for a change fund,
  // then redeposited after the show).
  //
  // REPLACES the whole list rather than adding to it — re-uploading the same
  // (or a corrected) report shouldn't double every category. Anyone who
  // wants the current list kept around first should use "Save Report".
  function handleFinancialsPdfUpload(file) {
    if (!file) return;
    if (state.financials.length && !window.confirm(
      "This will REPLACE the " + state.financials.length + " line item" + (state.financials.length === 1 ? "" : "s") +
      " currently on this tab with what's found in the PDF. Use \"Save Report\" first if you want to keep a copy of the current list. Continue?"
    )) return;
    state.financialsUploadParsing = true;
    state.financialsUploadError = null;
    renderViews();
    file.arrayBuffer().then(function (buf) {
      return extractPdfLines(buf);
    }).then(function (lines) {
      var parsed = extractFinancialsCategories(lines);
      if (!parsed.categories.length) {
        state.financialsUploadParsing = false;
        state.financialsUploadError = "Could not find any category totals in that PDF — it may not be in the expected \"Account Transactions\" report format.";
        renderViews();
        return;
      }
      var toAdd = parsed.categories.map(function (c, idx) {
        var net = Math.round((c.debit - c.credit) * 100) / 100;
        return {
          id: "fin" + Date.now().toString(36) + idx + Math.random().toString(36).slice(2, 6),
          category: cleanFinancialsCategoryName(c.category),
          type: net >= 0 ? "expense" : "income",
          amount: Math.abs(net),
          notes: "",
          details: c.details || []
        };
      });
      state.financialsUploadParsing = false;
      // An import always lands on the OPEN show's financials, then drops
      // straight into the editor showing what it just brought in.
      state.financials = toAdd;
      state.financialsSource = { kind: "live", year: financialsCurrentYear() };
      state.financialsAllLoaded = false;
      state.financialsEditItems = toAdd;
      state.financialsProjecting = false;
      state.financialsScreen = "editor";
      saveFinancialsImmediate(toAdd);
    }).catch(function (err) {
      state.financialsUploadParsing = false;
      state.financialsUploadError = "Could not read that PDF: " + (err && err.message ? err.message : err);
      renderViews();
    });
  }

  // The OPEN show's year — the default target for anything that doesn't name
  // one (the import, the initial load), and what tells a save whether it's
  // writing this show's financials or some past show's.
  function financialsCurrentYear() {
    return state.currentShow ? String(state.currentShow.year) : "";
  }

  // Every show's financials and saved reports in one request, for the
  // View/Project picker.
  function loadFinancialsAll() {
    if (!SITE_CONFIG.financialsApiUrl) return;
    state.financialsAllLoading = true;
    state.financialsAllError = null;
    renderViews();
    fetch(SITE_CONFIG.financialsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list_all" })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.financialsAllLoading = false;
        state.financialsAllLoaded = true;
        if (r.ok && r.data && r.data.ok) {
          state.financialsAll = r.data.shows || [];
        } else {
          state.financialsAllError = "Could not load the list of shows' financials.";
        }
        renderViews();
      }).catch(function () {
        state.financialsAllLoading = false;
        state.financialsAllLoaded = true;
        state.financialsAllError = "Could not load the list of shows' financials — check your connection.";
        renderViews();
      });
  }

  function loadFinancials() {
    if (!SITE_CONFIG.financialsApiUrl) return;
    state.financialsLoading = true;
    state.financialsError = null;
    renderViews();
    fetch(SITE_CONFIG.financialsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list", year: financialsCurrentYear() })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.financialsLoading = false;
        state.financialsLoaded = true;
        if (r.ok && r.data && r.data.ok) {
          state.financials = r.data.items || [];
          if (state.financialsSource.kind === "live" && state.financialsSource.year === financialsCurrentYear()) {
            state.financialsEditItems = state.financials;
          }
        } else {
          state.financialsError = "Could not load financials.";
        }
        renderViews();
      }).catch(function () {
        state.financialsLoading = false;
        state.financialsLoaded = true;
        state.financialsError = "Could not load financials — check your connection.";
        renderViews();
      });
  }

  // Saves the WHOLE current list immediately (no debounce) — used by "Import
  // Selected" (one deliberate click, not typing) and wrapped by the debounced
  // saveFinancials() below (used by the row inputs' own blur/change, where
  // fast typing shouldn't fire a request per keystroke). Re-renders on
  // completion to drop any blank row the server discarded (see
  // financials.php's own "blank category isn't saved" rule) and to refresh
  // the Total.
  function saveFinancialsImmediate(items) {
    if (!SITE_CONFIG.financialsApiUrl) return;
    state.financialsSaving = true;
    state.financialsSaved = false;
    state.financialsError = null;
    renderViews();
    fetch(SITE_CONFIG.financialsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", items: items, year: state.financialsSource.year || financialsCurrentYear() })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.financialsSaving = false;
        if (r.ok && r.data && r.data.ok) {
          var saved = r.data.items || [];
          // Only the OPEN show's list is mirrored into state.financials —
          // editing a past show's financials must not overwrite it.
          if ((state.financialsSource.year || financialsCurrentYear()) === financialsCurrentYear()) {
            state.financials = saved;
          }
          state.financialsEditItems = saved;
          state.financialsSaved = true;
        } else {
          state.financialsError = "Could not save — please try again.";
        }
        renderViews();
      }).catch(function () {
        state.financialsSaving = false;
        state.financialsError = "Could not save — check your connection.";
        renderViews();
      });
  }
  // Read straight off the DOM (every row's current input values) rather than
  // kept in sync in state.financials on every keystroke, same "read at save
  // time" pattern the Sponsor Type/shirt-size rows use elsewhere.
  var saveFinancials = debounce(saveFinancialsImmediate, 1200);

  // Writes one saved snapshot's edited items back over itself (financials.php's
  // update_report), for the View/Project screens when the thing on screen came
  // from the report history rather than from this show's live financials.
  function saveFinancialsReportItemsImmediate(items) {
    var source = state.financialsSource;
    if (!SITE_CONFIG.financialsApiUrl || source.kind !== "report") return;
    state.financialsSaving = true;
    state.financialsSaved = false;
    state.financialsError = null;
    renderViews();
    fetch(SITE_CONFIG.financialsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_report", id: source.id, items: items, year: source.year || financialsCurrentYear() })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.financialsSaving = false;
        if (r.ok && r.data && r.data.ok) {
          state.financialsEditItems = r.data.items || [];
          state.financialsAllLoaded = false; // picker counts are stale now
          state.financialsSaved = true;
        } else {
          state.financialsError = (r.data && r.data.error) || "Could not save — please try again.";
        }
        renderViews();
      }).catch(function () {
        state.financialsSaving = false;
        state.financialsError = "Could not save — check your connection.";
        renderViews();
      });
  }
  var saveFinancialsReportItems = debounce(saveFinancialsReportItemsImmediate, 1200);

  // The editor's one save path, whichever source it's showing.
  function saveFinancialsEdits(items) {
    if (state.financialsSource.kind === "report") saveFinancialsReportItems(items);
    else saveFinancials(items);
  }

  // ---- Saved reports ("Save Report") ----
  // A named, timestamped snapshot of whatever the editor currently has open,
  // filed under that same show year. Saving one doesn't touch what's on
  // screen — it just adds another entry to the View/Project picker.
  function saveFinancialsReport() {
    if (!SITE_CONFIG.financialsApiUrl || state.financialsSavingReport) return;
    var items = financialsShownItems();
    if (!items.length) return;
    var label = window.prompt("Name this saved report (e.g. \"After ClubExpress import\"):", "");
    if (label === null) return; // cancelled
    label = label.trim() || ("Report — " + new Date().toLocaleString());
    state.financialsSavingReport = true;
    renderViews();
    fetch(SITE_CONFIG.financialsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_report", items: items, label: label,
        year: state.financialsSource.year || financialsCurrentYear()
      })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        state.financialsSavingReport = false;
        if (r.ok && r.data && r.data.ok) {
          state.financialsAllLoaded = false; // the picker has a new entry to pick up
        } else {
          state.financialsError = (r.data && r.data.error) || "Could not save report.";
        }
        renderViews();
      }).catch(function () {
        state.financialsSavingReport = false;
        state.financialsError = "Could not save report — check your connection.";
        renderViews();
      });
  }

  // Deleting the snapshot that's currently open in the editor drops back to
  // the picker rather than leaving an editor pointed at something gone.
  function deleteFinancialsReport(year, id) {
    if (!SITE_CONFIG.financialsApiUrl) return;
    if (!window.confirm("Delete this saved report? This cannot be undone.")) return;
    fetch(SITE_CONFIG.financialsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_report", id: id, year: year })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        if (r.ok && r.data && r.data.ok) {
          if (state.financialsSource.kind === "report" && state.financialsSource.id === id) {
            state.financialsScreen = "picker";
            state.financialsSource = { kind: "live", year: financialsCurrentYear() };
            state.financialsEditItems = state.financials;
          }
          loadFinancialsAll();
          return;
        }
        state.financialsAllError = (r.data && r.data.error) || "Could not delete that report.";
        renderViews();
      }).catch(function () {
        state.financialsAllError = "Could not delete that report — check your connection.";
        renderViews();
      });
  }

  // ---- Print / Export ----
  // Same "clone what's on screen into #printHost" pattern printSummaryReport()
  // uses — a plain read-only Income/Expense table, since the live editable
  // rows (inputs, ✕ buttons) have no business on a printed page.
  // The bottom-line summary, as a table: one row per figure (Income,
  // Expenses, Net Profit/Loss) against Actual, and in Project mode also
  // Projected and the percentage difference between them. Shared by the
  // on-screen editor and the printed copy so the two can't drift.
  // A % difference off a zero actual is undefined, not 0% or infinity — it
  // prints as "—".
  function financialsPctDiff(actual, projected) {
    if (!actual) return "—";
    var pct = ((projected - actual) / Math.abs(actual)) * 100;
    return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
  }
  function buildFinancialsTotalsTable(income, expense, projectedIncome, projectedExpense, projecting) {
    var net = income - expense;
    var projectedNet = projectedIncome - projectedExpense;
    var head = [el("th", { style: "text-align:left; padding:2px 10px 2px 0", text: "Description" }),
      el("th", { style: "text-align:right; padding:2px 10px", text: "Actual" })];
    if (projecting) {
      head.push(el("th", { style: "text-align:right; padding:2px 10px", text: "Projected" }));
      head.push(el("th", { style: "text-align:right; padding:2px 0 2px 10px", text: "% Diff" }));
    }
    function row(label, actual, projected, color) {
      var style = "font-weight:700; font-size:15px" + (color ? "; color:" + color : "");
      var cells = [
        el("td", { style: style + "; padding:2px 10px 2px 0", text: label }),
        el("td", { style: style + "; text-align:right; padding:2px 10px", text: fmtMoney(actual) })
      ];
      if (projecting) {
        cells.push(el("td", { style: style + "; text-align:right; padding:2px 10px", text: fmtMoney(projected) }));
        cells.push(el("td", { style: style + "; text-align:right; padding:2px 0 2px 10px", text: financialsPctDiff(actual, projected) }));
      }
      return el("tr", {}, cells);
    }
    return el("table", { class: "financials-totals-table", style: "border-collapse:collapse" }, [
      el("thead", {}, [el("tr", {}, head)]),
      el("tbody", {}, [
        row("Income", income, projectedIncome, null),
        row("Expenses", expense, projectedExpense, null),
        row("Net Profit/Loss", net, projectedNet, net >= 0 ? "var(--good)" : "var(--warn)")
      ])
    ]);
  }

  // Both act on whatever the editor currently has open (this show's live
  // financials or a saved report), and carry the Projected column only when
  // it's actually in play.
  function printFinancials() {
    var shown = financialsShownItems();
    var projecting = state.financialsProjecting;
    var totalIncome = 0, totalExpense = 0, projectedIncome = 0, projectedExpense = 0;
    shown.forEach(function (item) {
      var amount = Number(item.amount) || 0;
      var projected = item.projected == null ? amount : Number(item.projected) || 0;
      if (item.type === "income") { totalIncome += amount; projectedIncome += projected; }
      else { totalExpense += amount; projectedExpense += projected; }
    });
    // Each category prints with its own transaction lines indented beneath
    // it, so a printed copy carries the same detail the on-screen expand
    // does rather than just the category subtotals.
    function table(title, items) {
      var head = [el("th", { style: "text-align:left", text: "Category" }), el("th", { style: "text-align:right", text: "Amount" })];
      if (projecting) head.push(el("th", { style: "text-align:right", text: "Projected" }));
      var colSpan = projecting ? 3 : 2;
      var rows = [];
      items.forEach(function (item) {
        var amount = Number(item.amount) || 0;
        var cells = [
          el("td", { style: "font-weight:600", text: item.category }),
          el("td", { style: "text-align:right; font-weight:600", text: fmtMoney(amount) })
        ];
        if (projecting) {
          cells.push(el("td", { style: "text-align:right; font-weight:600", text: fmtMoney(item.projected == null ? amount : Number(item.projected) || 0) }));
        }
        rows.push(el("tr", {}, cells));
        (item.details || []).forEach(function (d) {
          var label = [d.date || "", d.text || ""].filter(Boolean).join(" — ");
          var detailCells = [
            el("td", { style: "padding-left:18px; font-size:11px", text: label }),
            el("td", { style: "text-align:right; font-size:11px", text: d.amount == null ? "" : fmtMoney(d.amount) })
          ];
          if (projecting) detailCells.push(el("td", {}));
          rows.push(el("tr", {}, detailCells));
        });
      });
      return el("div", { style: "flex:1 1 320px" }, [
        el("h4", { text: title }),
        el("table", { style: "width:100%; border-collapse:collapse" }, [
          el("thead", {}, [el("tr", {}, head)]),
          el("tbody", {}, rows.length ? rows : [el("tr", {}, [el("td", { colspan: String(colSpan), text: "None" })])])
        ])
      ]);
    }
    var totals = [buildFinancialsTotalsTable(totalIncome, totalExpense, projectedIncome, projectedExpense, projecting)];
    var host = $("#printHost");
    host.innerHTML = "";
    host.appendChild(buildPrintHeader((projecting ? "Projected Financials — " : "Financials — ") + financialsSourceLabel()));
    host.appendChild(el("div", { class: "panel" }, [
      el("div", { style: "display:flex; gap:24px; flex-wrap:wrap" }, [
        table("Income", shown.filter(function (i) { return i.type === "income"; })),
        table("Expenses", shown.filter(function (i) { return i.type !== "income"; }))
      ]),
      el("div", { style: "margin-top:14px; padding-top:14px; border-top:1px solid var(--line)" }, totals)
    ]));
    host.appendChild(buildPrintFooter());
    window.print();
  }

  // One row per category, each followed by its own transaction detail rows
  // (a leading Level column says which is which, so the file is still
  // sortable/filterable once it's in a spreadsheet).
  function exportFinancialsCsv() {
    var shown = financialsShownItems();
    if (!shown.length) return;
    var projecting = state.financialsProjecting;
    var header = ["Level", "Category / Description", "Date", "Type", "Amount"];
    if (projecting) header.push("Projected");
    header.push("Notes");
    var lines = [header.map(csvField).join(",")];
    var totalIncome = 0, totalExpense = 0, projectedIncome = 0, projectedExpense = 0;
    shown.forEach(function (item) {
      var amount = Number(item.amount) || 0;
      var projected = item.projected == null ? amount : Number(item.projected) || 0;
      if (item.type === "income") { totalIncome += amount; projectedIncome += projected; }
      else { totalExpense += amount; projectedExpense += projected; }
      var cells = ["Category", item.category, "", item.type === "income" ? "Income" : "Expense", fmtMoney(amount)];
      if (projecting) cells.push(fmtMoney(projected));
      cells.push(item.notes || "");
      lines.push(cells.map(csvField).join(","));
      (item.details || []).forEach(function (d) {
        var detailCells = ["Detail", d.text || "", d.date || "", "", d.amount == null ? "" : fmtMoney(d.amount)];
        if (projecting) detailCells.push("");
        detailCells.push("");
        lines.push(detailCells.map(csvField).join(","));
      });
    });
    function totalLine(label, value) {
      var cells = ["Total", label, "", "", fmtMoney(value)];
      if (projecting) cells.push("");
      cells.push("");
      return cells.map(csvField).join(",");
    }
    lines.push("");
    lines.push(totalLine("Total Income", totalIncome));
    lines.push(totalLine("Total Expenses", totalExpense));
    lines.push(totalLine("Net Profit/Loss", totalIncome - totalExpense));
    if (projecting) {
      lines.push(totalLine("Projected Income", projectedIncome));
      lines.push(totalLine("Projected Expenses", projectedExpense));
      lines.push(totalLine("Projected Net Profit/Loss", projectedIncome - projectedExpense));
    }
    downloadTextFile("car-show-financials.csv", lines.join("\n"), "text/csv");
  }

  // Whatever the editor currently has open — what Print/Export/Save Report
  // all act on, whichever of the two sources it came from.
  function financialsShownItems() {
    return state.financialsEditItems || [];
  }

  function financialsSourceLabel(source) {
    source = source || state.financialsSource;
    var year = source.year || financialsCurrentYear();
    if (source.kind === "report") return "Car Show " + year + " — " + (source.label || "Saved report");
    return "Car Show " + year;
  }

  function openFinancialsEditor(source, items, projecting) {
    if (!source.year) source.year = financialsCurrentYear();
    state.financialsSource = source;
    state.financialsEditItems = items || [];
    state.financialsProjecting = !!projecting;
    state.financialsExpandedIds = {};
    state.financialsScreen = "editor";
    state.financialsError = null;
    state.financialsSaved = false;
    renderViews();
  }

  function buildFinancialsView() {
    if (state.financialsLoading && !state.financialsLoaded) {
      return el("div", { class: "view" }, [el("div", { class: "panel" }, [el("div", { class: "hint" }, ["Loading…"])])]);
    }
    if (state.financialsScreen === "picker") {
      return el("div", { class: "view financials-view" }, [buildFinancialsPicker()]);
    }
    if (state.financialsScreen === "editor") {
      return el("div", { class: "view financials-view" }, [buildFinancialsEditor()]);
    }
    return el("div", { class: "view financials-view" }, [buildFinancialsMenu()]);
  }

  // The tab's landing screen: Import / View / Project. Import goes straight
  // to the file picker (and on to the editor once the PDF is parsed); the
  // other two go to buildFinancialsPicker() to choose WHICH financials.
  function buildFinancialsMenu() {
    var uploadInput = el("input", { type: "file", accept: "application/pdf,.pdf", style: "display:none" });
    uploadInput.addEventListener("change", function () {
      if (uploadInput.files && uploadInput.files[0]) handleFinancialsPdfUpload(uploadInput.files[0]);
      uploadInput.value = ""; // so re-selecting the same file still fires "change"
    });

    function choice(title, desc, onClick, disabled) {
      var btn = el("button", {
        type: "button", class: "btn",
        style: "display:block; width:100%; text-align:left; padding:12px 14px; margin-bottom:10px"
      }, [
        el("div", { style: "font-weight:700; font-size:15px", text: title }),
        el("div", { class: "hint", style: "margin-top:2px", text: desc })
      ]);
      if (disabled) btn.setAttribute("disabled", "disabled");
      else btn.addEventListener("click", onClick);
      return btn;
    }

    function openPicker(mode) {
      state.financialsPickerMode = mode;
      state.financialsScreen = "picker";
      loadFinancialsAll(); // always refetched — a save may have changed the counts
    }

    var kids = [
      el("h3", { text: "Financials" }),
      el("div", { class: "hint", style: "margin-bottom:14px" }, [
        "This show's income/expense summary — import it from the club's accounting export, " +
        "open one to view and edit, or build projections against one."
      ]),
      choice(
        state.financialsUploadParsing ? "📄 Import Financials — reading…" : "📄 Import Financials",
        "Upload the club's \"Account Transactions\" PDF export. Its categories, totals and " +
        "transaction detail REPLACE this show's financials, then open for editing.",
        function () { uploadInput.click(); },
        state.financialsUploadParsing
      ),
      choice("📋 View Financials",
        "Pick this show's financials or any saved report, then view and edit it.",
        function () { openPicker("view"); }),
      choice("📈 Project Financials",
        "Pick this show's financials or any saved report and enter projected amounts beside " +
        "the real ones. The actual figures stay read-only.",
        function () { openPicker("project"); }),
      uploadInput
    ];
    if (state.financialsError) kids.push(el("div", { class: "form-error" }, [state.financialsError]));
    if (state.financialsUploadError) kids.push(el("div", { class: "form-error" }, [state.financialsUploadError]));
    return el("div", { class: "panel" }, kids);
  }

  // "Which financials?" — EVERY show year's live list plus each of its saved
  // reports, newest show first, shared by both View and Project
  // (state.financialsPickerMode says which, and that's what decides whether
  // the editor opens read-only-with-projections or fully editable).
  function buildFinancialsPicker() {
    var projecting = state.financialsPickerMode === "project";
    var currentYear = financialsCurrentYear();
    var backBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["← Back"]);
    backBtn.addEventListener("click", function () { state.financialsScreen = "menu"; renderViews(); });

    function entry(label, sub, onOpen, onDelete) {
      var openBtn = el("button", {
        type: "button", class: "btn",
        style: "flex:1 1 auto; text-align:left; padding:10px 12px"
      }, [
        el("div", { style: "font-weight:600", text: label }),
        el("div", { class: "hint", style: "margin-top:2px", text: sub })
      ]);
      openBtn.addEventListener("click", onOpen);
      var kids = [openBtn];
      if (onDelete) {
        var delBtn = el("button", { type: "button", class: "btn", title: "Delete this saved report", style: "padding:4px 10px; flex:0 0 auto" }, ["✕"]);
        delBtn.addEventListener("click", onDelete);
        kids.push(delBtn);
      }
      return el("div", { style: "display:flex; gap:6px; align-items:stretch; margin-bottom:8px" }, kids);
    }

    var kids = [
      el("h3", { text: projecting ? "Project Financials" : "View Financials" }),
      el("div", { class: "hint", style: "margin-bottom:12px" }, [
        projecting
          ? "Pick which show's financials to project from — any year, or any saved report. Its real figures open read-only, with an editable Projected amount beside each one."
          : "Pick which show's financials to open — any year, or any saved report. Edits save automatically, back to whichever one you picked."
      ])
    ];

    if (state.financialsAllLoading && !state.financialsAllLoaded) {
      kids.push(el("div", { class: "hint" }, ["Loading…"]));
    } else if (state.financialsAllError) {
      kids.push(el("div", { class: "form-error" }, [state.financialsAllError]));
    } else if (!state.financialsAll.length) {
      kids.push(el("div", { class: "hint" }, ["No car shows found."]));
    } else {
      state.financialsAll.slice().sort(function (a, b) {
        return String(b.year).localeCompare(String(a.year));
      }).forEach(function (show) {
        var year = String(show.year);
        var items = show.items || [];
        var reports = (show.reports || []).slice().sort(function (a, b) {
          return (b.savedAt || "").localeCompare(a.savedAt || "");
        });
        kids.push(el("h4", { style: "margin:14px 0 6px", text: "Car Show " + year + (year === currentYear ? " (open show)" : "") }));
        kids.push(entry(
          "Car Show " + year,
          items.length + " line item" + (items.length === 1 ? "" : "s") + " — this show's financials",
          function () { openFinancialsEditor({ kind: "live", year: year }, items, projecting); },
          null
        ));
        reports.forEach(function (r) {
          var when = r.savedAt ? new Date(r.savedAt).toLocaleString() : "";
          var count = (r.items || []).length;
          kids.push(entry(
            r.label || "Report",
            when + " — " + count + " line item" + (count === 1 ? "" : "s") + " (saved report)",
            function () {
              openFinancialsEditor({ kind: "report", id: r.id, label: r.label, year: year }, (r.items || []).slice(), projecting);
            },
            function () { deleteFinancialsReport(year, r.id); }
          ));
        });
      });
    }

    kids.push(el("div", { class: "settings-actions", style: "margin-top:12px" }, [backBtn]));
    return el("div", { class: "panel" }, kids);
  }

  function buildFinancialsEditor() {
    var items = financialsShownItems();
    var projecting = state.financialsProjecting;
    var datalist = el("datalist", { id: "financialsCategoryList" },
      FINANCIALS_SUGGESTED_CATEGORIES.map(function (c) { return el("option", { value: c }); }));

    // Two-column income-statement layout — a row's column IS its type (see
    // addRow), so there's no type control on the row itself.
    var incomeWrap = el("div", {});
    var expenseWrap = el("div", {});
    var totalIncome = 0, totalExpense = 0;

    // Reads every row currently in the DOM (in display order, income column
    // then expense column) and saves — shared by every field's blur/change
    // and by the ✕ remove button, so "remove a row" and "edit a row" go
    // through the exact same save path.
    function collectAndSave() {
      var rows = Array.prototype.slice.call(incomeWrap.querySelectorAll(".financials-row"))
        .concat(Array.prototype.slice.call(expenseWrap.querySelectorAll(".financials-row")));
      var collected = rows.map(function (row) {
        var projectedInput = row.querySelector(".financials-projected");
        return {
          id: row.getAttribute("data-id") || "",
          category: row.querySelector(".financials-category").value.trim(),
          type: row.getAttribute("data-type") === "income" ? "income" : "expense",
          amount: Number(row.querySelector(".financials-amount").value) || 0,
          notes: row._notes || "",
          details: row._details || [],
          projected: projectedInput
            ? (projectedInput.value === "" ? null : (Number(projectedInput.value) || 0))
            : (row._projected == null ? null : row._projected)
        };
      }).filter(function (item) { return item.category !== ""; });
      state.financialsEditItems = collected;
      saveFinancialsEdits(collected);
    }

    function addRow(item) {
      item = item || { id: "", category: "", type: "expense", amount: "", notes: "", details: [], projected: null };
      var hasId = !!item.id;
      var expanded = hasId && !!state.financialsExpandedIds[item.id];

      var toggleBtn = el("button", { type: "button", class: "btn", style: "padding:4px 8px; flex:0 0 auto; font-size:12px" },
        [expanded ? "▾" : "▸"]);
      if (!hasId) toggleBtn.setAttribute("disabled", "disabled");
      toggleBtn.addEventListener("click", function () {
        state.financialsExpandedIds[item.id] = !state.financialsExpandedIds[item.id];
        renderViews();
      });

      // flex-basis 0 with a big flex-grow (rather than a fixed width) so this
      // field claims whatever room the row has instead of clipping long
      // category names; the title attribute mirrors the value so a name
      // still too long for the field is readable on hover.
      var categoryInput = el("input", { type: "text", value: item.category || "", title: item.category || "", list: "financialsCategoryList", placeholder: "Category", style: "flex:3 1 0; min-width:0" });
      categoryInput.addEventListener("input", function () { categoryInput.title = categoryInput.value; });
      var amountField = moneyInput({ value: item.amount === "" ? "" : String(item.amount) });
      amountField.wrap.style.flex = "0 0 130px";
      categoryInput.className = "financials-category";
      amountField.input.className = "financials-amount";
      // Type is fixed by which column (Income/Expense) a row sits in — no
      // dropdown, no move button; a category that's really the other type
      // gets deleted and re-added with "+ Add Line" in that column.
      var removeBtn = el("button", { type: "button", class: "btn", title: "Remove this line", style: "padding:4px 10px; flex:0 0 auto" }, ["✕"]);
      // Project mode: everything that describes what actually happened is
      // locked, and a Projected figure sits beside the real one as the only
      // editable thing on the row.
      var projectedField = null;
      if (projecting) {
        categoryInput.setAttribute("disabled", "disabled");
        amountField.input.setAttribute("disabled", "disabled");
        projectedField = moneyInput({ value: item.projected == null ? "" : String(item.projected), placeholder: "Projected" });
        projectedField.wrap.style.flex = "0 0 130px";
        projectedField.input.className = "financials-projected";
        projectedField.input.addEventListener("blur", collectAndSave);
        projectedField.input.addEventListener("change", collectAndSave);
      }
      var rowKids = [toggleBtn, categoryInput, amountField.wrap];
      if (projectedField) rowKids.push(projectedField.wrap);
      else rowKids.push(removeBtn);
      var row = el("div", {
        class: "financials-row", style: "display:flex; gap:6px; align-items:center; margin-bottom:6px",
        "data-type": item.type === "income" ? "income" : "expense"
      }, rowKids);
      if (item.id) row.setAttribute("data-id", item.id);
      row._projected = item.projected == null ? null : Number(item.projected);
      // Notes has no input of its own anymore (dropped from the row), but
      // whatever was already saved there is kept round-tripping through
      // collectAndSave rather than being silently wiped on the next save.
      row._notes = item.notes || "";
      // Working copy of this category's transaction details — mutated in
      // place by the expand panel below and read back by collectAndSave, so
      // editing/adding/deleting a detail line saves through the same path as
      // every other field on this row.
      row._details = (item.details || []).map(function (d) { return { date: d.date || "", text: d.text || "", amount: d.amount }; });
      [categoryInput, amountField.input].forEach(function (input) {
        input.addEventListener("blur", collectAndSave);
        input.addEventListener("change", collectAndSave);
      });
      removeBtn.addEventListener("click", function () {
        row.parentNode.removeChild(row);
        if (row._detailsWrap && row._detailsWrap.parentNode) row._detailsWrap.parentNode.removeChild(row._detailsWrap);
        collectAndSave();
      });
      var targetWrap = item.type === "income" ? incomeWrap : expenseWrap;
      var emptyHint = targetWrap.querySelector(".financials-empty-hint");
      if (emptyHint) targetWrap.removeChild(emptyHint);
      targetWrap.appendChild(row);

      if (expanded) {
        var detailsWrap = el("div", { style: "margin:0 0 10px 34px; padding:6px 10px; background:var(--panel-alt, #f7f7f7); border-radius:4px" });
        row._detailsWrap = detailsWrap;
        function renderDetailRows() {
          detailsWrap.innerHTML = "";
          row._details.forEach(function (d, dIdx) {
            var dateInput = el("input", { type: "text", value: d.date || "", placeholder: "Date", style: "flex:0 0 100px; font-size:12px" });
            dateInput.addEventListener("input", function () { d.date = dateInput.value; });
            dateInput.addEventListener("blur", collectAndSave);
            var textInput = el("input", { type: "text", value: d.text || "", title: d.text || "", placeholder: "Description", style: "flex:1 1 0; min-width:0; font-size:12px" });
            textInput.addEventListener("input", function () { d.text = textInput.value; textInput.title = textInput.value; });
            textInput.addEventListener("blur", collectAndSave);
            var amtField = moneyInput({ value: d.amount != null ? String(d.amount) : "" });
            amtField.wrap.style.flex = "0 0 110px";
            amtField.input.addEventListener("input", function () { d.amount = amtField.input.value === "" ? null : (Number(amtField.input.value) || 0); });
            amtField.input.addEventListener("blur", collectAndSave);
            var delDetailBtn = el("button", { type: "button", class: "btn", title: "Remove this transaction line", style: "padding:2px 8px; flex:0 0 auto" }, ["✕"]);
            delDetailBtn.addEventListener("click", function () { row._details.splice(dIdx, 1); renderDetailRows(); collectAndSave(); });
            var detailKids = [dateInput, textInput, amtField.wrap];
            if (projecting) {
              [dateInput, textInput, amtField.input].forEach(function (i) { i.setAttribute("disabled", "disabled"); });
            } else {
              detailKids.push(delDetailBtn);
            }
            detailsWrap.appendChild(el("div", { style: "display:flex; gap:6px; align-items:center; padding:2px 0" }, detailKids));
          });
          if (!projecting) {
            var addDetailBtn = el("button", { type: "button", class: "btn", style: "font-size:11px; padding:2px 8px; margin-top:4px" }, ["+ Add Line Item"]);
            addDetailBtn.addEventListener("click", function () { row._details.push({ date: "", text: "", amount: null }); renderDetailRows(); });
            detailsWrap.appendChild(addDetailBtn);
          }
        }
        renderDetailRows();
        targetWrap.appendChild(detailsWrap);
      }
    }
    var totalProjectedIncome = 0, totalProjectedExpense = 0;
    items.forEach(addRow);
    items.forEach(function (item) {
      var amount = Number(item.amount) || 0;
      var projected = item.projected == null ? amount : Number(item.projected) || 0;
      if (item.type === "income") { totalIncome += amount; totalProjectedIncome += projected; }
      else { totalExpense += amount; totalProjectedExpense += projected; }
    });

    // Project mode: every other field on a row is disabled, so the default
    // Tab order would otherwise land on each row's (still-enabled) ▸ toggle
    // button in between — jump straight from one Projected field to the
    // next instead, in the same top-to-bottom-then-next-column reading
    // order the two columns are laid out in.
    if (projecting) {
      var projectedInputs = Array.prototype.slice.call(incomeWrap.querySelectorAll(".financials-projected"))
        .concat(Array.prototype.slice.call(expenseWrap.querySelectorAll(".financials-projected")));
      projectedInputs.forEach(function (input, idx) {
        input.addEventListener("keydown", function (e) {
          if (e.key !== "Tab") return;
          var target = idx + (e.shiftKey ? -1 : 1);
          if (target < 0 || target >= projectedInputs.length) return; // let Tab leave the table normally
          e.preventDefault();
          projectedInputs[target].focus();
          projectedInputs[target].select();
        });
      });
    }

    var backBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["← Back"]);
    backBtn.addEventListener("click", function () { state.financialsScreen = "menu"; renderViews(); });

    // Two Add buttons, not one — a row's column IS its type, so which button
    // you press is the only way to say which side a new category belongs on.
    function addLineBtn(label, type) {
      var btn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, [label]);
      btn.addEventListener("click", function () {
        addRow({ id: "", category: "", type: type, amount: "", notes: "", details: [], projected: null });
      });
      return btn;
    }

    var saveReportBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" },
      [state.financialsSavingReport ? "Saving…" : "💾 Save Report"]);
    if (state.financialsSavingReport || !items.length) saveReportBtn.setAttribute("disabled", "disabled");
    saveReportBtn.addEventListener("click", saveFinancialsReport);

    var printBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["🖨 Print"]);
    if (!items.length) printBtn.setAttribute("disabled", "disabled");
    printBtn.addEventListener("click", printFinancials);

    var exportBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["⬇ Export"]);
    if (!items.length) exportBtn.setAttribute("disabled", "disabled");
    exportBtn.addEventListener("click", exportFinancialsCsv);

    var saveStatus = [];
    if (state.financialsSaving) saveStatus.push(el("span", { class: "count" }, ["Saving…"]));
    else if (state.financialsSaved) saveStatus.push(el("span", { class: "count", style: "color:var(--good)" }, ["Saved."]));
    if (state.financialsError) saveStatus.push(el("div", { class: "form-error" }, [state.financialsError]));

    var kids = [
      el("h3", { text: (projecting ? "Projected: " : "") + financialsSourceLabel() }),
      el("div", { class: "hint", style: "margin-bottom:12px" }, [
        projecting
          ? "Every real figure below is read-only — type a what-if number in the Projected column beside it. " +
            "A category left blank projects at its actual amount. Projections save automatically, onto this " +
            "same " + (state.financialsSource.kind === "report" ? "saved report" : "show's financials") + "."
          : "Income and expense categories for " + financialsSourceLabel() + ". Expand a category (▸) to see " +
            "and edit the individual transactions behind it. Changes save automatically as you type, back to " +
            (state.financialsSource.kind === "report"
              ? "this saved report."
              : "Car Show " + (state.financialsSource.year || financialsCurrentYear()) + "'s own financials.")
      ]),
      datalist
    ];
    if (!items.length) {
      kids.push(el("div", { class: "hint", style: "margin-bottom:10px" }, ["No financial line items yet."]));
    }
    if (!incomeWrap.children.length) incomeWrap.appendChild(el("div", { class: "hint financials-empty-hint" }, ["None yet."]));
    if (!expenseWrap.children.length) expenseWrap.appendChild(el("div", { class: "hint financials-empty-hint" }, ["None yet."]));

    function column(title, color, wrap, actual, projected) {
      var heading = projecting
        ? title + " — actual " + fmtMoney(actual) + ", projected " + fmtMoney(projected)
        : title + " (" + fmtMoney(actual) + ")";
      var colKids = [el("h4", { style: "margin:0 0 8px; color:" + color, text: heading })];
      if (projecting) {
        colKids.push(el("div", { class: "hint", style: "display:flex; gap:6px; margin-bottom:4px" }, [
          el("span", { style: "flex:3 1 0; min-width:0; padding-left:34px", text: "Category" }),
          el("span", { style: "flex:0 0 130px", text: "Actual" }),
          el("span", { style: "flex:0 0 130px", text: "Projected" })
        ]));
      }
      colKids.push(wrap);
      return el("div", { style: "flex:1 1 360px; min-width:300px" }, colKids);
    }
    kids.push(el("div", { style: "display:flex; gap:24px; flex-wrap:wrap" }, [
      column("Income", "var(--good)", incomeWrap, totalIncome, totalProjectedIncome),
      column("Expenses", "var(--warn)", expenseWrap, totalExpense, totalProjectedExpense)
    ]));

    var actions = [backBtn];
    if (!projecting) actions.push(addLineBtn("+ Add Income", "income"), addLineBtn("+ Add Expense", "expense"));
    actions.push(saveReportBtn, printBtn, exportBtn);
    kids.push(el("div", { class: "settings-actions" }, actions.concat(saveStatus)));

    kids.push(el("div", { class: "financials-total", style: "margin-top:14px; padding-top:14px; border-top:1px solid var(--line)" }, [
      buildFinancialsTotalsTable(totalIncome, totalExpense, totalProjectedIncome, totalProjectedExpense, projecting)
    ]));

    return el("div", { class: "panel" }, kids);
  }

  // "❓ Instructions" next to an import button on the Setup tab — a static,
  // no-data modal documenting the exact ClubExpress steps to produce the CSV
  // that button expects, since those export paths are buried a few screens
  // deep in ClubExpress and aren't otherwise written down anywhere in this
  // app. One shared modal (state.importHelp holds which button opened it),
  // not a separate flag/render function per button.
  function openImportHelp(title, steps) { state.importHelp = { title: title, steps: steps }; renderImportHelp(); }
  function closeImportHelp() { state.importHelp = null; renderImportHelp(); }
  var MEMBER_IMPORT_STEPS = [
    "Control Panel",
    "People",
    "Additional Member Data",
    "Export Answers",
    "Export",
    'Save the download as "answers.csv"'
  ];
  var REGISTRATION_IMPORT_STEPS = [
    "Select the event",
    "Admin Options",
    "Exports",
    "Registration Data",
    "Export",
    'Save the download as "registration_data.csv"',
    "Exports",
    "Activity Registrant Data",
    "Export",
    'Save the download as "activity_registrant_data.csv"'
  ];
  function renderImportHelp() {
    var host = $("#importHelpHost");
    if (!host) return;
    host.innerHTML = "";
    var help = state.importHelp;
    if (!help) return;

    var closeBtn = el("button", { class: "btn" }, ["✕"]);
    closeBtn.addEventListener("click", closeImportHelp);
    var head = el("div", { class: "modal-head" }, [
      el("h3", { text: help.title }),
      el("span", { class: "spacer" }), closeBtn
    ]);

    var stepsList = el("ol", { style: "margin:0; padding-left: 20px; line-height: 1.8" },
      help.steps.map(function (step) { return el("li", { text: step }); }));

    var doneBtn = el("button", { class: "btn primary" }, ["Got it"]);
    doneBtn.addEventListener("click", closeImportHelp);

    var body = el("div", { class: "modal-body" }, [
      el("p", {}, ["In ClubExpress:"]),
      stepsList,
      el("p", { style: "margin-top: 14px" }, ["Then come back here and use the matching Import button above to upload that file."]),
      el("div", { class: "settings-actions" }, [doneBtn])
    ]);

    var modal = el("div", { class: "modal" }, [head, body]);
    modal.addEventListener("click", function (e) { e.stopPropagation(); });
    var backdrop = el("div", { class: "modal-backdrop" }, [modal]);
    backdrop.addEventListener("click", closeImportHelp);
    host.appendChild(backdrop);
  }

  // ---------- Car Show Summary Report (print) ----------
  // Reuses buildSummaryView() verbatim (the same panels the Summary tab
  // shows on screen), cloned into #printHost, so this report can never drift
  // out of sync with what the Summary tab actually displays.
  function printSummaryReport() {
    if (!state.result || !state.result.ok) return;
    var host = $("#printHost");
    host.innerHTML = "";
    host.appendChild(buildPrintHeader("Car Show Summary Report"));
    host.appendChild(buildSummaryView());
    host.appendChild(buildPrintFooter());
    window.print();
  }

  // Registration/Member/T-Shirt Report column definitions and row sources —
  // see the generic report builder (GenReport* functions) below
  // printSponsorReport()/buildSponsorReportPreview()'s own screen, this is
  // the same "preview + pick columns/sort" builder generalized so it isn't
  // reimplemented three more times, applied to the three reports that used
  // to print a fixed set of columns straight to the browser's print dialog.
  var REG_REPORT_ALL_COLS = [
    { key: "Last Name", label: "Last Name" },
    { key: "First Name", label: "First Name" },
    { key: "Spouse First Name", label: "Spouse" },
    { key: "Reg #", label: "Reg #" },
    { key: "Reg Date", label: "Reg Date" },
    { key: "Status", label: "Status" },
    { key: "Email", label: "Email" },
    { key: "Phone", label: "Phone" },
    { key: "Address", label: "Address" },
    { key: "City", label: "City" },
    { key: "State", label: "State" },
    { key: "Zip", label: "Zip" },
    { key: "Year", label: "Year" },
    { key: "Model", label: "Model" },
    { key: "shirts", label: "Shirts", cls: "shirtsum" }
  ];
  // Shared by the Registration and T-Shirt reports — both read the same
  // ClubExpress CSV row shape.
  function regRowFieldText(r, key) {
    if (key === "shirts") return shirtSummaryText(r);
    if (key === "Phone") return fmtPhone(r["Phone"]) || "";
    if (key === "Reg Date") return r["Reg Date"] ? fmtCsvDate(r["Reg Date"]) : "";
    var v = r[key];
    return v == null ? "" : String(v);
  }
  function regRowSortValue(r, key) {
    if (key === "Reg Date") {
      var d = r["Reg Date"] ? new Date(r["Reg Date"]) : null;
      return d && !isNaN(d.getTime()) ? d.getTime() : -Infinity;
    }
    return regRowFieldText(r, key).toLowerCase();
  }
  var REG_REPORT_SPEC = {
    id: "reg",
    title: "Registration Report",
    allCols: REG_REPORT_ALL_COLS,
    defaultKeys: ["Last Name", "First Name", "Reg #", "shirts"],
    defaultSortKey: "Last Name",
    emptyText: "No registrations to report yet.",
    getRows: function () { return visibleRows(); },
    cellText: regRowFieldText,
    sortValue: regRowSortValue
  };

  var MEMBER_REPORT_ALL_COLS = [
    { key: "lastName", label: "Last Name" },
    { key: "firstName", label: "First Name" },
    { key: "memberNumber", label: "Reg #" }
  ];
  function memberRowFieldText(m, key) {
    var v = m[key];
    return v == null ? "" : String(v);
  }
  function memberRowSortValue(m, key) { return memberRowFieldText(m, key).toLowerCase(); }
  var MEMBER_REPORT_SPEC = {
    id: "member",
    title: "Member Report",
    allCols: MEMBER_REPORT_ALL_COLS,
    defaultKeys: ["lastName", "firstName", "memberNumber"],
    defaultSortKey: "lastName",
    emptyText: "No members imported yet.",
    getRows: function () { return state.members || []; },
    cellText: memberRowFieldText,
    sortValue: memberRowSortValue
  };

  var TSHIRT_REPORT_ALL_COLS = [
    { key: "Last Name", label: "Last Name" },
    { key: "First Name", label: "First Name" },
    { key: "size", label: "Size", cls: "shirtsum" },
    { key: "qty", label: "Qty" },
    { key: "Reg #", label: "Reg #" },
    { key: "Status", label: "Status" }
  ];
  // T-Shirt Report rows are normalized one-row-per-shirt-size, not one row
  // per registrant — a registrant who ordered two different sizes (e.g. one
  // Men's Large and one Women's Medium) produces two report rows, each
  // independently sortable by size. The printed/on-screen "Size" text drops
  // the Free/Purchased distinction (just "Men's Large", not "Men's Free
  // Large") — that's internal bookkeeping for which CSV column/quota a
  // shirt came from, not something this report needs to show;
  // CONFIG.GROUPS[].label itself is left alone since it's also the literal
  // CSV column-name prefix (SHIRT_BUCKETS' own `col`), used well beyond
  // this one report.
  //
  // `rank` groups by GENDER + SIZE ONLY (not the underlying Free vs.
  // Purchased bucket) so every row that prints as "Men's Small" sorts
  // together, regardless of which of the two buckets it came from — a plain
  // CONFIG.SHIRT_BUCKETS index (this report's original approach) put the
  // Free buckets' 6 sizes before the Purchased buckets' 6 sizes, so "Men's
  // Small (Free)" and "Men's Small (Purchased)" sorted 6 slots apart even
  // though the Free/Purchased distinction is no longer visible in the text —
  // the report LOOKED unsorted because the same label appeared in two
  // different places.
  function tshirtReportRows() {
    var out = [];
    var sizeIndex = {};
    CONFIG.SIZES.forEach(function (sz, i) { sizeIndex[sz.key] = i; });
    var genderRank = { "Men's": 0, "Women's": 1 };
    allRegistrations().filter(function (r) { return classifyStatus(r["Status"]) === "paid"; }).forEach(function (r) {
      CONFIG.SHIRT_BUCKETS.forEach(function (b) {
        var qty = Number(r[b.col]) || 0;
        if (qty <= 0) return;
        var group = CONFIG.GROUPS.filter(function (g) { return g.key === b.groupKey; })[0];
        var gender = group ? group.gender : "";
        var label = gender + " " + sizeLabel(b.sizeKey);
        var rank = (genderRank[gender] || 0) * CONFIG.SIZES.length + (sizeIndex[b.sizeKey] || 0);
        out.push({ row: r, size: label, qty: qty, rank: rank });
      });
    });
    return out;
  }
  function tshirtReportCellText(pr, key) {
    if (key === "size") return pr.size;
    if (key === "qty") return String(pr.qty);
    return regRowFieldText(pr.row, key);
  }
  function tshirtReportSortValue(pr, key) {
    if (key === "size") return pr.rank;
    if (key === "qty") return pr.qty;
    return regRowSortValue(pr.row, key);
  }
  var TSHIRT_REPORT_SPEC = {
    id: "tshirt",
    title: "T-Shirt Report",
    allCols: TSHIRT_REPORT_ALL_COLS,
    defaultKeys: ["Last Name", "First Name", "size", "qty"],
    defaultSortKey: "size",
    emptyText: "No paid registrations to report yet.",
    getRows: tshirtReportRows,
    cellText: tshirtReportCellText,
    sortValue: tshirtReportSortValue
  };

  var CARSHOW_REPORT_ALL_COLS = [
    { key: "Reg #", label: "Reg #" },
    { key: "Last Name", label: "Last Name" },
    { key: "First Name", label: "First Name" },
    { key: "Year", label: "Year" },
    { key: "Model", label: "Model" },
    { key: "Gen", label: "Gen" }
  ];
  var CARSHOW_REPORT_SPEC = {
    id: "carshow",
    title: "Car Show Report",
    allCols: CARSHOW_REPORT_ALL_COLS,
    defaultKeys: ["Reg #", "Last Name", "First Name", "Year", "Model", "Gen"],
    defaultSortKey: "Last Name",
    emptyText: "No cars in the show yet.",
    // Same "In Car Show?" flag the Registration tab's own "In Car Show"
    // filter checkbox and printTallySheetForShow() use — the judging-day
    // roster, not every registration.
    getRows: carsInShow,
    cellText: regRowFieldText,
    sortValue: regRowSortValue
  };

  // ---------- Generic report builder (preview + column/sort picker) ----------
  // Powers the Registration/Member/T-Shirt/Car Show reports above, all sharing the
  // "preview + pick columns/sort, save automatically, print from here" screen
  // Sponsor Report established. Each report's state lives under its own
  // spec.id prefix (e.g. "reg" -> state.appSettings.regReportColumns,
  // state.regReportPageOpen), so the three don't collide with each other or
  // with Sponsor Report's own (separately-implemented) equivalents above.
  function genReportColumns(spec) {
    var saved = state.appSettings[spec.id + "ReportColumns"];
    var keys = (Array.isArray(saved) && saved.length) ? saved : spec.defaultKeys;
    var cols = [];
    keys.forEach(function (k) {
      var c = spec.allCols.filter(function (x) { return x.key === k; })[0];
      if (c) cols.push(c);
    });
    return cols.length ? cols : spec.allCols.filter(function (c) { return spec.defaultKeys.indexOf(c.key) !== -1; });
  }
  function genReportAvailableColumns(spec) {
    var chosen = {};
    genReportColumns(spec).forEach(function (c) { chosen[c.key] = true; });
    return spec.allCols.filter(function (c) { return !chosen[c.key]; });
  }
  // Multi-level sort, same "storage format" ({ key, dir: "asc"|"desc" }
  // array) and fallback rules as sponsorReportSortLevels() above — see that
  // function's comment. Persisted under appSettings[spec.id+"ReportSortCols"].
  function genReportSortLevels(spec) {
    var cols = genReportColumns(spec);
    var colKeys = {};
    cols.forEach(function (c) { colKeys[c.key] = true; });
    var saved = state.appSettings[spec.id + "ReportSortCols"];
    var levels = (Array.isArray(saved) ? saved : []).filter(function (lv) {
      return lv && colKeys[lv.key];
    }).map(function (lv) { return { key: lv.key, dir: lv.dir === "desc" ? "desc" : "asc" }; });
    if (!levels.length) levels = [{ key: cols.length ? cols[0].key : spec.defaultSortKey, dir: "asc" }];
    return levels;
  }
  function genReportCell(spec, row, c) {
    return el("td", { class: c.cls || "", text: spec.cellText(row, c.key) });
  }
  function genReportSorted(spec) {
    var levels = genReportSortLevels(spec);
    return spec.getRows().slice().sort(function (a, b) {
      for (var i = 0; i < levels.length; i++) {
        var lv = levels[i], d = lv.dir === "desc" ? -1 : 1;
        var av = spec.sortValue(a, lv.key), bv = spec.sortValue(b, lv.key);
        if (av < bv) return -d;
        if (av > bv) return d;
      }
      return 0;
    });
  }
  function saveGenReportLayout(spec, patch) {
    Object.keys(patch).forEach(function (k) { state.appSettings[k] = patch[k]; });
    renderGenReportPage(spec);
    if (!SITE_CONFIG.appSettingsApiUrl) return;
    fetch(SITE_CONFIG.appSettingsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", settings: patch })
    }).catch(function () { /* layout is cosmetic — keep the local change rather than reverting the UI */ });
  }
  function genReportAddColumn(spec, key) {
    var keys = genReportColumns(spec).map(function (c) { return c.key; });
    if (keys.indexOf(key) !== -1) return;
    keys.push(key);
    var patch = {}; patch[spec.id + "ReportColumns"] = keys;
    saveGenReportLayout(spec, patch);
  }
  function genReportRemoveColumn(spec, key) {
    var keys = genReportColumns(spec).map(function (c) { return c.key; }).filter(function (k) { return k !== key; });
    if (!keys.length) return;
    var patch = {}; patch[spec.id + "ReportColumns"] = keys;
    saveGenReportLayout(spec, patch);
  }
  function genReportMoveColumn(spec, key, beforeKey) {
    if (key === beforeKey) return;
    var keys = genReportColumns(spec).map(function (c) { return c.key; }).filter(function (k) { return k !== key; });
    var at = beforeKey === null ? keys.length : keys.indexOf(beforeKey);
    if (at < 0) at = keys.length;
    keys.splice(at, 0, key);
    var patch = {}; patch[spec.id + "ReportColumns"] = keys;
    saveGenReportLayout(spec, patch);
  }
  function genReportAddAllColumns(spec) {
    var keys = genReportColumns(spec).map(function (c) { return c.key; });
    var have = {};
    keys.forEach(function (k) { have[k] = true; });
    spec.allCols.forEach(function (c) { if (!have[c.key]) keys.push(c.key); });
    var patch = {}; patch[spec.id + "ReportColumns"] = keys;
    saveGenReportLayout(spec, patch);
  }
  function genReportRemoveAllColumns(spec) {
    var keys = genReportColumns(spec).map(function (c) { return c.key; }).slice(0, 1);
    if (!keys.length) return;
    var patch = {}; patch[spec.id + "ReportColumns"] = keys;
    saveGenReportLayout(spec, patch);
  }
  function buildGenReportColumnRow(spec, col, selected) {
    var kids = [el("span", { class: "report-col-label", text: col.label })];
    var row = el("div", { class: "report-col" + (selected ? " selected" : "") }, kids);
    var dragKey = spec.id + "ReportDragKey";
    if (selected) {
      row.setAttribute("draggable", "true");
      kids.unshift(el("span", { class: "report-col-grip", title: "Drag to reorder" }, ["⠿"]));
      var removeBtn = el("button", { type: "button", class: "btn", style: "padding:1px 7px; font-size:12px", title: "Remove from report" }, ["✕"]);
      removeBtn.addEventListener("click", function () { genReportRemoveColumn(spec, col.key); });
      row.appendChild(el("span", { class: "spacer" }));
      row.appendChild(removeBtn);
      row.addEventListener("dragstart", function (e) {
        state[dragKey] = col.key;
        row.classList.add("dragging");
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", col.key); } catch (err) { /* IE-ism; the state field is the real channel */ } }
      });
      row.addEventListener("dragend", function () {
        state[dragKey] = null;
        row.classList.remove("dragging");
      });
      row.addEventListener("dragover", function (e) {
        if (!state[dragKey]) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", function () { row.classList.remove("drop-target"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove("drop-target");
        var dragged = state[dragKey];
        state[dragKey] = null;
        if (dragged) genReportMoveColumn(spec, dragged, col.key);
      });
    } else {
      var addBtn = el("button", { type: "button", class: "btn", style: "padding:1px 7px; font-size:12px", title: "Add to report" }, ["+"]);
      addBtn.addEventListener("click", function () { genReportAddColumn(spec, col.key); });
      row.appendChild(el("span", { class: "spacer" }));
      row.appendChild(addBtn);
      row.addEventListener("dblclick", function () { genReportAddColumn(spec, col.key); });
    }
    return row;
  }
  // Shared "Sort by ... then by ..." editor used by every report builder
  // (Sponsor Report's own separate implementation, and every genReport-based
  // one). `levels` is the current array of { key, dir: "asc"|"desc" }
  // (storage format — see sponsorReportSortLevels()/genReportSortLevels()),
  // `cols` is the report's currently-selected columns (only those are valid
  // sort targets), and `onChange(nextLevels)` is called with the full
  // updated array on any edit — the caller is responsible for persisting it
  // and re-rendering. A level can't be removed below one (a report always
  // sorts by something), and "+ Add sort level" is disabled once every
  // selected column already has a level (nothing left to add).
  function buildSortLevelsEditor(levels, cols, onChange) {
    var wrap = el("div", { class: "report-sort-editor" });
    levels.forEach(function (lv, idx) {
      var colSel = el("select", {});
      cols.forEach(function (c) { colSel.appendChild(el("option", { value: c.key, text: c.label })); });
      colSel.value = lv.key;
      colSel.addEventListener("change", function () {
        var next = levels.slice();
        next[idx] = { key: colSel.value, dir: lv.dir };
        onChange(next);
      });
      var dirSel = el("select", {});
      dirSel.appendChild(el("option", { value: "asc", text: "Ascending" }));
      dirSel.appendChild(el("option", { value: "desc", text: "Descending" }));
      dirSel.value = lv.dir;
      dirSel.addEventListener("change", function () {
        var next = levels.slice();
        next[idx] = { key: lv.key, dir: dirSel.value };
        onChange(next);
      });
      var removeBtn = el("button", { type: "button", class: "btn", style: "padding:2px 8px; font-size:12px", title: "Remove this sort level" }, ["✕"]);
      removeBtn.disabled = levels.length <= 1;
      removeBtn.addEventListener("click", function () {
        var next = levels.slice();
        next.splice(idx, 1);
        onChange(next);
      });
      wrap.appendChild(el("div", { class: "report-sort-row" }, [
        el("span", { class: "hint", style: "min-width:50px" }, [idx === 0 ? "Sort by" : "then by"]),
        colSel, dirSel, removeBtn
      ]));
    });
    var usedKeys = {};
    levels.forEach(function (lv) { usedKeys[lv.key] = true; });
    var addableCols = cols.filter(function (c) { return !usedKeys[c.key]; });
    var addBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:3px 10px; margin-top:2px" }, ["+ Add sort level"]);
    addBtn.disabled = !addableCols.length;
    addBtn.addEventListener("click", function () {
      onChange(levels.concat([{ key: addableCols[0].key, dir: "asc" }]));
    });
    wrap.appendChild(addBtn);
    return wrap;
  }
  function printGenReport(spec) {
    var rows = genReportSorted(spec);
    if (!rows.length) return;
    var cols = genReportColumns(spec);
    var host = $("#printHost");
    host.innerHTML = "";
    var thead = el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { text: c.label }); }))]);
    var tbody = el("tbody", {}, rows.map(function (r) { return el("tr", {}, cols.map(function (c) { return genReportCell(spec, r, c); })); }));
    host.appendChild(buildPrintHeader(spec.title));
    host.appendChild(el("table", { class: "grid report-table centered-report-table dense-report-table" }, [thead, tbody]));
    host.appendChild(buildPrintFooter());
    window.print();
  }
  // Quotes a CSV field only when it needs it (contains a comma, quote, or
  // newline) — doubling any embedded quote, the standard CSV escaping rule.
  function csvField(v) {
    var s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  // Downloads a text blob under `filename` via a throwaway <a download> —
  // the standard no-library approach for a client-generated file; nothing is
  // ever sent to the server for this. revokeObjectURL is deferred a tick so
  // the click has time to actually start the save before the URL dies.
  function downloadTextFile(filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  // Registration/Car Show/T-Shirt/Member reports' "⬇ Export" button — the
  // same columns, order, and sort the preview/print already use, as a CSV
  // (universally importable, and simpler than wiring up excel.js/ExcelJS —
  // vendored in this app only for logic.js's own generate() workbook, and
  // for the regression suite — for one more, unrelated export path).
  function exportGenReportCsv(spec) {
    var rows = genReportSorted(spec);
    if (!rows.length) return;
    var cols = genReportColumns(spec);
    var lines = [cols.map(function (c) { return csvField(c.label); }).join(",")];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { return csvField(spec.cellText(r, c.key)); }).join(","));
    });
    // Byte-order mark first so Excel (which otherwise guesses ANSI and can
    // mangle a non-ASCII sponsor/member name) opens this as UTF-8.
    downloadTextFile(spec.title.replace(/[^A-Za-z0-9]+/g, "") + "-" + dateInputValue(new Date()) + ".csv",
      "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }
  function buildGenReportPreview(spec) {
    var cols = genReportColumns(spec);
    var rows = genReportSorted(spec);
    var sheet = el("div", { class: "report-preview-sheet" }, [buildPrintHeader(spec.title)]);
    if (!rows.length) {
      sheet.appendChild(el("div", { class: "empty-state" }, [spec.emptyText]));
    } else {
      // dense-report-table — same tightly-packed rows as Sponsor Report (see
      // styles.css), so a long registration/member/shirt list fits as many
      // rows per page as the Sponsor Report does, instead of the looser
      // default .report-table spacing.
      var table = el("table", { class: "grid report-table centered-report-table dense-report-table report-preview-table" }, [
        el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { text: c.label }); }))]),
        el("tbody", {}, rows.map(function (r) { return el("tr", {}, cols.map(function (c) { return genReportCell(spec, r, c); })); }))
      ]);
      sheet.appendChild(el("div", { class: "report-preview-tablewrap" }, [table]));
    }
    sheet.appendChild(buildPrintFooter());
    return el("div", { class: "report-preview-pane" }, [
      el("div", { class: "report-pane-title", text: "Print Preview" }),
      sheet
    ]);
  }
  function buildGenReportBuilder(spec) {
    var available = genReportAvailableColumns(spec);
    var selected = genReportColumns(spec);

    var addAllBtn = el("button", { type: "button", class: "btn report-panel-head-btn" }, ["Add All"]);
    addAllBtn.disabled = !available.length;
    addAllBtn.addEventListener("click", function () { genReportAddAllColumns(spec); });
    var availablePanel = el("div", { class: "report-col-panel" }, [
      el("div", { class: "report-panel-head report-panel-head-row" }, [
        el("span", { text: "Available Columns" }),
        addAllBtn
      ]),
      available.length
        ? el("div", { class: "report-col-list" }, available.map(function (c) { return buildGenReportColumnRow(spec, c, false); }))
        : el("div", { class: "hint", style: "padding:10px" }, ["Every column is already in the report."])
    ]);

    var selectedList = el("div", { class: "report-col-list" }, selected.map(function (c) { return buildGenReportColumnRow(spec, c, true); }));
    var dragKey = spec.id + "ReportDragKey";
    selectedList.addEventListener("dragover", function (e) {
      if (!state[dragKey]) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    selectedList.addEventListener("drop", function (e) {
      e.preventDefault();
      var dragged = state[dragKey];
      state[dragKey] = null;
      if (dragged) genReportMoveColumn(spec, dragged, null);
    });
    var removeAllBtn = el("button", { type: "button", class: "btn report-panel-head-btn" }, ["Remove All"]);
    removeAllBtn.disabled = selected.length <= 1;
    removeAllBtn.addEventListener("click", function () { genReportRemoveAllColumns(spec); });
    var selectedPanel = el("div", { class: "report-col-panel" }, [
      el("div", { class: "report-panel-head report-panel-head-row" }, [
        el("span", { text: "In Report (drag to reorder)" }),
        removeAllBtn
      ]),
      selectedList
    ]);

    var sortEditor = buildSortLevelsEditor(genReportSortLevels(spec), selected, function (nextLevels) {
      var patch = {}; patch[spec.id + "ReportSortCols"] = nextLevels;
      saveGenReportLayout(spec, patch);
    });

    var resetBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["↺ Reset to Default"]);
    resetBtn.addEventListener("click", function () {
      var patch = {};
      patch[spec.id + "ReportColumns"] = spec.defaultKeys.slice();
      patch[spec.id + "ReportSortCols"] = [{ key: spec.defaultSortKey, dir: "asc" }];
      saveGenReportLayout(spec, patch);
    });

    // Collapsed by default, same convention as Sponsor Report's builder — a
    // one-time setup task, not something an officer needs open every print.
    var body = el("div", { class: "report-builder-body-inner" }, [
      el("div", { class: "hint", style: "margin-bottom:10px" }, [
        "Click + to add a column, ✕ to remove one, and drag the columns in " +
        "\"In Report\" to change their print order. Changes save automatically and apply to every printed copy."
      ]),
      el("div", { class: "report-col-panels" }, [availablePanel, selectedPanel]),
      el("div", { style: "margin-top:14px" }, [sortEditor]),
      el("div", { class: "settings-actions" }, [resetBtn])
    ]);
    var openKey = spec.id + "ReportBuilderOpen";
    var isOpen = !!state[openKey];
    body.hidden = !isOpen;
    var toggleBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" },
      [isOpen ? "▲ Hide" : "▼ Show"]);
    toggleBtn.addEventListener("click", function () {
      state[openKey] = !isOpen;
      renderGenReportPage(spec);
    });

    return el("div", { class: "report-builder-pane" }, [
      el("div", { class: "report-pane-title report-pane-title-row" }, [
        el("span", { text: spec.title + " Builder" }),
        toggleBtn
      ]),
      body
    ]);
  }
  function renderGenReportPage(spec) {
    var host = $("#" + spec.id + "ReportHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state[spec.id + "ReportPageOpen"]) return;
    var page = el("div", { class: "api-page" }, [
      buildPageBanner(function () { closeGenReportPage(spec); }, spec.title,
        function () { printGenReport(spec); }, function () { exportGenReportCsv(spec); }),
      el("div", { class: "api-page-body report-builder-body" }, [
        buildGenReportPreview(spec),
        buildGenReportBuilder(spec)
      ])
    ]);
    host.appendChild(page);
  }
  function openGenReportPage(spec) { state[spec.id + "ReportPageOpen"] = true; renderGenReportPage(spec); }
  function closeGenReportPage(spec) { state[spec.id + "ReportPageOpen"] = false; renderGenReportPage(spec); }

  // Cache-buster for the static PDFs opened by the two buttons below. These
  // files are replaced in place (VotingSheet.pdf by ftp-deploy.sh,
  // CarShowFlyer.pdf by flyer-import.php) at the SAME URL, and the host
  // (LiteSpeed on Hostinger) serves them with a long default max-age — so
  // without a unique query string the browser keeps showing the old copy
  // after a re-upload. A fresh timestamp per click always fetches the
  // current file.
  function pdfCacheBust(name) { return name + "?t=" + Date.now(); }

  // ---------- Car Show Voting Sheet (print) ----------
  // A static, already-designed People's Choice ballot PDF (VotingSheet.pdf,
  // uploaded alongside the flyer/logo — see ftp-deploy.sh) — opened directly
  // in a new tab, same "use the real file as-is" pattern as printFlyer()
  // below, rather than reimplemented as HTML/CSS. An earlier version of this
  // button rebuilt the design from a reference image; the club provided the
  // actual print-ready PDF instead, which is authoritative.
  function printVotingSheet() {
    window.open(pdfCacheBust("VotingSheet.pdf"), "_blank");
  }

  // ---------- Car Show Flyer (print) ----------
  // A static, already-designed marketing PDF (CarShowFlyer.pdf, replaced by
  // the Setup tab's Import Flyer page) — opened directly in a new tab rather
  // than rendered through this app's print pipeline, so the browser's own
  // PDF viewer handles printing. Nothing here touches #printHost/
  // window.print(); unlike every other Reports-tab button, this one doesn't
  // produce a report from app data at all.
  function printFlyer() {
    window.open(pdfCacheBust("CarShowFlyer.pdf"), "_blank");
  }

  // ---------- Sponsor Report (full-page screen: preview + builder) ----------
  // The Reports tab's "🤝 Sponsor Report" button used to print immediately
  // with a fixed 5-column layout. It now opens a builder screen instead: a
  // live print preview on the left, and on the right two panels (every
  // available column / the ones currently in the report) plus a sort picker.
  // The layout is persisted per show in app-settings.json
  // (sponsorReportColumns / sponsorReportSortCols), so
  // an officer configures it once and every later print — and every other
  // officer's browser — uses it.
  //
  // "Every possible column" is SPONSOR_COLS, the same list the Sponsors tab's
  // own table is built from, so anything visible there can be reported on;
  // sponsorFieldText()/sponsorSortValue() already handle every one of those
  // keys, which is what makes an arbitrary user-chosen subset safe to render
  // and sort without any per-column special-casing here.
  var SPONSOR_REPORT_DEFAULT_KEYS = ["regDate", "name", "etccMemberName", "sponsorType", "shirtSize"];

  // The saved layout, resolved against SPONSOR_COLS. Unknown keys (a column
  // removed from SPONSOR_COLS after someone saved a layout naming it) are
  // dropped rather than rendered as blank columns; an empty/never-saved list
  // falls back to the defaults above.
  function sponsorReportColumns() {
    var saved = state.appSettings.sponsorReportColumns;
    var keys = (Array.isArray(saved) && saved.length) ? saved : SPONSOR_REPORT_DEFAULT_KEYS;
    var cols = [];
    keys.forEach(function (k) {
      var c = SPONSOR_COLS.filter(function (x) { return x.key === k; })[0];
      if (c) cols.push(c);
    });
    return cols.length ? cols : SPONSOR_COLS.filter(function (c) { return SPONSOR_REPORT_DEFAULT_KEYS.indexOf(c.key) !== -1; });
  }
  // The columns NOT currently in the report, in SPONSOR_COLS' own order —
  // the left ("Available") panel of the builder.
  function sponsorReportAvailableColumns() {
    var chosen = {};
    sponsorReportColumns().forEach(function (c) { chosen[c.key] = true; });
    return SPONSOR_COLS.filter(function (c) { return !chosen[c.key]; });
  }
  // Which columns sort the report, in priority order, and which way each
  // sorts — a "Last Name, then First Name" style multi-level sort, not just
  // one column. Persisted as an array of { key, dir: "asc"|"desc" } under
  // appSettings.sponsorReportSortCols (storage format — dir is kept as the
  // string here, same shape the builder's sort-level editor reads/writes;
  // sponsorReportSorted() below converts to a ±1 multiplier when comparing).
  // Levels naming a column no longer in the report are dropped; an empty/
  // never-saved list falls back to a single level on the report's first
  // column.
  function sponsorReportSortLevels() {
    var cols = sponsorReportColumns();
    var colKeys = {};
    cols.forEach(function (c) { colKeys[c.key] = true; });
    var saved = state.appSettings.sponsorReportSortCols;
    var levels = (Array.isArray(saved) ? saved : []).filter(function (lv) {
      return lv && colKeys[lv.key];
    }).map(function (lv) { return { key: lv.key, dir: lv.dir === "desc" ? "desc" : "asc" }; });
    if (!levels.length) levels = [{ key: cols.length ? cols[0].key : "regDate", dir: "asc" }];
    return levels;
  }
  function sponsorReportCell(s, c) {
    return el("td", { text: sponsorFieldText(s, c.key) });
  }
  // Same sortValue helper the Sponsors table's own column sorting relies on,
  // so a date column sorts chronologically and an amount numerically rather
  // than as their formatted display strings. Ties on the first sort level
  // fall through to the next level, and so on.
  function sponsorReportSorted() {
    var levels = sponsorReportSortLevels();
    return visibleSponsors().slice().sort(function (a, b) {
      for (var i = 0; i < levels.length; i++) {
        var lv = levels[i], d = lv.dir === "desc" ? -1 : 1;
        var av = sponsorSortValue(a, lv.key), bv = sponsorSortValue(b, lv.key);
        if (av < bv) return -d;
        if (av > bv) return d;
      }
      return 0;
    });
  }

  // Persists a layout change (columns and/or sort) to app-settings.json, with
  // the same optimistic-local-update-then-push shape saveAppSettings() uses.
  // Deliberately re-renders only this screen, not renderViews() — the whole
  // builder lives in an overlay, and a full view re-render underneath it
  // would be wasted work.
  function saveSponsorReportLayout(patch) {
    Object.keys(patch).forEach(function (k) { state.appSettings[k] = patch[k]; });
    renderSponsorReportPage();
    if (!SITE_CONFIG.appSettingsApiUrl) return;
    fetch(SITE_CONFIG.appSettingsApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", settings: patch })
    }).catch(function () { /* layout is cosmetic — keep the local change rather than reverting the UI */ });
  }
  function sponsorReportAddColumn(key) {
    var keys = sponsorReportColumns().map(function (c) { return c.key; });
    if (keys.indexOf(key) !== -1) return;
    keys.push(key);
    saveSponsorReportLayout({ sponsorReportColumns: keys });
  }
  function sponsorReportRemoveColumn(key) {
    var keys = sponsorReportColumns().map(function (c) { return c.key; })
      .filter(function (k) { return k !== key; });
    // A report with no columns can't print anything meaningful, and the
    // "empty means never customized" fallback in sponsorReportColumns() would
    // silently resurrect the defaults — so the last column can't be removed.
    if (!keys.length) return;
    saveSponsorReportLayout({ sponsorReportColumns: keys });
  }
  // Adds every SPONSOR_COLS entry not already in the report, appended after
  // the current selection in SPONSOR_COLS' own order (same order the
  // Available panel lists them in).
  function sponsorReportAddAllColumns() {
    var keys = sponsorReportColumns().map(function (c) { return c.key; });
    var have = {};
    keys.forEach(function (k) { have[k] = true; });
    SPONSOR_COLS.forEach(function (c) { if (!have[c.key]) keys.push(c.key); });
    saveSponsorReportLayout({ sponsorReportColumns: keys });
  }
  // Clears the report down to just its first column — same "can't remove the
  // last column" rule sponsorReportRemoveColumn() enforces, so this can't
  // leave the report empty.
  function sponsorReportRemoveAllColumns() {
    var keys = sponsorReportColumns().map(function (c) { return c.key; }).slice(0, 1);
    if (!keys.length) return;
    saveSponsorReportLayout({ sponsorReportColumns: keys });
  }
  // Drag-to-reorder within the Selected panel: move `key` to the position
  // currently held by `beforeKey` (or to the end when beforeKey is null).
  function sponsorReportMoveColumn(key, beforeKey) {
    if (key === beforeKey) return;
    var keys = sponsorReportColumns().map(function (c) { return c.key; })
      .filter(function (k) { return k !== key; });
    var at = beforeKey === null ? keys.length : keys.indexOf(beforeKey);
    if (at < 0) at = keys.length;
    keys.splice(at, 0, key);
    saveSponsorReportLayout({ sponsorReportColumns: keys });
  }

  function openSponsorReportPage() { state.sponsorReportPageOpen = true; renderSponsorReportPage(); }
  function closeSponsorReportPage() { state.sponsorReportPageOpen = false; renderSponsorReportPage(); }

  function printSponsorReport() {
    if (!visibleSponsors().length) return;
    var cols = sponsorReportColumns();
    var host = $("#printHost");
    host.innerHTML = "";
    var thead = el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { text: c.label }); }))]);
    var tbody = el("tbody", {}, sponsorReportSorted().map(function (s) {
      return el("tr", {}, cols.map(function (c) { return sponsorReportCell(s, c); }));
    }));
    host.appendChild(buildPrintHeader("Sponsor Report"));
    // "dense-report-table" — tighter rows than the other Reports-tab prints,
    // to fit as many sponsors per page as possible (see styles.css). Scoped
    // to this report rather than applied to .report-table generally, so the
    // Registration/Member/Summary reports keep the spacing they were tuned
    // with.
    host.appendChild(el("table", { class: "grid report-table dense-report-table" }, [thead, tbody]));
    host.appendChild(buildPrintFooter());
    window.print();
  }
  // Sponsor Report's own "⬇ Export" — same CSV shape as
  // exportGenReportCsv() (this report predates, and isn't wired into, the
  // generic report-builder screens that helper serves).
  function exportSponsorReportCsv() {
    if (!visibleSponsors().length) return;
    var cols = sponsorReportColumns();
    var lines = [cols.map(function (c) { return csvField(c.label); }).join(",")];
    sponsorReportSorted().forEach(function (s) {
      lines.push(cols.map(function (c) { return csvField(sponsorFieldText(s, c.key)); }).join(","));
    });
    downloadTextFile("SponsorReport-" + dateInputValue(new Date()) + ".csv",
      "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  // The left pane — a WYSIWYG mimic of what printSponsorReport() will put on
  // paper (same header/table/footer elements), not the browser's own print
  // preview, which no page can embed. Rendered on a white "sheet" so the
  // shape of the printed page is recognizable at a glance.
  function buildSponsorReportPreview() {
    var cols = sponsorReportColumns();
    var rows = sponsorReportSorted();
    var sheet = el("div", { class: "report-preview-sheet" }, [buildPrintHeader("Sponsor Report")]);
    if (!rows.length) {
      sheet.appendChild(el("div", { class: "empty-state" }, ["No sponsors to report yet."]));
    } else {
      // Scrolls internally (.report-preview-tablewrap) rather than letting the
      // table grow to its full row count and pushing the footer/builder pane
      // off-screen — a long sponsor list should fit on screen like every
      // other scrollable table in the app, not force a full-page scroll.
      var table = el("table", { class: "grid report-table dense-report-table report-preview-table" }, [
        el("thead", {}, [el("tr", {}, cols.map(function (c) { return el("th", { text: c.label }); }))]),
        el("tbody", {}, rows.map(function (s) {
          return el("tr", {}, cols.map(function (c) { return sponsorReportCell(s, c); }));
        }))
      ]);
      sheet.appendChild(el("div", { class: "report-preview-tablewrap" }, [table]));
    }
    sheet.appendChild(buildPrintFooter());
    return el("div", { class: "report-preview-pane" }, [
      el("div", { class: "report-pane-title", text: "Print Preview" }),
      sheet
    ]);
  }

  // One row in either builder panel. Selected rows are draggable (reorder)
  // and carry a ✕; available rows carry a + and add on click.
  function buildSponsorReportColumnRow(col, selected) {
    var kids = [el("span", { class: "report-col-label", text: col.label })];
    var row = el("div", { class: "report-col" + (selected ? " selected" : "") }, kids);
    if (selected) {
      row.setAttribute("draggable", "true");
      kids.unshift(el("span", { class: "report-col-grip", title: "Drag to reorder" }, ["⠿"]));
      var removeBtn = el("button", { type: "button", class: "btn", style: "padding:1px 7px; font-size:12px", title: "Remove from report" }, ["✕"]);
      removeBtn.addEventListener("click", function () { sponsorReportRemoveColumn(col.key); });
      row.appendChild(el("span", { class: "spacer" }));
      row.appendChild(removeBtn);
      row.addEventListener("dragstart", function (e) {
        state.sponsorReportDragKey = col.key;
        row.classList.add("dragging");
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", col.key); } catch (err) { /* IE-ism; the state field is the real channel */ } }
      });
      row.addEventListener("dragend", function () {
        state.sponsorReportDragKey = null;
        row.classList.remove("dragging");
      });
      // Dropping ON a row inserts the dragged column before it — the common
      // "drag it above this one" expectation. Dropping on the panel's empty
      // space below the rows appends instead (see the panel's own handlers).
      row.addEventListener("dragover", function (e) {
        if (!state.sponsorReportDragKey) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", function () { row.classList.remove("drop-target"); });
      row.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove("drop-target");
        var dragged = state.sponsorReportDragKey;
        state.sponsorReportDragKey = null;
        if (dragged) sponsorReportMoveColumn(dragged, col.key);
      });
    } else {
      var addBtn = el("button", { type: "button", class: "btn", style: "padding:1px 7px; font-size:12px", title: "Add to report" }, ["+"]);
      addBtn.addEventListener("click", function () { sponsorReportAddColumn(col.key); });
      row.appendChild(el("span", { class: "spacer" }));
      row.appendChild(addBtn);
      row.addEventListener("dblclick", function () { sponsorReportAddColumn(col.key); });
    }
    return row;
  }

  // The right pane — two panels (Available / In Report) plus the sort picker.
  function buildSponsorReportBuilder() {
    var available = sponsorReportAvailableColumns();
    var selected = sponsorReportColumns();

    var addAllBtn = el("button", { type: "button", class: "btn report-panel-head-btn" }, ["Add All"]);
    addAllBtn.disabled = !available.length;
    addAllBtn.addEventListener("click", function () { sponsorReportAddAllColumns(); });
    var availablePanel = el("div", { class: "report-col-panel" }, [
      el("div", { class: "report-panel-head report-panel-head-row" }, [
        el("span", { text: "Available Columns" }),
        addAllBtn
      ]),
      available.length
        ? el("div", { class: "report-col-list" }, available.map(function (c) { return buildSponsorReportColumnRow(c, false); }))
        : el("div", { class: "hint", style: "padding:10px" }, ["Every column is already in the report."])
    ]);

    var selectedList = el("div", { class: "report-col-list" }, selected.map(function (c) { return buildSponsorReportColumnRow(c, true); }));
    // Dropping into the list's empty space (past the last row) moves the
    // dragged column to the end.
    selectedList.addEventListener("dragover", function (e) {
      if (!state.sponsorReportDragKey) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    selectedList.addEventListener("drop", function (e) {
      e.preventDefault();
      var dragged = state.sponsorReportDragKey;
      state.sponsorReportDragKey = null;
      if (dragged) sponsorReportMoveColumn(dragged, null);
    });
    var removeAllBtn = el("button", { type: "button", class: "btn report-panel-head-btn" }, ["Remove All"]);
    removeAllBtn.disabled = selected.length <= 1;
    removeAllBtn.addEventListener("click", function () { sponsorReportRemoveAllColumns(); });
    var selectedPanel = el("div", { class: "report-col-panel" }, [
      el("div", { class: "report-panel-head report-panel-head-row" }, [
        el("span", { text: "In Report (drag to reorder)" }),
        removeAllBtn
      ]),
      selectedList
    ]);

    var sortEditor = buildSortLevelsEditor(sponsorReportSortLevels(), selected, function (nextLevels) {
      saveSponsorReportLayout({ sponsorReportSortCols: nextLevels });
    });

    var resetBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" }, ["↺ Reset to Default"]);
    resetBtn.addEventListener("click", function () {
      saveSponsorReportLayout({
        sponsorReportColumns: SPONSOR_REPORT_DEFAULT_KEYS.slice(),
        sponsorReportSortCols: [{ key: "regDate", dir: "asc" }]
      });
    });

    // Collapsed by default (state.sponsorReportBuilderOpen starts undefined,
    // i.e. falsy) — the builder is a one-time setup task, not something an
    // officer needs open every time they print, so the preview gets the
    // screen by default. Purely a view toggle, not persisted like the
    // column/sort/width settings above.
    var body = el("div", { class: "report-builder-body-inner" }, [
      el("div", { class: "hint", style: "margin-bottom:10px" }, [
        "Click + to add a column, ✕ to remove one, and drag the columns in " +
        "\"In Report\" to change their print order. Changes save automatically and apply to every printed copy."
      ]),
      el("div", { class: "report-col-panels" }, [availablePanel, selectedPanel]),
      el("div", { style: "margin-top:14px" }, [sortEditor]),
      el("div", { class: "settings-actions" }, [resetBtn])
    ]);
    var isOpen = !!state.sponsorReportBuilderOpen;
    body.hidden = !isOpen;
    var toggleBtn = el("button", { type: "button", class: "btn", style: "font-size:12px; padding:4px 10px" },
      [isOpen ? "▲ Hide" : "▼ Show"]);
    toggleBtn.addEventListener("click", function () {
      state.sponsorReportBuilderOpen = !isOpen;
      renderSponsorReportPage();
    });

    return el("div", { class: "report-builder-pane" }, [
      el("div", { class: "report-pane-title report-pane-title-row" }, [
        el("span", { text: "Report Builder" }),
        toggleBtn
      ]),
      body
    ]);
  }

  function renderSponsorReportPage() {
    var host = $("#sponsorReportHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.sponsorReportPageOpen) return;

    var page = el("div", { class: "api-page" }, [
      buildPageBanner(closeSponsorReportPage, "Sponsor Report", printSponsorReport, exportSponsorReportCsv),
      el("div", { class: "api-page-body report-builder-body" }, [
        buildSponsorReportPreview(),
        buildSponsorReportBuilder()
      ])
    ]);
    host.appendChild(page);
  }

  // ---------- T-Shirt Purchases (full-page screen) ----------
  // Day-of-event walk-up sales — an officer types the purchaser's name (Cost
  // defaults from Developer > Settings > T-Shirt Vendor > "Cost to Purchase
  // at Event" but is editable per-sale) and clicks Add; the date/time is
  // stamped server-side at that moment. Every purchase made this way is
  // listed below, newest first, with a Delete for corrections.
  function openTshirtPurchasePage() {
    if (state.tshirtPurchaseCost === "") {
      state.tshirtPurchaseCost = String(state.appSettings.tshirtEventPurchaseCost || 0);
    }
    state.tshirtPurchasePageOpen = true;
    renderTshirtPurchasePage();
  }
  function closeTshirtPurchasePage() {
    state.tshirtPurchasePageOpen = false;
    renderTshirtPurchasePage();
    // The T-Shirts tab's "Total Shirts Needed For Event" matrix (rendered
    // underneath this overlay) was built before any purchases made in this
    // session — re-render it so it reflects them now that we're returning.
    renderViews();
  }

  function addTshirtPurchase() {
    var name = (state.tshirtPurchaseName || "").trim();
    var cost = Number(state.tshirtPurchaseCost);
    var paymentType = state.tshirtPurchasePaymentType || "Cash";
    var checkNum = (state.tshirtPurchaseCheckNum || "").trim();
    if (!name) {
      state.tshirtPurchaseSyncError = "Purchaser name is required.";
      renderTshirtPurchasePage();
      return;
    }
    if (isNaN(cost) || cost < 0) {
      state.tshirtPurchaseSyncError = "Cost must be a number (0 or more).";
      renderTshirtPurchasePage();
      return;
    }
    if (paymentType === "Check" && !checkNum) {
      state.tshirtPurchaseSyncError = "Check # is required for a Check payment.";
      renderTshirtPurchasePage();
      return;
    }
    upsertTshirtPurchase({
      id: "ts" + Date.now() + Math.random().toString(36).slice(2),
      purchasedAt: new Date().toISOString(),
      name: name,
      cost: cost,
      reason: state.tshirtPurchaseReason || "Walk-in",
      size: state.tshirtPurchaseSize || "",
      paymentType: paymentType,
      checkNum: paymentType === "Check" ? checkNum : ""
    });
    state.tshirtPurchaseName = "";
    state.tshirtPurchaseCost = String(state.appSettings.tshirtEventPurchaseCost || 0);
    state.tshirtPurchaseReason = "Walk-in";
    state.tshirtPurchaseSize = "";
    state.tshirtPurchasePaymentType = "Cash";
    state.tshirtPurchaseCheckNum = "";
    state.tshirtPurchaseSyncError = null;
    renderTshirtPurchasePage();
  }

  function fmtPurchaseTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso || "—";
    return fmtDate(d);
  }

  function renderTshirtPurchasePage() {
    var host = $("#tshirtPurchaseHost");
    if (!host) return;
    host.innerHTML = "";
    if (!state.tshirtPurchasePageOpen) return;

    var head = buildPageBanner(closeTshirtPurchasePage, "Order T-Shirt");

    var body = el("div", { class: "api-page-inner" });

    var nameInput = el("input", { type: "text", value: state.tshirtPurchaseName || "", placeholder: "Purchaser name" });
    nameInput.addEventListener("input", function () { state.tshirtPurchaseName = nameInput.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Name" }), nameInput
    ]));

    var costField = moneyInput({ value: state.tshirtPurchaseCost });
    var costInput = costField.input;
    costInput.addEventListener("input", function () { state.tshirtPurchaseCost = costInput.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Cost" }), costField.wrap
    ]));

    var reasonSelect = el("select", {});
    ["Walk-in", "Member"].forEach(function (r) {
      reasonSelect.appendChild(el("option", { value: r, text: r }));
    });
    reasonSelect.value = state.tshirtPurchaseReason || "Walk-in";
    reasonSelect.addEventListener("change", function () { state.tshirtPurchaseReason = reasonSelect.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Reason" }), reasonSelect
    ]));

    var sizeSelect = el("select", {});
    sizeSelect.appendChild(el("option", { value: "", text: "— none —" }));
    CONFIG.SPONSOR_SHIRT_SIZES.forEach(function (sz) {
      sizeSelect.appendChild(el("option", { value: sz, text: sz }));
    });
    sizeSelect.value = state.tshirtPurchaseSize || "";
    sizeSelect.addEventListener("change", function () { state.tshirtPurchaseSize = sizeSelect.value; });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "T-Shirt Size" }), sizeSelect
    ]));

    var paymentTypeSelect = el("select", {});
    ["Cash", "Check", "Credit Card"].forEach(function (t) {
      paymentTypeSelect.appendChild(el("option", { value: t, text: t }));
    });
    paymentTypeSelect.value = state.tshirtPurchasePaymentType || "Cash";
    paymentTypeSelect.addEventListener("change", function () {
      state.tshirtPurchasePaymentType = paymentTypeSelect.value;
      checkNumRow.style.display = paymentTypeSelect.value === "Check" ? "" : "none";
    });
    body.appendChild(el("div", { class: "form-row" }, [
      el("span", { class: "form-label", text: "Payment Type" }), paymentTypeSelect
    ]));

    var checkNumInput = el("input", { type: "text", placeholder: "Check #", value: state.tshirtPurchaseCheckNum || "" });
    checkNumInput.addEventListener("input", function () { state.tshirtPurchaseCheckNum = checkNumInput.value; });
    var checkNumRow = el("div", { class: "form-row", style: "display:" + (paymentTypeSelect.value === "Check" ? "" : "none") }, [
      el("span", { class: "form-label", text: "Check #" }), checkNumInput
    ]);
    body.appendChild(checkNumRow);

    var addBtn = el("button", { class: "btn primary" }, ["Add Purchase"]);
    addBtn.addEventListener("click", addTshirtPurchase);
    var actionRow = el("div", { class: "settings-actions" }, [addBtn]);
    if (state.tshirtPurchaseSyncError) actionRow.appendChild(el("div", { class: "form-error", text: state.tshirtPurchaseSyncError }));
    body.appendChild(actionRow);

    var purchases = state.tshirtPurchases.slice().sort(function (a, b) {
      return String(b.purchasedAt || "").localeCompare(String(a.purchasedAt || ""));
    });

    if (!purchases.length) {
      body.appendChild(el("div", { class: "hint", style: "text-align:center; padding:20px" }, ["No purchases recorded yet."]));
    } else {
      var rows = purchases.map(function (p) {
        var delBtn = el("button", { class: "btn", style: "padding:2px 8px; font-size:12px" }, ["Delete"]);
        delBtn.addEventListener("click", function () { removeTshirtPurchase(p.id); });
        return el("tr", {}, [
          el("td", { text: fmtPurchaseTime(p.purchasedAt) }),
          el("td", { text: p.name || "—" }),
          el("td", { text: fmtMoney(p.cost) }),
          // Older purchases recorded before this field existed have no
          // `reason` — fall back to "Walk-in" (the ORIGINAL default/only
          // reason this screen ever supported), not a blank cell.
          el("td", { text: p.reason || "Walk-in" }),
          el("td", { text: p.size || "—" }),
          el("td", { text: p.paymentType || "—" }),
          el("td", { text: p.paymentType === "Check" ? (p.checkNum || "—") : "" }),
          el("td", {}, [delBtn])
        ]);
      });
      var total = purchases.reduce(function (sum, p) { return sum + (Number(p.cost) || 0); }, 0);
      var totalRow = el("tr", {}, [
        el("td", { colspan: "2", style: "text-align:right; font-weight:600", text: purchases.length + " purchase" + (purchases.length === 1 ? "" : "s") + " — Total" }),
        el("td", { style: "font-weight:600", text: fmtMoney(total) }),
        el("td", {}), el("td", {}), el("td", {}), el("td", {}), el("td", {})
      ]);
      body.appendChild(el("table", { class: "matrix" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", { text: "Date/Time" }),
          el("th", { text: "Name" }),
          el("th", { text: "Cost" }),
          el("th", { text: "Reason" }),
          el("th", { text: "Size" }),
          el("th", { text: "Payment Type" }),
          el("th", { text: "Check #" }),
          el("th", { text: "" })
        ])]),
        el("tbody", {}, rows),
        el("tfoot", {}, [totalRow])
      ]));
    }

    var bodyWrap = el("div", { class: "api-page-body" }, [body]);
    var page = el("div", { class: "api-page" }, [head, bodyWrap]);
    host.appendChild(page);
  }

  function init() {
    document.body.appendChild(el("div", { id: "detailHost" }));
    document.body.appendChild(el("div", { id: "printHost" }));
    document.body.appendChild(el("div", { id: "settingsHost" }));
    document.body.appendChild(el("div", { id: "changelogHost" }));
    document.body.appendChild(el("div", { id: "apiHost" }));
    document.body.appendChild(el("div", { id: "tshirtOrderHost" }));
    document.body.appendChild(el("div", { id: "tshirtPurchaseHost" }));
    document.body.appendChild(el("div", { id: "sponsorReportHost" }));
    document.body.appendChild(el("div", { id: "regReportHost" }));
    document.body.appendChild(el("div", { id: "memberReportHost" }));
    document.body.appendChild(el("div", { id: "tshirtReportHost" }));
    document.body.appendChild(el("div", { id: "carshowReportHost" }));
    document.body.appendChild(el("div", { id: "sponsorFormHost" }));
    document.body.appendChild(el("div", { id: "paymentHost" }));
    document.body.appendChild(el("div", { id: "addRegHost" }));
    document.body.appendChild(el("div", { id: "confirmHost" }));
    document.body.appendChild(el("div", { id: "importHelpHost" }));
    document.body.appendChild(el("div", { id: "testsHost" }));
    document.body.appendChild(el("div", { id: "developerLoginHost" }));
    // window.__carshowSite is set (by index.php, before this script runs) —
    // see the declaration comment near SITE_CONFIG above. Read it here, not
    // at module-load time, since init() is what's guaranteed to run after
    // every inline script in the document.
    SITE_CONFIG = window.__carshowSite || {};
    // member-sponsor-form.php redirects here with #sponsors after a successful
    // submission (opened in its own tab from the Sponsors tab's "+ Add
    // Sponsor" button) — land on a fresh Sponsors tab, already showing the
    // new submission, instead of the default Summary tab. The show itself is
    // still whatever the session had open, so this lands in the right year.
    if (location.hash === "#sponsors") state.tab = "sponsors";
    buildHeaderMenu();
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && state.settingsOpen) { closeSettings(); return; }
      if (e.key === "Escape" && state.testsPageOpen) { closeTestsPage(); return; }
      if (e.key === "Escape" && state.developerLoginOpen) { closeDeveloperLogin(); return; }
      if (e.key === "Escape" && state.changelogOpen) { closeChangelog(); return; }
      if (e.key === "Escape" && state.apiPageOpen) { closeApiPage(); return; }
      if (e.key === "Escape" && state.tshirtOrderPageOpen) { closeTshirtOrderPage(); return; }
      if (e.key === "Escape" && state.tshirtPurchasePageOpen) { closeTshirtPurchasePage(); return; }
      if (e.key === "Escape" && state.sponsorReportPageOpen) { closeSponsorReportPage(); return; }
      if (e.key === "Escape" && state.regReportPageOpen) { closeGenReportPage(REG_REPORT_SPEC); return; }
      if (e.key === "Escape" && state.memberReportPageOpen) { closeGenReportPage(MEMBER_REPORT_SPEC); return; }
      if (e.key === "Escape" && state.tshirtReportPageOpen) { closeGenReportPage(TSHIRT_REPORT_SPEC); return; }
      if (e.key === "Escape" && state.carshowReportPageOpen) { closeGenReportPage(CARSHOW_REPORT_SPEC); return; }
      if (e.key === "Escape" && state.sponsorEditing) { closeSponsorForm(); return; }
      if (e.key === "Escape" && state.addRegOpen) { closeAddRegistration(); return; }
      if (e.key === "Escape" && state.showPendingDelete) { cancelDeleteShow(); return; }
      if (e.key === "Escape" && state.clearSponsorsOpen) { closeClearSponsorsConfirm(); return; }
      if (e.key === "Escape" && state.importHelp) { closeImportHelp(); return; }
      if (e.key === "Escape" && state.deleteSelectedOpen) { closeDeleteSelectedConfirm(); return; }
      if (e.key === "Escape" && state.deleteRegSelectedOpen) { closeDeleteRegSelectedConfirm(); return; }
      if (e.key === "Escape" && state.menuOpen) { closeMenu(); return; }
      if (!state.detailRow) return;
      if (e.key === "Escape") { closeDetail(); }
      else if (e.key === "ArrowLeft") stepDetail(-1);
      else if (e.key === "ArrowRight") stepDetail(1);
    });
    renderViews();
    checkForNewVersion();
    setInterval(checkForNewVersion, 5 * 60 * 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Detects a redeploy that happened after this page was loaded. index.php's
  // no-cache headers are correct, but a page can still end up stale for a
  // surprisingly long time in practice — a mobile browser suspending/
  // resuming a tab without a real network fetch, or simply someone leaving
  // the app open for hours across a shift at the show. version-check.json is
  // a plain static file (see build.js), fetched here with a cache-busting
  // query string so no cache anywhere in the chain can return a stale copy
  // of THIS specific request even if it would for a normal page load. Shows
  // a dismissible-by-refreshing banner (renderViews()) rather than forcing a
  // reload, since someone could be mid-edit.
  function checkForNewVersion() {
    if (!SITE_CONFIG.appVersion) return;
    fetch("version-check.php?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.version && data.version !== SITE_CONFIG.appVersion && !state.newVersionAvailable) {
          state.newVersionAvailable = true;
          renderViews();
        }
      }).catch(function () { /* transient network hiccup — just check again next interval */ });
  }

  // Debug/test hook (harmless in production): drive the app without file I/O.
  var API = window.__carshow = {
    get state() { return state; },
    ingestRows: function (regRows, actRows, generatedAt) {
      state.reg = { name: "registration.csv", rows: regRows };
      state.act = actRows ? { name: "activity.csv", rows: actRows } : null;
      regenerate(generatedAt);
    },
    // Called by index.php's boot script with the sponsor list read fresh
    // from the server on this page load.
    // MUST be called before every other ingest (index.php emits it first):
    // until the app knows which show is open it can't decide whether to
    // render the picker or the tabs, and CONFIG.title has to be right before
    // ingestRows() bakes it into state.result.meta.title.
    ingestShows: function (shows, publicYear, openYear) {
      state.shows = (Array.isArray(shows) ? shows.slice() : []).sort(function (a, b) {
        return (Number(b.year) || 0) - (Number(a.year) || 0);
      });
      state.publicShowYear = publicYear ? String(publicYear) : null;
      var open = null;
      if (openYear) {
        var wanted = String(openYear);
        state.shows.forEach(function (s) { if (String(s.year) === wanted) open = s; });
      }
      state.currentShow = open;
      applyShowTitle();
      // One assignment covers every place the event name surfaces - the
      // Summary panel heading, all four print report headers and both Excel
      // exports read it through state.result.meta.title.
      if (open) CONFIG.title = LOGIC.showRegistrationTitle(open);
      renderViews();
    },
    ingestSponsors: function (list) {
      state.sponsors = Array.isArray(list) ? list : [];
      backfillSponsorDonations();
      renderViews();
    },
    // Called by index.php's boot script with the Walk-In registrations list
    // read fresh from the server on this page load.
    ingestWalkins: function (list) {
      state.walkins = Array.isArray(list) ? list : [];
      renderViews();
    },
    // Called by index.php's boot script with the day-of-event t-shirt
    // purchases list read fresh from the server on this page load.
    ingestTshirtPurchases: function (list) {
      state.tshirtPurchases = Array.isArray(list) ? list : [];
      renderTshirtPurchasePage();
    },
    // Called by index.php's boot script with the History tab's import log
    // read fresh from the server on this page load — see
    // registrations-upload.php / registrations-import.php, which each append
    // one entry per successful import.
    ingestImportHistory: function (list) {
      state.importHistory = Array.isArray(list) ? list : [];
    },
    // Called by index.php's boot script with the judging-day Dash # map read
    // fresh from the server on this page load — see the dashNumbers state
    // field above and ensureDashNumbers() below.
    ingestDashNumbers: function (map) {
      state.dashNumbers = (map && typeof map === "object") ? map : {};
    },
    // Called by index.php's boot script with the member roster read fresh
    // from the server on this page load — used by the Add Registration
    // form's member lookup.
    ingestMembers: function (list) {
      state.members = Array.isArray(list) ? list : [];
    },
    // Called by index.php's boot script with sponsor payment records read
    // fresh from the server on this page load.
    ingestPayments: function (list) {
      state.payments = Array.isArray(list) ? list : [];
      backfillPaymentDefaults();
      renderViews();
    },
    // Called by index.php's boot script with app-wide settings read fresh
    // from the server on this page load.
    ingestAppSettings: function (settings) {
      if (settings && typeof settings === "object") {
        Object.keys(settings).forEach(function (k) { state.appSettings[k] = settings[k]; });
      }
    },
    // Called by index.php's boot script, BEFORE ingestRows(), with the set of
    // csvRegKey()s previously deleted via the Registration tab's checkbox
    // bulk-delete — so regenerate() can exclude them the moment the CSV is
    // parsed, not just after the fact.
    ingestDeletedRegistrations: function (keys) {
      state.deletedCsvKeys = {};
      (Array.isArray(keys) ? keys : []).forEach(function (k) { state.deletedCsvKeys[k] = true; });
    },
    // Called by index.php's boot script, BEFORE ingestRows(), with the set of
    // csvSponsorId()s previously deleted via the Sponsors tab's Delete — so
    // syncSponsorsFromRegistrations() (triggered by ingestRows) excludes them
    // the moment the CSV is parsed, not just after the fact.
    ingestDeletedSponsors: function (ids) {
      state.deletedSponsorIds = {};
      (Array.isArray(ids) ? ids : []).forEach(function (id) { state.deletedSponsorIds[id] = true; });
    },
    // Called by index.php's boot script, BEFORE ingestRows(), with the
    // csvRegKey() -> patch map of prior detail-modal edits to CSV rows.
    ingestRegistrationOverrides: function (overrides) {
      state.csvOverrides = (overrides && typeof overrides === "object") ? overrides : {};
    },
    openAddRegistration: openAddRegistration,
    closeAddRegistration: closeAddRegistration,
    setTab: function (t) { state.tab = t; renderViews(); },
    setSearch: function (q) { state.search = q; renderRegBody(); },
    openDetail: openDetail,
    closeDetail: closeDetail,
    stepDetail: stepDetail,
    openSettings: openSettings,
    closeSettings: closeSettings,
    runRegressionTests: runRegressionTests,
    openSponsorForm: openSponsorForm,
    closeSponsorForm: closeSponsorForm,
    openClearSponsorsConfirm: openClearSponsorsConfirm,
    closeClearSponsorsConfirm: closeClearSponsorsConfirm,
    clearAllSponsors: clearAllSponsors,
    setSponsorSelected: setSponsorSelected,
    toggleSelectAllSponsors: toggleSelectAllSponsors,
    openDeleteSelectedConfirm: openDeleteSelectedConfirm,
    closeDeleteSelectedConfirm: closeDeleteSelectedConfirm,
    deleteSelectedSponsors: deleteSelectedSponsors,
    backfillIndividualSponsorPayments: backfillIndividualSponsorPayments
  };
  return (window.CarShow = API);
})();
