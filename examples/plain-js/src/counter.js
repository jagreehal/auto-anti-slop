// Only TypeScript has `readonly`, so a public field is fine here.
export class Counter {
  #step = 1;
  count = 0;

  increment() {
    this.count += this.#step;
  }
}
