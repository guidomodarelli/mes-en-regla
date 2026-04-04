import type {
  GetServerSidePropsContext,
} from "next";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { parsePhoneNumberFromString } from "libphonenumber-js";

import { FinanceAppShell } from "@/components/finance-app-shell/finance-app-shell";
import { ExpenseReceiptCoverageEditDialog } from "@/components/monthly-expenses/expense-receipt-coverage-edit-dialog";
import { ExpenseReceiptUploadDialog } from "@/components/monthly-expenses/expense-receipt-upload-dialog";
import {
  type LenderOption,
} from "@/components/monthly-expenses/lender-picker";
import { LenderCreateDialog } from "@/components/monthly-expenses/lender-create-dialog";
import { LendersPanel } from "@/components/monthly-expenses/lenders-panel";
import { MonthlyExpensesLoansReport } from "@/components/monthly-expenses/monthly-expenses-loans-report";
import {
  MonthlyExpensesTable,
  type MonthlyExpensesEditableReceipt,
  type MonthlyExpensesEditableRow,
} from "@/components/monthly-expenses/monthly-expenses-table";
import {
  getValidPaymentLink,
  normalizePaymentLink,
  PAYMENT_LINK_VALIDATION_ERROR_MESSAGE,
} from "@/components/monthly-expenses/payment-link";
import { TypingAnimation } from "@/components/ui/typing-animation";
import type { ExpenseEditableFieldName } from "@/components/monthly-expenses/expense-sheet";
import {
  type LendersCatalogDocumentResult,
} from "@/modules/lenders/application/results/lenders-catalog-document-result";
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
  type MonthlyExpensesCopyableMonthsResult,
} from "@/modules/monthly-expenses/application/results/monthly-expenses-copyable-months-result";
import {
  type MonthlyExpensesLoansReportResult,
} from "@/modules/monthly-expenses/application/results/monthly-expenses-loans-report-result";
import {
  type MonthlyExpensesDocumentResult,
} from "@/modules/monthly-expenses/application/results/monthly-expenses-document-result";
import {
  getMonthlyExpensesLoansReportViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-report-api";
import {
  getMonthlyExpensesDocumentViaApi,
  saveMonthlyExpensesDocumentViaApi,
} from "../../infrastructure/api/monthly-expenses-api";
import {
  deleteMonthlyExpenseReceiptViaApi,
  uploadMonthlyExpenseReceiptViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-receipts-api";
import type { StorageBootstrapResult } from "@/modules/storage/application/results/storage-bootstrap";

export type MonthlyExpensesPageProps = {
  bootstrap: StorageBootstrapResult;
  initialSidebarOpen?: boolean;
  initialCopyableMonths: MonthlyExpensesCopyableMonthsResult;
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
  exchangeRateLoadError: string | null;
  exchangeRateSnapshot: Exclude<
    MonthlyExpensesDocumentResult["exchangeRateSnapshot"],
    undefined
  >;
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

interface ExpenseReceiptUploadState {
  coveredPaymentsByReceipts: number;
  error: string | null;
  expenseDescription: string;
  expenseId: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  manualCoveredPayments: number;
  occurrencesPerMonth: number;
  uploadProgressPercent: number;
}

interface ExpenseReceiptCoverageEditState {
  currentCoveredPayments: number;
  error: string | null;
  expenseDescription: string;
  expenseId: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  maxCoveredPayments: number;
  receiptFileId: string | null;
  receiptFileName: string;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHLY_EXPENSES_TAB_KEYS = ["expenses", "lenders", "debts"] as const;
export type MonthlyExpensesTabKey = (typeof MONTHLY_EXPENSES_TAB_KEYS)[number];
type MonthlyExpenseCurrency = "ARS" | "USD";
type MonthlyExpenseReceiptShareStatus = "pending" | "sent";
const DEFAULT_MONTHLY_EXPENSES_TAB: MonthlyExpensesTabKey = "expenses";
const MAX_RECEIPT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const RECEIPT_READ_PROGRESS_WEIGHT = 0.35;
const RECEIPT_UPLOAD_PROGRESS_WEIGHT = 0.65;
const RECEIPT_FILE_TYPE_BY_MIME_TYPE: Record<string, string> = {
  "application/pdf": "PDF",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
};

function createClosedExpenseReceiptUploadState(): ExpenseReceiptUploadState {
  return {
    coveredPaymentsByReceipts: 0,
    error: null,
    expenseDescription: "",
    expenseId: null,
    isOpen: false,
    isSubmitting: false,
    manualCoveredPayments: 0,
    occurrencesPerMonth: 1,
    uploadProgressPercent: 0,
  };
}

function createClosedExpenseReceiptCoverageEditState(): ExpenseReceiptCoverageEditState {
  return {
    currentCoveredPayments: 1,
    error: null,
    expenseDescription: "",
    expenseId: null,
    isOpen: false,
    isSubmitting: false,
    maxCoveredPayments: 1,
    receiptFileId: null,
    receiptFileName: "",
  };
}

function getValidReceiptMimeType(file: File): string | null {
  const normalizedMimeType = file.type.trim().toLowerCase();

  return Object.hasOwn(RECEIPT_FILE_TYPE_BY_MIME_TYPE, normalizedMimeType)
    ? normalizedMimeType
    : null;
}

function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

async function fileToBase64WithProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onerror = () => {
      reject(
        new Error("monthly-expenses-page:fileToBase64WithProgress failed to read file."),
      );
    };

    fileReader.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      onProgress(clampProgressPercent((event.loaded / event.total) * 100));
    };

    fileReader.onload = () => {
      if (typeof fileReader.result !== "string") {
        reject(
          new Error("monthly-expenses-page:fileToBase64WithProgress received invalid reader result."),
        );
        return;
      }

      const base64Content = fileReader.result.split(",", 2)[1] ?? "";

      if (base64Content.length === 0) {
        reject(
          new Error("monthly-expenses-page:fileToBase64WithProgress produced an empty payload."),
        );
        return;
      }

      onProgress(100);
      resolve(base64Content);
    };

    fileReader.readAsDataURL(file);
  });
}

function isMonthlyExpensesTabKey(
  value: string,
): value is MonthlyExpensesTabKey {
  return MONTHLY_EXPENSES_TAB_KEYS.includes(value as MonthlyExpensesTabKey);
}

