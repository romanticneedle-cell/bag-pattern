// 입력 폼. 아이템 정의(inputs)로부터 필드를 만들고 값 변경을 알린다.

import type { ItemDef } from '../items';

export interface FormHandle {
  getValues(): Record<string, number>;
  getToggles(): Record<string, boolean>;
  isValid(): boolean;
}

export function buildForm(
  container: HTMLElement,
  item: ItemDef,
  onChange: () => void,
): FormHandle {
  const inputs = new Map<string, HTMLInputElement>();

  for (const def of item.inputs) {
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
  }

  // 토글(체크박스) 옵션 — 예: 끈 안 만들기
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

  const isValid = (): boolean => {
    for (const el of inputs.values()) {
      const n = parseFloat(el.value);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    return true;
  };

  return { getValues, getToggles, isValid };
}
