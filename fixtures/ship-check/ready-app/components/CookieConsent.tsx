"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useState } from "react";

export function CookieConsent({ gaId }: { gaId?: string }) {
  const [consent, setConsent] = useState<"granted" | "denied" | null>(null);
  if (consent === "granted" && gaId) return <GoogleAnalytics gaId={gaId} />;
  if (consent) return null;
  return (
    <div role="dialog" aria-label="Cookie consent">
      <p>We use analytics cookies to improve the site.</p>
      <button type="button" onClick={() => setConsent("granted")}>
        Accept
      </button>
      <button type="button" onClick={() => setConsent("denied")}>
        Decline
      </button>
    </div>
  );
}
