import { VERSE_COUNTS, isValidReference, getChapterCount } from '../bibleData';

/**
 * The verse-count table drives reference validation, so bad data is not a
 * cosmetic problem: when isValidReference() wrongly rejects a real reference,
 * the parser falls through to a digit-splitting fallback and renders something
 * plausible but wrong on screen (a truncated Proverbs turned "Proverbs 24
 * verse 11" into "Proverbs 2:4"). These tests guard the shape of the data.
 */

const EXPECTED_CHAPTER_COUNTS: Record<string, number> = {
  'genesis': 50, 'exodus': 40, 'leviticus': 27, 'numbers': 36, 'deuteronomy': 34,
  'joshua': 24, 'judges': 21, 'ruth': 4, '1 samuel': 31, '2 samuel': 24,
  '1 kings': 22, '2 kings': 25, '1 chronicles': 29, '2 chronicles': 36,
  'ezra': 10, 'nehemiah': 13, 'esther': 10, 'job': 42, 'psalm': 150, 'psalms': 150,
  'proverbs': 31, 'ecclesiastes': 12, 'song of solomon': 8, 'isaiah': 66,
  'jeremiah': 52, 'lamentations': 5, 'ezekiel': 48, 'daniel': 12, 'hosea': 14,
  'joel': 3, 'amos': 9, 'obadiah': 1, 'jonah': 4, 'micah': 7, 'nahum': 3,
  'habakkuk': 3, 'zephaniah': 3, 'haggai': 2, 'zechariah': 14, 'malachi': 4,
  'matthew': 28, 'mark': 16, 'luke': 24, 'john': 21, 'acts': 28, 'romans': 16,
  '1 corinthians': 16, '2 corinthians': 13, 'galatians': 6, 'ephesians': 6,
  'philippians': 4, 'colossians': 4, '1 thessalonians': 5, '2 thessalonians': 3,
  '1 timothy': 6, '2 timothy': 4, 'titus': 3, 'philemon': 1, 'hebrews': 13,
  'james': 5, '1 peter': 5, '2 peter': 3, '1 john': 5, '2 john': 1, '3 john': 1,
  'jude': 1, 'revelation': 22,
};

describe('VERSE_COUNTS data integrity', () => {
  test.each(Object.entries(EXPECTED_CHAPTER_COUNTS))(
    '%s has the right number of chapters',
    (book, expected) => {
      expect(getChapterCount(book)).toBe(expected);
    }
  );

  test('every book in the table is one we expect', () => {
    for (const book of Object.keys(VERSE_COUNTS)) {
      expect(EXPECTED_CHAPTER_COUNTS).toHaveProperty(book);
    }
  });

  test('every chapter has at least one verse', () => {
    for (const [book, chapters] of Object.entries(VERSE_COUNTS)) {
      chapters.forEach((count, i) => {
        expect({ book, chapter: i + 1, count }).toEqual({
          book,
          chapter: i + 1,
          count: expect.any(Number),
        });
        expect(count).toBeGreaterThan(0);
      });
    }
  });

  test('"psalm" and "psalms" resolve to identical data', () => {
    expect(VERSE_COUNTS['psalm']).toEqual(VERSE_COUNTS['psalms']);
  });
});

describe('isValidReference', () => {
  test('accepts the last verse of a book', () => {
    expect(isValidReference('Revelation', 22, 21)).toBe(true);
    expect(isValidReference('Proverbs', 31, 31)).toBe(true);
    expect(isValidReference('Job', 42, 17)).toBe(true);
  });

  test('rejects a verse past the end of a chapter', () => {
    expect(isValidReference('Revelation', 22, 22)).toBe(false);
    expect(isValidReference('John', 3, 100)).toBe(false);
  });

  test('rejects a chapter past the end of a book', () => {
    expect(isValidReference('Proverbs', 32, 1)).toBe(false);
    expect(isValidReference('Jude', 2, 1)).toBe(false);
  });

  test('accepts Proverbs chapters 22-31 (regression: table was truncated at 21)', () => {
    for (let chapter = 22; chapter <= 31; chapter++) {
      expect(isValidReference('Proverbs', chapter, 1)).toBe(true);
    }
    expect(isValidReference('Proverbs', 24, 11)).toBe(true);
  });

  test('is case-insensitive on the book name', () => {
    expect(isValidReference('proverbs', 24, 11)).toBe(true);
    expect(isValidReference('PROVERBS', 24, 11)).toBe(true);
  });

  test('rejects unknown books and non-positive numbers', () => {
    expect(isValidReference('Hezekiah', 1, 1)).toBe(false);
    expect(isValidReference('John', 0, 1)).toBe(false);
    expect(isValidReference('John', 3, 0)).toBe(false);
  });
});
