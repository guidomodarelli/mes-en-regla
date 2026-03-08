import { google, type drive_v3 } from "googleapis";

export function createGoogleDriveClient(accessToken: string): drive_v3.Drive {
  return google.drive({
    auth: accessToken,
    version: "v3",
  });
}
