import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Bench" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <nav>
            <Link href="/">Products</Link> <Link href="/about">About</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
