// 미리보기 패널: 패턴 SVG + 완성 가방 일러스트 렌더.

import { renderBagIllustration, renderPatternSVG } from '../core/render-svg';
import type { ToteParams } from '../items/tote-cross';
import { buildTotePattern } from '../items/tote-cross';

export function renderPreview(
  patternEl: HTMLElement,
  illoEl: HTMLElement,
  params: ToteParams,
): void {
  const set = buildTotePattern(params);
  patternEl.innerHTML = renderPatternSVG(set, { maxWidth: 520 });
  illoEl.innerHTML = renderBagIllustration({
    x: params.x,
    y: params.y,
    z: params.z,
    strapLength: params.strapLength,
  });
}
