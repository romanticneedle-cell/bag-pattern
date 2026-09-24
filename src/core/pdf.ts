// Piece → A4 타일 1:1 PDF
//
// 절대 조건: 1:1 실치수. x=30 이면 출력물 완성선 가로가 실제 30cm.
// 미리보기와 동일한 좌표 데이터로 생성한다 (이미지 변환 없음).
//
// 한글 텍스트: 오픈 한글 폰트(ArrayBuffer)가 주어지면 임베드해 한글로,
// 없으면 Helvetica + ASCII 문자열로 폴백한다. 도안 자체(선/치수)는 폰트와 무관.

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PatternSet, Piece, Pt, Segment } from './types';
import { bounds, cutVertices, markExtentPoints, vertices } from './allowance';
import { flattenPiece } from './flatten';
import { packPatternSet } from './layout';

export const PT_PER_CM = 28.3465; // 1cm = 28.3465pt
const A4W = 21.0; // cm
const A4H = 29.7; // cm
const MARGIN = 1.0; // cm (10mm)
const OVERLAP = 1.0; // cm (10mm)

// A1 롤: 가로 610mm 고정, 세로는 내용 길이(가변).
const ROLL_W = 61.0; // cm (610mm)
const ROLL_USABLE = ROLL_W - 2 * MARGIN; // 59cm

/** 콘텐츠 cm 좌표 → 페이지 pt 좌표 변환기 (타일/롤 공용). */
type ToPage = (cx: number, cy: number) => { x: number; y: number };

const INK = rgb(0.08, 0.08, 0.08);
const ACCENT = rgb(0.7, 0.23, 0.18);
const FRAME = rgb(0.6, 0.6, 0.6);

const usableW = A4W - 2 * MARGIN;
const usableH = A4H - 2 * MARGIN;
const strideX = usableW - OVERLAP;
const strideY = usableH - OVERLAP;

// dash 패턴(pt)
const DASH = {
  sew: [4, 3],
  fold: [11, 3, 2.5, 3],
};

type TileWindow = { x0: number; y0: number; row: number; col: number };

function cm(v: number): number {
  return v * PT_PER_CM;
}

// 한/영 라벨 테이블
type Strings = {
  bodyLabel: (n: string) => string;
  strap: string;
  cut: string;
  sew: string;
  fold: string;
  legendTitle: string;
  calTitle: string;
  printNotice: string;
  verify: (n: number) => string;
  verifyNote: (n: number) => string;
  pageMap: string;
  seamTitle: string;
  seam1: string;
  seam2: string;
  seam3: string;
  cutHere: string;
  asmTitle: string;
  asm1: string;
  asm2: string;
  asm3: string;
};

const KO: Strings = {
  bodyLabel: (n) => n,
  strap: '끈 위치',
  cut: '재단선 (실선)',
  sew: '완성선 (점선)',
  fold: '골선 (쇄선)',
  legendTitle: '선 안내',
  calTitle: '낭만바늘 가방 패턴 — 인쇄 안내',
  printNotice: '페이지에 맞춤 없이, 실제 크기(100%)로 인쇄하세요.',
  verify: (n) => `${n}cm 검증용 정사각형`,
  verifyNote: (n) => `자로 재어 정확히 ${n}cm 인지 확인하세요. 다르면 인쇄 배율이 100%가 아닙니다.`,
  pageMap: '페이지 배치',
  seamTitle: '시접 안내',
  seam1: '바닥 부분은 골선으로 재단하여 시접이 없습니다.',
  seam2: '그 외 부분은 기본 시접 1cm가 포함되어 있습니다.',
  seam3: '봉제 방법·소재에 따라 필요한 시접의 양은 달라질 수 있습니다.',
  cutHere: '이 선을 자르세요',
  asmTitle: '조립 방법 (A4)',
  asm1: '1. 모든 장을 실제 크기(100%)로 인쇄하고, 위 검증 사각형을 자로 확인하세요.',
  asm2: '2. 각 장의 빨간 "자르는 선"(오른쪽·아래)을 가위로 자릅니다.',
  asm3: '3. 자른 끝을 다음 장의 테두리 선에 맞대어 올려놓고 뒤에서 테이프로 붙입니다 (A1,A2… 순).',
};

