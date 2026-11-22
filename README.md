# auto-anti-slop

An Oxlint preset for the code coding agents get wrong: unparsed `unknown`
values, casts that switch off the type checker, unhandled promises and
functions too tangled to review. One setup command adds a hook that hands lint
errors back to Claude Code, Codex or Cursor before the agent finishes its turn.

## Install

Requires Node.js 24 or later. In the project root:

```sh
npm install -D auto-anti-slop oxlint@^1.94.0 tsrs@7.1.0-beta.tsrs4
npx auto-anti-slop
npx oxlint
```

`tsrs` runs the type-aware rules. It has only beta releases, so pin the
version shown. With pnpm, run `pnpm add -D` and `pnpm exec auto-anti-slop`;
with Yarn, `yarn add -D` and `yarn auto-anti-slop`.

`npx auto-anti-slop` sets the project up:

- creates `oxlint.config.ts` with the preset, unless an Oxlint config exists;
- adds the [lint hook](#the-agent-hook) to `.claude/settings.json`,
  `.codex/hooks.json` and `.cursor/hooks.json`;
- adds a short lint section to `AGENTS.md`, which Codex and Cursor read;
- copies the [migration skill](skills/migrate-oxlint-config/SKILL.md) to
  `.claude/skills` and `.agents/skills`.

It keeps existing settings, and running it twice changes nothing. Codex and
Cursor run project hooks only once you trust them: use `/hooks` in Codex, and
trust the workspace in Cursor.

Add `oxlint` to your lint script and CI. The preset doesn't run the compiler:
keep your type-check command, or set `options.typeCheck` to `true`.

### A project that already has an Oxlint config

Setup leaves your config alone and warns if the preset isn't in it. Add the
preset, then run setup again. A JSON config (`.oxlintrc.json`) can't load the
preset's plugins, so move its settings into `oxlint.config.ts`:

```ts
// oxlint.config.ts
import autoAntiSlop from 'auto-anti-slop';
import { defineConfig } from 'oxlint';

export default defineConfig({
  ...autoAntiSlop,
  ignorePatterns: [...autoAntiSlop.ignorePatterns, 'dist/**'],
  rules: { ...autoAntiSlop.rules, 'no-console': 'off' },
  overrides: [...autoAntiSlop.overrides, { files: ['scripts/**'], rules: { 'no-console': 'off' } }],
});
```

Spread the preset's `rules`, `overrides` and `ignorePatterns` as shown;
without the spread, your values replace the preset's. Then delete the old
config file.

### A project with existing code

`npx oxlint` reports findings in code written before the preset. To adopt it
without fixing them first, run `npx auto-anti-slop --baseline` and commit the
`oxlint-suppressions.json` it writes. See [Existing projects](#existing-projects).

## The agent hook

When the agent finishes a turn, the hook lints the JavaScript and TypeScript
files that `git status` shows as changed. If Oxlint reports errors, the hook
sends them to the agent, which fixes the code. The agent gets one retry: if
errors remain, the hook logs them and lets the agent stop. Claude Code and
Codex show that log in the hook output; Cursor writes it to its hooks log.

<a id="added-rules"></a>

## What the rules catch

Each rule links to a page with a failing example and a fix.
`test/docs.test.js` lints every example against the full preset.

**Unparsed input.** Parse data once where it enters the program, then pass
real types.

| Rule                                                                             | Flags                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`anti-slop/no-unknown-parameters`](docs/rules/no-unknown-parameters.md)         | Parameters typed `unknown`                       |
| [`anti-slop/no-unknown-returns`](docs/rules/no-unknown-returns.md)               | Functions that return `unknown`                  |
| [`anti-slop/no-unknown-type-aliases`](docs/rules/no-unknown-type-aliases.md)     | `type Payload = unknown`                         |
| [`anti-slop/no-unsafe-dictionary-type`](docs/rules/no-unsafe-dictionary-type.md) | `Record<string, unknown>` and `any`-valued maps  |
| [`anti-slop/no-object-parameters`](docs/rules/no-object-parameters.md)           | Parameters typed `object`                        |
| [`anti-slop/no-runtime-typeof`](docs/rules/no-runtime-typeof.md)                 | `typeof` checks scattered through business logic |

**Casts that hide bugs.** Each of these tells TypeScript to stop checking.

| Rule                                                                                                             | Flags                                         |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`anti-slop/require-safety-comment-for-type-assertion`](docs/rules/require-safety-comment-for-type-assertion.md) | `as` casts without a `SAFETY:` comment        |
| [`anti-slop/no-chained-type-assertions`](docs/rules/no-chained-type-assertions.md)                               | `as unknown as T`                             |
| [`anti-slop/no-widen-then-assert`](docs/rules/no-widen-then-assert.md)                                           | Widening to `unknown`, then casting back      |
| [`anti-slop/no-known-value-widening`](docs/rules/no-known-value-widening.md)                                     | Annotations that discard a value's exact type |
| [`anti-slop/no-reflect-get`](docs/rules/no-reflect-get.md)                                                       | `Reflect.get`, which returns `any`            |
| [`anti-slop/no-reflect-apply`](docs/rules/no-reflect-apply.md)                                                   | `Reflect.apply`, which drops parameter types  |