function getPageHeadingByTab(tab: MonthlyExpensesTabKey): string {
  switch (tab) {
    case "expenses":
      return "Gastos del mes";
    case "lenders":
      return "Prestamistas";
    case "debts":
      return "Reporte de deudas";
  }
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

function normalizeReceiptSharePhoneDigits(value: string): string {
  return value.trim().replace(/\D+/g, "");
}

function normalizeReceiptShareMessage(value: string): string {
  return value.trim();
}

function isReceiptShareStatus(
  value: string,
): value is MonthlyExpenseReceiptShareStatus {
  return value === "pending" || value === "sent";
}

function normalizeReceiptShareStatus(
  value: string,
): MonthlyExpenseReceiptShareStatus | "" {
  return isReceiptShareStatus(value) ? value : "";
}

function isValidInternationalReceiptSharePhone(value: string): boolean {
  const phoneDigits = normalizeReceiptSharePhoneDigits(value);

  if (!phoneDigits) {
    return false;
  }

  const parsedPhone = parsePhoneNumberFromString(`+${phoneDigits}`);

  return Boolean(parsedPhone?.isValid());
}

function createEmptyRow(): MonthlyExpensesEditableRow {
  return {
    allReceiptsFolderId: "",
    allReceiptsFolderViewUrl: "",
    currency: "ARS",
    description: "",
    id: createExpenseRowId(),
    installmentCount: "",
    isLoan: false,
    lenderId: "",
    lenderName: "",
    loanEndMonth: "",
    loanPaidInstallments: null,
    loanProgress: "",
    loanRemainingInstallments: null,
    loanTotalInstallments: null,
    manualCoveredPayments: "0",
    occurrencesPerMonth: "1",
    paymentLink: "",
    receiptShareMessage: "",
    receiptSharePhoneDigits: "",
    receiptShareStatus: "",
    requiresReceiptShare: false,
    receipts: [],
    monthlyFolderId: "",
    monthlyFolderViewUrl: "",
    startMonth: "",
    subtotal: "",
    total: "0.00",
  };
}

function toEditableReceipts(
  receipts: MonthlyExpensesDocumentResult["items"][number]["receipts"] | undefined,
): MonthlyExpensesEditableReceipt[] {
  if (!receipts || receipts.length === 0) {
    return [];
  }

  return receipts.map((receipt) => ({
    allReceiptsFolderId: receipt.allReceiptsFolderId,
    allReceiptsFolderStatus: receipt.allReceiptsFolderStatus,
    allReceiptsFolderViewUrl: receipt.allReceiptsFolderViewUrl,
    coveredPayments: receipt.coveredPayments ?? 1,
    fileId: receipt.fileId,
    fileName: receipt.fileName,
    fileStatus: receipt.fileStatus,
    fileViewUrl: receipt.fileViewUrl,
    monthlyFolderId: receipt.monthlyFolderId,
    monthlyFolderStatus: receipt.monthlyFolderStatus,
    monthlyFolderViewUrl: receipt.monthlyFolderViewUrl,
  }));
}

function getPreferredFolderField(
  primaryValue: string | undefined,
  fallbackValue: string | undefined,
): string {
  if (primaryValue !== undefined) {
    return primaryValue;
  }

  return fallbackValue ?? "";
}

function getPreferredFolderStatus<TStatus>(
  primaryId: string | undefined,
  primaryStatus: TStatus | undefined,
  fallbackStatus: TStatus | undefined,
): TStatus | undefined {
  if (primaryId !== undefined) {
    return primaryStatus;
  }

  return fallbackStatus;
}

export function toEditableRows(
  document: MonthlyExpensesDocumentResult,
): MonthlyExpensesEditableRow[] {
  return document.items.map((item) => ({
    ...(item.requiresReceiptShare === true
      ? {
          receiptShareStatus:
            item.receiptShareStatus === "sent" ? "sent" : "pending",
        }
      : {
          receiptShareStatus: normalizeReceiptShareStatus(
            item.receiptShareStatus ?? "",
          ),
        }),
    ...(item.manualCoveredPayments !== undefined
      ? {
          manualCoveredPayments: formatEditableNumber(item.manualCoveredPayments),
        }
      : {
          manualCoveredPayments: item.isPaid === true && (!item.receipts || item.receipts.length === 0)
            ? formatEditableNumber(item.occurrencesPerMonth)
            : "0",
        }),
    allReceiptsFolderId: getPreferredFolderField(
      item.folders?.allReceiptsFolderId,
      item.receipts?.[0]?.allReceiptsFolderId,
    ),
    allReceiptsFolderStatus: getPreferredFolderStatus(
      item.folders?.allReceiptsFolderId,
      item.folders?.allReceiptsFolderStatus,
      item.receipts?.[0]?.allReceiptsFolderStatus,
    ),
    allReceiptsFolderViewUrl: getPreferredFolderField(
      item.folders?.allReceiptsFolderViewUrl,
      item.receipts?.[0]?.allReceiptsFolderViewUrl,
    ),
    ...(item.loan
      ? {
          loanPaidInstallments: item.loan.paidInstallments,
          loanRemainingInstallments: Math.max(
            item.loan.installmentCount - item.loan.paidInstallments,
            0,
          ),
          loanTotalInstallments: item.loan.installmentCount,
        }
      : {
          loanPaidInstallments: null,
          loanRemainingInstallments: null,
          loanTotalInstallments: null,
        }),
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
    paymentLink: item.paymentLink?.trim() ?? "",
    receiptShareMessage: item.receiptShareMessage?.trim() ?? "",
    receiptSharePhoneDigits: item.receiptSharePhoneDigits?.trim() ?? "",
    requiresReceiptShare: item.requiresReceiptShare === true,
    receipts: toEditableReceipts(item.receipts),
    monthlyFolderId: getPreferredFolderField(
      item.folders?.monthlyFolderId,
      item.receipts?.[0]?.monthlyFolderId,
    ),
    monthlyFolderStatus: getPreferredFolderStatus(
      item.folders?.monthlyFolderId,
      item.folders?.monthlyFolderStatus,
      item.receipts?.[0]?.monthlyFolderStatus,
    ),
    monthlyFolderViewUrl: getPreferredFolderField(
      item.folders?.monthlyFolderViewUrl,
      item.receipts?.[0]?.monthlyFolderViewUrl,
    ),
    startMonth: item.loan?.startMonth ?? "",
    subtotal: formatEditableNumber(item.subtotal),
    total: item.total.toFixed(2),
  }));
}

function getCoveredPaymentsByReceipts(
  row: Pick<MonthlyExpensesEditableRow, "receipts">,
): number {
  return row.receipts.reduce(
    (coveredPayments, receipt) => coveredPayments + receipt.coveredPayments,
    0,
  );
}

function getRequiredPayments(
  row: Pick<MonthlyExpensesEditableRow, "occurrencesPerMonth">,
): number {
  const requiredPayments = Number(row.occurrencesPerMonth);

  if (!Number.isInteger(requiredPayments) || requiredPayments <= 0) {
    return 0;
  }

  return requiredPayments;
}

function getNormalizedManualCoveredPayments(
  row: Pick<MonthlyExpensesEditableRow, "manualCoveredPayments">,
): number {
  const manualCoveredPayments = Number(row.manualCoveredPayments);

  if (!Number.isInteger(manualCoveredPayments) || manualCoveredPayments < 0) {
    return 0;
  }

  return manualCoveredPayments;
}

function getRemainingPaymentsForReceipts(
  row: Pick<
    MonthlyExpensesEditableRow,
    "manualCoveredPayments" | "occurrencesPerMonth" | "receipts"
  >,
): number {
  const requiredPayments = getRequiredPayments(row);
  const manualCoveredPayments = getNormalizedManualCoveredPayments(row);
  const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(row);

  return Math.max(
    requiredPayments - manualCoveredPayments - coveredPaymentsByReceipts,
    0,
  );
}

function getMaxReceiptCoverageForEdition({
  receiptFileId,
  row,
}: {
  receiptFileId: string;
  row: Pick<
    MonthlyExpensesEditableRow,
    "manualCoveredPayments" | "occurrencesPerMonth" | "receipts"
  >;
}): number {
  const requiredPayments = getRequiredPayments(row);
  const manualCoveredPayments = getNormalizedManualCoveredPayments(row);
  const coveredPaymentsByOtherReceipts = row.receipts.reduce(
    (coveredPayments, receipt) =>
      receipt.fileId === receiptFileId
        ? coveredPayments
        : coveredPayments + receipt.coveredPayments,
    0,
  );

  return Math.max(
    requiredPayments - manualCoveredPayments - coveredPaymentsByOtherReceipts,
    1,
  );
}

function getMaxManualCoveredPayments(
  row: Pick<MonthlyExpensesEditableRow, "occurrencesPerMonth" | "receipts">,
): number {
  const requiredPayments = getRequiredPayments(row);
  const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(row);

  return Math.max(requiredPayments - coveredPaymentsByReceipts, 0);
}

function createMonthlyExpensesFormState(
  document: MonthlyExpensesDocumentResult,
): MonthlyExpensesFormState {
  return {
    error: null,
    exchangeRateLoadError: document.exchangeRateLoadError ?? null,
    exchangeRateSnapshot: document.exchangeRateSnapshot ?? null,
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
): Pick<
  MonthlyExpensesEditableRow,
  | "loanEndMonth"
  | "loanPaidInstallments"
  | "loanProgress"
  | "loanRemainingInstallments"
  | "loanTotalInstallments"
> {
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
      loanPaidInstallments: null,
      loanProgress: "",
      loanRemainingInstallments: null,
      loanTotalInstallments: null,
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
    loanPaidInstallments: paidInstallments,
    loanProgress: buildLoanProgressLabel(paidInstallments, installmentCount),
    loanRemainingInstallments: Math.max(installmentCount - paidInstallments, 0),
    loanTotalInstallments: installmentCount,
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
          loanPaidInstallments: null,
          loanProgress: "",
          loanRemainingInstallments: null,
          loanTotalInstallments: null,
          startMonth: "",
        }),
    total: calculateRowTotal(row.subtotal, row.occurrencesPerMonth),
  }));
}

