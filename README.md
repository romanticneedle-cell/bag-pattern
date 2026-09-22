# 낭만바늘 가방 패턴 생성기

완성 치수를 입력하면 **1:1 실치수 재단 도안**을 SVG로 미리보기하고, **A4 분할 PDF**로 출력하는 정적 웹앱입니다. 백엔드가 없으며 GitHub Pages로 배포됩니다.

1차 아이템: **바닥 있는 에코백 (십자 일체형)**.

## 개발

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 기하/PDF 테스트 (vitest)
npm run build    # 타입체크 + dist 빌드
npm run preview  # 빌드 결과 미리보기
```

## 구조

```
src/
 ├─ main.ts             진입점 (DOM 구성 + PDF 다운로드 배선)
 ├─ ui/
 │   ├─ form.ts         입력 폼 (아이템 inputs 로 필드 생성)
 │   └─ preview.ts      SVG 미리보기 + 완성 일러스트
 ├─ core/               아이템 무관 공용 엔진
 │   ├─ types.ts        Piece / Segment / EdgeRole
 │   ├─ allowance.ts    변별 시접 → 재단선 교점 계산 (오목 코너 처리)
 │   ├─ render-svg.ts   Piece → SVG
 │   └─ pdf.ts          Piece → A4 타일 1:1 PDF
 └─ items/              아이템별 좌표 계산
     ├─ tote-cross.ts   십자 일체형 에코백
     └─ index.ts        아이템 레지스트리
public/
 └─ fonts/              PDF 한글 폰트 (NanumGothic, OFL)
```

### 설계 원칙

- **시접은 변(세그먼트)마다 개별로 붙인다.** 각 변을 자기 시접만큼 바깥으로 평행이동한 뒤 인접한 두 변의 교점을 재단선 꼭짓점으로 삼는다 → 오목 코너에서도 선이 교차하지 않는다. (`core/allowance.ts`)
- 골선(`fold`)은 시접 0 → 평행이동하지 않으므로 완성선=재단선.
- 도형은 곡선(`curve`)을 수용하는 Path 구조. 이번 아이템은 전부 직선이지만 이후 곡선 옆판 아이템을 위한 구조.
- **미리보기와 PDF는 동일한 좌표 데이터**를 사용한다 (이미지 변환 없음).
- PDF는 `1cm = 28.3465pt`, A4 세로, 여백 10mm, 겹침 10mm 타일 분할, 첫 장에 10cm 검증 사각형.

### 두 번째 아이템 추가

1. `src/items/새아이템.ts` 에 좌표 계산 함수(`build(params): PatternSet`)와 `inputs` 정의 작성.
2. `src/items/index.ts` 의 `items` 배열에 등록.

`core/` 는 수정할 필요가 없다.

## 폰트 라이선스

PDF의 한글 텍스트에는 **나눔고딕(NanumGothic)** 을 사용합니다. SIL Open Font License 1.1 (`public/fonts/OFL.txt`). © NHN Corporation.
폰트 파일이 없으면 PDF는 자동으로 ASCII 라벨로 폴백하여 도안 자체는 그대로 출력됩니다.

## 배포 (GitHub Pages)

`main` 브랜치에 push 하면 `.github/workflows/deploy.yml` 가 빌드 후 Pages에 배포합니다.
저장소 Settings → Pages → Source 를 **GitHub Actions** 로 설정하세요.
`vite.config.ts` 의 `base: './'` 로 하위 경로 배포에 대응합니다.

## 1차 범위

입력 5종 · 십자 일체형 본체 좌표 · 변별 시접 + 오목 코너 · 골선 · SVG 미리보기 · 완성 일러스트 · 끈 패턴 + 부착 위치 마크 · A4 분할 1:1 PDF · 10cm 검증 사각형.

원단 소요량 계산, 아이템 선택 UI, 저장/불러오기는 1차 범위 밖.
끈 재단 치수 공식(`calculateStrapPattern`)은 봉제법 확정 후 수정 예정 (현재 임시값).
