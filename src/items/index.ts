// 아이템 레지스트리.
// 새 아이템은 이 폴더에 파일 하나를 추가하고 아래 배열에 등록만 하면 된다.
// 탬버린백(원형)은 지퍼 보스턴백의 '원' 모양 옵션으로 흡수됨 → 레지스트리에서 제외.
// (round-tambourine.ts 의 헬퍼는 boston-zip/boston-center-zip 이 계속 재사용한다.)

import { toteCrossItem } from './tote-cross';
import { bostonZipItem } from './boston-zip';
import { bostonCenterZipItem } from './boston-center-zip';

export const items = [toteCrossItem, bostonZipItem, bostonCenterZipItem] as const;

export type ItemDef = (typeof items)[number];

export { toteCrossItem, bostonZipItem, bostonCenterZipItem };
