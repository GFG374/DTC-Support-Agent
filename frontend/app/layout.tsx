import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DTC Support Agent",
  description: "Fast-track returns, exchanges, and WISMO with an AI-assisted workflow.",
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
