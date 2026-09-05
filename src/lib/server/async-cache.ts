// Isolate-local reuse only; response cache headers still control HTTP freshness.
export class AsyncCache {
	#entries = new Map<string, { expires: number; weight: number; value: Promise<unknown> }>();
	#weight = 0;

	constructor(
		private ttlMs: number,
		private maxEntries: number,
		private maxWeight = maxEntries
	) {}

	clear(): void {
		this.#entries.clear();
		this.#weight = 0;
	}

	#delete(key: string): void {
		const entry = this.#entries.get(key);
		if (entry) this.#weight -= entry.weight;
		this.#entries.delete(key);
	}

	get<T>(
		key: string,
		compute: () => Promise<T>,
		weigh: (value: T) => number = () => 1
	): Promise<T> {
		const now = Date.now();
		for (const [key, entry] of this.#entries) {
			if (entry.expires <= now) this.#delete(key);
		}
		const hit = this.#entries.get(key);
		if (hit) {
			this.#entries.delete(key);
			this.#entries.set(key, hit);
			return hit.value as Promise<T>;
		}
		const entry = {
			expires: now + this.ttlMs,
			weight: 0,
			value: Promise.resolve() as Promise<unknown>
		};
		entry.value = Promise.resolve()
			.then(compute)
			.then(
				(value) => {
					if (this.#entries.get(key) !== entry) return value;
					entry.weight = Math.max(1, weigh(value));
					this.#weight += entry.weight;
					if (entry.weight > this.maxWeight) this.#delete(key);
					this.#trim();
					return value;
				},
				(error: unknown) => {
					if (this.#entries.get(key) === entry) this.#delete(key);
					throw error;
				}
			);
		this.#entries.set(key, entry);
		this.#trim();
		return entry.value as Promise<T>;
	}

	#trim(): void {
		while (this.#entries.size > this.maxEntries || this.#weight > this.maxWeight) {
			this.#delete(this.#entries.keys().next().value!);
		}
	}
}
