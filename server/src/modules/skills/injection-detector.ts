/**
 * Detects common prompt injection patterns in skill body Markdown.
 * Checks for patterns that could allow adversarial code injection into
 * agent instructions or image encoding attacks.
 */

/**
 * Common injection patterns to detect:
 * - Prompt injection directives (ignore previous, override, system prompt)
 * - Image encoding (base64, data URIs that could be rendered)
 * - Suspicious embedding/escaping techniques
 * - Control sequences and template injection
 */
const INJECTION_PATTERNS = [
  // Prompt injection attempts. `\s+` already tolerates any run of whitespace
  // (multiple spaces, tabs, newlines) between words — the direction word
  // (previous/above/prior/earlier) is what must be enumerated explicitly.
  /ignore\s+(?:all\s+)?(?:previous|above|prior|earlier)\s+(?:instructions|prompts?|directions?)/i,
  /(?:forget|disregard|override)\s+(?:all\s+)?(?:previous|above|prior|earlier)?\s*(?:instructions|context|rules)/i,
  /your\s+new\s+(?:instructions?|system\s+prompt|directive|role)/i,
  /you\s+are\s+now/i,
  /respond\s+(?:only\s+)?(?:with|as|like)\s+(?:a|an|the)\s+(?:system|admin)/i,
  /(?:end|finished?\s+with)\s+(?:skill|rule|instruction)s?/i,

  // Image encoding and data URIs
  /data:image\/(?:png|jpg|jpeg|gif|svg\+xml)/i,
  /base64[,:\s]*(?:\w+\/\w+)?[,:\s]*[A-Za-z0-9+/=]{20,}/,
  /\[!\[.*?\]\(data:/i, // Markdown image with data URI

  // Template injection and code injection
  /\${.*?}/,  // Template literals/injection
  /\{\{.*?\}\}/,  // Handlebars/Jinja-like templates
  /<%[\s\S]*?%>/,  // ERB/JSP tags
  /\[\[.*?\]\]/,  // Wiki/Obsidian style commands

  // Control characters and escape sequences
  /\\x[0-9a-fA-F]{2}/,  // Hex escape
  /\\u[0-9a-fA-F]{4}/,  // Unicode escape
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/,  // Control characters

  // Suspicious command patterns
  /(?:execute|eval|system|shell|bash|sh\s+\()/i,
  /(?:load|import|require|include)\s+.*(?:script|module|code)/i,
  /(?:fetch|curl|wget|download)\s+(?:from|url)/i,

  // Markdown/HTML injection
  /<script[\s\S]*?<\/script>/i,
  /javascript:/i,
  /on(?:load|error|click|mouse\w+)=/i,
  /<iframe/i,
  /<object\b/i,
  /<embed\b/i,

  // Base64 data that looks like encoded instructions
  /base64[:\s]*[A-Za-z0-9+/=]{100,}/,

  // Suspicious prompt markers
  /###?\s*(?:System|Admin|Root|Hidden|Secret)\s*(?:Instructions?|Prompt|Commands?)/i,
  /(?:<!--.*?-->).*?(?:SYSTEM|ADMIN|SECRET|HIDDEN)/i,  // Hidden HTML comments
];

export function detectInjection(body: string): {
  isDangerous: boolean;
  patterns: string[];
} {
  const patterns: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(body)) {
      // Extract a readable pattern description
      const desc = pattern.source.substring(0, 50);
      if (!patterns.includes(desc)) {
        patterns.push(desc);
      }
      // Early exit after finding 5 patterns to avoid excessive overhead
      if (patterns.length >= 5) break;
    }
  }

  return {
    isDangerous: patterns.length > 0,
    patterns,
  };
}
