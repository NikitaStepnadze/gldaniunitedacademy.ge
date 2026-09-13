'use client';

import { useState } from 'react';

import ImageField from './content/ImageField';

/**
 * The photo control on the admin forms that post a chosen image URL.
 *
 * A thin client wrapper around the content editor's ImageField, which is
 * already the panel's upload-and-pick widget: reusing it means a photo on a
 * programme or a news entry is chosen exactly the way every other photo on the
 * site is, and there is one upload path to keep working rather than three.
 *
 * The difference is how the value is submitted. ImageField is built for the
 * live editor, where a change goes into React state and is saved by a server
 * action holding the whole draft. These editors are plain forms posted to a
 * server action, so the chosen URL has to reach the payload -- hence the hidden
 * input mirroring the state.
 */
export default function FormImagePicker({ name, defaultValue }) {
  const [value, setValue] = useState(defaultValue ?? '');

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <ImageField
        id={`${name}-field`}
        value={value}
        onChange={setValue}
        /*
         * ImageField calls onFocus to scroll a live preview to the field it
         * belongs to. This screen has no preview frame, so there is nothing to
         * point at -- but the prop is called unconditionally, so it is given a
         * no-op rather than left undefined.
         */
        onFocus={() => {}}
      />
    </>
  );
}
