import Razorpay from "razorpay";
import crypto from "crypto";

let client: Razorpay | null = null;

function getClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured on the server.");
  }
  if (!client) {
    client = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return client;
}

export function getRazorpayKeyId(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) throw new Error("RAZORPAY_KEY_ID is not configured on the server.");
  return keyId;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a || "");
  const bufB = Buffer.from(b || "");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function createRazorpayOrder(params: {
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}) {
  const rzp = getClient();
  // Razorpay expects the amount in the smallest currency unit (e.g. cents/paise).
  const amountInSubunits = Math.round(params.amount * 100);
  return rzp.orders.create({
    amount: amountInSubunits,
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes,
  });
}

export function verifyPaymentSignature(params: { orderId: string; paymentId: string; signature: string }): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new Error("RAZORPAY_KEY_SECRET is not configured on the server.");
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");
  return safeCompare(expected, params.signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("RAZORPAY_WEBHOOK_SECRET is not configured on the server.");
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeCompare(expected, signature);
}
