# `anti-slop/no-exposed-mutable-field`

A class that keeps some of its state private has rules to enforce on it. A public field anyone can write lets callers break those rules, and ties each caller to how the class stores its data.

## ❌ Bad

```ts
export class RunQueue {
  items: Array<string> = [];
  readonly #limit = 10;

  isFull(): boolean {
    return this.items.length >= this.#limit;
  }
}
```

## ✅ Good

```ts
export class RunQueue {
  readonly #items: Array<string> = [];
  readonly #limit = 10;

  push(item: string): boolean {
    if (this.#items.length >= this.#limit) {
      return false;
    }

    this.#items.push(item);

    return true;
  }
}
```

Ask what callers do with the field, and give them a method for that. If they only read it, make it `readonly`, or private with a getter when the class itself reassigns it: `get count(): number { return this.#count; }`. For a collection, expose a `ReadonlyArray`, `ReadonlyMap` or `ReadonlySet`.

The rule also reports a `set` accessor that only assigns a field of the class, and a `get` accessor that returns a field declared as a mutable collection. It reads one class at a time, and checks getters with a declared return type.

The rule checks classes in TypeScript files (not Vue, Svelte or Astro files, whose script language it can't see) with at least one private or protected field and one method. It skips classes that extend another, whose base decides what is public, and decorated classes and members, which a framework reads.

[Back to the rule list](../../README.md#added-rules)
