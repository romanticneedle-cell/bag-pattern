import { describe, it, expect } from 'vitest';
import { perimeter, zipLength, buildPanel, buildBostonPattern } from './boston-zip';
import { bounds, cutVertices, vertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

// 기본값 mm→cm: W=30, H=20, rt=4, rb=6, z=10, zipPct=40
describe('boston 기하 공식 (cm)', () => {
  it('둘레 P = (W−2rt)+(W−2rb)+2(H−rt−rb)+π(rt+rb)', () => {
    near(perimeter(30, 20, 4, 6), 22 + 18 + 2 * 10 + Math.PI * 10);
  });

  it('지퍼구간길이 L_zip = (W−2rt)+π·rt+2·max(0,(zipPct/100)H−rt)', () => {
    near(zipLength(30, 20, 4, 40), 22 + Math.PI * 4 + 2 * (0.4 * 20 - 4));
  });

  it('zipPct 가 작아 코너 안쪽이면 세로항은 0으로 클램프', () => {
    // (10/100)*20 = 2 < rt(4) → max(0, 2-4)=0
    near(zipLength(30, 20, 4, 10), 22 + Math.PI * 4);
  });

  it('지퍼단폭×2 + 지퍼두께(1cm) = 바닥두께 z (검증 조건)', () => {
    const z = 10;
    const zipStripH = (z - 1) / 2;
    near(zipStripH * 2 + 1, z);
  });
});

describe('boston 앞뒤판 (둥근 사각형)', () => {
  const panel = buildPanel(30, 20, 4, 6);

  it('코너 곡선 세그먼트 4개', () => {
    expect(panel.segments.filter((s) => s.kind === 'curve')).toHaveLength(4);
  });

  it('평탄화하면 line-only', () => {
    expect(flattenPiece(panel).segments.every((s) => s.kind === 'line')).toBe(true);
  });

  it('완성선 바운딩 = W×H (0..30, 0..20)', () => {
    const vb = bounds(vertices(flattenPiece(panel)));
    near(vb.minX, 0);
    near(vb.minY, 0);
    near(vb.maxX, 30, 1e-6);
    near(vb.maxY, 20, 1e-6);
  });

  it('재단선 바운딩 = 완성 + 사방 시접 1cm (곡선 오프셋 반영)', () => {
    const cb = bounds(cutVertices(flattenPiece(panel)));
    near(cb.maxX - cb.minX, 32, 0.02);
    near(cb.maxY - cb.minY, 22, 0.02);
    // 볼록 둥근 코너의 오프셋은 직선변 오프셋선 바깥으로 넘지 않는다.
    near(cb.minX, -1, 0.02);
    near(cb.maxX, 31, 0.02);
  });
});

describe('boston 패턴 세트 (기본값)', () => {
  const set = buildBostonPattern({ W: 300, H: 200, rt: 40, rb: 60, z: 100, zipPct: 40 });

  it('조각 3개: 앞뒤판 / 옆면~바닥판 / 지퍼단', () => {
    expect(set.pieces).toHaveLength(3);
    expect(set.pieces[0].name).toContain('앞뒤판');
    expect(set.pieces[1].name).toContain('옆면');
    expect(set.pieces[2].name).toContain('지퍼단');
  });

  it('정합 노치가 4개 이상', () => {
    const notches = set.marks.filter((m) => m.kind === 'notch');
    expect(notches.length).toBeGreaterThanOrEqual(4);
  });

  it('옆면~바닥판 가로 = 둘레 − 지퍼구간, 세로 = z', () => {
    const side = flattenPiece(set.pieces[1]);
    const vb = bounds(vertices(side));
    near(vb.maxX - vb.minX, perimeter(30, 20, 4, 6) - zipLength(30, 20, 4, 40), 1e-6);
    near(vb.maxY - vb.minY, 10, 1e-6);
  });

  it('지퍼단 세로 = (z−지퍼두께)/2', () => {
    const zip = flattenPiece(set.pieces[2]);
    const vb = bounds(vertices(zip));
    near(vb.maxY - vb.minY, (10 - 1) / 2, 1e-6);
    near(vb.maxX - vb.minX, zipLength(30, 20, 4, 40), 1e-6);
  });

  it('조각들이 세로로 겹치지 않게 배치된다', () => {
    const b0 = bounds(cutVertices(flattenPiece(set.pieces[0])));
    const b1 = bounds(cutVertices(flattenPiece(set.pieces[1])));
    const b2 = bounds(cutVertices(flattenPiece(set.pieces[2])));
    expect(b1.minY).toBeGreaterThan(b0.maxY);
    expect(b2.minY).toBeGreaterThan(b1.maxY);
  });
});
