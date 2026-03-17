import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import { signIn, signOut, useSession } from "next-auth/react";
import type { ReactElement } from "react";
import { toast } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import {
  getSafeLendersErrorMessage,
  getSafeLoansReportErrorMessage,
  getSafeMonthlyExpensesErrorMessage,
} from "@/modules/monthly-expenses/application/queries/get-monthly-expenses-page-feedback";
import type { StorageBootstrapResult } from "@/modules/storage/application/results/storage-bootstrap";
import MonthlyExpensesPage, {
  getRequestedMonthlyExpensesTab,
  getReportProviderFilterOptions,
} from "@/pages/gastos";

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
const SIDEBAR_STORAGE_KEY = "xfly.sidebar.open";
const TABLE_PREFERENCES_STORAGE_KEY =
  "xfly.monthly-expenses.table-preferences";

function renderWithProviders(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

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
  ],
  storageTargets: [
    {
      id: "userFiles",
      requiredScope: "https://www.googleapis.com/auth/drive.file",
      writesUserVisibleFiles: true,
    },
  ],
};

const basePageProps = {
  bootstrap,
  initialCopyableMonths: {
    defaultSourceMonth: null,
    sourceMonths: [],
    targetMonth: "2026-03",
  },
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
  initialActiveTab: "expenses" as const,
  reportLoadError: null,
};

