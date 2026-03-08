import Link from "next/link";
import type {
  GetServerSideProps,
  InferGetServerSidePropsType,
} from "next";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getGoogleDriveBootstrapConfig } from "@/modules/google-drive/application/use-cases/get-google-drive-bootstrap-config";
import type {
  GoogleDriveBootstrapResult,
  GoogleDriveStorageTargetResult,
} from "@/modules/google-drive/application/results/google-drive-bootstrap-result";
import { GOOGLE_DRIVE_SCOPES } from "@/modules/google-drive/infrastructure/auth/google-drive-scopes";
import { isGoogleOAuthConfigured } from "@/server/auth/google-oauth-config";

import styles from "./index.module.scss";

const STORAGE_TARGET_COPY: Record<
  GoogleDriveStorageTargetResult["id"],
  {
    description: string;
    note: string;
    title: string;
  }
> = {
  appDataFolder: {
    description:
      "Guarda metadatos de la aplicación que el usuario no necesita manipular directamente.",
    note: "Usa `parents: ['appDataFolder']` y nunca expone estos archivos en My Drive.",
    title: "Metadatos de aplicación",
  },
  myDrive: {
    description:
      "Guarda archivos visibles del usuario usando alcance mínimo y acceso explícito.",
    note: "Mantiene el acceso restringido a archivos creados por la app o elegidos por el usuario.",
    title: "Archivos del usuario",
  },
};

type HomePageProps = {
  bootstrap: GoogleDriveBootstrapResult;
  hasBootstrapError: boolean;
};

export default function HomePage({
  bootstrap,
  hasBootstrapError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const isOAuthConfigured = bootstrap.authStatus === "configured";

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <Card className={styles.heroCard}>
          <CardHeader>
            <p className={styles.eyebrow}>Pages Router + SSR + Hexagonal</p>
            <h1 className={cn("leading-none font-semibold", styles.heroTitle)}>
              Mis Finanzas
            </h1>
            <CardDescription>
              Base inicial con arquitectura hexagonal, `shadcn/ui`, `SCSS` y
              configuración segura para conectar Google OAuth y Google Drive.
            </CardDescription>
          </CardHeader>
          <CardContent className={styles.heroContent}>
            <div className={styles.meta}>
              <span
                className={cn(
                  styles.status,
                  !isOAuthConfigured && styles.statusPending,
                )}
              >
                OAuth {isOAuthConfigured ? "configurado" : "pendiente"}
              </span>
              <span className={styles.status}>
                {bootstrap.architecture.routing}
              </span>
              <span className={styles.status}>
                {bootstrap.architecture.dataStrategy}
              </span>
            </div>
            {hasBootstrapError ? (
              <p className={styles.error}>
                No pudimos preparar la configuración inicial de Google Drive.
                Reintentá más tarde.
              </p>
            ) : null}
            <ul className={styles.scopeList}>
              {bootstrap.requiredScopes.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </CardContent>
          <CardFooter className={styles.actions}>
            <Button asChild>
              <Link href="/auth/signin">Conectar Google</Link>
            </Button>
            <Button asChild variant="outline">
              <a
                href="https://developers.google.com/drive/api/guides/appdata"
                rel="noreferrer"
                target="_blank"
              >
                Ver referencia de Drive
              </a>
            </Button>
          </CardFooter>
        </Card>

        <section className={styles.targetsGrid}>
          {bootstrap.storageTargets.map((storageTarget) => {
            const copy = STORAGE_TARGET_COPY[storageTarget.id];

            return (
              <Card key={storageTarget.id}>
                <CardHeader>
                  <CardTitle>{copy.title}</CardTitle>
                  <CardDescription>{copy.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className={styles.targetList}>
                    <li>Scope requerido: {storageTarget.scope}</li>
                    <li>
                      Visible para el usuario:{" "}
                      {storageTarget.writesUserVisibleFiles ? "sí" : "no"}
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <p className={styles.targetNote}>{copy.note}</p>
                </CardFooter>
              </Card>
            );
          })}
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<HomePageProps> = async () => {
  try {
    return {
      props: {
        bootstrap: getGoogleDriveBootstrapConfig({
          isGoogleOAuthConfigured: isGoogleOAuthConfigured(),
          requiredScopes: GOOGLE_DRIVE_SCOPES,
        }),
        hasBootstrapError: false,
      },
    };
  } catch {
    return {
      props: {
        bootstrap: getGoogleDriveBootstrapConfig({
          isGoogleOAuthConfigured: false,
          requiredScopes: [],
        }),
        hasBootstrapError: true,
      },
    };
  }
};
