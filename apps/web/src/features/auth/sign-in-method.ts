/** Pop-up errors where a redirect still works; anything else (the user closed it) is reported. */
const REDIRECT_WORTHY = new Set(["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"]);

/**
 * Google sign-in (release blocker A6). An installed PWA goes straight to a redirect, because
 * pop-ups often fail in standalone mode; a browser tab tries the pop-up and falls back.
 */
export async function signInWithFallback(options: {
  standalone: boolean;
  popup: () => Promise<unknown>;
  redirect: () => Promise<unknown>;
}): Promise<void> {
  if (options.standalone) {
    await options.redirect();
    return;
  }
  try {
    await options.popup();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && REDIRECT_WORTHY.has(code)) {
      await options.redirect();
      return;
    }
    throw error;
  }
}

/** True when the app runs installed (home-screen PWA), on Android or iOS. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}
