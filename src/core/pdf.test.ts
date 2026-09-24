import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { buildPatternPdf, PT_PER_CM } from './pdf';
import { buildTotePattern } from '../items/tote-cross';
import { buildBostonPattern } from '../items/boston-zip';

const params = { x: 30, y: 35, z: 10, strapLength: 60, strapWidth: 2.5 };

describe('buildPatternPdf', () => {
  it('유효한 PDF 바이트를 생성한다 (ASCII 폴백)', async () => {
    const set = buildTotePattern(params);
    const bytes = await buildPatternPdf(set);
    expect(bytes.length).toBeGreaterThan(1000);
    // %PDF 헤더
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('%PDF');
  });

  it('페이지는 정확한 A4 (595.28 x 841.89pt) — 1:1 실치수 보장', async () => {
    const set = buildTotePattern(params);
    const bytes = await buildPatternPdf(set);
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(1); // 0=캘리브레이션, 1=첫 타일
    expect(Math.abs(page.getWidth() - 21.0 * PT_PER_CM)).toBeLessThan(0.01);
    expect(Math.abs(page.getHeight() - 29.7 * PT_PER_CM)).toBeLessThan(0.01);
  });

  it('캘리브레이션 1장 + 타일 여러 장으로 분할된다', async () => {
    const set = buildTotePattern(params);
    const bytes = await buildPatternPdf(set);
    const doc = await PDFDocument.load(bytes);
    // 기본 치수는 A4 한 장을 넘으므로 캘리브레이션 포함 최소 3장 이상
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it('한글 폰트를 임베드해도 생성된다', async () => {
    const fontPath = fileURLToPath(new URL('../../public/fonts/NanumGothic-Regular.ttf', import.meta.url));
    const font = readFileSync(fontPath);
    const ab = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
    const set = buildTotePattern(params);
    const bytes = await buildPatternPdf(set, { koreanFont: ab });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('%PDF');
  });

  it('보스턴백(사다리꼴 곡선+노치+검증5cm)도 유효한 PDF 로 생성된다', async () => {
    const set = buildBostonPattern({
      topW: 260,
      bottomW: 320,
      H: 200,
      rt: 40,
      rb: 60,
      z: 100,
      zipPct: 40,
    });
    // ASCII 폴백 경로(한글 폰트 없음)에서도 조각명/라벨이 WinAnsi 로 안전해야 한다.
    const ascii = await buildPatternPdf(set, { calibrationCm: 5 });
    expect(ascii.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(ascii[0], ascii[1], ascii[2], ascii[3])).toBe('%PDF');

    // 한글 폰트 임베드 경로
    const fontPath = fileURLToPath(new URL('../../public/fonts/NanumGothic-Regular.ttf', import.meta.url));
    const font = readFileSync(fontPath);
    const ab = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
    const ko = await buildPatternPdf(set, { koreanFont: ab, calibrationCm: 5 });
    expect(ko.length).toBeGreaterThan(1000);
    expect(String.fromCharCode(ko[0], ko[1], ko[2], ko[3])).toBe('%PDF');
  });
});
