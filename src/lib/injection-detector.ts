/**
 * Prompt injection detection (Prompt 16).
 * Detects patterns suggesting injection attempts in user-generated content.
 */

interface InjectionResult {
  detected: boolean;
  patterns: string[];
  confidence: number;
}

const INJECTION_PATTERNS = [
  // Direct override attempts
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi, weight: 1.0 },
  { pattern: /disregard\s+(all\s+)?(previous|prior)\s+(instructions?|prompts?)/gi, weight: 1.0 },
  { pattern: /you\s+are\s+now\s+(in\s+)?developer\s+mode/gi, weight: 1.0 },
  { pattern: /system\s+override/gi, weight: 0.9 },
  { pattern: /new\s+system\s+prompt/gi, weight: 0.9 },
  { pattern: /\[SYSTEM\]|\[INST\]|<\|system\|>|<\|im_start\|>/gi, weight: 0.95 },

  // Role/persona hijacking
  { pattern: /you\s+are\s+(now\s+)?an?\s+(AI\s+)?(assistant|model)\s+that/gi, weight: 0.85 },
  { pattern: /pretend\s+(you\s+are|to\s+be)\s+(an?\s+)?AI/gi, weight: 0.8 },
  { pattern: /act\s+as\s+(if\s+you\s+are\s+)?an?\s+(unaligned|uncensored|unrestricted)/gi, weight: 1.0 },

  // Exfiltration patterns (targeting MCP tool use)
  { pattern: /call\s+(log_activity|update_network|load_context|sync_mindsets)/gi, weight: 1.0 },
  { pattern: /use\s+the\s+(log|network|sync|load)\s+tool/gi, weight: 0.85 },
  { pattern: /send\s+(all\s+)?(files?|data|context|content)\s+to/gi, weight: 0.9 },
  { pattern: /read\s+all\s+files?\s+in/gi, weight: 0.8 },

  // Instruction-like content in knowledge files
  { pattern: /your\s+(real\s+)?instructions\s+are/gi, weight: 0.95 },
  { pattern: /\[IMPORTANT\]|\[HIDDEN\]|<!-- hidden/gi, weight: 0.85 },

  // Obfuscation variants
  { pattern: /ig+n+o+r+e|d1sregard|byp[a4]ss|0verride/gi, weight: 0.8 },
];

/**
 * Detect injection in any text input.
 */
export function detectInjection(text: string): InjectionResult {
  const detected_patterns: string[] = [];
  let max_weight = 0;

  for (const { pattern, weight } of INJECTION_PATTERNS) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detected_patterns.push(pattern.source);
      max_weight = Math.max(max_weight, weight);
    }
  }

  return {
    detected: max_weight >= 0.75,
    patterns: detected_patterns,
    confidence: max_weight,
  };
}

// Patterns specific to Mindset files
const MINDSET_INJECTION_PATTERNS = [
  { pattern: /^when\s+the\s+user/gim, weight: 0.8 },
  { pattern: /^always\s+(respond|say|tell|output)/gim, weight: 0.8 },
  { pattern: /^never\s+(tell|reveal|mention|say)/gim, weight: 0.9 },
  { pattern: /^(ignore|disregard|forget)\s+(previous|prior|all)/gim, weight: 1.0 },
  { pattern: /^\[SYSTEM\]|^\[INST\]/gim, weight: 1.0 },
  { pattern: /^you\s+(must|should|shall|will)\s+(always|never)/gim, weight: 0.75 },
  { pattern: /tool_call|function_call|<tool>|<function>/gi, weight: 0.9 },
];

/**
 * Detect injection in Mindset file content.
 */
export function detectMindsetInjection(fileContent: string): InjectionResult {
  const detected_patterns: string[] = [];
  let max_weight = 0;

  for (const { pattern, weight } of MINDSET_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(fileContent)) {
      detected_patterns.push(pattern.source);
      max_weight = Math.max(max_weight, weight);
    }
  }

  return {
    detected: max_weight >= 0.75,
    patterns: detected_patterns,
    confidence: max_weight,
  };
}
