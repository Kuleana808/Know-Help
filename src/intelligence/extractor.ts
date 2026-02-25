import Anthropic from "@anthropic-ai/sdk";

export interface Signal {
  relevant: boolean;
  confidence: number;
  signal_type:
    | "competitor_move"
    | "market_trend"
    | "customer_pain"
    | "opportunity"
    | "risk"
    | "other";
  summary: string;
  action: string;
  file_target: string;
  append_content: string;
  source_url: string;
  source_date: string;
}

export interface ExtractionInput {
  venture_name: string;
  venture_topics: string[];
  content: string;
  source_url: string;
  source_date: string;
}

const SYSTEM_PROMPT = `You are a signal extractor for a personal AI knowledge base.
Given a piece of content (tweet, Reddit post, article), extract actionable intelligence.
Respond only with valid JSON. No explanation.`;

function buildUserPrompt(input: ExtractionInput): string {
  return `Venture: ${input.venture_name}
Topics: ${input.venture_topics.join(", ")}
Content: ${input.content}

Extract signal. Return:
{
  "relevant": true/false,
  "confidence": 0.0-1.0,
  "signal_type": "competitor_move|market_trend|customer_pain|opportunity|risk|other",
  "summary": "one sentence",
  "action": "what the founder should consider doing",
  "file_target": "venture/${input.venture_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md",
  "append_content": "the exact markdown to append to the file",
  "source_url": "${input.source_url}",
  "source_date": "${input.source_date}"
}`;
}

/**
 * Extract a signal from content using Claude API.
 */
export async function extractSignal(
  input: ExtractionInput
): Promise<Signal | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildUserPrompt(input),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return null;
    }

    const signal: Signal = JSON.parse(textBlock.text);
    return signal;
  } catch (err: any) {
    console.error(`Signal extraction error: ${err.message}`);
    return null;
  }
}
