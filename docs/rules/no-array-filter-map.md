# `anti-slop/no-array-filter-map`

`.filter().map()` walks the array twice and builds a throwaway array in between. Do it in one pass.

## ❌ Bad

```ts
interface User {
  active: boolean;
  email: string;
}

export const emails = (users: Array<User>) =>
  users.filter((user) => user.active).map((user) => user.email);
```

## ✅ Good

```ts
interface User {
  active: boolean;
  email: string;
}

export const emails = (users: Array<User>): Array<string> =>
  users.flatMap((user) => (user.active ? [user.email] : []));
```

Iterator helpers also pass, where your runtime supports them: `users.values().filter(…).map(…).toArray()`. The rule flags any two adjacent `filter` and `map` calls, in either order.

[Back to the rule list](../../README.md#added-rules)
