import { getGoogleDriveBootstrapConfig } from "./get-google-drive-bootstrap-config";

describe("getGoogleDriveBootstrapConfig", () => {
  it("returns the pages-router bootstrap contract for the home page", () => {
    const result = getGoogleDriveBootstrapConfig({
      isGoogleOAuthConfigured: true,
      requiredScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.appdata",
      ],
    });

    expect(result).toEqual({
      architecture: {
        dataStrategy: "ssr-first",
        middleendLocation: "src/modules",
        routing: "pages-router",
      },
      authStatus: "configured",
      requiredScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.appdata",
      ],
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
    });
  });

  it("marks the auth status as pending when OAuth is not configured yet", () => {
    const result = getGoogleDriveBootstrapConfig({
      isGoogleOAuthConfigured: false,
      requiredScopes: [],
    });

    expect(result.authStatus).toBe("pending");
  });
});
