import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

import ReceiptShareTargetPage from "./receipt-share-target-page";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock("@/components/finance-app-shell/finance-app-shell", () => ({
  FinanceAppShell: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/ui/typing-animation", () => ({
  TypingAnimation: ({ children }: { children: ReactNode }) => (
    <h1>{children}</h1>
  ),
}));

jest.mock("@/components/monthly-expenses/receipt-file-uploader", () => ({
  ReceiptFileUploader: ({ onInvalidFileType }: { onInvalidFileType?: () => void }) => (
    <div data-testid="receipt-file-uploader">
      <button onClick={onInvalidFileType} type="button">
        trigger-invalid-file-type
      </button>
    </div>
  ),
}));

jest.mock("@/modules/monthly-expenses/infrastructure/pwa/shared-receipt-payload", () => ({
  clearSharedReceiptPayload: jest.fn(),
  consumeSharedReceiptPayload: jest.fn(),
  readSharedReceiptPayload: jest.fn().mockResolvedValue(null),
}));

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseSession = jest.mocked(useSession);

describe("ReceiptShareTargetPage", () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({
      pathname: "/recibir-comprobante",
      push: jest.fn().mockResolvedValue(true),
      query: {},
      replace: jest.fn().mockResolvedValue(true),
    } as unknown as ReturnType<typeof useRouter>);
    mockedUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
  });

  it("keeps manual uploader available after selecting an invalid file type", async () => {
    const user = userEvent.setup();

    render(<ReceiptShareTargetPage />);

    await waitFor(() => {
      expect(screen.getByTestId("receipt-file-uploader")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "trigger-invalid-file-type" }));

    expect(screen.getByText("Solo se admiten comprobantes PDF, JPG, PNG, WEBP, HEIC o HEIF.")).toBeInTheDocument();
    expect(screen.getByTestId("receipt-file-uploader")).toBeInTheDocument();
  });
});
