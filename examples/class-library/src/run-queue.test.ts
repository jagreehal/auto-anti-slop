import { expect, test, vi } from 'vite-plus/test';
import { RunQueue } from './run-queue';

vi.mock('./clock');

test('rejects items over its limit', () => {
  const queue = new RunQueue({ now: () => 0 });
  queue.limit = 1;
  expect(queue.push('a')).toBe(true);
  expect(queue.push('b')).toBe(false);
});

test('drains', () => {
  new RunQueue({ now: () => 0 }).drain();
});
