// Piece → SVG 미리보기
//   재단선  = 실선
//   완성선  = 점선
//   골선    = 쇄선(긴 점선)
// 흰 배경 + 먹색 선. 끈 마크만 절제된 강조색.

import type { PatternSet, Piece, Pt, Segment } from './types';
import { bounds, cutVertices, markExtentPoints, vertices } from './allowance';
import { flattenPiece } from './flatten';

const INK = '#141414';
const ACCENT = '#b23a2e'; // 끈 마크(주석)용 절제된 강조색

// 선 스타일 (px 단위 dasharray 는 스케일 무관하게 보이도록 벡터 단위로 둔다)
const STROKE = {
  cut: { color: INK, width: 1.6, dash: '' },
  sew: { color: INK, width: 1.0, dash: '4 3' },
  fold: { color: INK, width: 1.3, dash: '11 3 2.5 3' }, // 쇄선
};

function fmt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/** cm 좌표 → SVG 좌표 변환기 */
function makeTransform(minX: number, minY: number, scale: number, pad: number) {
  return (p: Pt) => ({ x: (p.x - minX) * scale + pad, y: (p.y - minY) * scale + pad });
}

/** 완성선(닫힌 다각형) path d */
function completionPath(piece: Piece, tf: (p: Pt) => Pt): string {
  const vs = vertices(piece).map(tf);
  return 'M ' + vs.map((v) => `${fmt(v.x)} ${fmt(v.y)}`).join(' L ') + ' Z';
}

/** 재단선을 세그먼트별로(역할별 스타일) 반환 */
function cutSegments(piece: Piece, tf: (p: Pt) => Pt): { d: string; role: Segment['role'] }[] {
  const cut = cutVertices(piece).map(tf);
  const n = cut.length;
  const segs = piece.segments;
  const out: { d: string; role: Segment['role'] }[] = [];
  for (let i = 0; i < n; i++) {
    const a = cut[i];
    const b = cut[(i + 1) % n];
    out.push({ d: `M ${fmt(a.x)} ${fmt(a.y)} L ${fmt(b.x)} ${fmt(b.y)}`, role: segs[i].role });
  }
  return out;
}

function styleFor(role: Segment['role']) {
  if (role === 'fold') return STROKE.fold;
  return STROKE.cut; // cut / opening 은 실선 재단선
}

/** 조각 중심 (라벨 배치용) — 완성선 꼭짓점 평균 */
function centroid(piece: Piece): Pt {
  const vs = vertices(piece);
  const s = vs.reduce((acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }), { x: 0, y: 0 });
  return { x: s.x / vs.length, y: s.y / vs.length };
}

export interface SvgOptions {
  maxWidth?: number; // px, 미리보기 폭 상한
  minScale?: number; // px/cm 최소
}

