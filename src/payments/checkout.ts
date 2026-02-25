import Stripe from "stripe";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/database";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("WARNING: STRIPE_SECRET_KEY not set. Payment endpoints will reject requests.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_not_configured");

function requireStripeKey(): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Payment processing is not configured. Set STRIPE_SECRET_KEY.");
  }
}

const SUCCESS_URL =
  process.env.CHECKOUT_SUCCESS_URL || "https://know.help/success?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL =
  process.env.CHECKOUT_CANCEL_URL || "https://know.help/marketplace";

export interface CheckoutRequest {
  pack_id: string;
  buyer_email: string;
}

export async function createCheckoutSession(
  req: CheckoutRequest
): Promise<{ checkout_url: string; purchase_id: string }> {
  requireStripeKey();

  const pack = db
    .prepare("SELECT * FROM packs WHERE id = ? AND status = 'active'")
    .get(req.pack_id) as any;

  if (!pack) {
    throw new Error("Pack not found or not active");
  }

  if (pack.price_cents === 0) {
    throw new Error("This pack is free. Use direct install instead.");
  }

  const purchaseId = uuidv4();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: req.buyer_email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: pack.price_cents,
          product_data: {
            name: pack.name,
            description: pack.description,
          },
        },
        quantity: 1,
      },
    ],
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    metadata: {
      pack_id: req.pack_id,
      buyer_email: req.buyer_email,
      purchase_id: purchaseId,
    },
  });

  // Insert pending purchase
  db.prepare(
    `INSERT INTO purchases (id, pack_id, buyer_email, stripe_session_id, amount_cents, creator_payout_cents, platform_fee_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    purchaseId,
    req.pack_id,
    req.buyer_email,
    session.id,
    pack.price_cents,
    Math.floor(pack.price_cents * 0.7),
    Math.ceil(pack.price_cents * 0.3),
    new Date().toISOString()
  );

  return {
    checkout_url: session.url!,
    purchase_id: purchaseId,
  };
}

export async function handleCheckoutComplete(
  session: Stripe.Checkout.Session
): Promise<void> {
  const packId = session.metadata?.pack_id;
  const buyerEmail = session.metadata?.buyer_email;
  const purchaseId = session.metadata?.purchase_id;

  if (!packId || !buyerEmail || !purchaseId) {
    console.error("Missing metadata in checkout session");
    return;
  }

  // Guard against duplicate processing: only process if still pending
  const existing = db.prepare("SELECT status FROM purchases WHERE id = ?").get(purchaseId) as any;
  if (existing?.status === "completed") {
    return; // Already processed — skip to prevent double-crediting
  }

  const downloadToken = uuidv4();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  // Update purchase
  db.prepare(
    `UPDATE purchases SET
       status = 'completed',
       stripe_payment_intent_id = ?,
       download_token = ?,
       download_expires_at = ?
     WHERE id = ? AND status = 'pending'`
  ).run(session.payment_intent as string, downloadToken, expiresAt, purchaseId);

  // Increment downloads
  db.prepare("UPDATE packs SET downloads = downloads + 1 WHERE id = ?").run(
    packId
  );

  // Update creator earnings
  const pack = db.prepare("SELECT * FROM packs WHERE id = ?").get(packId) as any;
  if (pack?.author_handle) {
    db.prepare(
      "UPDATE creators SET total_earned_cents = total_earned_cents + ? WHERE handle = ?"
    ).run(Math.floor(pack.price_cents * 0.7), pack.author_handle);
  }
}

export async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const purchaseId = paymentIntent.metadata?.purchase_id;
  if (purchaseId) {
    db.prepare("UPDATE purchases SET status = 'failed' WHERE id = ?").run(
      purchaseId
    );
  }
}

export { stripe };