export function copyMonthlyExpenseTemplatesToMonth(
  month: string,
  rows: MonthlyExpensesEditableRow[],
): MonthlyExpensesEditableRow[] {
  return normalizeEditableRows(
    month,
    rows.map((row) => ({
      ...row,
      allReceiptsFolderStatus: undefined,
      id: createExpenseRowId(),
      manualCoveredPayments: "0",
      monthlyFolderId: "",
      monthlyFolderStatus: undefined,
      monthlyFolderViewUrl: "",
      receiptShareStatus: "",
      receipts: [],
    })),
  );
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

const GENERIC_EXPENSE_VALIDATION_MESSAGE =
  "Corregí los errores antes de continuar.";

function getExpenseValidationMessage(
  month: string,
  row: MonthlyExpensesEditableRow | null,
): string | null {
  if (!row) {
    return null;
  }

  if (!MONTH_PATTERN.test(month.trim())) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
  }

  const subtotal = Number(row.subtotal);
  const occurrencesPerMonth = Number(row.occurrencesPerMonth);
  const manualCoveredPayments = Number(row.manualCoveredPayments);

  if (
    !row.description.trim() ||
    !Number.isFinite(subtotal) ||
    subtotal <= 0 ||
    !Number.isInteger(occurrencesPerMonth) ||
    occurrencesPerMonth <= 0
  ) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
  }

  if (
    !Number.isInteger(manualCoveredPayments) ||
    manualCoveredPayments < 0
  ) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
  }

  if (manualCoveredPayments > occurrencesPerMonth) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
  }

  const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(row);

  if (manualCoveredPayments + coveredPaymentsByReceipts > occurrencesPerMonth) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
  }

  const installmentCount = Number(row.installmentCount);

  if (
    row.isLoan &&
    (!row.lenderId.trim() ||
      !MONTH_PATTERN.test(row.startMonth.trim()) ||
      !Number.isInteger(installmentCount) ||
      installmentCount <= 0)
  ) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
  }

  if (
    row.requiresReceiptShare &&
    !isValidInternationalReceiptSharePhone(row.receiptSharePhoneDigits)
  ) {
    return GENERIC_EXPENSE_VALIDATION_MESSAGE;
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

  if (originalRow.manualCoveredPayments !== draft.manualCoveredPayments) {
    changedFields.add("manualCoveredPayments");
  }

  if (originalRow.requiresReceiptShare !== draft.requiresReceiptShare) {
    changedFields.add("requiresReceiptShare");
  }

  if (originalRow.receiptSharePhoneDigits !== draft.receiptSharePhoneDigits) {
    changedFields.add("receiptSharePhoneDigits");
  }

  if (originalRow.receiptShareMessage !== draft.receiptShareMessage) {
    changedFields.add("receiptShareMessage");
  }

  return changedFields;
}

