// Server-only Supabase Storage client (REST over fetch — no SDK dependency).
// Uses the service-role key; NEVER import from a file that ships to the client.
// Bucket is private (DESIGN.md §11: content must not be reachable except through
// app-scoped access) — downloads go through short-lived signed URLs.

import { RESOURCES_BUCKET } from "./content-paths";

const SIGNED_URL_EXPIRY_SECONDS = 60 * 10;

function storageConfig(): { url: string; serviceKey: string } {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Add them to .env.local — see README.md.",
    );
  }
  return { url: url.replace(/\/+$/, ""), serviceKey };
}

async function storageRequest(
  method: string,
  path: string,
  body?: BodyInit,
  contentType?: string,
): Promise<Response> {
  const { url, serviceKey } = storageConfig();
  // sb_secret_ API keys require both headers; legacy JWTs ignore apikey.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
  if (contentType) headers["Content-Type"] = contentType;
  return fetch(`${url}/storage/v1${path}`, { method, headers, body });
}

// Idempotent: creates the private resources bucket if missing, tolerates "already exists".
export async function ensureResourcesBucket(): Promise<void> {
  const res = await storageRequest("POST", "/bucket", JSON.stringify({ name: RESOURCES_BUCKET, public: false }), "application/json");
  if (res.ok) return;
  const body = await res.text();
  if (!body.toLowerCase().includes("exist")) {
    throw new Error(`Failed to ensure ${RESOURCES_BUCKET} bucket (${res.status}): ${body}`);
  }
}

export async function uploadResourceObject(
  objectPath: string,
  data: Blob,
): Promise<void> {
  await ensureResourcesBucket();
  const res = await storageRequest(
    "POST",
    `/object/${RESOURCES_BUCKET}/${objectPath}`,
    data,
    "application/pdf",
  );
  if (!res.ok) {
    throw new Error(`Storage upload failed (${res.status})`);
  }
}

export async function createResourceSignedUrl(objectPath: string): Promise<string> {
  const res = await storageRequest(
    "POST",
    `/object/sign/${RESOURCES_BUCKET}/${objectPath}`,
    JSON.stringify({ expiresIn: SIGNED_URL_EXPIRY_SECONDS }),
    "application/json",
  );
  if (!res.ok) {
    throw new Error(`Storage signed URL failed (${res.status})`);
  }
  const body: unknown = await res.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("signedURL" in body) ||
    typeof (body as Record<string, unknown>).signedURL !== "string"
  ) {
    throw new Error("Storage signed URL response missing signedURL");
  }
  const signedUrl = (body as { signedURL: string }).signedURL;
  // Storage returns a path without the /storage/v1 prefix (e.g. /object/sign/…) — make it absolute.
  const { url } = storageConfig();
  return `${url}/storage/v1${signedUrl}`;
}

export async function removeResourceObject(objectPath: string): Promise<void> {
  const res = await storageRequest("DELETE", `/object/${RESOURCES_BUCKET}/${objectPath}`);
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage delete failed (${res.status})`);
  }
}
