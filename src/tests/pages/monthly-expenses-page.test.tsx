import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSession } from "next-auth/react";

import {
  getSafeLendersErrorMessage,
  getSafeLoansReportErrorMessage,
  getSafeMonthlyExpensesErrorMessage,
} from "@/modules/monthly-expenses/application/queries/get-monthly-expenses-page-feedback";
import type { StorageBootstrapResult } from "@/modules/storage/application/results/storage-bootstrap";
import MonthlyExpensesPage, {
  getReportProviderFilterOptions,
} from "@/pages/monthly-expenses";

jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
}));

const mockedUseSession = jest.mocked(useSession);
const originalFetch = global.fetch;

const bootstrap: StorageBootstrapResult = {
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
      id: "applicationSettings",
      requiredScope: "https://www.googleapis.com/auth/drive.appdata",
      writesUserVisibleFiles: false,
    },
    {
      id: "userFiles",
      requiredScope: "https://www.googleapis.com/auth/drive.file",
      writesUserVisibleFiles: true,
    },
  ],
};

const basePageProps = {
  bootstrap,
  initialLendersCatalog: {
    lenders: [],
  },
  initialLoansReport: {
    entries: [],
    summary: {
      activeLoanCount: 0,
      lenderCount: 0,
      remainingAmount: 0,
      trackedLoanCount: 0,
    },
  },
  lendersLoadError: null,
  loadError: null,
  reportLoadError: null,
};

