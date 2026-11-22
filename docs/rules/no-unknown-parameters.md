# `anti-slop/no-unknown-parameters`

A parameter typed `unknown` moves parsing into every function that receives it. Parse input once, where it enters the program, and pass a named domain type from there.

## ❌ Bad

```ts
export function sendInvite(input: unknown): string {
  return String(input);
}
```

## ✅ Good

```ts
interface Invite {
  email: string;
}

export function sendInvite(invite: Invite): string {
  return invite.email;
}
```

A type predicate or assertion function may take `unknown` for the value it narrows, and a parameter named `cause` may be `unknown`. So may a function passed directly to `.catch(…)` or as the second argument to `.then(…)`, because `typescript/use-unknown-in-catch-callback-variable` requires `unknown` there. That last exception is local to this package; see [`anti-slop/UPSTREAM.md`](../../anti-slop/UPSTREAM.md).

[Back to the rule list](../../README.md#added-rules)