// 한글 폰트 없을 때 (WinAnsi 안전) — 조각명은 romanize
const ROMAN: Record<string, string> = {
  본체: 'BODY',
  끈: 'STRAP',
  '앞뒤판 (×2)': 'FRONT/BACK x2',
  '옆면~바닥판': 'SIDE+BOTTOM',
  '지퍼단 (×2)': 'ZIPPER x2',
};

const ASCII: Strings = {
  bodyLabel: (n) => ROMAN[n] ?? n.replace(/[^\x20-\x7E]/g, ''),
  strap: 'strap',
  cut: 'cut line (solid)',
  sew: 'seam line (dashed)',
  fold: 'fold line (chain)',
  legendTitle: 'Legend',
  calTitle: 'Bag Pattern — Print Guide',
  printNotice: 'Print at 100% (Actual size). Do NOT "fit to page".',
  verify: (n) => `${n} cm calibration square`,
  verifyNote: (n) => `Measure with a ruler. If it is not exactly ${n} cm, the print scale is not 100%.`,
  pageMap: 'Page layout',
  seamTitle: 'Seam allowance',
  seam1: 'The bottom edge is on the fold — no seam allowance there.',
  seam2: 'All other edges include a 1 cm seam allowance.',
  seam3: 'Required allowance may vary with sewing method and fabric.',
  cutHere: 'cut here',
  asmTitle: 'Assembly (A4)',
  asm1: '1. Print all sheets at 100% (actual size); verify the square with a ruler.',
  asm2: '2. Cut each sheet along the red "cut here" lines (right & bottom).',
  asm3: '3. Butt the cut edge to the next sheet border and tape on the back (order A1, A2 ...).',
};

/** 콘텐츠(모든 재단선 + 마크) 바운딩 (cm). 곡선은 평탄화 후 계산. */
function contentBounds(set: PatternSet) {
  const pts: Pt[] = [];
  for (const p of set.pieces) pts.push(...cutVertices(flattenPiece(p)));
  for (const m of set.marks) pts.push(...markExtentPoints(m));
  return bounds(pts);
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * 타일 윈도우 계산. 격자 전체가 아니라, 실제 콘텐츠(조각 재단선 박스)가
 * 걸치는 타일만 생성한다 → 좁고 긴 끈 아래의 빈 타일 등을 건너뛰어 페이지 절약.
 */
function computeTiles(bb: Box, contentBoxes: Box[]): TileWindow[] {
  const w = bb.maxX - bb.minX;
  const h = bb.maxY - bb.minY;
  const cols = w <= usableW ? 1 : Math.ceil((w - OVERLAP) / strideX);
  const rows = h <= usableH ? 1 : Math.ceil((h - OVERLAP) / strideY);
  const tiles: TileWindow[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const win: Box = {
        minX: bb.minX + c * strideX,
        minY: bb.minY + r * strideY,
        maxX: bb.minX + c * strideX + usableW,
        maxY: bb.minY + r * strideY + usableH,
      };
      if (contentBoxes.some((box) => overlaps(win, box))) {
        tiles.push({ x0: win.minX, y0: win.minY, row: r, col: c });
      }
    }
  }
  return tiles;
}

const rowLetter = (r: number) => String.fromCharCode(65 + r); // 0→A

/** 콘텐츠 cm 좌표 → 페이지 pt 좌표 (y 위로). */
function toPage(cx: number, cy: number, win: TileWindow): { x: number; y: number } {
  const xCm = MARGIN + (cx - win.x0);
  const yCmTopDown = MARGIN + (cy - win.y0);
  return { x: cm(xCm), y: cm(A4H - yCmTopDown) };
}

