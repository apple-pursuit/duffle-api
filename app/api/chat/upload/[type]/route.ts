import { createHmac, timingSafeEqual } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";

const categories: Record<string, {
  folder: string;
  contentTypes?: string[];
  maximumSizeInBytes: number;
}> = {
  Chat_Photo: {
    folder: "chat-photos",
    contentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
    maximumSizeInBytes: 20 * 1024 * 1024
  },
  Chat_File: {
    folder: "chat-files",
    maximumSizeInBytes: 100 * 1024 * 1024
  },
  Backup_File: {
    folder: "backups",
    maximumSizeInBytes: 1024 * 1024 * 1024
  },
  Music_File: {
    folder: "music",
    contentTypes: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/wav", "audio/flac", "audio/ogg", "audio/x-m4a"],
    maximumSizeInBytes: 500 * 1024 * 1024
  }
};

type UploadGrant = {
  sub: string;
  category: string;
  iat: number;
  exp: number;
};

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function verifyGrant(token: string, expectedCategory: string): UploadGrant | null {
  const secret = process.env.DUFFLE_UPLOAD_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadPart, signaturePart] = parts;
  if (!payloadPart || !signaturePart) return null;

  const expectedSignature = createHmac("sha256", secret)
    .update(payloadPart)
    .digest();

  let suppliedSignature: Buffer;
  let payload: UploadGrant;

  try {
    suppliedSignature = decodeBase64Url(signaturePart);
    if (suppliedSignature.length !== expectedSignature.length) return null;
    if (!timingSafeEqual(suppliedSignature, expectedSignature)) return null;
    payload = JSON.parse(decodeBase64Url(payloadPart).toString("utf8")) as UploadGrant;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    payload.category !== expectedCategory ||
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp) ||
    payload.iat > now + 30 ||
    payload.exp <= now ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > 300
  ) {
    return null;
  }

  return payload;
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin"
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders() });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ type: string }> }
): Promise<Response> {
  const { type } = await context.params;
  const category = categories[type];

  if (!category) {
    return jsonResponse({ success: false, error: "Unknown upload category." }, 404);
  }

  let body: HandleUploadBody;
  try {
    body = (await request.clone().json()) as HandleUploadBody;
  } catch {
    return jsonResponse({ success: false, error: "Expected a JSON upload request." }, 400);
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const grant = verifyGrant(clientPayload ?? "", type);
        if (!grant) {
          throw new Error("Upload authorization is invalid or expired.");
        }

        const normalized = pathname.replace(/^\/+/, "");
        if (
          normalized.includes("..") ||
          normalized.includes("\\") ||
          !normalized.startsWith(category.folder + "/")
        ) {
          throw new Error("Invalid upload path.");
        }

        return {
          ...(category.contentTypes ? { allowedContentTypes: category.contentTypes } : {}),
          maximumSizeInBytes: category.maximumSizeInBytes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: grant.sub,
            category: type
          })
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.info("Duffle upload completed", {
          pathname: blob.pathname,
          contentType: blob.contentType
        });
      }
    });

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload request failed.";
    return jsonResponse({ success: false, error: message }, 400);
  }
}
