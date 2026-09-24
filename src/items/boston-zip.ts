// 지퍼 보스턴백 (둥근 모서리) — 2호 아이템
//
// 입력 단위: mm. 엔진(core/PDF)은 cm 기준이므로 build 내부에서 mm→cm(÷10)로
// 변환한 좌표로 Piece 를 만든다. 폼 표시 단위만 'mm'.
// 손잡이 조각은 제외한다.
//
// 조각 구성 (모두 cm 좌표):
//  1) 앞뒤판 (1장 출력, 라벨 '×2'): 둥근 사각형. 위 코너 R=rt, 아래 코너 R=rb.
//     코너는 곡선(쿼터원) 세그먼트. 각 변 시접 1cm.
//  2) 옆면~바닥판 (1장): 직사각형. 세로=z, 가로=둘레−지퍼구간길이.
//  3) 지퍼단 (1장 출력, '×2'): 직사각형. 세로=(z−지퍼두께)/2, 가로=지퍼구간길이.
//
// 정합 노치: 앞뒤판의 상단중앙·하단중앙·좌2/5·우2/5(지퍼↔옆면 경계) 지점과,
// 옆면/지퍼단 직사각형의 대응(둘레 거리 기준) 지점에 표시한다.

import type { Mark, PatternSet, Piece, Pt, Segment } from '../core/types';
import { bounds, cutVertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';

export interface BostonParams {
  W: number; // 가로 (mm)
  H: number; // 세로 (mm)
  rt: number; // 위 모서리 반지름 (mm)
  rb: number; // 아래 모서리 반지름 (mm)
  z: number; // 바닥두께 (mm)
  zipPct: number; // 지퍼 구간 = 세로의 % (0~100)
}

// 고정 상수 (cm)
const SEAM = 1.0; // 시접 10mm
const ZIPPER = 1.0; // 지퍼 두께 10mm
const NOTCH = 0.5; // 정합 노치 눈금 길이(cm)
const PIECE_GAP = 4.0; // 조각 사이 배치 여백(cm)
// 쿼터원 근사용 3차 베지어 상수 (kappa = 4/3·(√2−1))
const KAPPA = 0.5522847498307936;

// ── 기하 공식 (cm 인자) ──────────────────────────────────────────────

/** 둥근 사각형 둘레 P = (W−2rt)+(W−2rb)+2(H−rt−rb)+π(rt+rb). */
export function perimeter(W: number, H: number, rt: number, rb: number): number {
  return (W - 2 * rt) + (W - 2 * rb) + 2 * (H - rt - rb) + Math.PI * (rt + rb);
}

/**
 * 지퍼구간길이 L_zip = 윗변 + 위 두 코너(합쳐 반원=π·rt) + 양옆 세로로 zipPct 지점까지.
 * = (W−2rt) + π·rt + 2·max(0, (zipPct/100)·H − rt).
 */
export function zipLength(W: number, H: number, rt: number, zipPct: number): number {
  return (W - 2 * rt) + Math.PI * rt + 2 * Math.max(0, (zipPct / 100) * H - rt);
}

// ── 조각 생성 ────────────────────────────────────────────────────────

/**
 * 앞뒤판(둥근 사각형). 좌우 대칭, 위 코너 rt / 아래 코너 rb.
 * 시계방향(좌상단 원점, y 아래로 증가). 코너는 쿼터원 곡선 세그먼트.
 * 인자는 cm.
 */
export function buildPanel(
  W: number,
  H: number,
  rt: number,
  rb: number,
  ox = 0,
  oy = 0,
): Piece {
  const P = (x: number, y: number): Pt => ({ x: ox + x, y: oy + y });
  const line = (to: Pt): Segment => ({ kind: 'line', to, allowance: SEAM, role: 'cut' });
  const curve = (c1: Pt, c2: Pt, to: Pt): Segment => ({
    kind: 'curve',
    c1,
    c2,
    to,
    allowance: SEAM,
    role: 'cut',
  });
  const kt = KAPPA * rt;
  const kb = KAPPA * rb;

  const start = P(rt, 0); // 윗변 왼쪽 시작점
  const segments: Segment[] = [
    line(P(W - rt, 0)), // 윗변
    curve(P(W - rt + kt, 0), P(W, rt - kt), P(W, rt)), // 우상 코너
    line(P(W, H - rb)), // 우변
    curve(P(W, H - rb + kb), P(W - rb + kb, H), P(W - rb, H)), // 우하 코너
    line(P(rb, H)), // 아랫변
    curve(P(rb - kb, H), P(0, H - rb + kb), P(0, H - rb)), // 좌하 코너
    line(P(0, rt)), // 좌변
    curve(P(0, rt - kt), P(rt - kt, 0), P(rt, 0)), // 좌상 코너 (start 로 닫힘)
  ];

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
  const W = pmm.W / 10;
  const H = pmm.H / 10;
  const rt = pmm.rt / 10;
  const rb = pmm.rb / 10;
  const z = pmm.z / 10;
  const zipPct = pmm.zipPct;

  const Lzip = zipLength(W, H, rt, zipPct); // 지퍼구간길이
  const Lside = perimeter(W, H, rt, rb) - Lzip; // 옆면~바닥판 길이
  const zipStripH = (z - ZIPPER) / 2; // 지퍼단 세로 (검증: ×2 + 지퍼두께 = z)

  const pieces: Piece[] = [];
  const marks: Mark[] = [];

  // 1) 앞뒤판
  const panel = buildPanel(W, H, rt, rb, 0, 0);
  pieces.push(panel);

  // 앞뒤판 정합 노치 4개 (dir = 조각 안쪽)
  const yB = (zipPct / 100) * H; // 좌/우 2/5 지점 (위에서)
  marks.push({ kind: 'notch', at: { x: W / 2, y: 0 }, dir: { x: 0, y: 1 }, tick: NOTCH }); // 상단중앙
  marks.push({ kind: 'notch', at: { x: W / 2, y: H }, dir: { x: 0, y: -1 }, tick: NOTCH }); // 하단중앙
  marks.push({ kind: 'notch', at: { x: 0, y: yB }, dir: { x: 1, y: 0 }, tick: NOTCH }); // 좌 2/5
  marks.push({ kind: 'notch', at: { x: W, y: yB }, dir: { x: -1, y: 0 }, tick: NOTCH }); // 우 2/5

  // 2) 옆면~바닥판 (앞뒤판 아래에 배치)
  const sideY = cutBounds(panel).maxY + PIECE_GAP;
  const side = buildRect(Lside, z, '옆면~바닥판', 0, sideY);
  pieces.push(side);
  // 봉제되는 윗변(길이=Lside)에 노치: 양 끝(좌/우 2/5 경계)·중앙(하단중앙 대응)
  const sideNotch = (dx: number) =>
    marks.push({ kind: 'notch', at: { x: dx, y: sideY }, dir: { x: 0, y: 1 }, tick: NOTCH });
  sideNotch(0);
  sideNotch(Lside / 2);
  sideNotch(Lside);

  // 3) 지퍼단 (옆면 아래에 배치)
  const zipY = cutBounds(side).maxY + PIECE_GAP;
  const zip = buildRect(Lzip, zipStripH, '지퍼단 (×2)', 0, zipY);
  pieces.push(zip);
  const zipNotch = (dx: number) =>
    marks.push({ kind: 'notch', at: { x: dx, y: zipY }, dir: { x: 0, y: 1 }, tick: NOTCH });
  zipNotch(0);
  zipNotch(Lzip / 2); // 상단중앙 대응
  zipNotch(Lzip);

  return { pieces, marks };
}

// 아이템 메타/입력 정의 (UI 가 참조)
export const bostonZipItem = {
  id: 'boston-zip',
  name: '지퍼 보스턴백 (둥근 모서리)',
  inputs: [
    { key: 'W', label: '가로', unit: 'mm', default: 300 },
    { key: 'H', label: '세로', unit: 'mm', default: 200 },
    { key: 'rt', label: '위 모서리 R', unit: 'mm', default: 40 },
    { key: 'rb', label: '아래 모서리 R', unit: 'mm', default: 60 },
    { key: 'z', label: '바닥두께', unit: 'mm', default: 100 },
    { key: 'zipPct', label: '지퍼구간(세로%)', unit: '%', default: 40 },
  ],
  calibrationCm: 5, // 검증 사각형 5cm
  build: buildBostonPattern,
} as const;
