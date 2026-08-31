import { fetchBranding } from "../_lib/branding.js";

export async function onRequestGet(context) {
  try {
    const brand = await fetchBranding(context.env);
    const appUrl = String(context.env.APPS_SCRIPT_URL || "").trim();
    return Response.json({ ok: true, appUrl, brand }, {
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error && error.message ? error.message : "Konfigurasi PWA tidak tersedia." }, {
      status: 500,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
}
