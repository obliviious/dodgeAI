import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dodge | Order to Cash Explorer",
  description: "Context-aware O2C graph and NL query interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