function buildRowFoldersPayload(
  row: MonthlyExpensesEditableRow,
): SaveMonthlyExpensesCommand["items"][number]["folders"] | undefined {
  const allReceiptsFolderId = getPreferredFolderField(
    row.allReceiptsFolderId,
    row.receipts[0]?.allReceiptsFolderId,
  ).trim();
  const allReceiptsFolderViewUrl = getPreferredFolderField(
    row.allReceiptsFolderViewUrl,
    row.receipts[0]?.allReceiptsFolderViewUrl,
  ).trim();
  const monthlyFolderId = getPreferredFolderField(
    row.monthlyFolderId,
    row.receipts[0]?.monthlyFolderId,
  ).trim();
  const monthlyFolderViewUrl = getPreferredFolderField(
    row.monthlyFolderViewUrl,
    row.receipts[0]?.monthlyFolderViewUrl,
  ).trim();

  if (!allReceiptsFolderId || !allReceiptsFolderViewUrl) {
    return undefined;
  }

  const hasMonthlyFolderId = monthlyFolderId.length > 0;
  const hasMonthlyFolderViewUrl = monthlyFolderViewUrl.length > 0;

  if (hasMonthlyFolderId !== hasMonthlyFolderViewUrl) {
    return undefined;
  }

  return {
    allReceiptsFolderId,
    allReceiptsFolderViewUrl,
    monthlyFolderId,
    monthlyFolderViewUrl,
  };
}

export function toSaveMonthlyExpensesCommand(
  state: MonthlyExpensesFormState,
): SaveMonthlyExpensesCommand {
  return {
    items: state.rows.map((row) => ({
      ...(getValidPaymentLink(row.paymentLink)
        ? {
            paymentLink: normalizePaymentLink(row.paymentLink),
          }
        : {
            paymentLink: null,
          }),
      ...(row.requiresReceiptShare ? { requiresReceiptShare: true } : {}),
      ...(normalizeReceiptSharePhoneDigits(row.receiptSharePhoneDigits)
        ? {
            receiptSharePhoneDigits: normalizeReceiptSharePhoneDigits(
              row.receiptSharePhoneDigits,
            ),
          }
        : {}),
      ...(normalizeReceiptShareMessage(row.receiptShareMessage)
        ? {
            receiptShareMessage: normalizeReceiptShareMessage(
              row.receiptShareMessage,
            ),
          }
        : {}),
      ...(isReceiptShareStatus(row.receiptShareStatus)
        ? { receiptShareStatus: row.receiptShareStatus }
        : {}),
      ...(buildRowFoldersPayload(row)
        ? {
            folders: buildRowFoldersPayload(row),
          }
        : {}),
      ...(row.receipts.length > 0
        ? {
            receipts: row.receipts.map((receipt) => ({
              allReceiptsFolderId: receipt.allReceiptsFolderId.trim(),
              allReceiptsFolderViewUrl: receipt.allReceiptsFolderViewUrl.trim(),
              coveredPayments: receipt.coveredPayments,
              fileId: receipt.fileId.trim(),
              fileName:
                receipt.fileName.trim().length > 0
                  ? receipt.fileName.trim()
                  : "Comprobante",
              fileViewUrl: receipt.fileViewUrl.trim(),
              monthlyFolderId: receipt.monthlyFolderId.trim(),
              monthlyFolderViewUrl: receipt.monthlyFolderViewUrl.trim(),
            })),
          }
        : {}),
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
      ...(Number(row.manualCoveredPayments) > 0
        ? {
            manualCoveredPayments: Number(row.manualCoveredPayments),
          }
        : {}),
      occurrencesPerMonth: Number(row.occurrencesPerMonth),
      subtotal: Number(row.subtotal),
    })),
    month: state.month.trim(),
  };
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
      entry.lenderId === reportState.lenderFilter;

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
    if (entry.lenderId) {
      options.set(entry.lenderId, entry.lenderName);
    }
  }

  return [...options.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "es"));
}

