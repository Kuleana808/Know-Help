import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db/database";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("WARNING: STRIPE_SECRET_KEY not set. Billing endpoints will reject requests.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_not_configured");
const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";
const TEAM_PRICE_ID = process.env.STRIPE_TEAM_PRICE_ID || "";
const BASE_URL = process.env.BASE_URL || "https://know.help";

const router = Router();

// ── Pro subscription ────────────────────────────────────────────────────────

router.post("/billing/subscribe", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  try {
    // Create or get Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
      db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(
        customerId,
        userId
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: `${BASE_URL}/dashboard?subscribed=true`,
      cancel_url: `${BASE_URL}/dashboard`,
    });

    res.json({ checkout_url: session.url });
  } catch (err: any) {
    console.error("Billing error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Team subscription ───────────────────────────────────────────────────────

router.post("/billing/team/subscribe", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  const { team_id } = req.body;

  if (!userId || !team_id) {
    return res.status(400).json({ error: "Authentication and team_id required" });
  }

  const team = db.prepare("SELECT * FROM teams WHERE id = ? AND owner_user_id = ?").get(
    team_id,
    userId
  ) as any;

  if (!team) {
    return res.status(404).json({ error: "Team not found or not owner" });
  }

  try {
    let customerId = team.stripe_customer_id;
    if (!customerId) {
      const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId) as any;
      const customer = await stripe.customers.create({
        email: user?.email,
        metadata: { team_id, user_id: userId },
      });
      customerId = customer.id;
      db.prepare("UPDATE teams SET stripe_customer_id = ? WHERE id = ?").run(
        customerId,
        team_id
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: TEAM_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: `${BASE_URL}/team/dashboard?subscribed=true`,
      cancel_url: `${BASE_URL}/team/dashboard`,
    });

    res.json({ checkout_url: session.url });
  } catch (err: any) {
    console.error("Billing error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Billing portal ──────────────────────────────────────────────────────────

router.get("/billing/portal", async (req: Request, res: Response) => {
  const userId = (req as any).auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const user = db.prepare("SELECT stripe_customer_id FROM users WHERE id = ?").get(userId) as any;
  if (!user?.stripe_customer_id) {
    return res.status(400).json({ error: "No billing account found" });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${BASE_URL}/dashboard/settings`,
    });
    res.json({ portal_url: session.url });
  } catch (err: any) {
    console.error("Billing error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/billing/team/portal", async (req: Request, res: Response) => {
  const { team_id } = req.query;
  if (!team_id) {
    return res.status(400).json({ error: "team_id required" });
  }

  const team = db.prepare("SELECT stripe_customer_id FROM teams WHERE id = ?").get(team_id) as any;
  if (!team?.stripe_customer_id) {
    return res.status(400).json({ error: "No billing account found" });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: team.stripe_customer_id,
      return_url: `${BASE_URL}/team/dashboard`,
    });
    res.json({ portal_url: session.url });
  } catch (err: any) {
    console.error("Billing error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
