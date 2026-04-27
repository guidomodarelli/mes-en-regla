import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import { signIn, signOut, useSession } from "next-auth/react";
import { toast } from "sonner";

import {
  getSafeLendersErrorMessage,
  getSafeLoansReportErrorMessage,
  getSafeMonthlyExpensesLoadErrorMessage,
  getSafeMonthlyExpensesErrorMessage,
} from "@/modules/monthly-expenses/application/queries/get-monthly-expenses-page-feedback";
import MonthlyExpensesPage, { getReportProviderFilterOptions } from "@/pages/compromisos";

import {
  basePageProps,
  createDeferredValue,
  createMockRouter,
  createMonthlyExpensesFetchMock,
  getMonthlyExpensesDescriptionsOrder,
  getMonthlyExpensesSavePayload,
  registerMonthlyExpensesPageDefaultHooks,
  renderWithProviders,
  TABLE_PREFERENCES_STORAGE_KEY,
} from "./monthly-expenses-page-test-helpers";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  useSession: jest.fn(),
}));

jest.mock("sonner", () => {
  const mockToast = Object.assign(jest.fn(), {
    error: jest.fn(),
    info: jest.fn(),
    promise: jest.fn((promise: Promise<unknown>) => promise),
    success: jest.fn(),
    warning: jest.fn(),
  });

  return {
    toast: mockToast,
  };
});

type MockedToast = jest.Mock & {
  error: jest.Mock;
  info: jest.Mock;
  promise: jest.Mock;
  success: jest.Mock;
  warning: jest.Mock;
};

const mockedUseRouter = jest.mocked(useRouter);
const mockedUseSession = jest.mocked(useSession);
const mockedSignIn = jest.mocked(signIn);
const mockedSignOut = jest.mocked(signOut);
const mockedToast = toast as unknown as MockedToast;
const originalFetch = global.fetch;

