import type { drive_v3 } from "googleapis";

import type { GoogleDriveFileUpload } from "../../domain/entities/google-drive-file-upload";
import type { GoogleDriveStoredFile } from "../../domain/entities/google-drive-stored-file";
import type { GoogleDriveFilesRepository } from "../../domain/repositories/google-drive-files-repository";
import { mapGoogleDriveFileDtoToDomain } from "../api/dto/mapper";

const DRIVE_FILE_FIELDS = "id,name,mimeType,parents,webViewLink";

export class GoogleDriveFilesRepositoryGoogleApis
  implements GoogleDriveFilesRepository
{
  constructor(private readonly driveClient: drive_v3.Drive) {}

  async saveApplicationMetadata(
    file: GoogleDriveFileUpload,
  ): Promise<GoogleDriveStoredFile> {
    const response = await this.driveClient.files.create({
      fields: DRIVE_FILE_FIELDS,
      media: {
        body: file.content,
        mimeType: file.mimeType,
      },
      requestBody: {
        name: file.name,
        parents: ["appDataFolder"],
      },
    });

    return mapGoogleDriveFileDtoToDomain(response.data);
  }

  async saveUserFile(
    file: GoogleDriveFileUpload,
  ): Promise<GoogleDriveStoredFile> {
    const response = await this.driveClient.files.create({
      fields: DRIVE_FILE_FIELDS,
      media: {
        body: file.content,
        mimeType: file.mimeType,
      },
      requestBody: {
        name: file.name,
      },
    });

    return mapGoogleDriveFileDtoToDomain(response.data);
  }
}
