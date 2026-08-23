import type { Metadata } from "next";
import { Patrick_Hand } from "next/font/google";
import "./globals.css";

const patrickHand = Patrick_Hand({
  variable: "--font-patrick-hand",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume Version Control",
  description: "Object-based resume version control with AI career Q&A",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={patrickHand.variable}>
      <body>{children}</body>
    </html>
  );
}
