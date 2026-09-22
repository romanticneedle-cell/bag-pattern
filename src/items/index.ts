// 아이템 레지스트리.
// 두 번째 아이템은 이 폴더에 파일 하나를 추가하고 아래 배열에 등록만 하면 된다.

import { toteCrossItem } from './tote-cross';

export const items = [toteCrossItem] as const;

export type ItemDef = (typeof items)[number];

export { toteCrossItem };
