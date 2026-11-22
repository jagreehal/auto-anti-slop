# `anti-slop/no-object-parameters`

A parameter typed `object` accepts anything that isn't a primitive, so the function can't read a field without casting. Name the type it needs.

## ❌ Bad

```ts
export function save(record: object): string {
  return JSON.stringify(record);
}
```

## ✅ Good

```ts
interface Invoice {
  id: string;
  total: number;
}

export function save(invoice: Invoice): string {
  return JSON.stringify(invoice);
}
```

The rule flags `object` itself, not object types in general.

[Back to the rule list](../../README.md#added-rules)
