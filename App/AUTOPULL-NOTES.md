# Getting data out of ClubExpress automatically — investigation & outcome

**Question:** can we skip the manual "export two CSVs from ClubExpress" step?

## What the research found

- ClubExpress's Web Services/API program is early-stage — publicly it starts with a
  *membership-verification* service. Admins report difficulty even getting API docs.
  There is **no confirmed API** for pulling Registration Data / Activity Registrant
  Data exports.
  - ClubExpress Help Center — Data Exports: https://help.clubexpress.com/hc/en-us/articles/24789848758939-Data-Exports
  - ClubExpress Help Center — About Web Services: https://help.clubexpress.com/hc/en-us/articles/24623082171291-About-Web-Services
- A fully **offline `file://` app** (which is what `ETCCCarShow.html` is) can't call
  ClubExpress directly anyway — browser CORS rules block it, and there's nowhere safe in
  a local file to keep a login.

## Outcome: built a browser-automation skill instead

Rather than wait on ClubExpress or store credentials anywhere, we automated the *manual
UI steps themselves*. The current skill is
`C:\Users\Admin\.claude\skills\ETCCCarShowImportData\SKILL.md` — run it with
`/ETCCCarShowImportData` in a Claude Code session. It also runs the upload step
(`deploy/upload-registrations.js`), so one command takes ClubExpress → live site.

> **History:** this was originally `/export-carshow-data`, then
> `/ETCCGetCarShowRegistrations` (deleted in a bulk skill cleanup — see `PROJECT_STATUS.md`;
> its old content is recoverable from the `ClaudeConfig` repo at commit `ebffe87` if ever
> needed), then `/ETCCCarShowSyncRegistrations` once the upload step was added, renamed
> again to `/ETCCCarShowImportData` on 2026-09-11.

How it works:
- You stay logged into ClubExpress in Chrome as normal — the skill never sees or enters
  a password. It only drives clicks in your already-authenticated tab (via the Claude in
  Chrome extension): Admin Options → Exports → Registration Data → Export, then the same
  for Activity Registrant Data.
- It finds each downloaded CSV (by newest-file-in-Downloads, since ClubExpress's own
  download filename isn't predictable) and saves it into
  `Z:\Backup\ETCC\Car Show\Exports\` using the same `registration_data<date>.csv` /
  `activity_registrant_data<date>.csv` naming already used there — so the app's drop
  zone (or a future "watch this folder" step) just works.
- It requires the Claude in Chrome extension to be installed and connected. Your
  ClubExpress login still never touches disk — that constraint hasn't changed, and is
  why the skill stops dead rather than ever typing credentials.
- **It now also runs on a schedule** (added 2026-09-11): a `carshow-sync-registrations`
  scheduled task fires at 9:00 AM and 4:00 PM daily and invokes the skill. This is not a
  true unattended cron — scheduled tasks only fire while the Claude desktop app is open,
  and a run still needs Chrome connected and a live ClubExpress session. Runs that land
  when you're away simply stop and say why; that's expected, not a failure. The site
  password for the upload step comes from the `CARSHOW_SITE_PASSWORD` Windows user
  environment variable, which lives in the user profile — not in this repo or in git.

**Status: live-tested and working (2026-07-07, re-tested 2026-09-11 under the current
`/ETCCCarShowImportData` name).** Ran `/ETCCGetCarShowRegistrations` (then
named `/export-carshow-data`) end to end:
landed directly on the event's Admin Panel (already logged in — no separate "Admin
Options" click needed, that button doubles as the panel itself), opened Exports, pulled
both Registration Data and Activity Registrant Data, and saved them into the Exports
folder. One hiccup along the way: the export dialog resizes itself after you pick a
report type (a Status filter and the Export button appear below the fold), so a click
aimed at the dialog's *original* size can miss — the skill now re-screenshots after
selecting the report type before clicking Export, rather than reusing a stale
coordinate. ClubExpress downloads both files under fixed names
(`registration_data.csv` / `activity_registrant_data.csv`, no event ID or date), which
the skill now checks for directly instead of only guessing off "newest file."

Each new event year will need the `EVENT_URL` line near the top of the skill updated to
that year's event page (the skill will tell you if it looks stale).

## If ClubExpress ever ships a real export API

Re-open this question then — a documented API would let a small local script pull the
CSVs on a schedule (e.g. via Windows Task Scheduler) with no browser involved at all.
Until then, the skill above is the practical middle ground between "fully manual" and
"give a script my password."
