import { describe, it, expect } from 'vitest';
import { flattenPiece } from './flatten';
import { cutVertices } from './allowance';
import { buildBody } from '../items/tote-cross';
import type { Piece } from './types';

describe('flattenPiece', () => {
  const body = buildBody({ x: 30, y: 35, z: 10, strapLength: 60, strapWidth: 2.5 });

  it('직선 전용 Piece 는 항등(같은 객체를 그대로 반환)', () => {
    expect(flattenPiece(body)).toBe(body);
  });

  it('직선 Piece 의 cutVertices 는 평탄화 전후 동일', () => {
    expect(cutVertices(flattenPiece(body))).toEqual(cutVertices(body));
  });

  it('곡선 Piece 는 line-only 로 분할된다', () => {
    // 시작(0,0) → 곡선으로 (10,10) 을 도는 간단 조각
    const curved: Piece = {
      name: 'c',
      start: { x: 0, y: 0 },
      segments: [
        { kind: 'line', to: { x: 10, y: 0 }, allowance: 1, role: 'cut' },
        { kind: 'curve', c1: { x: 15, y: 0 }, c2: { x: 15, y: 5 }, to: { x: 10, y: 10 }, allowance: 1, role: 'cut' },
        { kind: 'line', to: { x: 0, y: 10 }, allowance: 1, role: 'cut' },
        { kind: 'line', to: { x: 0, y: 0 }, allowance: 1, role: 'cut' },
      ],
      onFold: false,
    };
    const fp = flattenPiece(curved, 8);
    expect(fp.segments.every((s) => s.kind === 'line')).toBe(true);
    // 곡선 1개(8분할) + 직선 3개 = 11 세그먼트
    expect(fp.segments).toHaveLength(3 + 8);
    // 마지막 곡선 분할점은 정확히 곡선의 to(10,10)
    const curveEnd = fp.segments[1 + 8 - 1];
    expect(curveEnd.to.x).toBeCloseTo(10, 6);
    expect(curveEnd.to.y).toBeCloseTo(10, 6);
  });
});
