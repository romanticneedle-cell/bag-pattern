// 곡선 평탄화(flatten) 유틸.
//
// curve(3차 베지어) 세그먼트를 촘촘한 line 세그먼트들로 분할해
// Piece 를 line-only Piece 로 변환한다.
// → allowance.cutVertices / render-svg / pdf / bounds 가 곡선을 별도 처리하지 않고
//   기존 직선 로직(오목·볼록 코너 오프셋 교점)을 그대로 재사용할 수 있다.
//   둥근 코너는 촘촘한 폴리라인으로 매끈하게 보이며, 시접 오프셋도 정확히 반영된다.
//
// 직선만 있는 Piece 는 평탄화해도 결과가 완전히 동일하다(항등: 같은 객체 반환).
// → 기존 tote(직선 전용) 동작·테스트가 그대로 유지된다.

import type { Piece, Pt, Segment } from './types';

// 곡선 1개(보스턴백 코너=쿼터원)당 분할 수. 20~24 이면 육안상 매끈하다.
const DEFAULT_STEPS = 24;

/** 3차 베지어 위 파라미터 t(0~1) 지점. */
function bezierPoint(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/**
 * curve 세그먼트를 line 세그먼트들로 바꾼 Piece 를 반환한다.
 * line 세그먼트는 그대로 두고, 곡선이 하나도 없으면 원본 객체를 그대로 돌려준다.
 * 분할된 line 은 원래 곡선의 allowance·role 을 그대로 승계한다.
 */
export function flattenPiece(piece: Piece, steps = DEFAULT_STEPS): Piece {
  let hasCurve = false;
  for (const s of piece.segments) {
    if (s.kind === 'curve') {
      hasCurve = true;
      break;
    }
  }
  if (!hasCurve) return piece; // 직선 전용: 항등

  const out: Segment[] = [];
  let from: Pt = piece.start;
  for (const seg of piece.segments) {
    if (seg.kind === 'line') {
      out.push(seg);
      from = seg.to;
    } else {
      // t = 1/steps .. 1 을 샘플해 각 소구간을 line 으로. 마지막(t=1)은 정확히 seg.to.
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const to = bezierPoint(from, seg.c1, seg.c2, seg.to, t);
        out.push({ kind: 'line', to, allowance: seg.allowance, role: seg.role });
      }
      from = seg.to;
    }
  }
  return { ...piece, segments: out };
}
