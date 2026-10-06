// Shared JSON repair for AI responses (main assessment, SORA reassessment, SORA profile extraction).

/** Replace mismatched closing brackets (e.g. an array closed with `}`) and close unterminated ones. */
const balanceBrackets = (s: string): string => {
  const out: string[] = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      out.push(ch);
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; out.push(ch); continue; }
    if (ch === '{' || ch === '[') { stack.push(ch === '{' ? '}' : ']'); out.push(ch); continue; }
    if (ch === '}' || ch === ']') {
      const expected = stack.pop();
      out.push(expected ?? ch);
      continue;
    }
    out.push(ch);
  }
  if (inString) out.push('"');
  while (stack.length) out.push(stack.pop()!);
  return out.join('');
};

const clean = (s: string) => s
  .replace(/,\s*}/g, '}')
  .replace(/,\s*]/g, ']')
  .replace(/[\x00-\x1F\x7F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? ' ' : ''));

export const parseAiJson = (raw: string, finishReason?: string | null): any => {
  const content = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end > start) {
      const candidate = clean(content.substring(start, end + 1));
      try {
        return JSON.parse(candidate);
      } catch {
        try {
          return JSON.parse(clean(balanceBrackets(candidate)));
        } catch {
          // fall through
        }
      }
    }
    console.error('Failed to parse AI response (finish_reason=' + finishReason + '):', content.slice(0, 2000));
    throw new Error('Invalid AI response format' + (finishReason === 'length' ? ' (truncated)' : ''));
  }
};
