/// <reference types="vite-plugin-pwa/client" />

/**
 * Registra o service worker gerado pelo vite-plugin-pwa (vite.config.ts) — SOMENTE em
 * produção, com suporte do navegador e em contexto seguro. Falha de registro nunca quebra o app.
 * `registerType: 'prompt'`: uma nova versão só assume quando todas as abas são fechadas
 * (ou quando uma UI chamar `atualizar(true)`), evitando trocar chunks no meio do uso.
 */
export function deveRegistrarServiceWorker(env: { PROD: boolean }, nav: { serviceWorker?: unknown } | undefined, seguro: boolean): boolean {
  return env.PROD && !!nav && "serviceWorker" in nav && seguro;
}

export async function registrarServiceWorker(): Promise<void> {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  if (!deveRegistrarServiceWorker(import.meta.env, navigator, window.isSecureContext)) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch (e) {
    console.warn("[pwa] service worker não registrado:", e);
  }
}
