// 지퍼 보스턴백 (둥근 모서리) — 2호 아이템
//
// 입력 단위: mm. 엔진(core/PDF)은 cm 기준이므로 build 내부에서 mm→cm(÷10)로
// 변환한 좌표로 Piece 를 만든다. 폼 표시 단위만 'mm'. 손잡이 조각은 제외한다.
//
// 앞뒤판은 윗변 폭(topW)·아랫변 폭(bottomW)을 따로 받는다.
//  - topW == bottomW → 직사각형(둥근 사각형, 기존과 동일)
//  - topW != bottomW → 사다리꼴. 둥근 모서리는 기울어진 옆변에도 접하는 원호 필렛.
//
// 조각 구성 (모두 cm 좌표):
//  1) 앞뒤판 (1장 출력, 라벨 '×2'): 둥근 사다리꼴. 위 코너 R=rt, 아래 코너 R=rb.
//     코너는 곡선(원호=3차 베지어 근사) 세그먼트. 각 변 시접 1cm.
//  2) 옆면~바닥판 (1장): 직사각형. 세로=z, 가로=둘레−지퍼구간길이.
//  3) 지퍼단 (1장 출력, '×2'): 직사각형. 세로=(z−지퍼두께)/2, 가로=지퍼구간길이.
//
// 정합 노치: 앞뒤판의 상단중앙·하단중앙·좌2/5·우2/5(지퍼↔옆면 경계) 지점과,
// 옆면/지퍼단 직사각형의 대응(둘레 거리 기준) 지점에 표시한다.

