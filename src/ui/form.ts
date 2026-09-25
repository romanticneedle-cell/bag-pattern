// 입력 폼. 아이템 정의(inputs)로부터 필드를 만들고 값 변경을 알린다.
// 일부 아이템은 select(예: 옆판 모양)를 가지며, 각 input 의 showFor 로
// 선택값에 해당하는 입력만 보이도록 한다.

import type { ItemDef } from '../items';

export interface FormHandle {
  getValues(): Record<string, number>;
  getToggles(): Record<string, boolean>;
  getSelects(): Record<string, string>;
  isValid(): boolean;
}

type SelectMeta = {
  key: string;
  label: string;
  options: readonly { value: string; label: string }[];
  default: string;
};
type InputDef = { key: string; label: string; unit: string; default: number; showFor?: readonly string[] };

export function buildForm(
  container: HTMLElement,
  item: ItemDef,
  onChange: () => void,
): FormHandle {
  const selects = new Map<string, HTMLSelectElement>();
  const selMeta = ('select' in item ? (item as { select?: SelectMeta }).select : undefined);

  // 모양 선택 드롭다운 (있으면 맨 위)
  if (selMeta) {
    const row = document.createElement('div');
    row.className = 'kind';
    const label = document.createElement('label');
    label.textContent = selMeta.label;
    label.htmlFor = `s-${selMeta.key}`;
    const sel = document.createElement('select');
    sel.id = `s-${selMeta.key}`;
    for (const o of selMeta.options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.append(opt);
    }
    sel.value = selMeta.default;
    row.append(label, sel);
    container.append(row);
    selects.set(selMeta.key, sel);
  }

  const inputs = new Map<string, HTMLInputElement>();
  const fields = new Map<string, { field: HTMLElement; showFor?: readonly string[] }>();

  for (const raw of item.inputs) {
    const def = raw as InputDef;
    const field = document.createElement('div');
    field.className = 'field';

    const label = document.createElement('label');
    label.textContent = def.label;
    label.htmlFor = `f-${def.key}`;

    const inputWrap = document.createElement('div');
    inputWrap.className = 'input';

    const input = document.createElement('input');
    input.type = 'number';
    input.id = `f-${def.key}`;
    input.min = '1';
    input.step = '0.5';
    input.value = String(def.default);
    input.inputMode = 'decimal';

    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = def.unit;

    inputWrap.append(input, unit);
    field.append(label, inputWrap);
    container.append(field);

    input.addEventListener('input', onChange);
    inputs.set(def.key, input);
    fields.set(def.key, { field, showFor: def.showFor });
  }

  // 토글(체크박스) 옵션
  const toggles = new Map<string, HTMLInputElement>();
  const toggleDefs = 'toggles' in item ? item.toggles : [];
  for (const def of toggleDefs ?? []) {
    const row = document.createElement('label');
    row.className = 'toggle';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `t-${def.key}`;
    cb.checked = !!def.default;

    const span = document.createElement('span');
    span.textContent = def.label;

    row.append(cb, span);
    container.append(row);

    cb.addEventListener('change', onChange);
    toggles.set(def.key, cb);
  }

  const currentShape = (): string => (selMeta ? selects.get(selMeta.key)!.value : '');

  // 선택값에 따라 showFor 가 맞는 입력만 보이게 한다.
  const applyVisibility = () => {
    const shape = currentShape();
    for (const [, { field, showFor }] of fields) {
      field.style.display = !showFor || showFor.includes(shape) ? '' : 'none';
    }
  };
  if (selMeta) {
    selects.get(selMeta.key)!.addEventListener('change', () => {
      applyVisibility();
      onChange();
    });
    applyVisibility();
  }

  const getValues = (): Record<string, number> => {
    const v: Record<string, number> = {};
    for (const [k, el] of inputs) v[k] = parseFloat(el.value);
    return v;
  };

  const getToggles = (): Record<string, boolean> => {
    const v: Record<string, boolean> = {};
    for (const [k, el] of toggles) v[k] = el.checked;
    return v;
  };

  const getSelects = (): Record<string, string> => {
    const v: Record<string, string> = {};
    for (const [k, el] of selects) v[k] = el.value;
    return v;
  };

  const isValid = (): boolean => {
    const shape = currentShape();
    for (const [k, el] of inputs) {
      const meta = fields.get(k);
      if (meta?.showFor && !meta.showFor.includes(shape)) continue; // 숨은 입력은 검증 제외
      const n = parseFloat(el.value);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    return true;
  };

  return { getValues, getToggles, getSelects, isValid };
}
