import type { GoogleDriveFileUpload } from "../entities/google-drive-file-upload";
import type { GoogleDriveStoredFile } from "../entities/google-drive-stored-file";

export interface GoogleDriveFilesRepository {
  saveApplicationMetadata(
    file: GoogleDriveFileUpload,
  ): Promise<GoogleDriveStoredFile>;
  saveUserFile(file: GoogleDriveFileUpload): Promise<GoogleDriveStoredFile>;
}
