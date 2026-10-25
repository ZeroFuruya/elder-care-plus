# Emergency revert — stable version (2026-10-25)

One page of copy-paste commands to get the repo back to the **last known-good state** if tonight's
work breaks something. This file is part of the stable snapshot on purpose: `git reset --hard` keeps
tracked files, so the guide survives the revert it describes.

---

## The stable version

| Field        | Value                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tag**      | `snapshot-2026-10-25-prescription-photos`                                                                                                       |
| Branch       | `main`                                                                                                                                          |
| Date         | 2026-10-25                                                                                                                                      |
| What's in it | Sprint 10 prescription photo storage (no OCR/AI); all local gates green (**178** JS tests, **641** pgTAP); hosted Supabase at **19** migrations |
| Also on      | GitHub `origin` (the tag and `main` are both pushed)                                                                                            |

The tag is the identifier to use — do not hard-code a commit SHA. Get the current one any time with:

```bash
git rev-list -n1 snapshot-2026-10-25-prescription-photos
```

---

## 0. TL;DR — "just put it back"

```bash
git fetch --tags origin
git checkout main
git reset --hard snapshot-2026-10-25-prescription-photos
git clean -fd
git push --force-with-lease origin main
```

That returns the working tree **and** `main` to the stable version. Read the warnings below first.

---

## Before you start

1. Stop the Metro/Expo dev server and any running tests, so nothing writes while you reset.
2. Make sure the tag is present locally:

   ```bash
   git fetch --tags origin
   git tag -l "snapshot-2026-10-25*"      # expect: snapshot-2026-10-25-prescription-photos
   ```

3. Know which of the scenarios below matches your situation — they are **not** interchangeable.

> ⚠️ `git reset --hard` and `git push --force…` **discard commits**. If you are not sure, use
> Scenario C (`git revert`) instead — it undoes changes without deleting history.

---

## Scenario A — only uncommitted changes are broken (history is fine)

You edited files but did not commit, and want the last commit back.

```bash
git checkout main
git restore .            # discard changes to tracked files
git clean -fd            # delete NEW untracked files/folders
```

Skip `git clean -fd` if you want to keep untracked files. It is destructive to untracked files only.

---

## Scenario B — committed bad work; force `main` back to the stable version

This is the full emergency revert. **It deletes every commit made after the snapshot.**

```bash
git fetch --tags origin
git checkout main
git reset --hard snapshot-2026-10-25-prescription-photos
git clean -fd

# only if you also pushed the bad commits:
git push --force-with-lease origin main
```

`--force-with-lease` refuses the push if someone else pushed in the meantime — safer than `--force`.

To also make sure the remote tag is the correct one:

```bash
git push -f origin snapshot-2026-10-25-prescription-photos
```

---

## Scenario C — undo a specific commit without destroying history (safest)

Use this to back out one bad commit while keeping everything else and a full audit trail.

```bash
git log --oneline -10                 # find the bad SHA
git revert <bad-sha>                  # creates a new "undo" commit
git push origin main
```

Revert several in **reverse** order, newest first:

```bash
git revert <newest-sha> <next-sha> <oldest-sha>
```

**Undo only the prescription-photo feature** (from the 2026-10-25 session):

```bash
git revert 86ef620        # feat(meds): prescription photo storage (sprint 10)
git push origin main
```

---

## Scenario D — restore one file or folder from the stable version

Non-destructive: it only rewrites the paths you name.

```bash
git checkout snapshot-2026-10-25-prescription-photos -- path/to/file-or-folder
```

Example — restore the medication screen:

```bash
git checkout snapshot-2026-10-25-prescription-photos -- "apps/mobile/src/app/(caregiver)/caregiver/med.tsx"
```

(Quote paths that contain spaces or parentheses.)

---

## Verify you are back on the stable version

```bash
git log --oneline -1
git status -sb
```

Expected:

- `git log` shows the commit the tag points to (the same SHA as
  `git rev-list -n1 snapshot-2026-10-25-prescription-photos`).
- `git status -sb` shows `## main...origin/main` with **no** file changes.

Optionally re-run the gates to confirm the tree is healthy:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm format:check
npx supabase test db          # needs Docker Desktop running; expect 641/641
```

---

## Database (hosted Supabase)

The app and the database revert **separately**. The stable version of the schema is "19 migrations
applied". Backups taken right before the Sprint 10 push live in the repo root (both git-ignored, so
they exist **only on this machine**):

| File              | Contents                            |
| ----------------- | ----------------------------------- |
| `backup.sql`      | Hosted **schema** dump (2026-10-25) |
| `backup-data.sql` | Hosted **data** dump (2026-10-25)   |

- Confirm what is on the hosted project:

  ```bash
  npx supabase migration list --linked     # expect all 19 local ↔ remote rows
  ```

- Local database back to the migrations as committed:

  ```bash
  npx supabase db reset        # reapplies migrations + seed.sql (Docker must be running)
  ```

- **There are no "down" migrations.** To remove the Sprint 10 table/bucket from a database you would
  add a **new** migration that drops them. In practice this is unnecessary: the extra
  `medication_images` table and the empty `prescription-images` bucket are inert and do not affect
  any other screen, so a code revert alone is almost always enough.

- Restore hosted **data** from a dump (needs the database password; prefer the Supabase SQL editor
  for a one-off):

  ```bash
  psql "<hosted-connection-string>" -f backup.sql
  psql "<hosted-connection-string>" -f backup-data.sql
  ```

  > Never commit or paste the connection string / database password anywhere shared.

---

## Troubleshooting

| Symptom                                      | Cause / fix                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `error: pathspec 'snapshot-…' did not match` | Tag not fetched on this machine → `git fetch --tags origin`                               |
| `git push` rejected after a reset            | You need `--force-with-lease` (Scenario B)                                                |
| `git clean -fd` deleted something you wanted | It only removes **untracked** files; recover from your editor's local history or a backup |
| Tests fail after resetting                   | Reinstall dependencies: `pnpm install`, then Docker Desktop + `npx supabase start`        |
| Unsure whether the tag is the right one      | `git show snapshot-2026-10-25-prescription-photos --stat`                                 |

---

## Reference — the 2026-10-25 session commits (all on `main`)

| Commit    | Subject                                                                   |
| --------- | ------------------------------------------------------------------------- |
| `86ef620` | `feat(meds): prescription photo storage (sprint 10)`                      |
| `95829e1` | `docs(demo): add the prescription-photo pass to the presentation runbook` |
| `5305498` | `docs: record the sprint 10 hosted push in AGENTS.md`                     |

The tag additionally includes this guide.