function createMockRouter(
  overrides?: Partial<{
    isReady: boolean;
    pathname: string;
    query: Record<string, string | string[] | undefined>;
    replace: jest.Mock;
  }>,
) {
  return {
    isReady: true,
    pathname: "/gastos",
    query: {},
    replace: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function createMonthlyExpensesFetchMock(overrides?: {
  monthlyDocument?: {
    items: Array<Record<string, unknown>>;
    month: string;
  };
  reportEntries?: Array<Record<string, unknown>>;
}) {
  return jest.fn().mockImplementation(async (input: RequestInfo | URL) => {
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
          data: overrides?.monthlyDocument ?? {
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
  const headers = new Headers(options.headers);

  expect(options).toEqual(
    expect.objectContaining({
      method: "POST",
    }),
  );
  expect(headers.get("Content-Type")).toBe("application/json");

  return JSON.parse(String(options.body));
}

function getMonthlyExpensesDescriptionsOrder(): Array<string | null> {
  const table = screen.getByRole("table");
  const tableBody = table.querySelector("tbody");

  if (!tableBody) {
    return [];
  }

  return within(tableBody)
    .getAllByRole("row")
    .map((row) => within(row).getAllByRole("cell")[0].textContent?.trim() ?? null);
}

function getPersistedTablePreferences():
  | {
      columnVisibility: Record<string, boolean>;
      loanSortMode: string;
      sorting: Array<{ desc: boolean; id: string }>;
    }
  | null {
  const serializedPreferences = window.localStorage.getItem(
    TABLE_PREFERENCES_STORAGE_KEY,
  );

  if (!serializedPreferences) {
    return null;
  }

  return JSON.parse(serializedPreferences) as {
    columnVisibility: Record<string, boolean>;
    loanSortMode: string;
    sorting: Array<{ desc: boolean; id: string }>;
  };
}

describe("MonthlyExpensesPage", () => {
  beforeEach(() => {
    if (typeof HTMLElement !== "undefined") {
      if (!HTMLElement.prototype.hasPointerCapture) {
        Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
          configurable: true,
          value: () => false,
        });
      }

      if (!HTMLElement.prototype.setPointerCapture) {
        Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
          configurable: true,
          value: () => undefined,
        });
      }

      if (!HTMLElement.prototype.releasePointerCapture) {
        Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
          configurable: true,
          value: () => undefined,
        });
      }
    }

    if (
      typeof Element !== "undefined" &&
      !Element.prototype.scrollIntoView
    ) {
      Object.defineProperty(Element.prototype, "scrollIntoView", {
        configurable: true,
        value: () => undefined,
      });
    }

    mockedSignIn.mockReset();
    mockedSignOut.mockReset();
    mockedToast.mockReset();
    mockedToast.error.mockReset();
    mockedToast.info.mockReset();
    mockedToast.promise.mockReset();
    mockedToast.success.mockReset();
    mockedToast.warning.mockReset();
    mockedUseRouter.mockReturnValue(
      createMockRouter() as unknown as ReturnType<typeof useRouter>,
    );
    mockedUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: jest.fn(),
    } as ReturnType<typeof useSession>);
    global.fetch = jest.fn();
    window.localStorage.clear();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("renders the monthly expenses data table with the selected month", () => {
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

  it("shows month help inside a closable popover", async () => {
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

    expect(
      screen.queryByText("Cambiá el mes para guardar o consultar otra planilla mensual."),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Información sobre el campo Mes" })[0],
    );

    expect(
      screen.getAllByText("Cambiá el mes para guardar o consultar otra planilla mensual.")
        .length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getAllByRole("button", { name: "Cerrar información de Mes" })[0],
    );

    await waitFor(() => {
      expect(
        screen.queryAllByText(
          "Cambiá el mes para guardar o consultar otra planilla mensual.",
        ).length,
      ).toBe(0);
    });
  });

  it("shows a column selector and keeps Descripcion always visible", async () => {
    const user = userEvent.setup();

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

    expect(screen.getByRole("columnheader", { name: "Descripción" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columnas" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));

    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Descripción" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Moneda" }));

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Subtotal" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("columnheader", { name: "Moneda" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Descripción" })).toBeInTheDocument();
  });

  it("shows hide icons only for hideable headers and hides columns from the header controls", async () => {
    const user = userEvent.setup();

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
              subtotal: 200,
              total: 200,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Ocultar columna Descripción" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ocultar columna Subtotal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ocultar columna Deuda / cuotas" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ocultar columna Subtotal" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("columnheader", { name: "Subtotal" }),
      ).not.toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: "Ocultar columna Deuda / cuotas" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("columnheader", { name: "Deuda / cuotas" }),
      ).not.toBeInTheDocument();
    });
  });

  it("allows selecting and deselecting all hideable columns from the selector", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitem", { name: "Ocultar todas" }));

    await user.keyboard("{Escape}");

    expect(screen.getByRole("columnheader", { name: "Descripción" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Moneda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Link" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitem", { name: "Mostrar todas" }));

    await user.keyboard("{Escape}");

    expect(screen.getByRole("columnheader", { name: "Moneda" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Link" })).toBeInTheDocument();
  });

  it("shows a modified indicator on the column selector button when visibility changes", async () => {
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
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByText("Columnas modificadas"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Moneda" }));
    expect(screen.getByText("Columna deseleccionada")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.getByText("Columnas modificadas")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitem", { name: "Mostrar todas" }));
    await user.keyboard("{Escape}");

    expect(
      screen.queryByText("Columnas modificadas"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    expect(screen.queryByText("Columna deseleccionada")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("shows sorting status badge below the filter and allows clearing sorting from the badge", async () => {
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
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Luz",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 20,
              total: 20,
            },
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-3",
              occurrencesPerMonth: 1,
              subtotal: 5,
              total: 5,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.queryByText("Columnas modificadas"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Ordenado por:/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    expect(
      screen.queryByRole("menuitem", { name: /Quitar orden/i }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Ordenar Subtotal" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Internet",
      "Luz",
      "Agua",
    ]);
    expect(screen.queryByText("Columnas modificadas")).not.toBeInTheDocument();
    expect(screen.getByText("Ordenado por: Subtotal ↑")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    expect(
      screen.queryByRole("menuitem", { name: /Quitar orden/i }),
    ).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Quitar orden" }));
    await user.keyboard("{Escape}");

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Agua",
      "Luz",
      "Internet",
    ]);
    expect(screen.queryByText(/Ordenado por:/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Columnas modificadas"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    expect(
      screen.queryByRole("menuitem", { name: /Quitar orden/i }),
    ).not.toBeInTheDocument();
  });

  it("restores persisted table sorting and column visibility from localStorage", async () => {
    window.localStorage.setItem(
      TABLE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        columnVisibility: {
          currency: false,
          paymentLink: false,
        },
        loanSortMode: "paidInstallments",
        sorting: [
          {
            desc: true,
            id: "subtotal",
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
              description: "Luz",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 20,
              total: 20,
            },
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-3",
              occurrencesPerMonth: 1,
              subtotal: 5,
              total: 5,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await waitFor(() => {
      expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
        "Agua",
        "Luz",
        "Internet",
      ]);
    });

    await waitFor(() => {
      expect(
        screen.queryByRole("columnheader", { name: "Moneda" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("columnheader", { name: "Link" }),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByRole("columnheader", { name: "Descripción" })).toBeInTheDocument();
  });

  it("persists table sorting and column visibility in localStorage", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Luz",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 20,
              total: 20,
            },
            {
              currency: "ARS",
              description: "Agua",
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

    await user.click(screen.getByRole("button", { name: "Ordenar Subtotal" }));
    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Moneda" }));

    await waitFor(() => {
      const persistedTablePreferences = getPersistedTablePreferences();

      expect(persistedTablePreferences).not.toBeNull();
      expect(persistedTablePreferences?.loanSortMode).toBe("paidInstallments");
      expect(persistedTablePreferences?.sorting).toEqual([
        {
          desc: false,
          id: "subtotal",
        },
      ]);
      expect(persistedTablePreferences?.columnVisibility).toEqual(
        expect.objectContaining({
          currency: false,
        }),
      );
    });
  });

  it("sorts subtotal numerically in ascending and descending order", async () => {
    const user = userEvent.setup();

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
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Luz",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 20,
              total: 20,
            },
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-3",
              occurrencesPerMonth: 10,
              subtotal: 5,
              total: 50,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ordenar Subtotal" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Internet",
      "Luz",
      "Agua",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Subtotal" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Agua",
      "Luz",
      "Internet",
    ]);
  });

  it("sorts total numerically in ascending and descending order", async () => {
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
              subtotal: 100,
              total: 300,
            },
            {
              currency: "ARS",
              description: "Luz",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 20,
              total: 20,
            },
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-3",
              occurrencesPerMonth: 10,
              subtotal: 5,
              total: 50,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ordenar Total" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Luz",
      "Internet",
      "Agua",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar Total" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Agua",
      "Internet",
      "Luz",
    ]);
  });

  it("sorts ARS numerically using the monthly snapshot conversion", async () => {
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
            solidarityRate: 100,
          },
          items: [
            {
              currency: "USD",
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 1,
              total: 1,
            },
            {
              currency: "ARS",
              description: "Luz",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 50,
              total: 50,
            },
            {
              currency: "USD",
              description: "Internet",
              id: "expense-3",
              occurrencesPerMonth: 1,
              subtotal: 2,
              total: 2,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ordenar ARS" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Luz",
      "Agua",
      "Internet",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar ARS" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Internet",
      "Agua",
      "Luz",
    ]);
  });

  it("sorts USD numerically using the monthly snapshot conversion", async () => {
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
            solidarityRate: 100,
          },
          items: [
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 300,
              total: 300,
            },
            {
              currency: "USD",
              description: "Luz",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 2,
              total: 2,
            },
            {
              currency: "ARS",
              description: "Internet",
              id: "expense-3",
              occurrencesPerMonth: 1,
              subtotal: 100,
              total: 100,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ordenar USD" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Internet",
      "Luz",
      "Agua",
    ]);

    await user.click(screen.getByRole("button", { name: "Ordenar USD" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Agua",
      "Luz",
      "Internet",
    ]);
  });

  it("renders ARS and USD totals in the table footer", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          exchangeRateLoadError: null,
          exchangeRateSnapshot: {
            blueRate: 1290,
            month: "2026-03",
            officialRate: 1200,
            solidarityRate: 120,
          },
          items: [
            {
              currency: "ARS",
              description: "Agua",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 150,
              total: 150,
            },
            {
              currency: "USD",
              description: "Internet",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 2,
              total: 2,
            },
          ],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.getByText("$ 390,00")).toBeInTheDocument();
    expect(screen.getByText("US$ 3,25")).toBeInTheDocument();
  });

  it("falls back to the expenses tab for invalid query values", () => {
    expect(getRequestedMonthlyExpensesTab(undefined)).toBe("expenses");
    expect(getRequestedMonthlyExpensesTab("unknown")).toBe("expenses");
    expect(getRequestedMonthlyExpensesTab(["debts"])).toBe("debts");
  });

  it("renders the lenders tab when it arrives from the URL state", () => {
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

    expect(
      screen.getByText("Guardá prestamistas para reutilizarlos en tus deudas."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Gastos del mes" }),
    ).not.toBeInTheDocument();
  });

  it("renders lender notes in the lenders list", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialActiveTab="lenders"
        initialLendersCatalog={{
          lenders: [
            {
              id: "lender-1",
              name: "Adrián Saúl Modarelli",
              notes: "Priorizar transferencia por CBU",
              type: "family",
            },
          ],
        }}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.getByText("Adrián Saúl Modarelli")).toBeInTheDocument();
    expect(screen.getByText("Familiar")).toBeInTheDocument();
    expect(
      screen.getByText("Priorizar transferencia por CBU"),
    ).toBeInTheDocument();
  });

  it("renders sidebar links for the section routes", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Cotizaciones del dólar" }),
    ).toHaveAttribute("href", "/cotizaciones");
    expect(
      screen.getByRole("link", { name: "Prestamistas" }),
    ).toHaveAttribute("href", "/prestamistas");
    expect(
      screen.getByRole("link", { name: "Reporte de deudas" }),
    ).toHaveAttribute("href", "/reportes/deudas");
  });

  it("keeps sidebar expanded by default when there is no persisted state", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    const sidebar = document.querySelector("[data-slot='sidebar'][data-state]");

    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveAttribute("data-state", "expanded");
  });

  it("renders a visible sidebar trigger attached to the sidebar edge", () => {
    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    const sidebarTrigger = screen.getByRole("button", { name: "Toggle Sidebar" });

    expect(sidebarTrigger).toHaveAttribute("data-sidebar", "trigger");
  });

  it("restores the sidebar state from localStorage", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "false");

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await waitFor(() => {
      const sidebar = document.querySelector("[data-slot='sidebar'][data-state]");

      expect(sidebar).not.toBeNull();
      expect(sidebar).toHaveAttribute("data-state", "collapsed");
    });
  });

  it("persists sidebar state changes to localStorage when the trigger control is used", async () => {
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

    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("false");

    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));

    expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe("true");
  });

  it("updates the URL query when changing month and preserves the active tab", async () => {
    const router = createMockRouter({
      query: {
        month: "2026-03",
      },
    });

    mockedUseRouter.mockReturnValue(
      router as unknown as ReturnType<typeof useRouter>,
    );

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Mes"), {
      target: {
        value: "2026-04",
      },
    });

    expect(router.replace).toHaveBeenCalledWith(
      {
        pathname: "/gastos",
        query: {
          month: "2026-04",
        },
      },
      undefined,
      {
        scroll: false,
      },
    );
  });

  it("shows copy controls only when the current month has no rows", () => {
    const { rerender } = renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialCopyableMonths={{
          defaultSourceMonth: "2026-02",
          sourceMonths: ["2026-02", "2026-01"],
          targetMonth: "2026-03",
        }}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Copia de" })).toBeInTheDocument();

    rerender(
      <TooltipProvider>
        <MonthlyExpensesPage
          {...basePageProps}
          initialCopyableMonths={{
            defaultSourceMonth: "2026-02",
            sourceMonths: ["2026-02", "2026-01"],
            targetMonth: "2026-03",
          }}
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
            ],
            month: "2026-03",
          }}
        />
      </TooltipProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Copia de" }),
    ).not.toBeInTheDocument();
  });

  it("copies rows from a selected saved month without auto-saving", async () => {
    const user = userEvent.setup();
    const fetchMock = createMonthlyExpensesFetchMock({
      monthlyDocument: {
        items: [
          {
            currency: "ARS",
            description: "Internet",
            id: "expense-source-1",
            occurrencesPerMonth: 1,
            subtotal: 12000,
            total: 12000,
          },
        ],
        month: "2026-02",
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
        initialCopyableMonths={{
          defaultSourceMonth: "2026-02",
          sourceMonths: ["2026-02", "2026-01"],
          targetMonth: "2026-03",
        }}
        initialDocument={{
          items: [],
          month: "2026-03",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copia de" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        "/api/storage/monthly-expenses?month=2026-02",
      );
    });

    expect(screen.getByText("Internet")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/storage/monthly-expenses",
      expect.objectContaining({
        method: "POST",
      }),
    );
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
    await user.type(screen.getByLabelText("Descripción"), "Empleada doméstica");
    await user.type(screen.getByLabelText("Subtotal"), "5000");

    await user.click(
      screen.getByRole("radio", { name: "Se paga varias veces en el mes" }),
    );

    const occurrencesInput = screen.getByLabelText("Veces al mes");
    await user.clear(occurrencesInput);
    await user.type(occurrencesInput, "8");

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
  });

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
        name: "Editar link de pago para Electricidad",
      }),
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
        name: "Eliminar link de pago para Electricidad",
      }),
    );

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
        name: "Eliminar link de pago para Electricidad",
      }),
    );

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
      screen.getAllByText("Enviar comprobante a 5491123456789").length,
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
    expect(screen.getByLabelText("Subtotal")).toHaveValue("10.774,53");

    await user.clear(screen.getByLabelText("Subtotal"));
    await user.type(screen.getByLabelText("Subtotal"), "12000");

    expect(screen.getByLabelText("Subtotal")).toHaveAttribute(
      "data-changed",
      "true",
    );
    expect(
      screen.getByText("Los labels amarillos subrayados marcan cambios sin guardar."),
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
            paymentLink: null,
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

  it("filters expenses by description with fuzzy, accent-insensitive matching and highlights matches", async () => {
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

    await user.type(screen.getByRole("textbox", { name: "Filtrar gastos" }), "PRESTJ");

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
    expect(highlightedText).toBe("Préstj");

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

  it("prioritizes fuzzy matches with contiguous letters over dispersed matches", async () => {
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

    const compactMatchRow = screen.getByText(
      (_, element) => element?.textContent === "Abc gasto",
    ).closest("tr");
    const dispersedMatchRow = screen.getByText(
      (_, element) => element?.textContent === "AxxBxxC gasto",
    ).closest("tr");

    expect(compactMatchRow).not.toBeNull();
    expect(dispersedMatchRow).not.toBeNull();

    if (!compactMatchRow || !dispersedMatchRow) {
      throw new Error("Expected both fuzzy matching rows to be present");
    }

    const visibleRows = screen.getAllByRole("row");

    expect(visibleRows.indexOf(compactMatchRow)).toBeLessThan(
      visibleRows.indexOf(dispersedMatchRow),
    );
  });

  it("prioritizes ipe matches with more contiguous letters", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Impuestos del auto",
              id: "expense-1",
              occurrencesPerMonth: 1,
              subtotal: 10000,
              total: 10000,
            },
            {
              currency: "ARS",
              description: "Limpieza Domestica",
              id: "expense-2",
              occurrencesPerMonth: 1,
              subtotal: 12000,
              total: 12000,
            },
            {
              currency: "ARS",
              description: "Iphone",
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

    await user.type(screen.getByRole("textbox", { name: "Filtrar gastos" }), "ipe");

    const iphoneRow = screen.getByText((_, element) => element?.textContent === "Iphone").closest("tr");
    const impuestosRow = screen.getByText(
      (_, element) => element?.textContent === "Impuestos del auto",
    ).closest("tr");
    const limpiezaRow = screen.getByText(
      (_, element) => element?.textContent === "Limpieza Domestica",
    ).closest("tr");

    expect(iphoneRow).not.toBeNull();
    expect(impuestosRow).not.toBeNull();
    expect(limpiezaRow).not.toBeNull();

    if (!iphoneRow || !impuestosRow || !limpiezaRow) {
      throw new Error("Expected all ipe fuzzy matching rows to be present");
    }

    const visibleRows = screen.getAllByRole("row");

    expect(visibleRows.indexOf(iphoneRow)).toBeLessThan(
      visibleRows.indexOf(impuestosRow),
    );
    expect(visibleRows.indexOf(iphoneRow)).toBeLessThan(
      visibleRows.indexOf(limpiezaRow),
    );
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
    await user.type(screen.getByLabelText("Descripción"), "Prestamo tarjeta");
    await user.type(screen.getByLabelText("Subtotal"), "50000");
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.click(screen.getByRole("button", { name: "Seleccioná un prestamista" }));
    await user.click(screen.getByRole("button", { name: "Papa Familiar" }));
    await user.type(screen.getByLabelText("Cantidad total de cuotas"), "12");
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
    await user.type(screen.getByLabelText("Descripción"), "Expensas");
    await user.type(screen.getByLabelText("Subtotal"), "55032,07");
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

  it("renders ARS and USD converted columns using the monthly snapshot", () => {
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

    expect(screen.getByRole("columnheader", { name: "ARS" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "USD" })).toBeInTheDocument();
    expect(screen.getByText(/^Dólar oficial:/i)).toBeInTheDocument();
    expect(screen.getByText("$ 1.200")).toBeInTheDocument();
    expect(screen.getByText(/^Dólar solidario:/i)).toBeInTheDocument();
    expect(screen.getByText("$ 1.476")).toBeInTheDocument();
    expect(screen.getAllByText("$ 14.760,00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("US$ 10").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the Link column after USD and opens payment links in a new tab", async () => {
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

  it("renders Pagos and Pagos sin comprobante columns immediately before Comprobantes", () => {
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
    const manualPaidHeaderIndex = headers.indexOf("Pagos sin comprobante");
    const receiptHeaderIndex = headers.indexOf("Comprobantes");

    expect(manualPaidHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(receiptHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(paidHeaderIndex).toBe(manualPaidHeaderIndex - 1);
    expect(manualPaidHeaderIndex).toBe(receiptHeaderIndex - 1);
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

    const manualPaymentsInput = screen.getByRole("spinbutton", {
      name: "Pagos sin comprobante de Internet",
    });

    await user.clear(manualPaymentsInput);
    await user.type(manualPaymentsInput, "5{enter}");

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]?.manualCoveredPayments).toBe(5);
    });
  });

  it("discards manual covered payments draft changes from the table input column", async () => {
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

    const manualPaymentsInput = screen.getByRole("spinbutton", {
      name: "Pagos sin comprobante de Internet",
    });

    await user.clear(manualPaymentsInput);
    await user.type(manualPaymentsInput, "5");

    const discardButton = screen.getByRole("button", {
      name: "Descartar cambios de pagos sin comprobante de Internet",
    });

    await user.click(discardButton);

    expect(manualPaymentsInput).toHaveValue(0);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "/api/storage/monthly-expenses",
      ),
    ).toBe(false);
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
        name: /1 comprobantes/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Eliminar comprobante comprobante.pdf",
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
        name: /1 comprobantes/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Editar cobertura de comprobante comprobante.pdf",
      }),
    );

    const coveredPaymentsInput = screen.getByRole("spinbutton", {
      name: "Cantidad de pagos",
    });

    await user.clear(coveredPaymentsInput);
    await user.type(coveredPaymentsInput, "4");

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      const payload = getMonthlyExpensesSavePayload(fetchMock);

      expect(payload.items[0]?.receipts?.[0]?.coveredPayments).toBe(4);
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
        name: /2 comprobantes/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Editar cobertura de comprobante comprobante-1.pdf",
      }),
    );

    const coveredPaymentsInput = screen.getByRole("spinbutton", {
      name: "Cantidad de pagos",
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

    await user.click(screen.getByRole("button", { name: "Adjuntar comprobante" }));

    expect(mockedToast.warning).toHaveBeenCalledWith(
      "No quedan pagos pendientes para cubrir con comprobantes.",
    );
    expect(screen.queryByText("Subir comprobante")).not.toBeInTheDocument();
  });

  it("renders Estado de envío, Enviar, and payments columns after Link", () => {
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
    const manualPaidHeaderIndex = headers.indexOf("Pagos sin comprobante");
    const receiptHeaderIndex = headers.indexOf("Comprobantes");
    const monthlyReceiptFolderHeaderIndex = headers.indexOf(
      "Carpeta del mes actual",
    );
    const allReceiptsFolderHeaderIndex = headers.indexOf("Carpeta de comprobantes");

    expect(linkHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(receiptShareStatusHeaderIndex).toBe(linkHeaderIndex + 1);
    expect(receiptShareLinkHeaderIndex).toBe(receiptShareStatusHeaderIndex + 1);
    expect(paidHeaderIndex).toBe(receiptShareLinkHeaderIndex + 1);
    expect(manualPaidHeaderIndex).toBe(paidHeaderIndex + 1);
    expect(receiptHeaderIndex).toBe(manualPaidHeaderIndex + 1);
    expect(monthlyReceiptFolderHeaderIndex).toBe(receiptHeaderIndex + 1);
    expect(allReceiptsFolderHeaderIndex).toBe(monthlyReceiptFolderHeaderIndex + 1);
    expect(
      screen.getByRole("button", { name: "Adjuntar comprobante" }),
    ).toBeInTheDocument();
  });

  it("renders receipt link inside the comprobantes popover and keeps folder links visible", async () => {
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
        name: /1 comprobantes/i,
      }),
    );

    const receiptLink = await screen.findByRole("link", {
      name: "Ver comprobante parte 1",
    });
    const monthlyReceiptFolderLink = screen.getByRole("link", {
      name: "Ver carpeta del mes actual",
    });
    const allReceiptsFolderLink = screen.getByRole("link", {
      name: "Ver carpeta",
    });

    expect(receiptLink).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/receipt-file-id/view",
    );
    expect(monthlyReceiptFolderLink).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-month-folder-id",
    );
    expect(allReceiptsFolderLink).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-folder-id",
    );
  });

  it("keeps folder links visible when an item has folders metadata and no receipts", () => {
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

    const monthlyReceiptFolderLink = screen.getByRole("link", {
      name: "Ver carpeta del mes actual",
    });
    const allReceiptsFolderLink = screen.getByRole("link", {
      name: "Ver carpeta",
    });

    expect(monthlyReceiptFolderLink).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/receipt-month-folder-id",
    );
    expect(allReceiptsFolderLink).toHaveAttribute(
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
      screen.getByRole("button", {
        name: "Quitar referencia de carpeta del mes actual",
      }),
    );

    expect(
      screen.getByText("¿Querés quitar la referencia de carpeta?"),
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
      screen.getByRole("button", {
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
      screen.getByRole("button", {
        name: "Quitar referencia de carpeta de comprobantes",
      }),
    );

    expect(
      screen.getByText("¿Querés quitar la referencia de carpeta?"),
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
      screen.getByRole("button", {
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

  it("sorts Estado de envío with No aplica rows always at the end", async () => {
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

  it("sorts Deuda / cuotas by selected metric and keeps No aplica at the end", async () => {
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

  it("renders Prestamista followed by Inicio cuota and Fin cuota, and keeps actions header at the end", () => {
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

    expect(loanHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(lenderHeaderIndex).toBe(loanHeaderIndex + 1);
    expect(installmentStartHeaderIndex).toBe(lenderHeaderIndex + 1);
    expect(installmentEndHeaderIndex).toBe(installmentStartHeaderIndex + 1);
    expect(headers.at(installmentEndHeaderIndex + 1)).toBe("");

    const expenseRow = screen.getByRole("row", { name: /Prestamo tarjeta/i });
    const expenseCells = within(expenseRow).getAllByRole("cell");

    expect(expenseCells.at(lenderHeaderIndex)?.textContent?.trim()).toBe("-");
    expect(expenseCells.at(installmentStartHeaderIndex)?.textContent?.trim()).toBe(
      "-",
    );
    expect(expenseCells.at(installmentEndHeaderIndex)?.textContent?.trim()).toBe(
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
