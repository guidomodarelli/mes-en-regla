import Link from "next/link";
import type {
  GetServerSidePropsContext,
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
import { getAuthErrorMessage } from "@/lib/auth/get-auth-error-message";

import styles from "./auth-page.module.scss";

export default function AuthErrorPage({
  errorCode,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>No pudimos conectar tu cuenta</CardTitle>
          <CardDescription>
            La aplicación protege los detalles internos y muestra una respuesta
            segura cuando la autenticación falla.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className={styles.warning}>{getAuthErrorMessage(errorCode)}</p>
        </CardContent>
        <CardFooter className={styles.actions}>
          <Button asChild>
            <Link href="/auth/signin">Intentar de nuevo</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Ir al inicio</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  return {
    props: {
      errorCode:
        typeof context.query.error === "string"
          ? context.query.error
          : undefined,
    },
  };
}
