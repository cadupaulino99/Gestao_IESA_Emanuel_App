import { cn } from '@/src/lib/utils';

type Props = {
  src: string;
  alt?: string;
  className?: string;
  /** true = acima da dobra (pré-visualização no formulário) */
  priority?: boolean;
};

/**
 * Imagem de cartaz optimizada:
 * - decoding=async: não bloqueia a thread principal
 * - loading=lazy: só descarrega perto da viewport (salvo priority)
 * - fetchPriority=low no feed para não competir com o LCP
 */
export function PosterImage({ src, alt = 'Cartaz do evento', className, priority = false }: Props) {
  return (
    <img
      src={src}
      alt={alt}
      className={cn('poster-img', className)}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : 'low'}
    />
  );
}
