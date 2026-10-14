export default {
  fetch(request) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    return new Response(null, { status: 308, headers: { location: "https://sunoto.grasany.com/#party", "cache-control": "public, max-age=3600", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
  }
};
