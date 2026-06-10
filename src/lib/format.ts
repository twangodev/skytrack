const UNITS: [number, string][] = [
	[1e12, 'T'],
	[1e9, 'B'],
	[1e6, 'M'],
	[1e3, 'K']
];

function compactValue(value: number): number {
	// ~3 significant figures: 1.23K, 12.3B, 123M
	if (value < 10) return Math.round(value * 100) / 100;
	if (value < 100) return Math.round(value * 10) / 10;
	return Math.round(value);
}

export function formatCompact(n: number): string {
	for (const [div, suffix] of UNITS) {
		// 0.9995 threshold: values that would round up into the unit (999,999 -> 1M)
		// take it, while 999 stays plain.
		if (n >= div * 0.9995) return `${compactValue(n / div)}${suffix}`;
	}
	return `${Math.round(n)}`;
}

export function formatPrice(n: number): string {
	const rounded = Math.round(n * 10) / 10;
	return rounded.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatRelativeTime(msEpoch: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - msEpoch) / 1000));
	if (seconds < 60) return 'just now';
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function titleCase(id: string): string {
	return id
		.split(/[_:]/)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(' ');
}
