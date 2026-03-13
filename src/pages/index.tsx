import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  InferGetServerSidePropsType,
} from "next";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { signIn, signOut, useSession } from "next-auth/react";
import { toast } from "sonner";

import { GoogleAccountAvatar } from "@/components/auth/google-account-avatar";
import {
  type LenderOption,
} from "@/components/monthly-expenses/lender-picker";
import { LendersPanel } from "@/components/monthly-expenses/lenders-panel";
import { MonthlyExpensesLoansReport } from "@/components/monthly-expenses/monthly-expenses-loans-report";
import {
  MonthlyExpensesTable,
  type MonthlyExpensesEditableRow,
} from "@/components/monthly-expenses/monthly-expenses-table";
import type { ExpenseEditableFieldName } from "@/components/monthly-expenses/expense-sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { isGoogleOAuthConfigured } from "@/modules/auth/infrastructure/oauth/google-oauth-config";
import { GOOGLE_OAUTH_SCOPES } from "@/modules/auth/infrastructure/oauth/google-oauth-scopes";
import {
  createEmptyLendersCatalogDocumentResult,
  type LendersCatalogDocumentResult,
} from "@/modules/lenders/application/results/lenders-catalog-document-result";
import {
  getLendersCatalog,
} from "@/modules/lenders/application/use-cases/get-lenders-catalog";
import {
  saveLendersCatalogViaApi,
} from "@/modules/lenders/infrastructure/api/lenders-api";
import type { SaveMonthlyExpensesCommand } from "@/modules/monthly-expenses/application/commands/save-monthly-expenses-command";
import { getMonthlyExpenseLoanPreview } from "@/modules/monthly-expenses/application/queries/get-monthly-expense-loan-preview";
import {
  getSafeLendersErrorMessage,
  getSafeLoansReportErrorMessage,
  getSafeMonthlyExpensesErrorMessage,
} from "@/modules/monthly-expenses/application/queries/get-monthly-expenses-page-feedback";
import {
  createEmptyMonthlyExpensesLoansReportResult,
  type MonthlyExpensesLoansReportResult,
} from "@/modules/monthly-expenses/application/results/monthly-expenses-loans-report-result";
import {
  getMonthlyExpensesDocument,
} from "@/modules/monthly-expenses/application/use-cases/get-monthly-expenses-document";
import {
  getMonthlyExpensesLoansReport,
} from "@/modules/monthly-expenses/application/use-cases/get-monthly-expenses-loans-report";
import {
  createEmptyMonthlyExpensesDocumentResult,
  type MonthlyExpensesDocumentResult,
} from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";
import {
  getMonthlyExpensesLoansReportViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-report-api";
import {
  saveMonthlyExpensesDocumentViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-api";
import { getStorageBootstrap } from "@/modules/storage/application/queries/get-storage-bootstrap";
import type { StorageBootstrapResult } from "@/modules/storage/application/results/storage-bootstrap";

import styles from "./index.module.scss";

type MonthlyExpensesPageProps = {
  bootstrap: StorageBootstrapResult;
  initialDocument: MonthlyExpensesDocumentResult;
  initialActiveTab: MonthlyExpensesTabKey;
  initialLendersCatalog: LendersCatalogDocumentResult;
  initialLoansReport: MonthlyExpensesLoansReportResult;
  lendersLoadError: string | null;
  loadError: string | null;
  reportLoadError: string | null;
};

interface MonthlyExpensesFormState {
  error: string | null;
  isSubmitting: boolean;
  month: string;
  rows: MonthlyExpensesEditableRow[];
}

interface LendersCatalogState {
  error: string | null;
  isSubmitting: boolean;
  lenders: LenderOption[];
  notes: string;
  successMessage: string | null;
  type: LenderOption["type"];
  name: string;
}

interface LoansReportState {
  entries: MonthlyExpensesLoansReportResult["entries"];
  error: string | null;
  lenderFilter: string;
  typeFilter: string;
  summary: MonthlyExpensesLoansReportResult["summary"];
}

interface ExpenseSheetState {
  draft: MonthlyExpensesEditableRow | null;
  isOpen: boolean;
  mode: "create" | "edit";
  originalRow: MonthlyExpensesEditableRow | null;
  showUnsavedChangesDialog: boolean;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHLY_EXPENSES_TAB_KEYS = ["expenses", "lenders", "debts"] as const;
type MonthlyExpensesTabKey = (typeof MONTHLY_EXPENSES_TAB_KEYS)[number];
type MonthlyExpenseCurrency = "ARS" | "USD";
const DEFAULT_MONTHLY_EXPENSES_TAB: MonthlyExpensesTabKey = "expenses";

function isMonthlyExpensesTabKey(
  value: string,
): value is MonthlyExpensesTabKey {
  return MONTHLY_EXPENSES_TAB_KEYS.includes(value as MonthlyExpensesTabKey);
}

function getCurrentMonthIdentifier(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function createExpenseRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `expense-${Math.random().toString(36).slice(2, 10)}`;
}

function createLenderId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `lender-${Math.random().toString(36).slice(2, 10)}`;
}

function formatEditableNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}

function calculateRowTotal(subtotal: string, occurrencesPerMonth: string): string {
  const subtotalValue = Number(subtotal);
  const occurrencesValue = Number(occurrencesPerMonth);

  if (
    !Number.isFinite(subtotalValue) ||
    subtotalValue <= 0 ||
    !Number.isInteger(occurrencesValue) ||
    occurrencesValue <= 0
  ) {
    return "0.00";
  }

  return Number((subtotalValue * occurrencesValue).toFixed(2)).toFixed(2);
}

function createEmptyRow(): MonthlyExpensesEditableRow {
  return {
    currency: "ARS",
    description: "",
    id: createExpenseRowId(),
    installmentCount: "",
    isLoan: false,
    lenderId: "",
    lenderName: "",
    loanEndMonth: "",
    loanProgress: "",
    occurrencesPerMonth: "",
    startMonth: "",
    subtotal: "",
    total: "0.00",
  };
}

function toEditableRows(
  document: MonthlyExpensesDocumentResult,
): MonthlyExpensesEditableRow[] {
  return document.items.map((item) => ({
    currency: item.currency,
    description: item.description,
    id: item.id,
    installmentCount: item.loan
      ? formatEditableNumber(item.loan.installmentCount)
      : "",
    isLoan: Boolean(item.loan),
    lenderId: item.loan?.lenderId ?? "",
    lenderName: item.loan?.lenderName ?? "",
    loanEndMonth: item.loan?.endMonth ?? "",
    loanProgress: item.loan
      ? `${item.loan.paidInstallments} de ${item.loan.installmentCount} cuotas pagadas`
      : "",
    occurrencesPerMonth: formatEditableNumber(item.occurrencesPerMonth),
    startMonth: item.loan?.startMonth ?? "",
    subtotal: formatEditableNumber(item.subtotal),
    total: item.total.toFixed(2),
  }));
}

function createMonthlyExpensesFormState(
  document: MonthlyExpensesDocumentResult,
): MonthlyExpensesFormState {
  return {
    error: null,
    isSubmitting: false,
    month: document.month,
    rows: toEditableRows(document),
  };
}

function createLendersCatalogState(
  catalog: LendersCatalogDocumentResult,
): LendersCatalogState {
  return {
    error: null,
    isSubmitting: false,
    lenders: catalog.lenders.map(({ id, name, notes, type }) => ({
      id,
      name,
      ...(notes ? { notes } : {}),
      type,
    })),
    name: "",
    notes: "",
    successMessage: null,
    type: "family",
  };
}

function createLoansReportState(
  report: MonthlyExpensesLoansReportResult,
  error: string | null,
): LoansReportState {
  return {
    entries: report.entries,
    error: error ? getSafeLoansReportErrorMessage(error) : null,
    lenderFilter: "all",
    summary: report.summary,
    typeFilter: "all",
  };
}

function buildLoanProgressLabel(
  paidInstallments: number,
  installmentCount: number,
): string {
  return `${paidInstallments} de ${installmentCount} cuotas pagadas`;
}

function normalizeLoanPreview(
  month: string,
  row: MonthlyExpensesEditableRow,
): Pick<MonthlyExpensesEditableRow, "loanEndMonth" | "loanProgress"> {
  const normalizedMonth = month.trim();
  const normalizedStartMonth = row.startMonth.trim();
  const installmentCount = Number(row.installmentCount);

  if (
    !MONTH_PATTERN.test(normalizedMonth) ||
    !MONTH_PATTERN.test(normalizedStartMonth) ||
    !Number.isInteger(installmentCount) ||
    installmentCount <= 0
  ) {
    return {
      loanEndMonth: "",
      loanProgress: "",
    };
  }

  const { endMonth: loanEndMonth, paidInstallments } =
    getMonthlyExpenseLoanPreview({
    installmentCount,
    startMonth: normalizedStartMonth,
    targetMonth: normalizedMonth,
  });

  return {
    loanEndMonth,
    loanProgress: buildLoanProgressLabel(paidInstallments, installmentCount),
  };
}

function normalizeEditableRows(
  month: string,
  rows: MonthlyExpensesEditableRow[],
): MonthlyExpensesEditableRow[] {
  return rows.map((row) => ({
    ...row,
    ...(row.isLoan
      ? normalizeLoanPreview(month, row)
      : {
          installmentCount: "",
          lenderId: "",
          lenderName: "",
          loanEndMonth: "",
          loanProgress: "",
          startMonth: "",
        }),
    total: calculateRowTotal(row.subtotal, row.occurrencesPerMonth),
  }));
}

function createClosedExpenseSheetState(): ExpenseSheetState {
  return {
    draft: null,
    isOpen: false,
    mode: "create",
    originalRow: null,
    showUnsavedChangesDialog: false,
  };
}

function getExpenseValidationMessage(
  month: string,
  row: MonthlyExpensesEditableRow | null,
): string | null {
  if (!row) {
    return null;
  }

  if (!MONTH_PATTERN.test(month.trim())) {
    return "Seleccioná un mes válido antes de guardar.";
  }

  const subtotal = Number(row.subtotal);
  const occurrencesPerMonth = Number(row.occurrencesPerMonth);

  if (
    !row.description.trim() ||
    !Number.isFinite(subtotal) ||
    subtotal <= 0 ||
    !Number.isInteger(occurrencesPerMonth) ||
    occurrencesPerMonth <= 0
  ) {
    return "Completá descripción, subtotal y veces al mes antes de guardar.";
  }

  const installmentCount = Number(row.installmentCount);

  if (
    row.isLoan &&
    (!MONTH_PATTERN.test(row.startMonth.trim()) ||
      !Number.isInteger(installmentCount) ||
      installmentCount <= 0)
  ) {
    return "Completá fecha de inicio y cantidad total de cuotas antes de guardar.";
  }

  return null;
}

function getChangedExpenseFields(
  originalRow: MonthlyExpensesEditableRow | null,
  draft: MonthlyExpensesEditableRow | null,
): Set<string> {
  if (!originalRow || !draft) {
    return new Set();
  }

  const changedFields = new Set<string>();

  if (originalRow.description !== draft.description) {
    changedFields.add("description");
  }

  if (originalRow.currency !== draft.currency) {
    changedFields.add("currency");
  }

  if (originalRow.subtotal !== draft.subtotal) {
    changedFields.add("subtotal");
  }

  if (originalRow.occurrencesPerMonth !== draft.occurrencesPerMonth) {
    changedFields.add("occurrencesPerMonth");
  }

  if (originalRow.isLoan !== draft.isLoan) {
    changedFields.add("isLoan");
  }

  if (
    originalRow.lenderId !== draft.lenderId ||
    originalRow.lenderName !== draft.lenderName
  ) {
    changedFields.add("lender");
  }

  if (originalRow.startMonth !== draft.startMonth) {
    changedFields.add("startMonth");
  }

  if (originalRow.installmentCount !== draft.installmentCount) {
    changedFields.add("installmentCount");
  }

  return changedFields;
}

function toSaveMonthlyExpensesCommand(
  state: MonthlyExpensesFormState,
): SaveMonthlyExpensesCommand {
  return {
    items: state.rows.map((row) => ({
      currency: row.currency,
      description: row.description.trim(),
      id: row.id,
      ...(row.isLoan
        ? {
            loan: {
              installmentCount: Number(row.installmentCount),
              ...(row.lenderId ? { lenderId: row.lenderId } : {}),
              ...(row.lenderName.trim()
                ? { lenderName: row.lenderName.trim() }
                : {}),
              startMonth: row.startMonth.trim(),
            },
          }
        : {}),
      occurrencesPerMonth: Number(row.occurrencesPerMonth),
      subtotal: Number(row.subtotal),
    })),
    month: state.month.trim(),
  };
}

function getRequestedMonth(queryValue: GetServerSidePropsContext["query"]["month"]) {
  const monthValue = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  const normalizedMonth = monthValue?.trim();

  return normalizedMonth && MONTH_PATTERN.test(normalizedMonth)
    ? normalizedMonth
    : getCurrentMonthIdentifier();
}

export function getRequestedMonthlyExpensesTab(
  queryValue: GetServerSidePropsContext["query"]["tab"],
): MonthlyExpensesTabKey {
  const tabValue = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  const normalizedTab = tabValue?.trim();

  return normalizedTab && isMonthlyExpensesTabKey(normalizedTab)
    ? normalizedTab
    : DEFAULT_MONTHLY_EXPENSES_TAB;
}

function mapReportEntriesToCurrentLenders(
  entries: MonthlyExpensesLoansReportResult["entries"],
  lenders: LenderOption[],
): MonthlyExpensesLoansReportResult["entries"] {
  return entries.map((entry) => {
    if (!entry.lenderId) {
      return entry;
    }

    const lender = lenders.find((candidate) => candidate.id === entry.lenderId);

    return lender
      ? {
          ...entry,
          lenderName: lender.name,
          lenderType: lender.type,
        }
      : entry;
  });
}

function getFilteredLoansReportEntries(
  reportState: LoansReportState,
): MonthlyExpensesLoansReportResult["entries"] {
  return reportState.entries.filter((entry) => {
    const matchesType =
      reportState.typeFilter === "all" || entry.lenderType === reportState.typeFilter;
    const matchesLender =
      reportState.lenderFilter === "all" ||
      entry.lenderId === reportState.lenderFilter ||
      (!entry.lenderId &&
        `legacy:${entry.lenderName}` === reportState.lenderFilter);

    return matchesType && matchesLender;
  });
}

export function getReportProviderFilterOptions(
  entries: MonthlyExpensesLoansReportResult["entries"],
  lenders: LenderOption[],
): Array<{ id: string; label: string }> {
  const options = new Map<string, string>();

  for (const lender of lenders) {
    options.set(lender.id, lender.name);
  }

  for (const entry of entries) {
    options.set(entry.lenderId ?? `legacy:${entry.lenderName}`, entry.lenderName);
  }

  return [...options.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "es"));
}

