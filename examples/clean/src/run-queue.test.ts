import { expect, test } from 'vite-plus/test';
import { RunQueue } from './run-queue';

test('rejects items over its limit', () => {
  const queue = new RunQueue('jobs', { limit: 1 });
  expect(queue.push('a')).toBe(true);
  expect(queue.push('b')).toBe(false);
  expect(queue.items).toEqual(['a']);
});
