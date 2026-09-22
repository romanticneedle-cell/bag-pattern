import { describe, it, expect } from 'vitest';
import { calculateStrapPattern } from './tote-cross';
import { bounds, cutVertices, vertices } from '../core/allowance';

const near = (a: number, b: number, tol = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('calculateStrapPattern (폭×2 + 시접×2)', () => {
  const strap = calculateStrapPattern(60, 2.5);

  it('재단 치수 = (2.5×2 + 1×2) × (60+2) = 7 × 62', () => {
    const cb = bounds(cutVertices(strap));
    near(cb.maxX - cb.minX, 7);
    near(cb.maxY - cb.minY, 62);
  });

  it('완성선(봉제선)은 사방 1cm 안쪽 = 5 × 60', () => {
    const vb = bounds(vertices(strap));
    near(vb.maxX - vb.minX, 5);
    near(vb.maxY - vb.minY, 60);
  });

  it('중앙 접는 선(길이 방향)이 있다', () => {
    expect(strap.guides).toBeDefined();
    const fold = strap.guides!.find((g) => g.role === 'fold');
    expect(fold).toBeTruthy();
    near(fold!.a.x, 3.5); // cutWidth/2
    near(fold!.b.x, 3.5);
  });
});
