import type { Metadata, Viewport } from "next";
import { preload } from "react-dom";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hack Club tty",
  description: "A Hack Club YSWS powered by libghostty",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  preload("/ghostty-vt.wasm", { as: "fetch", crossOrigin: "anonymous" });
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
