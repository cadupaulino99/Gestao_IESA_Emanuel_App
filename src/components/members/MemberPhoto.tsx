import { useEffect, useState } from 'react';
import { memberPhotoUrl } from '../../lib/memberPhotos';

/* v1.17.0 (P1 «fotos»): fotografia do membro a partir do Storage (photoPath)
   com recurso ao base64 legado — o mesmo padrão dos cartazes (PosterImg). */
export default function MemberPhoto({
  member,
  className,
  alt = 'Fotografia do membro',
}: {
  member: { photoPath?: string | null; photoBase64?: string | null } | null;
  className?: string;
  alt?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const key = `${member?.photoPath || ''}|${(member?.photoBase64 || '').length}`;
  useEffect(() => {
    let alive = true;
    memberPhotoUrl(member)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
