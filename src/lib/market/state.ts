import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import {
	HistoryFileSchema,
	ItemSeriesSchema,
	Kind,
	Tier,
	type ItemSeries
} from '$lib/proto/history_pb';
import { median } from './aggregate';

export type BazaarPoint = { t: number; b: number; s: number };
export type AuctionPoint = { t: number; l: number; m: number; c: number };

export interface MarketState {
	bazaar: {
		raw: Map<string, BazaarPoint[]>;
		hourly: Map<string, BazaarPoint[]>;
		daily: Map<string, BazaarPoint[]>;
	};
	auctions: {
		raw: Map<string, AuctionPoint[]>;
		daily: Map<string, AuctionPoint[]>;
	};
}

const DAY = 86_400;
const HOUR = 3_600;

/** raw points kept this long, then rolled to the next tier */
export const RAW_WINDOW = 30 * DAY;
/** hourly points kept this long, then rolled to daily */
export const HOURLY_WINDOW = 90 * DAY;

export const STATE_FILES = [
	{ name: 'bazaar-raw', kind: 'bazaar', tier: 'raw' },
	{ name: 'bazaar-hourly', kind: 'bazaar', tier: 'hourly' },
	{ name: 'bazaar-daily', kind: 'bazaar', tier: 'daily' },
	{ name: 'auctions-raw', kind: 'auctions', tier: 'raw' },
	{ name: 'auctions-daily', kind: 'auctions', tier: 'daily' }
] as const;

export type KindName = 'bazaar' | 'auctions';
export type TierName = 'raw' | 'hourly' | 'daily';

export function emptyState(): MarketState {
	return {
		bazaar: { raw: new Map(), hourly: new Map(), daily: new Map() },
		auctions: { raw: new Map(), daily: new Map() }
	};
}

// ---------------------------------------------------------------------------
// proto encode/decode

const KIND_TO_PROTO: Record<KindName, Kind> = {
	bazaar: Kind.BAZAAR,
	auctions: Kind.AUCTIONS
};
const TIER_TO_PROTO: Record<TierName, Tier> = {
	raw: Tier.RAW,
	hourly: Tier.HOURLY,
	daily: Tier.DAILY
};

const toTenths = (n: number) => {
	const tenths = n * 10;
	const rounded = Math.round(tenths);
	// the wire format carries one decimal - refuse to silently mutate finer
	// values between deploys (producers must round first)
	if (Math.abs(tenths - rounded) / Math.max(1, Math.abs(tenths)) > 1e-9) {
		throw new Error(`price ${n} has more than one decimal - round before encoding`);
	}
	return BigInt(rounded);
};
const fromTenths = (n: bigint) => Number(n) / 10;

function deltas(values: bigint[]): bigint[] {
	const out: bigint[] = [];
	let prev = 0n;
	for (const v of values) {
		out.push(v - prev);
		prev = v;
	}
	return out;
}

function undeltas(values: bigint[]): bigint[] {
	const out: bigint[] = [];
	let acc = 0n;
	for (const v of values) {
		acc += v;
		out.push(acc);
	}
	return out;
}

type AnyPoint = BazaarPoint | AuctionPoint;

function seriesToProto(kind: KindName, id: string, points: AnyPoint[]): ItemSeries {
	const ts = points.map((p) => BigInt(p.t));
	const a = points.map((p) =>
		toTenths(kind === 'bazaar' ? (p as BazaarPoint).b : (p as AuctionPoint).l)
	);
	const b = points.map((p) =>
		toTenths(kind === 'bazaar' ? (p as BazaarPoint).s : (p as AuctionPoint).m)
	);
	return create(ItemSeriesSchema, {
		id,
		tsDelta: deltas(ts),
		priceADelta: deltas(a),
		priceBDelta: deltas(b),
		count: kind === 'auctions' ? points.map((p) => BigInt((p as AuctionPoint).c)) : []
	});
}

function seriesFromProto(kind: KindName, series: ItemSeries): AnyPoint[] {
	const ts = undeltas(series.tsDelta);
	const a = undeltas(series.priceADelta);
	const b = undeltas(series.priceBDelta);
	return ts.map((t, i) =>
		kind === 'bazaar'
			? { t: Number(t), b: fromTenths(a[i]), s: fromTenths(b[i]) }
			: { t: Number(t), l: fromTenths(a[i]), m: fromTenths(b[i]), c: Number(series.count[i] ?? 0n) }
	);
}

export function encodeStateFile(
	kind: KindName,
	tier: TierName,
	items: ReadonlyMap<string, AnyPoint[]>
): Uint8Array {
	const file = create(HistoryFileSchema, {
		version: 1,
		kind: KIND_TO_PROTO[kind],
		tier: TIER_TO_PROTO[tier],
		items: [...items.entries()]
			.sort(([x], [y]) => x.localeCompare(y))
			.map(([id, points]) => seriesToProto(kind, id, points))
	});
	return toBinary(HistoryFileSchema, file);
}

export function decodeStateFile(bytes: Uint8Array): {
	kind: KindName;
	tier: TierName;
	items: Map<string, AnyPoint[]>;
} {
	const file = fromBinary(HistoryFileSchema, bytes);
	if (file.version !== 1) throw new Error(`unsupported state version ${file.version}`);
	const kind = file.kind === Kind.AUCTIONS ? 'auctions' : 'bazaar';
	const tier = file.tier === Tier.DAILY ? 'daily' : file.tier === Tier.HOURLY ? 'hourly' : 'raw';
	const items = new Map<string, AnyPoint[]>();
	for (const series of file.items) items.set(series.id, seriesFromProto(kind, series));
	return { kind, tier, items };
}

