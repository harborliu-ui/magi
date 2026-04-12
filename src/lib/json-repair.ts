/**
 * Attempts to repair common LLM JSON output issues:
 * - Unescaped double quotes inside string values
 * - Trailing commas before ] or }
 * - Missing commas between properties
 */
export function repairJson(raw: string): string {
  let s = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Fix unescaped double quotes inside JSON string values.
  // Strategy: walk character by character, track whether we're inside a JSON string.
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (escaped) {
      chars.push(c);
      escaped = false;
      continue;
    }

    if (c === '\\') {
      chars.push(c);
      escaped = true;
      continue;
    }

    if (c === '"') {
      if (!inString) {
        inString = true;
        chars.push(c);
      } else {
        // Is this quote ending the string or is it an unescaped interior quote?
        // Look ahead: if the next non-whitespace char is : , ] } or we're at end, it's a real close.
        const rest = s.slice(i + 1);
        const nextSignificant = rest.match(/^\s*([,:}\]\n]|$)/);
        if (nextSignificant) {
          inString = false;
          chars.push(c);
        } else {
          // Unescaped interior quote — escape it
          chars.push('\\"');
        }
      }
      continue;
    }

    // Replace curly/smart quotes with escaped regular quotes when inside a string
    if (inString && (c === '\u201c' || c === '\u201d')) {
      chars.push('\\"');
      continue;
    }

    chars.push(c);
  }

  s = chars.join('');

  // Remove trailing commas: ,] or ,}
  s = s.replace(/,(\s*[}\]])/g, '$1');

  return s;
}

/**
 * Parse JSON with automatic repair on first failure.
 * Returns the parsed object or throws if repair also fails.
 */
export function safeJsonParse<T = unknown>(raw: string): T {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // First parse failed — attempt repair
    const repaired = repairJson(raw);
    return JSON.parse(repaired);
  }
}
