import Link from "next/link";
import type {
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import { getServerSession } from "next-auth/next";
import {
  getProviders,
  signIn,
  type ClientSafeProvider,
} from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/server/auth/auth-options";

import styles from "./auth-page.module.scss";

type ProviderMap = Record<string, ClientSafeProvider>;

export default function SignInPage({
  hasProviderError,
  providers,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const googleProvider = Object.values(providers).find(
    (provider) => provider.id === "google",
  );

  const handleGoogleSignIn = () => {
    if (!googleProvider) {
      return;
    }

    void signIn(googleProvider.id, { callbackUrl: "/" });
  };

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>Conectar Google</CardTitle>
          <CardDescription>
            Esta base usa Pages Router, SSR y una capa middleend para preparar la
            integración con Google Drive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {googleProvider ? (
            <p className={styles.warning}>
              El login usa el proveedor oficial de Google y solicita acceso
              mínimo para `appDataFolder` y archivos elegidos por el usuario.
            </p>
          ) : (
            <p className={styles.warning}>
              La autenticación con Google todavía no está lista en este entorno.
              Completá las variables del servidor y reintentá.
            </p>
          )}
          {hasProviderError ? (
            <p className={styles.warning}>
              No pudimos consultar los proveedores de autenticación. Reintentá
              más tarde.
            </p>
          ) : null}
        </CardContent>
        <CardFooter className={styles.actions}>
          <Button
            disabled={!googleProvider || hasProviderError}
            onClick={handleGoogleSignIn}
            type="button"
          >
            Continuar con Google
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  try {
    const session = await getServerSession(
      context.req,
      context.res,
      authOptions,
    );

    if (session) {
      return {
        redirect: {
          destination: "/",
          permanent: false,
        },
      };
    }

    const providers = (await getProviders()) ?? {};

    return {
      props: {
        hasProviderError: false,
        providers: providers as ProviderMap,
      },
    };
  } catch {
    return {
      props: {
        hasProviderError: true,
        providers: {} as ProviderMap,
      },
    };
  }
}
