import { loadMarketSeries } from './client';
import type { ItemSeriesJson } from './series';

export class ItemHistory {
	series = $state<ItemSeriesJson | null>(null);
	loading = $state(true);
	failed = $state(false);
	#active = false;

	constructor(private slug: string) {}

	start(): void {
		this.#active = true;
		void this.refresh();
	}

	stop(): void {
		this.#active = false;
	}

	async refresh(): Promise<void> {
		this.loading = true;
		this.failed = false;
		const series = await loadMarketSeries(this.slug);
		if (!this.#active) return;
		this.series = series;
		this.loading = false;
		this.failed = series === null;
	}
}