export default function MonthlyExpensesPage({
  bootstrap,
  initialDocument,
  initialActiveTab,
  initialLendersCatalog,
  initialLoansReport,
  lendersLoadError,
  loadError,
  reportLoadError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const isOAuthConfigured = bootstrap.authStatus === "configured";
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<MonthlyExpensesTabKey>(
    initialActiveTab,
  );
  const [formState, setFormState] = useState<MonthlyExpensesFormState>(
    createMonthlyExpensesFormState(initialDocument),
  );
  const [lendersState, setLendersState] = useState<LendersCatalogState>(
    createLendersCatalogState(initialLendersCatalog),
  );
  const [reportState, setReportState] = useState<LoansReportState>(
    createLoansReportState(initialLoansReport, reportLoadError),
  );
  const [expenseSheetState, setExpenseSheetState] = useState<ExpenseSheetState>(
    createClosedExpenseSheetState(),
  );

  const isAuthenticated = status === "authenticated";
  const isSessionLoading = status === "loading";
  const sessionUserImage = session?.user?.image?.trim() || null;
  const sessionUserName = session?.user?.name?.trim() || null;

  const handleGoogleAccountConnect = () => {
    if (!isOAuthConfigured) {
      return;
    }

    void signIn("google", {
      callbackUrl: "/",
    });
  };

  const handleGoogleAccountDisconnect = () => {
    void signOut({
      callbackUrl: "/",
    });
  };
  const expenseValidationMessage = getExpenseValidationMessage(
    formState.month,
    expenseSheetState.draft,
  );
  const dirtyExpenseFields = getChangedExpenseFields(
    expenseSheetState.originalRow,
    expenseSheetState.draft,
  );
  const changedExpenseFields =
    expenseSheetState.mode === "edit"
      ? dirtyExpenseFields
      : new Set<string>();
  const isExpenseSheetDirty = dirtyExpenseFields.size > 0;
  const filteredReportEntries = getFilteredLoansReportEntries(reportState);
  const reportProviderFilterOptions = getReportProviderFilterOptions(
    reportState.entries,
    lendersState.lenders,
  );

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (typeof router.query.tab === "undefined") {
      setActiveTab(initialActiveTab);
      return;
    }

    setActiveTab(getRequestedMonthlyExpensesTab(router.query.tab));
  }, [initialActiveTab, router.isReady, router.query.tab]);

  const feedbackMessage =
    formState.error ??
    "Usá Agregar gasto o el menú de cada fila para gestionar el mes actual.";
  const feedbackTone = formState.error ? "error" : "default";

  const actionDisabled =
    !isOAuthConfigured ||
    !isAuthenticated ||
    isSessionLoading ||
    formState.isSubmitting;
  const lendersFeedbackMessage =
    lendersState.error ??
    lendersState.successMessage ??
    lendersLoadError ??
    "Guardá prestadores para reutilizarlos al cargar deudas.";
  const lendersFeedbackTone = lendersState.error || lendersLoadError
    ? "error"
    : lendersState.successMessage
      ? "success"
      : "default";

  const updateFormState = (
    updater: (currentState: MonthlyExpensesFormState) => MonthlyExpensesFormState,
  ) => {
    setFormState((currentState) => updater(currentState));
  };
  const updateLendersState = (
    updater: (currentState: LendersCatalogState) => LendersCatalogState,
  ) => {
    setLendersState((currentState) => updater(currentState));
  };
  const updateReportState = (
    updater: (currentState: LoansReportState) => LoansReportState,
  ) => {
    setReportState((currentState) => updater(currentState));
  };
  const updateExpenseSheetState = (
    updater: (currentState: ExpenseSheetState) => ExpenseSheetState,
  ) => {
    setExpenseSheetState((currentState) => updater(currentState));
  };

  const refreshLoansReport = async (lenders: LenderOption[] = lendersState.lenders) => {
    try {
      const report = await getMonthlyExpensesLoansReportViaApi();

      updateReportState((currentState) => ({
        ...currentState,
        entries: mapReportEntriesToCurrentLenders(report.entries, lenders),
        error: null,
        summary: report.summary,
      }));
    } catch (error) {
      updateReportState((currentState) => ({
        ...currentState,
        error: getSafeLoansReportErrorMessage(error),
      }));
      toast.error("No pudimos actualizar el reporte de deudas.");
    }
  };

  const handleMonthChange = (value: string) => {
    updateFormState((currentState) => ({
      ...currentState,
      error: null,
      month: value,
      rows: normalizeEditableRows(value, currentState.rows),
    }));
    updateExpenseSheetState((currentState) => ({
      ...currentState,
      draft: currentState.draft
        ? normalizeEditableRows(value, [currentState.draft])[0]
        : null,
      originalRow: currentState.originalRow
        ? normalizeEditableRows(value, [currentState.originalRow])[0]
        : null,
    }));
    toast.info(`Mes activo actualizado a ${value}.`);
  };

  const persistMonthlyExpensesRows = async (
    rows: MonthlyExpensesEditableRow[],
    toastMessages: {
      loading: string;
      success: string;
    } = {
      loading: "Guardando gastos mensuales...",
      success: "Gastos mensuales guardados correctamente.",
    },
  ) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para guardar gastos mensuales.");
      return false;
    }

    updateFormState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
    }));

    try {
      const savePromise = saveMonthlyExpensesDocumentViaApi(
        toSaveMonthlyExpensesCommand({
          ...formState,
          rows,
        }),
      );

      void toast.promise(
        savePromise,
        {
          error: "No pudimos guardar los gastos mensuales.",
          loading: toastMessages.loading,
          success: toastMessages.success,
        },
      );
      await savePromise;

      updateFormState((currentState) => ({
        ...currentState,
        error: null,
        isSubmitting: false,
        rows,
      }));
      await refreshLoansReport();
      return true;
    } catch (error) {
      updateFormState((currentState) => ({
        ...currentState,
        error: getSafeMonthlyExpensesErrorMessage(error),
        isSubmitting: false,
      }));
      return false;
    }
  };

  const handleExpenseFieldChange = (
    fieldName: ExpenseEditableFieldName,
    value: string,
  ) => {
    updateExpenseSheetState((currentState) => {
      if (!currentState.draft) {
        return currentState;
      }

      return {
        ...currentState,
        draft: normalizeEditableRows(formState.month, [
          {
            ...currentState.draft,
            [fieldName]:
              fieldName === "currency"
                ? (value as MonthlyExpenseCurrency)
                : value,
          },
        ])[0],
      };
    });
  };

  const handleExpenseLenderSelect = (lenderId: string | null) => {
    const selectedLender = lenderId
      ? lendersState.lenders.find((lender) => lender.id === lenderId)
      : null;

    updateExpenseSheetState((currentState) => {
      if (!currentState.draft) {
        return currentState;
      }

      return {
        ...currentState,
        draft: normalizeEditableRows(formState.month, [
          {
            ...currentState.draft,
            lenderId: selectedLender?.id ?? "",
            lenderName: selectedLender?.name ?? "",
          },
        ])[0],
      };
    });
  };

  const handleExpenseLoanToggle = (checked: boolean) => {
    updateExpenseSheetState((currentState) => {
      if (!currentState.draft) {
        return currentState;
      }

      return {
        ...currentState,
        draft: normalizeEditableRows(formState.month, [
          checked
            ? { ...currentState.draft, isLoan: true }
            : {
                ...currentState.draft,
                installmentCount: "",
                isLoan: false,
                lenderId: "",
                lenderName: "",
                loanEndMonth: "",
                loanProgress: "",
                startMonth: "",
              },
        ])[0],
      };
    });
  };

  const handleAddExpense = () => {
    const draft = createEmptyRow();

    updateExpenseSheetState(() => ({
      draft,
      isOpen: true,
      mode: "create",
      originalRow: { ...draft },
      showUnsavedChangesDialog: false,
    }));
  };

  const handleEditExpense = (expenseId: string) => {
    const row = formState.rows.find((currentRow) => currentRow.id === expenseId);

    if (!row) {
      toast.warning("No pudimos encontrar el gasto que querés editar.");
      return;
    }

    updateExpenseSheetState(() => ({
      draft: { ...row },
      isOpen: true,
      mode: "edit",
      originalRow: { ...row },
      showUnsavedChangesDialog: false,
    }));
    toast.info("Editá el gasto y guardá los cambios cuando estés listo.");
  };

  const handleRequestCloseExpenseSheet = () => {
    if (isExpenseSheetDirty) {
      updateExpenseSheetState((currentState) => ({
        ...currentState,
        showUnsavedChangesDialog: true,
      }));
      toast.warning("Tenés cambios sin guardar en el gasto actual.");
      return;
    }

    setExpenseSheetState(createClosedExpenseSheetState());
  };

  const handleUnsavedChangesDiscard = () => {
    setExpenseSheetState(createClosedExpenseSheetState());
    toast.info("Se descartaron los cambios sin guardar.");
  };

  const handleSaveExpense = async () => {
    if (!expenseSheetState.draft) {
      toast.warning("No hay un gasto abierto para guardar.");
      return;
    }

    if (expenseValidationMessage) {
      toast.warning(expenseValidationMessage);
      return;
    }

    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para guardar gastos mensuales.");
      return;
    }

    const normalizedDraft = normalizeEditableRows(formState.month, [
      expenseSheetState.draft,
    ])[0];
    const nextRows =
      expenseSheetState.mode === "create"
        ? [...formState.rows, normalizedDraft]
        : formState.rows.map((row) =>
            row.id === normalizedDraft.id ? normalizedDraft : row,
          );
    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading:
        expenseSheetState.mode === "create"
          ? "Guardando nuevo gasto..."
          : "Actualizando gasto...",
      success:
        expenseSheetState.mode === "create"
          ? "Gasto creado correctamente."
          : "Gasto actualizado correctamente.",
    });

    if (wasSaved) {
      setExpenseSheetState(createClosedExpenseSheetState());
    }
  };

  const handleSaveUnsavedChanges = async () => {
    await handleSaveExpense();
  };

  const handleRemoveExpense = async (expenseId: string) => {
    const nextRows = normalizeEditableRows(
      formState.month,
      formState.rows.filter((row) => row.id !== expenseId),
    );
    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Eliminando gasto...",
      success: "Gasto eliminado correctamente.",
    });

    if (wasSaved && expenseSheetState.draft?.id === expenseId) {
      setExpenseSheetState(createClosedExpenseSheetState());
    }
  };

  const handleLenderFieldChange = (
    fieldName: "name" | "notes" | "type",
    value: string,
  ) => {
    updateLendersState((currentState) => ({
      ...currentState,
      error: null,
      [fieldName]: value,
      successMessage: null,
    }));
  };

  const handleLendersSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const lenderName = lendersState.name.trim();
    const newLenderId = createLenderId();

    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para guardar prestadores.");
      return;
    }

    if (!lenderName) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: "Completá el nombre del prestador antes de guardarlo.",
      }));
      toast.warning("Completá el nombre del prestador antes de guardarlo.");
      return;
    }

    if (
      lendersState.lenders.some(
        (lender) =>
          lender.name.toLocaleLowerCase() === lenderName.toLocaleLowerCase(),
      )
    ) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: "Ya existe un prestador con ese nombre.",
      }));
      toast.warning("Ya existe un prestador con ese nombre.");
      return;
    }

    const nextLenders = [
      ...lendersState.lenders,
      {
        id: newLenderId,
        name: lenderName,
        ...(lendersState.notes.trim() ? { notes: lendersState.notes.trim() } : {}),
        type: lendersState.type,
      },
    ].sort((left, right) => left.name.localeCompare(right.name, "es"));

    updateLendersState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
      successMessage: null,
    }));

    try {
      const savePromise = saveLendersCatalogViaApi({
        lenders: nextLenders.map((lender) => ({
          id: lender.id,
          name: lender.name,
          ...(lender.notes ? { notes: lender.notes } : {}),
          type: lender.type,
        })),
      });

      void toast.promise(
        savePromise,
        {
          error: "No pudimos guardar el prestador.",
          loading: "Guardando prestador...",
          success: "Prestador guardado correctamente.",
        },
      );
      await savePromise;

      updateLendersState(() => ({
        error: null,
        isSubmitting: false,
        lenders: nextLenders,
        name: "",
        notes: "",
        successMessage: "Prestador guardado correctamente.",
        type: "family",
      }));
      await refreshLoansReport(nextLenders);
    } catch (error) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: getSafeLendersErrorMessage(error),
        isSubmitting: false,
      }));
    }
  };

  const handleDeleteLender = async (lenderId: string) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para eliminar prestadores.");
      return;
    }

    const nextLenders = lendersState.lenders.filter((lender) => lender.id !== lenderId);

    updateLendersState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
      successMessage: null,
    }));

    try {
      const savePromise = saveLendersCatalogViaApi({
        lenders: nextLenders.map((lender) => ({
          id: lender.id,
          name: lender.name,
          ...(lender.notes ? { notes: lender.notes } : {}),
          type: lender.type,
        })),
      });

      void toast.promise(
        savePromise,
        {
          error: "No pudimos eliminar el prestador.",
          loading: "Eliminando prestador...",
          success: "Prestador eliminado del catálogo.",
        },
      );
      await savePromise;

      updateFormState((currentState) => ({
        ...currentState,
        rows: currentState.rows.map((row) =>
          row.lenderId === lenderId
            ? {
                ...row,
                lenderId: "",
                lenderName: "",
              }
            : row,
        ),
      }));
      updateReportState((currentState) => ({
        ...currentState,
        lenderFilter:
          currentState.lenderFilter === lenderId ? "all" : currentState.lenderFilter,
      }));
      updateLendersState((currentState) => ({
        ...currentState,
        isSubmitting: false,
        lenders: nextLenders,
        successMessage: "Prestador eliminado del catálogo.",
      }));
      await refreshLoansReport(nextLenders);
    } catch (error) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: getSafeLendersErrorMessage(error),
        isSubmitting: false,
      }));
    }
  };

  const handleReportTypeFilterChange = (value: string) => {
    updateReportState((currentState) => ({
      ...currentState,
      typeFilter: value,
    }));
  };

  const handleReportLenderFilterChange = (value: string) => {
    updateReportState((currentState) => ({
      ...currentState,
      lenderFilter: value,
    }));
  };

  const handleReportFiltersReset = () => {
    updateReportState((currentState) => ({
      ...currentState,
      lenderFilter: "all",
      typeFilter: "all",
    }));
    toast.info("Filtros del reporte restablecidos.");
  };

  const handleTabChange = (nextTab: string) => {
    if (!isMonthlyExpensesTabKey(nextTab) || nextTab === activeTab) {
      return;
    }

    setActiveTab(nextTab);

    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          tab: nextTab,
        },
      },
      undefined,
      {
        scroll: false,
        shallow: true,
      },
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.topBar}>
          <GoogleAccountAvatar
            onConnect={handleGoogleAccountConnect}
            onDisconnect={handleGoogleAccountDisconnect}
            status={status}
            userImage={sessionUserImage}
            userName={sessionUserName}
          />
        </div>

        <Tabs
          className={styles.tabsRoot}
          onValueChange={handleTabChange}
          value={activeTab}
        >
          <TabsList className={styles.tabsList} variant="line">
            <TabsTrigger className={styles.tabsTrigger} value="expenses">
              Gastos del mes
            </TabsTrigger>
            <TabsTrigger className={styles.tabsTrigger} value="lenders">
              Prestadores
            </TabsTrigger>
            <TabsTrigger className={styles.tabsTrigger} value="debts">
              Reporte de deudas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="expenses">
            <MonthlyExpensesTable
              actionDisabled={actionDisabled}
              changedFields={changedExpenseFields}
              draft={expenseSheetState.draft}
              feedbackMessage={feedbackMessage}
              feedbackTone={feedbackTone}
              isExpenseSheetOpen={expenseSheetState.isOpen}
              isSubmitting={formState.isSubmitting}
              lenders={lendersState.lenders}
              loadError={loadError}
              month={formState.month}
              onAddExpense={handleAddExpense}
              onDeleteExpense={handleRemoveExpense}
              onEditExpense={handleEditExpense}
              onExpenseFieldChange={handleExpenseFieldChange}
              onExpenseLenderSelect={handleExpenseLenderSelect}
              onExpenseLoanToggle={handleExpenseLoanToggle}
              onMonthChange={handleMonthChange}
              onRequestCloseExpenseSheet={handleRequestCloseExpenseSheet}
              onSaveExpense={handleSaveExpense}
              onSaveUnsavedChanges={handleSaveUnsavedChanges}
              onUnsavedChangesDiscard={handleUnsavedChangesDiscard}
              rows={formState.rows}
              sheetMode={expenseSheetState.mode}
              showUnsavedChangesDialog={expenseSheetState.showUnsavedChangesDialog}
              validationMessage={expenseValidationMessage}
            />
          </TabsContent>

          <TabsContent value="lenders">
            <LendersPanel
              feedbackMessage={lendersFeedbackMessage}
              feedbackTone={lendersFeedbackTone}
              formValues={{
                name: lendersState.name,
                notes: lendersState.notes,
                type: lendersState.type,
              }}
              isSubmitting={lendersState.isSubmitting}
              lenders={lendersState.lenders}
              onDelete={handleDeleteLender}
              onFieldChange={handleLenderFieldChange}
              onSubmit={handleLendersSubmit}
            />
          </TabsContent>

          <TabsContent value="debts">
            <MonthlyExpensesLoansReport
              entries={filteredReportEntries}
              feedbackMessage={reportState.error}
              providerFilterOptions={reportProviderFilterOptions}
              selectedLenderFilter={reportState.lenderFilter}
              selectedTypeFilter={reportState.typeFilter}
              summary={reportState.summary}
              onLenderFilterChange={handleReportLenderFilterChange}
              onResetFilters={handleReportFiltersReset}
              onTypeFilterChange={handleReportTypeFilterChange}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<MonthlyExpensesPageProps> =
  async (context) => {
    const initialActiveTab = getRequestedMonthlyExpensesTab(context.query.tab);
    const selectedMonth = getRequestedMonth(context.query.month);
    const bootstrap = getStorageBootstrap({
      isGoogleOAuthConfigured: isGoogleOAuthConfigured(),
      requiredScopes: GOOGLE_OAUTH_SCOPES,
    });

    if (bootstrap.authStatus !== "configured") {
      return {
        props: {
          bootstrap,
          initialActiveTab,
          initialDocument: createEmptyMonthlyExpensesDocumentResult(
            selectedMonth,
          ),
          initialLendersCatalog: createEmptyLendersCatalogDocumentResult(),
          initialLoansReport: createEmptyMonthlyExpensesLoansReportResult(),
          lendersLoadError: null,
          loadError: null,
          reportLoadError: null,
        },
      };
    }

    try {
      const { getAuthenticatedUserSubjectFromRequest } = await import(
        "@/modules/auth/infrastructure/next-auth/authenticated-user-subject"
      );
      const { createMigratedTursoDatabase } = await import(
        "@/modules/shared/infrastructure/database/drizzle/turso-database"
      );
      const { DrizzleMonthlyExpensesRepository } = await import(
        "@/modules/monthly-expenses/infrastructure/turso/repositories/drizzle-monthly-expenses-repository"
      );
      const { DrizzleLendersRepository } = await import(
        "@/modules/lenders/infrastructure/turso/repositories/drizzle-lenders-repository"
      );
      const userSubject = await getAuthenticatedUserSubjectFromRequest(
        context.req,
      );
      const database = await createMigratedTursoDatabase();
      const monthlyExpensesRepository = new DrizzleMonthlyExpensesRepository(
        database,
        userSubject,
      );
      const lendersRepository = new DrizzleLendersRepository(
        database,
        userSubject,
      );
      const [documentResult, lendersResult, reportResult] = await Promise.allSettled([
        getMonthlyExpensesDocument({
          query: {
            month: selectedMonth,
          },
          repository: monthlyExpensesRepository,
        }),
        getLendersCatalog({
          repository: lendersRepository,
        }),
        getLendersCatalog({
          repository: lendersRepository,
        }).then((catalog) =>
          getMonthlyExpensesLoansReport({
            lenders: catalog.lenders,
            repository: monthlyExpensesRepository,
          }),
        ),
      ]);

      return {
        props: {
          bootstrap,
          initialActiveTab,
          initialDocument:
            documentResult.status === "fulfilled"
              ? documentResult.value
              : createEmptyMonthlyExpensesDocumentResult(selectedMonth),
          initialLendersCatalog:
            lendersResult.status === "fulfilled"
              ? lendersResult.value
              : createEmptyLendersCatalogDocumentResult(),
          initialLoansReport:
            reportResult.status === "fulfilled"
              ? reportResult.value
              : createEmptyMonthlyExpensesLoansReportResult(),
          lendersLoadError:
            lendersResult.status === "rejected"
              ? "No pudimos cargar el catálogo de prestadores desde la base de datos."
              : null,
          loadError:
            documentResult.status === "rejected"
              ? "No pudimos cargar los gastos mensuales desde la base de datos. Igual podés editar la tabla y volver a guardarla."
              : null,
          reportLoadError:
            reportResult.status === "rejected"
              ? "No pudimos cargar el reporte de deudas desde la base de datos."
              : null,
        },
      };
    } catch (error) {
      return {
        props: {
          bootstrap,
          initialActiveTab,
          initialDocument: createEmptyMonthlyExpensesDocumentResult(
            selectedMonth,
          ),
          initialLendersCatalog: createEmptyLendersCatalogDocumentResult(),
          initialLoansReport: createEmptyMonthlyExpensesLoansReportResult(),
          lendersLoadError: null,
          loadError:
            error instanceof Error &&
            (error.name === "GoogleOAuthAuthenticationError" ||
              error.name === "GoogleOAuthConfigurationError")
              ? null
              : "No pudimos cargar los gastos mensuales desde la base de datos. Igual podés editar la tabla y volver a guardarla.",
          reportLoadError: null,
        },
      };
    }
  };
