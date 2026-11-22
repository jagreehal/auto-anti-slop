# `anti-slop/no-unknown-type-aliases`

`type Payload = unknown` makes an unparsed value look like a real type. Write out the type you expect, or keep `unknown` visible where you parse.

## ❌ Bad

```ts
export type Payload = unknown;
```

## ✅ Good

```ts
export interface Payload {
  id: string;
}
```

The rule resolves aliases of aliases, so `type A = unknown; type B = A;` reports both.

[Back to the rule list](../../README.md#added-rules)
