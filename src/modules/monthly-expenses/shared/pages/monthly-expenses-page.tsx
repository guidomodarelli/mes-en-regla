import type {
  GetServerSidePropsContext,
} from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { FinanceAppShell } from "@/components/finance-app-shell/finance-app-shell";
import { ExpenseReceiptCoverageEditDialog } from "@/components/monthly-expenses/expense-receipt-coverage-edit-dialog";
import { ExpenseReceiptUploadDialog } from "@/components/monthly-expenses/expense-receipt-upload-dialog";
import {
  normalizeReceiptSharePhoneDigits,
  validateOccurrencesPerMonth,
  validateReceiptSharePhoneDigits,
  validateSubtotalAmount,
} from "@/components/monthly-expenses/expense-edit-validation";
import {
  type LenderOption,
} from "@/components/monthly-expenses/lender-picker";
import { LenderCreateDialog } from "@/components/monthly-expenses/lender-create-dialog";
import { LendersPanel } from "@/components/monthly-expenses/lenders-panel";
import { MonthlyExpensesLoansReport } from "@/components/monthly-expenses/monthly-expenses-loans-report";
import {
  MonthlyExpensesTable,
  type MonthlyExpensesEditablePaymentRecord,
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
  getSafeMonthlyExpensesLoadErrorMessage,
  getSafeMonthlyExpensesErrorMessage,
} from "@/modules/monthly-expenses/application/queries/get-monthly-expenses-page-feedback";
import {
  createEmptyMonthlyExpensesCopyableMonthsResult,
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
  getMonthlyExpensesCopyableMonthsViaApi,
} from "@/modules/monthly-expenses/infrastructure/api/monthly-expenses-copyable-months-api";
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
  canManageReceipt: boolean;
  currentCoveredPayments: number;
  error: string | null;
  expenseDescription: string;
  expenseId: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  maxCoveredPayments: number;
  paymentRecordId: string | null;
  receiptFileId: string | null;
  receiptFileName: string | null;
  receiptFileViewUrl: string | null;
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
    canManageReceipt: false,
    currentCoveredPayments: 1,
    error: null,
    expenseDescription: "",
    expenseId: null,
    isOpen: false,
    isSubmitting: false,
    maxCoveredPayments: 1,
    paymentRecordId: null,
    receiptFileId: null,
    receiptFileName: null,
    receiptFileViewUrl: null,
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
    paymentRecords: [],
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

/**
 * Builds editable payment records from document result with legacy fallback support.
 *
 * @param item - Monthly expense row from the API response.
 * @returns Normalized editable payment records.
 */
function toEditablePaymentRecords(
  item: MonthlyExpensesDocumentResult["items"][number],
): MonthlyExpensesEditablePaymentRecord[] {
  if (item.paymentRecords && item.paymentRecords.length > 0) {
    return item.paymentRecords.map((paymentRecord) => ({
      coveredPayments: paymentRecord.coveredPayments,
      id: paymentRecord.id,
      ...(paymentRecord.receipt
        ? {
            receipt: {
              allReceiptsFolderId: paymentRecord.receipt.allReceiptsFolderId,
              allReceiptsFolderStatus: undefined,
              allReceiptsFolderViewUrl:
                paymentRecord.receipt.allReceiptsFolderViewUrl,
              coveredPayments: paymentRecord.receipt.coveredPayments ?? 1,
              fileId: paymentRecord.receipt.fileId,
              fileName: paymentRecord.receipt.fileName,
              fileStatus: undefined,
              fileViewUrl: paymentRecord.receipt.fileViewUrl,
              monthlyFolderId: paymentRecord.receipt.monthlyFolderId,
              monthlyFolderStatus: undefined,
              monthlyFolderViewUrl: paymentRecord.receipt.monthlyFolderViewUrl,
            },
          }
        : {}),
      registeredAt: paymentRecord.registeredAt ?? null,
    }));
  }

  const legacyReceipts = toEditableReceipts(item.receipts);
  const legacyPaymentRecordsFromReceipts = legacyReceipts.map((legacyReceipt) => ({
    coveredPayments: legacyReceipt.coveredPayments,
    id: `legacy-receipt-${legacyReceipt.fileId}`,
    receipt: legacyReceipt,
    registeredAt: null,
  }));
  const legacyManualCoveredPayments =
    item.manualCoveredPayments ?? (
      item.isPaid === true && legacyReceipts.length === 0
        ? item.occurrencesPerMonth
        : 0
    );

  if (legacyManualCoveredPayments <= 0) {
    return legacyPaymentRecordsFromReceipts;
  }

  return [
    ...legacyPaymentRecordsFromReceipts,
    {
      coveredPayments: legacyManualCoveredPayments,
      id: `legacy-manual-${item.id}`,
      registeredAt: null,
    },
  ];
}

/**
 * Derives legacy receipt fields from payment records for backward-compatible flows.
 *
 * @param paymentRecords - Editable payment records.
 * @returns Legacy manual and receipt projections.
 */
function getLegacyCoverageFromPaymentRecords(
  paymentRecords: MonthlyExpensesEditablePaymentRecord[],
): {
  manualCoveredPayments: string;
  receipts: MonthlyExpensesEditableReceipt[];
} {
  const receipts = paymentRecords
    .filter((paymentRecord) => Boolean(paymentRecord.receipt))
    .map((paymentRecord) => paymentRecord.receipt as MonthlyExpensesEditableReceipt);
  const manualCoveredPaymentsValue = paymentRecords
    .filter((paymentRecord) => !paymentRecord.receipt)
    .reduce(
      (coveredPaymentsByManualRecords, paymentRecord) =>
        coveredPaymentsByManualRecords + paymentRecord.coveredPayments,
      0,
    );

  return {
    manualCoveredPayments: formatEditableNumber(manualCoveredPaymentsValue),
    receipts,
  };
}

