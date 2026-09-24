// 탬버린백 (원형) — 3호 아이템
//
// 앞뒤판이 완전한 원. 구조는 보스턴백과 동일:
//  1) 앞뒤판 (원, 1장 출력 '×2')
//  2) 옆면~바닥판 (직사각형: 세로=바닥두께 z, 가로=원둘레−지퍼구간)
//  3) 지퍼단 (직사각형 '×2': 세로=(z−지퍼두께)/2, 가로=지퍼구간)
//
// 입력 단위 mm, build 내부에서 cm(÷10)로 변환. 손잡이 조각 제외.
// 원은 정사각형+R 트릭 대신 4개의 3차 베지어 호로 직접 만든다(퇴화 세그먼트 방지).

import type { Mark, PatternSet, Piece, Pt, Segment } from '../core/types';
import { bounds, cutVertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';

export interface RoundParams {
  D: number; // 지름 (mm)
  z: number; // 바닥두께 (mm)
  zipPct: number; // 지퍼 구간 = 지름의 % (위에서 아래로, 0~100)
}

const SEAM = 1.0; // 시접 10mm
const ZIPPER = 1.0; // 지퍼 두께 10mm
const NOTCH = 0.5; // 정합 노치 눈금 길이(cm)
const PIECE_GAP = 4.0; // 조각 사이 배치 여백(cm)

type V = { x: number; y: number };
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};

/** 중심(cx,cy)·반지름 R 인 원을 4개 3차 베지어 호로. 시계방향(top→right→bottom→left). */
function circleSegments(cx: number, cy: number, R: number, start: Pt): Segment[] {
  const P = (t: number): Pt => ({ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t) });
  const k = (4 / 3) * Math.tan(Math.PI / 8); // 90° 호
  const segs: Segment[] = [];
  for (let i = 0; i < 4; i++) {
    const cur = -Math.PI / 2 + i * (Math.PI / 2);
    const nxt = cur + Math.PI / 2;
    const S = P(cur);
    const E = P(nxt);
    const c1 = { x: S.x - R * k * Math.sin(cur), y: S.y + R * k * Math.cos(cur) };
    const c2 = { x: E.x + R * k * Math.sin(nxt), y: E.y - R * k * Math.cos(nxt) };
    segs.push({ kind: 'curve', c1, c2, to: E, allowance: SEAM, role: 'cut' });
  }
  // 마지막 호의 끝을 정확히 start 로 스냅해 닫는다.
  segs[segs.length - 1].to = start;
  return segs;
}

/** 원형 앞뒤판. 중심(cx,cy), 반지름 R (cm). */
export function buildRoundPanel(cx: number, cy: number, R: number): Piece {
  const start: Pt = { x: cx, y: cy - R }; // 최상단
  return { name: '앞뒤판 (×2)', start, segments: circleSegments(cx, cy, R, start), onFold: false };
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

function cutBounds(piece: Piece) {
  return bounds(cutVertices(flattenPiece(piece)));
}

/** 원둘레(cm). */
export function circumference(D: number): number {
  return Math.PI * D;
}

/** 지퍼 구간 길이(cm) = 위쪽에서 y=zipPct%·D 지점까지의 상단 호. */
export function zipLength(D: number, zipPct: number): number {
  const R = D / 2;
  const yB = Math.min(Math.max((zipPct / 100) * D, 0.05 * D), 0.95 * D);
  const alpha = Math.acos(Math.max(-1, Math.min(1, 1 - yB / R))); // 상단에서 경계까지 각
  return R * 2 * alpha;
}

/** 전체 패턴 세트 생성. 입력 mm → 내부 cm. */
export function buildRoundPattern(pmm: RoundParams): PatternSet {
  const D = pmm.D / 10;
  const z = pmm.z / 10;
  const R = D / 2;
  const yB = Math.min(Math.max((pmm.zipPct / 100) * D, 0.05 * D), 0.95 * D);

  const circ = Math.PI * D;
  const Lzip = zipLength(D, pmm.zipPct);
  const Lside = circ - Lzip;
  const zipStripH = (z - ZIPPER) / 2; // 검증: ×2 + 지퍼두께 = z

  // 배치: 앞뒤판(원) 중심 (R,R) → x,y ≥ 0 (완성선 기준)
  const cx = R;
  const cy = R;
  const panel = buildRoundPanel(cx, cy, R);

  const pieces: Piece[] = [panel];
  const marks: Mark[] = [];

  const sideY = cutBounds(panel).maxY + PIECE_GAP;
  const side = buildRect(Lside, z, '옆면~바닥판', 0, sideY);
  pieces.push(side);
  const zipY = cutBounds(side).maxY + PIECE_GAP;
  const zipPiece = buildRect(Lzip, zipStripH, '지퍼단 (×2)', 0, zipY);
  pieces.push(zipPiece);

  // ── 정합 노치 ──
  const xb = Math.sqrt(Math.max(0, R * R - (yB - R) * (yB - R))); // 경계점 x 오프셋
  const center: V = { x: cx, y: cy };
  const push = (at: Pt, dir: V) => marks.push({ kind: 'notch', at, dir: norm(dir), tick: NOTCH });

  // 앞뒤판: 상단중앙·하단중앙·좌/우 경계 (안쪽 방향)
  const top: Pt = { x: cx, y: cy - R };
  const bottom: Pt = { x: cx, y: cy + R };
  const right: Pt = { x: cx + xb, y: yB };
  const left: Pt = { x: cx - xb, y: yB };
  push(top, { x: 0, y: 1 });
  push(bottom, { x: 0, y: -1 });
  push(right, { x: center.x - right.x, y: center.y - right.y });
  push(left, { x: center.x - left.x, y: center.y - left.y });

  // 지퍼단(길이 Lzip): 좌경계(0) → 상단중앙(Lzip/2) → 우경계(Lzip)
  for (const d of [0, Lzip / 2, Lzip]) {
    marks.push({ kind: 'notch', at: { x: d, y: zipY }, dir: { x: 0, y: 1 }, tick: NOTCH });
  }
  // 옆면~바닥판(길이 Lside): 우경계(0) → 하단중앙(Lside/2) → 좌경계(Lside)
  for (const d of [0, Lside / 2, Lside]) {
    marks.push({ kind: 'notch', at: { x: d, y: sideY }, dir: { x: 0, y: 1 }, tick: NOTCH });
  }

  return { pieces, marks };
}

// 아이템 메타/입력 정의
export const roundTambourineItem = {
  id: 'round-tambourine',
  name: '탬버린백 (원형)',
  inputs: [
    { key: 'D', label: '지름', unit: 'mm', default: 250 },
    { key: 'z', label: '바닥두께', unit: 'mm', default: 80 },
    { key: 'zipPct', label: '지퍼구간(지름%)', unit: '%', default: 45 },
  ],
  calibrationCm: 5,
  build: buildRoundPattern,
} as const;
