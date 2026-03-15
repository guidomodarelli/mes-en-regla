import Link from "next/link";
import type { ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  IconBuildingBank,
  IconCalendarDollar,
  IconCashBanknote,
  IconReportMoney,
} from "@tabler/icons-react";

import { GoogleAccountAvatar } from "@/components/auth/google-account-avatar";
import { PwaUpdateControl } from "@/components/pwa/pwa-update-control";
import { ThemeModeToggle } from "@/components/theme/theme-mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import styles from "./finance-app-shell.module.scss";

export type FinanceAppSectionKey =
  | "expenses"
  | "exchange-rates"
  | "lenders"
  | "debts";

interface FinanceAppShellProps {
  activeSection: FinanceAppSectionKey;
  authRedirectPath: string;
  children: ReactNode;
  expensesMonth?: string;
  initialSidebarOpen?: boolean;
  isOAuthConfigured: boolean;
}

export function FinanceAppShell({
  activeSection,
  authRedirectPath,
  children,
  expensesMonth,
  initialSidebarOpen = true,
  isOAuthConfigured,
}: FinanceAppShellProps) {
  const { data: session, status } = useSession();
  const sessionUserImage = session?.user?.image?.trim() || null;
  const sessionUserName = session?.user?.name?.trim() || null;

  const handleGoogleAccountConnect = () => {
    if (!isOAuthConfigured) {
      return;
    }

    void signIn("google", {
      callbackUrl: authRedirectPath,
    });
  };

  const handleGoogleAccountDisconnect = () => {
    void signOut({
      callbackUrl: authRedirectPath,
    });
  };

  const expensesHref = expensesMonth
    ? {
        pathname: "/gastos",
        query: {
          month: expensesMonth,
        },
      }
    : "/gastos";

  return (
    <SidebarProvider defaultOpen={initialSidebarOpen}>
      <Sidebar className={styles.sidebarShell} collapsible="icon" variant="inset">
        <SidebarHeader
          className={`${styles.sidebarHeader} group-data-[collapsible=icon]:hidden`}
        >
          <p className={styles.sidebarTitle}>Mis finanzas</p>
          <p className={styles.sidebarSubtitle}>Navegacion principal</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Secciones</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activeSection === "expenses"}
                  tooltip="Gastos del mes"
                >
                  <Link href={expensesHref}>
                    <IconCalendarDollar />
                    <span>Gastos del mes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activeSection === "exchange-rates"}
                  tooltip="Cotizaciones del dólar"
                >
                  <Link href="/cotizaciones">
                    <IconCashBanknote />
                    <span>Cotizaciones del dólar</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activeSection === "lenders"}
                  tooltip="Prestadores"
                >
                  <Link href="/prestadores">
                    <IconBuildingBank />
                    <span>Prestadores</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={activeSection === "debts"}
                  tooltip="Reporte de deudas"
                >
                  <Link href="/reportes/deudas">
                    <IconReportMoney />
                    <span>Reporte de deudas</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <div className={styles.sidebarEdgeTriggerDock}>
          <SidebarTrigger className={styles.sidebarEdgeTrigger} />
        </div>
      </Sidebar>

      <SidebarInset>
        <main className={styles.page}>
          <div className={styles.layout}>
            <div className={styles.topBar}>
              <SidebarTrigger
                aria-label="Abrir menu lateral"
                className={styles.mobileSidebarTrigger}
              />
              <PwaUpdateControl />
              <ThemeModeToggle />
              <GoogleAccountAvatar
                onConnect={handleGoogleAccountConnect}
                onDisconnect={handleGoogleAccountDisconnect}
                status={status}
                userImage={sessionUserImage}
                userName={sessionUserName}
              />
            </div>
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
