import { parseBibleReferences } from '../bibleReferences';

describe('parseBibleReferences', () => {
  // ── Standard colon format ───────────────────────────────────────────────

  test('parses standard "John 3:16"', () => {
    const parts = parseBibleReferences('John 3:16');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'John 3:16', isReference: true });
  });

  test('parses reference embedded in prose', () => {
    const parts = parseBibleReferences('Today we look at Romans 8:28 in our study.');
    const ref = parts.find((p) => p.isReference);
    expect(ref?.text).toBe('Romans 8:28');
  });

  // ── Range format ────────────────────────────────────────────────────────

  test('parses range "Romans 8:28-30"', () => {
    const parts = parseBibleReferences('Romans 8:28-30');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Romans 8:28-30', isReference: true });
  });

  // ── Spoken / two-number format ──────────────────────────────────────────

  test('parses spoken "John 3 16" (space-separated chapter and verse)', () => {
    const parts = parseBibleReferences('John 3 16');
    expect(parts).toHaveLength(1);
    expect(parts[0].isReference).toBe(true);
    expect(parts[0].text).toBe('John 3:16');
  });

  test('parses spoken digits-only "John 316"', () => {
    const parts = parseBibleReferences('John 316');
    expect(parts).toHaveLength(1);
    expect(parts[0].isReference).toBe(true);
    // Should resolve to John 3:16 (valid) or John 31:6 (valid) — either is acceptable
    expect(parts[0].text).toMatch(/^John \d+:\d+$/);
  });

  test('parses "Song of Solomon 2 3" (multi-word book)', () => {
    const parts = parseBibleReferences('Song of Solomon 2 3');
    expect(parts).toHaveLength(1);
    expect(parts[0].isReference).toBe(true);
    expect(parts[0].text).toBe('Song of Solomon 2:3');
  });

  // ── Verbose / spoken-word format ────────────────────────────────────────

  test('parses "John chapter 3 verse 16"', () => {
    const parts = parseBibleReferences('John chapter 3 verse 16');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'John 3:16', isReference: true });
  });

  test('parses "Acts chapter 2 verses 38 through 40"', () => {
    const parts = parseBibleReferences('Acts chapter 2 verses 38 through 40');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Acts 2:38-40', isReference: true });
  });

  // ── "in verse" spoken separator ─────────────────────────────────────────

  test('parses "Numbers 12 in verse 6"', () => {
    const parts = parseBibleReferences("Let's look at Numbers 12 in verse 6");
    const ref = parts.find((p) => p.isReference);
    expect(ref?.text).toBe('Numbers 12:6');
  });

  test('parses "Psalm 139 in verse one" (word-form verse)', () => {
    const parts = parseBibleReferences('Psalm 139 in verse one');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Psalm 139:1', isReference: true });
  });

  test('parses "Exodus 33 in verse 14"', () => {
    const parts = parseBibleReferences('Exodus 33 in verse 14');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Exodus 33:14', isReference: true });
  });

  test('parses "Romans 8 verse 28" (verse without "in")', () => {
    const parts = parseBibleReferences('Romans 8 verse 28');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Romans 8:28', isReference: true });
  });

  // ── Spoken word-number format ────────────────────────────────────────────

  test('parses "Matthew eleven twenty one" (word-form double-digit chapter and verse)', () => {
    const parts = parseBibleReferences('Matthew eleven twenty one');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Matthew 11:21', isReference: true });
  });

  test('parses "John three sixteen" (word-form single-digit chapter, teen verse)', () => {
    const parts = parseBibleReferences('John three sixteen');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'John 3:16', isReference: true });
  });

  test('parses "Matthew twenty two thirty" (both numbers two words)', () => {
    const parts = parseBibleReferences('Matthew twenty two thirty');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Matthew 22:30', isReference: true });
  });

  test('parses "Psalm one hundred nineteen one" (hundred form chapter)', () => {
    const parts = parseBibleReferences('Psalm one hundred nineteen one');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: 'Psalm 119:1', isReference: true });
  });

  test('parses word-number reference embedded in prose', () => {
    const parts = parseBibleReferences('Today we look at Romans eight twenty eight in our study.');
    const ref = parts.find((p) => p.isReference);
    expect(ref?.text).toBe('Romans 8:28');
  });

  test('word-form book name alone is not a reference', () => {
    const parts = parseBibleReferences('Matthew eleven');
    expect(parts.every((p) => !p.isReference)).toBe(true);
  });

  // ── No-match cases ──────────────────────────────────────────────────────

  test('returns non-reference for plain text', () => {
    const parts = parseBibleReferences('This is just some regular text with no references.');
    expect(parts).toHaveLength(1);
    expect(parts[0].isReference).toBe(false);
  });

  test('book name with no chapter/verse is NOT a reference', () => {
    const parts = parseBibleReferences('John spoke today');
    expect(parts.every((p) => !p.isReference)).toBe(true);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  test('"Acts 1" alone (no verse) is not treated as a reference', () => {
    // "Acts 1" matches the two-number pattern: ch=1, v=... but there's only one number
    // The parser requires either colon or two numbers, so "Acts 1" should not match
    const parts = parseBibleReferences('Acts 1');
    expect(parts.every((p) => !p.isReference)).toBe(true);
  });

  test('"John" alone is not a reference', () => {
    const parts = parseBibleReferences('John');
    expect(parts).toHaveLength(1);
    expect(parts[0].isReference).toBe(false);
  });

  test('multiple references in one sentence', () => {
    const parts = parseBibleReferences('See John 3:16 and Romans 8:28');
    const refs = parts.filter((p) => p.isReference);
    expect(refs).toHaveLength(2);
    expect(refs[0].text).toBe('John 3:16');
    expect(refs[1].text).toBe('Romans 8:28');
  });

  test('empty string returns single non-reference part', () => {
    const parts = parseBibleReferences('');
    expect(parts).toHaveLength(1);
    expect(parts[0].isReference).toBe(false);
  });

  test('"1 John" book matches before plain "John"', () => {
    const parts = parseBibleReferences('1 John 3:16');
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toBe('1 John 3:16');
    expect(parts[0].isReference).toBe(true);
  });
});
