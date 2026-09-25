// 보스턴백 (가운데 가로지퍼) — 4호 아이템 (더플백 구조)
//
// 구조:
//  - 옆판(마구리) 2장 = 가방 양쪽 끝 단면. 모양 3종 선택: 원 / 둥근 사다리꼴 / 각진 사각.
//  - 몸판(본체) 1장 = 직사각형. 가로 = 가방 길이 L, 세로 = 옆판 둘레 P (옆판을 감싼다).
//  - 지퍼 = 몸판 가운데(세로 중앙 y=P/2)에 가로로 전체 길이 L. 통짜에 위치선만 표시.
//  - 바닥 = 몸판 위·아래 가로변(길이 L)을 골선(allowance 0). 좌·우 세로변(길이 P)은 재단선(시접 1cm).
//
// 입력 단위 mm, build 내부에서 cm(÷10)로 변환.
// 옆판 기하는 기존 아이템 재사용: 사다리꼴=boston-zip 의 computePanel/buildPanel,
// 원=round-tambourine 의 buildRoundPanel/circumference.

import type { Guide, Mark, PatternSet, Piece, Pt, Segment } from '../core/types';
import { bounds, cutVertices, vertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';
import { buildPanel, computePanel } from './boston-zip';
import { buildRoundPanel, circumference } from './round-tambourine';

export type CapShape = 'circle' | 'roundedTrap' | 'sharpTrap';

export interface CenterZipParams {
  shape: CapShape;
  L: number; // 가방 가로길이 (mm)
  // circle
  D?: number; // 지름 (mm)
  // roundedTrap / sharpTrap
  topW?: number; // 윗변 (mm)
  bottomW?: number; // 아랫변 (mm)
  capH?: number; // 옆판 세로 (mm)
  rt?: number; // 위 모서리 R (mm) — sharpTrap 은 0
  rb?: number; // 아래 모서리 R (mm) — sharpTrap 은 0
}

const SEAM = 1.0; // 시접 10mm
const NOTCH = 0.5; // 정합 노치 눈금 길이(cm)
const PIECE_GAP = 4.0; // 조각 사이 배치 여백(cm)

type V = { x: number; y: number };
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};

// ── 옆판(마구리) ─────────────────────────────────────────────────────
interface SidePanel {
  piece: Piece;
  P: number; // 옆판 둘레(cm) = 몸판 세로
  centroid: V; // 안쪽 방향 판정용 내부점
}

/** 모양에 따라 옆판 조각과 둘레를 만든다. 인자는 cm. */
function buildSidePanel(p: CenterZipParams): SidePanel {
  if (p.shape === 'circle') {
    const D = (p.D ?? 0) / 10;
    const R = D / 2;
    const piece = buildRoundPanel(R, R, R); // 중심 (R,R) → x,y ≥ 0
    piece.name = '옆판 (×2)';
    return { piece, P: circumference(D), centroid: { x: R, y: R } };
  }
  // roundedTrap / sharpTrap — sharpTrap 은 rt=rb=0
  const topW = (p.topW ?? 0) / 10;
  const bottomW = (p.bottomW ?? 0) / 10;
  const capH = (p.capH ?? 0) / 10;
  const rt = p.shape === 'sharpTrap' ? 0 : (p.rt ?? 0) / 10;
  const rb = p.shape === 'sharpTrap' ? 0 : (p.rb ?? 0) / 10;
  const ox = Math.max(topW, bottomW) / 2; // x ≥ 0 으로 이동
  const piece = buildPanel(topW, bottomW, capH, rt, rb, ox, 0);
  piece.name = '옆판 (×2)';
  const P = computePanel(topW, bottomW, capH, rt, rb).perimeter;
  return { piece, P, centroid: { x: ox, y: capH / 2 } };
}

