import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import { s3Ops, initUserKnowledge } from "./s3";
import { slugify } from "../utils/paths";

const router = Router();

// ── User provisioning (called on first sign-in) ────────────────────────────

export async function provisionUser(email: string): Promise<{
  userId: string;
  isNew: boolean;
}> {
  const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (existing) {
    return { userId: existing.id, isNew: false };
  }

  const userId = uuidv4();
  const s3Prefix = `users/${userId}/knowledge`;
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO users (id, email, subscription_status, subscription_tier, trial_ends_at, s3_prefix, created_at)
     VALUES (?, ?, 'trialing', 'pro', ?, ?, ?)`
  ).run(userId, email, trialEnds, s3Prefix, new Date().toISOString());

  // Initialize knowledge scaffold in S3/local storage
  await initUserKnowledge(s3Prefix);

  return { userId, isNew: true };
}

// ── Onboarding wizard endpoints ─────────────────────────────────────────────

// Step 1: Identity
router.post("/onboarding/identity", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const user = db.prepare("SELECT s3_prefix FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const { name, role, location, timezone } = req.body;
  const dateStr = new Date().toISOString().split("T")[0];

  const content = `---
Load for: identity, about me, who am I, background, bio, introduction, founder
Last updated: ${dateStr}
---

# Identity

- **Name:** ${name || "[Your name]"}
- **Role:** ${role || "[Your role]"}
- **Location:** ${location || "[Your location]"}
- **Timezone:** ${timezone || ""}

## Background

[Add your background here]

## Current priorities

1. [Priority 1]
2. [Priority 2]
3. [Priority 3]
`;

  await s3Ops.write(user.s3_prefix, "core/identity.md", content);
  res.json({ success: true });
});

// Step 2: Ventures
router.post("/onboarding/ventures", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const user = db.prepare("SELECT s3_prefix FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const { ventures } = req.body; // [{name, description}]
  if (!Array.isArray(ventures)) return res.status(400).json({ error: "ventures array required" });

  const dateStr = new Date().toISOString().split("T")[0];

  for (const venture of ventures.slice(0, 3)) {
    const slug = slugify(venture.name);
    const content = `---
Load for: ${slug}, venture, startup, business
Last updated: ${dateStr}
---

# ${venture.name}

## Overview

${venture.description || "[Add description]"}

## Status

- Stage: [Pre-revenue / Early revenue / Growth]

## Key Metrics

| Metric | Current | Target |
|--------|---------|--------|
| MRR | $0 | |
| Customers | 0 | |
`;

    await s3Ops.write(user.s3_prefix, `venture/${slug}.md`, content);
  }

  res.json({ success: true });
});

// Step 3: Contacts
router.post("/onboarding/contacts", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const user = db.prepare("SELECT s3_prefix FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const { contacts } = req.body; // [{name, role, context}]
  if (!Array.isArray(contacts)) return res.status(400).json({ error: "contacts array required" });

  for (const contact of contacts.slice(0, 5)) {
    const slug = slugify(contact.name);
    const schema = JSON.stringify({
      _schema: "contact",
      _version: "1.0",
      _description: `Interaction log for ${contact.name}`,
    });
    const entry = JSON.stringify({
      date: new Date().toISOString(),
      name: contact.name,
      notes: `${contact.role || ""}. ${contact.context || ""}`.trim(),
    });

    await s3Ops.write(
      user.s3_prefix,
      `network/${slug}.jsonl`,
      schema + "\n" + entry + "\n"
    );
  }

  res.json({ success: true });
});

// Step 4: Intelligence config
router.post("/onboarding/intelligence", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const user = db.prepare("SELECT s3_prefix FROM users WHERE id = ?").get(userId) as any;
  if (!user) return res.status(404).json({ error: "User not found" });

  const { sources, rss_feeds } = req.body;

  const config = {
    owner: {},
    ventures: [],
    custom_topics: [],
    crawl_schedule: "every_6_hours",
    confidence_threshold: 0.7,
    sources: {
      twitter: { enabled: sources?.twitter || false, min_engagement: 50 },
      reddit: { enabled: sources?.reddit || false, min_upvotes: 50 },
      linkedin: { enabled: sources?.linkedin || false, min_engagement: 20 },
      tiktok: { enabled: sources?.tiktok || false, min_views: 500 },
      rss: { enabled: sources?.rss || false, feeds: rss_feeds || [] },
    },
  };

  // Store config at user's prefix level (not inside knowledge/)
  await s3Ops.write(user.s3_prefix, "../knowledge.config.json", JSON.stringify(config, null, 2));
  res.json({ success: true });
});

// Step 5: MCP connection info
router.get("/onboarding/mcp-config", (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) return res.status(401).json({ error: "Auth required" });

  const mcpUrl = `wss://mcp.know.help/user/${userId}`;
  const config = {
    mcpServers: {
      "know-help": {
        command: "npx",
        args: ["-y", "@anthropic-ai/mcp-remote", mcpUrl],
      },
    },
  };

  res.json({
    mcp_url: mcpUrl,
    claude_desktop_config: config,
    instructions: "Add this to your Claude Desktop config file (~/.config/claude/claude_desktop_config.json)",
  });
});

export default router;
