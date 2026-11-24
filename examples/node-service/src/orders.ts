export interface Order {
  express: boolean;
  id: string;
  region: string;
  total: number;
}

export function bigOrderIds(orders: Array<Order>): Array<string> {
  return orders.filter((order) => order.total > 100).map((order) => order.id);
}

export function totalsById(orders: Array<Order>): Record<string, number> {
  return orders.reduce<Record<string, number>>(
    (totals, order) => Object.assign({}, totals, { [order.id]: order.total }),
    {},
  );
}

export function shippingDays(order: Order): number {
  if (order.region === 'us') {
    if (order.express) {
      if (order.total > 100) {
        return 1;
      }

      return 2;
    }

    if (order.total > 100) {
      return 3;
    }

    return 4;
  }

  if (order.region === 'eu') {
    if (order.express) {
      if (order.total > 100) {
        return 2;
      }

      return 3;
    }

    return 5;
  }

  return order.express && order.total > 500 ? 6 : 9;
}
