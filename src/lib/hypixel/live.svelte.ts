import { bazaarResponse, type BazaarProduct } from '$lib/hypixel/types';
import { BAZAAR_URL } from '$lib/hypixel/endpoints';

const POLL_MS = 30_000;

/** Client-side bazaar poller for a single product. Pauses while the tab is hidden. */
export class LiveBazaar {
	product = $state<BazaarProduct | null>(null);
	lastUpdated = $state<number | null>(null);
	failed = $state(false);

	#productId: string;
	#timer: ReturnType<typeof setInterval> | null = null;

	constructor(productId: string) {
		this.#productId = productId;
	}

	start() {
		void this.#poll();
		this.#timer = setInterval(() => {
			if (!document.hidden) void this.#poll();
		}, POLL_MS);
		document.addEventListener('visibilitychange', this.#onVisible);
	}

	stop() {
		if (this.#timer !== null) clearInterval(this.#timer);
		this.#timer = null;
		document.removeEventListener('visibilitychange', this.#onVisible);
	}

	#onVisible = () => {
		if (!document.hidden) void this.#poll();
	};

	async #poll() {
		try {
			const res = await fetch(BAZAAR_URL);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const parsed = bazaarResponse.parse(await res.json());
			const product = parsed.products[this.#productId];
			if (!product) throw new Error('product missing from response');
			this.product = product;
			this.lastUpdated = parsed.lastUpdated;
			this.failed = false;
		} catch {
			this.failed = true;
		}
	}
}
