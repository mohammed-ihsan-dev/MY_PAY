# MY PAY

A private, installable, offline-first app for Mohammed Ihsan's salary, available balance, debts and spending.

- **Local-first:** every record is stored on the phone in the browser's IndexedDB (via Dexie).
- **No server:** there is no server, database, account system, HRMS link or external API. The app is a set of static files.
- **Installable PWA:** it installs to the home screen and works fully offline after the first visit.

**Stack:** Next.js 16 (static export), React 19, TypeScript, Tailwind CSS 4, Radix UI, Dexie 4 (IndexedDB), Serwist (service worker), Zod 4, decimal.js, date-fns, Vitest + fake-indexeddb.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000 (no service worker in dev)

npm test           # calculations, months, ledger, debts, persistence, backup/restore, PIN
npm run lint && npm run typecheck
npm run build      # static site in ./out (+ service worker at out/sw.js)
npm start          # serves ./out on http://localhost:3000, offline mode included
```

Starting PIN: **1627**. Change it in Settings → PIN lock.

## Deploy (HTTPS is required for install and offline mode)

The `out/` folder is a plain static site. On **Vercel**:

1. Import the repository.
2. Leave the build command as `npm run build` and set the output directory to `out`.
3. `vercel.json` adds clean URLs, security headers (CSP and others) and the service-worker headers.

Any static host with HTTPS works the same way (Netlify, Cloudflare Pages, GitHub Pages with clean URLs).

## Install on your phone

**Android (Chrome):**
1. Open the site.
2. Tap ⋮ → **Install app** (or **Add to Home screen**).
3. Open MY PAY from the home screen. It runs full screen, without the browser bar.

**iPhone (Safari):**
1. Open the site in **Safari** (other iOS browsers can't install apps).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Always open MY PAY from that icon. On iPhone, the installed app keeps its own storage, separate from Safari tabs.

Once it has been opened online one time, everything works with no connection.

## Back up and restore (important)

The data exists **only on that phone**. Clearing the browser's site data, deleting the installed app (on iPhone), or losing the phone deletes it.

- **Back up:** Settings → Backup & restore → **Download My Data Backup**.
  - This saves a `my-pay-backup-….json` file containing settings, salary months, debts, repayments, transactions and preferences, plus the schema version and creation time.
  - The PIN is never included.
  - Keep the file somewhere safe: Google Drive, email it to yourself, or a computer.
  - The dashboard reminds you when there is no backup from the last 7 days.
- **Restore:** Settings → Backup & restore → **Restore from backup…**, then pick the file.
  - The file is checked first: format, schema version, required fields, whole-paise amounts, and unique, linked IDs.
  - A summary of what's in it is shown before anything changes. Then choose:
  - **Merge** (default when the phone has data): adds only the records this phone doesn't have, keeping every ID and link.
    - Records already on the phone are never changed. A record with the same ID but different content is a conflict: the phone's version is kept and listed in the preview.
    - Nothing is added twice. A salary month already credited, a repayment saved twice, or merging the same file again adds nothing.
    - Debt balances are recalculated from the repayments.
  - **Full restore:** replaces everything after you tick an explicit confirmation. A `before-restore-…json` copy of the current data is downloaded first, and the in-app undo copy is kept too.
  - **Undo last restore** brings back the data from just before the last merge or full restore.
  - Every page and balance updates as soon as the import finishes (balances are always calculated from the stored transactions).
- **Where the file goes:** Android saves to **Downloads**. On iPhone, Safari saves to **Files → Downloads**. If the phone supports it, **Save to Files / Drive…** opens the share sheet so you can choose where to save it. Nothing is uploaded by the app.
- **Delete all data:** Settings → About your data. You must type `DELETE` to confirm.

## Moving data from the old server version

An earlier version stored data in MongoDB. That code has been removed completely: the app needs no database, server, environment variables or secrets. The old data was exported once to `./backups/` (git-ignored, never deployed):

- `my-pay-backup-from-server-….json`: a MY PAY backup file. Restore it on the phone with **Restore from backup**. Older backups upgrade automatically.
- `mongodb-full-dump-….json`: a raw safety copy of the old database.

## How the money works

- **Salary:** each salary month is a calendar month, paid on the 10th of the next month. **October 2026 salary = work from 1 to 31 Oct, paid 10 Nov 2026.** The payday can be changed in Settings.
- **Calculation** ([`src/lib/salary-calculator.ts`](src/lib/salary-calculator.ts)):
  - daily = salary ÷ 30
  - hourly = daily ÷ 7.5
  - overtime = hourly × hours × 1
  - total = salary + overtime
  - Uses full decimal precision, rounded to paise only at the end.
- **Overtime input** is H.MM: `3.21` = 3 h 21 min. `3:21` is also accepted.
- **Deductions and status:** each month moves through **Draft → Finalized → Received**.
  - In Draft you add salary deductions (late, half-day, full-day, attendance or other fines, other deductions).
  - **Final salary payable = gross (basic + overtime) − total deductions.** It is never allowed to go below zero.
  - **Finalize** locks the month and stores a snapshot. No money moves.
  - **Mark as Received** credits exactly the final payable amount, once.
  - Deductions are never expenses, so they are never subtracted twice.
  - **Reopen** (with a reason) keeps the earlier snapshot. A received month must be "un-received" first.
- **Default salary:** ₹17,000, defined once in `DEFAULT_SALARY_SETTINGS` ([`src/lib/types.ts`](src/lib/types.ts)) and changeable in Settings. A saved month keeps its own copy of the settings, so later changes never alter history.
- **Ledger:** **Available balance = all money IN − all money OUT**, over all time. It carries forward and is never reset.
  - A salary only counts once you mark it received. That creates exactly one credit per month, protected by a unique key.
- **Debt repayment:** one IndexedDB transaction writes the repayment, one OUT ledger entry and the debt's new balance together.
  - **Balance after clearing all debt = balance − outstanding debt.** It is a projection only.
- **History is kept:** mistakes are *reversed* or *corrected* and stay in History. Forms carry a request ID, so a double tap saves once.

## Project structure

```
src/
  app/                  static routes: dashboard, salary, debts, history, settings
    manifest.ts         web app manifest
    sw.ts               service worker (Serwist): precaches all pages and assets
    serwist/[path]/     builds sw.js at build time
  data/                 local database (Dexie) and all money logic
    db.ts               schema: settings, cycles, debts, payments, ledger, preferences, backupMeta
    settings.ts cycles.ts ledger.ts debts.ts reverse.ts dashboard.ts backup.ts pin.ts
  components/           UI (layout, PIN gate, dashboard, salary, debts, history, settings)
  lib/                  calculations, months, money, dates, validation, types
scripts/
  postbuild.mjs         copies the service worker to out/sw.js
public/icons/           app icons (192, 512, maskable, Apple touch)
tests/                  Vitest suites
```

## Privacy and security notes

- Nothing is uploaded. The service worker caches only the app's own files, never financial data. That data lives only in IndexedDB.
- Browser storage is **not encrypted**. The PIN (stored as a salted SHA-256 hash) keeps casual eyes out. Real protection comes from the phone's own screen lock and encryption.
- After 5 wrong PINs, the app makes you wait: 30 s, then 60 s, and so on.
# MY_PAY