// ── 외곽선 둘레거리 샘플러 (평탄화된 조각) ────────────────────────────
function outlineSampler(flat: Piece) {
  const vs = vertices(flat);
  const n = vs.length;
  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const a = vs[i];
    const b = vs[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    segLen.push(l);
    total += l;
  }
  /** 둘레거리 arc 지점의 좌표와 진행 접선. */
  const at = (arc: number): { pt: Pt; tan: V } => {
    let s = ((arc % total) + total) % total;
    for (let i = 0; i < n; i++) {
      if (s <= segLen[i] || i === n - 1) {
        const a = vs[i];
        const b = vs[(i + 1) % n];
        const f = segLen[i] > 1e-9 ? s / segLen[i] : 0;
        return {
          pt: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
          tan: norm({ x: b.x - a.x, y: b.y - a.y }),
        };
      }
      s -= segLen[i];
    }
    return { pt: vs[0], tan: { x: 1, y: 0 } };
  };
  /** target 에 가장 가까운 외곽선 지점까지의 둘레거리. */
  const arcOf = (target: Pt): number => {
    let best = 0;
    let bestD = Infinity;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = vs[i];
      const b = vs[(i + 1) % n];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      let f = ((target.x - a.x) * dx + (target.y - a.y) * dy) / L2;
      f = Math.max(0, Math.min(1, f));
      const px = a.x + dx * f;
      const py = a.y + dy * f;
      const d = Math.hypot(target.x - px, target.y - py);
      if (d < bestD) {
        bestD = d;
        best = acc + Math.hypot(px - a.x, py - a.y);
      }
      acc += segLen[i];
    }
    return best;
  };
  return { total, at, arcOf };
}

