import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import { signIn, signOut, useSession } from "next-auth/react";
import { toast } from "sonner";

import MonthlyExpensesPage from "@/pages/gastos";

import {
  basePageProps,
  createMockRouter,
  createMonthlyExpensesFetchMock,
  getMonthlyExpensesSavePayload,
  registerMonthlyExpensesPageDefaultHooks,
  renderWithProviders,
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

describe("MonthlyExpensesPage expense sheet", () => {

registerMonthlyExpensesPageDefaultHooks({
  createDefaultRouter: () => createMockRouter() as unknown as ReturnType<typeof useRouter>,
  mockedSignIn,
  mockedSignOut,
  mockedToast,
  mockedUseRouter,
  mockedUseSession,
  originalFetch,
});

  it("opens a modal to create a new expense, without showing an opening toast", async () => {
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
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Nuevo gasto" }),
    ).toBeInTheDocument();
    expect(mockedToast).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("radio", { name: "Un único pago al mes" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Se paga varias veces en el mes" }),
    ).not.toBeChecked();
    expect(screen.queryByLabelText("Veces al mes")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Descripción"), "Internet");
    await user.type(screen.getByLabelText("Subtotal"), "15000");

    expect(screen.getByLabelText("Subtotal")).toHaveValue("15.000");
    expect(screen.getByLabelText("Total")).toHaveValue("15.000");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: expect.any(String),
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 15000,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.queryByRole("heading", { name: "Nuevo gasto" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Internet")).toBeInTheDocument();
    expect(
      screen.queryByText(
        /Gastos mensuales guardados en la base de datos con id/i,
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Archivo:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Mes:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Id:/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Carpeta en Drive:")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Abrir archivo mensual en Drive" }),
    ).not.toBeInTheDocument();
  });

  it("saves a new expense when pressing Enter inside the expense sheet", async () => {
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
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    await user.type(screen.getByLabelText("Descripción"), "Internet");
    await user.type(screen.getByLabelText("Subtotal"), "15000");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: expect.any(String),
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 15000,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.queryByRole("heading", { name: "Nuevo gasto" }),
    ).not.toBeInTheDocument();
  });

  it("shows warning toast when save returns receipt rename warnings", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock({
      saveResponse: {
        body: {
          data: {
            receiptRenameWarnings: [
              {
                fileId: "receipt-file-id",
                nextFileName: "2026-03-16 - Fibra - cubre 1 pagos.pdf",
                previousFileName: "2026-03-16 - Internet - cubre 1 pagos.pdf",
                reasonCode: "insufficient_permissions",
              },
            ],
            renamedReceiptFilesCount: 0,
            storedDocument: {
              id: "monthly-expenses-file-id",
              month: "2026-03",
              name: "gastos-mensuales-2026-marzo.json",
              viewUrl: null,
            },
          },
        },
        status: 200,
      },
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

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    await user.type(screen.getByLabelText("Descripción"), "Fibra");
    await user.type(screen.getByLabelText("Subtotal"), "15000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(mockedToast.warning).toHaveBeenCalledWith(
        "El gasto se guardó, pero 1 comprobante(s) no se pudieron renombrar.",
      );
    });
  });

  it("shows the occurrences input only for multiple monthly payments", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    expect(screen.queryByLabelText("Veces al mes")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: "Se paga varias veces en el mes" }),
    );

    expect(screen.getByLabelText("Veces al mes")).toHaveValue(2);

    await user.click(screen.getByRole("radio", { name: "Un único pago al mes" }));

    expect(screen.queryByLabelText("Veces al mes")).not.toBeInTheDocument();
  });

  it("restores the last multiple-payment value after toggling back from single-payment mode", async () => {
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
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    fireEvent.change(screen.getByLabelText("Descripción"), {
      target: { value: "Empleada doméstica" },
    });
    fireEvent.change(screen.getByLabelText("Subtotal"), {
      target: { value: "5000" },
    });

    await user.click(
      screen.getByRole("radio", { name: "Se paga varias veces en el mes" }),
    );

    const occurrencesInput = screen.getByLabelText("Veces al mes");
    fireEvent.change(occurrencesInput, {
      target: { value: "8" },
    });

    await user.click(screen.getByRole("radio", { name: "Un único pago al mes" }));
    expect(screen.queryByLabelText("Veces al mes")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: "Se paga varias veces en el mes" }),
    );
    expect(screen.getByLabelText("Veces al mes")).toHaveValue(8);

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Empleada doméstica",
            id: expect.any(String),
            occurrencesPerMonth: 8,
            paymentLink: null,
            subtotal: 5000,
          },
        ],
        month: "2026-03",
      });
    });
  }, 15000);

  it("adds a payment link from the Link column plus button, normalizes protocol, and persists", async () => {
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
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Agregar link de pago para Electricidad",
      }),
    );
    await user.type(screen.getByLabelText("Link de pago de Electricidad"), "google.com");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: "https://google.com",
            subtotal: 45,
          },
        ],
        month: "2026-03",
      });
    });

    expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute(
      "href",
      "https://google.com",
    );
  });

  it("edits an existing payment link from the Link column pencil button and persists", async () => {
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
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "https://pagos.empresa-energia.com",
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Abrir acciones de link de pago para Electricidad",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar link de pago" }));
    expect(screen.getByLabelText("Link de pago de Electricidad").tagName).toBe(
      "TEXTAREA",
    );
    await user.clear(screen.getByLabelText("Link de pago de Electricidad"));
    await user.type(
      screen.getByLabelText("Link de pago de Electricidad"),
      "pagos.nuevo-proveedor.com",
    );
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: "https://pagos.nuevo-proveedor.com",
            subtotal: 45,
          },
        ],
        month: "2026-03",
      });
    });
  });

  it("deletes an existing payment link from the Link column trash button only after confirmation and shows plus again", async () => {
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
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "https://pagos.empresa-energia.com",
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Abrir acciones de link de pago para Electricidad",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Eliminar link de pago" }));

    expect(
      screen.getByText("¿Querés eliminar este link de pago?"),
    ).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de link de pago para Electricidad",
      }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.getByRole("button", {
        name: "Agregar link de pago para Electricidad",
      }),
    ).toBeInTheDocument();
  });

  it("keeps an existing payment link when the user cancels trash confirmation", async () => {
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
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "https://pagos.empresa-energia.com",
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Abrir acciones de link de pago para Electricidad",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Eliminar link de pago" }));

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    expect(
      screen.getByRole("link", {
        name: "Abrir",
      }),
    ).toHaveAttribute("href", "https://pagos.empresa-energia.com");
  });

  it("shows validation for invalid payment links in the table modal and does not persist", async () => {
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
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: null,
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Agregar link de pago para Electricidad",
      }),
    );
    await user.type(screen.getByLabelText("Link de pago de Electricidad"), "asdads");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      screen.getByText(
        "Ingresá un link válido con dominio (por ejemplo, ejemplo.com).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Link de pago de Electricidad")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders Enviar link with one receipt plus custom message", async () => {
    const user = userEvent.setup();
    const receiptViewUrl =
      "https://drive.google.com/file/d/receipt-file-id/view";
    const customMessage = "Pago correspondiente a marzo";

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              receiptShareMessage: customMessage,
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl: receiptViewUrl,
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const sendLink = screen.getByRole("link", { name: "Enviar" });

    expect(sendLink).toHaveAttribute(
      "href",
      `https://wa.me/5491123456789?text=${encodeURIComponent(
        `Comprobante: ${receiptViewUrl}\n\n${customMessage}`,
      )}`,
    );

    await user.hover(sendLink);

    expect(
      screen.getAllByText("Enviar comprobante a +54 9 11 2345 6789").length,
    ).toBeGreaterThan(0);
  });

  it("renders Enviar link with multiple receipts and no custom message", () => {
    const firstReceiptViewUrl =
      "https://drive.google.com/file/d/receipt-file-id/view";
    const secondReceiptViewUrl =
      "https://drive.google.com/file/d/receipt-file-id-2/view";

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
              receiptShareMessage: null,
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante-1.pdf",
                  fileViewUrl: firstReceiptViewUrl,
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id-2",
                  fileName: "comprobante-2.pdf",
                  fileViewUrl: secondReceiptViewUrl,
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Enviar" })).toHaveAttribute(
      "href",
      `https://wa.me/5491123456789?text=${encodeURIComponent(
        `Comprobante 1: ${firstReceiptViewUrl}\nComprobante 2: ${secondReceiptViewUrl}`,
      )}`,
    );
  });

  it("does not render Enviar link when there are no receipts", () => {
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
              receiptShareMessage: "Hola",
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              receipts: [],
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Enviar" }),
    ).not.toBeInTheDocument();
  });

  it("does not render Enviar link when destination phone is missing", () => {
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
              receiptShareMessage: "Hola",
              receiptSharePhoneDigits: "",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
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
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Enviar" }),
    ).not.toBeInTheDocument();
  });

  it("updates receipt share status from the table and persists immediately", async () => {
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
              description: "Electricidad",
              id: "expense-1",
              occurrencesPerMonth: 1,
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("combobox", { name: "Estado de envío de Electricidad" }),
    );
    await user.click(screen.getByText("Enviado"));

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]?.receiptShareStatus).toBe("sent");
      expect(payload.items[0]?.receiptSharePhoneDigits).toBe("5491123456789");
      expect(payload.items[0]?.requiresReceiptShare).toBe(true);
    });
  });

  it("shows pending receipt-share summary above the description filter", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Servicio pendiente",
              id: "expense-1",
              manualCoveredPayments: 2,
              occurrencesPerMonth: 2,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Servicio enviado",
              id: "expense-2",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              receiptShareStatus: "sent",
              requiresReceiptShare: true,
              subtotal: 120,
              total: 120,
            },
            {
              currency: "ARS",
              description: "Servicio incompleto",
              id: "expense-3",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 3,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 80,
              total: 80,
            },
            {
              currency: "ARS",
              description: "Sin envío",
              id: "expense-4",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              requiresReceiptShare: false,
              subtotal: 75,
              total: 75,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    const pendingCompletedSummaryText = screen.getByText(
      "1 pago completo con comprobante pendiente de envío:",
    );
    const pendingCompletedSummary = pendingCompletedSummaryText.closest('[role="status"]');

    expect(pendingCompletedSummary).not.toBeNull();

    if (!pendingCompletedSummary) {
      throw new Error("Expected a receipt-share summary status region");
    }
    const pendingCompletedSummaryElement = pendingCompletedSummary as HTMLElement;
    expect(
      within(pendingCompletedSummaryElement).getByText(
        "1 pago completo con comprobante pendiente de envío:",
      ),
    ).toBeInTheDocument();
    expect(
      within(pendingCompletedSummaryElement).getByRole("list"),
    ).toBeInTheDocument();
    expect(
      within(pendingCompletedSummaryElement).getByText("Servicio pendiente"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Estado de envío de Servicio pendiente" }),
    ).toHaveClass("receiptShareStatusPending");
    expect(
      screen.getByRole("combobox", { name: "Estado de envío de Servicio enviado" }),
    ).toHaveClass("receiptShareStatusSent");
    expect(
      screen.getByRole("combobox", { name: "Estado de envío de Servicio incompleto" }),
    ).not.toHaveClass("receiptShareStatusPending");
    const summaryFilterButton = within(pendingCompletedSummaryElement).getByRole("button", {
      name: "Filtrar gasto Servicio pendiente",
    });
    await user.click(summaryFilterButton);
    expect(
      screen.getByRole("textbox", { name: "Filtrar gastos" }),
    ).toHaveValue("Servicio pendiente");
  });

  it("keeps the original empty description when applying summary filter", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "",
              id: "expense-empty-description",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 80,
              total: 80,
            },
            {
              currency: "ARS",
              description: "Servicio pendiente",
              id: "expense-with-description",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 75,
              total: 75,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Filtrar gasto Gasto sin descripción" }),
    );

    expect(
      screen.getByRole("textbox", { name: "Filtrar gastos" }),
    ).toHaveValue("");
    expect(screen.getByText("Sin descripción")).toBeInTheDocument();
  });

  it("renders distinct accessible names for each summary filter action", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Servicio pendiente",
              id: "expense-1",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 80,
              total: 80,
            },
            {
              currency: "ARS",
              description: "Otro pendiente",
              id: "expense-2",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 75,
              total: 75,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Filtrar gasto Servicio pendiente" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filtrar gasto Otro pendiente" }),
    ).toBeInTheDocument();
  });

  it("does not show the summary when there are no pending completed expenses", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Servicio parcial",
              id: "expense-1",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 3,
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              subtotal: 80,
              total: 80,
            },
            {
              currency: "ARS",
              description: "Sin envío parcial",
              id: "expense-2",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 2,
              requiresReceiptShare: false,
              subtotal: 75,
              total: 75,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByText(/pagos? completos? con comprobantes? pendientes? de envío:/i),
    ).not.toBeInTheDocument();
  });

  it("does not show the summary when all completed expenses were already sent", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Servicio enviado",
              id: "expense-1",
              manualCoveredPayments: 1,
              occurrencesPerMonth: 1,
              receiptShareStatus: "sent",
              requiresReceiptShare: true,
              subtotal: 120,
              total: 120,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByText(/pagos? completos? con comprobantes? pendientes? de envío:/i),
    ).not.toBeInTheDocument();
  });

  it("does not render the authenticated session identity details", () => {
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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.queryByText("Cuenta activa: Gus")).not.toBeInTheDocument();
    expect(screen.queryByText("Email: gus@example.com")).not.toBeInTheDocument();
  });

  it("does not render redundant Google session status badge", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.queryByText("Google conectado - Activo")).not.toBeInTheDocument();
    expect(screen.queryByText("Google conectado - Verificando")).not.toBeInTheDocument();
    expect(screen.queryByText("Google desconectado - Inactivo")).not.toBeInTheDocument();
  });

  it("starts Google sign in when the disconnected avatar is clicked", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Conectar cuenta de Google" }),
    );

    expect(mockedSignIn).toHaveBeenCalledWith("google", {
      callbackUrl: "/gastos",
    });
  });

  it("allows disconnecting from the connected avatar menu", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Cuenta de Google conectada" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Desconectar Google" }));

    expect(mockedSignOut).toHaveBeenCalledWith({
      callbackUrl: "/gastos",
    });
  });

  it("opens the sheet preloaded for editing and marks pending field changes", async () => {
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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10774.53,
              total: 10774.53,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir acciones para Agua" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));

    expect(
      screen.getByRole("heading", { name: "Editar gasto" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Agua")).toBeInTheDocument();
    expect(screen.queryByLabelText("Moneda")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    expect(screen.queryByText("Frecuencia de pago")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Total")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("¿Necesitas enviar el comprobante a alguien?"),
    ).not.toBeInTheDocument();

    const descriptionInput = screen.getByLabelText("Descripción");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "Agua y cloaca");

    expect(descriptionInput).toHaveAttribute(
      "data-changed",
      "true",
    );
    expect(
      screen.getByText("Los labels amarillos subrayados marcan cambios sin guardar."),
    ).toBeInTheDocument();
    expect(descriptionInput).toHaveValue("Agua y cloaca");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Agua y cloaca",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 10774.53,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.queryByRole("heading", { name: "Editar gasto" }),
    ).not.toBeInTheDocument();
  });

  it("opens a dedicated subtotal modal from the subtotal actions menu", async () => {
    const user = userEvent.setup();

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
              subtotal: 10774.53,
              total: 10774.53,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones de subtotal para Agua" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar subtotal" }));

    expect(screen.getByRole("heading", { name: "Editar subtotal" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Editar gasto" }),
    ).not.toBeInTheDocument();
  });

  it("opens a dedicated receipt share modal from the enviar actions menu", async () => {
    const user = userEvent.setup();
    const receiptViewUrl =
      "https://drive.google.com/file/d/receipt-file-id/view";

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
              receiptShareMessage: "Hola",
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              receipts: [
                {
                  allReceiptsFolderId: "receipt-folder-id",
                  allReceiptsFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-folder-id",
                  coveredPayments: 1,
                  fileId: "receipt-file-id",
                  fileName: "comprobante.pdf",
                  fileViewUrl: receiptViewUrl,
                  monthlyFolderId: "receipt-month-folder-id",
                  monthlyFolderViewUrl:
                    "https://drive.google.com/drive/folders/receipt-month-folder-id",
                },
              ],
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones de envío para Internet" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar datos de envío" }));

    expect(
      screen.getByRole("heading", { name: "Editar datos de envío" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Número de WhatsApp de Internet"),
    ).toHaveValue("+54 9 11 2345 6789");
    expect(
      screen.getByLabelText("Mensaje opcional de Internet").tagName,
    ).toBe("TEXTAREA");
    expect(
      screen.queryByRole("heading", { name: "Editar gasto" }),
    ).not.toBeInTheDocument();
  });

  it("deletes receipt share data from the enviar actions menu only after confirmation and shows plus again", async () => {
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
              id: "expense-1",
              occurrencesPerMonth: 1,
              receiptShareMessage: "Hola",
              receiptSharePhoneDigits: "5491123456789",
              receiptShareStatus: "pending",
              requiresReceiptShare: true,
              receipts: [],
              subtotal: 45,
              total: 45,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones de envío para Internet" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Eliminar datos de envío" }));

    expect(screen.getByText("¿Querés eliminar estos datos de envío?")).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBeUndefined();

    await user.click(
      screen.getByRole("button", {
        name: "Confirmar eliminación de datos de envío para Internet",
      }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.getByRole("button", {
        name: "Agregar datos de envío para Internet",
      }),
    ).toBeInTheDocument();
  });

  it("formats WhatsApp phone while typing in the expense sheet and persists digits only", async () => {
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
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    await user.type(screen.getByLabelText("Descripción"), "Internet");
    await user.type(screen.getByLabelText("Subtotal"), "1000");
    await user.click(
      screen.getByLabelText("¿Necesitas enviar el comprobante a alguien?"),
    );

    const phoneInput = screen.getByLabelText("Número de teléfono (WhatsApp)");

    await user.type(phoneInput, "5491123456789");

    expect(phoneInput).toHaveValue("+54 9 11 2345 6789");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]).toEqual(
        expect.objectContaining({
          description: "Internet",
          receiptSharePhoneDigits: "5491123456789",
          requiresReceiptShare: true,
          subtotal: 1000,
        }),
      );
    });
  }, 15000);

  it("saves subtotal changes from the dedicated subtotal modal", async () => {
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

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones de subtotal para Agua" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar subtotal" }));

    const subtotalInput = screen.getByLabelText("Subtotal de Agua");

    await user.clear(subtotalInput);
    await user.type(subtotalInput, "15000");
    expect(subtotalInput).toHaveValue("15.000");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Agua",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 15000,
          },
        ],
        month: "2026-03",
      });
    });
  });

  it("keeps thousands editing semantics when deleting digits from a formatted subtotal", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    const subtotalInput = screen.getByLabelText("Subtotal");

    await user.type(subtotalInput, "1111");

    expect(subtotalInput).toHaveValue("1.111");

    await user.keyboard("{Backspace}");

    expect(subtotalInput).toHaveValue("111");
  });

  it("formats subtotal values typed with decimal comma", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    const subtotalInput = screen.getByLabelText("Subtotal");

    await user.type(subtotalInput, "1234");
    expect(subtotalInput).toHaveValue("1.234");

    await user.type(subtotalInput, ",");
    expect(subtotalInput).toHaveValue("1.234,");

    await user.type(subtotalInput, "50");

    expect(subtotalInput).toHaveValue("1.234,50");
    expect(screen.getByLabelText("Total")).toHaveValue("1.234,50");
  });

  it("keeps a leading zero when typing decimal subtotal digits", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    const subtotalInput = screen.getByLabelText("Subtotal");

    await user.type(subtotalInput, "55032");
    expect(subtotalInput).toHaveValue("55.032");

    await user.type(subtotalInput, ",0");
    expect(subtotalInput).toHaveValue("55.032,0");

    await user.type(subtotalInput, "7");
    expect(subtotalInput).toHaveValue("55.032,07");
    expect(screen.getByLabelText("Total")).toHaveValue("55.032,07");
  });

  it("blocks sheet close on outside click when there are unsaved changes and can save from the warning dialog", async () => {
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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10774.53,
              total: 10774.53,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir acciones para Agua" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Agua filtrada");

    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay).not.toBeNull();
    await user.click(overlay as HTMLElement);

    expect(
      screen.getByText("Tenés cambios sin guardar en este gasto."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Guardar los cambios" }),
    );

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Agua filtrada",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 10774.53,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.queryByText("Tenés cambios sin guardar en este gasto."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Editar gasto" }),
    ).not.toBeInTheDocument();
  });

  it("blocks sheet close on outside click when there are unsaved changes and can discard them", async () => {
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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10774.53,
              total: 10774.53,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir acciones para Agua" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Agua descartada");

    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(overlay).not.toBeNull();
    await user.click(overlay as HTMLElement);
    await user.click(
      screen.getByRole("button", { name: "Descartar los cambios" }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Editar gasto" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
    expect(screen.queryByText("Agua descartada")).not.toBeInTheDocument();
  });

  it("closes the unsaved changes warning on backdrop click and keeps editing", async () => {
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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10774.53,
              total: 10774.53,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir acciones para Agua" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Agua pendiente");

    const primaryOverlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(primaryOverlay).not.toBeNull();
    await user.click(primaryOverlay as HTMLElement);

    expect(
      screen.getByText("Tenés cambios sin guardar en este gasto."),
    ).toBeInTheDocument();

    const overlays = document.querySelectorAll("[data-slot='dialog-overlay']");
    await user.click(overlays.item(overlays.length - 1) as HTMLElement);

    expect(
      screen.queryByText("Tenés cambios sin guardar en este gasto."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editar gasto" })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toHaveValue("Agua pendiente");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the unsaved changes warning from the close button and keeps editing", async () => {
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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10774.53,
              total: 10774.53,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir acciones para Agua" }));
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Agua en progreso");

    const primaryOverlay = document.querySelector("[data-slot='dialog-overlay']");
    expect(primaryOverlay).not.toBeNull();
    await user.click(primaryOverlay as HTMLElement);

    expect(
      screen.getByText("Tenés cambios sin guardar en este gasto."),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Cerrar aviso de cambios sin guardar",
      }),
    );

    expect(
      screen.queryByText("Tenés cambios sin guardar en este gasto."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Editar gasto" })).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toHaveValue("Agua en progreso");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows validation inside the sheet only after trying to save an incomplete expense", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    expect(screen.queryByText("Completá la descripción.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Ingresá un subtotal mayor a 0."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Completá la descripción.")).toBeInTheDocument();
    expect(screen.getByText("Ingresá un subtotal mayor a 0.")).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      screen.getByRole("radio", { name: "Un único pago al mes" }),
    ).toBeChecked();
    expect(screen.queryByLabelText("Veces al mes")).not.toBeInTheDocument();
  });

  it("shows and hides the debt fields inside the sheet when the loan checkbox changes", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    expect(screen.queryByText("Seleccioná un prestamista")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    expect(screen.getByText("Seleccioná un prestamista")).toBeInTheDocument();
    expect(screen.getByLabelText("Inicio de la deuda")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Cantidad total de cuotas"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Fin de la deuda")).toHaveAttribute(
      "readonly",
    );
    expect(
      screen.getByText("Completá inicio y cuotas para ver el avance."),
    ).toBeInTheDocument();

    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    expect(screen.queryByText("Seleccioná un prestamista")).not.toBeInTheDocument();
  });

  it("shows the debt info tooltip and closes it from the close button, outside click, or Escape", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    expect(
      screen.queryByText(
        "Marcá esta opción si el gasto corresponde a una deuda.",
      ),
    ).not.toBeInTheDocument();

    const loanInfoButton = screen.getByRole("button", {
      name: "Más información sobre deuda o préstamo",
    });

    await user.click(loanInfoButton);

    const loanInfoTooltip = screen.getByRole("tooltip");
    const positionedLoanInfoTooltip = document.querySelector(
      '[data-side="top"]',
    ) as HTMLElement | null;

    expect(loanInfoTooltip).toBeInTheDocument();
    expect(positionedLoanInfoTooltip).not.toBeNull();
    expect(positionedLoanInfoTooltip).toHaveTextContent(
      "Marcá esta opción si el gasto corresponde a una deuda.",
    );

    const positionedTooltipCloseButton = (
      positionedLoanInfoTooltip as HTMLElement
    ).querySelector(
      'button[aria-label="Cerrar ayuda sobre deuda o préstamo"]',
    ) as HTMLButtonElement | null;

    expect(positionedTooltipCloseButton).not.toBeNull();

    await user.click(positionedTooltipCloseButton as HTMLButtonElement);

    expect(
      screen.queryByText(
        "Marcá esta opción si el gasto corresponde a una deuda.",
      ),
    ).not.toBeInTheDocument();

    await user.click(loanInfoButton);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.click(screen.getByRole("heading", { name: "Nuevo gasto" }));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.click(loanInfoButton);

    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toBeInTheDocument();
  });

  it("filters expenses by description with exact, accent-insensitive matching and highlights contiguous matches", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Préstamo tarjeta",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 50000,
              total: 50000,
            },
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Filtrar gastos" }), "PREST");

    const matchingDescription = screen.getByText(
      (_, element) => element?.textContent === "Préstamo tarjeta",
    );
    const matchingRow = matchingDescription.closest("tr");

    expect(matchingRow).not.toBeNull();

    if (matchingRow === null) {
      throw new Error("Expected a table row for the matching description");
    }

    const descriptionCell = within(matchingRow).getAllByRole("cell")[0];
    const highlightedText = Array.from(
      descriptionCell.querySelectorAll("mark"),
      (element) => element.textContent ?? "",
    ).join("");

    expect(matchingDescription).toBeInTheDocument();
    expect(screen.queryByText("Agua")).not.toBeInTheDocument();
    expect(highlightedText).toBe("Prést");

    const clearFilterButton = screen.getByRole("button", {
      name: "Limpiar filtro",
    });

    await user.click(clearFilterButton);

    expect(screen.getByRole("textbox", { name: "Filtrar gastos" })).toHaveValue("");
    expect(screen.getByText("Préstamo tarjeta")).toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "Limpiar filtro",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not match non-contiguous text when filtering by exact description", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "AxxBxxC gasto",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
            {
              currency: "ARS",
              description: "Abc gasto",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 12000,
              total: 12000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Filtrar gastos" }), "abc");

    expect(
      screen.getByText((_, element) => element?.textContent === "Abc gasto"),
    ).toBeInTheDocument();
    expect(screen.queryByText("AxxBxxC gasto")).not.toBeInTheDocument();
  });

  it("applies multiple negative filters and refreshes rows when removing a badge", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Préstamo auto",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
            {
              currency: "ARS",
              description: "Préstamo tarjeta",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 12000,
              total: 12000,
            },
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-3",
              occurrencesPerMonth: 1,
              subtotal: 15000,
              total: 15000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "Filtrar gastos" }), "PRESTAMO");

    await user.click(
      screen.getByRole("button", { name: "Mostrar filtros de exclusión" }),
    );

    const exclusionInput = screen.getByRole("textbox", {
      name: "Excluir resultados",
    });

    await user.type(exclusionInput, "tarjeta{enter}");

    expect(screen.getByText("− tarjeta")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "Préstamo auto"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Préstamo tarjeta")).not.toBeInTheDocument();

    await user.type(exclusionInput, "auto{enter}");

    expect(screen.getByText("− auto")).toBeInTheDocument();
    expect(screen.queryByText("Préstamo auto")).not.toBeInTheDocument();
    expect(
      screen.getByText("No hay resultados para los filtros actuales."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Quitar exclusión auto" }));

    expect(screen.queryByText("− auto")).not.toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "Préstamo auto"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No hay resultados para los filtros actuales."),
    ).not.toBeInTheDocument();
  });

  it("keeps exclusions active even when the main filter is empty", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Internet casa",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 12000,
              total: 12000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Mostrar filtros de exclusión" }),
    );

    await user.type(
      screen.getByRole("textbox", { name: "Excluir resultados" }),
      "internet{enter}",
    );

    expect(screen.getByRole("textbox", { name: "Filtrar gastos" })).toHaveValue("");
    expect(screen.getByText("− internet")).toBeInTheDocument();
    expect(screen.queryByText("Internet casa")).not.toBeInTheDocument();
    expect(screen.getByText("Agua")).toBeInTheDocument();
  });

  it("shows validation when a debt is missing start month or installments", async () => {
    const user = userEvent.setup();

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
              subtotal: 50000,
              total: 50000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo tarjeta" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    expect(screen.queryByText("Completá la fecha de inicio.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Completá la cantidad total de cuotas."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Completá la fecha de inicio.")).toBeInTheDocument();
    expect(
      screen.getByText("Completá la cantidad total de cuotas."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Inicio de la deuda")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Cantidad total de cuotas")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows installment quick buttons, updates input on click, and allows custom input", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    const installmentInput = screen.getByLabelText("Cantidad total de cuotas");
    const quickInstallment3 = screen.getByRole("button", {
      name: "Usar 3 cuotas",
    });
    const quickInstallment6 = screen.getByRole("button", {
      name: "Usar 6 cuotas",
    });
    const quickInstallment9 = screen.getByRole("button", {
      name: "Usar 9 cuotas",
    });
    const quickInstallment12 = screen.getByRole("button", {
      name: "Usar 12 cuotas",
    });
    const quickInstallment18 = screen.getByRole("button", {
      name: "Usar 18 cuotas",
    });
    const quickInstallment24 = screen.getByRole("button", {
      name: "Usar 24 cuotas",
    });

    expect(quickInstallment3).toBeInTheDocument();
    expect(quickInstallment6).toBeInTheDocument();
    expect(quickInstallment9).toBeInTheDocument();
    expect(quickInstallment12).toBeInTheDocument();
    expect(quickInstallment18).toBeInTheDocument();
    expect(quickInstallment24).toBeInTheDocument();

    expect(quickInstallment9).toHaveAttribute("aria-pressed", "false");
    await user.click(quickInstallment9);
    expect(installmentInput).toHaveValue("9");
    expect(quickInstallment9).toHaveAttribute("aria-pressed", "true");

    await user.clear(installmentInput);
    await user.type(installmentInput, "7");

    expect(installmentInput).toHaveValue("7");
    expect(quickInstallment9).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the matching quick button as active when typing a suggested value", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    const installmentInput = screen.getByLabelText("Cantidad total de cuotas");
    const quickInstallment12 = screen.getByRole("button", {
      name: "Usar 12 cuotas",
    });

    await user.type(installmentInput, "12");

    expect(quickInstallment12).toHaveAttribute("aria-pressed", "true");
  });

  it("saves a loan with a custom installment count outside shortcuts", async () => {
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
        initialLendersCatalog={{
          lenders: [
            {
              id: "lender-1",
              name: "Banco Ciudad",
              type: "bank",
            },
          ],
        }}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo tarjeta",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 50000,
              total: 50000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo tarjeta" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.type(screen.getByLabelText("Cantidad total de cuotas"), "7");
    fireEvent.change(screen.getByLabelText("Inicio de la deuda"), {
      target: { value: "2026-01" },
    });
    await user.click(screen.getByRole("button", { name: "Seleccioná un prestamista" }));
    await user.click(screen.getByRole("button", { name: /Banco Ciudad/i }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        ([url]) => url === "/api/storage/monthly-expenses",
      );

      expect(saveCall).toBeDefined();

      const [, options] = saveCall as [string, RequestInit];
      const payload = JSON.parse(String(options.body));

      expect(payload).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Prestamo tarjeta",
            id: "expense-1",
            loan: {
              installmentCount: 7,
              lenderId: "lender-1",
              lenderName: "Banco Ciudad",
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      });
    });
  });

  it("keeps installment validation as a positive integer", async () => {
    const user = userEvent.setup();

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
              subtotal: 50000,
              total: 50000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo tarjeta" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.type(screen.getByLabelText("Cantidad total de cuotas"), "0");
    fireEvent.change(screen.getByLabelText("Inicio de la deuda"), {
      target: { value: "2026-01" },
    });

    expect(
      screen.queryByText("Completá la cantidad total de cuotas."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      screen.getByText("Completá la cantidad total de cuotas."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad total de cuotas")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("uses native month input with a 2000 to 2100 range for debt start month", async () => {
    const user = userEvent.setup();

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
              subtotal: 50000,
              total: 50000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo tarjeta" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    const startMonthInput = screen.getByLabelText("Inicio de la deuda");

    expect(startMonthInput).toHaveAttribute("type", "month");
    expect(startMonthInput).toHaveAttribute("min", "2000-01");
    expect(startMonthInput).toHaveAttribute("max", "2100-12");
  });

  it("requires lender selection before saving loan metadata from the sheet", async () => {
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
        initialLendersCatalog={{
          lenders: [
            {
              id: "lender-1",
              name: "Banco Ciudad",
              type: "bank",
            },
          ],
        }}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo tarjeta",
              id: "expense-1",
              loan: {
                endMonth: "2026-12",
                installmentCount: 12,
                paidInstallments: 3,
                startMonth: "2026-01",
              },
              occurrencesPerMonth: 1,
              subtotal: 50000,
              total: 50000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo tarjeta" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Seleccioná un prestamista.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/storage/monthly-expenses"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Seleccioná un prestamista" }));
    await user.click(screen.getByRole("button", { name: /Banco Ciudad/i }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Prestamo tarjeta",
            id: "expense-1",
            loan: {
              installmentCount: 12,
              lenderId: "lender-1",
              lenderName: "Banco Ciudad",
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      });
    });
  });

  it("opens the lender creation modal from the expense sheet picker", async () => {
    const user = userEvent.setup();

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

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Prestamo personal",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 50000,
              total: 50000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo personal" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.click(screen.getByRole("button", { name: "Seleccioná un prestamista" }));

    expect(
      screen.getByText("No hay prestamistas registrados todavía."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Agregar prestamista" }));

    expect(screen.getByRole("heading", { name: "Nuevo prestamista" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
  });

  it("confirms row deletion and persists immediately", async () => {
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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 20000,
              total: 20000,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Internet" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Eliminar" }));

    expect(
      screen.queryByRole("menuitem", { name: "Eliminar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("¿Querés eliminar este gasto?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Agua",
            id: "expense-1",
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 10000,
          },
        ],
        month: "2026-03",
      });
    });

    expect(screen.queryByText("Internet")).not.toBeInTheDocument();
  });

  it("adds a lender to the catalog from the page", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (input === "/api/storage/lenders") {
        return {
          json: async () => ({
            data: {
              id: "lenders-file-id",
              name: "lenders-catalog.json",
            },
          }),
          ok: true,
        };
      }

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

    await waitFor(() => {
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = new Headers(options.headers);

      expect(url).toBe("/api/storage/lenders");
      expect(options).toEqual(
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(headers.get("Content-Type")).toBe("application/json");
      expect(JSON.parse(String(options.body))).toEqual({
        lenders: [
          {
            id: expect.any(String),
            name: "Papa",
            type: "family",
          },
        ],
      });
    });

    expect(screen.getAllByText("Papa")[0]).toBeInTheDocument();
    expect(
      screen.queryByText("Prestamista guardado correctamente."),
    ).not.toBeInTheDocument();
  });

  it("discards unsaved lenders form changes from the modal", async () => {
    const user = userEvent.setup();

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
    await user.type(screen.getByLabelText("Nombre"), "Prestamista temporal");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.getByText("Tenés cambios sin guardar en este prestamista."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Descartar los cambios" }));

    expect(mockedToast.info).toHaveBeenCalledWith(
      "Se descartaron los cambios sin guardar.",
    );

    await user.click(screen.getByRole("button", { name: "Agregar prestamista" }));

    expect(screen.getByLabelText("Nombre")).toHaveValue("");
  });

  it("requires confirmation before deleting a lender from the catalog", async () => {
    const user = userEvent.setup();
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          data: {
            id: "lenders-file-id",
            name: "lenders-catalog.json",
          },
        }),
        ok: true,
      })
      .mockResolvedValueOnce({
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
        initialLendersCatalog={{
          lenders: [
            {
              id: "lender-1",
              name: "Papa",
              type: "family",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir acciones para Papa" }));
    await user.click(screen.getByRole("menuitem", { name: "Eliminar" }));

    expect(
      screen.getByText("¿Querés eliminar a Papa del catálogo?"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      expect(
        screen.queryByText("¿Querés eliminar a Papa del catálogo?"),
      ).not.toBeInTheDocument();
    });
  });

  it("submits a selected lender id and lender name with the loan", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
      if (input === "/api/storage/monthly-expenses") {
        return {
          ok: true,
          status: 204,
        };
      }

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
        initialLendersCatalog={{
          lenders: [
            {
              id: "lender-1",
              name: "Papa",
              type: "family",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    fireEvent.change(screen.getByLabelText("Descripción"), {
      target: { value: "Prestamo tarjeta" },
    });
    fireEvent.change(screen.getByLabelText("Subtotal"), {
      target: { value: "50000" },
    });
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.click(screen.getByRole("button", { name: "Seleccioná un prestamista" }));
    await user.click(screen.getByRole("button", { name: "Papa Familiar" }));
    fireEvent.change(screen.getByLabelText("Cantidad total de cuotas"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("Inicio de la deuda"), {
      target: { value: "2026-01" },
    });
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Prestamo tarjeta",
            id: expect.any(String),
            loan: {
              installmentCount: 12,
              lenderId: "lender-1",
              lenderName: "Papa",
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      });
    });
  }, 15000);
});
