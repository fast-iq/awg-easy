import { expect, test } from 'vitest';

// mirrors server/utils/utils/template.ts semantics (kept in sync manually):
// replaces {{word}} placeholders; unknown keys stay verbatim
const template = (templ, values) =>
  templ.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    values[key] !== undefined ? values[key] : match
  );

test('substitutes placeholders', () => {
  expect(
    template('ip link {{device}} cidr {{ipv4Cidr}}', {
      device: 'wg0',
      ipv4Cidr: '10.8.0.0/24',
    })
  ).toBe('ip link wg0 cidr 10.8.0.0/24');
});

test('replaces all occurrences', () => {
  expect(template('a {{x}} b {{x}}', { x: '9' })).toBe('a 9 b 9');
});

test('empty ctx is a no-op', () => {
  expect(template('{{x}} stays', {})).toBe('{{x}} stays');
});

test('multiline hook text', () => {
  expect(template('line1 {{a}}\nline2 {{a}}', { a: 'z' })).toBe(
    'line1 z\nline2 z'
  );
});
