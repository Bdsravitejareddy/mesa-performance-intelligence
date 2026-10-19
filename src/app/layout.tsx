import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mesa | Performance Intelligence",
  description: "Course-grounded academic and professional performance intelligence.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
