const ALIASES: Record<string, string[]> = {
	HYPERION: ['hype', 'wither blade'],
	TERMINATOR: ['term'],
	NECRON_HANDLE: ['handle', "necron's handle"],
	ASPECT_OF_THE_END: ['aote'],
	ASPECT_OF_THE_VOID: ['aotv'],
	JUJU_SHORTBOW: ['juju'],
	BONEMERANG: ['bone'],
	BOOSTER_COOKIE: ['cookie'],
	RECOMBOBULATOR_3000: ['recomb'],
	STOCK_OF_STONKS: ['stonks']
};

export function aliasesForItem(id: string): string[] {
	return ALIASES[id] ?? [];
}
