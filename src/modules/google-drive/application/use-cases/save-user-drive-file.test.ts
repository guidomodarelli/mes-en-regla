import type { GoogleDriveStoredFile } from "../../domain/entities/google-drive-stored-file";
import type { GoogleDriveFilesRepository } from "../../domain/repositories/google-drive-files-repository";
import { saveUserDriveFile } from "./save-user-drive-file";

describe("saveUserDriveFile", () => {
  it("delegates validated user files to the repository", async () => {
    const storedFile: GoogleDriveStoredFile = {
      id: "user-file-id",
      mimeType: "text/csv",
      name: "expenses.csv",
      target: "myDrive",
      webViewLink: "https://drive.google.com/file/d/user-file-id/view",
    };

    const repository: GoogleDriveFilesRepository = {
      saveApplicationMetadata: jest.fn(),
      saveUserFile: jest.fn().mockResolvedValue(storedFile),
    };

    const result = await saveUserDriveFile({
      command: {
        content: "date,amount\n2026-03-08,32.5",
        mimeType: "text/csv",
        name: "expenses.csv",
      },
      repository,
    });

    expect(repository.saveUserFile).toHaveBeenCalledWith({
      content: "date,amount\n2026-03-08,32.5",
      mimeType: "text/csv",
      name: "expenses.csv",
    });
    expect(result).toEqual(storedFile);
  });
});
