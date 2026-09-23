// 십자 일체형 에코백 (바닥 있는 에코백) — 이번 아이템
//
// 사용자 손그림 구조를 그대로 따른다. 앞판/뒤판/옆판 분리로 재설계하지 않는다.
// 전체 패턴 치수: 가로 x+z, 세로 y+z/2. 아래 변(P6-P7)이 골선.

import type { Mark, PatternSet, Piece, Segment } from '../core/types';
import { bounds, cutVertices } from '../core/allowance';

export interface ToteParams {
  x: number; // 완성 가로
  y: number; // 완성 세로
  z: number; // 완성 바닥폭
  strapLength: number; // 끈 완성 길이
  strapWidth: number; // 끈 완성 폭
  includeStrap?: boolean; // 끈 재단 조각 포함 여부 (기본 true)
}

// 시접 기본값 (상수로 분리 — 봉제법에 따라 변경 예정)
export const ALLOWANCE = {
  seam: 1.0, // 일반 봉제 시접
  opening: 1.0, // 입구 (봉제법에 따라 변경 예정)
  fold: 0, // 골선
} as const;

// 본체 가로(x) 대비 끈 중심 간 간격 비율
export const STRAP_SPACING = 0.5;

const STRAP_TICK = 2.0; // 끈 위치 마크 표시선 길이(cm)
const PIECE_GAP = 4.0; // 조각 사이 배치 여백(cm)

/**
 * 십자 일체형 본체 조각.
 * 좌표는 지시서 §2 의 수식으로만 계산한다 (하드코딩 금지).
 * 원점(ox,oy) 을 더해 배치 위치를 조정할 수 있다.
 */
export function buildBody(p: ToteParams, ox = 0, oy = 0): Piece {
  const { x, y, z } = p;
  const P = (px: number, py: number) => ({ x: ox + px, y: oy + py });

  const P0 = P(0, 0);
  const P1 = P(z / 2, 0);
  const P2 = P(z / 2 + x, 0);
  const P3 = P(z + x, 0);
  const P4 = P(z + x, y);
  const P5 = P(z / 2 + x, y);
  const P6 = P(z / 2 + x, y + z / 2);
  const P7 = P(z / 2, y + z / 2);
  const P8 = P(z / 2, y);
  const P9 = P(0, y);

  const line = (to: { x: number; y: number }, allowance: number, role: Segment['role']): Segment => ({
    kind: 'line',
    to,
    allowance,
    role,
  });

  const segments: Segment[] = [
    line(P1, ALLOWANCE.opening, 'opening'), // P0→P1 입구
    line(P2, ALLOWANCE.opening, 'opening'), // P1→P2 입구
    line(P3, ALLOWANCE.opening, 'opening'), // P2→P3 입구
    line(P4, ALLOWANCE.seam, 'cut'), // P3→P4 우측
    line(P5, ALLOWANCE.seam, 'cut'), // P4→P5
    line(P6, ALLOWANCE.seam, 'cut'), // P5→P6 (P5 오목 코너)
    line(P7, ALLOWANCE.fold, 'fold'), // P6→P7 골선
    line(P8, ALLOWANCE.seam, 'cut'), // P7→P8
    line(P9, ALLOWANCE.seam, 'cut'), // P8→P9 (P8 오목 코너)
    line(P0, ALLOWANCE.seam, 'cut'), // P9→P0 좌측 (닫기)
  ];

  return { name: '본체', start: P0, segments, onFold: true };
}

/** 끈 위치 마크 2곳 (입구 완성선 위, 본체 중앙 좌우 대칭). */
export function buildStrapMarks(p: ToteParams, ox = 0, oy = 0): Mark[] {
  const { x, z } = p;
  const center = z / 2 + x / 2; // 본체 중앙
  const half = (x * STRAP_SPACING) / 2; // 끈 중심 간 간격의 절반
  return [
    { kind: 'strap', at: { x: ox + center - half, y: oy }, label: '끈 위치', tick: STRAP_TICK },
    { kind: 'strap', at: { x: ox + center + half, y: oy }, label: '끈 위치', tick: STRAP_TICK },
  ];
}

