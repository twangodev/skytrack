import { afterEach, expect, test, vi } from 'vitest';
import { AsyncCache } from './async-cache';

afterEach(() => vi.useRealTimers());

test('shares concurrent work and expires without extending freshness on hits', async () => {
	vi.useFakeTimers();
	const cache = new AsyncCache(60_000, 2);
	const compute = vi.fn(async () => 42);
	expect(await Promise.all([cache.get('a', compute), cache.get('a', compute)])).toEqual([42, 42]);
	expect(compute).toHaveBeenCalledTimes(1);
	vi.advanceTimersByTime(59_000);
	await cache.get('a', compute);
	vi.advanceTimersByTime(1_000);
	await cache.get('a', compute);
	expect(compute).toHaveBeenCalledTimes(2);
});

test('failed work can be retried', async () => {
	const cache = new AsyncCache(60_000, 2);
	const compute = vi.fn().mockRejectedValueOnce(new Error('D1 unavailable')).mockResolvedValue(42);
	await expect(cache.get('a', compute)).rejects.toThrow('D1 unavailable');
	expect(await cache.get('a', compute)).toBe(42);
});

test('evicts least recently used entries and limits retained weight', async () => {
	const cache = new AsyncCache(60_000, 2, 5);
	const compute = vi.fn(async () => [1, 2]);
	const get = (key: string) => cache.get(key, compute, (value) => value.length);
	await get('a');
	await get('b');
	await get('a');
	await get('c');
	await get('a');
	expect(compute).toHaveBeenCalledTimes(3);
	await get('b');
	expect(compute).toHaveBeenCalledTimes(4);
	const huge = vi.fn(async () => new Array(6));
	await cache.get('huge', huge, (value) => value.length);
	await cache.get('huge', huge, (value) => value.length);
	expect(huge).toHaveBeenCalledTimes(2);
	await get('b');
	expect(compute).toHaveBeenCalledTimes(4);
});

test('total retained weight is bounded even below the entry limit', async () => {
	const cache = new AsyncCache(60_000, 10, 3);
	const compute = vi.fn(async () => [1, 2]);
	await cache.get('a', compute, (value) => value.length);
	await cache.get('b', compute, (value) => value.length);
	await cache.get('a', compute, (value) => value.length);
	expect(compute).toHaveBeenCalledTimes(3);
});

test('cleared in-flight work cannot overwrite a replacement', async () => {
	const cache = new AsyncCache(60_000, 2);
	let finish!: (value: number) => void;
	const old = cache.get(
		'a',
		() =>
			new Promise<number>((resolve) => {
				finish = resolve;
			})
	);
	await Promise.resolve();
	cache.clear();
	expect(await cache.get('a', async () => 2)).toBe(2);
	finish(1);
	expect(await old).toBe(1);
	expect(await cache.get('a', async () => 3)).toBe(2);
});
