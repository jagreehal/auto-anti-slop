# `complexity`

Cyclomatic complexity counts the paths through a function. Above 10, a function is hard to test fully and easy to break. With `variant: "modified"`, a `switch` counts once however many cases it has.

## ❌ Bad

```ts
export function shippingDays(region: string, express: boolean, weight: number): number {
  if (region === 'us') {
    return express ? 1 : 3;
  }

  if (region === 'eu') {
    return express ? 2 : 5;
  }

  if (region === 'uk') {
    return express ? 2 : 4;
  }

  if (region === 'au') {
    return express ? 3 : 8;
  }

  if (weight > 30 && !express) {
    return 14;
  }

  return weight > 10 ? 10 : 7;
}
```

## ✅ Good

```ts
interface Delivery {
  express: number;
  standard: number;
}

const deliveryDays = new Map<string, Delivery>([
  ['au', { express: 3, standard: 8 }],
  ['eu', { express: 2, standard: 5 }],
  ['uk', { express: 2, standard: 4 }],
  ['us', { express: 1, standard: 3 }],
]);

export function shippingDays(region: string, express: boolean): number {
  const delivery = deliveryDays.get(region);

  if (delivery === undefined) {
    return 7;
  }

  return express ? delivery.express : delivery.standard;
}
```

Configured as `["error", { "max": 10, "variant": "modified" }]`. Prefer lookup tables, guard clauses and named predicates to splitting a function at an arbitrary point.

[Back to the rule list](../../README.md#added-rules)
