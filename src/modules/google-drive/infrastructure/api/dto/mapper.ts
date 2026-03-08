import type { GoogleDriveStoredFile } from "../../../domain/entities/google-drive-stored-file";
import type { GoogleDriveFileDto } from "./google-drive-file.dto";

export function mapGoogleDriveFileDtoToDomain(
  dto: GoogleDriveFileDto,
): GoogleDriveStoredFile {
  if (!dto.id || !dto.name || !dto.mimeType) {
    throw new Error(
      "Cannot map a Google Drive file DTO without id, name, and mimeType.",
    );
  }

  return {
    id: dto.id,
    mimeType: dto.mimeType,
    name: dto.name,
    target:
      dto.parents?.includes("appDataFolder") === true
        ? "appDataFolder"
        : "myDrive",
    webViewLink: dto.webViewLink ?? null,
  };
}
