export function sanitizeFilename(input: string, maximumLength = 120): string {
  const sanitized = Array.from(input, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /[\\/:*?"<>|]/.test(character) || codePoint < 0x20 || codePoint === 0x7f
      ? '_'
      : character;
  }).join('').replace(/[. ]+$/g, '').slice(0, maximumLength);
  return sanitized || 'image';
}
