import { shippingDays } from './orders';
import type { Order } from './orders';

type Payload = Record<string, unknown>;

declare function save(order: Order): Promise<void>;

function parseOrder(input: unknown): Order {
  if (typeof input !== 'object') {
    throw 'not an order';
  }

  return input as Order;
}

export async function handle(request: Request): Promise<Response> {
  const body: Payload = await request.json();
  const order = parseOrder(body);
  const trace = request as unknown as { id: string };

  if (order.id == null) {
    return new Response(null, { status: 400 });
  }

  save(order);
  console.log(trace.id);

  return Response.json({ days: shippingDays(order) });
}

export async function retry(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch {}
}
