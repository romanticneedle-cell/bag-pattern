// 미리보기 패널: 패턴 SVG + (아이템이 제공하면) 완성 일러스트 렌더.
// 아이템 무관하게 item.build / item.illustration 을 사용한다.

import { renderPatternSVG } from '../core/render-svg';
import type { PatternSet } from '../core/types';
import type { ItemDef } from '../items';

export function renderPreview(
  patternEl: HTMLElement,
  illoEl: HTMLElement,
  item: ItemDef,
  params: Record<string, unknown>,
): void {
  const set: PatternSet = (item.build as (p: unknown) => PatternSet)(params);
  patternEl.innerHTML = renderPatternSVG(set, { maxWidth: 520 });

  // 일러스트는 선택 기능: 아이템에 illustration 이 있으면 그리고, 없으면 패널을 숨긴다.
  const illoFn = (item as { illustration?: (p: unknown) => string }).illustration;
  const col = illoEl.closest('[data-illo-col]') as HTMLElement | null;
  if (illoFn) {
    illoEl.innerHTML = illoFn(params);
    if (col) col.style.display = '';
  } else {
    illoEl.innerHTML = '';
    if (col) col.style.display = 'none';
  }
}
