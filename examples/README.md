# Examples

Small projects linted with the full preset by `test/examples.test.js`. Each one's findings are
saved in its `findings.txt`. `clean` is idiomatic code and must have none.

- Add a project: create `examples/<name>/` with a `tsconfig.json` and a `src/` directory, but
  no `oxlint.config.ts`.
- Accept changed findings: `vp test examples -u`, then review the `findings.txt` diff.
- Run one project: `vp test examples -t <name>`.
