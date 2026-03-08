export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.appdata",
] as const;

export const GOOGLE_DRIVE_SCOPE_STRING = GOOGLE_DRIVE_SCOPES.join(" ");
