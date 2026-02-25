/**
 * PII detection and scrubbing (Prompt 16).
 * Uses regex-based detection (Presidio integration optional via env).
 */

export interface PIIResult {
  hasPII: boolean;
  entities: PIIEntity[];
  redactedText: string;
  flaggedTypes: string[];
  hasHardBlock: boolean;
}

export interface PIIEntity {
  entity_type: string;
  start: number;
  end: number;
  score: number;
  text: string;
}

// Hard blocks — never allow in published files
const HARD_BLOCK_PATTERNS: Array<{ type: string; pattern: RegExp; score: number }> = [
  { type: "US_SSN", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, score: 0.95 },
  { type: "CREDIT_CARD", pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, score: 0.9 },
  { type: "US_BANK_NUMBER", pattern: /\b\d{8,17}\b/g, score: 0.4 }, // Low score — needs context
  { type: "CREDENTIAL", pattern: /\b(?:password|passwd|secret|api[_-]?key|token|credential)[\s:=]+\S+/gi, score: 0.85 },
];

// Soft flags — redact but allow creator to override
const SOFT_FLAG_PATTERNS: Array<{ type: string; pattern: RegExp; score: number }> = [
  { type: "EMAIL_ADDRESS", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, score: 0.9 },
  { type: "PHONE_NUMBER", pattern: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, score: 0.75 },
  { type: "IP_ADDRESS", pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, score: 0.8 },
];

const HARD_BLOCK_TYPES = ["US_SSN", "CREDIT_CARD", "CREDENTIAL", "US_BANK_NUMBER"];

/**
 * Quick PII check using regex — runs before full scan for speed.
 */
export function quickPIICheck(text: string): boolean {
  for (const { pattern } of [...HARD_BLOCK_PATTERNS, ...SOFT_FLAG_PATTERNS]) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) return true;
  }
  return false;
}

/**
 * Full PII scan — regex-based (no external service dependency).
 * Falls back to Presidio if PRESIDIO_ANALYZER_URL is set.
 */
export async function scanForPII(text: string): Promise<PIIResult> {
  const presidioUrl = process.env.PRESIDIO_ANALYZER_URL;

  if (presidioUrl) {
    return scanWithPresidio(text, presidioUrl);
  }

  return scanWithRegex(text);
}

function scanWithRegex(text: string): PIIResult {
  const entities: PIIEntity[] = [];
  let redactedText = text;

  // Check hard blocks
  for (const { type, pattern, score } of HARD_BLOCK_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Skip low-score bank numbers unless they're clearly account numbers
      if (type === "US_BANK_NUMBER" && score < 0.5) continue;

      entities.push({
        entity_type: type,
        start: match.index,
        end: match.index + match[0].length,
        score,
        text: match[0],
      });
    }
  }

  // Check soft flags
  for (const { type, pattern, score } of SOFT_FLAG_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      entities.push({
        entity_type: type,
        start: match.index,
        end: match.index + match[0].length,
        score,
        text: match[0],
      });
    }
  }

  if (entities.length === 0) {
    return { hasPII: false, entities: [], redactedText: text, flaggedTypes: [], hasHardBlock: false };
  }

  // Redact — sort by position descending to preserve indices
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  for (const entity of sorted) {
    const replacement = `[${entity.entity_type.toLowerCase()}]`;
    redactedText = redactedText.slice(0, entity.start) + replacement + redactedText.slice(entity.end);
  }

  const flaggedTypes = [...new Set(entities.map((e) => e.entity_type))];
  const hasHardBlock = entities.some((e) => HARD_BLOCK_TYPES.includes(e.entity_type));

  return {
    hasPII: true,
    entities,
    redactedText,
    flaggedTypes,
    hasHardBlock,
  };
}

async function scanWithPresidio(text: string, analyzerUrl: string): Promise<PIIResult> {
  try {
    const anonymizerUrl = process.env.PRESIDIO_ANONYMIZER_URL || analyzerUrl.replace("analyzer", "anonymizer");

    const analyzeResponse = await fetch(`${analyzerUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        language: "en",
        score_threshold: 0.7,
      }),
    });

    const presEntities = (await analyzeResponse.json()) as any[];

    if (presEntities.length === 0) {
      return { hasPII: false, entities: [], redactedText: text, flaggedTypes: [], hasHardBlock: false };
    }

    const entities: PIIEntity[] = presEntities.map((e: any) => ({
      entity_type: e.entity_type,
      start: e.start,
      end: e.end,
      score: e.score,
      text: text.slice(e.start, e.end),
    }));

    // Anonymize
    const anonymizeResponse = await fetch(`${anonymizerUrl}/anonymize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        anonymizers: {
          DEFAULT: { type: "replace", new_value: "[REDACTED]" },
          PERSON: { type: "replace", new_value: "[person]" },
          EMAIL_ADDRESS: { type: "replace", new_value: "[email]" },
          PHONE_NUMBER: { type: "replace", new_value: "[phone]" },
          LOCATION: { type: "replace", new_value: "[location]" },
          DATE_TIME: { type: "keep" },
          URL: { type: "replace", new_value: "[url]" },
        },
        analyzer_results: presEntities,
      }),
    });

    const { text: redactedText } = (await anonymizeResponse.json()) as any;
    const flaggedTypes = [...new Set(entities.map((e) => e.entity_type))];
    const hasHardBlock = entities.some((e) => HARD_BLOCK_TYPES.includes(e.entity_type));

    return { hasPII: true, entities, redactedText, flaggedTypes, hasHardBlock };
  } catch (err) {
    console.error("Presidio scan failed, falling back to regex:", err);
    return scanWithRegex(text);
  }
}
