import { fetchBranding } from "./_lib/branding.js";

export async function onRequestGet(context) {
  let brand;
  try { brand = await fetchBranding(context.env); }
  catch { brand = { appName:"OUTING BMS 2026", primaryColor:"#17324D", backgroundColor:"#F4F7FB", brandVersion:"" }; }

  const version = encodeURIComponent(String(brand.brandVersion || "1"));
  const manifest = {
    id: "/",
    name: String(brand.appName || "OUTING BMS 2026"),
    short_name: "Outing BMS",
    description: "Aplikasi Outing BMS 2026",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "portrait-primary",
    background_color: brand.backgroundColor || "#F4F7FB",
    theme_color: brand.primaryColor || "#17324D",
    icons: [
      { src:`/icon/192?v=${version}`, sizes:"192x192", purpose:"any" },
      { src:`/icon/512?v=${version}`, sizes:"512x512", purpose:"any" },
      { src:`/icon/512?v=${version}&maskable=1`, sizes:"512x512", purpose:"maskable" },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "content-type":"application/manifest+json; charset=UTF-8",
      "cache-control":"public, max-age=300, stale-while-revalidate=86400",
      "x-content-type-options":"nosniff",
    },
  });
}
