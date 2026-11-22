# `anti-slop/no-shape-in-symbol-names`

`Shape` in a name says what a thing looks like, not what it is for. Name a type or value for its role in the domain.

## ❌ Bad

```ts
export interface UserShape {
  id: string;
}
```

## ✅ Good

```ts
export interface User {
  id: string;
}
```

Reading a member that someone else named, such as `schema.shape`, is allowed, because you can't rename it locally.

[Back to the rule list](../../README.md#added-rules)