function drawLineCm(
  page: PDFPage,
  a: Pt,
  b: Pt,
  tp: ToPage,
  opts: { color: any; thickness: number; dash?: number[] },
) {
  const pa = tp(a.x, a.y);
  const pb = tp(b.x, b.y);
  page.drawLine({
    start: pa,
    end: pb,
    thickness: opts.thickness,
    color: opts.color,
    dashArray: opts.dash,
  });
}

/** 클립 사각형(인쇄영역)을 설정한다. 이후 그리기는 이 영역으로 잘린다. */
function pushClip(page: PDFPage) {
  const x0 = cm(MARGIN);
  const y0 = cm(MARGIN);
  const x1 = cm(A4W - MARGIN);
  const y1 = cm(A4H - MARGIN);
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x0, y0),
    lineTo(x1, y0),
    lineTo(x1, y1),
    lineTo(x0, y1),
    closePath(),
    clip(),
    endPath(),
  );
}
function popClip(page: PDFPage) {
  page.pushOperators(popGraphicsState());
}

/** 속 빈 삼각형 맞춤 마크 (겹침 정렬용). 인접 타일에 동일 콘텐츠 좌표로 그려 일치시킨다. */
function drawPieceInto(page: PDFPage, piece: Piece, tp: ToPage, font: PDFFont, S: Strings) {
  // 완성선(점선)
  const vs = vertices(piece);
  for (let i = 0; i < vs.length; i++) {
    drawLineCm(page, vs[i], vs[(i + 1) % vs.length], tp, {
      color: INK,
      thickness: 0.6,
      dash: DASH.sew,
    });
  }
  // 재단선(세그먼트별)
  const cut = cutVertices(piece);
  for (let i = 0; i < cut.length; i++) {
    const role: Segment['role'] = piece.segments[i].role;
    const isFold = role === 'fold';
    drawLineCm(page, cut[i], cut[(i + 1) % cut.length], tp, {
      color: INK,
      thickness: isFold ? 0.9 : 1.1,
      dash: isFold ? DASH.fold : undefined,
    });
  }
  // 내부 안내선 (접는 선 등)
  for (const g of piece.guides ?? []) {
    drawLineCm(page, g.a, g.b, tp, {
      color: INK,
      thickness: 0.8,
      dash: g.role === 'fold' ? DASH.fold : DASH.sew,
    });
  }
  // 조각명
  const c = vs.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y }), { x: 0, y: 0 });
  const center = { x: c.x / vs.length, y: c.y / vs.length };
  const pc = tp(center.x, center.y);
  const label = S.bodyLabel(piece.name);
  const size = 11;
  page.drawText(label, {
    x: pc.x - font.widthOfTextAtSize(label, size) / 2,
    y: pc.y,
    size,
    font,
    color: INK,
  });
}

function drawMarksInto(page: PDFPage, set: PatternSet, tp: ToPage, font: PDFFont, S: Strings) {
  for (const m of set.marks) {
    if (m.kind === 'strap') {
      drawLineCm(page, { x: m.at.x, y: m.at.y - m.tick }, { x: m.at.x, y: m.at.y }, tp, {
        color: ACCENT,
        thickness: 1.0,
      });
      const top = tp(m.at.x, m.at.y - m.tick);
      const size = 8;
      page.drawText(S.strap, {
        x: top.x - font.widthOfTextAtSize(S.strap, size) / 2,
        y: top.y + 3,
        size,
        font,
        color: ACCENT,
      });
    } else {
      // 정합 노치: 기준점에서 dir 방향으로 짧은 눈금.
      drawLineCm(
        page,
        m.at,
        { x: m.at.x + m.dir.x * m.tick, y: m.at.y + m.dir.y * m.tick },
        tp,
        { color: ACCENT, thickness: 1.0 },
      );
    }
  }
}

/**
 * 자르는 선 (자르고 맞대어 붙이는 방식).
 * 이웃이 있는 오른쪽/아래 변에, 인쇄영역 안쪽 10mm(겹침폭) 위치에 빨간 파선을 긋는다.
 * 사용자는 이 선을 잘라 다음 장의 테두리 선에 맞대어 붙인다.
 */
