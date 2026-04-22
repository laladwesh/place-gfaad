import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";

import { Providers } from "./providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: "Mini PaaS Platform",
  description: "Deploy from GitHub push to live subdomain"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
