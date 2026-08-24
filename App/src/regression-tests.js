/* regression-tests.js — assertions against the frozen synthetic fixture,
 * shared by the Node CLI (test/run-tests.js) and the in-app Settings ->
 * Run Regression Tests button, so both stay in sync automatically instead
 * of drifting apart as two hand-copied assertion lists.
 *
 * Fixture scenario: a judged member (Alice) with a free + paid shirt, a
 * non-member (Bob) with no year/club, and a cancelled sponsor (Sponsor)
 * whose Individual Sponsorship activity grants a bonus free shirt from a
 * different column. Fabricated data, not real member info.
 *
 * NOTE: UI-only features and payment tracking are tested manually in the
 * app's Developer > Run Regression Tests UI:
 * - Payment modal with amount, date, type, check # fields
 * - Payment columns in sponsor table (Date, Type, Check #, Amount)
 * - Zoom controls on Sponsors tab
 * - Autosave on registration detail and sponsor edit modals
 * - Detail modal always-editable pattern
 * - Backfill default payments for individual sponsors ($100 Credit Card, regDate)
 * - Payment recording in Edit Sponsor modal
 * - Member Report (Reports tab): rows sorted by Last Name, Reg # column shows
 *   each member's Member Number, independent of any loaded registration CSV
 * This file covers logic layer and Excel export round-trip only.
 */
