import { isValidReference } from './bibleData';

// English number words used by STT engines when transcribing spoken references.
const WORD_ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const WORD_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/**
 * Parse one number from an array of lower-cased words, consuming the fewest words
 * needed to form the number. Handles 1–199 (sufficient for all Bible chapter/verse numbers).
 *
 * Examples:
 *   ["eleven"]               → { value: 11, wordCount: 1 }
 *   ["twenty", "one"]        → { value: 21, wordCount: 2 }
 *   ["one", "hundred"]       → { value: 100, wordCount: 2 }
 *   ["one", "hundred", "nineteen"] → { value: 119, wordCount: 3 }
 */
function parseOneWordNumber(words: string[]): { value: number; wordCount: number } | null {
  if (words.length === 0) return null;
  const w0 = words[0];

  // "one hundred [tens] [ones]" — must be checked before the plain "one" branch
  if (w0 === 'one' && words.length > 1 && words[1] === 'hundred') {
    let value = 100;
    let wordCount = 2;
    if (words.length > 2) {
      const w2 = words[2];
      if (WORD_TENS[w2] !== undefined) {
        value += WORD_TENS[w2];
        wordCount = 3;
        if (words.length > 3 && WORD_ONES[words[3]] !== undefined) {
          value += WORD_ONES[words[3]];
          wordCount = 4;
        }
      } else if (WORD_ONES[w2] !== undefined) {
        value += WORD_ONES[w2];
        wordCount = 3;
      }
    }
    return { value, wordCount };
  }

  // ones and teens (1–19)
  if (WORD_ONES[w0] !== undefined) {
    return { value: WORD_ONES[w0], wordCount: 1 };
  }

  // tens (20–90), greedily combined with a following ones word
  if (WORD_TENS[w0] !== undefined) {
    const tensVal = WORD_TENS[w0];
    if (words.length > 1 && WORD_ONES[words[1]] !== undefined) {
      return { value: tensVal + WORD_ONES[words[1]], wordCount: 2 };
    }
    return { value: tensVal, wordCount: 1 };
  }

  return null;
}

