import "@/styles/globals.css";
import "@/styles/globals.scss";

import { Geist, Geist_Mono } from "next/font/google";
import type { AppProps } from "next/app";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

type PagePropsWithSession = {
  session?: Session | null;
};

export default function App({
  Component,
  pageProps,
}: AppProps<PagePropsWithSession>) {
  const { session, ...restPageProps } = pageProps;

  return (
    <SessionProvider session={session}>
      <div className={`${geistSans.variable} ${geistMono.variable}`}>
        <Component {...restPageProps} />
      </div>
    </SessionProvider>
  );
}