export default function MonthlyExpensesPage({
  bootstrap,
  initialSidebarOpen = true,
  initialCopyableMonths,
  initialDocument,
  initialActiveTab,
  initialLendersCatalog,
  initialLoansReport,
  lendersLoadError,
  loadError,
  reportLoadError,
}: MonthlyExpensesPageProps) {
  const router = useRouter();
  const isOAuthConfigured = bootstrap.authStatus === "configured";
  const { status } = useSession();
  const activeTab = initialActiveTab;
  const [formState, setFormState] = useState<MonthlyExpensesFormState>(
    createMonthlyExpensesFormState(initialDocument),
  );
  const [lendersState, setLendersState] = useState<LendersCatalogState>(
    createLendersCatalogState(initialLendersCatalog),
  );
  const [reportState, setReportState] = useState<LoansReportState>(
    createLoansReportState(initialLoansReport, reportLoadError),
  );
  const [copySourceMonth, setCopySourceMonth] = useState<string | null>(
    initialCopyableMonths.defaultSourceMonth,
  );
  const [isCopyingFromMonth, setIsCopyingFromMonth] = useState(false);
  const [expenseSheetState, setExpenseSheetState] = useState<ExpenseSheetState>(
    createClosedExpenseSheetState(),
  );
  const [expenseReceiptUploadState, setExpenseReceiptUploadState] = useState<
    ExpenseReceiptUploadState
  >(createClosedExpenseReceiptUploadState());
  const [expenseReceiptCoverageEditState, setExpenseReceiptCoverageEditState] =
    useState<ExpenseReceiptCoverageEditState>(
      createClosedExpenseReceiptCoverageEditState(),
    );
  const [isLenderCreateModalOpen, setIsLenderCreateModalOpen] = useState(false);
  const shouldIgnoreNextExpenseSheetCloseRef = useRef(false);

  const isAuthenticated = status === "authenticated";
  const isSessionLoading = status === "loading";
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
    setFormState(createMonthlyExpensesFormState(initialDocument));
    setCopySourceMonth(initialCopyableMonths.defaultSourceMonth);
    setIsCopyingFromMonth(false);
    setExpenseSheetState(createClosedExpenseSheetState());
    setExpenseReceiptUploadState(createClosedExpenseReceiptUploadState());
    setExpenseReceiptCoverageEditState(
      createClosedExpenseReceiptCoverageEditState(),
    );
  }, [
    initialCopyableMonths.defaultSourceMonth,
    initialCopyableMonths.sourceMonths,
    initialDocument,
  ]);

  useEffect(() => {
    if (isLenderCreateModalOpen) {
      shouldIgnoreNextExpenseSheetCloseRef.current = false;
    }
  }, [isLenderCreateModalOpen]);

  const feedbackMessage = formState.error ?? "";
  const feedbackTone = formState.error ? "error" : "default";

  const actionDisabled =
    !isOAuthConfigured ||
    !isAuthenticated ||
    isSessionLoading ||
    formState.isSubmitting;
  const copySourceMonthOptions = initialCopyableMonths.sourceMonths.map((month) => ({
    label: month,
    value: month,
  }));
  const showCopyFromControls = formState.rows.length === 0;
  const copyFromDisabled =
    actionDisabled ||
    isCopyingFromMonth ||
    !showCopyFromControls ||
    !copySourceMonth ||
    copySourceMonthOptions.length === 0;
  const lendersFeedbackMessage = lendersState.error ?? lendersLoadError ?? null;
  const lendersFeedbackTone = lendersState.error || lendersLoadError
    ? "error"
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
  const updateExpenseReceiptUploadState = (
    updater: (
      currentState: ExpenseReceiptUploadState,
    ) => ExpenseReceiptUploadState,
  ) => {
    setExpenseReceiptUploadState((currentState) => updater(currentState));
  };
  const updateExpenseReceiptCoverageEditState = (
    updater: (
      currentState: ExpenseReceiptCoverageEditState,
    ) => ExpenseReceiptCoverageEditState,
  ) => {
    setExpenseReceiptCoverageEditState((currentState) => updater(currentState));
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
    const normalizedMonth = value.trim();

    if (!MONTH_PATTERN.test(normalizedMonth) || normalizedMonth === formState.month) {
      return;
    }

    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          month: normalizedMonth,
        },
      },
      undefined,
      {
        scroll: false,
      },
    );
  };

  const handleCopySourceMonthChange = (value: string) => {
    if (!copySourceMonthOptions.some((option) => option.value === value)) {
      return;
    }

    setCopySourceMonth(value);
  };

  const handleCopyFromMonth = async () => {
    if (!copySourceMonth) {
      toast.warning("Seleccioná un mes guardado para copiar.");
      return;
    }

    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para copiar gastos de otro mes.");
      return;
    }

    setIsCopyingFromMonth(true);

    try {
      const sourceDocument = await getMonthlyExpensesDocumentViaApi(copySourceMonth);

      if (sourceDocument.items.length === 0) {
        toast.warning("El mes seleccionado no tiene gastos para copiar.");
        return;
      }

      const copiedRows = copyMonthlyExpenseTemplatesToMonth(
        formState.month,
        toEditableRows(sourceDocument),
      );

      const wasSaved = await persistMonthlyExpensesRows(copiedRows, {
        loading: `Copiando gastos desde ${copySourceMonth}...`,
        success: `Copiamos y guardamos la planilla de ${copySourceMonth} en ${formState.month}.`,
      });

      if (!wasSaved) {
        return;
      }

      setExpenseSheetState(createClosedExpenseSheetState());
    } catch (error) {
      updateFormState((currentState) => ({
        ...currentState,
        error: getSafeMonthlyExpensesErrorMessage(error),
      }));
      toast.error("No pudimos copiar gastos desde el mes seleccionado.");
    } finally {
      setIsCopyingFromMonth(false);
    }
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
                : fieldName === "manualCoveredPayments"
                ? value || "0"
                : fieldName === "receiptSharePhoneDigits"
                ? normalizeReceiptSharePhoneDigits(value)
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

  const handleExpenseReceiptShareToggle = (checked: boolean) => {
    updateExpenseSheetState((currentState) => {
      if (!currentState.draft) {
        return currentState;
      }

      const hasKnownStatus = isReceiptShareStatus(
        currentState.draft.receiptShareStatus,
      );

      return {
        ...currentState,
        draft: normalizeEditableRows(formState.month, [
          {
            ...currentState.draft,
            receiptShareStatus: checked
              ? hasKnownStatus
                ? currentState.draft.receiptShareStatus
                : "pending"
              : currentState.draft.receiptShareStatus,
            requiresReceiptShare: checked,
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
  };

  const handleOpenReceiptUpload = (expenseId: string) => {
    const row = formState.rows.find((currentRow) => currentRow.id === expenseId);

    if (!row) {
      toast.warning("No pudimos encontrar el gasto para subir el comprobante.");
      return;
    }

    const remainingPaymentsForReceipts = getRemainingPaymentsForReceipts(row);

    if (remainingPaymentsForReceipts <= 0) {
      toast.warning("No quedan pagos pendientes para cubrir con comprobantes.");
      return;
    }

    updateExpenseReceiptUploadState(() => ({
      coveredPaymentsByReceipts: getCoveredPaymentsByReceipts(row),
      error: null,
      expenseDescription: row.description,
      expenseId,
      isOpen: true,
      isSubmitting: false,
      manualCoveredPayments: Number(row.manualCoveredPayments) || 0,
      occurrencesPerMonth: Number(row.occurrencesPerMonth) || 1,
      uploadProgressPercent: 0,
    }));
  };

  const handleCloseReceiptUpload = () => {
    setExpenseReceiptUploadState(createClosedExpenseReceiptUploadState());
  };

  const handleUploadExpenseReceipt = async ({
    coveredPayments,
    file,
  }: {
    coveredPayments: number;
    file: File;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para subir comprobantes.");
      return;
    }

    const activeExpenseId = expenseReceiptUploadState.expenseId;

    if (!activeExpenseId) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: "No pudimos identificar el gasto para asociar el comprobante.",
      }));
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === activeExpenseId);

    if (!expenseRow) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: "No pudimos encontrar el gasto seleccionado.",
      }));
      return;
    }

    const remainingPaymentsForReceipts = getRemainingPaymentsForReceipts(
      expenseRow,
    );

    if (remainingPaymentsForReceipts <= 0) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: "No quedan pagos pendientes para cubrir con comprobantes.",
        isSubmitting: false,
      }));
      return;
    }

    if (coveredPayments > remainingPaymentsForReceipts) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: `Ingresá una cantidad de pagos válida entre 1 y ${remainingPaymentsForReceipts}.`,
        isSubmitting: false,
      }));
      return;
    }

    const receiptMimeType = getValidReceiptMimeType(file);

    if (!receiptMimeType) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: "Solo se permiten comprobantes PDF, JPG, PNG, WEBP, HEIC o HEIF.",
      }));
      return;
    }

    if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: "El comprobante supera los 5MB. Elegí un archivo más liviano.",
      }));
      return;
    }

    updateExpenseReceiptUploadState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
      uploadProgressPercent: 0,
    }));

    try {
      const contentBase64 = await fileToBase64WithProgress(file, (readProgress) => {
        updateExpenseReceiptUploadState((currentState) => ({
          ...currentState,
          uploadProgressPercent: clampProgressPercent(
            readProgress * RECEIPT_READ_PROGRESS_WEIGHT,
          ),
        }));
      });

      const receiptUpload = await uploadMonthlyExpenseReceiptViaApi({
        contentBase64,
        coveredPayments,
        expenseDescription: expenseRow.description,
        fileName: file.name,
        month: formState.month,
        mimeType: receiptMimeType,
      }, {
        onUploadProgress: (uploadProgress) => {
          updateExpenseReceiptUploadState((currentState) => ({
            ...currentState,
            uploadProgressPercent: clampProgressPercent(
              100 * RECEIPT_READ_PROGRESS_WEIGHT +
                uploadProgress * RECEIPT_UPLOAD_PROGRESS_WEIGHT,
            ),
          }));
        },
      });

      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        uploadProgressPercent: 100,
      }));

      const nextRows = formState.rows.map((row) =>
        row.id === expenseRow.id
          ? {
              ...row,
              allReceiptsFolderId: receiptUpload.allReceiptsFolderId,
              allReceiptsFolderStatus: undefined,
              allReceiptsFolderViewUrl: receiptUpload.allReceiptsFolderViewUrl,
              monthlyFolderId: receiptUpload.monthlyFolderId,
              monthlyFolderStatus: undefined,
              monthlyFolderViewUrl: receiptUpload.monthlyFolderViewUrl,
              receipts: [
                ...row.receipts,
                {
                  allReceiptsFolderId: receiptUpload.allReceiptsFolderId,
                  allReceiptsFolderViewUrl:
                    receiptUpload.allReceiptsFolderViewUrl,
                  coveredPayments: receiptUpload.coveredPayments,
                  fileId: receiptUpload.fileId,
                  fileName: receiptUpload.fileName,
                  fileViewUrl: receiptUpload.fileViewUrl,
                  monthlyFolderId: receiptUpload.monthlyFolderId,
                  monthlyFolderViewUrl: receiptUpload.monthlyFolderViewUrl,
                },
              ],
            }
          : row,
      );
      const wasSaved = await persistMonthlyExpensesRows(nextRows, {
        loading: "Guardando comprobante...",
        success: "Comprobante subido correctamente.",
      });

      if (!wasSaved) {
        updateExpenseReceiptUploadState((currentState) => ({
          ...currentState,
          isSubmitting: false,
        }));
        return;
      }

      setExpenseReceiptUploadState(createClosedExpenseReceiptUploadState());
    } catch (error) {
      updateExpenseReceiptUploadState((currentState) => ({
        ...currentState,
        error: getSafeMonthlyExpensesErrorMessage(error),
        isSubmitting: false,
      }));
      toast.error("No pudimos subir el comprobante.");
    }
  };

  const handleDeleteExpenseReceipt = async ({
    expenseId,
    receiptFileId,
  }: {
    expenseId: string;
    receiptFileId: string;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para eliminar comprobantes.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto del comprobante.");
      return;
    }

    const receipt = expenseRow.receipts.find((item) => item.fileId === receiptFileId);

    if (!receipt) {
      toast.warning("No pudimos encontrar el comprobante seleccionado.");
      return;
    }

    try {
      if (receipt.fileStatus !== "missing") {
        await deleteMonthlyExpenseReceiptViaApi({
          fileId: receiptFileId,
        });
      }

      const nextRows = formState.rows.map((row) =>
        row.id !== expenseId
          ? row
          : (() => {
              const remainingReceipts = row.receipts.filter(
                (item) => item.fileId !== receiptFileId,
              );

              return {
                ...row,
                receipts: remainingReceipts,
              };
            })(),
      );
      await persistMonthlyExpensesRows(nextRows, {
        loading: "Eliminando comprobante...",
        success: "Comprobante eliminado correctamente.",
      });
    } catch (error) {
      updateFormState((currentState) => ({
        ...currentState,
        error: getSafeMonthlyExpensesErrorMessage(error),
      }));
      toast.error("No pudimos eliminar el comprobante.");
    }
  };

  const handleOpenReceiptCoverageEditor = ({
    expenseId,
    receiptFileId,
  }: {
    expenseId: string;
    receiptFileId: string;
  }) => {
    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto del comprobante.");
      return;
    }

    const receipt = expenseRow.receipts.find((item) => item.fileId === receiptFileId);

    if (!receipt) {
      toast.warning("No pudimos encontrar el comprobante seleccionado.");
      return;
    }

    updateExpenseReceiptCoverageEditState(() => ({
      currentCoveredPayments: receipt.coveredPayments,
      error: null,
      expenseDescription: expenseRow.description,
      expenseId,
      isOpen: true,
      isSubmitting: false,
      maxCoveredPayments: getMaxReceiptCoverageForEdition({
        receiptFileId,
        row: expenseRow,
      }),
      receiptFileId,
      receiptFileName: receipt.fileName,
    }));
  };

  const handleCloseReceiptCoverageEditor = () => {
    setExpenseReceiptCoverageEditState(createClosedExpenseReceiptCoverageEditState());
  };

  const handleSaveReceiptCoverage = async (coveredPayments: number) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para editar comprobantes.");
      return;
    }

    const activeExpenseId = expenseReceiptCoverageEditState.expenseId;
    const activeReceiptFileId = expenseReceiptCoverageEditState.receiptFileId;

    if (!activeExpenseId || !activeReceiptFileId) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos identificar el comprobante para editar.",
      }));
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === activeExpenseId);

    if (!expenseRow) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos encontrar el gasto seleccionado.",
        isSubmitting: false,
      }));
      return;
    }

    const activeReceipt = expenseRow.receipts.find(
      (receipt) => receipt.fileId === activeReceiptFileId,
    );

    if (!activeReceipt) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos encontrar el comprobante seleccionado.",
        isSubmitting: false,
      }));
      return;
    }

    const maxCoveredPayments = getMaxReceiptCoverageForEdition({
      receiptFileId: activeReceiptFileId,
      row: expenseRow,
    });

    if (
      !Number.isInteger(coveredPayments) ||
      coveredPayments <= 0 ||
      coveredPayments > maxCoveredPayments
    ) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "La cantidad de pagos no es valida para este comprobante.",
        maxCoveredPayments,
      }));
      return;
    }

    updateExpenseReceiptCoverageEditState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
    }));

    try {
      const nextRows = formState.rows.map((row) =>
        row.id !== activeExpenseId
          ? row
          : {
              ...row,
              receipts: row.receipts.map((receipt) =>
                receipt.fileId !== activeReceiptFileId
                  ? receipt
                  : {
                      ...receipt,
                      coveredPayments,
                    }),
            },
      );

      const wasSaved = await persistMonthlyExpensesRows(nextRows, {
        loading: "Actualizando cobertura del comprobante...",
        success: "Cobertura del comprobante actualizada.",
      });

      if (!wasSaved) {
        updateExpenseReceiptCoverageEditState((currentState) => ({
          ...currentState,
          isSubmitting: false,
        }));
        return;
      }

      setExpenseReceiptCoverageEditState(createClosedExpenseReceiptCoverageEditState());
    } catch (error) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: getSafeMonthlyExpensesErrorMessage(error),
        isSubmitting: false,
      }));
      toast.error("No pudimos actualizar la cobertura del comprobante.");
    }
  };

  const handleUpdateManualCoveredPayments = async ({
    expenseId,
    manualCoveredPayments,
  }: {
    expenseId: string;
    manualCoveredPayments: number;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar pagos sin comprobante.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const maxManualCoveredPayments = getMaxManualCoveredPayments(expenseRow);

    if (
      !Number.isInteger(manualCoveredPayments) ||
      manualCoveredPayments < 0 ||
      manualCoveredPayments > maxManualCoveredPayments
    ) {
      toast.warning(
        `Ingresá una cantidad válida entre 0 y ${maxManualCoveredPayments}.`,
      );
      return;
    }

    const currentManualCoveredPayments = Number(expenseRow.manualCoveredPayments) || 0;

    if (manualCoveredPayments === currentManualCoveredPayments) {
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            manualCoveredPayments: String(manualCoveredPayments),
          }
        : row,
    );

    await persistMonthlyExpensesRows(nextRows, {
      loading: "Actualizando pagos sin comprobante...",
      success: "Pagos sin comprobante actualizados.",
    });
  };

  const handleUpdatePaymentLink = async ({
    expenseId,
    paymentLink,
  }: {
    expenseId: string;
    paymentLink: string;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para guardar links de pago.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const normalizedPaymentLink = getValidPaymentLink(paymentLink);

    if (!normalizedPaymentLink) {
      toast.warning(PAYMENT_LINK_VALIDATION_ERROR_MESSAGE);
      return;
    }

    if (normalizedPaymentLink === getValidPaymentLink(expenseRow.paymentLink)) {
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            paymentLink: normalizedPaymentLink,
          }
        : row,
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Guardando link de pago...",
      success: "Link de pago guardado correctamente.",
    });

    if (!wasSaved) {
      toast.error("No pudimos guardar el link de pago.");
    }
  };

  const handleDeletePaymentLink = async (expenseId: string) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para eliminar links de pago.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    if (!getValidPaymentLink(expenseRow.paymentLink)) {
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            paymentLink: "",
          }
        : row,
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Eliminando link de pago...",
      success: "Link de pago eliminado.",
    });

    if (!wasSaved) {
      toast.error("No pudimos eliminar el link de pago.");
    }
  };

  const handleUpdateReceiptShareStatus = async ({
    expenseId,
    receiptShareStatus,
  }: {
    expenseId: string;
    receiptShareStatus: MonthlyExpenseReceiptShareStatus;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar el estado de envío.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    if (!expenseRow.requiresReceiptShare) {
      return;
    }

    const currentStatus = isReceiptShareStatus(expenseRow.receiptShareStatus)
      ? expenseRow.receiptShareStatus
      : "pending";

    if (currentStatus === receiptShareStatus) {
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            receiptShareStatus,
          }
        : row,
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Actualizando estado de envío...",
      success: "Estado de envío actualizado.",
    });

    if (!wasSaved) {
      toast.error("No pudimos actualizar el estado de envío.");
    }
  };

  const handleDeleteMonthlyFolderReference = async (expenseId: string) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar carpetas.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto de la carpeta seleccionada.");
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            monthlyFolderId: "",
            monthlyFolderStatus: undefined,
            monthlyFolderViewUrl: "",
          }
        : row,
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Quitando referencia de carpeta del mes actual...",
      success: "Referencia de carpeta del mes actual eliminada.",
    });

    if (!wasSaved) {
      toast.error("No pudimos quitar la referencia de carpeta del mes actual.");
    }
  };

  const handleDeleteAllReceiptsFolderReference = async (expenseId: string) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar carpetas.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto de la carpeta seleccionada.");
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            allReceiptsFolderId: "",
            allReceiptsFolderStatus: undefined,
            allReceiptsFolderViewUrl: "",
          }
        : row,
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Quitando referencia de carpeta de comprobantes...",
      success: "Referencia de carpeta de comprobantes eliminada.",
    });

    if (!wasSaved) {
      toast.error("No pudimos quitar la referencia de carpeta de comprobantes.");
    }
  };

  const handleRequestCloseExpenseSheet = () => {
    if (
      shouldIgnoreNextExpenseSheetCloseRef.current ||
      isLenderCreateModalOpen
    ) {
      shouldIgnoreNextExpenseSheetCloseRef.current = false;
      return;
    }

    if (isExpenseSheetDirty) {
      updateExpenseSheetState((currentState) => ({
        ...currentState,
        showUnsavedChangesDialog: true,
      }));
      return;
    }

    setExpenseSheetState(createClosedExpenseSheetState());
  };

  const handleOpenLenderCreateFromExpenseSheet = () => {
    shouldIgnoreNextExpenseSheetCloseRef.current = true;
    setIsLenderCreateModalOpen(true);
  };

  const handleUnsavedChangesDiscard = () => {
    setExpenseSheetState(createClosedExpenseSheetState());
    toast.info("Se descartaron los cambios sin guardar.");
  };

  const handleUnsavedChangesClose = () => {
    updateExpenseSheetState((currentState) => ({
      ...currentState,
      showUnsavedChangesDialog: false,
    }));
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

  const handleResetLendersForm = () => {
    updateLendersState((currentState) => ({
      ...currentState,
      error: null,
      name: "",
      notes: "",
      successMessage: null,
      type: "family",
    }));
  };

  const handleDiscardUnsavedLendersChanges = () => {
    handleResetLendersForm();
    toast.info("Se descartaron los cambios sin guardar.");
  };

  const handleLendersSubmit = async () => {

    const lenderName = lendersState.name.trim();
    const newLenderId = createLenderId();

    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para guardar prestamistas.");
      return false;
    }

    if (!lenderName) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: "Completá el nombre del prestamista antes de guardarlo.",
      }));
      toast.warning("Completá el nombre del prestamista antes de guardarlo.");
      return false;
    }

    if (
      lendersState.lenders.some(
        (lender) =>
          lender.name.toLocaleLowerCase() === lenderName.toLocaleLowerCase(),
      )
    ) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: "Ya existe un prestamista con ese nombre.",
      }));
      toast.warning("Ya existe un prestamista con ese nombre.");
      return false;
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
          error: "No pudimos guardar el prestamista.",
          loading: "Guardando prestamista...",
          success: "Prestamista guardado correctamente.",
        },
      );
      await savePromise;

      updateLendersState(() => ({
        error: null,
        isSubmitting: false,
        lenders: nextLenders,
        name: "",
        notes: "",
        successMessage: "Prestamista guardado correctamente.",
        type: "family",
      }));
      await refreshLoansReport(nextLenders);
      return true;
    } catch (error) {
      updateLendersState((currentState) => ({
        ...currentState,
        error: getSafeLendersErrorMessage(error),
        isSubmitting: false,
      }));
      return false;
    }
  };

  const handleDeleteLender = async (lenderId: string) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para eliminar prestamistas.");
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
          error: "No pudimos eliminar el prestamista.",
          loading: "Eliminando prestamista...",
          success: "Prestamista eliminado del catálogo.",
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
        successMessage: "Prestamista eliminado del catálogo.",
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

  const pageHeading = getPageHeadingByTab(activeTab);

  return (
    <FinanceAppShell
      activeSection={activeTab}
      authRedirectPath="/gastos"
      expensesMonth={formState.month}
      initialSidebarOpen={initialSidebarOpen}
      isOAuthConfigured={isOAuthConfigured}
    >
      <TypingAnimation
        aria-label={pageHeading}
        as="h1"
        showCursor={false}
        startOnView={false}
      >
        {pageHeading}
      </TypingAnimation>

      {activeTab === "expenses" ? (
              <MonthlyExpensesTable
                actionDisabled={actionDisabled}
                changedFields={changedExpenseFields}
                copySourceMonth={copySourceMonth}
                copySourceMonthOptions={copySourceMonthOptions}
                draft={expenseSheetState.draft}
                exchangeRateLoadError={formState.exchangeRateLoadError}
                exchangeRateSnapshot={formState.exchangeRateSnapshot}
                feedbackMessage={feedbackMessage}
                feedbackTone={feedbackTone}
                isCopyFromDisabled={copyFromDisabled}
                isExpenseSheetOpen={expenseSheetState.isOpen}
                isSubmitting={formState.isSubmitting}
                lenders={lendersState.lenders}
                loadError={loadError}
                month={formState.month}
                onAddExpense={handleAddExpense}
                onAddLender={handleOpenLenderCreateFromExpenseSheet}
                onCopyFromMonth={handleCopyFromMonth}
                onCopySourceMonthChange={handleCopySourceMonthChange}
                onDeleteAllReceiptsFolderReference={handleDeleteAllReceiptsFolderReference}
                onDeleteExpense={handleRemoveExpense}
                onDeletePaymentLink={handleDeletePaymentLink}
                onDeleteMonthlyFolderReference={handleDeleteMonthlyFolderReference}
                onDeleteReceipt={handleDeleteExpenseReceipt}
                onEditReceiptCoverage={handleOpenReceiptCoverageEditor}
                onEditExpense={handleEditExpense}
                onExpenseFieldChange={handleExpenseFieldChange}
                onExpenseLenderSelect={handleExpenseLenderSelect}
                onExpenseLoanToggle={handleExpenseLoanToggle}
                onExpenseReceiptShareToggle={handleExpenseReceiptShareToggle}
                onMonthChange={handleMonthChange}
                onRequestCloseExpenseSheet={handleRequestCloseExpenseSheet}
                onSaveExpense={handleSaveExpense}
                onSaveUnsavedChanges={handleSaveUnsavedChanges}
                onUpdateManualCoveredPayments={handleUpdateManualCoveredPayments}
                onUpdatePaymentLink={handleUpdatePaymentLink}
                onUpdateReceiptShareStatus={handleUpdateReceiptShareStatus}
                onUploadReceipt={handleOpenReceiptUpload}
                onUnsavedChangesClose={handleUnsavedChangesClose}
                onUnsavedChangesDiscard={handleUnsavedChangesDiscard}
                rows={formState.rows}
                sheetMode={expenseSheetState.mode}
                showCopyFromControls={showCopyFromControls}
                showUnsavedChangesDialog={expenseSheetState.showUnsavedChangesDialog}
                validationMessage={expenseValidationMessage}
              />
      ) : null}

      {activeTab === "lenders" ? (
              <LendersPanel
                feedbackMessage={lendersFeedbackMessage}
                feedbackTone={lendersFeedbackTone}
                isCreateModalOpen={isLenderCreateModalOpen}
                lenders={lendersState.lenders}
                onDelete={handleDeleteLender}
                onOpenCreateModal={() => setIsLenderCreateModalOpen(true)}
              />
      ) : null}

      {activeTab === "debts" ? (
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
      ) : null}

      <ExpenseReceiptUploadDialog
        coveredPaymentsMax={Math.max(
          expenseReceiptUploadState.occurrencesPerMonth,
          1,
        )}
        coveredPaymentsRemaining={Math.max(
          expenseReceiptUploadState.occurrencesPerMonth -
            expenseReceiptUploadState.manualCoveredPayments -
            expenseReceiptUploadState.coveredPaymentsByReceipts,
          0,
        )}
        errorMessage={expenseReceiptUploadState.error}
        expenseDescription={expenseReceiptUploadState.expenseDescription}
        isOpen={expenseReceiptUploadState.isOpen}
        isSubmitting={expenseReceiptUploadState.isSubmitting}
        uploadProgressPercent={expenseReceiptUploadState.uploadProgressPercent}
        onClose={handleCloseReceiptUpload}
        onUpload={handleUploadExpenseReceipt}
      />

      {expenseReceiptCoverageEditState.isOpen ? (
        <ExpenseReceiptCoverageEditDialog
          currentCoveredPayments={expenseReceiptCoverageEditState.currentCoveredPayments}
          errorMessage={expenseReceiptCoverageEditState.error}
          expenseDescription={expenseReceiptCoverageEditState.expenseDescription}
          isOpen={expenseReceiptCoverageEditState.isOpen}
          isSubmitting={expenseReceiptCoverageEditState.isSubmitting}
          maxCoveredPayments={expenseReceiptCoverageEditState.maxCoveredPayments}
          onClose={handleCloseReceiptCoverageEditor}
          onSave={handleSaveReceiptCoverage}
          receiptFileName={expenseReceiptCoverageEditState.receiptFileName}
        />
      ) : null}

      <LenderCreateDialog
        feedbackMessage={lendersFeedbackMessage}
        feedbackTone={lendersFeedbackTone}
        formValues={{
          name: lendersState.name,
          notes: lendersState.notes,
          type: lendersState.type,
        }}
        isOpen={isLenderCreateModalOpen}
        isSubmitting={lendersState.isSubmitting}
        onDiscardUnsavedChanges={handleDiscardUnsavedLendersChanges}
        onFieldChange={handleLenderFieldChange}
        onOpenChange={setIsLenderCreateModalOpen}
        onSubmit={handleLendersSubmit}
      />
    </FinanceAppShell>
  );
}
