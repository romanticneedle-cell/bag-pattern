// 입력 폼. 아이템 정의(inputs)로부터 필드를 만들고 값 변경을 알린다.

import type { ItemDef } from '../items';

export interface FormHandle {
  getValues(): Record<string, number>;
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

  const getValues = (): Record<string, number> => {
    const v: Record<string, number> = {};
    for (const [k, el] of inputs) v[k] = parseFloat(el.value);
    return v;
  };

  const isValid = (): boolean => {
    for (const el of inputs.values()) {
      const n = parseFloat(el.value);
      if (!Number.isFinite(n) || n <= 0) return false;
    }
    return true;
  };

  return { getValues, isValid };
}
