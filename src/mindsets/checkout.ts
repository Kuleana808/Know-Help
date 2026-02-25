import Stripe from "stripe";
import { v4 as uuid } from "uuid";
import * as crypto from "crypto";
import db from "../db/database";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("WARNING: STRIPE_SECRET_KEY not set. Mindset payment endpoints will reject requests.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_not_configured", {
  apiVersion: "2025-01-27.acacia" as any,
});

function requireStripeKey(): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Payment processing is not configured. Set STRIPE_SECRET_KEY.");
  }
}

const BASE_URL = process.env.BASE_URL || "https://know.help";

/**
 * Generate a secure install token.
 */
function generateInstallToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create a Stripe Checkout Session for a Mindset subscription.
 * Uses Stripe Connect with application_fee_percent for 70/30 split.
 */
export async function createMindsetSubscription(
  mindsetId: string,
  buyerEmail: string
): Promise<{ checkout_url: string; subscription_id: string; install_token: string }> {
  requireStripeKey();

  // Look up the mindset
  const mindset = db.prepare("SELECT * FROM mindsets WHERE id = ? AND status = 'active'").get(mindsetId) as any;
  if (!mindset) {
    throw new Error("Mindset not found or not active");
  }

  // Look up creator's Stripe account
  const creator = db.prepare("SELECT * FROM creators WHERE handle = ?").get(mindset.creator_handle) as any;
  if (!creator || !creator.stripe_account_id) {
    throw new Error("Creator not set up for payments");
  }

  const subscriptionId = uuid();
  const installToken = generateInstallToken();

  // Check for existing active subscription
  const existing = db.prepare(
    "SELECT * FROM subscriptions WHERE subscriber_email = ? AND mindset_id = ? AND status = 'active'"
  ).get(buyerEmail, mindsetId) as any;

  if (existing) {
    throw new Error("Already subscribed to this Mindset");
  }

  // Create Stripe Checkout Session in subscription mode
  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    customer_email: buyerEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: mindset.name,
            description: `${mindset.tagline || mindset.description || ""} — by ${creator.display_name || creator.handle}`,
            metadata: {
              mindset_id: mindsetId,
              creator_handle: mindset.creator_handle,
            },
          },
          unit_amount: mindset.price_cents,
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      mindset_id: mindsetId,
      subscription_id: subscriptionId,
      buyer_email: buyerEmail,
      type: "mindset_subscription",
    },
    subscription_data: {
      metadata: {
        mindset_id: mindsetId,
        subscription_id: subscriptionId,
        type: "mindset_subscription",
      },
      application_fee_percent: 30,
    },
    payment_intent_data: {
      transfer_data: {
        destination: creator.stripe_account_id,
      },
    } as any,
    success_url: `${BASE_URL}/mindsets/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/mindsets/${mindset.slug}`,
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  // Insert pending subscription record
  db.prepare(`
    INSERT INTO subscriptions (id, mindset_id, subscriber_email, status, install_token, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(subscriptionId, mindsetId, buyerEmail, installToken, new Date().toISOString());

  return {
    checkout_url: session.url || "",
    subscription_id: subscriptionId,
    install_token: installToken,
  };
}

/**
 * Handle Mindset subscription events from Stripe webhooks.
 */
export async function handleMindsetSubscriptionEvent(
  eventType: string,
  subscription: Stripe.Subscription
): Promise<void> {
  const mindsetId = subscription.metadata?.mindset_id;
  const subscriptionId = subscription.metadata?.subscription_id;

  if (!mindsetId) return;

  const now = new Date().toISOString();

  switch (eventType) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const status = subscription.status === "active" || subscription.status === "trialing"
        ? "active"
        : subscription.status === "past_due"
        ? "past_due"
        : subscription.status === "canceled"
        ? "cancelled"
        : subscription.status;

      const periodEnd = (subscription as any).current_period_end
        ? new Date((subscription as any).current_period_end * 1000).toISOString()
        : null;

      if (subscriptionId) {
        db.prepare(`
          UPDATE subscriptions
          SET stripe_subscription_id = ?, stripe_customer_id = ?,
              status = ?, current_period_end = ?
          WHERE id = ?
        `).run(
          subscription.id,
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
          status,
          periodEnd,
          subscriptionId
        );
      }

      // Update subscriber count
      const activeCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM subscriptions WHERE mindset_id = ? AND status = 'active'"
      ).get(mindsetId) as any;
      db.prepare("UPDATE mindsets SET subscriber_count = ? WHERE id = ?").run(
        activeCount?.cnt || 0,
        mindsetId
      );

      // Update creator subscriber count
      const mindset = db.prepare("SELECT creator_handle FROM mindsets WHERE id = ?").get(mindsetId) as any;
      if (mindset) {
        const totalSubs = db.prepare(`
          SELECT COUNT(DISTINCT s.subscriber_email) as cnt
          FROM subscriptions s
          JOIN mindsets m ON s.mindset_id = m.id
          WHERE m.creator_handle = ? AND s.status = 'active'
        `).get(mindset.creator_handle) as any;
        db.prepare("UPDATE creators SET subscriber_count = ? WHERE handle = ?").run(
          totalSubs?.cnt || 0,
          mindset.creator_handle
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      // Revoke install token and cancel subscription
      if (subscriptionId) {
        db.prepare(`
          UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, install_token = NULL WHERE id = ?
        `).run(now, subscriptionId);
      } else {
        // Match by stripe_subscription_id
        db.prepare(`
          UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, install_token = NULL WHERE stripe_subscription_id = ?
        `).run(now, subscription.id);
      }

      // Update subscriber counts after cancellation
      const activeCount = db.prepare(
        "SELECT COUNT(*) as cnt FROM subscriptions WHERE mindset_id = ? AND status = 'active'"
      ).get(mindsetId) as any;
      db.prepare("UPDATE mindsets SET subscriber_count = ? WHERE id = ?").run(
        activeCount?.cnt || 0,
        mindsetId
      );

      const mindset = db.prepare("SELECT creator_handle FROM mindsets WHERE id = ?").get(mindsetId) as any;
      if (mindset) {
        const totalSubs = db.prepare(`
          SELECT COUNT(DISTINCT s.subscriber_email) as cnt
          FROM subscriptions s
          JOIN mindsets m ON s.mindset_id = m.id
          WHERE m.creator_handle = ? AND s.status = 'active'
        `).get(mindset.creator_handle) as any;
        db.prepare("UPDATE creators SET subscriber_count = ? WHERE handle = ?").run(
          totalSubs?.cnt || 0,
          mindset.creator_handle
        );
      }
      break;
    }

    case "invoice.payment_failed": {
      const stripeSubId = subscription.id;
      db.prepare(`
        UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = ?
      `).run(stripeSubId);
      break;
    }
  }
}

/**
 * Validate a subscription/install token.
 */
export function validateInstallToken(
  installToken: string
): { valid: boolean; mindset_id?: string; creator_handle?: string; status?: string; expires?: string } {
  const sub = db.prepare(`
    SELECT s.*, m.creator_handle, m.slug as mindset_slug
    FROM subscriptions s
    JOIN mindsets m ON s.mindset_id = m.id
    WHERE s.install_token = ?
  `).get(installToken) as any;

  if (!sub) {
    return { valid: false };
  }

  const isActive = sub.status === "active" || sub.status === "pending";
  return {
    valid: isActive,
    mindset_id: sub.mindset_id,
    creator_handle: sub.creator_handle,
    status: sub.status,
    expires: sub.current_period_end,
  };
}
