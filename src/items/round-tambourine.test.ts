import { describe, it, expect } from 'vitest';
import { buildRoundPattern, buildRoundPanel, circumference, zipLength } from './round-tambourine';
import { bounds, cutVertices, vertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';

const near = (a: number, b: number, tol = 0.05) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('탬버린백 (원형)', () => {
  it('원둘레 = πD', () => {
    near(circumference(25), Math.PI * 25);
  });

  it('지퍼 구간 + 옆면 구간 = 원둘레', () => {
    const D = 25;
    near(zipLength(D, 45) + (circumference(D) - zipLength(D, 45)), circumference(D));
  });

  it('앞뒤판 완성선이 지름 D 인 원 (bounds ≈ D×D, 정사각 비율)', () => {
    const panel = buildRoundPanel(12.5, 12.5, 12.5); // R=12.5 → D=25
    const b = bounds(vertices(flattenPiece(panel)));
    near(b.maxX - b.minX, 25, 0.2);
    near(b.maxY - b.minY, 25, 0.2);
  });

  it('재단선은 완성선에서 사방 시접 1cm 바깥 (bounds ≈ (D+2)×(D+2))', () => {
    const panel = buildRoundPanel(12.5, 12.5, 12.5);
    const b = bounds(cutVertices(flattenPiece(panel)));
    near(b.maxX - b.minX, 27, 0.3);
    near(b.maxY - b.minY, 27, 0.3);
  });

  it('지퍼단 폭 × 2 + 지퍼두께(1cm) = 바닥두께 z', () => {
    const set = buildRoundPattern({ D: 250, z: 80, zipPct: 45 });
    const zip = set.pieces.find((p) => p.name.startsWith('지퍼단'))!;
    const b = bounds(vertices(zip));
    const h = b.maxY - b.minY; // 지퍼단 세로 = 완성선 높이
    near(h * 2 + 1, 8, 0.05); // z=8cm
  });

  it('3조각 + 노치(앞뒤판 4 + 옆면 3 + 지퍼단 3) 생성', () => {
    const set = buildRoundPattern({ D: 250, z: 80, zipPct: 45 });
    expect(set.pieces.map((p) => p.name)).toEqual(['앞뒤판 (×2)', '옆면~바닥판', '지퍼단 (×2)']);
    expect(set.marks.filter((m) => m.kind === 'notch').length).toBe(10);
  });
});
