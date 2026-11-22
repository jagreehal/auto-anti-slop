# `anti-slop/no-unknown-returns`

A function that returns `unknown` makes every caller parse the result. Parse once inside the function and return a named type.

## ❌ Bad

```ts
export function readConfig(text: string): unknown {
  return JSON.parse(text);
}
```

## ✅ Good

```ts
interface Config {
  port: number;
}

export function readConfig(settings: Map<string, string>): Config {
  return { port: Number(settings.get('port') ?? '8080') };
}
```

`Promise<unknown>` counts too. A return type that names an alias of `unknown` is reported by `anti-slop/no-unknown-type-aliases` instead.

[Back to the rule list](../../README.md#added-rules)
