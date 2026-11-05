# Duffle API

Vercel API for Duffle Network chat attachment uploads.

## Routes

- `GET /api/status` — reports whether the upload secret and Vercel Blob connection are configured.
- `POST /api/chat/upload/Chat_Photo` — creates upload tokens for chat photos.
- `POST /api/chat/upload/Chat_File` — creates upload tokens for chat files.
- `OPTIONS /api/chat/upload/:type` — browser CORS preflight.

## Environment variables

Configure these in the Vercel project:

- `DUFFLE_UPLOAD_SECRET` — a long random secret shared only with Duffle Core.
- `BLOB_READ_WRITE_TOKEN` or a connected Vercel Blob store using Vercel OIDC.

Never put `DUFFLE_UPLOAD_SECRET` or a Vercel Blob token in browser code.

## Upload authorization

Duffle Core must authenticate the user's existing session first, then issue a short-lived grant signed with HMAC-SHA256 using `DUFFLE_UPLOAD_SECRET`.

The grant format is:

`base64url(JSON payload).base64url(HMAC-SHA256(secret, encoded payload))`

Payload:

```json
{
  "sub": "authenticated-user-id",
  "category": "Chat_Photo",
  "iat": 1790000000,
  "exp": 1790000120
}
```

Use the matching category `Chat_File` for file uploads. Grants must expire within five minutes. Send the grant as `Authorization: Bearer <grant>` to the upload endpoint. The endpoint checks the signature, expiry, and category before asking Vercel Blob to issue an upload token.

The browser's existing Duffle session token is never sent to this API. Blob completion callbacks are verified by the Vercel Blob SDK.

## Limits

- Chat photos: 20 MiB; JPEG, PNG, WebP, GIF, AVIF.
- Chat files: 100 MiB.