/**
 * 끈 재단 조각.
 *
 * 봉제법: 세로로 반 접어 열린 긴 변을 시접 1cm 간격으로 박은 뒤 뒤집어 통형으로 만든다.
 * - 반 접으면 (완성폭 + 시접) 이 겹으로 겹치고, 열린 변을 1cm 박으면 완성폭이 나온다.
 *   → 재단 폭 = (완성폭 × 2) + (시접 × 2)
 * - 길이는 완성 길이 + 상하 시접 1cm씩 (가방에 물릴 여유).
 *
 * 폴딩/뒤집기 관계라 단순 외곽 시접이 아니므로, 이 조각은 재단 사각형을
 * 그대로 완성선으로 둔다 (allowance 0). 재단선 = 완성선.
 */
export function calculateStrapPattern(length: number, width: number, ox = 0, oy = 0): Piece {
  const seam = ALLOWANCE.seam; // 봉제 시접 1cm
  const cutWidth = width * 2 + seam * 2; // 재단 폭 (폭×2)+(시접×2)
  const cutLen = length + seam * 2; // 재단 길이 = 길이 + 상하 시접

  // 완성선(봉제선)은 재단선에서 사방 시접만큼 안쪽.
  // → allowance 를 붙이면 cutVertices 가 다시 바깥 재단선(cutWidth×cutLen)을 만든다.
  const A = { x: ox + seam, y: oy + seam };
  const B = { x: ox + cutWidth - seam, y: oy + seam };
  const C = { x: ox + cutWidth - seam, y: oy + cutLen - seam };
  const D = { x: ox + seam, y: oy + cutLen - seam };

  const line = (to: { x: number; y: number }): Segment => ({ kind: 'line', to, allowance: seam, role: 'cut' });

  // 중앙 접는 선(길이 방향). 반 접어 통형으로 만드는 위치.
  const foldX = ox + cutWidth / 2;

  return {
    name: '끈',
    start: A,
    segments: [line(B), line(C), line(D), line(A)],
    onFold: false,
    guides: [{ a: { x: foldX, y: oy }, b: { x: foldX, y: oy + cutLen }, role: 'fold' }],
  };
}

/** 전체 패턴 세트 생성. 조각들은 겹치지 않도록 배치된 좌표로 반환된다. */
export function buildTotePattern(p: ToteParams): PatternSet {
  const body = buildBody(p);
  const marks = buildStrapMarks(p);
  const pieces: Piece[] = [body];

  // 끈 만들기(기본). '끈 안 만들기'면 끈 재단 조각을 뺀다 — 끈 위치 마크는 유지.
  if (p.includeStrap !== false) {
    const bb = bounds(cutVertices(body));
    const strapY = bb.maxY + PIECE_GAP;
    pieces.push(calculateStrapPattern(p.strapLength, p.strapWidth, 0, strapY));
  }

  return { pieces, marks };
}

// 아이템 메타/입력 정의 (UI 가 참조)
export const toteCrossItem = {
  id: 'tote-cross',
  name: '바닥 있는 에코백 (십자 일체형)',
  inputs: [
    { key: 'x', label: '가로', unit: 'cm', default: 30 },
    { key: 'y', label: '세로', unit: 'cm', default: 35 },
    { key: 'z', label: '바닥폭', unit: 'cm', default: 10 },
    { key: 'strapLength', label: '끈 길이', unit: 'cm', default: 60 },
    { key: 'strapWidth', label: '끈 폭', unit: 'cm', default: 2.5 },
  ],
  toggles: [
    { key: 'excludeStrap', label: '끈 안 만들기 (기성 끈 사용)', default: false },
  ],
  build: buildTotePattern,
} as const;
