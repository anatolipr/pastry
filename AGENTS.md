# Agent Instructions for Pastry

## Updating the Help Dialog

The in-app help is rendered by `_renderHelp()` in
`src/components/settings-dialog.ts`. A comment block directly above that
method records the last commit at which the help was reviewed and updated.

### Workflow

1. **Find new commits since the last help update:**

   ```bash
   git log --oneline <LAST_COMMIT>..HEAD
   ```

   Replace `<LAST_COMMIT>` with the hash stored in the comment above
   `_renderHelp()` (currently `8401b0c`).

2. **For each commit, check whether it adds a user-facing feature:**

   ```bash
   git show <COMMIT_HASH> --stat
   git show <COMMIT_HASH> -- src/components/
   ```

   Skip commits that are CI/tooling-only (workflows, scripts, README, icon
   assets, performance fixes with no visible behaviour change).

3. **Update `_renderHelp()` accordingly:**

   - New keyboard shortcut → add a `shortcut-row` in the *Keyboard Shortcuts*
     section.
   - New feature or setting → add a `feature-row` in the *Features* section.
   - Enhancement to an existing feature → update the existing row's
     description copy.

4. **Update the tracking comment** above `_renderHelp()`:

   - Replace the commit hash with the current `HEAD` hash (`git rev-parse
     --short HEAD`).
   - Replace the date with today's date (ISO-8601, e.g. `2026-04-13`).
   - Replace the parenthetical commit message summary.

   The comment looks like this:

   ```ts
   // HELP LAST UPDATED: commit <HASH> (<short message>) — <YYYY-MM-DD>
   //
   // To check for features added since: git log --oneline <HASH>..HEAD
   // Review each commit for user-facing changes, then update _renderHelp() below.
   // After updating, replace the commit hash above with the current HEAD hash and
   // update the date. See AGENTS.md for full instructions.
   ```

### Current state

| Field | Value |
|---|---|
| Last updated commit | `8401b0c` |
| Commit message | `export history` |
| Date | 2026-04-13 |
| Run git since | `git log --oneline 8401b0c..HEAD` |
