import { mapGoogleDriveFileDtoToDomain } from "./mapper";

describe("mapGoogleDriveFileDtoToDomain", () => {
  it("maps appDataFolder files into the domain model", () => {
    const result = mapGoogleDriveFileDtoToDomain({
      id: "file-id",
      mimeType: "application/json",
      name: "app-metadata.json",
      parents: ["appDataFolder"],
      webViewLink: null,
    });

    expect(result).toEqual({
      id: "file-id",
      mimeType: "application/json",
      name: "app-metadata.json",
      target: "appDataFolder",
      webViewLink: null,
    });
  });

  it("defaults non-appDataFolder files to My Drive", () => {
    const result = mapGoogleDriveFileDtoToDomain({
      id: "user-file-id",
      mimeType: "text/csv",
      name: "expenses.csv",
      parents: ["root"],
      webViewLink: "https://drive.google.com/file/d/user-file-id/view",
    });

    expect(result.target).toBe("myDrive");
  });

  it("throws a precise error when required fields are missing", () => {
    expect(() =>
      mapGoogleDriveFileDtoToDomain({
        name: "invalid-file",
      }),
    ).toThrow(
      "Cannot map a Google Drive file DTO without id, name, and mimeType.",
    );
  });
});
