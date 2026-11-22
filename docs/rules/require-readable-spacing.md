# `anti-slop/require-readable-spacing`

Blank lines show where one step ends and the next begins. The rule asks for one around functions, types, multiline declarations and control flow, and before a documented statement.

## ❌ Bad

```ts
export const first = 1;
/** Documentation stays attached to second. */
export const second = 2;
export function total(): number {
  return first + second;
}
```

## ✅ Good

```ts
export const first = 1;

/** Documentation stays attached to second. */
export const second = 2;

export function total(): number {
  return first + second;
}
```

`oxlint --fix` inserts the blank lines; run your formatter afterwards. Adjacent single-line declarations stay grouped, and function overloads stay together with their implementation. The rule never removes blank lines.

[Back to the rule list](../../README.md#added-rules)
