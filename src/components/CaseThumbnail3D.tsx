import React, { useEffect, useState } from 'react';
import type { CaseBox } from '../types';
import { resolveAssetUrl } from '../utils/assets';
import { renderCaseThumbnail3D } from '../utils/caseModel3D';

interface CaseThumbnail3DProps {
  caseBox: Pick<CaseBox, 'id' | 'name' | 'tier' | 'imageUrl'>;
  className?: string;
}

export const CaseThumbnail3D: React.FC<CaseThumbnail3DProps> = ({ caseBox, className = '' }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(() => renderCaseThumbnail3D(caseBox));

  useEffect(() => {
    const rendered = renderCaseThumbnail3D(caseBox);
    if (rendered) {
      setThumbUrl(rendered);
    }
  }, [caseBox.id, caseBox.name, caseBox.tier]);

  return (
    <img
      src={thumbUrl ?? resolveAssetUrl(caseBox.imageUrl)}
      alt={caseBox.name}
      referrerPolicy="no-referrer"
      className={className}
    />
  );
};
