# `anti-slop/no-chained-type-assertions`

`as unknown as T` forces any value into any type. TypeScript stops checking, and the bug surfaces at runtime. Convert or parse the value instead.

## ❌ Bad

```ts
declare const input: string;

export const port = input as unknown as number;
```

## ✅ Good

```ts
declare const input: string;

export const port = Number(input);
```

The rule also catches angle-bracket and parenthesised chains. `as const` doesn't count.

[Back to the rule list](../../README.md#added-rules)
