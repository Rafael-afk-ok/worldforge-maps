import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Dict } from '@/lib/i18n';

export function PhotoGallery({ photos, title, t, onRemove }: { photos: { src: string; caption?: string }[]; title: string; t: Dict; onRemove?: (src: string) => void }) {
  const [active, setActive] = useState<string | null>(null);
  if (!photos.length) return <p className="text-sm text-muted-foreground">{t.noPhoto}</p>;
  return <><div className="photo-gallery">{photos.map((photo, index) => <figure key={`${photo.src}-${index}`}>
    <Button variant="ghost" className="gallery-photo" aria-label={`${title} ${index + 1}`} onClick={() => setActive(photo.src)}><img src={photo.src} alt={photo.caption ?? title} loading="lazy" /></Button>
    <figcaption className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{photo.caption ?? `${title} ${index + 1}`}</span>{onRemove && <Button variant="ghost" size="icon" title={t.removePhoto} aria-label={t.removePhoto} onClick={() => onRemove(photo.src)}><X /></Button>}</figcaption>
  </figure>)}</div>{active && <div className="photo-lightbox" role="dialog" aria-label={title} onClick={() => setActive(null)}><Button size="icon" variant="secondary" title={t.close} aria-label={t.close} onClick={() => setActive(null)}><X /></Button><img src={active} alt={title} /></div>}</>;
}