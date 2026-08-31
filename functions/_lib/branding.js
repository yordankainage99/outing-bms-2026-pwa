const DEFAULT_BRAND = {
  appName: "OUTING BMS 2026",
  eventDate: "7–8 November 2026",
  logoUrl: "",
  logoFileId: "",
  brandVersion: "",
  primaryColor: "#17324D",
  secondaryColor: "#2D527C",
  backgroundColor: "#F4F7FB",
};

function normalizeHex(value, fallback) {
  const s = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

export async function fetchBranding(env) {
  const appUrl = String(env.APPS_SCRIPT_URL || "").trim();
  if (!appUrl) throw new Error("Environment variable APPS_SCRIPT_URL belum diisi.");

  const body = new URLSearchParams();
  body.set("action", "pwa-branding");

  const response = await fetch(appUrl, {
    method: "POST",
    body,
    redirect: "follow",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "OutingBMS2026-PWA/1.0",
    },
  });

  if (!response.ok) throw new Error(`Apps Script membalas HTTP ${response.status}.`);

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Respons Apps Script bukan JSON. Pastikan PwaBridge.gs sudah ditambahkan dan deployment sudah dibuat versi baru.");
  }

  if (!data || data.ok !== true) throw new Error((data && data.error) || "Branding Apps Script tidak tersedia.");

  return {
    ...DEFAULT_BRAND,
    ...data,
    appName: String(data.appName || DEFAULT_BRAND.appName),
    eventDate: String(data.eventDate || DEFAULT_BRAND.eventDate),
    logoUrl: String(data.logoUrl || ""),
    logoFileId: String(data.logoFileId || ""),
    brandVersion: String(data.brandVersion || ""),
    primaryColor: normalizeHex(data.primaryColor, DEFAULT_BRAND.primaryColor),
    secondaryColor: normalizeHex(data.secondaryColor, DEFAULT_BRAND.secondaryColor),
    backgroundColor: normalizeHex(data.backgroundColor, DEFAULT_BRAND.backgroundColor),
  };
}

export function dataUrlToResponse(dataUrl, cacheSeconds = 300) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  const mime = match[1] || "image/png";
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "content-type": mime,
      "cache-control": `public, max-age=${cacheSeconds}, stale-while-revalidate=86400`,
      "x-content-type-options": "nosniff",
    },
  });
}

export function fallbackIconSvg(brand) {
  const primary = brand.primaryColor || DEFAULT_BRAND.primaryColor;
  const secondary = brand.secondaryColor || DEFAULT_BRAND.secondaryColor;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs>
    <rect width="512" height="512" rx="112" fill="url(#g)"/>
    <circle cx="370" cy="138" r="38" fill="rgba(255,255,255,.84)"/>
    <path d="M75 360 205 185l77 105 60-68 95 138" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M115 400h282" stroke="rgba(255,255,255,.72)" stroke-width="24" stroke-linecap="round"/>
  </svg>`;
}
