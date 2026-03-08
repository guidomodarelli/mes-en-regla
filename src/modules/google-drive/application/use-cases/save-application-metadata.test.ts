import type { GoogleDriveStoredFile } from "../../domain/entities/google-drive-stored-file";
import type { GoogleDriveFilesRepository } from "../../domain/repositories/google-drive-files-repository";
import { saveApplicationMetadata } from "./save-application-metadata";

describe("saveApplicationMetadata", () => {
  it("delegates a validated metadata payload to the repository", async () => {
    const storedFile: GoogleDriveStoredFile = {
      id: "metadata-file-id",
      mimeType: "application/json",
      name: "app-metadata.json",
      target: "appDataFolder",
      webViewLink: null,
    };

    const repository: GoogleDriveFilesRepository = {
      saveApplicationMetadata: jest.fn().mockResolvedValue(storedFile),
      saveUserFile: jest.fn(),
    };

    const result = await saveApplicationMetadata({
      command: {
        content: "{\"theme\":\"dark\"}",
        mimeType: "application/json",
        name: "app-metadata.json",
      },
      repository,
    });

    expect(repository.saveApplicationMetadata).toHaveBeenCalledWith({
      content: "{\"theme\":\"dark\"}",
      mimeType: "application/json",
      name: "app-metadata.json",
    });
    expect(result).toEqual(storedFile);
  });

  it("rejects empty file names before touching the repository", async () => {
    const repository: GoogleDriveFilesRepository = {
      saveApplicationMetadata: jest.fn(),
      saveUserFile: jest.fn(),
    };

    await expect(
      saveApplicationMetadata({
        command: {
          content: "{\"theme\":\"dark\"}",
          mimeType: "application/json",
          name: "   ",
        },
        repository,
      }),
    ).rejects.toThrow("Saving application metadata requires a non-empty file name.");

    expect(repository.saveApplicationMetadata).not.toHaveBeenCalled();
  });
});
