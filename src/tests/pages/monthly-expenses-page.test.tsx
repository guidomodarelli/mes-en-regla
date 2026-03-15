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
const SIDEBAR_STORAGE_KEY = "mis-finanzas.sidebar.open";

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

describe("MonthlyExpensesPage", () => {
  beforeEach(() => {
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
    await user.click(screen.getByRole("menuitem", { name: "Deseleccionar todas" }));

    await user.keyboard("{Escape}");

    expect(screen.getByRole("columnheader", { name: "Descripción" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Moneda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Link" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Columnas" }));
    await user.click(screen.getByRole("menuitem", { name: "Seleccionar todas" }));

    await user.keyboard("{Escape}");

    expect(screen.getByRole("columnheader", { name: "Moneda" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Link" })).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "Subtotal" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Internet",
      "Luz",
      "Agua",
    ]);

    await user.click(screen.getByRole("button", { name: "Subtotal" }));

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

    await user.click(screen.getByRole("button", { name: "Total" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Luz",
      "Internet",
      "Agua",
    ]);

    await user.click(screen.getByRole("button", { name: "Total" }));

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

    await user.click(screen.getByRole("button", { name: "ARS" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Luz",
      "Agua",
      "Internet",
    ]);

    await user.click(screen.getByRole("button", { name: "ARS" }));

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

    await user.click(screen.getByRole("button", { name: "USD" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Internet",
      "Luz",
      "Agua",
    ]);

    await user.click(screen.getByRole("button", { name: "USD" }));

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

    expect(screen.getByText("$ 390")).toBeInTheDocument();
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
      screen.getByText("Guardá prestadores para reutilizarlos en tus deudas."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Gastos del mes" }),
    ).not.toBeInTheDocument();
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
      screen.getByRole("link", { name: "Prestadores" }),
    ).toHaveAttribute("href", "/prestadores");
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

  it("persists paymentLink as null when the payment link input is left empty", async () => {
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
    await user.type(screen.getByLabelText("Descripción"), "Electricidad");
    await user.type(screen.getByLabelText("Subtotal"), "45");
    await user.type(
      screen.getByLabelText("Link de pago"),
      "https://pagos.empresa-energia.com",
    );
    await user.clear(screen.getByLabelText("Link de pago"));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: expect.any(String),
            occurrencesPerMonth: 1,
            paymentLink: null,
            subtotal: 45,
          },
        ],
        month: "2026-03",
      });
    });
  });

  it("accepts paymentLink without protocol and normalizes it before saving", async () => {
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
    await user.type(screen.getByLabelText("Descripción"), "Electricidad");
    await user.type(screen.getByLabelText("Subtotal"), "45");
    await user.type(screen.getByLabelText("Link de pago"), "google.com");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => {
      expect(getMonthlyExpensesSavePayload(fetchMock)).toEqual({
        items: [
          {
            currency: "ARS",
            description: "Electricidad",
            id: expect.any(String),
            occurrencesPerMonth: 1,
            paymentLink: "https://google.com",
            subtotal: 45,
          },
        ],
        month: "2026-03",
      });
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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

  it("validates payment link after save attempt and keeps save enabled", async () => {
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
    await user.type(screen.getByLabelText("Descripción"), "Electricidad");
    await user.type(screen.getByLabelText("Subtotal"), "45");
    await user.type(screen.getByLabelText("Link de pago"), "asdads");

    expect(
      screen.queryByText(
        "Ingresá un link válido con dominio (por ejemplo, ejemplo.com).",
      ),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      screen.getByText(
        "Ingresá un link válido con dominio (por ejemplo, ejemplo.com).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Link de pago")).toHaveAttribute(
      "aria-invalid",
      "true",
    );

    await user.clear(screen.getByLabelText("Link de pago"));

    expect(
      screen.queryByText(
        "Ingresá un link válido con dominio (por ejemplo, ejemplo.com).",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Link de pago")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.click(screen.getByLabelText("Es deuda/préstamo"));
    await user.type(screen.getByLabelText("Cantidad total de cuotas"), "7");
    fireEvent.change(screen.getByLabelText("Inicio de la deuda"), {
      target: { value: "2026-01" },
    });
    await user.click(screen.getByRole("button", { name: "Seleccioná un prestador" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
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
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(screen.getByText("Seleccioná un prestador.")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => url === "/api/storage/monthly-expenses"),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Seleccioná un prestador" }));
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

    await user.click(screen.getByRole("button", { name: "Agregar prestador" }));
    await user.type(screen.getByLabelText("Nombre"), "Papa");
    await user.click(screen.getByRole("button", { name: "Guardar prestador" }));

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
      screen.queryByText("Prestador guardado correctamente."),
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

    await user.click(screen.getByRole("button", { name: "Agregar prestador" }));
    await user.type(screen.getByLabelText("Nombre"), "Prestador temporal");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.getByText("Tenés cambios sin guardar en este prestador."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Descartar los cambios" }));

    expect(mockedToast.info).toHaveBeenCalledWith(
      "Se descartaron los cambios sin guardar.",
    );

    await user.click(screen.getByRole("button", { name: "Agregar prestador" }));

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
            id: "expense-1",
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

    await user.click(screen.getByRole("button", { name: "Agregar prestador" }));
    await user.type(screen.getByLabelText("Nombre"), "Papa");
    await user.click(screen.getByRole("button", { name: "Guardar prestador" }));

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
    expect(screen.getAllByText("$ 14.760").length).toBeGreaterThanOrEqual(2);
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

  it("sorts Link by rows with and without payment links", async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <MonthlyExpensesPage
        {...basePageProps}
        initialDocument={{
          items: [
            {
              currency: "ARS",
              description: "Con link",
              id: "expense-1",
              occurrencesPerMonth: 1,
              paymentLink: "pagos.empresa.com",
              subtotal: 100,
              total: 100,
            },
            {
              currency: "ARS",
              description: "Sin link",
              id: "expense-2",
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

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual(["Sin link", "Con link"]);

    await user.click(screen.getByRole("button", { name: "Link" }));

    expect(getMonthlyExpensesDescriptionsOrder()).toEqual(["Con link", "Sin link"]);
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

  it("sorts Deuda / cuotas by selected metric and keeps No aplica at the end", async () => {
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

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Ascendente" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo A",
      "Prestamo C",
      "Prestamo B",
      "Sin deuda",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Descendente" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo B",
      "Prestamo C",
      "Prestamo A",
      "Sin deuda",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Cuotas restantes" }));
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo A",
      "Prestamo B",
      "Prestamo C",
      "Sin deuda",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Ascendente" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo C",
      "Prestamo B",
      "Prestamo A",
      "Sin deuda",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Total de cuotas" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo C",
      "Prestamo A",
      "Prestamo B",
      "Sin deuda",
    ]);

    await user.click(
      screen.getByRole("button", {
        name: "Ordenar Deuda / cuotas",
      }),
    );
    await user.click(screen.getByRole("radio", { name: "Descendente" }));
    await user.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(getMonthlyExpensesDescriptionsOrder()).toEqual([
      "Prestamo B",
      "Prestamo A",
      "Prestamo C",
      "Sin deuda",
    ]);
  });

  it("renders an empty actions header immediately to the right of Deuda / cuotas", () => {
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

    expect(loanHeaderIndex).toBeGreaterThanOrEqual(0);
    expect(headers.at(loanHeaderIndex + 1)).toBe("");
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
