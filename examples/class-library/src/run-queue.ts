import type { Clock } from './clock';

export class RunQueue {
  items: Array<string> = [];
  readonly seen = new Set<string>();
  #drained = 0;
  #limit = 10;

  constructor(private readonly clock: Clock) {}

  get limit(): number {
    return this.#limit;
  }

  set limit(value: number) {
    this.#limit = value;
  }

  push(item: string): boolean {
    if (this.items.length >= this.#limit) {
      return false;
    }

    this.items.push(item);
    this.seen.add(item);

    return true;
  }

  drain(): Array<string> {
    this.#drained = this.clock.now();

    return this.items.splice(0);
  }

  idleFor(): number {
    return this.clock.now() - this.#drained;
  }
}