import type { Mark, PatternSet, Piece, Pt, Segment } from '../core/types';
import { bounds, cutVertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';

export interface BostonParams {
  topW: number; // 윗변 폭 (mm)
  bottomW: number; // 아랫변 폭 (mm)
  H: number; // 세로 (mm)
  rt: number; // 위 모서리 반지름 (mm)
  rb: number; // 아래 모서리 반지름 (mm)
  z: number; // 바닥두께 (mm)
  zipPct: number; // 지퍼 구간 = 세로의 % (0~100)
}

// 고정 상수 (cm)
const R_EPS = 1e-6; // 이보다 작은 반지름은 '각진 코너'로 처리
const SEAM = 1.0; // 시접 10mm
const ZIPPER = 1.0; // 지퍼 두께 10mm
const NOTCH = 0.5; // 정합 노치 눈금 길이(cm)
const PIECE_GAP = 4.0; // 조각 사이 배치 여백(cm)

// ── 벡터 유틸 (cm) ───────────────────────────────────────────────────
type V = { x: number; y: number };
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: V, s: number): V => ({ x: a.x * s, y: a.y * s });
const vlen = (a: V): number => Math.hypot(a.x, a.y);
const norm = (a: V): V => {
  const l = vlen(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y;

// ── 앞뒤판 기하 계산 (필렛) ──────────────────────────────────────────

/** 한 코너의 필렛 정보. */
interface Corner {
  V: V; // 필렛 전 꼭짓점
  u: V; // 이전 꼭짓점 방향 단위벡터
  w: V; // 다음 꼭짓점 방향 단위벡터
  alpha: number; // 두 변 사잇각(내각)
  r: number; // 클램프 후 반지름
  t: number; // 접점까지 거리
  P1: V; // 이전 변 쪽 접점
  P2: V; // 다음 변 쪽 접점
  C: V; // 호 중심
  arc: number; // 호각 = π − alpha
}

interface PanelGeom {
  corners: Corner[]; // 시계방향 [TL, TR, BR, BL]
  edgeStraight: number[]; // 각 변의 직선 잔여 길이 [top, right, bottom, left]
  perimeter: number;
}

/**
 * 사다리꼴(대칭축=세로 중심, y 아래로) 앞뒤판의 필렛 기하를 계산한다. (중심 좌표, cm)
 * 꼭짓점 시계방향: TL(−topW/2,0) TR(+topW/2,0) BR(+bottomW/2,H) BL(−bottomW/2,H).
 * 각 코너를 두 인접 변에 접하는 반지름 r 의 원호로 필렛. 짧은 변에서 겹치지 않도록
 * 접점거리 t 를 인접 변 길이의 절반으로 클램프(필요 시 r 축소).
 * topW==bottomW(사각형, α=90°)이면 기존 쿼터원과 동일하다.
 */
export function computePanel(
  topW: number,
  bottomW: number,
  H: number,
  rt: number,
  rb: number,
): PanelGeom {
  const Vs: V[] = [
    { x: -topW / 2, y: 0 }, // TL
    { x: topW / 2, y: 0 }, // TR
    { x: bottomW / 2, y: H }, // BR
    { x: -bottomW / 2, y: H }, // BL
  ];
  const Rs = [rt, rt, rb, rb];
  // 변 길이: e0=TL→TR(윗변), e1=TR→BR(우측 옆변), e2=BR→BL(아랫변), e3=BL→TL(좌측 옆변)
  const edgeLen = [
    vlen(sub(Vs[1], Vs[0])),
    vlen(sub(Vs[2], Vs[1])),
    vlen(sub(Vs[3], Vs[2])),
    vlen(sub(Vs[0], Vs[3])),
  ];

  const corners: Corner[] = [];
  for (let i = 0; i < 4; i++) {
    const V0 = Vs[i];
    const prev = Vs[(i + 3) % 4];
    const next = Vs[(i + 1) % 4];
    const u = norm(sub(prev, V0));
    const w = norm(sub(next, V0));
    const alpha = Math.acos(Math.max(-1, Math.min(1, dot(u, w))));
    let r = Rs[i];
    let t = r / Math.tan(alpha / 2);
    // 클램프: t 는 인접한 두 변 길이의 절반을 넘지 못한다 → r 축소.
    const maxT = Math.min(edgeLen[(i + 3) % 4], edgeLen[i]) / 2;
    if (t > maxT) {
      t = maxT;
      r = t * Math.tan(alpha / 2);
    }
    const P1 = add(V0, mul(u, t)); // 이전 변 쪽 접점
    const P2 = add(V0, mul(w, t)); // 다음 변 쪽 접점
    const C = add(V0, mul(norm(add(u, w)), r / Math.sin(alpha / 2)));
    corners.push({ V: V0, u, w, alpha, r, t, P1, P2, C, arc: Math.PI - alpha });
  }

  const edgeStraight: number[] = [];
  for (let i = 0; i < 4; i++) {
    edgeStraight[i] = edgeLen[i] - corners[i].t - corners[(i + 1) % 4].t;
  }
  let perimeter = 0;
  for (let i = 0; i < 4; i++) perimeter += edgeStraight[i] + corners[i].r * corners[i].arc;

  return { corners, edgeStraight, perimeter };
}

interface ZipGeom {
  Lzip: number; // 지퍼 구간 외곽선 길이
  boundaryLeft: V; // 좌측 지퍼↔옆면 경계점 (중심 좌표)
  boundaryRight: V; // 우측 경계점
  yB: number; // 경계 y = (zipPct/100)·H
  dist: number; // 위쪽 접점(TR.P2)에서 경계점까지 옆변 거리
}

/**
 * 지퍼 구간 = 윗변 직선 + 위 두 코너 호 + 양 옆변을 따라 y=(zipPct/100)·H 지점까지.
 * 옆변이 기울어졌으므로 경계는 y 로 잡고, 그 점까지의 외곽선 거리로 지퍼/옆면 경계를 정한다.
 */
export function computeZip(geom: PanelGeom, H: number, zipPct: number): ZipGeom {
  const [TL, TR, , ] = geom.corners;
  const yB = (zipPct / 100) * H;
  const topTangent = TR.P2; // 우측 옆변 위(위쪽) 접점
  const edgeDir = TR.w; // TR→BR 방향(아래로)
  const slantStraight = geom.edgeStraight[1]; // 우측 옆변 직선 잔여
  let dist = (yB - topTangent.y) / edgeDir.y;
  dist = Math.max(0, Math.min(dist, slantStraight));

  const Lzip = geom.edgeStraight[0] + TL.r * TL.arc + TR.r * TR.arc + 2 * dist;
  const boundaryRight = add(topTangent, mul(edgeDir, dist));
  const boundaryLeft = { x: -boundaryRight.x, y: boundaryRight.y }; // 대칭
  return { Lzip, boundaryLeft, boundaryRight, yB, dist };
}

// ── 공개 기하 공식 래퍼 ──────────────────────────────────────────────

/** 앞뒤판 둘레(cm). */
export function perimeter(
  topW: number,
  bottomW: number,
  H: number,
  rt: number,
  rb: number,
): number {
  return computePanel(topW, bottomW, H, rt, rb).perimeter;
}

/** 지퍼 구간 길이(cm). */
export function zipLength(
  topW: number,
  bottomW: number,
  H: number,
  rt: number,
  rb: number,
  zipPct: number,
): number {
  return computeZip(computePanel(topW, bottomW, H, rt, rb), H, zipPct).Lzip;
}

// ── 원호 → 3차 베지어 근사 ───────────────────────────────────────────

/**
 * 중심 C, 반지름 r 인 원 위에서 P1→P2 로 가는 단소호(<180°)를 3차 베지어로 근사한다.
 * 90°를 넘으면 여러 개로 분할한다. 사각형(90°)일 때 kappa=0.5523 쿼터원과 동일.
 */
function arcToBeziers(P1: V, P2: V, C: V, r: number): { c1: V; c2: V; to: V }[] {
  const a0 = Math.atan2(P1.y - C.y, P1.x - C.x);
  const a1 = Math.atan2(P2.y - C.y, P2.x - C.x);
  let d = a1 - a0;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI; // 단소호 (부호가 진행방향)
  const n = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 2) - 1e-9));
  const step = d / n;
  const k = (4 / 3) * Math.tan(step / 4);

  const out: { c1: V; c2: V; to: V }[] = [];
  let cur = a0;
  for (let i = 0; i < n; i++) {
    const nxt = cur + step;
    const S = { x: C.x + r * Math.cos(cur), y: C.y + r * Math.sin(cur) };
    const E = { x: C.x + r * Math.cos(nxt), y: C.y + r * Math.sin(nxt) };
    const c1 = { x: S.x - r * k * Math.sin(cur), y: S.y + r * k * Math.cos(cur) };
    const c2 = { x: E.x + r * k * Math.sin(nxt), y: E.y - r * k * Math.cos(nxt) };
    out.push({ c1, c2, to: E });
    cur = nxt;
  }
  return out;
}

