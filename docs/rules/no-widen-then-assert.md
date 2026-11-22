# `anti-slop/no-widen-then-assert`

Widening a value to `unknown` and asserting it back throws away a type you already had. Keep the original binding.

## ❌ Bad

```ts
const user = { id: 'u1' };
const stored: unknown = user;

export const restored = stored as { id: string };
```

## ✅ Good

```ts
const user = { id: 'u1' };

export const restored = user;
```

The rule tracks `const` bindings. Asserting a value that arrived as `unknown`, such as a parsed input, is allowed.

[Back to the rule list](../../README.md#added-rules)
