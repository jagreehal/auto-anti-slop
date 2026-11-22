# `anti-slop/no-unsafe-dictionary-type`

`Record<string, unknown>` tells callers nothing about the values, so each one gets cast on the way out. Give the values a concrete type.

## ❌ Bad

```ts
export type Settings = Record<string, unknown>;
```

## ✅ Good

```ts
export type Settings = Record<string, string | number | boolean>;
```

The rule flags dictionary value types of `unknown`, `any`, `object` or `{}`, alone or in a union, for both `Record` and index signatures.

[Back to the rule list](../../README.md#added-rules)
