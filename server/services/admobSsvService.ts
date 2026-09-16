import { createVerify } from "crypto";

// https://gstatic.com/admob/reward/verifier-keys.json -- Google's own documented source for the
// rotating public keys used to verify rewarded SSV callbacks. Cached for up to 24h per Google's
// guidance (keys rotate on a variable schedule; anything longer risks verifying against a stale
// key that's no longer valid).
const KEY_SERVER_URL = "https://gstatic.com/admob/reward/verifier-keys.json";
const KEY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface CachedKeys {
  fetchedAt: number;
  keysById: Map<number, string>; // keyId -> PEM public key
}

let keyCache: CachedKeys | null = null;

async function getPublicKeys(): Promise<Map<number, string>> {
  if (keyCache && Date.now() - keyCache.fetchedAt < KEY_CACHE_MAX_AGE_MS) {
    return keyCache.keysById;
  }

  const res = await fetch(KEY_SERVER_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch AdMob SSV public keys: HTTP ${res.status}`);
  }
  const data: any = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  if (keys.length === 0) {
    throw new Error("AdMob key server returned no keys.");
  }

  const keysById = new Map<number, string>();
  for (const k of keys) {
    if (typeof k.keyId === "number" && typeof k.pem === "string") {
      keysById.set(k.keyId, k.pem);
    }
  }

  keyCache = { fetchedAt: Date.now(), keysById };
  return keysById;
}

export interface SsvVerificationResult {
  verified: boolean;
  customData?: string;
  transactionId?: string;
  rewardAmount?: string;
  rewardItem?: string;
}

// Verifies a rewarded-ad SSV callback against Google's exact documented algorithm
// (https://developers.google.com/admob/android/ssv, "Manual verification of rewarded SSV"):
//   1. The content to verify is the RAW query string up to (not including) "&signature=" --
//      must not be re-parsed/re-ordered/re-encoded in any way, or verification will fail even
//      for a genuine callback.
//   2. signature and key_id are parsed from what follows.
//   3. ECDSA/SHA256 verify, DER signature encoding, against the public key matching key_id.
// Takes the raw query string exactly as received (e.g. req.url's query portion) rather than a
// parsed object, since re-serializing parsed params could silently reorder or re-encode them
// and break verification.
export async function verifySsvCallback(rawQueryString: string): Promise<SsvVerificationResult> {
  const sigParamName = "signature=";
  const sigIndex = rawQueryString.indexOf(sigParamName);
  if (sigIndex === -1) {
    return { verified: false };
  }

  // Content to verify: everything before "&signature=" (sigIndex - 1 to also drop the "&").
  const contentToVerify = rawQueryString.substring(0, sigIndex - 1);

  const afterSig = rawQueryString.substring(sigIndex + sigParamName.length);
  const keyIdParamName = "key_id=";
  const keyIdIndex = afterSig.indexOf(keyIdParamName);
  if (keyIdIndex === -1) {
    return { verified: false };
  }

  const signatureRaw = afterSig.substring(0, keyIdIndex - 1); // -1 drops the "&" before key_id
  const keyId = Number(afterSig.substring(keyIdIndex + keyIdParamName.length));
  if (!Number.isFinite(keyId)) {
    return { verified: false };
  }

  const publicKeys = await getPublicKeys();
  const publicKeyPem = publicKeys.get(keyId);
  if (!publicKeyPem) {
    return { verified: false };
  }

  // The signature in the callback is URL-safe base64 (contains '-'/'_'); decode accordingly
  // before handing it to Node's crypto verify, which expects raw DER-encoded signature bytes.
  const signatureBuffer = Buffer.from(signatureRaw.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  const verifier = createVerify("SHA256");
  verifier.update(contentToVerify, "utf8");
  verifier.end();

  let verified: boolean;
  try {
    verified = verifier.verify(publicKeyPem, signatureBuffer);
  } catch (err: any) {
    console.error("SSV signature verification threw:", err?.message || err);
    return { verified: false };
  }

  if (!verified) return { verified: false };

  // Parse the individual params we care about from the (now-verified) content, for the caller's
  // convenience -- safe to do now since we've already confirmed the raw string is authentic.
  const params = new URLSearchParams(contentToVerify);
  return {
    verified: true,
    customData: params.get("custom_data") || undefined,
    transactionId: params.get("transaction_id") || undefined,
    rewardAmount: params.get("reward_amount") || undefined,
    rewardItem: params.get("reward_item") || undefined,
  };
}