/** 외곽선 접선 tan 에 수직이며 centroid 쪽(안쪽)을 향하는 단위 벡터. */
function inwardNormal(pt: Pt, tan: V, centroid: V): V {
  let nx = -tan.y;
  let ny = tan.x;
  if ((centroid.x - pt.x) * nx + (centroid.y - pt.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return norm({ x: nx, y: ny });
}

// ── 몸판 ─────────────────────────────────────────────────────────────
/** 몸판 직사각형(가로 L, 세로 P). 위·아래=골선(allowance 0), 좌·우=재단선(시접 1cm). */
function buildBody(L: number, P: number, ox: number, oy: number): Piece {
  const p = (x: number, y: number): Pt => ({ x: ox + x, y: oy + y });
  const start = p(0, 0);
  const segments: Segment[] = [
    { kind: 'line', to: p(L, 0), allowance: 0, role: 'fold' }, // 윗 가로변 = 바닥 골선
    { kind: 'line', to: p(L, P), allowance: SEAM, role: 'cut' }, // 우 세로변 = 옆판 부착
    { kind: 'line', to: p(0, P), allowance: 0, role: 'fold' }, // 아랫 가로변 = 바닥 골선
    { kind: 'line', to: start, allowance: SEAM, role: 'cut' }, // 좌 세로변 = 옆판 부착
  ];
  // 가운데 가로 지퍼 위치선 (점선)
  const guides: Guide[] = [{ a: p(0, P / 2), b: p(L, P / 2), role: 'sew' }];
  return { name: '몸판', start, segments, onFold: true, guides };
}

// ── 전체 패턴 ────────────────────────────────────────────────────────
export function buildCenterZipPattern(pmm: CenterZipParams): PatternSet {
  const L = pmm.L / 10;
  const side = buildSidePanel(pmm);
  const P = side.P;

  const pieces: Piece[] = [side.piece];
  const marks: Mark[] = [];

  // 몸판: 옆판 아래에 배치
  const bodyOy = bounds(cutVertices(flattenPiece(side.piece))).maxY + PIECE_GAP;
  const bodyOx = 0;
  const body = buildBody(L, P, bodyOx, bodyOy);
  pieces.push(body);

  // ── 정합 노치 (몸판 ↔ 옆판, 둘레거리 대응) ──
  // 옆판 외곽선을 '바닥(최하단)' 기준 둘레거리 0 으로 잡고 1/4·1/2·3/4 지점을 뽑는다.
  //   0=바닥 ↔ 몸판 y=0,P / 1/4·3/4=좌우 ↔ y=P/4,3P/4 / 1/2=최상단(지퍼) ↔ y=P/2.
  const flatSide = flattenPiece(side.piece);
  const s = outlineSampler(flatSide);
  const sb = bounds(vertices(flatSide));
  const bottomCenter: Pt = { x: side.centroid.x, y: sb.maxY }; // 옆판 최하단 중앙
  const s0 = s.arcOf(bottomCenter);

  // 옆판 노치 4개 (바닥·우·상단·좌)
  for (const f of [0, 0.25, 0.5, 0.75]) {
    const { pt, tan } = s.at(s0 + f * s.total);
    marks.push({ kind: 'notch', at: pt, dir: inwardNormal(pt, tan, side.centroid), tick: NOTCH });
  }

  // 몸판 좌·우 세로변 노치: y = 0, P/4, P/2, 3P/4, P (안쪽 수평 방향)
  for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
    const y = bodyOy + fy * P;
    marks.push({ kind: 'notch', at: { x: bodyOx, y }, dir: { x: 1, y: 0 }, tick: NOTCH }); // 좌변
    marks.push({ kind: 'notch', at: { x: bodyOx + L, y }, dir: { x: -1, y: 0 }, tick: NOTCH }); // 우변
  }

  return { pieces, marks };
}

// 아이템 메타/입력 정의
export const bostonCenterZipItem = {
  id: 'boston-center-zip',
  name: '보스턴백 (가운데 가로지퍼)',
  select: {
    key: 'shape',
    label: '옆판 모양',
    options: [
      { value: 'circle', label: '원' },
      { value: 'roundedTrap', label: '둥근 사다리꼴' },
      { value: 'sharpTrap', label: '각진 사각/사다리꼴' },
    ],
    default: 'roundedTrap',
  },
  inputs: [
    { key: 'L', label: '가방 가로길이', unit: 'mm', default: 400 }, // 공통
    // circle
    { key: 'D', label: '지름', unit: 'mm', default: 250, showFor: ['circle'] },
    // roundedTrap
    { key: 'topW', label: '윗변', unit: 'mm', default: 260, showFor: ['roundedTrap'] },
    { key: 'bottomW', label: '아랫변', unit: 'mm', default: 320, showFor: ['roundedTrap'] },
    { key: 'capH', label: '옆판 세로', unit: 'mm', default: 200, showFor: ['roundedTrap'] },
    { key: 'rt', label: '위 모서리 R', unit: 'mm', default: 40, showFor: ['roundedTrap'] },
    { key: 'rb', label: '아래 모서리 R', unit: 'mm', default: 60, showFor: ['roundedTrap'] },
    // sharpTrap (각짐: rt=rb=0). 별도 키로 고유 기본값 유지.
    { key: 'stopW', label: '윗변', unit: 'mm', default: 300, showFor: ['sharpTrap'] },
    { key: 'sbottomW', label: '아랫변', unit: 'mm', default: 300, showFor: ['sharpTrap'] },
    { key: 'scapH', label: '옆판 세로', unit: 'mm', default: 200, showFor: ['sharpTrap'] },
  ],
  calibrationCm: 5,
  // 폼 값·선택 → build 파라미터. 모양에 따라 관련 입력만 사용.
  deriveParams: (
    v: Record<string, number>,
    _t: Record<string, boolean>,
    s: Record<string, string>,
  ): CenterZipParams => {
    const shape = (s.shape as CapShape) ?? 'roundedTrap';
    if (shape === 'circle') return { shape, L: v.L, D: v.D };
    if (shape === 'sharpTrap') {
      return { shape, L: v.L, topW: v.stopW, bottomW: v.sbottomW, capH: v.scapH, rt: 0, rb: 0 };
    }
    return { shape, L: v.L, topW: v.topW, bottomW: v.bottomW, capH: v.capH, rt: v.rt, rb: v.rb };
  },
  build: buildCenterZipPattern,
} as const;
