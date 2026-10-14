const TYPES = Object.freeze({ mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" });
export function mediaContentType(extension) { return TYPES[extension] || "application/octet-stream"; }

export function mediaByteRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(match[1]), end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return false;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

export async function serveStoredMedia(request, bucket, key) {
  const metadata = await bucket.head(key);
  if (!metadata) return Response.json({ error: "not_found" }, { status: 404 });
  const headers = new Headers({ "content-type": mediaContentType(key.split(".").at(-1)), "cache-control": "private, max-age=60", "content-disposition": "inline", "accept-ranges": "bytes", "x-content-type-options": "nosniff" });
  if (metadata.httpEtag) headers.set("etag", metadata.httpEtag);
  const ifRange = request.headers.get("if-range");
  const range = request.method === "HEAD" ? null : mediaByteRange(ifRange && ifRange !== metadata.httpEtag ? null : request.headers.get("range"), metadata.size);
  if (range === false) { headers.set("content-range", `bytes */${metadata.size}`); return new Response(null, { status: 416, headers }); }
  headers.set("content-length", String(range ? range.length : metadata.size));
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  const status = range ? 206 : 200;
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const object = await bucket.get(key, range ? { range } : undefined);
  if (!object) return Response.json({ error: "not_found" }, { status: 404 });
  return new Response(object.body, { status, headers });
}
