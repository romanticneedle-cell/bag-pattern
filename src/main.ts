import './style.css';
import { items, type ItemDef } from './items';
import { buildForm, type FormHandle } from './ui/form';
import { renderPreview } from './ui/preview';
import type { PatternSet } from './core/types';

const app = document.getElementById('app')!;

app.innerHTML = `
  <div class="wrap">
    <header>
      <h1>낭만바늘 가방 패턴 생성기</h1>
      <p id="subtitle"></p>
    </header>
    <div class="layout">
      <div>
        <div class="panel">
          <div class="kind">
            <label for="item-kind">가방 종류</label>
            <select id="item-kind"></select>
          </div>
          <div id="form"></div>
          <div class="paper">
            <label for="paper-format">용지</label>
            <select id="paper-format">
              <option value="a4">A4 분할</option>
              <option value="a1roll">A1 롤 (610mm)</option>
            </select>
          </div>
          <button id="pdf" class="primary">PDF 다운로드</button>
          <div id="status" class="status"></div>
        </div>
        <div class="notice">
          <strong>시접 안내</strong>
          <p>바닥/골선 부분은 시접이 없습니다.</p>
          <p>그 외 부분은 기본 시접 1cm가 포함되어 있습니다.</p>
          <p>봉제 방법이나 사용하는 소재에 따라 필요한 시접의 양은 달라질 수 있습니다.</p>
        </div>
      </div>
      <div class="panel">
        <div class="preview-grid">
          <div>
            <p class="section-label">재단 도안 (미리보기)</p>
            <div id="pattern" class="preview-box"></div>
            <div class="legend">
              <span><i></i> 재단선</span>
              <span><i class="sew"></i> 완성선</span>
              <span><i class="fold"></i> 골선</span>
            </div>
          </div>
          <div data-illo-col>
            <p class="section-label">완성 형태</p>
            <div id="illo" class="preview-box"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

const kindEl = document.getElementById('item-kind') as HTMLSelectElement;
const subtitleEl = document.getElementById('subtitle')!;
const formEl = document.getElementById('form')!;
const patternEl = document.getElementById('pattern')!;
const illoEl = document.getElementById('illo')!;
const statusEl = document.getElementById('status')!;
const paperEl = document.getElementById('paper-format') as HTMLSelectElement;
const pdfBtn = document.getElementById('pdf') as HTMLButtonElement;

// 가방 종류 옵션 채우기
for (const it of items) {
  const opt = document.createElement('option');
  opt.value = it.id;
  opt.textContent = it.name;
  kindEl.append(opt);
}

let currentItem: ItemDef = items[0];
let form: FormHandle;

// 아이템별로 폼 값·토글을 build 파라미터로 변환한다.
// deriveParams 가 있으면 사용(토트의 '끈 안 만들기' 등), 없으면 숫자 값을 그대로 쓴다.
function deriveParams(item: ItemDef): Record<string, number> {
  const values = form.getValues();
  const toggles = form.getToggles();
  const dp = (item as {
    deriveParams?: (v: Record<string, number>, t: Record<string, boolean>) => Record<string, number>;
  }).deriveParams;
  return dp ? dp(values, toggles) : values;
}

// 선택된 아이템으로 폼을 다시 만들고 부제/일러스트를 갱신한다.
function rebuildForm() {
  formEl.innerHTML = '';
  form = buildForm(formEl, currentItem, update);
  subtitleEl.textContent = `${currentItem.name} · 완성 치수를 입력하면 1:1 실치수 재단 도안을 만듭니다.`;
}

function update() {
  if (!form.isValid()) {
    statusEl.textContent = '모든 값은 0보다 큰 숫자여야 합니다.';
    statusEl.classList.add('err');
    pdfBtn.disabled = true;
    return;
  }
  statusEl.textContent = '';
  statusEl.classList.remove('err');
  pdfBtn.disabled = false;
  renderPreview(patternEl, illoEl, currentItem, deriveParams(currentItem));
}

kindEl.addEventListener('change', () => {
  const found = items.find((i) => i.id === kindEl.value);
  if (found) currentItem = found;
  rebuildForm();
  update();
});

rebuildForm();

// 한글 폰트는 최초 PDF 생성 시 1회만 로드해 캐시한다.
let fontPromise: Promise<ArrayBuffer | undefined> | null = null;
async function loadKoreanFont(): Promise<ArrayBuffer | undefined> {
  if (!fontPromise) {
    const url = `${import.meta.env.BASE_URL}fonts/NanumGothic-Regular.ttf`;
    fontPromise = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : undefined))
      .catch(() => undefined);
  }
  return fontPromise;
}

pdfBtn.addEventListener('click', async () => {
  if (!form.isValid()) return;
  pdfBtn.disabled = true;
  statusEl.classList.remove('err');
  statusEl.textContent = 'PDF 생성 중…';
  try {
    const params = deriveParams(currentItem);
    const set: PatternSet = (currentItem.build as (p: unknown) => PatternSet)(params);
    // pdf-lib/fontkit 은 무거우므로 클릭 시 지연 로드한다.
    const [pdf, koreanFont] = await Promise.all([import('./core/pdf'), loadKoreanFont()]);
    const calibrationCm = (currentItem as { calibrationCm?: number }).calibrationCm;
    const isRoll = paperEl.value === 'a1roll';
    const bytes = isRoll
      ? await pdf.buildRollPdf(set, { koreanFont, calibrationCm })
      : await pdf.buildPatternPdf(set, { koreanFont, calibrationCm });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dims = Object.values(form.getValues()).slice(0, 3).join('x');
    a.download = `가방패턴_${currentItem.id}_${dims}_${isRoll ? 'A1roll' : 'A4'}.pdf`;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'PDF 다운로드 완료. 인쇄 시 배율 100%(실제 크기)로 출력하세요.';
  } catch (e) {
    console.error(e);
    statusEl.classList.add('err');
    statusEl.textContent = 'PDF 생성 중 오류가 발생했습니다.';
  } finally {
    pdfBtn.disabled = false;
  }
});

update();

// iframe 임베드 시: 콘텐츠 높이를 부모(아임웹)에 알려 자동 리사이즈 → 내부 스크롤 제거.
if (window.parent !== window) {
  const postHeight = () => {
    const h = Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
    try {
      window.parent.postMessage({ type: 'bag-pattern-height', height: h }, '*');
    } catch {
      /* cross-origin 등 무시 */
    }
  };
  new ResizeObserver(postHeight).observe(document.body);
  window.addEventListener('load', postHeight);
  window.addEventListener('resize', postHeight);
  postHeight();
}
