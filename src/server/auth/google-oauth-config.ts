import { z } from "zod";

import {
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_DRIVE_SCOPE_STRING,
} from "@/modules/google-drive/infrastructure/auth/google-drive-scopes";

const googleOAuthServerEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1),
  NEXTAUTH_SECRET: z.string().trim().min(1),
});

export interface GoogleOAuthServerConfig {
  clientId: string;
  clientSecret: string;
  nextAuthSecret: string;
  scopes: readonly string[];
  scopeString: string;
}

export function getGoogleOAuthServerConfig(): GoogleOAuthServerConfig | null {
  const parsedEnvironment = googleOAuthServerEnvSchema.safeParse({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  });

  if (!parsedEnvironment.success) {
    return null;
  }

  return {
    clientId: parsedEnvironment.data.GOOGLE_CLIENT_ID,
    clientSecret: parsedEnvironment.data.GOOGLE_CLIENT_SECRET,
    nextAuthSecret: parsedEnvironment.data.NEXTAUTH_SECRET,
    scopes: GOOGLE_DRIVE_SCOPES,
    scopeString: GOOGLE_DRIVE_SCOPE_STRING,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthServerConfig() !== null;
}
