# 인계 문서 (HANDOFF) — 낭만바늘 가방 패턴 생성기

> 새 세션/에이전트가 이 문서를 읽으면 맥락을 이어받을 수 있다.
> 새 디자인의 가방 패턴을 **이 프로젝트에 아이템으로 추가**하는 것이 목표.

## 프로젝트 개요

- **무엇**: 완성 치수를 입력하면 1:1 실치수 재단 도안을 SVG로 미리보고 A4 분할 PDF로 출력하는 정적 웹앱.
- **위치**: `C:\Users\root\Desktop\bag-pattern`
- **GitHub**: https://github.com/romanticneedle-cell/bag-pattern (main 브랜치, git author `rn <romanticneedle@gmail.com>`)
- **배포(공개 URL)**: https://romanticneedle-cell.github.io/bag-pattern/ (GitHub Pages, `main` push 시 자동 배포)
- **아임웹**: 위 URL을 iframe으로 임베드 (앱이 postMessage로 높이를 알려 자동 리사이즈 → 내부 스크롤 없음)
- **기술스택**: Vite + TypeScript, SVG 미리보기, pdf-lib(+@pdf-lib/fontkit) PDF, vitest 테스트.

## 아키텍처 (핵심)

```
src/
 ├─ main.ts            진입점 (DOM 구성, PDF 다운로드, iframe 높이 postMessage)
 ├─ ui/
 │   ├─ form.ts        입력 폼: item.inputs(숫자) + item.toggles(체크박스) 로 필드 생성
 │   └─ preview.ts     SVG 미리보기 + 완성 일러스트 렌더
 ├─ core/              ★ 아이템 무관 공용 엔진 — 새 아이템 추가 시 건드릴 필요 없음
 │   ├─ types.ts       Pt / Segment(line|curve) / EdgeRole(cut|fold|opening) / Piece / Guide / Mark / PatternSet
 │   ├─ allowance.ts   변별 시접 → 재단선 교점 계산, cutVertices(), bounds(), outwardNormal()
 │   ├─ render-svg.ts  Piece→SVG (재단선 실선/완성선 점선/골선 쇄선/guides/마크) + renderBagIllustration()
 │   └─ pdf.ts         Piece→A4 타일 1:1 PDF (한글 폰트 임베드, 10cm 검증, 겹침 맞춤 삼각형)
 └─ items/             ★ 아이템별 좌표 계산 — 여기에 파일 추가
     ├─ tote-cross.ts  십자 일체형 에코백 (1호 아이템)
     └─ index.ts       아이템 레지스트리 (items 배열)
public/fonts/          NanumGothic-Regular.ttf (OFL) — PDF 한글용
```

## 도형 모델 & 설계 원칙 (반드시 준수)

- 조각은 **Path 구조**(`Piece.start` + `segments[]`, 시계방향, 마지막 세그먼트 `to`=start 로 닫힘).
- `Segment` 는 `line` 과 `curve`(3차 베지어) 를 모두 지원 — 곡선 옆판 아이템 대비.
- **시접은 조각 전체가 아니라 변(세그먼트)마다 개별로 붙인다.** 각 변을 자기 `allowance`만큼 바깥으로 평행이동 → 인접 두 변의 오프셋선 **교점**을 재단선 꼭짓점으로. → 오목 코너에서도 선이 교차하지 않음. (`core/allowance.ts` 의 `cutVertices`)
- `role: 'fold'`(골선)은 `allowance:0` → 평행이동 안 함 (완성선=재단선).
- `Piece.guides`: 조각 내부 안내선(예: 끈 중앙 접는 선). fold=쇄선, sew=점선.
- **미리보기와 PDF는 동일한 좌표 데이터**를 쓴다 (이미지 변환 없음).
- 좌표는 **수식으로만** 계산, 숫자 하드코딩 금지.
- PDF: `1cm=28.3465pt`, A4 세로, 여백 10mm, 겹침 10mm 타일, 콘텐츠 없는 빈 타일은 스킵.
- 한글 폰트는 `subset:false` 로 임베드 (pdf-lib+fontkit subset 버그 회피, 출력물 ≈0.7MB).

## 새 아이템(가방) 추가 방법

1. `src/items/<새아이템>.ts` 생성. 다음을 export:
   - `interface <X>Params` (사용자 입력)
   - `build<X>Pattern(p): PatternSet` — `core/` 유틸로 `Piece[]` + `Mark[]` 생성
   - 아이템 메타 객체 `{ id, name, inputs:[{key,label,unit,default}], toggles?:[{key,label,default}], build }`
2. `src/items/index.ts` 의 `items` 배열에 등록.
3. **아이템이 2개 이상이면 "가방 종류 선택" UI가 필요** (현재 없음 — 1차에서 제외). 드롭다운으로 선택된 아이템의 `inputs/toggles/build`를 쓰도록 `main.ts`/`form.ts` 확장 필요. 레지스트리는 이미 배열이라 목록화 쉬움.
4. `core/`(엔진)는 새 도형 요구가 없으면 수정 불필요. 곡선 오프셋 등 새 기하가 필요하면 `allowance.ts`에 일반화해서 추가.

## 개발 / 배포 워크플로

```bash
cd C:\Users\root\Desktop\bag-pattern
npm run dev      # 로컬 미리보기 (http://localhost:5173)
npm test         # vitest (기하/PDF/끈)
npm run build    # 타입체크 + dist
```

- 배포: `git push origin main` → `.github/workflows/deploy.yml` 이 **테스트 통과 시에만** 빌드 후 GitHub Pages 게시. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- git 인증은 Git Credential Manager로 이미 저장됨(재인증 불필요).

## 컨벤션

- UI 문구·코드 주석은 **한국어**.
- 색: 흰/아이보리 배경 + 먹색 선 위주, 강조는 절제된 빨강 `#b23a2e`(치수/마크).
- 완성 일러스트(`renderBagIllustration`): 3/4 오블리크로 바닥 깊이 표시, 가로/세로/바닥폭/끈 치수 라벨.

## 현재 구현 상태 (1호 아이템 기준)

- 입력 5종(가로/세로/바닥폭/끈길이/끈폭) + 토글 "끈 안 만들기(기성 끈 사용)".
- 십자 일체형 본체 좌표, 변별 시접+오목 코너, 골선, 끈 조각(폭×2+시접×2, 반접어 1cm 박고 뒤집는 통형, 중앙 접는 선), 끈 위치 마크.
- SVG 미리보기, 완성 3/4 일러스트(치수 라벨), A4 분할 1:1 PDF, 10cm 검증.
- iframe 임베드 자동 높이 리사이즈.
- 테스트 17개 통과.

## 새 패턴 설계 시 받아야 할 정보 (스펙 템플릿)

새 가방을 구현하려면 아래를 사용자에게 확인:

1. **아이템 이름/구조**: 어떤 형태의 가방인가? (손그림/참고 이미지 있으면 최고)
2. **사용자 입력 변수**: 무엇을 입력받나 (예: 가로·세로·바닥폭·끈…), 단위, 기본값.
3. **조각 구성**: 몇 개 조각인가? 각 조각의 완성선 좌표 수식 (원점·시계방향 꼭짓점), 곡선 여부.
4. **변별 시접/골선**: 어느 변이 재단선/입구/골선인지, 시접 값.
5. **내부 안내선/마크**: 접는 선, 부착 위치 등.
6. **완성 형태**: 일러스트로 어떻게 보여줄지 (치수 라벨 포함 여부).
7. **PDF/출력**: 기존과 동일(A4 1:1)인지, 특이사항.
