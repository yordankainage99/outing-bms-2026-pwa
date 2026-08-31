import { fetchBranding, dataUrlToResponse, fallbackIconSvg } from "../_lib/branding.js";

export async function onRequestGet(context) {
  let brand;
  try { brand = await fetchBranding(context.env); }
  catch { brand = { logoUrl:"", primaryColor:"#17324D", secondaryColor:"#2D527C" }; }

  const logoUrl = String(brand.logoUrl || "").trim();
  if (logoUrl.startsWith("data:")) {
    const response = dataUrlToResponse(logoUrl, 300);
    if (response) return response;
  }

  if (/^https?:\/\//i.test(logoUrl)) {
    try {
      const upstream = await fetch(logoUrl, { redirect:"follow", headers:{ "user-agent":"OutingBMS2026-PWA/1.0" } });
      if (upstream.ok) {
        const headers = new Headers(upstream.headers);
        headers.set("cache-control", "public, max-age=300, stale-while-revalidate=86400");
        headers.set("x-content-type-options", "nosniff");
        return new Response(upstream.body, { status:200, headers });
      }
    } catch {}
  }

  return new Response(fallbackIconSvg(brand), {
    headers: {
      "content-type":"image/svg+xml; charset=UTF-8",
      "cache-control":"public, max-age=300, stale-while-revalidate=86400",
      "x-content-type-options":"nosniff",
    },
  });
}