// ── 조각 생성 ────────────────────────────────────────────────────────

/**
 * 앞뒤판(둥근 사다리꼴). 시계방향, 코너는 원호 곡선 세그먼트.
 * 인자는 cm. (ox,oy) 로 배치 위치를 옮긴다.
 */
export function buildPanel(
  topW: number,
  bottomW: number,
  H: number,
  rt: number,
  rb: number,
  ox = 0,
  oy = 0,
): Piece {
  const geom = computePanel(topW, bottomW, H, rt, rb);
  const off = (p: V): Pt => ({ x: ox + p.x, y: oy + p.y });
  const start = off(geom.corners[0].P2); // TL 의 다음 변 쪽 접점(윗변 시작)

  const segments: Segment[] = [];
  // 시계방향으로 다음 코너부터: 그 코너의 P1 까지 직선 → 코너 호(P1→P2)
  // r≈0(각진 코너)이면 꼭짓점까지 직선만 긋고 호는 생략한다(퇴화 곡선 방지).
  for (const idx of [1, 2, 3, 0]) {
    const c = geom.corners[idx];
    if (c.r < R_EPS) {
      segments.push({ kind: 'line', to: off(c.V), allowance: SEAM, role: 'cut' });
      continue;
    }
    segments.push({ kind: 'line', to: off(c.P1), allowance: SEAM, role: 'cut' });
    for (const b of arcToBeziers(c.P1, c.P2, c.C, c.r)) {
      segments.push({
        kind: 'curve',
        c1: off(b.c1),
        c2: off(b.c2),
        to: off(b.to),
        allowance: SEAM,
        role: 'cut',
      });
    }
  }
  // 마지막 세그먼트 to 를 정확히 start 로 스냅해 닫는다.
  segments[segments.length - 1].to = start;

  return { name: '앞뒤판 (×2)', start, segments, onFold: false };
}

