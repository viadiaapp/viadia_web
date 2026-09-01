import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 exposes an S3-compatible API, so the standard AWS SDK works against it unmodified --
// just pointed at R2's endpoint instead of AWS's, with region hardcoded to "auto" (R2 ignores it).
let client: S3Client | null = null;

function getClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not configured on the server.");
  }
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME is not configured on the server.");
  return bucket;
}

// Public URL a stored object is reachable at -- either a custom domain mapped to the bucket, or
// the bucket's r2.dev public development URL. Set once public access is enabled on the bucket
// (Cloudflare dashboard > R2 > bucket > Settings > Public Access).
export function getPublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL_BASE;
  if (!base) throw new Error("R2_PUBLIC_URL_BASE is not configured on the server.");
  return `${base.replace(/\/$/, "")}/${key}`;
}

const PRESIGN_EXPIRY_SECONDS = 5 * 60; // client has 5 minutes to actually perform the PUT

export async function createPresignedUploadUrl(params: {
  key: string;
  contentType: string;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: params.key,
    ContentType: params.contentType,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: PRESIGN_EXPIRY_SECONDS });
  return { uploadUrl, publicUrl: getPublicUrl(params.key) };
}

// Presigned PUT URLs don't enforce a max size on their own -- this is the follow-up check called
// from /api/uploads/confirm once the client reports the upload as done. Deletes and throws if the
// object is missing or over the limit, so the caller can surface an error and the client can retry
// with a smaller file instead of silently keeping an oversized object around.
export async function verifyUploadedObjectSize(key: string, maxBytes: number): Promise<number> {
  const head = await getClient().send(new HeadObjectCommand({ Bucket: getBucketName(), Key: key }));
  const size = head.ContentLength ?? 0;
  if (size === 0 || size > maxBytes) {
    await deleteObject(key).catch(() => {});
    throw new Error(size === 0 ? "Uploaded object not found or empty." : `Uploaded file (${size} bytes) exceeds the ${maxBytes} byte limit.`);
  }
  return size;
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucketName(), Key: key }));
}

// Lists and deletes every object under a given prefix, e.g. "attachments/{userCode}/{tripCode}/".
// Handles pagination (ListObjectsV2 caps at 1000 keys per page) and batches deletes in groups of
// 1000 (DeleteObjects' own per-request limit). Returns the count actually deleted, mainly for
// logging -- callers should treat this as best-effort cleanup, not something to block trip
// deletion on if R2 is briefly unreachable.
export async function deleteObjectsWithPrefix(prefix: string): Promise<number> {
  const client = getClient();
  const bucket = getBucketName();
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listResult = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken })
    );
    const keys = (listResult.Contents || []).map((obj) => obj.Key).filter((k): k is string => !!k);

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (batch.length === 0) continue;
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        })
      );
      deletedCount += batch.length;
    }

    continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
  } while (continuationToken);

  return deletedCount;
}