/** 전체 패턴 세트를 하나의 SVG 문자열로 렌더 */
export function renderPatternSVG(set: PatternSet, opts: SvgOptions = {}): string {
  const maxWidth = opts.maxWidth ?? 560;

  // 전체 콘텐츠 바운딩 (재단선 + 마크 포함). 곡선은 평탄화 후 계산.
  const allCut: Pt[] = [];
  for (const piece of set.pieces) allCut.push(...cutVertices(flattenPiece(piece)));
  for (const m of set.marks) allCut.push(...markExtentPoints(m));
  const b = bounds(allCut);
  const contentW = b.maxX - b.minX;
  const contentH = b.maxY - b.minY;

  const padCm = 1.2; // 라벨 여유
  let scale = maxWidth / (contentW + padCm * 2);
  if (opts.minScale) scale = Math.max(scale, opts.minScale);

  const pad = padCm * scale;
  const width = (contentW + padCm * 2) * scale;
  const height = (contentH + padCm * 2) * scale;
  const tf = makeTransform(b.minX, b.minY, scale, pad);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(
      width,
    )}" height="${fmt(height)}" role="img">`,
  );
  parts.push(`<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="#ffffff"/>`);

  for (const piece of set.pieces) {
    // 곡선은 line-only 로 평탄화해서 완성선·재단선을 모두 폴리라인으로 그린다.
    const fp = flattenPiece(piece);
    // 완성선(점선)
    parts.push(
      `<path d="${completionPath(fp, tf)}" fill="none" stroke="${STROKE.sew.color}" stroke-width="${
        STROKE.sew.width
      }" stroke-dasharray="${STROKE.sew.dash}" />`,
    );
    // 재단선(세그먼트별 스타일)
    for (const s of cutSegments(fp, tf)) {
      const st = styleFor(s.role);
      const dash = st.dash ? ` stroke-dasharray="${st.dash}"` : '';
      parts.push(
        `<path d="${s.d}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linejoin="round"${dash} />`,
      );
    }
    // 내부 안내선 (접는 선 등) — 평탄화와 무관하게 원본 guides 사용
    for (const g of piece.guides ?? []) {
      const a = tf(g.a);
      const b = tf(g.b);
      const st = g.role === 'fold' ? STROKE.fold : STROKE.sew;
      parts.push(
        `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${st.color}" stroke-width="${st.width}" stroke-dasharray="${st.dash}" />`,
      );
    }
    // 조각명
    const c = tf(centroid(fp));
    parts.push(
      `<text x="${fmt(c.x)}" y="${fmt(c.y)}" font-family="sans-serif" font-size="13" fill="${INK}" text-anchor="middle" dominant-baseline="middle">${piece.name}</text>`,
    );
  }

  // 마크: 끈 위치(수직 표시선+라벨) / 정합 노치(dir 방향 짧은 눈금)
  for (const m of set.marks) {
    if (m.kind === 'strap') {
      const top = tf({ x: m.at.x, y: m.at.y - m.tick });
      const bot = tf({ x: m.at.x, y: m.at.y });
      parts.push(
        `<line x1="${fmt(top.x)}" y1="${fmt(top.y)}" x2="${fmt(bot.x)}" y2="${fmt(bot.y)}" stroke="${ACCENT}" stroke-width="1.4" />`,
      );
      parts.push(
        `<text x="${fmt(top.x)}" y="${fmt(top.y - 4)}" font-family="sans-serif" font-size="10" fill="${ACCENT}" text-anchor="middle">${m.label}</text>`,
      );
    } else {
      const a = tf(m.at);
      const b = tf({ x: m.at.x + m.dir.x * m.tick, y: m.at.y + m.dir.y * m.tick });
      parts.push(
        `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${ACCENT}" stroke-width="1.4" />`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

export interface BagDims {
  x: number; // 가로
  y: number; // 세로
  z: number; // 바닥폭
  strapLength: number; // 끈 길이
}

/**
 * 완성 사이즈 체크용 캔버스 토트백 일러스트.
 * 살짝 3/4 각도로 비틀어 오른쪽 옆면·바닥 깊이(z)가 보이는 입체 뷰.
 * 가로/세로/바닥폭/끈 치수 라벨을 함께 표시한다.
 */
export function renderBagIllustration(p: BagDims): string {
  const { x, y, z, strapLength } = p;
  const CANVAS = '#efe7d6'; // 앞면(캔버스)
  const SIDE = '#ddd2ba'; // 오른쪽 옆면(약간 어둡게)
  const RIM = '#c7bda3'; // 입구 안쪽
  const W = 360;
  const H = 440;

  // 몸통을 150×150 안에 비율 유지
  const u = Math.min(150 / x, 150 / y);
  const Wtop = x * u; // 입구 폭(가로)
  const Hf = y * u; // 높이(세로)
  const Wbot = Wtop * 0.9; // 바닥은 살짝 좁게(자연스러운 토트)
  const Dp = z * u; // 바닥 깊이

  const cx = 152;
  const bodyTop = 205;
  const bodyBottom = bodyTop + Hf;

  type V = { x: number; y: number };
  const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y });
  const P = (a: V) => `${fmt(a.x)} ${fmt(a.y)}`;
  const d: V = { x: Dp * 0.5, y: -Dp * 0.5 }; // 깊이 방향(오른쪽-위)

  // 앞면 사다리꼴 꼭짓점
  const TL: V = { x: cx - Wtop / 2, y: bodyTop };
  const TR: V = { x: cx + Wtop / 2, y: bodyTop };
  const BL: V = { x: cx - Wbot / 2, y: bodyBottom };
  const BR: V = { x: cx + Wbot / 2, y: bodyBottom };

  // 손잡이: 부착 span·끈 길이로 드롭 계산
  const sw = Math.max(7, Math.min(13, strapLength > 0 ? 2.5 * u : 8));
  const drop = Math.min(Math.max(8, (strapLength - (Math.PI * x * 0.4) / 2) / 2) * u, bodyTop - 40);
  const archTop = bodyTop - drop;
  const FAL: V = { x: cx - Wtop * 0.22, y: bodyTop };
  const FAR: V = { x: cx + Wtop * 0.22, y: bodyTop };
  const arch = (a: V, b: V, top: number) =>
    `M ${P(a)} C ${fmt(a.x)} ${fmt(top)}, ${fmt(b.x)} ${fmt(top)}, ${P(b)}`;
  const frontArch = arch(FAL, FAR, archTop);
  const hb: V = { x: d.x * 0.5, y: d.y * 0.5 }; // 뒤 손잡이는 살짝만 뒤로
  const backArch = arch(add(FAL, hb), add(FAR, hb), archTop + hb.y);

  // 치수 화살표(양쪽 화살촉) + 라벨
  const arrow = (a: V, b: V): string => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ah = 8;
    const head = (pt: V, dir: number) =>
      `M ${P(pt)} L ${fmt(pt.x + ah * Math.cos(dir - 0.42))} ${fmt(pt.y + ah * Math.sin(dir - 0.42))} M ${P(
        pt,
      )} L ${fmt(pt.x + ah * Math.cos(dir + 0.42))} ${fmt(pt.y + ah * Math.sin(dir + 0.42))}`;
    return `<line x1="${fmt(a.x)}" y1="${fmt(a.y)}" x2="${fmt(b.x)}" y2="${fmt(b.y)}" stroke="${ACCENT}" stroke-width="1.6"/>
    <path d="${head(b, ang)}" stroke="${ACCENT}" stroke-width="1.6" fill="none"/>
    <path d="${head(a, ang + Math.PI)}" stroke="${ACCENT}" stroke-width="1.6" fill="none"/>`;
  };
  const label = (tx: number, ty: number, s: string, anchor = 'middle') =>
    `<text x="${fmt(tx)}" y="${fmt(ty)}" font-family="sans-serif" font-size="16" font-weight="600" fill="${ACCENT}" text-anchor="${anchor}" dominant-baseline="middle">${s}</text>`;

  // 치수 좌표
  const wY = bodyTop + 20; // 가로(입구 폭)
  const hX = TL.x - 22; // 세로(왼쪽)
  const gEnd = add(BR, d); // 바닥폭(오른쪽 아래 → 대각)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:${W}px">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>

  <!-- 뒤쪽 손잡이(옅게) -->
  <path d="${backArch}" fill="none" stroke="${INK}" stroke-width="${sw + 2}" stroke-linecap="round" opacity="0.28"/>
  <path d="${backArch}" fill="none" stroke="${SIDE}" stroke-width="${sw}" stroke-linecap="round" opacity="0.5"/>

  <!-- 입구 안쪽(뒤 rim) -->
  <path d="M ${P(TL)} L ${P(TR)} L ${P(add(TR, d))} L ${P(add(TL, d))} Z" fill="${RIM}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
  <!-- 오른쪽 옆면(깊이) -->
  <path d="M ${P(TR)} L ${P(BR)} L ${P(add(BR, d))} L ${P(add(TR, d))} Z" fill="${SIDE}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>
  <!-- 앞면 -->
  <path d="M ${P(TL)} L ${P(TR)} L ${P(BR)} L ${P(BL)} Z" fill="${CANVAS}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>

  <!-- 앞쪽 손잡이 -->
  <path d="${frontArch}" fill="none" stroke="${INK}" stroke-width="${sw + 2.5}" stroke-linecap="round"/>
  <path d="${frontArch}" fill="none" stroke="${CANVAS}" stroke-width="${sw}" stroke-linecap="round"/>

  <!-- 가로 -->
  ${arrow({ x: TL.x, y: wY }, { x: TR.x, y: wY })}
  ${label(cx, wY - 12, `${fmt(x)} cm`)}
  <!-- 세로 -->
  ${arrow({ x: hX, y: bodyTop }, { x: hX, y: bodyBottom })}
  ${label(hX - 8, (bodyTop + bodyBottom) / 2, `${fmt(y)} cm`, 'end')}
  <!-- 바닥폭(대각) -->
  ${arrow(BR, gEnd)}
  ${label(gEnd.x + 6, gEnd.y + 2, `${fmt(z)} cm`, 'start')}
  <!-- 끈 길이(손잡이 위) -->
  ${label(cx, archTop - 8, `끈 ${fmt(strapLength)} cm`)}
</svg>`;
}