describe("MonthlyExpensesPage lenders and reports", () => {

registerMonthlyExpensesPageDefaultHooks({
  createDefaultRouter: () => createMockRouter() as unknown as ReturnType<typeof useRouter>,
  mockedSignIn,
  mockedSignOut,
  mockedToast,
  mockedUseRouter,
  mockedUseSession,
  originalFetch,
});

  it("builds report lender filter options from catalog lenders and report entries with lender ids", () => {
    expect(
      getReportProviderFilterOptions(
        [
          {
            activeLoanCount: 1,
            expenseDescriptions: ["Tarjeta"],
            firstDebtMonth: "2026-01",
            lenderId: null,
            lenderName: "Prestamista manual",
            lenderType: "other",
            latestRecordedMonth: "2026-03",
            remainingAmount: 1000,
            trackedLoanCount: 1,
          },
        ],
        [
          {
            id: "lender-1",
            name: "Papa",
            type: "family",
          },
        ],
      ),
    ).toEqual([
      {
        id: "lender-1",
        label: "Papa",
      },
    ]);
  });

  it("maps technical report errors to a user-friendly message", () => {
    expect(
      getSafeLoansReportErrorMessage("repository.listAll is not a function"),
    ).toBe(
      "No pudimos actualizar el reporte de deudas en este momento. Igual podés seguir cargando compromisos y volver a intentarlo más tarde.",
    );
  });

  it("maps technical monthly expenses errors to a user-friendly message", () => {
    expect(
      getSafeMonthlyExpensesErrorMessage(
        "Google authentication is required before saving monthly expenses to Drive.",
      ),
    ).toBe("Conectate con Google para guardar tus compromisos mensuales en Drive.");
  });

  it("maps technical monthly expenses load errors to a user-friendly message", () => {
    expect(
      getSafeMonthlyExpensesLoadErrorMessage(
        "Google authentication is required before loading monthly expenses from Drive.",
      ),
    ).toBe("Conectate con Google para cargar tus compromisos mensuales.");
  });

  it("maps technical lenders errors to a user-friendly message", () => {
    expect(
      getSafeLendersErrorMessage(
        "The current Google session is missing the Drive permissions required to manage lenders.",
      ),
    ).toBe(
      "Tu sesión actual no tiene permisos suficientes para gestionar prestamistas en Drive.",
    );
  });

  it("shows a safe report error message without the empty-state copy", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialActiveTab="debts"
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
        reportLoadError="repository.listAll is not a function"
      />,
    );

    expect(
      screen.getByText(
        "No pudimos actualizar el reporte de deudas en este momento. Igual podés seguir cargando compromisos y volver a intentarlo más tarde.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No hay deudas registradas para los filtros seleccionados."),
    ).not.toBeInTheDocument();
  });

  it("shows a safe monthly expenses error message instead of a technical one", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        error:
          "Google authentication is required before saving monthly expenses to Drive.",
      }),
      ok: false,
    });

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "gus@example.com",
          name: "Gus",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar compromiso" }));
    fireEvent.change(screen.getByLabelText("Descripción"), {
      target: { value: "Expensas" },
    });
    fireEvent.change(screen.getByLabelText("Subtotal"), {
      target: { value: "55032,07" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "Conectate con Google para guardar tus compromisos mensuales en Drive.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Google authentication is required before saving monthly expenses to Drive.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a safe lenders error message instead of a technical one", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({
        error:
          "The current Google session is missing the Drive permissions required to manage lenders.",
      }),
      ok: false,
    });

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "gus@example.com",
          name: "Gus",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialActiveTab="lenders"
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar prestamista" }));
    await user.type(screen.getByLabelText("Nombre"), "Papa");
    await user.click(screen.getByRole("button", { name: "Guardar prestamista" }));

    expect(
      await screen.findByText(
        "Tu sesión actual no tiene permisos suficientes para gestionar prestamistas en Drive.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The current Google session is missing the Drive permissions required to manage lenders.",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders converted amounts in subtotal and total while hiding the USD column by default", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          exchangeRateLoadError: null,
          exchangeRateSnapshot: {
            blueRate: 1290,
            month: "2026-03",
            officialRate: 1200,
            solidarityRate: 1476,
          },
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 14760,
              total: 14760,
            },
            {
              currency: "USD",
              description: "Hosting",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 10,
              total: 10,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByRole("columnheader", { name: "ARS" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "USD" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Dólar oficial:/i)).toBeInTheDocument();
    expect(screen.getByText("$ 1.200")).toBeInTheDocument();
    expect(screen.getByText(/^Dólar solidario:/i)).toBeInTheDocument();
    expect(screen.getByText("$ 1.476")).toBeInTheDocument();
    expect(screen.getAllByText("$ 14.760,00").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/US\$\s*10,00/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/\(US\$\s*10,00\)/).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("renders the Link column after USD when USD is enabled and opens payment links in a new tab", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          exchangeRateLoadError: null,
          exchangeRateSnapshot: {
            blueRate: 1290,
            month: "2026-03",
            officialRate: 1200,
            solidarityRate: 1476,
          },
          items: [
            {
              currency: "USD",
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "pagos.empresa-energia.com",
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /USD/i }));
    await user.keyboard("{Escape}");

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");
    const usdHeaderIndex = headers.indexOf("USD");
    const linkHeaderIndex = headers.indexOf("Link");

    expect(usdHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(linkHeaderIndex).toBe(usdHeaderIndex + 1);

    const paymentLink = screen.getByRole("link", { name: "Abrir" });

    expect(paymentLink).toHaveAttribute(
      "href",
      "https://pagos.empresa-energia.com",
    );
    expect(paymentLink).toHaveAttribute("target", "_blank");
    expect(paymentLink).toHaveAttribute("rel", "noopener noreferrer");

    await user.hover(paymentLink);

    expect(screen.getAllByText("Abrir página de pago").length).toBeGreaterThan(0);
  });

  it("renders Pagos immediately before Registro de pagos", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");
    const paidHeaderIndex = headers.indexOf("Pagos");
    const paymentHistoryHeaderIndex = headers.indexOf("Registro de pagos");

    expect(paymentHistoryHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(paidHeaderIndex).toBe(paymentHistoryHeaderIndex - 1);
  });

  it("shows pending payments as a covered/total yellow badge when no manual or receipt coverage exists", () => {

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const pendingBadge = screen.getByText("0 / 1");

    expect(pendingBadge).toHaveClass(
      "bg-yellow-50",
      "text-yellow-700",
      "dark:bg-yellow-950",
      "dark:text-yellow-300",
    );
  });

  it("shows partial payment progress when covered payments are below occurrences", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 2,
              occurrencesPerMonth: 8,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const partialBadge = screen.getByText("5 / 8");

    expect(partialBadge).toHaveClass(
      "bg-yellow-50",
      "text-yellow-700",
      "dark:bg-yellow-950",
      "dark:text-yellow-300",
    );
  });

  it("shows completed payment progress as a covered/total badge with custom success colors", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Streaming",
              id: "expense-1",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 3,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 2,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const doneBadge = screen.getByText("3 / 3");

    expect(doneBadge).toHaveClass(
      "bg-green-50",
      "text-green-700",
      "dark:bg-green-950",
      "dark:text-green-300",
    );
  });

  it("updates manual covered payments from the table input column", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 0,
              occurrencesPerMonth: 8,
              subtotal: 100,
              total: 800,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Agregar nuevo registro de pago para Internet",
      }),
    );
    const manualPaymentsInput = screen.getByRole("spinbutton", {
      name: "¿Cuántos pagos desea cubrir?",
    });

    await user.clear(manualPaymentsInput);
    await user.type(manualPaymentsInput, "5");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]?.manualCoveredPayments).toBe(5);
    });
  });

  it("shows upload loading toast immediately and only once when registering a payment with receipt", async () => {
    const user = userEvent.setup();
    const deferredSaveResponse = createDeferredValue<{
      ok: boolean;
      status: number;
    }>();
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (input === "/api/storage/monthly-expenses-receipts") {
        return {
          json: async () => ({
            data: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
              registeredAt: "2026-03-10T12:00:00.000Z",
            },
          }),
          ok: true,
        };
      }

      if (input === "/api/storage/monthly-expenses") {
        return deferredSaveResponse.promise;
      }

      if (input === "/api/storage/monthly-expenses-report") {
        return {
          json: async () => ({
            data: {
              entries: [],
              summary: {
                activeLoanCount: 0,
                lenderCount: 0,
                remainingAmount: 0,
                trackedLoanCount: 0,
              },
            },
          }),
          ok: true,
        };
      }

      if (
        typeof input === "string" &&
        input.startsWith("/api/storage/monthly-expenses?")
      ) {
        return {
          json: async () => ({
            data: {
              items: [],
              month: "2026-03",
            },
          }),
          ok: true,
        };
      }

      throw new Error(`Unexpected fetch input: ${String(input)}`);
    });

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 0,
              occurrencesPerMonth: 4,
              subtotal: 100,
              total: 400,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Agregar nuevo registro de pago para Internet",
      }),
    );

    const receiptFile = new File(["receipt-content"], "comprobante.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Seleccionar comprobante"), receiptFile);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(mockedToast.promise).toHaveBeenCalledTimes(1);
    });

    expect(mockedToast.promise).toHaveBeenLastCalledWith(
      expect.any(Promise),
      expect.objectContaining({
        error: expect.any(Function),
        loading: "Guardando comprobante...",
        success: "Comprobante subido correctamente.",
      }),
    );

    deferredSaveResponse.resolve({
      ok: true,
      status: 204,
    });

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]?.paymentRecords[0]?.receipt?.fileId).toBe("receipt-file-id");
    });

    expect(mockedToast.promise).toHaveBeenCalledTimes(1);
  });

  it("does not persist manual payment draft changes until confirm is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 0,
              occurrencesPerMonth: 8,
              subtotal: 100,
              total: 800,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Agregar nuevo registro de pago para Internet",
      }),
    );
    const manualPaymentsInput = screen.getByRole("spinbutton", {
      name: "¿Cuántos pagos desea cubrir?",
    });

    await user.clear(manualPaymentsInput);
    await user.type(manualPaymentsInput, "5");

    expect(manualPaymentsInput).toHaveValue(5);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBe(false);
  });

  it("rejects the receipt save promise and triggers reauthentication on 401", async () => {
    const user = userEvent.setup();
    const deferredSaveResponse = createDeferredValue<{
      json: () => Promise<{ error: string }>;
      ok: boolean;
      status: number;
    }>();
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (input === "/api/storage/monthly-expenses-receipts") {
        return {
          json: async () => ({
            data: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "receipt-file-id",
              fileName: "comprobante.pdf",
              fileViewUrl:
                "https://drive.google.com/file/d/receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
              registeredAt: "2026-03-10T12:00:00.000Z",
            },
          }),
          ok: true,
        };
      }

      if (input === "/api/storage/monthly-expenses") {
        return deferredSaveResponse.promise;
      }

      if (input === "/api/storage/monthly-expenses-report") {
        return {
          json: async () => ({
            data: {
              entries: [],
              summary: {
                activeLoanCount: 0,
                lenderCount: 0,
                remainingAmount: 0,
                trackedLoanCount: 0,
              },
            },
          }),
          ok: true,
        };
      }

      if (
        typeof input === "string" &&
        input.startsWith("/api/storage/monthly-expenses?")
      ) {
        return {
          json: async () => ({
            data: {
              items: [],
              month: "2026-03",
            },
          }),
          ok: true,
        };
      }

      throw new Error(`Unexpected fetch input: ${String(input)}`);
    });

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 0,
              occurrencesPerMonth: 4,
              subtotal: 100,
              total: 400,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Agregar nuevo registro de pago para Internet",
      }),
    );

    const receiptFile = new File(["receipt-content"], "comprobante.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText("Seleccionar comprobante"), receiptFile);
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(mockedToast.promise).toHaveBeenCalledTimes(1);
    });

    const [receiptSavePromise] = mockedToast.promise.mock.lastCall as [
      Promise<unknown>,
    ];

    deferredSaveResponse.resolve({
      json: async () => ({
        error: "Google authentication is required before saving monthly expenses.",
      }),
      ok: false,
      status: 401,
    });

    await expect(receiptSavePromise).rejects.toThrow(
      "Google authentication is required before saving monthly expenses.",
    );

    await waitFor(() => {
      expect(mockedSignOut).toHaveBeenCalledWith({
        callbackUrl: "/auth/signin?callbackUrl=%2Fcompromisos%3Fmonth%3D2026-03",
      });
    });
  });

  it("blocks manual payment confirmation when requested coverage exceeds pending payments", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 3,
              paymentRecords: [
                {
                  coveredPayments: 1,
                  id: "manual-payment-1",
                  registeredAt: "2026-03-01T12:00:00.000Z",
                },
                {
                  coveredPayments: 1,
                  id: "manual-payment-2",
                  registeredAt: "2026-03-02T12:00:00.000Z",
                },
              ],
              subtotal: 100,
              total: 300,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /registros/i }));

    await user.click(
      screen.getByRole("button", {
        name: "Agregar nuevo registro de pago para Internet",
      }),
    );
    const manualPaymentsInput = screen.getByRole("spinbutton", {
      name: "¿Cuántos pagos desea cubrir?",
    });

    await user.clear(manualPaymentsInput);
    await user.type(manualPaymentsInput, "2");

    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBe(false);
  });

  it("requires confirmation before deleting a manual payment record from the popover menu", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 4,
              paymentRecords: [
                {
                  coveredPayments: 1,
                  id: "manual-payment-1",
                  registeredAt: "2026-03-01T12:00:00.000Z",
                },
              ],
              subtotal: 100,
              total: 400,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /1 registro/i }));

    await user.click(
      screen.getByRole("button", {
        name: /Abrir acciones de registro manual .* para Internet/i,
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Eliminar registro",
      }),
    );

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();
    expect(
      screen.getByRole("heading", { name: "¿Querés eliminar este registro manual?" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de registro manual de Internet",
      }),
    );

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(JSON.stringify(payload.items[0])).not.toContain("manual-payment-1");
    });
  });

  it("edits manual payment records from the same modal used for receipts without showing file details", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 4,
              paymentRecords: [
                {
                  coveredPayments: 1,
                  id: "manual-payment-1",
                  registeredAt: "2026-03-01T12:00:00.000Z",
                },
              ],
              subtotal: 100,
              total: 400,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /1 registro/i }));

    await user.click(
      screen.getByRole("button", {
        name: /Abrir acciones de registro manual .* para Internet/i,
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Editar registro",
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Editar registro de pago" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Archivo:/i)).not.toBeInTheDocument();

    const coveredPaymentsInput = screen.getByRole("spinbutton", {
      name: "¿Cuántos pagos desea cubrir?",
    });

    await user.clear(coveredPaymentsInput);
    await user.type(coveredPaymentsInput, "3");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);
      const paymentRecords = payload.items[0]?.paymentRecords ?? [];
      const editedRecord = paymentRecords.find(
        (paymentRecord: { id: string; coveredPayments: number }) =>
          paymentRecord.id === "manual-payment-1",
      );

      expect(editedRecord?.coveredPayments).toBe(3);
    });
  });

  it("recalculates progress when deleting the last receipt without legacy confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (input === "/api/storage/monthly-expenses") {
        return {
          ok: true,
          status: 204,
        };
      }

      if (
        typeof input === "string" &&
        input.startsWith("/api/storage/monthly-expenses?")
      ) {
        return {
          json: async () => ({
            data: {
              items: [],
              month: "2026-03",
            },
          }),
          ok: true,
        };
      }

      if (
        typeof input === "string" &&
        input.startsWith("/api/storage/monthly-expenses-receipts?")
      ) {
        return {
          ok: true,
          status: 204,
        };
      }

      if (input === "/api/storage/monthly-expenses-report") {
        return {
          json: async () => ({
            data: {
              entries: [],
              summary: {
                activeLoanCount: 0,
                lenderCount: 0,
                remainingAmount: 0,
                trackedLoanCount: 0,
              },
            },
          }),
          ok: true,
        };
      }

      throw new Error(`Unexpected fetch input: ${String(input)}`);
    });

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /1 registro/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name:
          "Abrir acciones de registro de pago para comprobante comprobante.pdf de Internet",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Eliminar registro",
      }),
    );

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de comprobante comprobante.pdf",
      }),
    );

    expect(confirmSpy).not.toHaveBeenCalled();

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]).not.toHaveProperty("isPaid");
    });

    confirmSpy.mockRestore();
  });

  it("allows editing receipt coverage from the comprobantes popover", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 4,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 400,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /1 registro/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name:
          "Abrir acciones de registro de pago para comprobante comprobante.pdf de Internet",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Editar registro",
      }),
    );

    const coveredPaymentsLabel = screen.getByText("¿Cuántos pagos desea cubrir?");
    const receiptFileName = screen.getByRole("link", { name: /comprobante\.pdf/i });
    expect(
      coveredPaymentsLabel.compareDocumentPosition(receiptFileName) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(receiptFileName).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/receipt-file-id/view",
    );
    expect(receiptFileName).toHaveAttribute("target", "_blank");
    expect(receiptFileName).toHaveAttribute("rel", "noopener noreferrer");

    const coveredPaymentsInput = screen.getByRole("spinbutton", {
      name: "¿Cuántos pagos desea cubrir?",
    });

    await user.clear(coveredPaymentsInput);
    await user.type(coveredPaymentsInput, "4");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]?.receipts?.[0]?.coveredPayments).toBe(4);
    });
  });

  it("deletes a receipt from edit modal and allows uploading a replacement in the same flow", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (input === "/api/storage/monthly-expenses") {
        return {
          ok: true,
          status: 204,
        };
      }

      if (input === "/api/storage/monthly-expenses-receipts") {
        return {
          json: async () => ({
            data: {
              allReceiptsFolderId: "receipt-folder-id",
              allReceiptsFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-folder-id",
              coveredPayments: 1,
              fileId: "replacement-receipt-file-id",
              fileName: "comprobante-reemplazo.pdf",
              fileViewUrl:
                "https://drive.google.com/file/d/replacement-receipt-file-id/view",
              monthlyFolderId: "receipt-month-folder-id",
              monthlyFolderViewUrl:
                "https://drive.google.com/drive/folders/receipt-month-folder-id",
              registeredAt: "2026-03-10T12:00:00.000Z",
            },
          }),
          ok: true,
        };
      }

      if (
        typeof input === "string" &&
        input.startsWith("/api/storage/monthly-expenses-receipts?")
      ) {
        return {
          ok: true,
          status: 204,
        };
      }

      if (
        typeof input === "string" &&
        input.startsWith("/api/storage/monthly-expenses?")
      ) {
        return {
          json: async () => ({
            data: {
              items: [],
              month: "2026-03",
            },
          }),
          ok: true,
        };
      }

      if (input === "/api/storage/monthly-expenses-report") {
        return {
          json: async () => ({
            data: {
              entries: [],
              summary: {
                activeLoanCount: 0,
                lenderCount: 0,
                remainingAmount: 0,
                trackedLoanCount: 0,
              },
            },
          }),
          ok: true,
        };
      }

      throw new Error(`Unexpected fetch input: ${String(input)}`);
    });

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 4,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 400,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /1 registro/i }));
    await user.click(
      screen.getByRole("button", {
        name:
          "Abrir acciones de registro de pago para comprobante comprobante.pdf de Internet",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar registro" }));

    await user.click(
      screen.getByRole("button", {
        name: "Abrir acciones de comprobante comprobante.pdf",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Eliminar comprobante" }));
    await user.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de comprobante comprobante.pdf",
      }),
    );

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url]) =>
            typeof url === "string" &&
            url.startsWith("/api/storage/monthly-expenses-receipts?"),
        ),
      ).toBe(true);
    });

    expect(
      screen.getByLabelText("Seleccionar nuevo comprobante para Internet"),
    ).toBeInTheDocument();

    const replacementFile = new File(["replacement-receipt"], "comprobante-reemplazo.pdf", {
      type: "application/pdf",
    });
    const replacementInput = screen.getByLabelText(
      "Seleccionar nuevo comprobante para Internet",
    );
    await user.upload(replacementInput, replacementFile);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      const saveCalls = fetchMock.mock.calls.filter(
        ([url]) => url === "/api/storage/monthly-expenses",
      );
      const latestSaveCall = saveCalls[saveCalls.length - 1];

      expect(latestSaveCall).toBeDefined();

      const [, options] = latestSaveCall as [string, RequestInit];
      const payload = JSON.parse(String(options.body));

      expect(payload.items[0]?.receipts?.[0]?.fileId).toBe("replacement-receipt-file-id");
      expect(payload.items[0]?.receipts?.[0]?.fileName).toBe("comprobante-reemplazo.pdf");
      expect(payload.items[0]?.receipts?.[0]?.fileViewUrl).toBe(
        "https://drive.google.com/file/d/replacement-receipt-file-id/view",
      );
    });
  });

  it("blocks increasing receipt coverage when it would exceed pending payments", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 2,
              occurrencesPerMonth: 8,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-1",
                  fileName: "comprobante-1.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-1/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-2",
                  fileName: "comprobante-2.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-2/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 800,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /3 registros/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name:
          "Abrir acciones de registro de pago para comprobante comprobante-1.pdf de Internet",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Editar registro",
      }),
    );

    const coveredPaymentsInput = screen.getByRole("spinbutton", {
      name: "¿Cuántos pagos desea cubrir?",
    });

    await user.clear(coveredPaymentsInput);
    await user.type(coveredPaymentsInput, "4");

    expect(
      screen.getByText("Ingresa un numero entero entre 1 y 3."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Guardar cambios" }),
    ).toBeDisabled();
  });

  it("blocks attaching a receipt when there are no pending payments", async () => {
    const user = userEvent.setup();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "user@example.com",
          name: "User",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              manualCoveredPayments: 2,
              occurrencesPerMonth: 8,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-1",
                  fileName: "comprobante-1.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-1/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 3,
                  fileId: "receipt-file-id-2",
                  fileName: "comprobante-2.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id-2/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 800,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /registros/i }));

    const registerPaymentButton = screen.getByRole("button", {
      name: "Agregar nuevo registro de pago para Internet",
    });

    expect(registerPaymentButton).toBeDisabled();
    expect(
      screen.queryByText("¿Cuántos pagos desea cubrir?"),
    ).not.toBeInTheDocument();
  });

  it("renders Estado de envío, Enviar, Pagos, and Registro de pagos columns after Link", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          exchangeRateLoadError: null,
          exchangeRateSnapshot: {
            blueRate: 1290,
            month: "2026-03",
            officialRate: 1200,
            solidarityRate: 1476,
          },
          items: [
            {
              currency: "USD",
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "pagos.empresa-energia.com",
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");
    const linkHeaderIndex = headers.indexOf("Link");
    const receiptShareStatusHeaderIndex = headers.indexOf("Estado de envío");
    const receiptShareLinkHeaderIndex = headers.indexOf("Enviar");
    const paidHeaderIndex = headers.indexOf("Pagos");
    const paymentHistoryHeaderIndex = headers.indexOf("Registro de pagos");

    expect(linkHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(receiptShareStatusHeaderIndex).toBe(linkHeaderIndex + 1);
    expect(receiptShareLinkHeaderIndex).toBe(receiptShareStatusHeaderIndex + 1);
    expect(paidHeaderIndex).toBe(receiptShareLinkHeaderIndex + 1);
    expect(paymentHistoryHeaderIndex).toBe(paidHeaderIndex + 1);
    expect(headers).not.toContain("Carpeta del mes actual");
    expect(headers).not.toContain("Carpeta de comprobantes");
  });

  it("renders receipt link inside the comprobantes popover and shows folder actions in row menu", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: /1 registro/i,
      }),
    );

    const receiptLink = await screen.findByRole("link", {
      name: /ver comprobante/i,
    });
    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );

    expect(screen.getByText("Carpetas")).toBeInTheDocument();

    const monthlyReceiptFolderMenuItem = screen.getByRole("menuitem", {
      name: "Carpeta mensual",
    });
    const allReceiptsFolderMenuItem = screen.getByRole("menuitem", {
      name: "Carpeta histórica de comprobantes",
    });

    expect(receiptLink).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/receipt-file-id/view",
    );
    expect(monthlyReceiptFolderMenuItem).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-month-folder-id",
    );
    expect(allReceiptsFolderMenuItem).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-folder-id",
    );
  });

  it("shows folder actions in row menu when an item has folders metadata and no receipts", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              folders: {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              receipts: [],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );

    const monthlyReceiptFolderMenuItem = screen.getByRole("menuitem", {
      name: "Carpeta mensual",
    });
    const allReceiptsFolderMenuItem = screen.getByRole("menuitem", {
      name: "Carpeta histórica de comprobantes",
    });

    expect(monthlyReceiptFolderMenuItem).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-month-folder-id",
    );
    expect(allReceiptsFolderMenuItem).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-folder-id",
    );
  });

  it("removes monthly folder reference only after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "gus@example.com",
          name: "Gus",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              folders: {
                allReceiptsFolderId: "",
                allReceiptsFolderViewUrl: "",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderStatus: "missing",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              receipts: [],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Quitar referencia de carpeta del mes actual",
      }),
    );

    expect(
      screen.getByText("¿Querés quitar la referencia de carpeta del mes actual?"),
    ).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Quitar referencia de carpeta del mes actual",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmar quitar referencia de carpeta del mes actual",
      }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock).month).toBe("2026-03");
    });

    expect(getMonthlyExpensesSavePayload(fetchMock).items[0]?.folders).toBeUndefined();
  });

  it("does not rebuild the monthly folder reference from receipts after confirming removal", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "gus@example.com",
          name: "Gus",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              folders: {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                monthlyFolderId: "receipt-month-folder-id",
                monthlyFolderStatus: "missing",
                monthlyFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-month-folder-id",
              },
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Quitar referencia de carpeta del mes actual",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmar quitar referencia de carpeta del mes actual",
      }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock).month).toBe("2026-03");
    });

    expect(getMonthlyExpensesSavePayload(fetchMock).items[0]?.folders).toEqual({
      allReceiptsFolderId: "receipt-folder-id",
      allReceiptsFolderViewUrl:
        "https://drive.google.com/drive/folders/receipt-folder-id",
      monthlyFolderId: "",
      monthlyFolderViewUrl: "",
    });
  });

  it("removes all-receipts folder reference only after confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "gus@example.com",
          name: "Gus",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              folders: {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderStatus: "missing",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                monthlyFolderId: "",
                monthlyFolderViewUrl: "",
              },
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              receipts: [],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Quitar referencia de carpeta de comprobantes",
      }),
    );

    expect(
      screen.getByText("¿Querés quitar la referencia de carpeta de comprobantes?"),
    ).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Quitar referencia de carpeta de comprobantes",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmar quitar referencia de carpeta de comprobantes",
      }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock).month).toBe("2026-03");
    });
  });

  it("does not rebuild the shared receipts folder reference from receipts after confirming removal", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock();

    mockedUseSession.mockReturnValue({
      data: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          email: "gus@example.com",
          name: "Gus",
        },
      },
      status: "authenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = fetchMock as typeof fetch;

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet",
              folders: {
                allReceiptsFolderId: "receipt-folder-id",
                allReceiptsFolderStatus: "missing",
                allReceiptsFolderViewUrl:
                  "https://drive.google.com/drive/folders/receipt-folder-id",
                monthlyFolderId: "",
                monthlyFolderViewUrl: "",
              },
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl:
                    "https://drive.google.com/file/d/receipt-file-id/view",
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(
      screen.getByRole("menuitem", {
        name: "Quitar referencia de carpeta de comprobantes",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Confirmar quitar referencia de carpeta de comprobantes",
      }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock).month).toBe("2026-03");
    });

    expect(getMonthlyExpensesSavePayload(fetchMock).items[0]?.folders).toBeUndefined();
  });

  it("sorts Link keeping empty values at the end in both directions", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Con link A",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "aaa.com",
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Con link Z",
              id: "expense-2",
              occurrencesPerMonth: 1,
              paymentLink: "zzz.com",
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin link",
              id: "expense-3",
              occurrencesPerMonth: 1,
              paymentLink: "",
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ordenar Link" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Con link A",
      "Con link Z",
      "Sin link",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Link" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Con link Z",
      "Con link A",
      "Sin link",
    ]);
  });

  it("sorts Estado de envío with N/A rows always at the end", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Estado pendiente",
              id: "expense-1",
              occurrencesPerMonth: 1,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin envio A",
              id: "expense-2",
              occurrencesPerMonth: 1,
              requiresReceiptShare: false,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Estado enviado",
              id: "expense-3",
              occurrencesPerMonth: 1,
              receiptShareStatus: "sent",
              requiresReceiptShare: true,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin envio B",
              id: "expense-4",
              occurrencesPerMonth: 1,
              requiresReceiptShare: false,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ordenar Estado de envío" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Estado pendiente",
      "Estado enviado",
      "Sin envio A",
      "Sin envio B",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Estado de envío" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Estado enviado",
      "Estado pendiente",
      "Sin envio A",
      "Sin envio B",
    ]);
  });

  it("opens the debt sorting popover with three selectable criteria", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo 1",
              id: "expense-1",
              loan: {
                endMonth: "2026-12",
                installmentCount: 12,
                paidInstallments: 3,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin deuda",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );

    expect(
      screen.getByRole("radiogroup", {
        name: "Criterio de orden para Deuda / cuotas",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", {
        name: "Dirección de orden para Deuda / cuotas",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Cuotas pagadas" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Ascendente" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Cuotas restantes" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Total de cuotas" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Cuotas restantes" }));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();

    expect(screen.getByRole("radio", { name: "Cuotas restantes" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("opens debt sorting popover only when clicking the arrow button", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo 1",
              id: "expense-1",
              loan: {
                endMonth: "2026-12",
                installmentCount: 12,
                paidInstallments: 3,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin deuda",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByText("Deuda / cuotas"));

    expect(
      screen.queryByRole("radiogroup", {
        name: "Criterio de orden para Deuda / cuotas",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );

    expect(
      screen.getByRole("radiogroup", {
        name: "Criterio de orden para Deuda / cuotas",
      }),
    ).toBeInTheDocument();
  });

  it("restores persisted debt criterion and sorting direction from localStorage", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(
      TABLE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        columnVisibility: {},
        loanSortMode: "totalInstallments",
        sorting: [
          {
            desc: true,
            id: "loanProgress",
          },
        ],
      }),
    );

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo A",
              id: "expense-1",
              loan: {
                endMonth: "2026-10",
                installmentCount: 10,
                paidInstallments: 1,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Prestamo B",
              id: "expense-2",
              loan: {
                endMonth: "2026-12",
                installmentCount: 12,
                paidInstallments: 4,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Prestamo C",
              id: "expense-3",
              loan: {
                endMonth: "2026-03",
                installmentCount: 3,
                paidInstallments: 2,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin deuda",
              id: "expense-4",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await waitFor(() => {
      expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
        "Prestamo B",
        "Prestamo A",
        "Prestamo C",
        "Sin deuda",
      ]);
    });
    expect(
      screen.getByText("Ordenado por: Deuda / cuotas (Total de cuotas) ↓"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );

    expect(await screen.findByRole("radio", { name: "Total de cuotas" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Descendente" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("sorts Deuda / cuotas by selected metric and keeps N/A at the end", async () => {
    const initialDocument = {
      items: [
        {
          currency: "ARS" as const,
          description: "Prestamo A",
          id: "expense-1",
          loan: {
            endMonth: "2026-10",
            installmentCount: 10,
            paidInstallments: 1,
            startMonth: "2026-01",
          },
          occurrencesPerMonth: 1,
          subtotal: 100,
          total: 100,
        },
        {
          currency: "ARS" as const,
          description: "Prestamo B",
          id: "expense-2",
          loan: {
            endMonth: "2026-12",
            installmentCount: 12,
            paidInstallments: 4,
            startMonth: "2026-01",
          },
          occurrencesPerMonth: 1,
          subtotal: 100,
          total: 100,
        },
        {
          currency: "ARS" as const,
          description: "Prestamo C",
          id: "expense-3",
          loan: {
            endMonth: "2026-03",
            installmentCount: 3,
            paidInstallments: 2,
            startMonth: "2026-01",
          },
          occurrencesPerMonth: 1,
          subtotal: 100,
          total: 100,
        },
        {
          currency: "ARS" as const,
          description: "Sin deuda",
          id: "expense-4",
          occurrencesPerMonth: 1,
          subtotal: 100,
          total: 100,
        },
      ],
      month: "2026-03",
    };
    const scenarios: Array<{
      loanSortMode: "paidInstallments" | "remainingInstallments" | "totalInstallments";
      order: Array<string>;
      sorting: Array<{ desc: boolean; id: string }>;
    }> = [
      {
        loanSortMode: "paidInstallments",
        order: ["Prestamo A", "Prestamo C", "Prestamo B", "Sin deuda"],
        sorting: [{ desc: false, id: "loanProgress" }],
      },
      {
        loanSortMode: "paidInstallments",
        order: ["Prestamo B", "Prestamo C", "Prestamo A", "Sin deuda"],
        sorting: [{ desc: true, id: "loanProgress" }],
      },
      {
        loanSortMode: "remainingInstallments",
        order: ["Prestamo A", "Prestamo B", "Prestamo C", "Sin deuda"],
        sorting: [{ desc: true, id: "loanProgress" }],
      },
      {
        loanSortMode: "remainingInstallments",
        order: ["Prestamo C", "Prestamo B", "Prestamo A", "Sin deuda"],
        sorting: [{ desc: false, id: "loanProgress" }],
      },
      {
        loanSortMode: "totalInstallments",
        order: ["Prestamo C", "Prestamo A", "Prestamo B", "Sin deuda"],
        sorting: [{ desc: false, id: "loanProgress" }],
      },
      {
        loanSortMode: "totalInstallments",
        order: ["Prestamo B", "Prestamo A", "Prestamo C", "Sin deuda"],
        sorting: [{ desc: true, id: "loanProgress" }],
      },
    ];

    for (const scenario of scenarios) {
      window.localStorage.setItem(
        TABLE_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          columnVisibility: {},
          loanSortMode: scenario.loanSortMode,
          sorting: scenario.sorting,
        }),
      );

      const rendered = renderWithProviders(
        <MonthlyExpensesPage
          {...basePageProps}
          initialDocument={initialDocument}
        />,
      );

      await waitFor(() => {
        expect(getMonthlyExpensesDescriptionsOrder()).toEqual(scenario.order);
      });

      rendered.unmount();
      window.localStorage.clear();
    }
  });

  it("renders Prestamista followed by Inicio cuota and Fin cuota, then Dirección before actions", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo tarjeta",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.trim() ?? "");
    const loanHeaderIndex = headers.indexOf("Deuda / cuotas");
    const lenderHeaderIndex = headers.indexOf("Prestamista");
    const installmentStartHeaderIndex = headers.indexOf("Inicio cuota");
    const installmentEndHeaderIndex = headers.indexOf("Fin cuota");
    const loanDirectionHeaderIndex = headers.indexOf("Dirección");

    expect(loanHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(lenderHeaderIndex).toBe(loanHeaderIndex + 1);
    expect(installmentStartHeaderIndex).toBe(lenderHeaderIndex + 1);
    expect(installmentEndHeaderIndex).toBe(installmentStartHeaderIndex + 1);
    expect(loanDirectionHeaderIndex).toBe(installmentEndHeaderIndex + 1);
    expect(headers.at(loanDirectionHeaderIndex + 1)).toBe("");

    const expenseRow = screen.getByRole("row", { name: /Prestamo tarjeta/i });
    const expenseCells = within(expenseRow).getAllByRole("cell");

    expect(expenseCells.at(lenderHeaderIndex)?.textContent?.trim()).toBe("-");
    expect(expenseCells.at(installmentStartHeaderIndex)?.textContent?.trim()).toBe(
      "-",
    );
    expect(expenseCells.at(installmentEndHeaderIndex)?.textContent?.trim()).toBe(
      "-",
    );
    expect(expenseCells.at(loanDirectionHeaderIndex)?.textContent?.trim()).toBe(
      "-",
    );
  });

  it("renders Inicio cuota and Fin cuota as MM/YYYY and sorts both columns by month-year", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo noviembre",
              id: "expense-1",
              loan: {
                endMonth: "2026-02",
                installmentCount: 4,
                paidInstallments: 1,
                startMonth: "2025-11",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Prestamo enero",
              id: "expense-2",
              loan: {
                endMonth: "2026-04",
                installmentCount: 4,
                paidInstallments: 1,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Prestamo marzo",
              id: "expense-3",
              loan: {
                endMonth: "2026-08",
                installmentCount: 6,
                paidInstallments: 1,
                startMonth: "2026-03",
              },
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin deuda",
              id: "expense-4",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const novemberRow = screen.getByRole("row", { name: /Prestamo noviembre/i });
    const januaryRow = screen.getByRole("row", { name: /Prestamo enero/i });
    const marchRow = screen.getByRole("row", { name: /Prestamo marzo/i });
    const noLoanRow = screen.getByRole("row", { name: /Sin deuda/i });

    expect(within(novemberRow).getByText("11/2025")).toBeInTheDocument();
    expect(within(novemberRow).getByText("02/2026")).toBeInTheDocument();
    expect(within(januaryRow).getByText("01/2026")).toBeInTheDocument();
    expect(within(januaryRow).getByText("04/2026")).toBeInTheDocument();
    expect(within(marchRow).getByText("03/2026")).toBeInTheDocument();
    expect(within(marchRow).getByText("08/2026")).toBeInTheDocument();
    expect(within(noLoanRow).getAllByText("-").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Ordenar Inicio cuota" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo noviembre",
      "Prestamo enero",
      "Prestamo marzo",
      "Sin deuda",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Inicio cuota" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo marzo",
      "Prestamo enero",
      "Prestamo noviembre",
      "Sin deuda",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Fin cuota" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo noviembre",
      "Prestamo enero",
      "Prestamo marzo",
      "Sin deuda",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Fin cuota" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo marzo",
      "Prestamo enero",
      "Prestamo noviembre",
      "Sin deuda",
    ]);
  });

  it("shows fallback values when the monthly snapshot could not be loaded", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          exchangeRateLoadError:
            "No pudimos cargar la cotización histórica del mes seleccionado.",
          exchangeRateSnapshot: null,
          items: [
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 14760,
              total: 14760,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.getByText(
        "No pudimos cargar la cotización histórica del mes seleccionado.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("-")).not.toHaveLength(0);
  });
});