(function (root) {
  "use strict";
  var LOGIC = root.CarShowLogic ||
    (typeof require !== "undefined" ? require("./logic.js") : null);
  var EXCEL = root.CarShowExcel ||
    (typeof require !== "undefined" ? require("./excel.js") : null);
  var CONFIG = root.CarShowConfig ||
    (typeof require !== "undefined" ? require("./config.js") : null);

  function eq(results, actual, expected, label) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    results.push({ label: label, ok: ok, expected: expected, actual: actual });
  }

  // Logic-layer assertions (generate()) against the fixture. Returns
  // { out, results } — callers needing the Excel round-trip too pass `out`
  // into excelAssertionList so generate() only runs once.
  function assertionList(reg, act) {
    var results = [];
    var out = LOGIC.generate(reg, act, { regFileName: "registration.csv", actFileName: "activity.csv" });

    eq(results, out.ok, true, "generate ok");
    eq(results, out.meta.errorCount, 0, "zero errors");
    eq(results, out.summary.registrations, 3, "Registrations = 3");
    eq(results, out.summary.attendees, 3, "Attendees = 3");
    eq(results, out.summary.funds, 245, "Funds = 245");
    // Only Bob (the fixture's one non-member) gets auto-numbered — walk-in
    // placeholder rows were removed from generate() this session (see
    // PROJECT_STATUS.md); 8002 is the next slot after Bob's 8001, not the
    // old 8027 (which counted 25 now-nonexistent placeholder rows too).
    eq(results, out.summary.nextMemberNumber, 8002, "Next member # = 8002");

    var s = out.summary.shirtTotals;
    eq(results, s.MensFreeSM, 1, "Men's Free SM = 1 (sponsorship bonus shirt)");
    eq(results, s.MensFreeLG, 1, "Men's Free LG = 1 (Bob's free shirt)");
    eq(results, s.MensFreeXLG, 1, "Men's Free XLG = 1 (Sponsor's own free shirt)");
    eq(results, s.WomensFreeMED, 1, "Women's Free MED = 1 (Alice's free shirt)");
    eq(results, s.WomensXtraSM, 1, "Women's Xtra SM = 1 (Alice's paid additional shirt)");
    var nonZero = Object.keys(s).filter(function (k) { return s[k] !== 0; }).sort();
    eq(results, nonZero, ["MensFreeSM", "MensFreeLG", "MensFreeXLG", "WomensFreeMED", "WomensXtraSM"].sort(), "only those 5 shirt buckets non-zero");

    var c6 = out.summary.gens.filter(function (g) { return g.gen === "C6"; })[0];
    eq(results, c6.atEvent, 1, "C6 At Event = 1 (Alice, 2010)");
    eq(results, c6.inCarShow, 1, "C6 In Car Show = 1 (Alice judged Yes)");
    var c8 = out.summary.gens.filter(function (g) { return g.gen === "C8"; })[0];
    eq(results, c8.atEvent, 1, "C8 At Event = 1 (Sponsor, 2022)");
    eq(results, c8.inCarShow, 0, "C8 In Car Show = 0 (Sponsor judged No)");
    var otherGensNonZero = out.summary.gens.filter(function (g) { return g.gen !== "C6" && g.gen !== "C8" && (g.atEvent || g.inCarShow); });
    eq(results, otherGensNonZero.length, 0, "no other generations populated");

    eq(results, out.summary.clubs, [{ name: "Sample Club", attendees: 2 }, { name: "Unknown", attendees: 1 }], "club tally");
    eq(results, out.messages.length, 0, "no messages — sponsorship handled without warning");

    eq(results, out.registrations.length, 3, "3 table rows");
    // Every CSV-derived row is unconditionally "Pre-Registered" — walk-in
    // rows (Reg Type WALKIN_MEMBER/WALKIN_NONMEMBER) only ever come from the
    // Registration tab's Add Registration form (buildManualRegistration in
    // this same logic.js), a separate code path generate() never touches.
    var regTypes = out.registrations.map(function (r) { return r["Reg Type"]; });
    eq(results, regTypes, ["Pre-Registered", "Pre-Registered", "Pre-Registered"], "all 3 rows are Pre-Registered");
    var alice = out.registrations.filter(function (r) { return r["First Name"] === "Alice"; })[0];
    eq(results, alice["Reg #"], 100, "Alice keeps her own member #");
    eq(results, alice["Phone"], "(555) 555-0100", "Alice phone formatted");
    eq(results, alice["Gen"], "C6", "Alice gen C6");
    eq(results, alice["In Car Show?"], "Yes", "Alice In Car Show? = Yes");
    var bob = out.registrations.filter(function (r) { return r["First Name"] === "Bob"; })[0];
    eq(results, bob["Reg #"], 8001, "Bob (non-member) assigned 8001");
    var sponsor = out.registrations.filter(function (r) { return r["First Name"] === "Sponsor"; })[0];
    eq(results, sponsor["Status"], "Cancelled", "Sponsor row kept (showCancelled=true)");
    eq(results, Number(sponsor["Total Fee"]), 140, "Sponsor fee = 140");
    eq(results, Number(sponsor["Individual Sponsorship"]), 100, "Sponsor's Individual Sponsorship column = 100");
    eq(results, alice["Individual Sponsorship"], "", "Alice (no sponsorship activity) has blank Individual Sponsorship");
    eq(results, out.summary.sponsorship, 100, "summary.sponsorship = 100");
    // Individual Sponsorship Text has no CSV source — generate() defaults it
    // to "First [and Spouse] Last" whenever Individual Sponsorship > 0 and
    // it's still blank (see applySponsorshipTextDefault in logic.js).
    eq(results, sponsor["Ind. Spon. Text"], "Sponsor Sample", "Sponsor's Individual Sponsorship Text defaults to their name");
    eq(results, alice["Ind. Spon. Text"], "", "Alice (no sponsorship) has blank Individual Sponsorship Text");
    eq(results, sponsor["Spouse First Name"], "", "Spouse First Name has no CSV source — always blank on a fresh CSV row");

    eq(results, out.registrations[0]["Last Name"], "Sample", "first row sorts to Sample");

    manualRegistrationAssertions(results);
    pickLatestPaymentAssertions(results);
    multiShowAssertions(results);

    return { out: out, results: results };
  }

  // buildManualRegistration() — the Registration tab's "+ Add Registration"
  // form (Walk-In Member/Nonmember) builds records with this pure function
  // instead of going through generate(); covered separately since it's a
  // distinct code path generate()'s own assertions above never exercise.
  function manualRegistrationAssertions(results) {
    var member = LOGIC.buildManualRegistration({
      id: "wk_test1",
      regType: "Walk-In Member",
      lastName: "Test", firstName: "Marty",
      memberNumber: "42",
      clubName: "ETCC", phone: "555-1212", email: "marty@example.com",
      address: "1 Main St", city: "Knoxville", state: "TN", zip: "37918",
      year: "1965", model: "Corvette", color: "Red",
      inCarShow: "Yes", freeTShirtSize: "Men's Large",
      totalFee: "50", status: "Paid", regDate: "7/10/2026 6:00 PM"
    });
    eq(results, member["Reg Type"], "Walk-In Member", "manual: Reg Type preserved");
    eq(results, member["Reg #"], 42, "manual: typed Reg # kept, coerced to a number");
    eq(results, member["#"], 1, "manual: attendee count always 1");
    eq(results, member["Gen"], "C2", "manual: Gen derived from Year (1965 -> C2)");
    eq(results, member["Men's Free LG"], 1, "manual: free shirt bucket bumped from FreeTShirtSize");
    eq(results, member["Total Fee"], 50, "manual: Total Fee coerced to a number");
    eq(results, member.id, "wk_test1", "manual: id passed through");

    var nonmember = LOGIC.buildManualRegistration({
      regType: "Walk-In Nonmember",
      lastName: "Test", firstName: "Nora",
      memberNumber: "", nextAvailableMemberNumber: 2005,
      freeTShirtSize: "", inCarShow: "No", status: "Not Paid"
    });
    eq(results, nonmember["Reg #"], 2005, "manual: blank Reg # falls back to nextAvailableMemberNumber");
    eq(results, nonmember["FreeTShirtSize"], "", "manual: no shirt picked -> no bucket bumped");
    var shirtSum = CONFIG.SHIRT_BUCKETS.reduce(function (sum, b) { return sum + (nonmember[b.col] || 0); }, 0);
    eq(results, shirtSum, 0, "manual: all 24 shirt buckets zero when no size picked");

    sponsorshipTextAssertions(results);
  }

  // applySponsorshipTextDefault() — no CSV/fixture row happens to exercise
  // the "and Spouse" branch (see generate()'s own assertions above), so it's
  // covered directly here instead.
  function applyText(rec) { LOGIC.applySponsorshipTextDefault(rec); return rec["Ind. Spon. Text"]; }
  function sponsorshipTextAssertions(results) {
    eq(results, applyText({ "First Name": "John", "Last Name": "Doe", "Individual Sponsorship": 100, "Ind. Spon. Text": "" }),
      "John Doe", "sponsorship text: defaults to 'First Last' with no spouse");
    eq(results, applyText({ "First Name": "John", "Spouse First Name": "Jane", "Last Name": "Doe", "Individual Sponsorship": 100, "Ind. Spon. Text": "" }),
      "John and Jane Doe", "sponsorship text: 'First and Spouse Last' when Spouse First Name is set");
    eq(results, applyText({ "First Name": "John", "Last Name": "Doe", "Individual Sponsorship": 0, "Ind. Spon. Text": "" }),
      "", "sponsorship text: stays blank when Individual Sponsorship is 0");
    eq(results, applyText({ "First Name": "John", "Last Name": "Doe", "Individual Sponsorship": 100, "Ind. Spon. Text": "Custom Text" }),
      "Custom Text", "sponsorship text: never overwrites an already-set value");
  }

  // LOGIC.pickLatestPayment() — regression test for a real bug this session:
  // editing a sponsor's payment (e.g. Cash -> Credit Card) and saving
  // same-day silently appeared to do nothing, because the Sponsors tab
  // picked the "latest" payment by comparing `date` (a plain calendar day
  // both the old and new payment share) instead of `recordedAt` (a real
  // timestamp). A stable sort on a `date`-only comparator would keep
  // whichever payment was recorded first — the stale one — even though the
  // second, newer payment is what should actually be shown.
  function pickLatestPaymentAssertions(results) {
    var sameDayPayments = [
      { id: "pay1", date: "2026-07-12", amount: 100, paymentType: "Cash", recordedAt: "2026-07-12T12:00:00.000Z" },
      { id: "pay2", date: "2026-07-12", amount: 100, paymentType: "Credit Card", recordedAt: "2026-07-12T15:43:44.011Z" }
    ];
    eq(results, LOGIC.pickLatestPayment(sameDayPayments).id, "pay2",
      "pickLatestPayment: same-day payments resolved by recordedAt, not date");
    eq(results, LOGIC.pickLatestPayment([]), null, "pickLatestPayment: empty list returns null");
  }

  // ---- Car shows (one per year) ----
  // The app keeps a separate dataset per show year under data/<year>/ on the
  // server, and the year travels as ?year= on every endpoint URL. Two rules
  // hold that together, and both live in logic.js so this suite and the app
  // exercise the same code:
  //   validShowYear()          — mirrors carshow_valid_year() in deploy/lib.php
  //   showRegistrationTitle()  — what every report header/export is named
  // The server re-validates independently (each endpoint 400s on a bad year),
  // so a regression here is a usability bug, not a security hole — but the
  // strict 4-digit shape is what keeps a year from ever becoming a path
  // segment it shouldn't be, so it's worth pinning down.
  function multiShowAssertions(results) {
    var valid = LOGIC.validShowYear;
    eq(results, valid("2026"), "2026", "show year: a plain four-digit year is accepted");
    eq(results, valid(2026), "2026", "show year: a number is accepted and normalized to a string");
    eq(results, valid("  2026  "), "2026", "show year: surrounding whitespace is trimmed");
    eq(results, valid(""), null, "show year: empty is rejected");
    eq(results, valid(null), null, "show year: null is rejected");
    eq(results, valid(undefined), null, "show year: undefined is rejected");
    eq(results, valid("20x6"), null, "show year: non-digits are rejected");
    eq(results, valid("202"), null, "show year: three digits are rejected");
    eq(results, valid("20266"), null, "show year: five digits are rejected");
    // The path-traversal shapes specifically — data/<year>/ is built by
    // string concatenation server-side, so these must never survive.
    eq(results, valid("../2026"), null, "show year: a relative path is rejected");
    eq(results, valid("2026/.."), null, "show year: a trailing path segment is rejected");
    eq(results, valid("2026 2027"), null, "show year: two years are rejected");

    var title = LOGIC.showRegistrationTitle;
    eq(results, title({ year: 2026, name: "2026 Car Show" }), "2026 Car Show Registration List",
      "show title: derived from the show's name");
    eq(results, title({ year: 2027, name: "  2027 Car Show  " }), "2027 Car Show Registration List",
      "show title: the show name is trimmed");
    // With no show (or an unnamed one) the title falls back to CONFIG.title,
    // which is what the offline tool and these fixtures run with.
    eq(results, title(null), CONFIG.title, "show title: falls back to CONFIG.title with no show");
    eq(results, title({ year: 2026, name: "" }), CONFIG.title, "show title: falls back when the name is blank");

    // CONFIG.title must stay year-free: it's only a fallback now, and a
    // hardcoded year there would silently mislabel every report in any show
    // whose name failed to load.
    eq(results, /\b(19|20)[0-9]{2}\b/.test(CONFIG.title), false,
      "CONFIG.title carries no hardcoded year (it's a fallback; ingestShows sets the real one)");
  }

  // Excel export round-trip (build a workbook, reload it, check shape).
  function excelAssertionList(out, ExcelJS) {
    var results = [];
    return Promise.resolve().then(function () {
      var wb = EXCEL.build(ExcelJS, out);
      return wb.xlsx.writeBuffer();
    }).then(function (buf) {
      var wb2 = new ExcelJS.Workbook();
      return wb2.xlsx.load(buf).then(function () { return wb2; });
    }).then(function (wb2) {
      var reg = wb2.getWorksheet("RegistrationSheet");
      var sum = wb2.getWorksheet("SummarySheet");
      eq(results, !!reg, true, "RegistrationSheet exists");
      eq(results, !!sum, true, "SummarySheet exists");
      eq(results, reg.getCell(1, 1).value, out.meta.title, "title row A1");
      eq(results, reg.getCell(2, 1).value, "Reg #", "header A2 = Reg #");
      eq(results, reg.actualRowCount, 5, "reg sheet has 5 rows (title + header + 3 fixture rows)");
      eq(results, !!reg.autoFilter, true, "autofilter set");
      eq(results, reg.views[0].state, "frozen", "frozen panes");
      var feeCol = out.columns.indexOf("Total Fee") + 1;
      var sawMoney = false;
      reg.eachRow(function (row) { var c = row.getCell(feeCol); if (c.numFmt && /\$/.test(c.numFmt)) sawMoney = true; });
      eq(results, sawMoney, true, "Total Fee column has $ number format");
      var shirtColsInExcel = out.shirtColumns.filter(function (c) { return out.columns.indexOf(c) !== -1; });
      eq(results, shirtColsInExcel.length, 24, "Excel export still has all 24 shirt columns");
      return results;
    });
  }

  var API = { assertionList: assertionList, excelAssertionList: excelAssertionList };
  root.CarShowRegressionTests = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
