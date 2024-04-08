const SPECIAL_CHARS = [
  '\\',
  '_',
  '*',
  '[',
  ']',
  '(',
  ')',
  '~',
  '`',
  '>',
  '<',
  '&',
  '#',
  '+',
  '-',
  '=',
  '|',
  '{',
  '}',
  '.',
  '!',
];

export function escapeMarkdown(text: string): string {
  for (const char of SPECIAL_CHARS) {
    text = text.replaceAll(char, `\\${char}`);
  }

  return text;
}