/**
 * Builds a stable payment record identifier for client-side operations.
 *
 * @returns A non-empty unique identifier.
 */
function createPaymentRecordId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `payment-record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Synchronizes legacy coverage fields from payment records in a table row.
 *
 * @param row - Editable row to normalize.
 * @returns Row with aligned payment records, manual coverage, and receipts.
 */
function synchronizeRowPaymentCoverage(
  row: MonthlyExpensesEditableRow,
): MonthlyExpensesEditableRow {
  const legacyCoverage = getLegacyCoverageFromPaymentRecords(
    row.paymentRecords ?? [],
  );

  return {
    ...row,
    manualCoveredPayments: legacyCoverage.manualCoveredPayments,
    receipts: legacyCoverage.receipts,
  };
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
  return document.items.map((item) => {
    const paymentRecords = toEditablePaymentRecords(item);
    const legacyCoverage = getLegacyCoverageFromPaymentRecords(paymentRecords);

    return ({
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
          manualCoveredPayments: legacyCoverage.manualCoveredPayments,
        }
      : {
          manualCoveredPayments: legacyCoverage.manualCoveredPayments,
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
      ? `${item.loan.paidInstallments} de ${item.loan.installmentCount} cuotas abonadas`
      : "",
    occurrencesPerMonth: formatEditableNumber(item.occurrencesPerMonth),
    paymentRecords,
    paymentLink: item.paymentLink?.trim() ?? "",
    receiptShareMessage: item.receiptShareMessage?.trim() ?? "",
    receiptSharePhoneDigits: item.receiptSharePhoneDigits?.trim() ?? "",
    requiresReceiptShare: item.requiresReceiptShare === true,
    receipts: legacyCoverage.receipts,
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
    });
  });
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

export function getMaxManualCoveredPayments(
  {
    excludedPaymentRecordId,
    row,
  }: {
    excludedPaymentRecordId?: string;
    row: Pick<
      MonthlyExpensesEditableRow,
      "manualCoveredPayments" | "occurrencesPerMonth" | "paymentRecords" | "receipts"
    >;
  },
): number {
  const requiredPayments = getRequiredPayments(row);
  const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(row);
  const paymentRecords = row.paymentRecords ?? [];
  const coveredPaymentsByManualRecords = paymentRecords.reduce(
    (coveredPayments, paymentRecord) =>
      paymentRecord.receipt || paymentRecord.id === excludedPaymentRecordId
        ? coveredPayments
        : coveredPayments + paymentRecord.coveredPayments,
    0,
  );
  const coveredPaymentsByManual = paymentRecords.length > 0
    ? coveredPaymentsByManualRecords
    : getNormalizedManualCoveredPayments(row);

  return Math.max(
    requiredPayments - coveredPaymentsByReceipts - coveredPaymentsByManual,
    0,
  );
}

/**
 * Rebuilds payment records from editable legacy fields while preserving record identity.
 *
 * @param row - Editable row to normalize before persistence.
 * @returns Payment records aligned with legacy manual and receipt coverage fields.
 */
function getSynchronizedPaymentRecordsForSave(
  row: MonthlyExpensesEditableRow,
): MonthlyExpensesEditablePaymentRecord[] {
  const existingPaymentRecords = row.paymentRecords ?? [];

  if (existingPaymentRecords.length === 0) {
    return [];
  }

  const receiptRecordByFileId = new Map(
    existingPaymentRecords
      .filter(
        (paymentRecord) =>
          Boolean(paymentRecord.receipt) && paymentRecord.receipt?.fileId,
      )
      .map((paymentRecord) => [paymentRecord.receipt?.fileId as string, paymentRecord]),
  );
  const synchronizedReceiptRecords = row.receipts.map((receipt) => {
    const matchedRecord = receiptRecordByFileId.get(receipt.fileId);

    return {
      coveredPayments: receipt.coveredPayments,
      id: matchedRecord?.id ?? `legacy-receipt-${receipt.fileId}`,
      receipt,
      registeredAt: matchedRecord?.registeredAt ?? null,
    };
  });
  const manualCoveredPayments = getNormalizedManualCoveredPayments(row);

  if (manualCoveredPayments <= 0) {
    return synchronizedReceiptRecords;
  }

  const existingManualRecords = existingPaymentRecords.filter(
    (paymentRecord) => !paymentRecord.receipt,
  );

  if (existingManualRecords.length === 0) {
    return [
      ...synchronizedReceiptRecords,
      {
        coveredPayments: manualCoveredPayments,
        id: `legacy-manual-${row.id}`,
        registeredAt: null,
      },
    ];
  }

  if (existingManualRecords.length > 1) {
    return [
      ...synchronizedReceiptRecords,
      ...existingManualRecords,
    ];
  }

  const existingManualRecord = existingManualRecords[0];

  return [
    ...synchronizedReceiptRecords,
    {
      coveredPayments: manualCoveredPayments,
      id: existingManualRecord?.id ?? `legacy-manual-${row.id}`,
      registeredAt: existingManualRecord?.registeredAt ?? null,
    },
  ];
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
  return `${paidInstallments} de ${installmentCount} cuotas abonadas`;
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
  const normalizedRowsToCopy = normalizeEditableRows(
    month,
    rows.map((row) => ({
      ...row,
      allReceiptsFolderStatus: undefined,
      id: createExpenseRowId(),
      manualCoveredPayments: "0",
      monthlyFolderId: "",
      monthlyFolderStatus: undefined,
      monthlyFolderViewUrl: "",
      paymentRecords: [],
      receiptShareStatus: "",
      receipts: [],
    })),
  );

  return normalizedRowsToCopy.filter(
    (row) => !row.isLoan || row.loanRemainingInstallments !== 0,
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

export function getExpenseValidationMessage(
  month: string,
  row: MonthlyExpensesEditableRow | null,
  mode: "create" | "edit",
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
    mode === "create" &&
    row.requiresReceiptShare &&
    validateReceiptSharePhoneDigits(row.receiptSharePhoneDigits) !== null
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
    items: state.rows.map((row) => {
      const synchronizedPaymentRecords = getSynchronizedPaymentRecordsForSave(row);

      return {
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
                ...(synchronizedPaymentRecords.find(
                  (paymentRecord) =>
                    paymentRecord.receipt?.fileId === receipt.fileId &&
                    paymentRecord.registeredAt,
                )?.registeredAt
                  ? {
                      registeredAt: synchronizedPaymentRecords.find(
                        (paymentRecord) =>
                          paymentRecord.receipt?.fileId === receipt.fileId,
                      )?.registeredAt,
                    }
                  : {}),
                monthlyFolderId: receipt.monthlyFolderId.trim(),
                monthlyFolderViewUrl: receipt.monthlyFolderViewUrl.trim(),
              })),
            }
          : {}),
        ...(synchronizedPaymentRecords.length > 0
          ? {
              paymentRecords: synchronizedPaymentRecords.map((paymentRecord) => ({
                coveredPayments: paymentRecord.coveredPayments,
                id: paymentRecord.id,
                ...(paymentRecord.receipt
                  ? {
                      receipt: {
                        allReceiptsFolderId:
                          paymentRecord.receipt.allReceiptsFolderId.trim(),
                        allReceiptsFolderViewUrl:
                          paymentRecord.receipt.allReceiptsFolderViewUrl.trim(),
                        coveredPayments: paymentRecord.receipt.coveredPayments,
                        fileId: paymentRecord.receipt.fileId.trim(),
                        fileName:
                          paymentRecord.receipt.fileName.trim() || "Comprobante",
                        fileViewUrl: paymentRecord.receipt.fileViewUrl.trim(),
                        monthlyFolderId: paymentRecord.receipt.monthlyFolderId.trim(),
                        monthlyFolderViewUrl:
                          paymentRecord.receipt.monthlyFolderViewUrl.trim(),
                      },
                    }
                  : {}),
                ...(paymentRecord.registeredAt
                  ? { registeredAt: paymentRecord.registeredAt }
                  : {}),
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
      };
    }),
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

function getRequestedMonthFromQuery(
  queryValue: string | string[] | undefined,
): string | null {
  const monthValue = Array.isArray(queryValue) ? queryValue[0] : queryValue;
  const normalizedMonth = monthValue?.trim();

  if (!normalizedMonth || !MONTH_PATTERN.test(normalizedMonth)) {
    return null;
  }

  return normalizedMonth;
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
  const [copyableMonthsState, setCopyableMonthsState] =
    useState<MonthlyExpensesCopyableMonthsResult>(initialCopyableMonths);
  const [currentLoadError, setCurrentLoadError] = useState<string | null>(loadError);
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
  const [isMonthTransitionPending, setIsMonthTransitionPending] = useState(false);
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);
  const shouldIgnoreNextExpenseSheetCloseRef = useRef(false);
  const latestMonthLoadRequestIdRef = useRef(0);

  const isAuthenticated = status === "authenticated";
  const isSessionLoading = status === "loading";
  const expenseValidationMessage = getExpenseValidationMessage(
    formState.month,
    expenseSheetState.draft,
    expenseSheetState.mode,
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
    latestMonthLoadRequestIdRef.current += 1;
    setFormState(createMonthlyExpensesFormState(initialDocument));
    setCopyableMonthsState(initialCopyableMonths);
    setCopySourceMonth(initialCopyableMonths.defaultSourceMonth);
    setIsCopyingFromMonth(false);
    setIsMonthTransitionPending(false);
    setPendingMonth(null);
    setExpenseSheetState(createClosedExpenseSheetState());
    setExpenseReceiptUploadState(createClosedExpenseReceiptUploadState());
    setExpenseReceiptCoverageEditState(
      createClosedExpenseReceiptCoverageEditState(),
    );
  }, [initialCopyableMonths, initialDocument]);

  useEffect(() => {
    setCurrentLoadError(loadError);
  }, [loadError]);

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
    formState.isSubmitting ||
    isMonthTransitionPending;
  const copySourceMonthOptions = copyableMonthsState.sourceMonths.map((month) => ({
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

  const navigateToMonth = useCallback(
    async (normalizedMonth: string, options?: { shallow?: boolean }) =>
      router.push(
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
          ...(options?.shallow ? { shallow: true } : {}),
        },
      ),
    [router],
  );

  const loadMonth = useCallback(
    async (
      normalizedMonth: string,
      options: {
        updateRoute?: boolean;
      } = {},
    ) => {
      const requestId = latestMonthLoadRequestIdRef.current + 1;
      latestMonthLoadRequestIdRef.current = requestId;
      setIsMonthTransitionPending(true);
      setPendingMonth(normalizedMonth);

      try {
        const copyableMonthsPromise = getMonthlyExpensesCopyableMonthsViaApi(
          normalizedMonth,
        )
          .then((copyableMonths) => ({
            copyableMonths,
            status: "fulfilled" as const,
          }))
          .catch(() => ({
            status: "rejected" as const,
          }));
        const document = await getMonthlyExpensesDocumentViaApi(normalizedMonth, {
          includeDriveStatuses: false,
        });

        if (latestMonthLoadRequestIdRef.current !== requestId) {
          return;
        }

        if (options.updateRoute ?? true) {
          await navigateToMonth(normalizedMonth, { shallow: true });

          if (latestMonthLoadRequestIdRef.current !== requestId) {
            return;
          }
        }

        setFormState(createMonthlyExpensesFormState(document));
        setCurrentLoadError(null);
        setIsCopyingFromMonth(false);
        setExpenseSheetState(createClosedExpenseSheetState());
        setExpenseReceiptUploadState(createClosedExpenseReceiptUploadState());
        setExpenseReceiptCoverageEditState(
          createClosedExpenseReceiptCoverageEditState(),
        );

        const copyableMonthsResult = await copyableMonthsPromise;

        if (latestMonthLoadRequestIdRef.current !== requestId) {
          return;
        }

        if (copyableMonthsResult.status === "fulfilled") {
          setCopyableMonthsState(copyableMonthsResult.copyableMonths);
          setCopySourceMonth(copyableMonthsResult.copyableMonths.defaultSourceMonth);
        } else {
          setCopyableMonthsState(
            createEmptyMonthlyExpensesCopyableMonthsResult(normalizedMonth),
          );
          setCopySourceMonth(null);
        }
      } catch (error) {
        if (latestMonthLoadRequestIdRef.current !== requestId) {
          return;
        }

        toast.error(getSafeMonthlyExpensesLoadErrorMessage(error));
      } finally {
        if (latestMonthLoadRequestIdRef.current === requestId) {
          setIsMonthTransitionPending(false);
          setPendingMonth(null);
        }
      }
    },
    [navigateToMonth],
  );

  useEffect(() => {
    if (!router.isReady || !isOAuthConfigured || !isAuthenticated || isSessionLoading) {
      return;
    }

    const requestedMonth = getRequestedMonthFromQuery(router.query.month);

    if (
      !requestedMonth ||
      requestedMonth === formState.month ||
      requestedMonth === pendingMonth
    ) {
      return;
    }

    void loadMonth(requestedMonth, { updateRoute: false });
  }, [
    formState.month,
    isAuthenticated,
    isOAuthConfigured,
    isSessionLoading,
    loadMonth,
    pendingMonth,
    router.isReady,
    router.query.month,
  ]);

  const handleMonthChange = async (value: string) => {
    const normalizedMonth = value.trim();

    if (
      !MONTH_PATTERN.test(normalizedMonth) ||
      normalizedMonth === formState.month ||
      normalizedMonth === pendingMonth
    ) {
      return;
    }

    if (!isOAuthConfigured || !isAuthenticated || isSessionLoading) {
      await navigateToMonth(normalizedMonth);
      return;
    }

    await loadMonth(normalizedMonth);
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

      if (copiedRows.length === 0) {
        toast.warning(
          "El mes seleccionado no tiene deudas vigentes para copiar.",
        );
        return;
      }

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
          ? synchronizeRowPaymentCoverage({
              ...row,
              allReceiptsFolderId: receiptUpload.allReceiptsFolderId,
              allReceiptsFolderStatus: undefined,
              allReceiptsFolderViewUrl: receiptUpload.allReceiptsFolderViewUrl,
              monthlyFolderId: receiptUpload.monthlyFolderId,
              monthlyFolderStatus: undefined,
              monthlyFolderViewUrl: receiptUpload.monthlyFolderViewUrl,
              paymentRecords: [
                ...(row.paymentRecords ?? []),
                {
                  coveredPayments: receiptUpload.coveredPayments,
                  id: createPaymentRecordId(),
                  receipt: {
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
                  registeredAt: receiptUpload.registeredAt,
                },
              ],
            })
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
          : synchronizeRowPaymentCoverage({
              ...row,
              paymentRecords: (row.paymentRecords ?? []).filter(
                (paymentRecord) => paymentRecord.receipt?.fileId !== receiptFileId,
              ),
            }),
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

    const paymentRecord = (expenseRow.paymentRecords ?? []).find(
      (item) => item.receipt?.fileId === receiptFileId,
    );

    if (!paymentRecord) {
      toast.warning("No pudimos encontrar el registro asociado al comprobante.");
      return;
    }

    updateExpenseReceiptCoverageEditState(() => ({
      canManageReceipt: true,
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
      paymentRecordId: paymentRecord.id,
      receiptFileId,
      receiptFileName: receipt.fileName,
      receiptFileViewUrl: receipt.fileViewUrl,
    }));
  };

  const handleOpenManualPaymentRecordEditor = ({
    expenseId,
    paymentRecordId,
  }: {
    expenseId: string;
    paymentRecordId: string;
  }) => {
    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const manualRecord = (expenseRow.paymentRecords ?? []).find(
      (paymentRecord) =>
        paymentRecord.id === paymentRecordId && !paymentRecord.receipt,
    );

    if (!manualRecord) {
      toast.warning("No pudimos encontrar el registro manual seleccionado.");
      return;
    }

    updateExpenseReceiptCoverageEditState(() => ({
      canManageReceipt: false,
      currentCoveredPayments: manualRecord.coveredPayments,
      error: null,
      expenseDescription: expenseRow.description,
      expenseId,
      isOpen: true,
      isSubmitting: false,
      maxCoveredPayments: getMaxManualCoveredPayments({
        excludedPaymentRecordId: paymentRecordId,
        row: expenseRow,
      }),
      paymentRecordId,
      receiptFileId: null,
      receiptFileName: null,
      receiptFileViewUrl: null,
    }));
  };

  const handleCloseReceiptCoverageEditor = () => {
    setExpenseReceiptCoverageEditState(createClosedExpenseReceiptCoverageEditState());
  };

  const handleDeleteReceiptFromCoverageEditor = async () => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para eliminar comprobantes.");
      return;
    }

    const activeExpenseId = expenseReceiptCoverageEditState.expenseId;
    const activeReceiptFileId = expenseReceiptCoverageEditState.receiptFileId;
    const activePaymentRecordId = expenseReceiptCoverageEditState.paymentRecordId;

    if (!activeExpenseId || !activeReceiptFileId || !activePaymentRecordId) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos identificar el comprobante para eliminar.",
      }));
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === activeExpenseId);

    if (!expenseRow) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos encontrar el gasto seleccionado.",
      }));
      return;
    }

    const paymentRecord = (expenseRow.paymentRecords ?? []).find(
      (item) =>
        item.id === activePaymentRecordId &&
        item.receipt?.fileId === activeReceiptFileId,
    );

    if (!paymentRecord?.receipt) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos encontrar el comprobante seleccionado.",
      }));
      return;
    }

    updateExpenseReceiptCoverageEditState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
    }));

    try {
      if (paymentRecord.receipt.fileStatus !== "missing") {
        await deleteMonthlyExpenseReceiptViaApi({
          fileId: activeReceiptFileId,
        });
      }

      const nextRows = formState.rows.map((row) =>
        row.id !== activeExpenseId
          ? row
          : synchronizeRowPaymentCoverage({
              ...row,
              paymentRecords: (row.paymentRecords ?? []).map((record) =>
                record.id !== activePaymentRecordId
                  ? record
                  : {
                      ...record,
                      receipt: undefined,
                    }),
            }),
      );
      const wasSaved = await persistMonthlyExpensesRows(nextRows, {
        loading: "Eliminando comprobante...",
        success: "Comprobante eliminado correctamente.",
      });

      if (!wasSaved) {
        updateExpenseReceiptCoverageEditState((currentState) => ({
          ...currentState,
          isSubmitting: false,
        }));
        return;
      }

      const updatedExpenseRow = nextRows.find((row) => row.id === activeExpenseId);
      const updatedRecord = updatedExpenseRow?.paymentRecords?.find(
        (record) => record.id === activePaymentRecordId && !record.receipt,
      );

      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        currentCoveredPayments:
          updatedRecord?.coveredPayments ?? currentState.currentCoveredPayments,
        error: null,
        isSubmitting: false,
        maxCoveredPayments: updatedExpenseRow
          ? getMaxManualCoveredPayments({
              excludedPaymentRecordId: activePaymentRecordId,
              row: updatedExpenseRow,
            })
          : currentState.maxCoveredPayments,
        paymentRecordId: activePaymentRecordId,
        receiptFileId: null,
        receiptFileName: null,
        receiptFileViewUrl: null,
      }));
    } catch (error) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: getSafeMonthlyExpensesErrorMessage(error),
        isSubmitting: false,
      }));
      toast.error("No pudimos eliminar el comprobante.");
    }
  };

  const handleSaveReceiptCoverage = async ({
    coveredPayments,
    replacementFile,
  }: {
    coveredPayments: number;
    replacementFile: File | null;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para editar registros.");
      return;
    }

    const activeExpenseId = expenseReceiptCoverageEditState.expenseId;
    const activeReceiptFileId = expenseReceiptCoverageEditState.receiptFileId;
    const activePaymentRecordId = expenseReceiptCoverageEditState.paymentRecordId;

    if (!activeExpenseId || (!activeReceiptFileId && !activePaymentRecordId)) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "No pudimos identificar el registro para editar.",
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

    const maxCoveredPayments = activeReceiptFileId
      ? getMaxReceiptCoverageForEdition({
          receiptFileId: activeReceiptFileId,
          row: expenseRow,
        })
      : getMaxManualCoveredPayments({
          excludedPaymentRecordId: activePaymentRecordId ?? undefined,
          row: expenseRow,
        });

    if (
      !Number.isInteger(coveredPayments) ||
      coveredPayments <= 0 ||
      coveredPayments > maxCoveredPayments
    ) {
      updateExpenseReceiptCoverageEditState((currentState) => ({
        ...currentState,
        error: "La cantidad de pagos no es valida para este registro.",
        maxCoveredPayments,
      }));
      return;
    }

    if (activeReceiptFileId) {
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
    } else {
      const activeManualRecord = (expenseRow.paymentRecords ?? []).find(
        (paymentRecord) =>
          paymentRecord.id === activePaymentRecordId && !paymentRecord.receipt,
      );

      if (!activeManualRecord) {
        updateExpenseReceiptCoverageEditState((currentState) => ({
          ...currentState,
          error: "No pudimos encontrar el registro manual seleccionado.",
          isSubmitting: false,
        }));
        return;
      }
    }

    updateExpenseReceiptCoverageEditState((currentState) => ({
      ...currentState,
      error: null,
      isSubmitting: true,
    }));

    try {
      if (replacementFile) {
        if (!activePaymentRecordId) {
          updateExpenseReceiptCoverageEditState((currentState) => ({
            ...currentState,
            error: "No pudimos identificar el registro para adjuntar el comprobante.",
            isSubmitting: false,
          }));
          return;
        }

        const replacementMimeType = getValidReceiptMimeType(replacementFile);

        if (!replacementMimeType) {
          updateExpenseReceiptCoverageEditState((currentState) => ({
            ...currentState,
            error: "Solo se permiten comprobantes PDF, JPG, PNG, WEBP, HEIC o HEIF.",
            isSubmitting: false,
          }));
          return;
        }

        if (replacementFile.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
          updateExpenseReceiptCoverageEditState((currentState) => ({
            ...currentState,
            error: "El comprobante supera los 5MB. Elegí un archivo más liviano.",
            isSubmitting: false,
          }));
          return;
        }

        const replacementContentBase64 = await fileToBase64WithProgress(
          replacementFile,
          () => undefined,
        );
        const replacementReceiptUpload = await uploadMonthlyExpenseReceiptViaApi({
          contentBase64: replacementContentBase64,
          coveredPayments,
          expenseDescription: expenseRow.description,
          fileName: replacementFile.name,
          month: formState.month,
          mimeType: replacementMimeType,
        });

        const nextRows = formState.rows.map((row) =>
          row.id !== activeExpenseId
            ? row
            : synchronizeRowPaymentCoverage({
                ...row,
                allReceiptsFolderId: replacementReceiptUpload.allReceiptsFolderId,
                allReceiptsFolderStatus: undefined,
                allReceiptsFolderViewUrl: replacementReceiptUpload.allReceiptsFolderViewUrl,
                monthlyFolderId: replacementReceiptUpload.monthlyFolderId,
                monthlyFolderStatus: undefined,
                monthlyFolderViewUrl: replacementReceiptUpload.monthlyFolderViewUrl,
                paymentRecords: (row.paymentRecords ?? []).map((paymentRecord) =>
                  paymentRecord.id !== activePaymentRecordId
                    ? paymentRecord
                    : {
                        ...paymentRecord,
                        coveredPayments,
                        receipt: {
                          allReceiptsFolderId:
                            replacementReceiptUpload.allReceiptsFolderId,
                          allReceiptsFolderViewUrl:
                            replacementReceiptUpload.allReceiptsFolderViewUrl,
                          coveredPayments: replacementReceiptUpload.coveredPayments,
                          fileId: replacementReceiptUpload.fileId,
                          fileName: replacementReceiptUpload.fileName,
                          fileViewUrl: replacementReceiptUpload.fileViewUrl,
                          monthlyFolderId: replacementReceiptUpload.monthlyFolderId,
                          monthlyFolderViewUrl:
                            replacementReceiptUpload.monthlyFolderViewUrl,
                        },
                        registeredAt: replacementReceiptUpload.registeredAt,
                      }),
              }),
        );

        const wasSaved = await persistMonthlyExpensesRows(nextRows, {
          loading: "Guardando comprobante...",
          success: "Comprobante subido correctamente.",
        });

        if (!wasSaved) {
          updateExpenseReceiptCoverageEditState((currentState) => ({
            ...currentState,
            isSubmitting: false,
          }));
          return;
        }

        setExpenseReceiptCoverageEditState(createClosedExpenseReceiptCoverageEditState());
        return;
      }

      const nextRows = formState.rows.map((row) =>
        row.id !== activeExpenseId
          ? row
          : synchronizeRowPaymentCoverage({
              ...row,
              paymentRecords: (row.paymentRecords ?? []).map((paymentRecord) =>
                activeReceiptFileId
                  ? paymentRecord.receipt?.fileId !== activeReceiptFileId
                    ? paymentRecord
                    : {
                        ...paymentRecord,
                        coveredPayments,
                        receipt: paymentRecord.receipt
                          ? {
                              ...paymentRecord.receipt,
                              coveredPayments,
                            }
                          : paymentRecord.receipt,
                      }
                  : paymentRecord.id !== activePaymentRecordId
                    ? paymentRecord
                    : {
                        ...paymentRecord,
                        coveredPayments,
                      }),
            }),
      );

      const wasSaved = await persistMonthlyExpensesRows(nextRows, {
        loading: activeReceiptFileId
          ? "Actualizando cobertura del comprobante..."
          : "Actualizando registro de pago...",
        success: activeReceiptFileId
          ? "Cobertura del comprobante actualizada."
          : "Registro de pago actualizado.",
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
      toast.error(
        activeReceiptFileId
          ? "No pudimos actualizar la cobertura del comprobante."
          : "No pudimos actualizar el registro manual.",
      );
    }
  };

  const handleAddManualPaymentRecord = async ({
    coveredPayments,
    expenseId,
  }: {
    coveredPayments: number;
    expenseId: string;
  }): Promise<boolean> => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar pagos sin comprobante.");
      return false;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return false;
    }

    const maxManualCoveredPayments = getMaxManualCoveredPayments({
      row: expenseRow,
    });

    if (
      !Number.isInteger(coveredPayments) ||
      coveredPayments <= 0 ||
      coveredPayments > maxManualCoveredPayments
    ) {
      toast.warning(
        `Ingresá una cantidad válida entre 1 y ${maxManualCoveredPayments}.`,
      );
      return false;
    }

    const nextRows = formState.rows.map((row) =>
      row.id === expenseId
        ? synchronizeRowPaymentCoverage({
            ...row,
            paymentRecords: [
              ...(row.paymentRecords ?? []),
              {
                coveredPayments,
                id: createPaymentRecordId(),
                registeredAt: new Date().toISOString(),
              },
            ],
          })
        : row,
    );

    return await persistMonthlyExpensesRows(nextRows, {
      loading: "Actualizando pagos sin comprobante...",
      success: "Pagos sin comprobante actualizados.",
    });
  };

  const handleRegisterPaymentRecord = async ({
    coveredPayments,
    expenseId,
    file,
  }: {
    coveredPayments: number;
    expenseId: string;
    file: File | null;
  }): Promise<boolean> => {
    if (!file) {
      return await handleAddManualPaymentRecord({
        coveredPayments,
        expenseId,
      });
    }

    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para subir comprobantes.");
      return false;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return false;
    }

    const remainingPaymentsForReceipts = getRemainingPaymentsForReceipts(
      expenseRow,
    );

    if (
      !Number.isInteger(coveredPayments) ||
      coveredPayments <= 0 ||
      coveredPayments > remainingPaymentsForReceipts
    ) {
      toast.warning(
        `Ingresá una cantidad de pagos válida entre 1 y ${remainingPaymentsForReceipts}.`,
      );
      return false;
    }

    const receiptMimeType = getValidReceiptMimeType(file);

    if (!receiptMimeType) {
      toast.warning("Solo se permiten comprobantes PDF, JPG, PNG, WEBP, HEIC o HEIF.");
      return false;
    }

    if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
      toast.warning("El comprobante supera los 5MB. Elegí un archivo más liviano.");
      return false;
    }

    try {
      const contentBase64 = await fileToBase64WithProgress(file, () => undefined);
      const receiptUpload = await uploadMonthlyExpenseReceiptViaApi({
        contentBase64,
        coveredPayments,
        expenseDescription: expenseRow.description,
        fileName: file.name,
        month: formState.month,
        mimeType: receiptMimeType,
      });

      const nextRows = formState.rows.map((row) =>
        row.id === expenseRow.id
          ? synchronizeRowPaymentCoverage({
              ...row,
              allReceiptsFolderId: receiptUpload.allReceiptsFolderId,
              allReceiptsFolderStatus: undefined,
              allReceiptsFolderViewUrl: receiptUpload.allReceiptsFolderViewUrl,
              monthlyFolderId: receiptUpload.monthlyFolderId,
              monthlyFolderStatus: undefined,
              monthlyFolderViewUrl: receiptUpload.monthlyFolderViewUrl,
              paymentRecords: [
                ...(row.paymentRecords ?? []),
                {
                  coveredPayments: receiptUpload.coveredPayments,
                  id: createPaymentRecordId(),
                  receipt: {
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
                  registeredAt: receiptUpload.registeredAt,
                },
              ],
            })
          : row,
      );

      return await persistMonthlyExpensesRows(nextRows, {
        loading: "Guardando comprobante...",
        success: "Comprobante subido correctamente.",
      });
    } catch (error) {
      toast.error(getSafeMonthlyExpensesErrorMessage(error));
      return false;
    }
  };

  const handleDeleteManualPaymentRecord = async ({
    expenseId,
    paymentRecordId,
  }: {
    expenseId: string;
    paymentRecordId: string;
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

    const manualRecord = (expenseRow.paymentRecords ?? []).find(
      (paymentRecord) =>
        paymentRecord.id === paymentRecordId && !paymentRecord.receipt,
    );

    if (!manualRecord) {
      toast.warning("No pudimos encontrar el registro manual seleccionado.");
      return;
    }

    const nextRows = formState.rows.map((row) =>
      row.id !== expenseId
        ? row
        : synchronizeRowPaymentCoverage({
            ...row,
            paymentRecords: (row.paymentRecords ?? []).filter(
              (paymentRecord) => paymentRecord.id !== paymentRecordId,
            ),
          }),
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

  const handleUpdateExpenseSubtotal = async ({
    expenseId,
    subtotal,
  }: {
    expenseId: string;
    subtotal: number;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar el subtotal.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const subtotalValidationError = validateSubtotalAmount(subtotal);

    if (subtotalValidationError) {
      toast.warning(subtotalValidationError);
      return;
    }

    if (Number(expenseRow.subtotal) === subtotal) {
      return;
    }

    const nextRows = normalizeEditableRows(
      formState.month,
      formState.rows.map((row) =>
        row.id === expenseId
          ? {
              ...row,
              subtotal: formatEditableNumber(subtotal),
            }
          : row,
      ),
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Actualizando subtotal...",
      success: "Subtotal actualizado.",
    });

    if (!wasSaved) {
      toast.error("No pudimos actualizar el subtotal.");
    }
  };

  const handleUpdateExpenseOccurrencesPerMonth = async ({
    expenseId,
    occurrencesPerMonth,
  }: {
    expenseId: string;
    occurrencesPerMonth: number;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar pagos por mes.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const occurrencesValidationError =
      validateOccurrencesPerMonth(occurrencesPerMonth);

    if (occurrencesValidationError) {
      toast.warning(occurrencesValidationError);
      return;
    }

    const currentCoveredPayments =
      getNormalizedManualCoveredPayments(expenseRow) +
      getCoveredPaymentsByReceipts(expenseRow);

    if (occurrencesPerMonth < currentCoveredPayments) {
      toast.warning(
        "La frecuencia no puede ser menor a los pagos ya cubiertos por manuales y comprobantes.",
      );
      return;
    }

    if (Number(expenseRow.occurrencesPerMonth) === occurrencesPerMonth) {
      return;
    }

    const nextRows = normalizeEditableRows(
      formState.month,
      formState.rows.map((row) =>
        row.id === expenseId
          ? {
              ...row,
              occurrencesPerMonth: formatEditableNumber(occurrencesPerMonth),
            }
          : row,
      ),
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Actualizando pagos por mes...",
      success: "Pagos por mes actualizados.",
    });

    if (!wasSaved) {
      toast.error("No pudimos actualizar pagos por mes.");
    }
  };

  const handleUpdateExpenseReceiptShare = async ({
    expenseId,
    receiptShareMessage,
    receiptSharePhoneDigits,
  }: {
    expenseId: string;
    receiptShareMessage: string;
    receiptSharePhoneDigits: string;
  }) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para actualizar datos de envío.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const normalizedPhoneDigits = normalizeReceiptSharePhoneDigits(
      receiptSharePhoneDigits,
    );

    const receiptSharePhoneValidationError =
      validateReceiptSharePhoneDigits(normalizedPhoneDigits);

    if (receiptSharePhoneValidationError) {
      toast.warning(receiptSharePhoneValidationError);
      return;
    }

    const normalizedReceiptShareMessage = normalizeReceiptShareMessage(
      receiptShareMessage,
    );
    const hasKnownStatus = isReceiptShareStatus(expenseRow.receiptShareStatus);

    if (
      expenseRow.requiresReceiptShare &&
      expenseRow.receiptSharePhoneDigits === normalizedPhoneDigits &&
      normalizeReceiptShareMessage(expenseRow.receiptShareMessage) ===
        normalizedReceiptShareMessage
    ) {
      return;
    }

    const nextRows = normalizeEditableRows(
      formState.month,
      formState.rows.map((row) =>
        row.id === expenseId
          ? {
              ...row,
              receiptShareMessage: normalizedReceiptShareMessage,
              receiptSharePhoneDigits: normalizedPhoneDigits,
              receiptShareStatus: hasKnownStatus ? row.receiptShareStatus : "pending",
              requiresReceiptShare: true,
            }
          : row,
      ),
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Actualizando datos de envío...",
      success: "Datos de envío actualizados.",
    });

    if (!wasSaved) {
      toast.error("No pudimos actualizar los datos de envío.");
    }
  };

  const handleDeleteExpenseReceiptShare = async (expenseId: string) => {
    if (!isOAuthConfigured || !isAuthenticated) {
      toast.warning("Conectate con Google para eliminar datos de envío.");
      return;
    }

    const expenseRow = formState.rows.find((row) => row.id === expenseId);

    if (!expenseRow) {
      toast.warning("No pudimos encontrar el gasto seleccionado.");
      return;
    }

    const hasReceiptShareData =
      expenseRow.requiresReceiptShare ||
      expenseRow.receiptSharePhoneDigits.trim().length > 0 ||
      normalizeReceiptShareMessage(expenseRow.receiptShareMessage) !== null;

    if (!hasReceiptShareData) {
      return;
    }

    const nextRows = normalizeEditableRows(
      formState.month,
      formState.rows.map((row) =>
        row.id === expenseId
          ? {
              ...row,
              receiptShareMessage: "",
              receiptSharePhoneDigits: "",
              receiptShareStatus: "",
              requiresReceiptShare: false,
            }
          : row,
      ),
    );

    const wasSaved = await persistMonthlyExpensesRows(nextRows, {
      loading: "Eliminando datos de envío...",
      success: "Datos de envío eliminados.",
    });

    if (!wasSaved) {
      toast.error("No pudimos eliminar los datos de envío.");
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
                isMonthTransitionPending={isMonthTransitionPending}
                isSubmitting={formState.isSubmitting}
                lenders={lendersState.lenders}
                loadError={currentLoadError}
                month={formState.month}
                pendingMonth={pendingMonth}
                onAddExpense={handleAddExpense}
                onAddLender={handleOpenLenderCreateFromExpenseSheet}
                onCopyFromMonth={handleCopyFromMonth}
                onCopySourceMonthChange={handleCopySourceMonthChange}
                onDeleteAllReceiptsFolderReference={handleDeleteAllReceiptsFolderReference}
                onDeleteExpense={handleRemoveExpense}
                onDeleteExpenseReceiptShare={handleDeleteExpenseReceiptShare}
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
                onRegisterPaymentRecord={handleRegisterPaymentRecord}
                onDeleteManualPaymentRecord={handleDeleteManualPaymentRecord}
                onEditManualPaymentRecord={handleOpenManualPaymentRecordEditor}
                onUpdatePaymentLink={handleUpdatePaymentLink}
                onUpdateExpenseOccurrencesPerMonth={handleUpdateExpenseOccurrencesPerMonth}
                onUpdateExpenseReceiptShare={handleUpdateExpenseReceiptShare}
                onUpdateExpenseSubtotal={handleUpdateExpenseSubtotal}
                onUpdateReceiptShareStatus={handleUpdateReceiptShareStatus}
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
          canManageReceipt={expenseReceiptCoverageEditState.canManageReceipt}
          currentCoveredPayments={expenseReceiptCoverageEditState.currentCoveredPayments}
          errorMessage={expenseReceiptCoverageEditState.error}
          expenseDescription={expenseReceiptCoverageEditState.expenseDescription}
          isOpen={expenseReceiptCoverageEditState.isOpen}
          isSubmitting={expenseReceiptCoverageEditState.isSubmitting}
          maxCoveredPayments={expenseReceiptCoverageEditState.maxCoveredPayments}
          onClose={handleCloseReceiptCoverageEditor}
          onDeleteReceipt={handleDeleteReceiptFromCoverageEditor}
          onSave={handleSaveReceiptCoverage}
          receiptFileName={expenseReceiptCoverageEditState.receiptFileName}
          receiptFileViewUrl={expenseReceiptCoverageEditState.receiptFileViewUrl}
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
