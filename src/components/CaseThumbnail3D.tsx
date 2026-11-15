import React, { useEffect, useState } from 'react';
import type { CaseBox } from '../types';
import { resolveAssetUrl } from '../utils/assets';

interface CaseThumbnail3DProps {
  caseBox: Pick<CaseBox, 'id' | 'name' | 'tier' | 'imageUrl'>;
  className?: string;
}

function resolveStaticCasePreview(
  caseBox: Pick<CaseBox, 'id' | 'tier' | 'imageUrl'>
): string {
  const tierFallback = `/assets/cases/tier_${caseBox.tier || 'rare'}.png`;
  const raw = caseBox.imageUrl?.trim() ?? '';

  if (raw.startsWith('data:') || raw.startsWith('/assets/cases/')) {
    return raw;
  }

  // Legacy placeholder JPEGs map directly to pre-rendered tactical case PNG previews
  if (!raw || raw.startsWith('/src/assets/images/')) {
    return caseBox.id.startsWith('case_') ? `/assets/cases/${caseBox.id}.png` : tierFallback;
  }

  return resolveAssetUrl(raw);
}

export const CaseThumbnail3D: React.FC<CaseThumbnail3DProps> = ({ caseBox, className = '' }) => {
  const tierFallback = `/assets/cases/tier_${caseBox.tier || 'rare'}.png`;
  const primarySrc = resolveStaticCasePreview(caseBox);
  const [src, setSrc] = useState(primarySrc);

  useEffect(() => {
    setSrc(primarySrc);
  }, [primarySrc]);

  return (
    <img
      src={src}
      alt={caseBox.name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => {
        if (src !== tierFallback) {
          setSrc(tierFallback);
        }
      }}
      className={className}
    />
  );
};
