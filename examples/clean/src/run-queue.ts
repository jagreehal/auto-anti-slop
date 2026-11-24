interface RunQueueOptions {
  limit: number;
}

export class RunQueue {
  static readonly defaults: RunQueueOptions = { limit: 10 };
  readonly #items: Array<string> = [];
  #drains = 0;

  constructor(
    readonly name: string,
    private readonly options: RunQueueOptions = RunQueue.defaults,
  ) {}

  get drains(): number {
    return this.#drains;
  }

  get items(): ReadonlyArray<string> {
    return this.#items;
  }

  push(item: string): boolean {
    if (this.#items.length >= this.options.limit) {
      return false;
    }

    this.#items.push(item);

    return true;
  }

  drain(): Array<string> {
    this.#drains += 1;

    return this.#items.splice(0);
  }
}
