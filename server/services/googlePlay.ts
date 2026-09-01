import { google, androidpublisher_v3 } from "googleapis";

// Separate from Firebase's service account (firebaseAdmin.ts) -- Play Developer
// API access is a distinct Google Cloud service account, granted access to this
// app specifically via Play Console > Users & Permissions.
let authClient: any = null;

async function getAuthClient() {
  if (authClient) return authClient;
  const keyFile = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH;
  if (!keyFile) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH is not configured on the server.");
  }
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  authClient = await auth.getClient();
  return authClient;
}

function getPackageName(): string {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!packageName) throw new Error("GOOGLE_PLAY_PACKAGE_NAME is not configured on the server.");
  return packageName;
}

const androidPublisher = google.androidpublisher("v3");

// purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
// (see https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products)
export async function verifyOneTimeProductPurchase(
  productId: string,
  purchaseToken: string
): Promise<androidpublisher_v3.Schema$ProductPurchase> {
  const auth = await getAuthClient();
  const res = await androidPublisher.purchases.products.get({
    auth,
    packageName: getPackageName(),
    productId,
    token: purchaseToken,
  });
  return res.data;
}

// Google auto-refunds one-time purchases that aren't acknowledged within 3 days.
// acknowledgementState: 0 = not yet acknowledged, 1 = acknowledged.
export async function acknowledgeOneTimeProductPurchase(productId: string, purchaseToken: string): Promise<void> {
  const auth = await getAuthClient();
  await androidPublisher.purchases.products.acknowledge({
    auth,
    packageName: getPackageName(),
    productId,
    token: purchaseToken,
    requestBody: {},
  });
}
