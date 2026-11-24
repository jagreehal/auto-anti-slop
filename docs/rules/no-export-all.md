# `anti-slop/no-export-all`

Opt-in, because many libraries build their entry point with `export *`. Turn it on with `'anti-slop/no-export-all': 'error'` in `rules`.

`export *` from a relative path shows everything the module exports, now and later, so its interface is as wide as its code. Readers, and agents, can't tell what is meant for them.

## ❌ Bad

```ts
export * from './store';
```

## ✅ Good

```ts
export { load, summary } from './store';
```

Export only what code outside uses. If that list is long, hide more behind fewer functions. `export *` from a package is allowed.

[Back to the rule list](../../README.md#added-rules)
