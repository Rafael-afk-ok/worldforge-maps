export type LocationData = { nationId?: string | undefined; photo?: string | undefined; photos?: string[] | undefined; npcs?: number; grossIncome?: number; expenses?: number; foodProduction?: number; foodConsumption?: number };
export function locationPhotos(location: LocationData): string[] {
  return [...new Set([...(location.photo ? [location.photo] : []), ...(location.photos ?? [])])];
}
export function locationTotals(locations: LocationData[]) {
  return locations.reduce((total, item) => ({
    population: total.population + (item.npcs ?? 0),
    income: total.income + (item.grossIncome ?? 0),
    expenses: total.expenses + (item.expenses ?? 0),
    foodProduction: total.foodProduction + (item.foodProduction ?? 0),
    foodConsumption: total.foodConsumption + (item.foodConsumption ?? 0),
    locations: total.locations + 1,
  }), { population: 0, income: 0, expenses: 0, foodProduction: 0, foodConsumption: 0, locations: 0 });
}
export function safeMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function youtubeEmbed(value: string): string | undefined {
  const safe = safeMediaUrl(value);
  if (!safe) return undefined;
  const url = new URL(safe);
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'youtube-nocookie.com'].includes(host) ? (url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]) : undefined;
  return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : undefined;
}