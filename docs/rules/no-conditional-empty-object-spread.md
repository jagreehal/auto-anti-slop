# `anti-slop/no-conditional-empty-object-spread`

`...(cond ? { a } : {})` hides an optional field inside an expression. Add the field with an `if`, so you can see when it exists.

## ❌ Bad

```ts
export function query(search: string | undefined) {
  return { page: 1, ...(search !== undefined ? { search } : {}) };
}
```

## ✅ Good

```ts
interface Query {
  page: number;
  search?: string;
}

export function query(search: string | undefined): Query {
  const result: Query = { page: 1 };

  if (search !== undefined) {
    result.search = search;
  }

  return result;
}
```

The rule flags an empty object in either branch of the conditional.

[Back to the rule list](../../README.md#added-rules)
