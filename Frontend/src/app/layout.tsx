import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/components/ui/confirm";
import { SessionProvider } from "@/hooks/useSession";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "HR Pulse",
  description: "HR, attendance, payroll and commission management",
  icons: { icon: "/logo-deep-royal-blue.svg", shortcut: "/logo-deep-royal-blue.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <SessionProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
