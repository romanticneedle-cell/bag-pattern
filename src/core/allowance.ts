// 변별 시접 → 재단선 교점 계산
//
// 핵심 규칙 (지시서 §3):
//   1. 각 변을 자기 allowance 만큼 "바깥 방향"으로 평행이동한다.
//   2. 인접한 두 변의 평행이동된 직선의 교점을 재단선 꼭짓점으로 삼는다.
//   3. allowance: 0 인 골선은 평행이동하지 않는다 (완성선 = 재단선).
//
// 이 방식은 볼록 코너와 오목 코너를 동일하게 정확히 처리한다.
// (다각형 전체를 한 번에 부풀리는 오프셋은 오목 코너에서 선이 교차/반전된다.)

import type { Mark, Piece, Pt, Segment } from './types';

type Vec = { x: number; y: number };

const EPS = 1e-9;

function sub(a: Pt, b: Pt): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: Pt, b: Vec): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(v: Vec, s: number): Vec {
  return { x: v.x * s, y: v.y * s };
}
function len(v: Vec): number {
  return Math.hypot(v.x, v.y);
}
function normalize(v: Vec): Vec {
  const l = len(v);
  if (l < EPS) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

/**
 * 시계방향(좌상단 원점, y 아래로 증가) 다각형에서 진행방향 dir 에 대한
 * 바깥쪽 단위 법선. dir=(dx,dy) 일 때 outward = normalize(dy, -dx).
 */
export function outwardNormal(dir: Vec): Vec {
  return normalize({ x: dir.y, y: -dir.x });
}

/** 조각의 꼭짓점 배열 (V0=start, V[i]=segments[i-1].to). n개. */
export function vertices(piece: Piece): Pt[] {
  const vs: Pt[] = [piece.start];
  for (let i = 0; i < piece.segments.length - 1; i++) {
    vs.push(piece.segments[i].to);
  }
  return vs;
}

/** 세그먼트 시작/끝에서의 접선 방향. */
function tangents(from: Pt, seg: Segment): { start: Vec; end: Vec } {
  if (seg.kind === 'line') {
    const d = sub(seg.to, from);
    return { start: d, end: d };
  }
  // curve: 시작 접선 = c1-from, 끝 접선 = to-c2
  return { start: sub(seg.c1, from), end: sub(seg.to, seg.c2) };
}

type Line = { p: Pt; d: Vec };

/** 두 파라메트릭 직선의 교점. 평행이면 null. */
function intersect(l1: Line, l2: Line): Pt | null {
  const denom = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(denom) < EPS) return null; // 평행/공선
  const dp = sub(l2.p, l1.p);
  const t = (dp.x * l2.d.y - dp.y * l2.d.x) / denom;
  return add(l1.p, scale(l1.d, t));
}

/**
 * 재단선 꼭짓점 배열을 반환한다. 완성선 꼭짓점과 1:1 대응, 시계방향, 닫힌 다각형.
 * cut[i] = (i-1)번 세그먼트의 끝 오프셋선 ∩ i번 세그먼트의 시작 오프셋선.
 */
export function cutVertices(piece: Piece): Pt[] {
  const verts = vertices(piece);
  const n = verts.length;
  const segs = piece.segments;

  // 각 세그먼트의 시작/끝 오프셋 직선을 미리 계산한다.
  const startLine: Line[] = [];
  const endLine: Line[] = [];
  for (let i = 0; i < n; i++) {
    const from = verts[i];
    const seg = segs[i];
    const t = tangents(from, seg);
    const nStart = outwardNormal(t.start);
    const nEnd = outwardNormal(t.end);
    const off = seg.allowance; // 골선이면 0 → 평행이동 없음
    startLine[i] = { p: add(from, scale(nStart, off)), d: t.start };
    endLine[i] = { p: add(seg.to, scale(nEnd, off)), d: t.end };
  }

  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const incoming = endLine[prev]; // prev 세그먼트가 verts[i] 에서 끝남
    const outgoing = startLine[i]; // i 세그먼트가 verts[i] 에서 시작
    const x = intersect(incoming, outgoing);
    if (x) {
      out.push(x);
    } else {
      // 평행(공선) 폴백: 두 오프셋 지점의 평균
      out.push({
        x: (incoming.p.x + outgoing.p.x) / 2,
        y: (incoming.p.y + outgoing.p.y) / 2,
      });
    }
  }
  return out;
}

/** 마크가 차지하는 좌표점들 (바운딩 계산용). */
export function markExtentPoints(m: Mark): Pt[] {
  if (m.kind === 'strap') {
    return [{ x: m.at.x, y: m.at.y - m.tick }, m.at];
  }
  // notch: 기준점 ~ 눈금 끝점
  return [m.at, { x: m.at.x + m.dir.x * m.tick, y: m.at.y + m.dir.y * m.tick }];
}

/** 축정렬 바운딩 박스 (cm). */
export function bounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
