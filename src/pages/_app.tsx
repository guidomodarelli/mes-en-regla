import "@/styles/globals.css";
import "@/styles/globals.scss";

import Head from "next/head";
import { Inter, Geist_Mono } from "next/font/google";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { ThemeProvider } from "next-themes";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { registerServiceWorker } from "@/modules/shared/infrastructure/pages/register-service-worker";

const interSans = Inter({
  subsets: ["latin"],
  variable: "--font-inter-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

type PagePropsWithSession = {
  session?: Session | null;
};

const APP_NAME = "XFly";
const APP_DESCRIPTION = "Gestiona tus gastos, prestamistas y reportes mensuales.";
const APP_THEME_COLOR = "#121826";
const PAGE_TITLE_BY_PATHNAME: Record<string, string> = {
  "/": "Inicio",
  "/auth/error": "Error de autenticacion",
  "/auth/signin": "Conectar Google",
  "/cotizaciones": "Cotizaciones del dolar",
  "/gastos": "Gastos del mes",
  "/prestamistas": "Prestamistas",
  "/reportes/deudas": "Reporte de deudas",
};

function getDocumentTitle(pathname: string): string {
  const pageTitle = PAGE_TITLE_BY_PATHNAME[pathname];

  return pageTitle ? `${pageTitle} | ${APP_NAME}` : APP_NAME;
}

export default function App({
  Component,
  pageProps,
}: AppProps<PagePropsWithSession>) {
  const router = useRouter();
  const { session, ...restPageProps } = pageProps;
  const documentTitle = getDocumentTitle(router.pathname);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    async function loadReactGrabCodexProvider() {
      await import("react-grab");
      await import("@react-grab/codex/client");
    }

    void loadReactGrabCodexProvider();
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <SessionProvider session={session}>
      <Head>
        <title>{documentTitle}</title>
        <meta content={APP_DESCRIPTION} name="description" />
        <meta content={APP_NAME} name="application-name" />
        <meta content={APP_THEME_COLOR} name="theme-color" />
        <meta content="yes" name="mobile-web-app-capable" />
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content={APP_NAME} name="apple-mobile-web-app-title" />
        <meta content="default" name="apple-mobile-web-app-status-bar-style" />
        <link href="/manifest.webmanifest" rel="manifest" />
        <link href="/apple-touch-icon.png" rel="apple-touch-icon" />
      </Head>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableColorScheme={false}
        enableSystem
        storageKey="theme"
        themes={["light", "dark"]}
      >
        <TooltipProvider>
          <div className={`${interSans.className} ${interSans.variable} ${geistMono.variable}`}>
            <Component {...restPageProps} />
            <Toaster closeButton position="top-center" richColors />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