function createMonthlyExpensesFetchMock(overrides?: {
  monthlyExpensesViewUrl?: string | null;
  reportEntries?: Array<Record<string, unknown>>;
}) {
  return jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
    if (input === "/api/storage/monthly-expenses") {
      return {
        json: async () => ({
          data: {
            id: "monthly-expenses-file-id",
            month: "2026-03",
            name: "monthly-expenses-2026-03.json",
            viewUrl: overrides?.monthlyExpensesViewUrl ?? null,
          },
        }),
        ok: true,
      };
    }

    if (input === "/api/storage/monthly-expenses-report") {
      return {
        json: async () => ({
          data: {
            entries: overrides?.reportEntries ?? [],
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
}

function getMonthlyExpensesSavePayload(fetchMock: jest.Mock) {
  const saveCall = fetchMock.mock.calls.find(
    ([url]) => url === "/api/storage/monthly-expenses",
  );

  expect(saveCall).toBeDefined();

  const [, options] = saveCall as [string, RequestInit];

  expect(options).toEqual(
    expect.objectContaining({
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );

  return JSON.parse(String(options.body));
}

describe("MonthlyExpensesPage", () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the monthly expenses data table with the selected month", () => {
    render(
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

    expect(
      screen.getByRole("heading", { name: "Registro mensual de gastos" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Detalle del mes" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mes")).toHaveValue("2026-03");
    expect(screen.getByText("Agua")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Filtrar gastos" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Guardar gastos" }),
    ).not.toBeInTheDocument();
  });

  it("opens a sheet to create a new expense and only saves on explicit confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock({
      monthlyExpensesViewUrl:
        "https://drive.google.com/file/d/monthly-expenses-file-id/view",
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

    render(
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
      screen.getByRole("heading", { name: "Nuevo gasto" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Descripción"), "Internet");
    await user.type(screen.getByLabelText("Subtotal"), "15000");
    await user.type(screen.getByLabelText("Cantidad de veces por mes"), "1");

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
      screen.getByText(
        "Gastos mensuales guardados en Drive con id monthly-expenses-file-id.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir archivo mensual en Drive" }),
    ).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/monthly-expenses-file-id/view",
    );
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

    render(
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

  it("renders an active Google connection badge when the user is authenticated", () => {
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.getByText("Google conectado - Activo")).toBeInTheDocument();
  });

  it("renders a loading Google connection badge while the session is being verified", () => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: "loading",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.getByText("Google conectado - Verificando"),
    ).toBeInTheDocument();
  });

  it("renders an inactive Google connection badge when the user is not authenticated", () => {
    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.getByText("Google desconectado - Inactivo")).toBeInTheDocument();
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

    render(
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));

    expect(
      screen.getByRole("heading", { name: "Editar gasto" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Agua")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtotal")).toHaveValue("10.774,53");

    await user.clear(screen.getByLabelText("Subtotal"));
    await user.type(screen.getByLabelText("Subtotal"), "12000");

    expect(screen.getByLabelText("Subtotal")).toHaveAttribute(
      "data-changed",
      "true",
    );
    expect(
      screen.getByText("Los labels amarillos subrayados indican cambios sin guardar."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Subtotal")).toHaveValue("12.000");
    expect(screen.getByLabelText("Total")).toHaveValue("12.000");

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Agua",
            id: "expense-1",
            occurrencesPerMonth: 1,
            subtotal: 12000,
          },
        ],
        month: "2026-03",
      });
    });

    expect(
      screen.queryByRole("heading", { name: "Editar gasto" }),
    ).not.toBeInTheDocument();
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

    render(
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

    render(
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
    expect(screen.getByLabelText("Total")).toHaveValue("0");
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

    render(
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Agua filtrada");

    const overlay = document.querySelector("[data-slot='sheet-overlay']");
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

    render(
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.clear(screen.getByLabelText("Descripción"));
    await user.type(screen.getByLabelText("Descripción"), "Agua descartada");

    const overlay = document.querySelector("[data-slot='sheet-overlay']");
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

  it("shows validation inside the sheet and blocks save when an expense is incomplete", async () => {
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));
    await user.type(screen.getByLabelText("Subtotal"), "1000");

    expect(screen.getByText("Completá la descripción.")).toBeInTheDocument();
    expect(
      screen.getByText("Ingresá una cantidad mayor a 0."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Descripción")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Cantidad de veces por mes")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Agregar gasto" }));

    expect(screen.queryByText("Seleccioná un prestador")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Es deuda/préstamo"));

    expect(screen.getByText("Seleccioná un prestador")).toBeInTheDocument();
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

    expect(screen.queryByText("Seleccioná un prestador")).not.toBeInTheDocument();
  });

  it("shows the debt info popover and closes it from the close button or outside click", async () => {
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

    render(
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
        "Marcá el check si este gasto representa una deuda con una persona o entidad.",
      ),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Más información sobre deuda o préstamo",
      }),
    );

    expect(
      screen.getByText(
        "Marcá el check si este gasto representa una deuda con una persona o entidad.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Cerrar ayuda sobre deuda o préstamo",
      }),
    );

    expect(
      screen.queryByText(
        "Marcá el check si este gasto representa una deuda con una persona o entidad.",
      ),
    ).not.toBeInTheDocument();
  });

  it("filters expenses from the data table by description", async () => {
    const user = userEvent.setup();

    render(
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

    await user.type(screen.getByRole("textbox", { name: "Filtrar gastos" }), "agua");

    expect(screen.getByText("Agua")).toBeInTheDocument();
    expect(screen.queryByText("Prestamo tarjeta")).not.toBeInTheDocument();
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

    render(
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));

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
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("saves loan metadata from the sheet and keeps lender optional", async () => {
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      });
    });
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

    render(
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.type(screen.getByLabelText("Nombre"), "Papa");
    await user.click(screen.getByRole("button", { name: "Agregar prestador" }));

    await waitFor(() => {
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];

      expect(url).toBe("/api/storage/lenders");
      expect(options).toEqual(
        expect.objectContaining({
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        }),
      );
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

    render(
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
          json: async () => ({
            data: {
              id: "monthly-expenses-file-id",
              month: "2026-03",
              name: "monthly-expenses-2026-03.json",
              viewUrl: null,
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

    render(
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

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Prestamo tarjeta" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.click(screen.getByRole("button", { name: "Seleccioná un prestador" }));
    await user.click(screen.getByRole("button", { name: "Papa Familiar" }));
    await user.type(screen.getByLabelText("Cantidad total de cuotas"), "12");
    await user.click(screen.getByLabelText("Inicio de la deuda"));
    const [monthSelect, yearSelect] = screen
      .getAllByRole("combobox")
      .filter((element) => element.tagName === "SELECT");
    await user.selectOptions(monthSelect, "0");
    await user.selectOptions(yearSelect, "2026");
    await user.click(screen.getByRole("button", { name: /Usar enero de 2026/i }));
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
              lenderName: "Papa",
              startMonth: "2026-01",
            },
            occurrencesPerMonth: 1,
            subtotal: 50000,
          },
        ],
        month: "2026-03",
      });
    });
  });

  it("builds report lender filter options from catalog lenders and legacy report entries", () => {
    expect(
      getReportProviderFilterOptions(
        [
          {
            activeLoanCount: 1,
            expenseDescriptions: ["Tarjeta"],
            firstDebtMonth: "2026-01",
            lenderId: null,
            lenderName: "Prestador manual",
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
      {
        id: "legacy:Prestador manual",
        label: "Prestador manual",
      },
    ]);
  });

  it("maps technical report errors to a user-friendly message", () => {
    expect(
      getSafeLoansReportErrorMessage("repository.listAll is not a function"),
    ).toBe(
      "No pudimos actualizar el reporte de deudas en este momento. Igual podés seguir cargando gastos y volver a intentarlo más tarde.",
    );
  });

  it("maps technical monthly expenses errors to a user-friendly message", () => {
    expect(
      getSafeMonthlyExpensesErrorMessage(
        "Google authentication is required before saving monthly expenses to Drive.",
      ),
    ).toBe("Conectate con Google para guardar tus gastos mensuales en Drive.");
  });

  it("maps technical lenders errors to a user-friendly message", () => {
    expect(
      getSafeLendersErrorMessage(
        "The current Google session is missing the Drive permissions required to manage lenders.",
      ),
    ).toBe(
      "Tu sesión actual no tiene permisos suficientes para gestionar prestadores en Drive.",
    );
  });

  it("shows a safe report error message without the empty-state copy", () => {
    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
        reportLoadError="repository.listAll is not a function"
      />,
    );

    expect(
      screen.getByText(
        "No pudimos actualizar el reporte de deudas en este momento. Igual podés seguir cargando gastos y volver a intentarlo más tarde.",
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Expensas",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 55032.07,
              total: 55032.07,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Abrir acciones para Expensas" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "Conectate con Google para guardar tus gastos mensuales en Drive.",
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

    render(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.type(screen.getByLabelText("Nombre"), "Papa");
    await user.click(screen.getByRole("button", { name: "Agregar prestador" }));

    expect(
      await screen.findByText(
        "Tu sesión actual no tiene permisos suficientes para gestionar prestadores en Drive.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "The current Google session is missing the Drive permissions required to manage lenders.",
      ),
    ).not.toBeInTheDocument();
  });
});
