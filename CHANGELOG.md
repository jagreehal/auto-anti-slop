# auto-anti-slop

## 0.2.1

### Patch Changes

- 3947c23: Baseline scans see what a normal lint sees. JS plugins get the project as `context.cwd`, and setup checks your Oxlint version before it replaces a baseline. A replaced baseline keeps its hard links and ACLs. Setup tracks each file a config imports, reads or extends, and the hook tells you when it leaves the baseline as it is.

## 0.2.0

### Minor Changes

- cfe5ed4: - Add `anti-slop/no-exposed-mutable-field`, the opt-in `anti-slop/no-export-all`, and a 2,000-line file limit.
  - Setup records existing findings when it creates your config, so `npx oxlint` passes from the start. `--baseline` refreshes them in one step and follows your Oxlint configs.
  - Choose your own React and accessibility rules, as the README's "React and other JSX" section shows. Run `npx oxlint --prune-suppressions` after you upgrade.
  - Allow async functions in JSX attributes, `import * as React`, grouped single-line re-exports and exhaustive switches. Unused disable comments are warnings.
  - Start linting faster by loading SonarJS rules on first use.
  - The agent hook and `AGENTS.md` ask for design fixes.

### Patch Changes

- f037838: Setup's baseline handles more project layouts: filesystems without hard links, a baseline linked into a read-only directory, and configs in dependencies git tracks. It reads nested configs in parallel, and stops if a config is rewritten or a directory appears during the scan.

## 0.1.0

### Minor Changes

- f95d33e: First release. An Oxlint preset with the anti-slop rules, type-aware checks and complexity limits. `npx auto-anti-slop` adds a lint hook for Claude Code, Codex and Cursor, and `--baseline` adopts the preset in an existing project.
