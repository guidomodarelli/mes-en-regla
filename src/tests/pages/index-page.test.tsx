import { render, screen } from "@testing-library/react";

import HomePage from "@/pages/index";
import type { GoogleDriveBootstrapResult } from "@/modules/google-drive/application/results/google-drive-bootstrap-result";

const bootstrap: GoogleDriveBootstrapResult = {
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
};

describe("HomePage", () => {
  it("renders the Google Drive bootstrap overview", () => {
    render(<HomePage bootstrap={bootstrap} hasBootstrapError={false} />);

    expect(
      screen.getByRole("heading", { name: "Mis Finanzas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Conectar Google" }),
    ).toHaveAttribute("href", "/auth/signin");
    expect(
      screen.getByText("https://www.googleapis.com/auth/drive.appdata"),
    ).toBeInTheDocument();
  });

  it("renders a safe fallback message when bootstrap fails", () => {
    render(<HomePage bootstrap={bootstrap} hasBootstrapError />);

    expect(
      screen.getByText(
        "No pudimos preparar la configuración inicial de Google Drive. Reintentá más tarde.",
      ),
    ).toBeInTheDocument();
  });
});
