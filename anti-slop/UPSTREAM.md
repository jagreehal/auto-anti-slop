# Upstream

This directory holds the anti-slop rules, except the opt-in Effect rules. See `LICENSE`.

`no-export-all` and `no-exposed-mutable-field` live in `../rules`. `index.js` registers them here to share the `anti-slop/` prefix.

Each rule's anti-slop tests (`*.test.js`) are ported beside it and run with vitest. They're not published.

## Deviations

- TypeScript types are stripped to plain ES modules, because Node won't strip types inside `node_modules`.
- `defineRule` from `@oxlint/plugins` is dropped (it returns the rule unchanged), so the package needs no extra runtime dependency.
- `no-unknown-parameters` allows `unknown` on a function passed directly as a promise rejection handler (`.catch(fn)`, or the second argument to `.then`), where `typescript/use-unknown-in-catch-callback-variable` requires it.
- `require-readable-spacing` lets consecutive single-line re-exports (`export … from`) sit together, as it does single-line bindings.
