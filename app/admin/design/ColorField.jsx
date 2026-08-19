'use client';

import { useState } from 'react';

/**
 * A colour swatch paired with its hex value.
 *
 * The two inputs stay in step: picking from the swatch rewrites the hex box,
 * and typing a valid hex moves the swatch. Only the text input carries the
 * form field name, so what gets submitted is always exactly what is displayed
 * -- including a half-typed value the swatch could not represent.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;

export default function ColorField({ id, name, label, hint, defaultValue }) {
  const [value, setValue] = useState(defaultValue || '#000000');

  return (
    <div className="color-item">
      <input
        type="color"
        aria-label={`${label} — ფერის არჩევა`}
        value={HEX.test(value) ? value : '#000000'}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className="color-meta">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          spellCheck={false}
          aria-invalid={value !== '' && !HEX.test(value) ? 'true' : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {hint && <div className="cms-key">{hint}</div>}
      </div>
    </div>
  );
}
