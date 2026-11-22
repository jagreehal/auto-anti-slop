# `anti-slop/no-runtime-typeof`

A `typeof` check in ordinary code is a parser hidden inside business logic. Decode values into a known type at the boundary, and branch on that type afterwards.

## ❌ Bad

```ts
export function pageSize(value: string | number): number {
  if (typeof value === 'string') {
    return Number.parseInt(value, 10);
  }

  return value;
}
```

## ✅ Good

```ts
interface PageRequest {
  size: number;
}

export function pageSize(request: PageRequest): number {
  return request.size;
}
```

Existence probes such as `typeof window === 'undefined'` are allowed: they ask whether a binding exists, not what shape a value has. To also allow `typeof` inside type predicates and assertion functions, set `{ "allowInTypeGuards": true }`; it defaults to `false`.

[Back to the rule list](../../README.md#added-rules)
