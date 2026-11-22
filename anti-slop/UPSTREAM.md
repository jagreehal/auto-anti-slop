# Upstream

- Source: anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Rules: every rule except the opt-in Effect rules

Each rule's anti-slop tests (`*.test.js`) are ported beside it and run with vitest. They're not published.

## Deviations

- TypeScript types are stripped to plain ES modules, because Node won't strip types inside `node_modules`.
- `defineRule` from `@oxlint/plugins` is dropped (it returns the rule unchanged), so the package needs no extra runtime dependency.
- `no-unknown-parameters` allows `unknown` on a function passed directly as a promise rejection handler (`.catch(fn)`, or the second argument to `.then`), where `typescript/use-unknown-in-catch-callback-variable` requires it.
