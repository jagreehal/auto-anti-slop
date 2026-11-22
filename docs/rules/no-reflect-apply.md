# `anti-slop/no-reflect-apply`

`Reflect.apply` erases the function's parameter types. Call the function directly.

## ❌ Bad

```ts
export const run = (task: (value: number) => number, args: [number]) =>
  Reflect.apply(task, undefined, args);
```

## ✅ Good

```ts
export const run = (task: (value: number) => number, args: [number]): number => task(...args);
```

Use `task.call(owner, …)` when you need a specific `this`.

[Back to the rule list](../../README.md#added-rules)
