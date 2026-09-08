/* excel.js — build an .xlsx workbook from a generate() result.
 * Works in browser and Node (pass in the ExcelJS module either way).
 * build(ExcelJS, result) -> ExcelJS.Workbook
 */
(function (root) {
  "use strict";
  var CONFIG = root.CarShowConfig ||
    (typeof require !== "undefined" ? require("./config.js") : null);

  var GREY = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF1F4" } };
  var YELLOW = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7CC" } };
  var THIN = { style: "thin", color: { argb: "FFD5DAE0" } };
  function border() { return { top: THIN, left: THIN, bottom: THIN, right: THIN }; }

  function fmtDate(d) {
    d = d instanceof Date ? d : new Date(d);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    var h = d.getHours(), ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear() + " " + h + ":" + p(d.getMinutes()) + " " + ap;
  }
  function isShirt(res, c) { return res.shirtColumns.indexOf(c) !== -1; }

  // sponsors is optional (Sponsors tab data, independent of the CSV-driven res).
  function build(ExcelJS, res, sponsors) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "ETCC Car Show app";
    if (res) {
      regSheet(wb, res);
      summarySheet(wb, res);
    }
    if (sponsors && sponsors.length) sponsorSheet(wb, sponsors);
    if (res && res.messages && res.messages.length) messageSheet(wb, res);
    return wb;
  }

  function sponsorTypeLabel(key) {
    var t = CONFIG.SPONSOR_TYPES.filter(function (x) { return x.key === key; })[0];
    return t ? t.label : (key || "");
  }

  var SPONSOR_COLS = [
    { key: "name", label: "Sponsor Name", width: 22 },
    { key: "contactPerson", label: "Contact Person", width: 18 },
    { key: "phone", label: "Phone", width: 15 },
    { key: "email", label: "Email", width: 26 },
    { key: "address", label: "Address", width: 24 },
    { key: "website", label: "Website", width: 22 },
    { key: "etccMemberName", label: "Member", width: 20 },
    { key: "sponsorType", label: "Sponsor Type", width: 18 },
    { key: "individualSponsorshipText", label: "Ind. Spon. Text", width: 22 },
    { key: "shirtSize", label: "T-Shirt", width: 18 }
  ];

  function sponsorSheet(wb, sponsors) {
    var ws = wb.addWorksheet("SponsorsSheet", { views: [{ state: "frozen", ySplit: 1 }] });
    SPONSOR_COLS.forEach(function (c, i) {
      var cell = ws.getCell(1, i + 1);
      cell.value = c.label; cell.font = { bold: true }; cell.fill = GREY; cell.border = border();
      ws.getColumn(i + 1).width = c.width;
    });
    sponsors.forEach(function (s, ri) {
      SPONSOR_COLS.forEach(function (c, ci) {
        var v = c.key === "sponsorType" ? sponsorTypeLabel(s.sponsorType) : s[c.key];
        var cell = ws.getCell(2 + ri, ci + 1);
        cell.value = v || ""; cell.border = border();
      });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: SPONSOR_COLS.length } };
    return ws;
  }

  function regSheet(wb, res) {
    var cols = res.columns, n = cols.length;
    var ws = wb.addWorksheet("RegistrationSheet", { views: [{ state: "frozen", xSplit: 4, ySplit: 2 }] });
    ws.mergeCells(1, 1, 1, n);
    var t = ws.getCell(1, 1);
    t.value = res.meta.title; t.font = { bold: true, size: 16 }; t.alignment = { horizontal: "center" }; t.fill = YELLOW;
    ws.getRow(1).height = 24;
    cols.forEach(function (c, i) {
      var cell = ws.getCell(2, i + 1);
      cell.value = c; cell.font = { bold: true }; cell.fill = GREY; cell.border = border();
      cell.alignment = { horizontal: isShirt(res, c) ? "center" : "left" };
    });
    ws.getRow(2).height = 22;
    res.registrations.forEach(function (rec, ri) {
      var row = ws.getRow(3 + ri);
      cols.forEach(function (c, ci) {
        var cell = row.getCell(ci + 1), v = rec[c];
        if (isShirt(res, c)) { cell.value = Number(v) > 0 ? Number(v) : null; cell.alignment = { horizontal: "center" }; }
        else if (c === "Total Fee" || c === "Individual Sponsorship") { if (v !== "" && v != null) { cell.value = Number(v); cell.numFmt = "$#,##0.00"; } }
        else if (c === "Reg #" || c === "Year" || c === "#") { cell.value = (v === "" || v == null) ? null : Number(v); }
        else { cell.value = (v === "" || v == null) ? null : v; }
        cell.border = border();
      });
    });
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: n } };
    var widthFor = { "Reg Type": 18, "Email": 26, "Address": 22, "Club Name": 16, "Last Name": 14, "First Name": 12, "Spouse First Name": 14, "Status": 18, "Reg Date": 18, "FreeTShirtSize": 15, "FreeTShirtSize Comments": 16, "Phone": 15, "Payment Type": 14, "Check #": 10 };
    ws.columns.forEach(function (col, i) {
      var name = cols[i];
      col.width = widthFor[name] || (isShirt(res, name) ? 7 : Math.min(Math.max(name.length + 2, 8), 20));
    });
    return ws;
  }

  function summarySheet(wb, res) {
    var s = res.summary, m = res.meta, C = CONFIG;
    var ws = wb.addWorksheet("SummarySheet");
    [22, 16, 16, 16, 16].forEach(function (w, i) { ws.getColumn(i + 1).width = w; });
    var r = 1;
    function section(title) { var c = ws.getCell(r, 1); c.value = title; c.font = { bold: true, size: 13 }; c.fill = YELLOW; ws.mergeCells(r, 1, r, 5); r++; }
    function kv(k, v) { ws.getCell(r, 1).value = k; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 2).value = v; r++; }

    section(res.meta.title);
    kv("Generated", fmtDate(m.generatedAt));
    kv("Status", m.statusMessage);
    kv("Registration File", m.regFileName + " (" + m.regRows + " rows)");
    kv("Activity File", m.actFileName ? m.actFileName + " (" + m.actRows + " rows)" : "none");
    r++;
    section("Registration");
    kv("Attendees", s.attendees);
    kv("Registrations", s.registrations);
    ws.getCell(r, 1).value = "Funds"; ws.getCell(r, 1).font = { bold: true };
    var fv = ws.getCell(r, 2); fv.value = Number(s.funds); fv.numFmt = "$#,##0.00"; r++;
    kv("Next Available Member Number", s.nextMemberNumber);
    r++;
    section("Shirts");
    ws.getCell(r, 1).value = "Size"; ws.getCell(r, 1).font = { bold: true };
    C.GROUPS.forEach(function (g, i) { var c = ws.getCell(r, 2 + i); c.value = g.label; c.font = { bold: true }; });
    r++;
    C.SIZES.forEach(function (sz) {
      ws.getCell(r, 1).value = sz.label; ws.getCell(r, 1).font = { bold: true };
      C.GROUPS.forEach(function (g, i) { ws.getCell(r, 2 + i).value = s.shirtTotals[g.key + sz.key] || 0; });
      r++;
    });
    r++;
    section("Car Show");
    kv("Judges", s.judges);
    ["Generation", "Years", "At Event", "In Car Show"].forEach(function (h, i) { var c = ws.getCell(r, 1 + i); c.value = h; c.font = { bold: true }; });
    r++;
    s.gens.forEach(function (g) {
      ws.getCell(r, 1).value = g.gen; ws.getCell(r, 2).value = g.from + "-" + g.to;
      ws.getCell(r, 3).value = g.atEvent; ws.getCell(r, 4).value = g.inCarShow; r++;
    });
    r++;
    section("Clubs");
    ws.getCell(r, 1).value = "Club"; ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 2).value = "Attendees"; ws.getCell(r, 2).font = { bold: true }; r++;
    s.clubs.forEach(function (c) { ws.getCell(r, 1).value = c.name; ws.getCell(r, 2).value = c.attendees; r++; });
    return ws;
  }

  function messageSheet(wb, res) {
    var ws = wb.addWorksheet("MessageSheet");
    ws.getColumn(1).width = 80;
    res.messages.forEach(function (msg, i) { ws.getCell(i + 1, 1).value = msg; });
    return ws;
  }

  // ---------------------------------------------------------------------
  // Judging Tally Sheet — the paper roster judges use at the show, grouped
  // by generation with a Dash # (see app.js's ensureDashNumbers()) so votes
  // written against a number on the sheet can be matched back to the car
  // wearing that number on its window card. Modeled directly on the club's
  // own paper template (Z:\Backup\ETCC\Car Show\Forms\Tally Sheet.xlsx):
  // same column set/order and the same per-generation block layout, with a
  // few blank Dash#-only rows left after each generation's real entrants
  // for a late walk-in car to be added by hand on show day.
  // ---------------------------------------------------------------------
  var TALLY_BUFFER_ROWS = 3;
  var TALLY_HEADERS = ["Car Class", "Dash #", "General Votes", "Best of Show Votes", "Owner", "Year", "Color"];
  var TALLY_COL_WIDTHS = [8, 8, 13, 15, 28, 8, 20];

  // cars: [{ gen, dashNumber, owner, year, color }, ...] — already filtered
  // to "In Car Show?" = Yes and already dash-numbered by the caller.
  // meta: { title, generatedAt, generations: CONFIG.corvetteGenerations }.
  function buildTallySheet(ExcelJS, cars, meta) {
    cars = cars || [];
    meta = meta || {};
    var generations = meta.generations || [];
    var wb = new ExcelJS.Workbook();
    wb.creator = "ETCC Car Show app";
    var ws = wb.addWorksheet("TallySheet", { views: [{ state: "frozen", ySplit: 2 }] });
    TALLY_COL_WIDTHS.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });

    var note = ws.getCell(1, 1);
    note.value = (meta.title || "Car Show") + " \u2014 Judging Tally Sheet \u2014 generated " + fmtDate(meta.generatedAt || new Date());
    note.font = { italic: true, size: 10 };
    ws.mergeCells(1, 1, 1, TALLY_HEADERS.length);

    TALLY_HEADERS.forEach(function (h, i) {
      var c = ws.getCell(2, i + 1);
      c.value = h; c.font = { bold: true }; c.fill = GREY; c.border = border();
    });

    var r = 3;
    function dataRow(vals) {
      vals.forEach(function (v, i) {
        var c = ws.getCell(r, i + 1);
        c.value = (v === undefined || v === "") ? null : v;
        c.border = border();
      });
      r++;
    }

    generations.forEach(function (g, gi) {
      var base = (gi + 1) * 100;
      var inGen = cars
        .filter(function (c) { return c.gen === g.gen; })
        .sort(function (a, b) { return (a.dashNumber || 0) - (b.dashNumber || 0); });
      // Buffer numbers continue from the highest ASSIGNED number in this
      // generation's block, not just from the count of cars — a car deleted
      // after its dash number was assigned leaves a gap, which is expected
      // (that number was already printed on a physical window card) rather
      // than something to fill in.
      var highest = base - 1;
      inGen.forEach(function (c) { if (c.dashNumber > highest) highest = c.dashNumber; });
      if (highest < base) highest = base - 1;

      if (!inGen.length) {
        dataRow([g.gen, base, "", "", "", "", ""]);
        for (var n = 1; n <= TALLY_BUFFER_ROWS; n++) dataRow([null, base + n, "", "", "", "", ""]);
      } else {
        inGen.forEach(function (c, ci) {
          dataRow([ci === 0 ? g.gen : null, c.dashNumber, "", "", c.owner || "", c.year || "", c.color || ""]);
        });
        for (var b = 1; b <= TALLY_BUFFER_ROWS; b++) dataRow([null, highest + b, "", "", "", "", ""]);
      }
      r++; // one blank separator row between generations, matching the paper template
    });

    // ---- Summary block — same column layout (D=label, F=count, G=percent)
    // as the paper template's own totals section. Counts are written as
    // plain values (not live SUM formulas) since the sheet is a point-in-
    // time snapshot regenerated fresh every time it's downloaded.
    r++;
    ws.getCell(r, 4).value = "Total Cars Entered in the show";
    ws.getCell(r, 4).font = { bold: true };
    ws.getCell(r, 6).value = cars.length;
    r += 2;
    ws.getCell(r, 4).value = "Cars by category";
    ws.getCell(r, 4).font = { bold: true };
    r++;
    generations.forEach(function (g) {
      var count = cars.filter(function (c) { return c.gen === g.gen; }).length;
      ws.getCell(r, 4).value = g.gen;
      ws.getCell(r, 6).value = count;
      var pct = ws.getCell(r, 7);
      pct.value = cars.length ? count / cars.length : 0;
      pct.numFmt = "0%";
      r++;
    });
    r++;
    ["Most participation from visiting club", "Best of Show", "Dealers Choice"].forEach(function (label) {
      ws.getCell(r, 4).value = label;
      r++;
    });

    return wb;
  }

  var API = { build: build, buildTallySheet: buildTallySheet };
  root.CarShowExcel = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
