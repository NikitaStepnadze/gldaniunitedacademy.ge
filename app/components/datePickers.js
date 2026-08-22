/**
 * Friendlier replacements for `<input type="date">` and `<input type="time">`.
 *
 * Both native controls tested badly with parents on the registration card. The
 * date input opens a month-grid calendar that has to be paged back a decade to
 * reach a child's birth year, and the time input is a masked text field whose
 * AM/PM segment is meaningless to a Georgian audience that reads 24-hour time.
 *
 * These build the same value out of plain `<select>` elements — day, month,
 * year for a date; hour, minute for a time — which every browser renders as a
 * native scrollable list, and which reads as 24-hour throughout.
 *
 * The contract with the forms is deliberately narrow. Each picker keeps the
 * original `name` on a hidden input and writes the same string the native
 * control produced (`YYYY-MM-DD`, `HH:MM`), so validation, submit and the
 * server stay untouched. An incomplete picker writes '', which the existing
 * `required` checks already report.
 */

const MONTHS_KA = [
  'იანვარი',
  'თებერვალი',
  'მარტი',
  'აპრილი',
  'მაისი',
  'ივნისი',
  'ივლისი',
  'აგვისტო',
  'სექტემბერი',
  'ოქტომბერი',
  'ნოემბერი',
  'დეკემბერი',
];

const PLACEHOLDERS = {
  day: 'დღე',
  month: 'თვე',
  year: 'წელი',
  hour: 'სთ',
  minute: 'წთ',
};

function pad(value) {
  return String(value).padStart(2, '0');
}

/** Days in a month, defaulting to 31 while month or year is still unchosen. */
function daysInMonth(year, month) {
  if (!month) return 31;
  // Day 0 of the next month is the last day of this one; a blank year is
  // treated as a leap year so 29 February stays selectable until proven wrong.
  return new Date(Number(year) || 2000, Number(month), 0).getDate();
}

function makeSelect(part, className) {
  const select = document.createElement('select');
  select.className = className;
  select.dataset.part = part;
  select.setAttribute('aria-label', PLACEHOLDERS[part]);

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = PLACEHOLDERS[part];
  select.appendChild(placeholder);

  return select;
}

/** Replaces `select`'s options with `values`, keeping the current one if it survives. */
function fill(select, values, labelOf = (v) => v) {
  const previous = select.value;
  const placeholder = select.firstElementChild;

  select.replaceChildren(placeholder);
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = labelOf(value);
    select.appendChild(option);
  });

  select.value = values.some((v) => String(v) === previous) ? previous : '';
}

function range(from, to) {
  const out = [];
  for (let n = from; n <= to; n += 1) out.push(n);
  return out;
}

/**
 * Swaps one native input for a group of selects.
 *
 * Returns a teardown that puts the original input back, so a component that
 * mounts twice (React strict mode in development) does not stack two pickers.
 */
function replace(input, groupClass, build) {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = input.name;
  hidden.value = input.value;

  const group = document.createElement('div');
  group.className = groupClass;
  // The group answers to the field as a whole, so screen readers announce
  // "date of birth" once rather than on each of the three selects.
  group.setAttribute('role', 'group');

  const parent = input.parentNode;
  parent.replaceChild(group, input);
  group.appendChild(hidden);

  const sync = build(group, hidden);

  /*
   * The markup labels these fields with `<label for=...>` pointing at the id
   * the native input carried. Moving that id to a hidden input would leave the
   * label pointing at something unfocusable, so it moves to the first select
   * and the group borrows the label's text as its own accessible name.
   */
  const label = input.id
    ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`)
    : null;
  const first = group.querySelector('select');
  if (label && first) {
    if (!label.id) label.id = `${input.id}-label`;
    group.setAttribute('aria-labelledby', label.id);
    first.id = input.id;
  } else {
    hidden.id = input.id;
  }

  /*
   * The forms clear a field's error on `input` events and read `.value` on
   * submit. A hidden input fires neither on its own, so each select relays a
   * bubbling `input` event from the hidden one after writing the value.
   */
  const onChange = () => {
    sync();
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const selects = [...group.querySelectorAll('select')];
  selects.forEach((select) => select.addEventListener('change', onChange));

  sync();

  return () => {
    selects.forEach((select) => select.removeEventListener('change', onChange));
    input.value = hidden.value;
    delete input.dataset.enhanced;
    parent.replaceChild(input, group);
  };
}

/**
 * Day → month → year, the order the date is spoken in Georgian.
 *
 * `minYear`/`maxYear` bound the year list so the age rule the form enforces is
 * not something a parent can scroll past in the first place.
 */
export function enhanceDateInput(input, { minYear, maxYear, selectClass = '' } = {}) {
  if (!input || input.dataset.enhanced === 'date') return () => {};
  input.dataset.enhanced = 'date';

  return replace(input, 'picker-group picker-date', (group, hidden) => {
    const day = makeSelect('day', selectClass);
    const month = makeSelect('month', selectClass);
    const year = makeSelect('year', selectClass);

    fill(month, range(1, 12), (m) => MONTHS_KA[m - 1]);
    // Newest first: a birth year is far likelier to be recent than 20 years back.
    fill(year, range(minYear, maxYear).reverse());
    fill(day, range(1, 31));

    group.append(day, month, year);

    // Prefill from whatever the native input already held, e.g. a restored draft.
    const initial = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hidden.value);
    if (initial) {
      year.value = String(Number(initial[1]));
      month.value = String(Number(initial[2]));
      day.value = String(Number(initial[3]));
    }

    return function sync() {
      // 31 March → February must not silently keep an impossible 31st.
      const limit = daysInMonth(year.value, month.value);
      if (day.options.length - 1 !== limit) fill(day, range(1, limit));

      hidden.value =
        day.value && month.value && year.value
          ? `${year.value}-${pad(month.value)}-${pad(day.value)}`
          : '';
    };
  });
}

/**
 * Hour then minute, 24-hour, no AM/PM.
 *
 * `step` is the minute granularity; 5 keeps the list short enough to scroll
 * while still expressing the times a school day actually starts and ends at.
 */
export function enhanceTimeInput(input, { step = 5, selectClass = '' } = {}) {
  if (!input || input.dataset.enhanced === 'time') return () => {};
  input.dataset.enhanced = 'time';

  return replace(input, 'picker-group picker-time', (group, hidden) => {
    const hour = makeSelect('hour', selectClass);
    const minute = makeSelect('minute', selectClass);

    fill(hour, range(0, 23), pad);
    fill(
      minute,
      range(0, 59).filter((m) => m % step === 0),
      pad
    );

    group.append(hour, minute);

    const initial = /^(\d{2}):(\d{2})$/.exec(hidden.value);
    if (initial) {
      hour.value = String(Number(initial[1]));
      // A restored value off the step grid still has to be selectable.
      const minutes = Number(initial[2]);
      if (!minute.querySelector(`option[value="${minutes}"]`)) {
        const extra = document.createElement('option');
        extra.value = String(minutes);
        extra.textContent = pad(minutes);
        minute.appendChild(extra);
      }
      minute.value = String(minutes);
    }

    return function sync() {
      hidden.value =
        hour.value && minute.value ? `${pad(hour.value)}:${pad(minute.value)}` : '';
    };
  });
}
