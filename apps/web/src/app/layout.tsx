import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "IntentVisible",
  description: "AI-agent intent, declared before it acts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