function drawTrimGuides(
  page: PDFPage,
  hasRight: boolean,
  hasBottom: boolean,
  font: PDFFont,
  S: Strings,
) {
  const inset = MARGIN + OVERLAP;
  if (hasRight) {
    const x = cm(A4W - inset);
    page.drawLine({
      start: { x, y: cm(MARGIN) },
      end: { x, y: cm(A4H - MARGIN) },
      thickness: 0.8,
      color: ACCENT,
      dashArray: [5, 3],
    });
    page.drawText(S.cutHere, { x: x - 4 - font.widthOfTextAtSize(S.cutHere, 8), y: cm(A4H - MARGIN) - 12, size: 8, font, color: ACCENT });
  }
  if (hasBottom) {
    const yy = cm(inset);
    page.drawLine({
      start: { x: cm(MARGIN), y: yy },
      end: { x: cm(A4W - MARGIN), y: yy },
      thickness: 0.8,
      color: ACCENT,
      dashArray: [5, 3],
    });
    page.drawText(S.cutHere, { x: cm(MARGIN) + 4, y: yy + 3, size: 8, font, color: ACCENT });
  }
}

/** 인쇄영역 테두리 + 페이지 라벨. */
function drawFrame(page: PDFPage, label: string, font: PDFFont) {
  const x = cm(MARGIN);
  const y = cm(MARGIN);
  const w = cm(usableW);
  const h = cm(usableH);
  page.drawRectangle({ x, y, width: w, height: h, borderColor: FRAME, borderWidth: 0.5 });
  page.drawText(label, { x: x + 4, y: y + h - 12, size: 10, font, color: FRAME });
}

/** 첫 장: 인쇄 안내 + N cm 검증 사각형 + 범례 + 페이지맵 + 시접 안내. */
function drawCalibrationPage(
  page: PDFPage,
  font: PDFFont,
  S: Strings,
  tiles: TileWindow[],
  calCm: number,
) {
  const left = cm(MARGIN + 0.5);
  let y = cm(A4H) - cm(MARGIN + 0.5);

  const line = (text: string, size: number, gap: number, color = INK) => {
    y -= size;
    page.drawText(text, { x: left, y, size, font, color });
    y -= gap;
  };

  line(S.calTitle, 15, 10);
  line(S.printNotice, 11, 18, ACCENT);

  // N cm 검증 사각형 (아이템별 크기: tote=10, boston=5)
  const sqTop = y;
  const sqSize = cm(calCm);
  const sqY = sqTop - sqSize;
  page.drawRectangle({
    x: left,
    y: sqY,
    width: sqSize,
    height: sqSize,
    borderColor: INK,
    borderWidth: 1,
  });
  // 내부 1cm 눈금
  for (let i = 1; i <= Math.round(calCm); i++) {
    const gx = left + cm(i);
    page.drawLine({
      start: { x: gx, y: sqY },
      end: { x: gx, y: sqY + cm(0.4) },
      thickness: 0.4,
      color: FRAME,
    });
  }
  const sqLabel = `${calCm} cm`;
  page.drawText(sqLabel, { x: left + sqSize + 8, y: sqY + sqSize / 2, size: 11, font, color: INK });
  page.drawText(S.verify(calCm), { x: left + sqSize + 8, y: sqY + sqSize / 2 - 16, size: 9, font, color: INK });
  // verifyNote (사각형 아래)
  y = sqY - 16;
  page.drawText(S.verifyNote(calCm), { x: left, y, size: 8.5, font, color: INK });
  y -= 22;

  // 조립 방법 (자르고 맞대어 붙이기)
  page.drawText(S.asmTitle, { x: left, y, size: 11, font, color: INK });
  y -= 15;
  for (const t of [S.asm1, S.asm2, S.asm3]) {
    page.drawText(t, { x: left, y, size: 9, font, color: INK });
    y -= 14;
  }
  y -= 10;

  // 범례
  page.drawText(S.legendTitle, { x: left, y, size: 11, font, color: INK });
  y -= 16;
  const legendItem = (dash: number[] | undefined, text: string) => {
    page.drawLine({
      start: { x: left, y: y + 3 },
      end: { x: left + cm(2), y: y + 3 },
      thickness: 1.1,
      color: INK,
      dashArray: dash,
    });
    page.drawText(text, { x: left + cm(2) + 8, y, size: 9, font, color: INK });
    y -= 16;
  };
  legendItem(undefined, S.cut);
  legendItem(DASH.sew, S.sew);
  legendItem(DASH.fold, S.fold);
  y -= 8;

  // 페이지 배치 맵
  page.drawText(S.pageMap, { x: left, y, size: 11, font, color: INK });
  y -= 14;
  const cols = Math.max(...tiles.map((t) => t.col)) + 1;
  const rows = Math.max(...tiles.map((t) => t.row)) + 1;
  const cell = cm(1.2);
  const mapTop = y;
  for (const t of tiles) {
    const rx = left + t.col * cell;
    const ry = mapTop - t.row * cell - cell;
    page.drawRectangle({ x: rx, y: ry, width: cell, height: cell, borderColor: FRAME, borderWidth: 0.5 });
    const lbl = `${rowLetter(t.row)}${t.col + 1}`;
    page.drawText(lbl, {
      x: rx + cell / 2 - font.widthOfTextAtSize(lbl, 8) / 2,
      y: ry + cell / 2 - 3,
      size: 8,
      font,
      color: INK,
    });
  }
  y = mapTop - rows * cell - 20;

  // 시접 안내
  page.drawText(S.seamTitle, { x: left, y, size: 11, font, color: INK });
  y -= 15;
  for (const t of [S.seam1, S.seam2, S.seam3]) {
    page.drawText(t, { x: left, y, size: 9, font, color: INK });
    y -= 14;
  }
  // cols 참조 (미사용 경고 방지 & 향후 확장 여지)
  void cols;
}

