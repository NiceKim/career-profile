import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Version Control",
  description: "Object-based resume version control with AI career Q&A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
