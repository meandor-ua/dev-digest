/**
 * Detects common prompt injection patterns in skill body Markdown.
 * Checks for patterns that could allow adversarial code injection into
 * agent instructions or image encoding attacks.
 *
 * Two groups, scanned differently:
 * - DIRECTIVE_PATTERNS target the LLM itself (instruction overrides, hidden
 *   markers, control characters, encoded payloads) and are scanned over the
 *   WHOLE body — a directive inside a code fence still reaches the model.
 * - CODE_SHAPED_PATTERNS (templates, escapes, eval calls, HTML) are only
 *   suspicious as prose, so they're scanned with fenced blocks and inline code
 *   spans removed. Skill bodies are joined into the reviewer prompt verbatim
 *   (reviewer-core/src/prompt.ts) with no template interpolation, so a
 *   `${x}` or `onClick=` inside a code sample is inert — and convention-drafted
 *   skills embed real code snippets that would otherwise always trip these.
 *
 * Every pattern is word-bounded: an unbounded /system/ flags "type system",
 * and a flagged skill is force-disabled and unlinked from its agents.
 */

interface InjectionPattern {
  label: string;
  re: RegExp;
}

const DIRECTIVE_PATTERNS: InjectionPattern[] = [
  // Prompt injection attempts. `\s+` already tolerates any run of whitespace
  // (multiple spaces, tabs, newlines) between words — the direction word
  // (previous/above/prior/earlier) is what must be enumerated explicitly.
  {
    label: 'ignore previous instructions',
    re: /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|above|prior|earlier)\s+(?:instructions|prompts?|directions?)\b/i,
  },
  {
    label: 'disregard previous instructions',
    re: /\b(?:forget|disregard)\s+(?:all\s+)?(?:the\s+)?(?:(?:previous|above|prior|earlier)\s+)?(?:instructions|context|rules)\b/i,
  },
  {
    label: 'override previous instructions',
    re: /\boverride\s+(?:all\s+)?(?:the\s+)?(?:previous|above|prior|earlier)\s+(?:instructions|context|rules)\b/i,
  },
  {
    label: 'role reassignment',
    re: /\byour\s+new\s+(?:instructions?|system\s+prompt|directive|role)\b/i,
  },
  { label: 'role reassignment', re: /\byou\s+are\s+now\b/i },
  {
    label: 'impersonate system',
    re: /\brespond\s+(?:only\s+)?(?:with|as|like)\s+(?:a|an|the)\s+(?:system|admin)\b/i,
  },
  {
    label: 'fake end-of-instructions marker',
    re: /\b(?:end|finished?\s+with)\s+(?:of\s+)?(?:the\s+)?(?:skill|rules?|instructions?)\b/i,
  },
  {
    label: 'hidden system prompt heading',
    re: /###?\s*(?:System|Admin|Root|Hidden|Secret)\s*(?:Instructions?|Prompt|Commands?)\b/i,
  },
  {
    label: 'hidden HTML comment directive',
    re: /<!--[\s\S]*?(?:SYSTEM|ADMIN|SECRET|HIDDEN)[\s\S]*?-->/,
  },

  // Control characters
  { label: 'control characters', re: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/ },

  // Image encoding, data URIs, encoded payloads
  { label: 'data URI image', re: /data:image\/(?:png|jpg|jpeg|gif|svg\+xml)/i },
  { label: 'markdown image with data URI', re: /\[!\[.*?\]\(data:/i },
  { label: 'base64 payload', re: /\bbase64[,:\s]*(?:\w+\/\w+)?[,:\s]*[A-Za-z0-9+/=]{40,}/ },
];

const CODE_SHAPED_PATTERNS: InjectionPattern[] = [
  // Template injection
  { label: 'template placeholder', re: /\$\{[^}\n]*\}/ },
  { label: 'template placeholder', re: /\{\{[^}\n]*\}\}/ },
  { label: 'template placeholder', re: /<%[\s\S]*?%>/ },
  { label: 'wiki-style command', re: /\[\[[^\]\n]*\]\]/ },

  // Escape sequences
  { label: 'escape sequence', re: /\\x[0-9a-fA-F]{2}/ },
  { label: 'escape sequence', re: /\\u[0-9a-fA-F]{4}/ },

  // Suspicious command patterns
  { label: 'code execution call', re: /\b(?:eval|exec|execSync|spawn|system|popen)\s*\(/ },
  {
    label: 'shell command directive',
    re: /\b(?:execute|run)\s+(?:the\s+following\s+|this\s+)?(?:shell|bash|terminal)\s+commands?\b/i,
  },
  {
    label: 'remote script load',
    re: /\b(?:load|import|require|include)\s+(?:and\s+(?:run|execute)\s+)?(?:a\s+|the\s+|this\s+)?(?:remote|external)\s+(?:script|module|code)\b/i,
  },
  { label: 'remote download', re: /\b(?:curl|wget)\s+(?:-\S+\s+)*https?:\/\//i },
  { label: 'remote download', re: /\b(?:fetch|download)\s+(?:and\s+(?:run|execute)\b|from\s+https?:\/\/)/i },

  // Markdown/HTML injection
  { label: 'script tag', re: /<script\b/i },
  { label: 'javascript: URL', re: /\bjavascript:/i },
  { label: 'inline event handler', re: /\bon(?:load|error|click|mouse\w+)\s*=\s*["']/i },
  { label: 'embedded frame', re: /<(?:iframe|object|embed)\b/i },
];

/**
 * Fenced blocks and inline code spans. A fence opens at line start and closes
 * only on a line holding the same fence, so a ```` fence wrapping a snippet
 * that itself contains ``` (conventions/helpers.ts fenceFor) stays one block;
 * an unclosed fence runs to EOF, as in Markdown.
 */
const FENCED_CODE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^[ \t]*\1[ \t]*$|(?![\s\S]))/gm;
const INLINE_CODE = /`[^`\n]*`/g;

function stripCode(body: string): string {
  return body.replace(FENCED_CODE, ' ').replace(INLINE_CODE, ' ');
}

export function detectInjection(body: string): {
  isDangerous: boolean;
  /** Human-readable labels of the matched pattern groups, deduped. */
  reasons: string[];
} {
  const reasons = new Set<string>();
  const prose = stripCode(body);

  for (const { label, re } of DIRECTIVE_PATTERNS) {
    if (re.test(body)) reasons.add(label);
  }
  for (const { label, re } of CODE_SHAPED_PATTERNS) {
    if (re.test(prose)) reasons.add(label);
  }

  return { isDangerous: reasons.size > 0, reasons: [...reasons] };
}
