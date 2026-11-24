# `sonarjs/cognitive-complexity`

Cognitive complexity measures how hard a function is to read. Each branch costs more the deeper it is nested, so the score rises fastest in code that is hard to follow. The rule comes from [eslint-plugin-sonarjs](https://www.npmjs.com/package/eslint-plugin-sonarjs) and follows [SonarSource's specification](https://www.sonarsource.com/docs/CognitiveComplexity.pdf).

## ❌ Bad

```ts
interface Order {
  items: Array<{ quantity: number; price: number }>;
  paid: boolean;
}

export function revenue(orders: Array<Order>): number {
  let total = 0;
  for (const order of orders) {
    if (order.paid) {
      for (const item of order.items) {
        if (item.quantity > 0) {
          if (item.price > 0) {
            total += item.quantity * item.price;
          } else {
            total += 0;
          }
        }
      }
    }
  }

  return total;
}
```

## ✅ Good

```ts
interface Item {
  quantity: number;
  price: number;
}

interface Order {
  items: Array<Item>;
  paid: boolean;
}

const itemTotal = (item: Item) => Math.max(item.quantity, 0) * Math.max(item.price, 0);

const orderTotal = (order: Order) => order.items.reduce((sum, item) => sum + itemTotal(item), 0);

export function revenue(orders: Array<Order>): number {
  return orders.filter((order) => order.paid).reduce((sum, order) => sum + orderTotal(order), 0);
}
```

Configured as `["error", 15]`. Early returns and small named helpers bring the score down; flattening the nesting matters more than shortening the function.

[Back to the rule list](../../README.md#added-rules)
