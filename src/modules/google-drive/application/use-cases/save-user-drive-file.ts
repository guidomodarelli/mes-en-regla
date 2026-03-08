import type { GoogleDriveFileUpload } from "../../domain/entities/google-drive-file-upload";
import type { GoogleDriveStoredFile } from "../../domain/entities/google-drive-stored-file";
import type { GoogleDriveFilesRepository } from "../../domain/repositories/google-drive-files-repository";
import type { SaveUserDriveFileCommand } from "../commands/save-user-drive-file-command";

interface SaveUserDriveFileDependencies {
  command: SaveUserDriveFileCommand;
  repository: GoogleDriveFilesRepository;
}

function validateGoogleDriveFileUpload(
  upload: GoogleDriveFileUpload,
  operationName: string,
): GoogleDriveFileUpload {
  const normalizedUpload = {
    content: upload.content.trim(),
    mimeType: upload.mimeType.trim(),
    name: upload.name.trim(),
  };

  if (!normalizedUpload.name) {
    throw new Error(`${operationName} requires a non-empty file name.`);
  }

  if (!normalizedUpload.mimeType) {
    throw new Error(`${operationName} requires a MIME type.`);
  }

  if (!normalizedUpload.content) {
    throw new Error(`${operationName} requires file content.`);
  }

  return normalizedUpload;
}

export async function saveUserDriveFile({
  command,
  repository,
}: SaveUserDriveFileDependencies): Promise<GoogleDriveStoredFile> {
  const validatedUpload = validateGoogleDriveFileUpload(
    command,
    "Saving a My Drive file",
  );

  return repository.saveUserFile(validatedUpload);
}
