import caseLegendCrate from '../assets/images/case_legend_crate_1794514881507.jpg';
import caseEpicCrate from '../assets/images/case_epic_crate_1794514882592.jpg';

const ASSET_MAP: Record<string, string> = {
  '/src/assets/images/case_legend_crate_1794514881507.jpg': caseLegendCrate,
  '/src/assets/images/case_epic_crate_1794514882592.jpg': caseEpicCrate,
};

export function resolveAssetUrl(url: string): string {
  return ASSET_MAP[url] ?? url;
}
