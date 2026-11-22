# `anti-slop/require-safety-comment-for-type-assertion`

An `as` assertion tells TypeScript to trust you. Say why it is safe, so a reviewer can check the claim and the next person knows when it stops being true.

## ❌ Bad

```ts
interface Customer {
  id: string;
}

declare const row: { id: string; deletedAt: number | null };

export const customer = row as Customer;
```

## ✅ Good

```ts
interface Customer {
  id: string;
}

declare const row: { id: string; deletedAt: number | null };

// SAFETY: Customer is a subset of the row's columns.
export const customer = row as Customer;
```

`as const` needs no comment. To accept other markers, set `{ "markers": ["SAFETY", "JUSTIFICATION"] }`; the default is `["SAFETY"]`.

[Back to the rule list](../../README.md#added-rules)
