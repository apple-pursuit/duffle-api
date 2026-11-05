export const runtime = "nodejs";

export async function GET() {
  const secretConfigured = Boolean(process.env.DUFFLE_UPLOAD_SECRET);
  const blobStoreConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

  return Response.json({
    service: "Duffle API",
    ready: secretConfigured && blobStoreConfigured,
    uploadSecretConfigured: secretConfigured,
    blobStoreConfigured
  });
}
