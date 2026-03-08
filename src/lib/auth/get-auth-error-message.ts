const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "No pudimos autorizar la conexión con Google. Revisá la configuración del proyecto e intentá nuevamente.",
  Configuration:
    "La autenticación no está disponible en este entorno todavía. Completá la configuración del servidor y reintentá.",
  Default:
    "No pudimos completar la autenticación con Google. Intentá nuevamente en unos minutos.",
  OAuthAccountNotLinked:
    "La cuenta elegida ya está asociada a otro método de acceso. Probá con la cuenta correcta o reiniciá la conexión.",
  OAuthCallback:
    "Google no devolvió una respuesta válida para completar el acceso. Intentá nuevamente.",
  OAuthSignin:
    "No pudimos iniciar la autenticación con Google. Intentá nuevamente.",
};

export function getAuthErrorMessage(errorCode?: string): string {
  if (!errorCode) {
    return AUTH_ERROR_MESSAGES.Default;
  }

  return AUTH_ERROR_MESSAGES[errorCode] ?? AUTH_ERROR_MESSAGES.Default;
}
