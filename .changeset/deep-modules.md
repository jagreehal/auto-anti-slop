---
'auto-anti-slop': minor
---

- Add `anti-slop/no-exposed-mutable-field`, the opt-in `anti-slop/no-export-all`, and a 2,000-line file limit.
- Setup records existing findings when it creates your config, so `npx oxlint` passes from the start. `--baseline` refreshes them in one step and follows your Oxlint configs.
- Choose your own React and accessibility rules, as the README's "React and other JSX" section shows. Run `npx oxlint --prune-suppressions` after you upgrade.
- Allow async functions in JSX attributes, `import * as React`, grouped single-line re-exports and exhaustive switches. Unused disable comments are warnings.
- Start linting faster by loading SonarJS rules on first use.
- The agent hook and `AGENTS.md` ask for design fixes.
