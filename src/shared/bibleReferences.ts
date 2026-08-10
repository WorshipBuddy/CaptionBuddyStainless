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

interface Token {
  /** Lower-cased, with trailing sentence punctuation stripped, for matching. */
  word: string;
  /** Offset of the token's last character + 1, in the string it was tokenised from. */
  end: number;
}

/**
 * Split text into whitespace-separated tokens, recording where each one ends so
 * the caller can report exactly how many characters a match consumed.
 *
 * Hyphens between letters ("twenty-one") are treated as word separators. The
 * substitution is 1:1 on characters, so offsets still refer to the original text.
 * Hyphens between digits are left alone — they mean a range ("38-40").
 */
function tokenize(text: string): Token[] {
  const normalized = text.replace(/(?<=[A-Za-z])-(?=[A-Za-z])/g, ' ');
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    tokens.push({
      word: m[0].toLowerCase().replace(/[.,;:!?]+$/, ''),
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

/**
 * Read one chapter or verse number starting at `i`, accepting either digits
 * ("24") or spoken English number words ("twenty four").
 */
function parseNumberAt(tokens: Token[], i: number): { value: number; consumed: number } | null {
  if (i >= tokens.length) return null;

  if (/^\d+$/.test(tokens[i].word)) {
    return { value: parseInt(tokens[i].word, 10), consumed: 1 };
  }

  const words = tokens.slice(i).map((t) => t.word);
  const parsed = parseOneWordNumber(words);
  return parsed ? { value: parsed.value, consumed: parsed.wordCount } : null;
}

/** Matches the spoken separators that can sit between a chapter and its verse. */
function skipVerseKeyword(tokens: Token[], i: number): { next: number; explicit: boolean } {
  let j = i;
  if (j < tokens.length && tokens[j].word === 'in') j++;
  if (j < tokens.length && /^verses?$/.test(tokens[j].word)) {
    return { next: j + 1, explicit: true };
  }
  return { next: i, explicit: false };
}

/**
 * Parse the reference portion after a book name.
 * Returns { ref: normalized string, length: chars consumed } or null.
 */
function parseRefAfterBook(book: string, text: string): { ref: string; length: number } | null {
  const trimmed = text.trimStart();
  const leadingSpaces = text.length - trimmed.length;
  if (leadingSpaces === 0) return null; // no space after book name

  // Colon format is unambiguous, so it wins outright:
  // "X:Y", "X:Y-Z", "X:Y-Z:W"
  const colonMatch = trimmed.match(/^(\d+):(\d+)(?:\s*-\s*(\d+)(?::(\d+))?)?/);
  if (colonMatch) {
    const [full] = colonMatch;
    return { ref: `${book} ${full}`, length: leadingSpaces + full.length };
  }

  // Spoken forms, digits and number words handled alike:
  //   [chapter] <ch> [[in] verse[s]] <v> [(through|to|-) <vEnd>]
  // Covers "3 16", "chapter 3 verse 16", "twenty four verse eleven",
  // "one hundred nineteen verse one", "chapter 2 verses 38 through 40".
  const tokens = tokenize(trimmed);
  if (tokens.length >= 2) {
    let i = 0;
    let explicit = false;

    if (tokens[i].word === 'chapter') {
      i++;
      explicit = true;
    }

    const chapter = parseNumberAt(tokens, i);
    if (chapter) {
      i += chapter.consumed;

      const skipped = skipVerseKeyword(tokens, i);
      i = skipped.next;
      explicit = explicit || skipped.explicit;

      // The verse may carry its range in the same token ("38-40"), since a
      // hyphen between digits is not treated as a word separator.
      let verse = parseNumberAt(tokens, i);
      let attachedRangeEnd: number | null = null;
      if (!verse && i < tokens.length) {
        const joined = tokens[i].word.match(/^(\d+)-(\d+)$/);
        if (joined) {
          verse = { value: parseInt(joined[1], 10), consumed: 1 };
          attachedRangeEnd = parseInt(joined[2], 10);
        }
      }

      if (verse) {
        i += verse.consumed;
        let end = tokens[i - 1].end;
        let ref = `${book} ${chapter.value}:${verse.value}`;

        if (attachedRangeEnd !== null && attachedRangeEnd > verse.value) {
          ref = `${book} ${chapter.value}:${verse.value}-${attachedRangeEnd}`;
        } else if (i < tokens.length && /^(through|to|-)$/.test(tokens[i].word)) {
          // Range written as separate tokens: "through 40", "to 40", "- 40"
          const verseEnd = parseNumberAt(tokens, i + 1);
          if (verseEnd && verseEnd.value > verse.value) {
            i += 1 + verseEnd.consumed;
            end = tokens[i - 1].end;
            ref = `${book} ${chapter.value}:${verse.value}-${verseEnd.value}`;
          }
        }

        // An explicit "chapter"/"verse" keyword means the speaker told us the
        // structure, so take it at face value. A bare "Genesis 1 5" is only a
        // reference if the numbers actually exist — otherwise it is ordinary
        // speech that happens to follow a book name.
        if (explicit || isValidReference(book, chapter.value, verse.value)) {
          return { ref, length: leadingSpaces + end };
        }
      }
    }
  }

  // Run-together digits with no separator at all: "316" → 3:16.
  const digitsMatch = trimmed.match(/^(\d{2,})/);
  if (digitsMatch) {
    const [full, digits] = digitsMatch;
    const validated = splitDigitsValidated(book, digits);
    if (validated) {
      return { ref: validated, length: leadingSpaces + full.length };
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
