import "lenis/dist/lenis.css";
import "./globals.css";

import { LenisProvider } from "@/components/lenis-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
