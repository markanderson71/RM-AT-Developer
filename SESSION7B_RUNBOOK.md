# Session 7b — moving operational data to Supabase Postgres

Read this once through before starting. Each step ends with a **Check**; don't go on until it passes. Nothing here
touches the Google Sheet — it is only ever read. If anything goes wrong before step 8, the old app is still running on
the Sheet and nothing has changed for Chris.

Total time: about 30 minutes of hands-on work. Steps 4–8 should happen in one sitting, with no one writing to the app.

## What you need before starting

- The repo (`RM-AT-Developer`) checked out, with `npm install` done.
- Supabase dashboard access to the project from session 1 (the one the knowledge store lives in).
- Vercel dashboard access to **both** projects: `rm-at-developer` (new app) and `at-dev-tracker` (old app).
- A `.env` in the repo root. It already has `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and (from session 1) `SUPABASE_DB_URL`.
  Make sure it also has this line — the migration reads the Sheet through the **old** app's proxy, which is still the
  Apps Script until step 8:

  ```
  APP_BASE_URL=https://at-dev-tracker.vercel.app
  ```

  Do **not** point `APP_BASE_URL` at the new app: after step 6 the new app's `/api/sheet` is Postgres, and the migration
  would be reading from the place it is writing to.

## Step 1 — apply the code

```
cd RM-AT-Developer
git apply --check session7b.patch
git apply --exclude=AT_Scoring_Architecture.md session7b.patch
cp ~/Downloads/AT_Scoring_Architecture.md AT_Scoring_Architecture.md
npm run test:ops
```

**Check:** the last line reads `6 groups passed`. If `git apply --check` complains, your tree has uncommitted changes —
`git status`, commit or stash them, and try again.

Optional, to see nothing else broke: `npm run test:journal`, `npm run test:history`, `npm run build` — all should end
clean, exactly as before.

Commit but don't push yet:

```
git add -A
git commit -m "Session 7b: operational data to Supabase Postgres"
```

## Step 2 — create the table

Either of these (the second is the same SQL by hand):

- `npm run migrate` — needs `SUPABASE_DB_URL` in `.env`. It prints `schema ok · chunks table has N rows · ops_rows: empty`.
- Or: Supabase dashboard → **SQL Editor** → paste the contents of `supabase/schema-ops.sql` → Run.

**Check:** Supabase dashboard → **Table Editor** → a table `ops_rows` exists with 0 rows and the columns
`sheet, id, row, seq, created_at, updated_at`. Running it twice is harmless (`if not exists` everywhere).

## Step 3 — dry run: read the Sheet, write nothing

```
npm run migrate:sheet -- --dry
```

This reads Config, Journal and MASessions through the old app's proxy. It can take 10–30 s per tab because that is
still the Apps Script; if a tab errors out, just run it again.

**Check** the output against the Sheet (open the Google Sheet and count the data rows of each tab, header excluded):

- `Config: N rows read … → N with an id` — N matches the Config tab.
- `Journal: …` — matches the Journal tab, and the `columns:` line **includes `entryType`**.
- `MASessions: …` — matches, and the `ids:` line lists your sessions (`ma_7uk7lnh`, `ma_7n6ry6d`, …).
- No line says `DUPLICATE ids` and no line says `SKIPPED`.
- Last line: `Dry run complete. Nothing written.`

If `DUPLICATE ids` appears: the Sheet has two rows with the same id in that tab (the old app's create-after-failed-update
could do that). Open the tab, find the two rows, delete the older one, and rerun the dry run. Don't proceed until it is
clean — the run refuses to write that tab.

If a `SKIPPED` line appears: a row has content but no id. Look at it in the Sheet; if it is junk, delete it; if it is
real, type an id into column A and rerun.

## Step 4 — freeze

From here to the end of step 8, nobody writes to the app. Close your own tabs of both apps. If Chris might be in the old
app, tell him to stay out for half an hour. (Reads are fine; writes made to the Sheet after step 5 would not be copied.)

## Step 5 — copy and verify

```
npm run migrate:sheet
```

It reads each tab again, writes the rows to Postgres, reads them **back from Postgres**, and compares every row and every
column, character for character.

**Check:**

- Each tab ends with `diff: none — every row and column matches`.
- Last line starts `RESULT: OK — Config N · Journal N · MASessions N` with the same counts as step 3.
- Supabase → Table Editor → `ops_rows` now has Config + Journal + MASessions rows in total. Click one MASessions row: the
  `row` column holds the session's JSON with `transcript`, `sections`, `summary`, … as strings.

If it prints `DIFF` lines: read them — each names the tab, id and column, and for short values shows both sides. Send
me the output. Running the command again is safe (it overwrites with the Sheet's values), and the Sheet is untouched.

## Step 6 — deploy the new app

First confirm the env vars. Vercel → project **rm-at-developer** → Settings → Environment Variables. You need:

- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — should already be there from session 1 (the ingest endpoints use them).
- Optional, for journal notification emails: `RESEND_API_KEY` (from resend.com → API Keys) and `RESEND_FROM`
  (`AT Journal <onboarding@resend.dev>` works for testing to your own address; a real domain needs verifying in
  Resend). Without these, saving a journal entry still works — the notification just reports "No email provider
  configured" and nothing is sent.
- `APPS_SCRIPT_URL` is no longer used by this app. Leave it or delete it.

Then:

```
git push
```

Wait for the Vercel deploy to finish (about a minute).

**Check 1 — the endpoint is on Postgres:**

```
curl -s -X POST https://rm-at-developer.vercel.app/api/sheet -H 'Content-Type: application/json' -d '{"_action":"ping"}'
```

Expected: `{"status":"ok","timestamp":"…","store":"postgres"}`. If `store` is missing, the deploy hasn't landed yet —
wait and retry. If you get `{"error":"SUPABASE_URL / SUPABASE_SERVICE_KEY not set"}`, add the env vars and redeploy.

**Check 2 — login speed:** open https://rm-at-developer.vercel.app in a fresh tab, DevTools → Network, log in as Mark.
Three `sheet` requests appear. Each should complete in well under a second (Apps Script took 2–30 s). MA History shows
all your sessions, newest first, with the same scores as before.

**Check 3 — nothing was lost on the way to the screen:** open `ma_7uk7lnh` in MA History. The transcript, the six
2026-form scores, Chris's scorecard and the comment thread are all there.

## Step 7 — round-trip a write, then prove Postgres has it

In the new app, as Mark:

1. Journal → new entry (any type) → write one line → Save.
2. MA History → open any session → post a one-word comment.

**Check** in Supabase → SQL Editor:

```sql
select sheet, id, row->>'whatISaw' as first_line, updated_at from ops_rows where sheet = 'Journal' order by updated_at desc limit 3;
select id, length(row->>'mentorFeedback') as feedback_chars, updated_at from ops_rows where sheet = 'MASessions' order by updated_at desc limit 3;
```

The entry you just wrote is the top Journal row; the session you commented on is the top MASessions row, and its
`updated_at` is just now. Reload the app: both are still there.

Then, as a last proof that nothing else moved:

```
npm run migrate:sheet -- --verify
```

**Check:** the only `DIFF` lines are the two rows you just wrote ("in Postgres but not in the Sheet" for the journal
entry; a `mentorFeedback` length difference for the session). Everything else: `diff: none`. From now on the Sheet is
a snapshot and this verify will drift as you use the app — that is expected.

(If you set up Resend: the journal save reported "will notify …" and the address in `_MENTOR_PROFILES` got an email.
Right now that address is your own Gmail, left from the May test; Chris's real address goes into his profile before
session 8.)

## Step 8 — move the old app onto the same store

Chris still uses the old app until session 8. Both apps must read and write one store, or his comments would land in
the Sheet where the new app can't see them.

In the **old** app's repo (`at-development-tracker`):

1. Copy `old-app/api/sheet.js` from this repo over its `api/sheet.js` (it is self-contained — one file, nothing else to
   copy).
2. `npm install @supabase/supabase-js` in that repo.
3. Vercel → project **at-dev-tracker** → Settings → Environment Variables → add `SUPABASE_URL` and
   `SUPABASE_SERVICE_KEY` with the **same values** as the new project (copy them from there). Add the Resend variables
   too if you set them up.
4. Commit, push, wait for the deploy.

**Check 1:**

```
curl -s -X POST https://at-dev-tracker.vercel.app/api/sheet -H 'Content-Type: application/json' -d '{"_action":"ping"}'
```

Expected: `"store":"postgres"`.

**Check 2:** open the old app, log in, open MA History and the Journal. The entry and comment you wrote in step 7 in
the **new** app are visible here. Post a comment from the old app; reload the new app; it is there.

Now both apps are on Postgres and the Apps Script is out of the path. The freeze is over.

**Important:** from this point, don't run a plain `npm run migrate:sheet` again — copy mode would write the stale
Sheet over live rows. Remove `APP_BASE_URL` from `.env` now (the scripts read the store directly when `SUPABASE_URL`
is set). If you ever want `--verify` against the Sheet again, put `APPS_SCRIPT_URL=<the Apps Script /exec URL from the
old app's Vercel env>` in `.env` for that run; it reads the Sheet directly and never writes.

## Step 9 — afterwards

- `npm run score -- 7uk7lnh --compare chris` now reads the session from Postgres (the log line says so — no "sheet:
  transient" retries). Same scores as before; nothing in scoring changed.
- The Google Sheet stays as it is: a snapshot dated today. Don't delete it until session 10 has shipped. The Apps
  Script deployment can stay published; nothing calls it.
- Keep the two apps' `SUPABASE_*` values identical. If you ever rotate the service key, change it in both projects.

## Rollback

- **Before step 8:** the old app never changed. To take the new app back to the Sheet: `git revert HEAD` on the 7b
  commit, push, and put `APPS_SCRIPT_URL` back in its env if you deleted it. Rows written to Postgres in the meantime
  stay there (harmless) but would be missing from the Sheet.
- **After step 8:** revert `api/sheet.js` in the old app's repo to its previous version and push; the old app is back
  on the Sheet. Rows written since the copy would then have to be re-entered by hand — which is why the freeze in step
  4 matters and why step 7's checks come before step 8.