const BIBLE_BOOKS = [
  // Old Testament
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
  'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings',
  '1 Chronicles', '2 Chronicles',
  'Ezra', 'Nehemiah', 'Esther',
  'Job', 'Psalms', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
  'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
  'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
  'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  // New Testament
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians',
  'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians',
  '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter',
  '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

// Sort longest first so "Song of Solomon" matches before "Song", "1 John" before "John", etc.
const SORTED_BOOKS = [...BIBLE_BOOKS].sort((a, b) => b.length - a.length);

/**
 * Try all ways to split a digit string into chapter:verse,
 * preferring the split with the largest valid chapter number.
 */
function splitDigitsValidated(book: string, digits: string): string | null {
  let best: { ch: number; v: number } | null = null;
  for (let i = 1; i < digits.length; i++) {
    const ch = parseInt(digits.slice(0, i), 10);
    const v = parseInt(digits.slice(i), 10);
    if (v > 0 && isValidReference(book, ch, v)) {
      if (!best || ch > best.ch) {
        best = { ch, v };
      }
    }
  }
  return best ? `${book} ${best.ch}:${best.v}` : null;
}

export interface TextPart {
  text: string;
  isReference: boolean;
}

/**
 * Find a Bible book name starting at position `start` in the text.
 * Returns the matched book name or null.
 */
function findBookAt(text: string, start: number): string | null {
  const sub = text.slice(start);
  for (const book of SORTED_BOOKS) {
    if (sub.length < book.length) continue;
    const candidate = sub.slice(0, book.length);
    if (candidate.toLowerCase() === book.toLowerCase()) {
      // Make sure it's not a partial word match (e.g., "Joshua" inside "Joshuary")
      const afterChar = sub[book.length];
      if (!afterChar || afterChar === ' ' || afterChar === '\t') {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Parse the reference portion after a book name.
 * Returns { ref: normalized string, length: chars consumed } or null.
 */
function parseRefAfterBook(book: string, text: string): { ref: string; length: number } | null {
  const trimmed = text.trimStart();
  const leadingSpaces = text.length - trimmed.length;
  if (leadingSpaces === 0) return null; // no space after book name

  // Pattern 1: "chapter X verse(s) Y (through/to Z)"
  const chapterMatch = trimmed.match(
    /^chapter\s+(\d+)\s+verses?\s+(\d+)(?:\s+(?:through|to|-)\s+(\d+))?/i
  );
  if (chapterMatch) {
    const [full, ch, v, vEnd] = chapterMatch;
    const ref = vEnd ? `${book} ${ch}:${v}-${vEnd}` : `${book} ${ch}:${v}`;
    return { ref, length: leadingSpaces + full.length };
  }

  // Pattern 2: "X:Y" or "X:Y-Z" or "X:Y-Z:W" (standard colon format)
  const colonMatch = trimmed.match(
    /^(\d+):(\d+)(?:\s*-\s*(\d+)(?::(\d+))?)?/
  );
  if (colonMatch) {
    const [full] = colonMatch;
    return { ref: `${book} ${full}`, length: leadingSpaces + full.length };
  }

  // Pattern 3: "X Y" or "X Y-Z" (two space-separated numbers)
  const twoNumMatch = trimmed.match(/^(\d{1,3})\s+(\d{1,3})(?:\s*-\s*(\d+))?/);
  if (twoNumMatch) {
    const [full, ch, v, vEnd] = twoNumMatch;
    const ref = vEnd ? `${book} ${ch}:${v}-${vEnd}` : `${book} ${ch}:${v}`;
    return { ref, length: leadingSpaces + full.length };
  }

  // Pattern 3b: "X [in] verse(s) Y" — spoken separator between chapter and verse.
  // Handles: "Numbers 12 in verse 6", "Psalm 139 in verse one", "Exodus 33 verse 14".
  // Must be checked before Pattern 4 to prevent the digit-only fallback from
  // misreading the chapter number (e.g. "12" → 1:2 via splitDigitsValidated).
  const inVerseMatch = trimmed.match(/^(\d+)\s+(?:in\s+)?verses?\s+/i);
  if (inVerseMatch) {
    const ch = parseInt(inVerseMatch[1], 10);
    const afterVerse = trimmed.slice(inVerseMatch[0].length);
    // Try digit verse
    const digitVerse = afterVerse.match(/^(\d+)/);
    if (digitVerse) {
      const v = parseInt(digitVerse[1], 10);
      if (isValidReference(book, ch, v)) {
        return { ref: `${book} ${ch}:${v}`, length: leadingSpaces + inVerseMatch[0].length + digitVerse[0].length };
      }
    }
    // Try word-number verse (e.g. "verse one", "verse twenty one")
    const verseTokens = afterVerse.replace(/-/g, ' ').split(/\s+/).map((w) => w.toLowerCase());
    const vParsed = parseOneWordNumber(verseTokens);
    if (vParsed && isValidReference(book, ch, vParsed.value)) {
      const verseConsumed = afterVerse.split(/\s+/).slice(0, vParsed.wordCount).join(' ');
      return { ref: `${book} ${ch}:${vParsed.value}`, length: leadingSpaces + inVerseMatch[0].length + verseConsumed.length };
    }
  }

  // Pattern 4: "NNN" (digits together, no colon, no space)
  const digitsMatch = trimmed.match(/^(\d{2,})/);
  if (digitsMatch) {
    const [full, digits] = digitsMatch;
    const validated = splitDigitsValidated(book, digits);
    if (validated) {
      return { ref: validated, length: leadingSpaces + full.length };
    }
  }

  // Pattern 5: spoken English number words (e.g. "eleven twenty one", "three sixteen").
  // Normalise hyphens ("twenty-one") to spaces, then tokenise.
  const wordTokens = trimmed.replace(/-/g, ' ').split(/\s+/).map((w) => w.toLowerCase());
  const chParsed = parseOneWordNumber(wordTokens);
  if (chParsed) {
    const restTokens = wordTokens.slice(chParsed.wordCount);
    const vParsed = parseOneWordNumber(restTokens);
    if (vParsed && isValidReference(book, chParsed.value, vParsed.value)) {
      const consumedWordCount = chParsed.wordCount + vParsed.wordCount;
      // Reconstruct the consumed substring from the original (un-lowercased) trimmed text
      // by joining the same number of whitespace-separated tokens.
      const originalTokens = trimmed.split(/\s+/);
      const consumedText = originalTokens.slice(0, consumedWordCount).join(' ');
      return { ref: `${book} ${chParsed.value}:${vParsed.value}`, length: leadingSpaces + consumedText.length };
    }
  }

  return null;
}

/**
 * Split text into parts, identifying Bible references.
 * Uses a two-phase approach: find book names, then parse what follows.
 */
export function parseBibleReferences(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Try to find a book name at or after current position
    let found = false;
    for (let i = pos; i < text.length; i++) {
      const book = findBookAt(text, i);
      if (!book) continue;

      // Try to parse a reference after the book name
      const afterBook = text.slice(i + book.length);
      const result = parseRefAfterBook(book, afterBook);
      if (!result) continue;

      // Add text before this reference
      if (i > pos) {
        const before = text.slice(pos, i).trim();
        if (before) {
          parts.push({ text: before, isReference: false });
        }
      }

      // Add the reference
      parts.push({ text: result.ref, isReference: true });
      pos = i + book.length + result.length;
      found = true;
      break;
    }

    if (!found) {
      // No more references found
      const remaining = text.slice(pos).trim();
      if (remaining) {
        parts.push({ text: remaining, isReference: false });
      }
      break;
    }
  }

  if (parts.length === 0) {
    parts.push({ text, isReference: false });
  }

  return parts;
}
