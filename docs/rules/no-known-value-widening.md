# `anti-slop/no-known-value-widening`

An annotation like `Record<string, Command>` throws away what TypeScript knew: `commands.start` becomes optional and typos type-check. Use `satisfies` to check the value and keep its exact type.

## ❌ Bad

```ts
type Command = () => void;

const start = () => {};

export const commands: Record<string, Command> = { start };
```

## ✅ Good

```ts
type Command = () => void;

const start = () => {};

export const commands = { start } satisfies Record<string, Command>;
```

The rule covers annotations on variables, class fields and later assignments, plus `as` casts to broad types such as `unknown`, `object` or index signatures. An empty literal like `{}` can still take a broad annotation.

[Back to the rule list](../../README.md#added-rules)
