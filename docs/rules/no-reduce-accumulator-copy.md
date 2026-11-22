# `anti-slop/no-reduce-accumulator-copy`

Copying the accumulator on every step of a reducer makes the loop quadratic. Use `map`, `flatMap`, or push into an accumulator the reducer owns.

## ❌ Bad

```ts
interface Item {
  id: string;
}

export const ids = (items: Array<Item>) =>
  items.reduce<Array<string>>((acc, item) => acc.concat(item.id), []);
```

## ✅ Good

```ts
interface Item {
  id: string;
}

export const ids = (items: Array<Item>): Array<string> => items.map((item) => item.id);
```

The rule flags `Object.assign({}, acc, …)`, `acc.concat`, `acc.slice()`, `Array.from(acc)` and the copying array methods (`toSorted`, `toReversed`, `toSpliced`, `with`). `oxc/no-accumulating-spread` already catches `{ ...acc }`.

[Back to the rule list](../../README.md#added-rules)
