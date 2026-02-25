import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe, handleCheckoutComplete, handlePaymentFailed } from "./checkout";
import { sendPurchaseConfirmation } from "./email";
import { db } from "../db/database";
import { handleMindsetSubscriptionEvent } from "../mindsets/checkout";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.error("FATAL: STRIPE_WEBHOOK_SECRET is not set. Webhooks will be rejected.");
}

/**
 * Idempotency: track processed Stripe event IDs to prevent duplicate processing.
 * Uses an in-memory Set with a DB table fallback for durability across restarts.
 */
const processedEvents = new Set<string>();
const MAX_PROCESSED_CACHE = 10000;

function isEventProcessed(eventId: string): boolean {
  if (processedEvents.has(eventId)) return true;
  try {
    const row = db.prepare("SELECT 1 FROM webhook_events WHERE event_id = ?").get(eventId);
    if (row) {
      processedEvents.add(eventId);
      return true;
    }
  } catch {
    // Table may not exist yet — non-fatal
  }
  return false;
}

function markEventProcessed(eventId: string): void {
  processedEvents.add(eventId);
  // Evict oldest entries to prevent unbounded growth
  if (processedEvents.size > MAX_PROCESSED_CACHE) {
    const first = processedEvents.values().next().value;
    if (first) processedEvents.delete(first);
  }
  try {
    db.prepare("INSERT OR IGNORE INTO webhook_events (event_id, processed_at) VALUES (?, ?)").run(
      eventId,
      new Date().toISOString()
    );
  } catch {
    // Table may not exist yet — non-fatal, in-memory set is sufficient
  }
}

export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
  if (!WEBHOOK_SECRET) {
    console.error("Webhook rejected: STRIPE_WEBHOOK_SECRET not configured");
    res.status(500).json({ error: "Webhook endpoint not configured" });
    return;
  }

  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  // Idempotency check — skip already-processed events
  if (isEventProcessed(event.id)) {
    res.status(200).json({ received: true, deduplicated: true });
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);

        // Send confirmation email
        const purchaseId = session.metadata?.purchase_id;
        if (purchaseId) {
          const purchase = db
            .prepare("SELECT * FROM purchases WHERE id = ?")
            .get(purchaseId) as any;
          const pack = db
            .prepare("SELECT * FROM packs WHERE id = ?")
            .get(purchase?.pack_id) as any;

          if (purchase && pack) {
            await sendPurchaseConfirmation({
              to: purchase.buyer_email,
              packName: pack.name,
              downloadToken: purchase.download_token,
              expiresAt: purchase.download_expires_at,
            });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(paymentIntent);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;

        // Check if this is a Mindset subscription
        if (subscription.metadata?.type === "mindset_subscription") {
          await handleMindsetSubscriptionEvent(event.type, subscription);
        } else {
          // Update user subscription status
          db.prepare(
            "UPDATE users SET subscription_status = ?, stripe_subscription_id = ? WHERE stripe_customer_id = ?"
          ).run(status, subscription.id, customerId);

          // Also check teams
          db.prepare(
            "UPDATE teams SET subscription_status = ?, stripe_subscription_id = ? WHERE stripe_customer_id = ?"
          ).run(status, subscription.id, customerId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Check if this is a Mindset subscription
        if (subscription.metadata?.type === "mindset_subscription") {
          await handleMindsetSubscriptionEvent(event.type, subscription);
        } else {
          db.prepare(
            "UPDATE users SET subscription_status = 'canceled' WHERE stripe_customer_id = ?"
          ).run(customerId);
          db.prepare(
            "UPDATE teams SET subscription_status = 'canceled' WHERE stripe_customer_id = ?"
          ).run(customerId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        db.prepare(
          "UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = ?"
        ).run(customerId);
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    // Mark event as processed after successful handling
    markEventProcessed(event.id);
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err.message);
    // Don't mark as processed on error — allow Stripe to retry
    res.status(500).json({ error: "Internal error" });
  }
}