// ---------------------------------------------------------------------------
// mutation

export function appendSnapshot(
	state: MarketState,
	kind: KindName,
	points: ReadonlyMap<string, AnyPoint>
): void {
	const target = kind === 'bazaar' ? state.bazaar.raw : state.auctions.raw;
	for (const [id, point] of points) {
		const list = (target.get(id) ?? []) as AnyPoint[];
		const last = list[list.length - 1];
		if (last && point.t <= last.t) continue; // dedup / reject out-of-order
		list.push(point);
		(target as Map<string, AnyPoint[]>).set(id, list);
	}
}

function bucketMedian<P extends AnyPoint>(
	points: P[],
	bucketSeconds: number,
	reduce: (bucket: P[], bucketStart: number) => P
): P[] {
	const buckets = new Map<number, P[]>();
	for (const point of points) {
		const start = Math.floor(point.t / bucketSeconds) * bucketSeconds;
		const list = buckets.get(start) ?? [];
		list.push(point);
		buckets.set(start, list);
	}
	return [...buckets.entries()]
		.sort(([x], [y]) => x - y)
		.map(([start, list]) => reduce(list, start));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const bazaarMedian = (bucket: BazaarPoint[], t: number): BazaarPoint => ({
	t,
	b: round1(median(bucket.map((p) => p.b))),
	s: round1(median(bucket.map((p) => p.s)))
});

const auctionMedian = (bucket: AuctionPoint[], t: number): AuctionPoint => ({
	t,
	l: Math.round(median(bucket.map((p) => p.l))),
	m: Math.round(median(bucket.map((p) => p.m))),
	c: Math.max(...bucket.map((p) => p.c))
});

function spill<P extends AnyPoint>(
	from: Map<string, P[]>,
	into: Map<string, P[]>,
	cutoff: number,
	bucketSeconds: number,
	reduce: (bucket: P[], start: number) => P
): void {
	// Align the cutoff DOWN to a bucket boundary so a bucket only ever spills
	// once it is complete. Spilling a bucket's points across several runs would
	// recompute the "median" over a shrinking remainder and overwrite the
	// earlier result - the aggregate would converge to the last sample.
	const alignedCutoff = Math.floor(cutoff / bucketSeconds) * bucketSeconds;
	for (const [id, points] of from) {
		const stale = points.filter((p) => p.t < alignedCutoff);
		if (stale.length === 0) continue;
		from.set(
			id,
			points.filter((p) => p.t >= alignedCutoff)
		);
		const rolled = bucketMedian(stale, bucketSeconds, reduce);
		const existing = into.get(id) ?? [];
		// merge by bucket start (idempotent on crash-resume), keep sorted
		const merged = new Map<number, P>(existing.map((p) => [p.t, p]));
		for (const p of rolled) merged.set(p.t, p);
		into.set(
			id,
			[...merged.values()].sort((a, b) => a.t - b.t)
		);
	}
}

/** Roll stale points down the tiers and trim raw/hourly windows. */
export function rollup(state: MarketState, now: number): void {
	spill(state.bazaar.raw, state.bazaar.hourly, now - RAW_WINDOW, HOUR, bazaarMedian);
	spill(state.bazaar.hourly, state.bazaar.daily, now - HOURLY_WINDOW, DAY, bazaarMedian);
	spill(state.auctions.raw, state.auctions.daily, now - RAW_WINDOW, DAY, auctionMedian);
}

// ---------------------------------------------------------------------------
// validation

export function totalPoints(state: MarketState): number {
	let total = 0;
	for (const tier of [state.bazaar.raw, state.bazaar.hourly, state.bazaar.daily])
		for (const points of tier.values()) total += points.length;
	for (const tier of [state.auctions.raw, state.auctions.daily])
		for (const points of tier.values()) total += points.length;
	return total;
}

export function latestTimestamp(state: MarketState): number {
	let latest = 0;
	const scan = (tier: Map<string, AnyPoint[]>) => {
		for (const points of tier.values()) {
			const last = points[points.length - 1];
			if (last) latest = Math.max(latest, last.t);
		}
	};
	scan(state.bazaar.raw);
	scan(state.bazaar.hourly);
	scan(state.bazaar.daily);
	scan(state.auctions.raw);
	scan(state.auctions.daily);
	return latest;
}

export interface StateStats {
	total: number;
	latest: number;
}

/** Capture before mutating so validateGrowth needs no deep copy. */
export function stateStats(state: MarketState): StateStats {
	return { total: totalPoints(state), latest: latestTimestamp(state) };
}

/**
 * Guard against chain resets: the state we are about to publish must not be
 * meaningfully smaller or older than what the previous deploy carried.
 */
export function validateGrowth(prev: StateStats, next: MarketState): void {
	const nextTotal = totalPoints(next);
	if (nextTotal < prev.total * 0.98) {
		throw new Error(`state shrank: ${prev.total} -> ${nextTotal} points`);
	}
	const nextLatest = latestTimestamp(next);
	if (nextLatest < prev.latest) {
		throw new Error(`latest timestamp regressed: ${prev.latest} -> ${nextLatest}`);
	}
}
