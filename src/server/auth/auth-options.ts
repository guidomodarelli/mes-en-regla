import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { getGoogleOAuthServerConfig } from "./google-oauth-config";

const googleOAuthServerConfig = getGoogleOAuthServerConfig();

const googleProvider = googleOAuthServerConfig
  ? GoogleProvider({
      authorization: {
        params: {
          access_type: "offline",
          prompt: "consent",
          response_type: "code",
          scope: googleOAuthServerConfig.scopeString,
        },
      },
      clientId: googleOAuthServerConfig.clientId,
      clientSecret: googleOAuthServerConfig.clientSecret,
    })
  : null;

export const authOptions: NextAuthOptions = {
  pages: {
    error: "/auth/error",
    signIn: "/auth/signin",
  },
  providers: googleProvider ? [googleProvider] : [],
  secret: googleOAuthServerConfig?.nextAuthSecret,
  session: {
    strategy: "jwt",
  },
};
