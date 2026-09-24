// 패턴 도형 모델
// - 모든 좌표 단위는 cm.
// - 조각은 Path 구조(세그먼트 배열)로 정의한다.
// - 이번 아이템은 전부 직선이지만, 이후 곡선 옆판 아이템을 수용하기 위해
//   처음부터 curve 세그먼트를 포함한다.

export type Pt = { x: number; y: number }; // 단위 cm

export type EdgeRole = 'cut' | 'fold' | 'opening'; // fold = 골선

export type Segment =
  | { kind: 'line'; to: Pt; allowance: number; role: EdgeRole }
  | { kind: 'curve'; c1: Pt; c2: Pt; to: Pt; allowance: number; role: EdgeRole };

// 조각 내부의 안내선 (외곽선이 아님). 예: 끈 중앙의 접는 선.
export type Guide = {
  a: Pt;
  b: Pt;
  role: 'fold' | 'sew'; // fold = 접는 선(쇄선), sew = 봉제 안내선(점선)
};

export type Piece = {
  name: string; // '본체', '끈'
  start: Pt;
  segments: Segment[]; // 시계방향, 마지막 세그먼트의 to 는 start 로 닫힘
  onFold: boolean;
  guides?: Guide[]; // 내부 안내선 (선택)
};

// 참고용 마크.
// - strap: 끈 부착 위치 (기준점에서 위쪽으로 tick 길이의 표시선 + 라벨).
// - notch: 조각끼리 맞물리는 정합 노치 (기준점에서 dir 방향으로 tick 길이의 짧은 눈금).
export type Mark =
  | {
      kind: 'strap';
      at: Pt; // 마크 기준점 (완성선 위)
      label: string;
      tick: number; // 표시선 길이(cm). 화면/PDF 공용.
    }
  | {
      kind: 'notch';
      at: Pt; // 외곽선 위 정합점
      dir: Pt; // 눈금 방향 단위벡터(보통 조각 안쪽)
      tick: number; // 눈금 길이(cm)
      label?: string;
    };

// 한 아이템이 만들어내는 전체 패턴 세트
export type PatternSet = {
  pieces: Piece[];
  marks: Mark[];
};
