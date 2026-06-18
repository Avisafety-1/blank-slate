/**
 * Device detection utilities for security/UX decisions.
 */

/**
 * Detects DJI smart controllers (RC Plus, RC Pro etc.) which run Chromium 70
 * in a kiosk PWA context. Returns true if the current device appears to be a
 * DJI controller.
 */
export function isDjiController(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/dji|rc\s?plus|rc\s?pro|smart\s?controller/i.test(ua)) return true;
  // DJI RC Plus signature: Chromium 70 on Linux/Android without typical mobile
  // markers
  if (/chrome\/70\b/i.test(ua) && /linux/i.test(ua)) return true;
  return false;
}

/**
 * Returns true if CAPTCHA should be skipped for this device.
 * Currently only DJI controllers are bypassed, but Turnstile-load failures
 * are handled separately by the widget itself.
 */
export function shouldSkipCaptcha(): boolean {
  return isDjiController();
}