**Code that's hard to review.**

| Rule                                                                                               | Flags                                         |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`complexity`](docs/rules/complexity.md)                                                           | Functions with more than 10 paths             |
| [`sonarjs/cognitive-complexity`](docs/rules/cognitive-complexity.md)                               | Deeply nested logic, scoring above 15         |
| [`anti-slop/require-readable-spacing`](docs/rules/require-readable-spacing.md)                     | Missing blank lines between steps (autofixes) |
| [`anti-slop/no-shape-in-symbol-names`](docs/rules/no-shape-in-symbol-names.md)                     | Names like `UserShape`                        |
| [`anti-slop/no-conditional-empty-object-spread`](docs/rules/no-conditional-empty-object-spread.md) | `...(cond ? { a } : {})`                      |

**Wasted work.**

| Rule                                                                               | Flags                                |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| [`anti-slop/no-array-filter-map`](docs/rules/no-array-filter-map.md)               | `.filter().map()` passes             |
| [`anti-slop/no-reduce-accumulator-copy`](docs/rules/no-reduce-accumulator-copy.md) | Reducers that copy their accumulator |

**Tests.**

| Rule                                                             | Flags                     |
| ---------------------------------------------------------------- | ------------------------- |
| [`anti-slop/no-module-mocking`](docs/rules/no-module-mocking.md) | `vi.mock` and `jest.mock` |

The `anti-slop/` rules come from anti-slop, under its MIT license. Credits
are in [NOTICE.md](NOTICE.md).

### Base rules

The preset also turns on about 400 Oxlint rules: almost all of Oxlint's
correctness category, plus the suspicious, pedantic and performance rules that
catch bugs. Style rules stay off. I ran each candidate on real codebases and
left out the ones that flagged idiomatic code. What you'll notice day to day:

- Each enabled rule is an error. The preset lists rules one by one, so an
  Oxlint upgrade can't switch on new ones.
- `==` and `!=` are errors, including against `null`. Write
  `value === null || value === undefined`.
- Passing a promise-returning function where `void` is expected is an error.
  For React event handlers, set `checksVoidReturn: { attributes: false }` on
  `@typescript-eslint/no-misused-promises` in a JSX override.
- Floating promises, `eval`, `console` and `@ts-ignore` are errors.
- Import cycles, mutating `.sort()` (use `.toSorted()`), `||` where `??` is
  meant, deprecated APIs, and tests without an `expect` are errors.
- Conditions must test what they mean: `if (count)` on a `number | undefined`
  and checks the types already settle are errors
  (`typescript/strict-boolean-expressions`, `typescript/no-unnecessary-condition`).
- Functions take at most 3 parameters; pass an object beyond that. Exported
  functions declare their return types.
- Test files, including `*.test.int.ts`, relax the unsafe-`any` and throw
  checks. JavaScript files skip the unsafe-`any`, condition and return-type
  rules.

## Existing projects

`--baseline` runs `oxlint --suppress-all`, which records in
`oxlint-suppressions.json` how many findings each file has for each rule. It
runs only when your config loads the preset's plugin and enables at least half
as many error-level rules as the preset. From then on:

- New findings fail, in CI and in the agent hook. Recorded ones don't.
- Fixing recorded findings also fails until you run
  `npx oxlint --prune-suppressions`, so the baseline can only shrink. The
  agent hook prunes for you, and drops entries for deleted files.

To pay the baseline down, give your agent the
[migration skill](skills/migrate-oxlint-config/SKILL.md). It works one rule at
a time: it fixes every finding of a rule and removes the rule from the
baseline.

### Upgrading

A new version can add rules. `--suppress-all` records every finding, so run
it on a tree that already passes:

1. Before upgrading, run `npx oxlint` and fix anything it reports.
2. Upgrade, run `npx oxlint`, and fix what you can.
3. Run `npx oxlint --suppress-all` and review `git diff oxlint-suppressions.json`:
   it should add only findings from new or changed rules.

## Development

Use Node.js 24 and [Vite+](https://viteplus.dev/guide/): `vp install`,
`vp check`, `vp test`. `vp pm pack` builds a tarball to try in another
project. Include an example of the lint change in any pull request that
changes a rule, and run `pnpm changeset` to describe the change. Report
vulnerabilities through the [security policy](SECURITY.md).

## Releases

Releases use [Changesets](https://github.com/changesets/changesets). When
pull requests with changesets merge to `main`, the Release workflow opens a
release pull request that bumps the version and updates `CHANGELOG.md`.
Merging it runs the checks and tests, then publishes to npm with provenance.
