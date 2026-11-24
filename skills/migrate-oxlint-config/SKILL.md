---
name: migrate-oxlint-config
description: Adopt auto-anti-slop in an existing JavaScript or TypeScript project with a suppressions baseline, then pay the baseline down one rule per commit.
---

# Migrate to auto-anti-slop

## 1. Adopt with a baseline

1. Run the project's current lint command and note what it covers.
2. Install `auto-anti-slop` as its README describes. Carry over the project's
   own rules, ignore patterns, environments and file overrides. Point the lint
   command and CI at `oxlint .`. Keep the type-check command; if the old setup
   ran the compiler during lint, run it separately or set
   `options.typeCheck: true`.
3. If setup created the config and wrote `oxlint-suppressions.json`, go to the
   next step. Otherwise run `npx auto-anti-slop --baseline`. It replaces the file
   with the current findings, so `oxlint .` passes. If setup stops on a syntax
   error, fix the error and run the command again. If it stops because a config
   changed while it ran, run it again.
4. Commit the dependency, config, lint-command changes and
   `oxlint-suppressions.json` together, with no code fixes.

## 2. Pay down one rule per commit

1. List the baseline by rule:

   ```sh
   node -e "const t={};for(const f of Object.values(require('./oxlint-suppressions.json')))for(const[r,{count}]of Object.entries(f))t[r]=(t[r]??0)+count;console.table(t)"
   ```

2. Pick a rule. Delete its entries from `oxlint-suppressions.json`, then run
   `oxlint .` to see every finding.
3. If the rule fits the project, fix the findings until `oxlint .` passes, run
   the affected tests and type checks, and commit. For cycles and exposed
   fields, show the user a sketch of the modules before and after, then fix
   related findings together.
4. If it doesn't fit, set the rule to `'off'` in the project config with a
   comment giving the reason, scoped to the files that need it where possible.
   Flag rules the team requires for maintainer review.

Never run `oxlint --suppress-all` to make new findings pass. After an upgrade
of the package, follow the README's Upgrading steps.

## 3. Open one pull request

Put the adoption commit and each rule commit in one pull or merge request. List
the rules turned off, with reasons, and what remains in the baseline. Keep the
commits separate during review; squash on merge.
