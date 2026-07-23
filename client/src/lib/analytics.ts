export function initializeAnalytics(): void {
  const endpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT?.trim();
  const websiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID?.trim();
  if (!endpoint || !websiteId) return;

  try {
    const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
    const scriptUrl = new URL("umami", base);
    if (
      scriptUrl.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(scriptUrl.hostname)
    ) {
      console.warn("Analytics ignorado: o endpoint deve usar HTTPS.");
      return;
    }
    const script = document.createElement("script");
    script.defer = true;
    script.src = scriptUrl.toString();
    script.dataset.websiteId = websiteId;
    document.head.appendChild(script);
  } catch {
    console.warn("Analytics ignorado: endpoint inválido.");
  }
}
