# `anti-slop/no-reflect-get`

`Reflect.get` returns `any`, so the property type disappears. Read the property directly.

## ❌ Bad

```ts
interface Config {
  port: number;
}

export const port = (config: Config) => Reflect.get(config, 'port');
```

## ✅ Good

```ts
interface Config {
  port: number;
}

export const port = (config: Config): number => config.port;
```

`Reflect.set` and other `Reflect` methods aren't covered. A local binding named `Reflect` isn't flagged.

[Back to the rule list](../../README.md#added-rules)
