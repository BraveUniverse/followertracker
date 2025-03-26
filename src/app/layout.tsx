import type { Metadata } from "next";
// Font importlarını kaldırıyoruz
// import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from '@/contexts/WalletContext';
import { Toaster } from 'react-hot-toast';

// Font tanımlamalarını kaldırıyoruz
// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });
// 
// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "Follower Analytics & Suggestion System",
  description: "Decentralized platform for follower analytics and management on the LUKSO blockchain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        // Font değişkenlerini kaldırıyoruz, yerine sistem fontlarını kullanıyoruz
        className="antialiased"
      >
        <WalletProvider>
          <main>
            {children}
          </main>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3000,
              style: {
                background: '#333',
                color: '#fff',
              },
              success: {
                duration: 3000,
                style: {
                  background: '#48BB78',
                  color: '#fff',
                },
              },
              error: {
                duration: 4000,
                style: {
                  background: '#F56565',
                  color: '#fff',
                },
              },
            }}
          />
        </WalletProvider>
      </body>
    </html>
  );
}
