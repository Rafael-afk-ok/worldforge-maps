import { safeMediaUrl, youtubeEmbed } from '@/lib/map-entities';
import type { Dict } from '@/lib/i18n';
export function AnthemPlayer({ url, t }: { url?: string | undefined; t: Dict }) {
  const safe = safeMediaUrl(url);
  if (!safe) return null;
  const embed = youtubeEmbed(safe);
  return <section className="grid gap-3"><h3 className="label">{t.anthem}</h3>{embed ? <iframe className="anthem-video" src={embed} title={t.anthem} allow="encrypted-media; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <audio className="w-full" src={safe} controls preload="none" />}<a href={safe} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">{t.openOriginal}</a></section>;
}