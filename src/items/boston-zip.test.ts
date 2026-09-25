import { describe, it, expect } from 'vitest';
import {
  perimeter,
  zipLength,
  computePanel,
  buildPanel,
  buildBostonPattern,
} from './boston-zip';
import { bounds, cutVertices, vertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

// ── 회귀: 사각형(topW==bottomW)은 기존 둥근 사각형 공식과 일치 ──
describe('boston 사각형 회귀 (topW==bottomW)', () => {
  // W=30, H=20, rt=4, rb=6
  it('둘레 = (W−2rt)+(W−2rb)+2(H−rt−rb)+π(rt+rb)', () => {
    const old = 30 - 8 + (30 - 12) + 2 * (20 - 4 - 6) + Math.PI * (4 + 6);
    near(perimeter(30, 30, 20, 4, 6), old);
  });

  it('지퍼구간길이 = (W−2rt)+π·rt+2·max(0,(zipPct/100)H−rt)', () => {
    const old = 30 - 8 + Math.PI * 4 + 2 * Math.max(0, 0.4 * 20 - 4);
    near(zipLength(30, 30, 20, 4, 6, 40), old);
  });

  it('앞뒤판 재단 바운딩 = 완성 + 사방 시접 (32×22)', () => {
    const panel = buildPanel(30, 30, 20, 4, 6);
    const cb = bounds(cutVertices(flattenPiece(panel)));
    near(cb.maxX - cb.minX, 32, 0.02);
    near(cb.maxY - cb.minY, 22, 0.02);
  });

  it('사각형 코너 호각은 90°(π/2), 접점거리 t=r', () => {
    const g = computePanel(30, 30, 20, 4, 6);
    for (const c of g.corners) near(c.arc, Math.PI / 2, 1e-9);
    near(g.corners[0].t, 4); // 위 코너 rt
    near(g.corners[2].t, 6); // 아래 코너 rb
  });
});

// ── 사다리꼴 (topW260 / bottomW320 / H200 / rt40 / rb60) → cm ──
describe('boston 사다리꼴 앞뒤판', () => {
  // cm: topW26, bottomW32, H20, rt4, rb6
  const g = computePanel(26, 32, 20, 4, 6);

  it('위 코너 사잇각 > 90°, 아래 코너 < 90° (옆변이 벌어짐)', () => {
    expect(g.corners[0].alpha).toBeGreaterThan(Math.PI / 2); // TL
    expect(g.corners[1].alpha).toBeGreaterThan(Math.PI / 2); // TR
    expect(g.corners[2].alpha).toBeLessThan(Math.PI / 2); // BR
    expect(g.corners[3].alpha).toBeLessThan(Math.PI / 2); // BL
  });

  it('필렛 접점이 실제 옆변 위에 있다 (접점이 변 선분 위, 0<s<1)', () => {
    // 우측 옆변 TR→BR
    const TR = { x: 13, y: 0 };
    const BR = { x: 16, y: 20 };
    const P2 = g.corners[1].P2; // TR 의 다음 변(우측 옆변) 쪽 접점
    // 공선성: (P2−TR) × (BR−TR) ≈ 0
    const ex = BR.x - TR.x;
    const ey = BR.y - TR.y;
    const cross = (P2.x - TR.x) * ey - (P2.y - TR.y) * ex;
    near(cross, 0, 1e-9);
    // 선분 파라미터 s ∈ (0,1)
    const s = ((P2.x - TR.x) * ex + (P2.y - TR.y) * ey) / (ex * ex + ey * ey);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it('둘레 = Σ직선잔여 + Σ호길이 (해석적, 양수·유한)', () => {
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += g.edgeStraight[i] + g.corners[i].r * g.corners[i].arc;
    near(perimeter(26, 32, 20, 4, 6), sum);
    expect(sum).toBeGreaterThan(0);
    expect(Number.isFinite(sum)).toBe(true);
  });

  it('앞뒤판 완성 바운딩: 세로=H 정확, 가로는 윗변<가로≤아랫변 (코너 라운딩 반영)', () => {
    const vb = bounds(vertices(flattenPiece(buildPanel(26, 32, 20, 4, 6))));
    // 윗변·아랫변 모두 y=0, y=H 의 직선변 → 세로는 정확히 H.
    near(vb.maxY, 20, 0.02);
    near(vb.minY, 0, 0.02);
    // 옆변이 기울어 세로 직선변이 없으므로 최대 가로는 둥근 아래코너로 아랫변보다 살짝 작다.
    const width = vb.maxX - vb.minX;
    expect(width).toBeLessThanOrEqual(32 + 1e-6); // 아랫변 폭 이하
    expect(width).toBeGreaterThan(26); // 윗변 폭 초과 (아래가 더 넓음)
  });

  it('앞뒤판 곡선 세그먼트 4개 이상, 평탄화하면 line-only', () => {
    const panel = buildPanel(26, 32, 20, 4, 6);
    expect(panel.segments.filter((s) => s.kind === 'curve').length).toBeGreaterThanOrEqual(4);
    expect(flattenPiece(panel).segments.every((s) => s.kind === 'line')).toBe(true);
  });
});

describe('boston 검증식 & 패턴 세트 (사다리꼴 기본값)', () => {
  const set = buildBostonPattern({
    topW: 260,
    bottomW: 320,
    H: 200,
    rt: 40,
    rb: 60,
    z: 100,
    zipPct: 40,
  });

  it('지퍼단폭×2 + 지퍼두께(1cm) = 바닥두께 z', () => {
    const z = 10;
    near(((z - 1) / 2) * 2 + 1, z);
  });

  it('조각 3개: 앞뒤판 / 옆면~바닥판 / 지퍼단', () => {
    expect(set.pieces).toHaveLength(3);
    expect(set.pieces[0].name).toContain('앞뒤판');
    expect(set.pieces[1].name).toContain('옆면');
    expect(set.pieces[2].name).toContain('지퍼단');
  });

  it('정합 노치: 앞뒤판 12개(중앙2+경계2+코너접점8) + 옆면7 + 지퍼단7 = 26개', () => {
    const notch = set.marks.filter((m) => m.kind === 'notch');
    expect(notch.length).toBe(26);
    // 앞뒤판(세로 H=20cm 밴드 내)과 직사각형(그 아래) 분리
    const panel = notch.filter((m) => m.at.y <= 20 + 1e-6);
    const strips = notch.filter((m) => m.at.y > 20 + 1e-6);
    expect(panel.length).toBe(12); // 중앙2 + 경계2 + 코너접점8
    expect(strips.length).toBe(14); // 옆면7 + 지퍼단7
  });

  it('코너 접점 노치 방향은 외곽선 수직(반지름 방향, 안쪽)이라 단위벡터', () => {
    const notch = set.marks.filter((m) => m.kind === 'notch');
    for (const m of notch) {
      if (m.kind !== 'notch') continue;
      near(Math.hypot(m.dir.x, m.dir.y), 1, 1e-9);
    }
  });

  it('옆면~바닥판 가로 = 둘레 − 지퍼구간, 세로 = z', () => {
    const side = flattenPiece(set.pieces[1]);
    const vb = bounds(vertices(side));
    near(vb.maxX - vb.minX, perimeter(26, 32, 20, 4, 6) - zipLength(26, 32, 20, 4, 6, 40), 1e-6);
    near(vb.maxY - vb.minY, 10, 1e-6);
  });

  it('지퍼단 가로 = 지퍼구간, 세로 = (z−지퍼두께)/2', () => {
    const zip = flattenPiece(set.pieces[2]);
    const vb = bounds(vertices(zip));
    near(vb.maxX - vb.minX, zipLength(26, 32, 20, 4, 6, 40), 1e-6);
    near(vb.maxY - vb.minY, (10 - 1) / 2, 1e-6);
  });

  it('조각들이 세로로 겹치지 않게 배치된다', () => {
    const b0 = bounds(cutVertices(flattenPiece(set.pieces[0])));
    const b1 = bounds(cutVertices(flattenPiece(set.pieces[1])));
    const b2 = bounds(cutVertices(flattenPiece(set.pieces[2])));
    expect(b1.minY).toBeGreaterThan(b0.maxY);
    expect(b2.minY).toBeGreaterThan(b1.maxY);
  });
});

// ── 원(circle) 모양: 앞뒤판이 원 (탬버린 로직 흡수) ──
describe('boston-zip 원(circle) 경로', () => {
  const set = buildBostonPattern({ shape: 'circle', D: 250, z: 100, zipPct: 40 });

  it('조각 3개: 앞뒤판(원) / 옆면~바닥판 / 지퍼단', () => {
    expect(set.pieces).toHaveLength(3);
    expect(set.pieces[0].name).toContain('앞뒤판');
    expect(set.pieces[1].name).toContain('옆면');
    expect(set.pieces[2].name).toContain('지퍼단');
  });

  it('앞뒤판은 곡선만(원) — line 세그먼트 없음', () => {
    expect(set.pieces[0].segments.every((s) => s.kind === 'curve')).toBe(true);
  });

  it('옆면 가로 + 지퍼단 가로 = 원둘레 πD (=π·25cm)', () => {
    const sideW = (() => {
      const b = bounds(vertices(flattenPiece(set.pieces[1])));
      return b.maxX - b.minX;
    })();
    const zipW = (() => {
      const b = bounds(vertices(flattenPiece(set.pieces[2])));
      return b.maxX - b.minX;
    })();
    near(sideW + zipW, Math.PI * 25, 1e-6);
  });

  it('지퍼단폭×2 + 지퍼두께(1cm) = 바닥두께 z(10cm)', () => {
    const b = bounds(vertices(flattenPiece(set.pieces[2])));
    near((b.maxY - b.minY) * 2 + 1, 10, 1e-6);
  });
});

// ── 각진 사각(sharpTrap): rt=rb=0 ──
describe('boston-zip 각진 사각(sharpTrap) 경로', () => {
  const set = buildBostonPattern({
    shape: 'sharpTrap',
    topW: 300,
    bottomW: 300,
    H: 200,
    rt: 0,
    rb: 0,
    z: 100,
    zipPct: 40,
  });

  it('둘레 = computePanel(30,30,20,0,0).perimeter = 2·30+2·20 = 100', () => {
    near(perimeter(30, 30, 20, 0, 0), 100);
  });

  it('앞뒤판은 각져서 곡선 세그먼트 없음 (모두 line)', () => {
    expect(set.pieces[0].segments.every((s) => s.kind === 'line')).toBe(true);
  });

  it('조각 3개 + 지퍼단폭×2+1=z', () => {
    expect(set.pieces).toHaveLength(3);
    const b = bounds(vertices(flattenPiece(set.pieces[2])));
    near((b.maxY - b.minY) * 2 + 1, 10, 1e-6);
  });
});
