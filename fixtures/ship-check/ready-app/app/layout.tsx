import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CookieConsent } from "@/components/CookieConsent";
import { env } from "@/lib/env";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(env.SITE_URL),
  title: { default: "Acme Plumbing", template: "%s · Acme Plumbing" },
  description: "Book a plumber in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body>
        {children}
        <CookieConsent gaId={env.NEXT_PUBLIC_GA_ID} />
      </body>
    </html>
  );
}
