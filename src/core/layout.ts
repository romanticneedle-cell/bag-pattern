// 조각 배치(패킹) 유틸 — 용지 절약.
//
// 각 조각의 재단선 바운딩(flatten 후)을 기준으로 shelf(행) 패킹을 한다.
//  - 높이 큰 것부터 정렬해 maxWidth 안에서 가로로 채우고, 넘치면 다음 행으로.
//  - 폭이 maxWidth 를 넘는 긴 조각(옆면 등)은 90° 회전해 폭 안에 들이는 것을 시도.
//  - 완전히 결정적(deterministic): 같은 입력이면 항상 같은 배치.
//
// 조각을 실제로 이동·회전한 새 PatternSet 을 돌려준다. 세그먼트(곡선 포함)·guides·
// marks(at/dir)까지 모두 변환한다. 마크는 자기 조각의 재단 바운딩 안에 있으므로
// 그 조각과 함께 이동·회전시킨다(노치 dir 도 회전).

import type { Mark, PatternSet, Piece, Pt, Segment } from './types';
import { bounds, cutVertices } from './allowance';
import { flattenPiece } from './flatten';

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** 점 회전 (rot: 0 또는 90°, 원점 기준). 90° → (x,y)↦(−y,x). */
function rotPt(p: Pt, rot: number): Pt {
  return rot === 90 ? { x: -p.y, y: p.x } : { x: p.x, y: p.y };
}

/** 점 변환: 회전(rot) 후 평행이동(tx,ty). */
function xform(p: Pt, rot: number, tx: number, ty: number): Pt {
  const r = rotPt(p, rot);
  return { x: r.x + tx, y: r.y + ty };
}

/** 조각 전체(세그먼트·guides·start)를 회전+평행이동한다. */
export function transformPiece(piece: Piece, rot: number, tx: number, ty: number): Piece {
  const T = (p: Pt) => xform(p, rot, tx, ty);
  const segments: Segment[] = piece.segments.map((s) =>
    s.kind === 'line'
      ? { ...s, to: T(s.to) }
      : { ...s, c1: T(s.c1), c2: T(s.c2), to: T(s.to) },
  );
  const guides = piece.guides?.map((g) => ({ ...g, a: T(g.a), b: T(g.b) }));
  return { ...piece, start: T(piece.start), segments, guides };
}

/** 마크를 회전+평행이동한다. notch 의 dir 은 회전만(평행이동 없음). */
export function transformMark(mark: Mark, rot: number, tx: number, ty: number): Mark {
  if (mark.kind === 'strap') {
    return { ...mark, at: xform(mark.at, rot, tx, ty) };
  }
  return { ...mark, at: xform(mark.at, rot, tx, ty), dir: rotPt(mark.dir, rot) };
}

export interface PackOptions {
  maxWidthCm: number; // 배치 최대 폭(인쇄영역 폭)
  gap?: number; // 조각 간 여백(cm). 기본 1.
  allowRotate?: boolean; // 90° 회전 허용. 기본 true.
}

/**
 * PatternSet 의 조각들을 shelf 패킹으로 재배치한 새 PatternSet 을 반환한다.
 * 배치 후 콘텐츠는 (0,0) 부근에서 시작한다(각자 PDF 여백은 별도).
 */
export function packPatternSet(set: PatternSet, opts: PackOptions): PatternSet {
  const gap = opts.gap ?? 1.0;
  const maxW = opts.maxWidthCm;
  const allowRot = opts.allowRotate ?? true;
  const eps = 1e-6;
  const n = set.pieces.length;

  // 각 조각의 재단선 바운딩(flatten 후) + flatten 조각 캐시
  const flat = set.pieces.map((p) => flattenPiece(p));
  const cutbb: Box[] = flat.map((p) => bounds(cutVertices(p)));

  // 마크를 자기 조각(재단 바운딩 포함)에 귀속시킨다.
  const marksByPiece: Mark[][] = set.pieces.map(() => []);
  const orphan: Mark[] = [];
  const pad = 0.05; // 경계 여유(cm)
  for (const m of set.marks) {
    let idx = -1;
    for (let i = 0; i < n; i++) {
      const b = cutbb[i];
      if (
        m.at.x >= b.minX - pad &&
        m.at.x <= b.maxX + pad &&
        m.at.y >= b.minY - pad &&
        m.at.y <= b.maxY + pad
      ) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) marksByPiece[idx].push(m);
    else orphan.push(m);
  }

  // 방향 결정: 기본 rot0. 폭이 넘치고 회전하면 들어오는 경우만 90°.
  const rot: number[] = [];
  const ow: number[] = [];
  const oh: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = cutbb[i];
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    let r = 0;
    if (allowRot && w > maxW + eps && h <= maxW + eps) r = 90;
    rot[i] = r;
    ow[i] = r === 90 ? h : w;
    oh[i] = r === 90 ? w : h;
  }

  // 높이 큰 것부터(동률이면 원래 순서) 정렬해 배치 순서를 정한다.
  const order = [...Array(n).keys()].sort((a, b) => oh[b] - oh[a] || a - b);

  // shelf 패킹
  const tx: number[] = [];
  const ty: number[] = [];
  let x = 0;
  let shelfY = 0;
  let shelfH = 0;
  for (const i of order) {
    const w = ow[i];
    const h = oh[i];
    if (x > 0 && x + gap + w > maxW + eps) {
      // 현재 행에 안 들어감 → 다음 행
      shelfY += shelfH + gap;
      x = 0;
      shelfH = 0;
    }
    const placeX = x === 0 ? 0 : x + gap;
    // 회전된 재단 바운딩의 min 을 (placeX, shelfY) 에 맞추는 평행이동량 계산
    const rv = cutVertices(flat[i]).map((p) => rotPt(p, rot[i]));
    const rb = bounds(rv);
    tx[i] = placeX - rb.minX;
    ty[i] = shelfY - rb.minY;
    x = placeX + w;
    shelfH = Math.max(shelfH, h);
  }

  // 변환 적용 (조각은 원래 순서로 유지)
  const pieces = set.pieces.map((p, i) => transformPiece(p, rot[i], tx[i], ty[i]));
  const marks: Mark[] = [];
  for (let i = 0; i < n; i++) {
    for (const m of marksByPiece[i]) marks.push(transformMark(m, rot[i], tx[i], ty[i]));
  }
  for (const m of orphan) marks.push(m); // 귀속 못한 마크는 원위치 유지

  return { pieces, marks };
}
