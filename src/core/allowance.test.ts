import { describe, it, expect } from 'vitest';
import { cutVertices, outwardNormal, vertices, bounds } from './allowance';
import { buildBody } from '../items/tote-cross';
import type { Piece } from './types';

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('outwardNormal (시계방향, y 아래로 증가)', () => {
  it('오른쪽으로 진행하는 변의 바깥은 위쪽(-y)', () => {
    const n = outwardNormal({ x: 1, y: 0 });
    near(n.x, 0);
    near(n.y, -1);
  });
  it('아래로 진행하는 변의 바깥은 오른쪽(+x)', () => {
    const n = outwardNormal({ x: 0, y: 1 });
    near(n.x, 1);
    near(n.y, 0);
  });
});

describe('cutVertices — 단순 시계방향 사각형 (전 변 시접 1)', () => {
  // 완성선 0,0 - 10,0 - 10,10 - 0,10 (시계방향, y 아래로)
  const rect: Piece = {
    name: 'r',
    start: { x: 0, y: 0 },
    segments: [
      { kind: 'line', to: { x: 10, y: 0 }, allowance: 1, role: 'cut' },
      { kind: 'line', to: { x: 10, y: 10 }, allowance: 1, role: 'cut' },
      { kind: 'line', to: { x: 0, y: 10 }, allowance: 1, role: 'cut' },
      { kind: 'line', to: { x: 0, y: 0 }, allowance: 1, role: 'cut' },
    ],
    onFold: false,
  };
  it('바깥으로 1cm 씩 균일 확장', () => {
    const c = cutVertices(rect);
    expect(c).toHaveLength(4);
    // 좌상 (-1,-1), 우상 (11,-1), 우하 (11,11), 좌하 (-1,11)
    near(c[0].x, -1); near(c[0].y, -1);
    near(c[1].x, 11); near(c[1].y, -1);
    near(c[2].x, 11); near(c[2].y, 11);
    near(c[3].x, -1); near(c[3].y, 11);
  });
});

describe('cutVertices — 십자 일체형 본체 (x=30, y=35, z=10)', () => {
  const body = buildBody({ x: 30, y: 35, z: 10, strapLength: 60, strapWidth: 2.5 });
  const verts = vertices(body);
  const cut = cutVertices(body);

  it('완성선 꼭짓점이 수식대로 계산된다', () => {
    // P2 = (z/2+x, 0) = (35,0), P6 = (z/2+x, y+z/2) = (35,40)
    near(verts[2].x, 35); near(verts[2].y, 0);
    near(verts[6].x, 35); near(verts[6].y, 40);
  });

  it('오목 코너 P5(35,35) 는 재단선에서 대각선 바깥 (36,36) 으로 나간다', () => {
    // P5 는 5번 꼭짓점 (P0..P5)
    near(cut[5].x, 36);
    near(cut[5].y, 36);
  });

  it('오목 코너 P8(5,35) 는 재단선에서 (4,36) 으로 나간다', () => {
    near(cut[8].x, 4);
    near(cut[8].y, 36);
  });

  it('볼록 코너 P4(40,35) 는 재단선에서 (41,36)', () => {
    near(cut[4].x, 41);
    near(cut[4].y, 36);
  });

  it('골선 꼭짓점 P6(35,40) 은 y=40 골선 위에 머문다 (골선쪽 시접 0), x 만 +1', () => {
    // P6-P7 이 골선이므로 y 는 40 유지, 옆 시접으로 x 만 36
    near(cut[6].x, 36);
    near(cut[6].y, 40);
  });

  it('골선 꼭짓점 P7(5,40) 은 (4,40)', () => {
    near(cut[7].x, 4);
    near(cut[7].y, 40);
  });

  it('재단선 세로 최대는 골선 y=40 을 넘지 않는다 (골선엔 시접 없음)', () => {
    const b = bounds(cut);
    near(b.maxY, 40);
  });
});
