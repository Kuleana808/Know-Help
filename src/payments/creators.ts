import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";
import { stripe } from "./checkout";
import { appendJsonl } from "../utils/jsonl";
import * as path from "path";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const PAYOUTS_LOG = path.join(DATA_DIR, "payouts.jsonl");
const BASE_URL = process.env.BASE_URL || "https://know.help";

export async function onboardCreator(
  req: Request,
  res: Response
): Promise<void> {
  const { email, handle } = req.body;

  if (!email || !handle) {
    res.status(400).json({ error: "Email and handle are required" });
    return;
  }

  // Check if creator already exists
  const existing = db
    .prepare("SELECT * FROM creators WHERE handle = ? OR email = ?")
    .get(handle, email) as any;

  if (existing?.onboarded) {
    res.status(409).json({ error: "Creator already onboarded" });
    return;
  }

  try {
    // Create Stripe Connect Express account
    const account = await stripe.accounts.create({
      type: "express",
      email,
      metadata: { handle },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Insert or update creator record
    if (existing) {
      db.prepare(
        "UPDATE creators SET stripe_account_id = ?, email = ? WHERE handle = ?"
      ).run(account.id, email, handle);
    } else {
      db.prepare(
        "INSERT INTO creators (handle, email, stripe_account_id, created_at) VALUES (?, ?, ?, ?)"
      ).run(handle, email, account.id, new Date().toISOString());
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${BASE_URL}/portal/onboard?refresh=true`,
      return_url: `${BASE_URL}/portal/dashboard`,
      type: "account_onboarding",
    });

    res.json({ onboarding_url: accountLink.url });
  } catch (err: any) {
    console.error("Creator onboarding error:", err.message);
    res.status(500).json({ error: "Failed to create Stripe account" });
  }
}

export async function getCreatorDashboard(
  req: Request,
  res: Response
): Promise<void> {
  const { handle } = req.params;

  const creator = db
    .prepare("SELECT * FROM creators WHERE handle = ?")
    .get(handle) as any;

  if (!creator) {
    res.status(404).json({ error: "Creator not found" });
    return;
  }

  const purchases = db
    .prepare(
      `SELECT p.pack_id, pk.name as pack_name, COUNT(*) as sales,
              SUM(p.creator_payout_cents) as revenue_cents
       FROM purchases p
       JOIN packs pk ON p.pack_id = pk.id
       WHERE pk.author_handle = ? AND p.status = 'completed'
       GROUP BY p.pack_id`
    )
    .all(handle) as any[];

  const pendingPayout =
    creator.total_earned_cents - creator.total_paid_out_cents;

  res.json({
    handle: creator.handle,
    email: creator.email,
    onboarded: creator.onboarded === 1,
    total_earned_cents: creator.total_earned_cents,
    total_paid_out_cents: creator.total_paid_out_cents,
    pending_payout_cents: pendingPayout,
    purchases_by_pack: purchases,
  });
}

export async function triggerPayouts(
  req: Request,
  res: Response
): Promise<void> {
  // Admin auth check
  const authHeader = req.headers.authorization;
  const adminToken = process.env.ADMIN_BEARER_TOKEN;

  if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const creators = db
    .prepare(
      "SELECT * FROM creators WHERE (total_earned_cents - total_paid_out_cents) >= 1000 AND onboarded = 1"
    )
    .all() as any[];

  const results: any[] = [];

  for (const creator of creators) {
    const pendingAmount =
      creator.total_earned_cents - creator.total_paid_out_cents;

    try {
      const transfer = await stripe.transfers.create({
        amount: pendingAmount,
        currency: "usd",
        destination: creator.stripe_account_id,
        metadata: { creator_handle: creator.handle },
      });

      const payoutId = uuidv4();

      // Get pack IDs for this payout
      const packIds = db
        .prepare(
          `SELECT DISTINCT p.pack_id FROM purchases p
           JOIN packs pk ON p.pack_id = pk.id
           WHERE pk.author_handle = ? AND p.status = 'completed'`
        )
        .all(creator.handle)
        .map((r: any) => r.pack_id)
        .join(",");

      db.prepare(
        `INSERT INTO payouts (id, creator_handle, stripe_transfer_id, amount_cents, pack_ids, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'completed', ?)`
      ).run(
        payoutId,
        creator.handle,
        transfer.id,
        pendingAmount,
        packIds,
        new Date().toISOString()
      );

      db.prepare(
        "UPDATE creators SET total_paid_out_cents = total_paid_out_cents + ? WHERE handle = ?"
      ).run(pendingAmount, creator.handle);

      appendJsonl(PAYOUTS_LOG, {
        date: new Date().toISOString(),
        creator_handle: creator.handle,
        amount_cents: pendingAmount,
        stripe_transfer_id: transfer.id,
        status: "completed",
      });

      results.push({
        creator: creator.handle,
        amount_cents: pendingAmount,
        status: "completed",
      });
    } catch (err: any) {
      results.push({
        creator: creator.handle,
        amount_cents: pendingAmount,
        status: "failed",
        error: err.message,
      });
    }
  }

  res.json({ payouts: results });
}
