export type GoogleDriveStorageTarget = "appDataFolder" | "myDrive";

export interface GoogleDriveStoredFile {
  id: string;
  mimeType: string;
  name: string;
  target: GoogleDriveStorageTarget;
  webViewLink: string | null;
}
