import './style.css';
import { toteCrossItem } from './items';
import { buildForm } from './ui/form';
import { renderPreview } from './ui/preview';
import type { ToteParams } from './items/tote-cross';

const app = document.getElementById('app')!;

app.innerHTML = `
  <div class="wrap">
    <header>
      <h1>낭만바늘 가방 패턴 생성기</h1>
      <p>${toteCrossItem.name} · 완성 치수를 입력하면 1:1 실치수 재단 도안을 만듭니다.</p>
    </header>
    <div class="layout">
      <div>
        <div class="panel">
          <div id="form"></div>
          <button id="pdf" class="primary">A4 분할 PDF 다운로드</button>
          <div id="status" class="status"></div>
        </div>
        <div class="notice">
          <strong>시접 안내</strong>
          <p>바닥 부분은 골선으로 재단하여 시접이 없습니다.</p>
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
          <div>
            <p class="section-label">완성 형태</p>
            <div id="illo" class="preview-box"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
`;

const formEl = document.getElementById('form')!;
const patternEl = document.getElementById('pattern')!;
const illoEl = document.getElementById('illo')!;
const statusEl = document.getElementById('status')!;
const pdfBtn = document.getElementById('pdf') as HTMLButtonElement;

function currentParams(): ToteParams {
  const v = form.getValues();
  return {
    x: v.x,
    y: v.y,
    z: v.z,
    strapLength: v.strapLength,
    strapWidth: v.strapWidth,
  };
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
  renderPreview(patternEl, illoEl, currentParams());
}

const form = buildForm(formEl, toteCrossItem, update);

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
    const params = currentParams();
    const set = toteCrossItem.build(params);
    // pdf-lib/fontkit 은 무거우므로 클릭 시 지연 로드한다.
    const [{ buildPatternPdf }, koreanFont] = await Promise.all([
      import('./core/pdf'),
      loadKoreanFont(),
    ]);
    const bytes = await buildPatternPdf(set, { koreanFont });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `가방패턴_${params.x}x${params.y}x${params.z}.pdf`;
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
