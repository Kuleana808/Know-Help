import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe, handleCheckoutComplete, handlePaymentFailed } from "./checkout";
import { sendPurchaseConfirmation } from "./email";
import { db } from "../db/database";
import { handleMindsetSubscriptionEvent } from "../mindsets/checkout";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function handleStripeWebhook(
  req: Request,
  res: Response
): Promise<void> {
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

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Webhook handler error:", err.message);
    res.status(500).json({ error: "Internal error" });
  }
}
