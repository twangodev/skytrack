import { loadMarketSnapshot, type MarketSnapshotJson } from './client';

const POLL_MS = 60_000;

export class LiveMarket {
	snapshot = $state<MarketSnapshotJson | null>(null);
	loading = $state(true);
	failed = $state(false);

	#slug: string;
	#timer: ReturnType<typeof setInterval> | null = null;
	#active = false;

	constructor(slug: string) {
		this.#slug = slug;
	}

	start(): void {
		if (this.#active) return;
		this.#active = true;
		void this.#poll();
		this.#timer = setInterval(() => {
			if (!document.hidden) void this.#poll();
		}, POLL_MS);
		document.addEventListener('visibilitychange', this.#onVisible);
	}

	stop(): void {
		this.#active = false;
		if (this.#timer !== null) clearInterval(this.#timer);
		this.#timer = null;
		document.removeEventListener('visibilitychange', this.#onVisible);
	}

	async refresh(): Promise<void> {
		this.loading = true;
		this.failed = false;
		await this.#poll();
	}

	#onVisible = () => {
		if (!document.hidden) void this.#poll();
	};

	async #poll(): Promise<void> {
		const snapshot = await loadMarketSnapshot(this.#slug);
		if (!this.#active) return;
		if (snapshot !== null) this.snapshot = snapshot;
		this.loading = false;
		this.failed = snapshot === null;
	}
}
