import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { LojaProvider } from "@/contexts/LojaContext";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["500", "600"],
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Painel Caruaru Móveis",
  description: "Cadastro de produtos, encomendas e notas — uso interno da equipe",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={`${fraunces.variable} ${inter.variable} font-sans flex`}>
        <LojaProvider>
          <Sidebar />
          <div className="flex-1 min-h-screen flex flex-col min-w-0">
            <TopBar />
            <main className="flex-1">{children}</main>
          </div>
        </LojaProvider>
      </body>
    </html>
  );
}