/** 단순 직사각형 조각(cm). 전 변 시접 1cm. */
function buildRect(w: number, h: number, name: string, ox = 0, oy = 0): Piece {
  const P = (x: number, y: number): Pt => ({ x: ox + x, y: oy + y });
  const line = (to: Pt): Segment => ({ kind: 'line', to, allowance: SEAM, role: 'cut' });
  const start = P(0, 0);
  return {
    name,
    start,
    segments: [line(P(w, 0)), line(P(w, h)), line(P(0, h)), line(start)],
    onFold: false,
  };
}

/** 조각의 재단선(곡선 포함) 바운딩 (cm). */
function cutBounds(piece: Piece) {
  return bounds(cutVertices(flattenPiece(piece)));
}

/** 전체 패턴 세트 생성. 입력은 mm, 내부에서 cm 로 변환. */
export function buildBostonPattern(pmm: BostonParams): PatternSet {
  // mm → cm
  const topW = pmm.topW / 10;
  const bottomW = pmm.bottomW / 10;
  const H = pmm.H / 10;
  const rt = pmm.rt / 10;
  const rb = pmm.rb / 10;
  const z = pmm.z / 10;
  const zipPct = pmm.zipPct;

  const geom = computePanel(topW, bottomW, H, rt, rb);
  const zip = computeZip(geom, H, zipPct);
  const Lzip = zip.Lzip;
  const Lside = geom.perimeter - Lzip; // 옆면~바닥판 길이
  const zipStripH = (z - ZIPPER) / 2; // 지퍼단 세로 (검증: ×2 + 지퍼두께 = z)

  const pieces: Piece[] = [];
  const marks: Mark[] = [];

  // 1) 앞뒤판 — x≥0 이 되도록 넓은 변의 절반만큼 우측으로 이동
  const ox = Math.max(topW, bottomW) / 2;
  const oy = 0;
  const off = (p: V): Pt => ({ x: ox + p.x, y: oy + p.y });
  const panel = buildPanel(topW, bottomW, H, rt, rb, ox, oy);
  pieces.push(panel);

  // 조각 배치 (앞뒤판 아래로 옆면~바닥판, 그 아래 지퍼단)
  const sideY = cutBounds(panel).maxY + PIECE_GAP;
  const side = buildRect(Lside, z, '옆면~바닥판', 0, sideY);
  pieces.push(side);
  const zipY = cutBounds(side).maxY + PIECE_GAP;
  const zipPiece = buildRect(Lzip, zipStripH, '지퍼단 (×2)', 0, zipY);
  pieces.push(zipPiece);

  // ── 정합 노치 ──────────────────────────────────────────────────────
  // 노치를 앞뒤판(2D)과 옆면/지퍼단 직사각형(둘레거리)에 대응 배치한다.
  // 대응 규칙: 외곽선을 지퍼 구간(윗변+위코너+옆변 2/5까지)과 옆면 구간(나머지)으로 나눠,
  //   각 구간의 외곽선 거리를 해당 직사각형 긴 변의 위치로 매핑한다.
  const MIN_GAP = 0.4; // 이보다 가까운 노치는 하나로 병합
  const [TL, TR, BR, BL] = geom.corners;
  const distR = zip.dist;
  const top = geom.edgeStraight[0];
  const e1 = geom.edgeStraight[1];
  const e2 = geom.edgeStraight[2];
  const arcL = (c: Corner) => c.r * c.arc;
  const arcTL = arcL(TL);
  const arcTR = arcL(TR);
  const arcBR = arcL(BR);
  const arcBL = arcL(BL);

  // (a) 앞뒤판 노치 (2D). 근접 병합.
  type PN = { at: Pt; dir: V };
  const panelNotches: PN[] = [];
  const pushPanel = (atV: V, dir: V) => {
    const at = off(atV);
    for (const p of panelNotches) {
      if (Math.hypot(p.at.x - at.x, p.at.y - at.y) < MIN_GAP) return;
    }
    panelNotches.push({ at, dir: norm(dir) });
  };
  // 중앙 2개
  pushPanel({ x: 0, y: 0 }, { x: 0, y: 1 }); // 상단중앙
  pushPanel({ x: 0, y: H }, { x: 0, y: -1 }); // 하단중앙
  // 지퍼↔옆면 경계(2/5) 2개 — 옆변에 수직 방향
  let nR: V = { x: -TR.w.y, y: TR.w.x };
  if (nR.x > 0) nR = { x: -nR.x, y: -nR.y }; // 안쪽(−x) 향하도록
  pushPanel(zip.boundaryRight, nR);
  pushPanel(zip.boundaryLeft, { x: -nR.x, y: nR.y });
  // 코너 노치: 둥근 코너는 필렛 시작·끝 접점 2개(반지름 방향), 각진 코너는 꼭짓점 1개(이등분선 안쪽)
  for (const c of geom.corners) {
    if (c.r < R_EPS) {
      pushPanel(c.V, norm(add(c.u, c.w)));
    } else {
      pushPanel(c.P1, sub(c.C, c.P1));
      pushPanel(c.P2, sub(c.C, c.P2));
    }
  }
  for (const pn of panelNotches) {
    marks.push({ kind: 'notch', at: pn.at, dir: pn.dir, tick: NOTCH });
  }

  // (b) 직사각형 노치 (둘레거리 → x). 근접 병합.
  const dedup = (arr: number[]): number[] => {
    const out: number[] = [];
    for (const d of arr) if (!out.some((o) => Math.abs(o - d) < MIN_GAP)) out.push(d);
    return out;
  };
  // 지퍼단: 좌경계(0) → 좌상 접점 → TL호끝 → 상단중앙 → TR호시작 → 우상 접점 → 우경계(Lzip)
  const zipDs = dedup([
    0,
    distR,
    distR + arcTL,
    distR + arcTL + top / 2,
    distR + arcTL + top,
    distR + arcTL + top + arcTR,
    Lzip,
  ]);
  for (const d of zipDs) {
    marks.push({ kind: 'notch', at: { x: d, y: zipY }, dir: { x: 0, y: 1 }, tick: NOTCH });
  }
  // 옆면~바닥판: 우경계(0) → 우하 접점 → BR호끝 → 하단중앙 → BL호시작 → BL호끝 → 좌경계(Lside)
  const sideDs = dedup([
    0,
    e1 - distR,
    e1 - distR + arcBR,
    e1 - distR + arcBR + e2 / 2,
    e1 - distR + arcBR + e2,
    e1 - distR + arcBR + e2 + arcBL,
    Lside,
  ]);
  for (const d of sideDs) {
    marks.push({ kind: 'notch', at: { x: d, y: sideY }, dir: { x: 0, y: 1 }, tick: NOTCH });
  }

  return { pieces, marks };
}

