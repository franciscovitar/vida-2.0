import { Check } from 'lucide-react';

import styles from './Checkbox.module.scss';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Etiqueta accesible cuando el checkbox aparece sin texto visible. */
  label: string;
  disabled?: boolean;
}

/**
 * Checkbox presentacional y controlado. El estado lo maneja el componente
 * cliente que lo usa; en esta fase la interacción es solo local.
 */
export function Checkbox({ checked, onChange, label, disabled = false }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={styles.box}
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      {checked ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
    </button>
  );
}
