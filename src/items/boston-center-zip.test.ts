import { describe, it, expect } from 'vitest';
import { buildCenterZipPattern, type CenterZipParams } from './boston-center-zip';
import { computePanel } from './boston-zip';
import { circumference } from './round-tambourine';
import { bounds, vertices } from '../core/allowance';
import { flattenPiece } from '../core/flatten';
import type { PatternSet, Piece } from '../core/types';

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);
const piece = (set: PatternSet, name: string): Piece =>
  set.pieces.find((p) => p.name.includes(name))!;

// 옆판 둘레 P (cm) 기대값
const P_circle = circumference(25); // πD, D=25cm
const P_rtrap = computePanel(26, 32, 20, 4, 6).perimeter; // roundedTrap
const P_strap = computePanel(30, 30, 20, 0, 0).perimeter; // sharpTrap (=2*30+2*20=100)

const params: Record<string, CenterZipParams> = {
  circle: { shape: 'circle', L: 400, D: 250 },
  roundedTrap: { shape: 'roundedTrap', L: 400, topW: 260, bottomW: 320, capH: 200, rt: 40, rb: 60 },
  sharpTrap: { shape: 'sharpTrap', L: 400, topW: 300, bottomW: 300, capH: 200, rt: 0, rb: 0 },
};

describe('center-zip 옆판 둘레 P (모양별)', () => {
  it('원: P = πD', () => near(P_circle, Math.PI * 25));
  it('각진 사각(30×20): P = 2·30+2·20 = 100', () => near(P_strap, 100));
  it('둥근 사다리꼴: computePanel 둘레와 일치', () =>
    near(P_rtrap, computePanel(26, 32, 20, 4, 6).perimeter));
});

for (const shape of ['circle', 'roundedTrap', 'sharpTrap'] as const) {
  const P = shape === 'circle' ? P_circle : shape === 'sharpTrap' ? P_strap : P_rtrap;
  const set = buildCenterZipPattern(params[shape]);

  describe(`center-zip 몸판/구조 (${shape})`, () => {
    it('조각 2개: 옆판(×2) + 몸판', () => {
      expect(set.pieces).toHaveLength(2);
      expect(piece(set, '옆판').name).toContain('옆판');
      expect(piece(set, '몸판').name).toContain('몸판');
    });

    it('몸판 가로 = L(40cm), 세로 = 옆판 둘레 P', () => {
      const b = bounds(vertices(flattenPiece(piece(set, '몸판'))));
      near(b.maxX - b.minX, 40, 1e-6);
      near(b.maxY - b.minY, P, 1e-6);
    });

    it('몸판 위·아래 가로변 = 골선(fold, allowance 0), 좌·우 세로변 = 재단선(cut, 시접 1)', () => {
      const body = piece(set, '몸판');
      // segments: [0]윗변(fold), [1]우변(cut), [2]아랫변(fold), [3]좌변(cut)
      expect(body.segments[0].role).toBe('fold');
      expect(body.segments[0].allowance).toBe(0);
      expect(body.segments[2].role).toBe('fold');
      expect(body.segments[2].allowance).toBe(0);
      expect(body.segments[1].role).toBe('cut');
      expect(body.segments[1].allowance).toBe(1);
      expect(body.segments[3].role).toBe('cut');
      expect(body.segments[3].allowance).toBe(1);
    });

    it('지퍼 위치선(guide)이 몸판 세로 중앙(y=P/2)에 가로로 있다', () => {
      const body = piece(set, '몸판');
      expect(body.guides).toBeDefined();
      const g = body.guides![0];
      expect(g.role).toBe('sew');
      // 가로선: 양 끝 y 동일, x 는 0~L 폭
      near(g.a.y, g.b.y, 1e-9);
      near(Math.abs(g.b.x - g.a.x), 40, 1e-6);
      // 세로 중앙: body 바운딩 중앙 y
      const b = bounds(vertices(flattenPiece(body)));
      near(g.a.y, (b.minY + b.maxY) / 2, 1e-6);
    });

    it('정합 노치: 옆판 4 + 몸판 10 = 14개', () => {
      const notch = set.marks.filter((m) => m.kind === 'notch');
      expect(notch.length).toBe(14);
    });

    it('노치 방향은 단위벡터', () => {
      for (const m of set.marks) {
        if (m.kind !== 'notch') continue;
        near(Math.hypot(m.dir.x, m.dir.y), 1, 1e-9);
      }
    });
  });
}