// 아이템 메타/입력 정의 (UI 가 참조)
export const bostonZipItem = {
  id: 'boston-zip',
  name: '지퍼 보스턴백 (둥근 모서리)',
  inputs: [
    { key: 'topW', label: '윗변 폭', unit: 'mm', default: 260 },
    { key: 'bottomW', label: '아랫변 폭', unit: 'mm', default: 320 },
    { key: 'H', label: '세로', unit: 'mm', default: 200 },
    { key: 'rt', label: '위 모서리 R', unit: 'mm', default: 40 },
    { key: 'rb', label: '아래 모서리 R', unit: 'mm', default: 60 },
    { key: 'z', label: '바닥두께', unit: 'mm', default: 100 },
    { key: 'zipPct', label: '지퍼구간(세로%)', unit: '%', default: 40 },
  ],
  toggles: [{ key: 'sharpCorners', label: '모서리 각지게 (안 둥글림)', default: false }],
  calibrationCm: 5, // 검증 사각형 5cm
  // 폼 값·토글 → build 파라미터. '모서리 각지게' 체크 시 위/아래 R 을 0 으로.
  deriveParams: (v: Record<string, number>, t: Record<string, boolean>): BostonParams => ({
    topW: v.topW,
    bottomW: v.bottomW,
    H: v.H,
    rt: t.sharpCorners ? 0 : v.rt,
    rb: t.sharpCorners ? 0 : v.rb,
    z: v.z,
    zipPct: v.zipPct,
  }),
  build: buildBostonPattern,
} as const;
