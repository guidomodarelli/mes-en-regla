import type { GetGoogleDriveBootstrapQuery } from "../queries/get-google-drive-bootstrap-query";
import type { GoogleDriveBootstrapResult } from "../results/google-drive-bootstrap-result";

export function getGoogleDriveBootstrapConfig({
  isGoogleOAuthConfigured,
  requiredScopes,
}: GetGoogleDriveBootstrapQuery): GoogleDriveBootstrapResult {
  return {
    architecture: {
      dataStrategy: "ssr-first",
      middleendLocation: "src/modules",
      routing: "pages-router",
    },
    authStatus: isGoogleOAuthConfigured ? "configured" : "pending",
    requiredScopes: [...requiredScopes],
    storageTargets: [
      {
        id: "appDataFolder",
        scope: "https://www.googleapis.com/auth/drive.appdata",
        writesUserVisibleFiles: false,
      },
      {
        id: "myDrive",
        scope: "https://www.googleapis.com/auth/drive.file",
        writesUserVisibleFiles: true,
      },
    ],
  };
}
