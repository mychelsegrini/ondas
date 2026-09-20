const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Rewrites spoken number words into digits: "minus twenty five" -> "-25". */
export function digitsFromWords(input: string): string {
  const tokens = input.split(/\s+/);
  const output: string[] = [];
  let pending: number | null = null;
  let negative = false;

  const flush = () => {
    if (pending !== null) {
      output.push(String(negative ? -pending : pending));
      pending = null;
      negative = false;
    } else if (negative) {
      output.push("-");
      negative = false;
    }
  };

  for (const token of tokens) {
    if (token === "minus" || token === "negative") {
      flush();
      negative = true;
      continue;
    }
    if (token in TENS) {
      pending = (pending ?? 0) + TENS[token];
      continue;
    }
    if (token in UNITS) {
      // "twenty five" composes, "five five" does not.
      pending = pending !== null && pending % 10 === 0 && pending >= 20 ? pending + UNITS[token] : UNITS[token];
      continue;
    }
    if (token === "hundred" && pending !== null) {
      pending *= 100;
      continue;
    }
    flush();
    output.push(token);
  }
  flush();
  return output.join(" ");
}

/** Extracts the first signed decimal number from a phrase, words included. */
export function parseSpokenNumber(input: string): number | null {
  const normalized = digitsFromWords(input.toLowerCase())
    .replace(/\bpoint\b/g, ".")
    .replace(/\s*\.\s*/g, ".")
    .replace(/-\s+/g, "-");

  if (/\bpi\b/.test(normalized)) {
    const signed = /-\s*pi\b/.test(normalized) ? -Math.PI : Math.PI;
    const multiplier = normalized.match(/(-?\d+(?:\.\d+)?)\s*(?:times\s*)?pi\b/);
    return multiplier ? Number(multiplier[1]) * Math.PI : signed;
  }

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}