export interface PdfOptions {
  koreanFont?: ArrayBuffer; // 있으면 한글 임베드
  calibrationCm?: number; // 검증 사각형 한 변(cm). 기본 10. (예: 보스턴백=5)
}

/** 문서에 폰트를 임베드하고 (한글/ASCII) 문자열 테이블을 고른다. */
async function embedFont(doc: PDFDocument, opts: PdfOptions): Promise<{ font: PDFFont; S: Strings }> {
  if (opts.koreanFont) {
    doc.registerFontkit(fontkit);
    // subset:true 는 pdf-lib+fontkit 에서 한글(CJK) 글리프 매핑이 깨지는
    // 알려진 문제가 있어 전체 임베드한다. 출력물이 커지지만(≈0.7MB) 정확성 우선.
    const font = await doc.embedFont(opts.koreanFont, { subset: false });
    return { font, S: KO };
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  return { font, S: ASCII };
}

/**
 * 패턴 세트를 A4 타일 1:1 PDF (Uint8Array) 로 생성.
 * 조각들을 인쇄영역 폭(usableW)으로 패킹해 빈 타일을 줄인다.
 */
export async function buildPatternPdf(set: PatternSet, opts: PdfOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { font, S } = await embedFont(doc, opts);

  // 용지 절약 패킹 (인쇄영역 폭 기준). 페이지보다 큰 조각은 그대로 타일 분할된다.
  const packed = packPatternSet(set, { maxWidthCm: usableW, gap: 1, allowRotate: true });

  const bb = contentBounds(packed);
  const boxes = packed.pieces.map((p) => bounds(cutVertices(flattenPiece(p))));
  const tiles = computeTiles(bb, boxes);

  // 첫 장: 캘리브레이션/안내
  const cal = doc.addPage([cm(A4W), cm(A4H)]);
  drawCalibrationPage(cal, font, S, tiles, opts.calibrationCm ?? 10);

  // 타일 페이지
  const has = new Set(tiles.map((t) => `${t.row},${t.col}`));

  for (const win of tiles) {
    const page = doc.addPage([cm(A4W), cm(A4H)]);
    const tp: ToPage = (cx, cy) => toPage(cx, cy, win);
    pushClip(page);
    // 곡선은 평탄화(line-only)해서 완성선·재단선을 폴리라인으로 그린다.
    for (const piece of packed.pieces) drawPieceInto(page, flattenPiece(piece), tp, font, S);
    drawMarksInto(page, packed, tp, font, S);

    popClip(page);

    // 자르고 맞대어 붙이는 안내선 (오른쪽/아래 이웃이 있을 때만)
    const hasRight = has.has(`${win.row},${win.col + 1}`);
    const hasBottom = has.has(`${win.row + 1},${win.col}`);
    drawTrimGuides(page, hasRight, hasBottom, font, S);
    drawFrame(page, `${rowLetter(win.row)}${win.col + 1}`, font);
  }

  return doc.save();
}

/** 롤 페이지 상단 헤더: 제목 + 인쇄 안내 + N cm 검증 사각형 (같은 페이지 위쪽). */
function drawRollHeader(
  page: PDFPage,
  font: PDFFont,
  S: Strings,
  calCm: number,
  pageH: number,
) {
  const left = cm(MARGIN + 0.5);
  let y = cm(pageH) - cm(MARGIN + 0.5);

  y -= 14;
  page.drawText(S.calTitle, { x: left, y, size: 14, font, color: INK });
  y -= 6;
  y -= 11;
  page.drawText(S.printNotice, { x: left, y, size: 11, font, color: ACCENT });
  y -= 12;

  // N cm 검증 사각형
  const sqSize = cm(calCm);
  const sqY = y - sqSize;
  page.drawRectangle({ x: left, y: sqY, width: sqSize, height: sqSize, borderColor: INK, borderWidth: 1 });
  for (let i = 1; i <= Math.round(calCm); i++) {
    const gx = left + cm(i);
    page.drawLine({ start: { x: gx, y: sqY }, end: { x: gx, y: sqY + cm(0.4) }, thickness: 0.4, color: FRAME });
  }
  page.drawText(`${calCm} cm`, { x: left + sqSize + 8, y: sqY + sqSize / 2, size: 11, font, color: INK });
  page.drawText(S.verify(calCm), { x: left + sqSize + 8, y: sqY + sqSize / 2 - 16, size: 9, font, color: INK });
}

/**
 * 패턴 세트를 A1 롤 1:1 PDF 로 생성.
 * 가로 610mm 고정, 세로는 내용 길이(가변). 타일 분할 없음(롤 연속 출력).
 * 인쇄영역 폭(59cm)으로 패킹해 용지를 절약한다.
 */
export async function buildRollPdf(set: PatternSet, opts: PdfOptions = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { font, S } = await embedFont(doc, opts);
  const calCm = opts.calibrationCm ?? 10;

  const packed = packPatternSet(set, { maxWidthCm: ROLL_USABLE, gap: 1, allowRotate: true });
  const bb = contentBounds(packed);
  const contentH = bb.maxY - bb.minY;

  // 상단 헤더 높이(cm): 제목/안내 + 검증 사각형 + 여유.
  const headerH = calCm + 3.5;
  const pageH = 2 * MARGIN + headerH + contentH;

  const page = doc.addPage([cm(ROLL_W), cm(pageH)]);
  drawRollHeader(page, font, S, calCm, pageH);

  // 콘텐츠는 헤더 아래부터. (cx,cy)[cm] → 페이지 pt (y 위로).
  const tp: ToPage = (cx, cy) => {
    const xCm = MARGIN + (cx - bb.minX);
    const yTopDown = MARGIN + headerH + (cy - bb.minY);
    return { x: cm(xCm), y: cm(pageH - yTopDown) };
  };

  for (const piece of packed.pieces) drawPieceInto(page, flattenPiece(piece), tp, font, S);
  drawMarksInto(page, packed, tp, font, S);

  return doc.save();
}
