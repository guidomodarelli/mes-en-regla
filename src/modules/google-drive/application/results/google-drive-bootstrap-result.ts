import type { GoogleDriveStorageTarget } from "../../domain/entities/google-drive-stored-file";

export interface GoogleDriveStorageTargetResult {
  id: GoogleDriveStorageTarget;
  scope: string;
  writesUserVisibleFiles: boolean;
}

export interface GoogleDriveBootstrapResult {
  architecture: {
    dataStrategy: "ssr-first";
    middleendLocation: "src/modules";
    routing: "pages-router";
  };
  authStatus: "configured" | "pending";
  requiredScopes: string[];
  storageTargets: GoogleDriveStorageTargetResult[];
}
