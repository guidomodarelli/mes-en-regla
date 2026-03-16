import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CircleX,
  ExternalLink,
  Link2,
  Paperclip,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { ExpenseRowActions } from "@/components/monthly-expenses/expense-row-actions";
import {
  ExpenseSheet,
  type ExpenseEditableFieldName,
} from "@/components/monthly-expenses/expense-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Highlighter } from "@/components/ui/highlighter";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import {
  compareFuzzyMatchRank,
  getFuzzyMatchIndices,
  getFuzzyMatchRank,
  renderHighlightedText,
} from "./fuzzy-search";
import { LoanInfoPopover } from "./loan-info-popover";
import type { LenderOption } from "./lender-picker";
import {
  getValidPaymentLink as getValidPaymentLinkUrl,
  PAYMENT_LINK_VALIDATION_ERROR_MESSAGE,
} from "./payment-link";
import styles from "./monthly-expenses-table.module.scss";

type MonthlyExpenseCurrency = "ARS" | "USD";
const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
type LoanSortMode = "paidInstallments" | "remainingInstallments" | "totalInstallments";
const DEFAULT_LOAN_SORT_MODE: LoanSortMode = "paidInstallments";
const LOAN_SORT_COLUMN_ID = "loanProgress";
const LOAN_INSTALLMENT_START_COLUMN_ID = "loanInstallmentStart";
const LOAN_INSTALLMENT_END_COLUMN_ID = "loanInstallmentEnd";
const MONTHLY_EXPENSES_TABLE_PREFERENCES_STORAGE_KEY =
  "mis-finanzas.monthly-expenses.table-preferences";
const SORTABLE_COLUMN_IDS = new Set([
  "description",
  "paymentsProgress",
  "manualCoveredPaymentsWithoutReceipt",
  "currency",
  "subtotal",
  "occurrencesPerMonth",
  "total",
  "ars",
  "usd",
  "paymentLink",
  "receiptFileUrl",
  "receiptFolderUrl",
  "allReceiptsFolderUrl",
  LOAN_SORT_COLUMN_ID,
  "lenderName",
  LOAN_INSTALLMENT_START_COLUMN_ID,
  LOAN_INSTALLMENT_END_COLUMN_ID,
]);
const PERSISTABLE_COLUMN_VISIBILITY_IDS = new Set([
  "paymentsProgress",
  "manualCoveredPaymentsWithoutReceipt",
  "currency",
  "subtotal",
  "occurrencesPerMonth",
  "total",
  "ars",
  "usd",
  "paymentLink",
  "receiptFileUrl",
  "receiptFolderUrl",
  "allReceiptsFolderUrl",
  LOAN_SORT_COLUMN_ID,
  "lenderName",
  LOAN_INSTALLMENT_START_COLUMN_ID,
  LOAN_INSTALLMENT_END_COLUMN_ID,
]);
const LOAN_SORT_OPTIONS: Array<{ label: string; value: LoanSortMode }> = [
  {
    label: "Cuotas pagadas",
    value: "paidInstallments",
  },
  {
    label: "Cuotas restantes",
    value: "remainingInstallments",
  },
  {
    label: "Total de cuotas",
    value: "totalInstallments",
  },
];
const LOAN_SORT_DIRECTION_OPTIONS: Array<{
  label: string;
  value: "asc" | "desc";
}> = [
  {
    label: "Ascendente",
    value: "asc",
  },
  {
    label: "Descendente",
    value: "desc",
  },
];

function buildLoanSortingState(direction: "asc" | "desc"): SortingState {
  return [
    {
      desc: direction === "desc",
      id: LOAN_SORT_COLUMN_ID,
    },
  ];
}

interface MonthlyExpensesTablePreferences {
  columnVisibility: VisibilityState;
  loanSortMode: LoanSortMode;
  sorting: SortingState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePersistedLoanSortMode(value: unknown): LoanSortMode | null {
  if (
    value !== "paidInstallments" &&
    value !== "remainingInstallments" &&
    value !== "totalInstallments"
  ) {
    return null;
  }

  return value;
}

function parsePersistedSorting(value: unknown): SortingState | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsedSorting: SortingState = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const id = entry.id;
    const desc = entry.desc;

    if (
      typeof id !== "string" ||
      typeof desc !== "boolean" ||
      !SORTABLE_COLUMN_IDS.has(id)
    ) {
      continue;
    }

    parsedSorting.push({
      desc,
      id,
    });
  }

  return parsedSorting;
}

function parsePersistedColumnVisibility(value: unknown): VisibilityState | null {
  if (!isRecord(value)) {
    return null;
  }

  const parsedColumnVisibility: VisibilityState = {};

  for (const [columnId, isVisible] of Object.entries(value)) {
    if (
      !PERSISTABLE_COLUMN_VISIBILITY_IDS.has(columnId) ||
      typeof isVisible !== "boolean"
    ) {
      continue;
    }

    parsedColumnVisibility[columnId] = isVisible;
  }

  return parsedColumnVisibility;
}

function getPersistedMonthlyExpensesTablePreferences(): MonthlyExpensesTablePreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const serializedPreferences = window.localStorage.getItem(
      MONTHLY_EXPENSES_TABLE_PREFERENCES_STORAGE_KEY,
    );

    if (!serializedPreferences) {
      return null;
    }

    const parsedPreferences = JSON.parse(serializedPreferences);

    if (!isRecord(parsedPreferences)) {
      return null;
    }

    const loanSortMode =
      parsePersistedLoanSortMode(parsedPreferences.loanSortMode) ??
      DEFAULT_LOAN_SORT_MODE;
    const sorting = parsePersistedSorting(parsedPreferences.sorting) ?? [];
    const columnVisibility =
      parsePersistedColumnVisibility(parsedPreferences.columnVisibility) ?? {};

    return {
      columnVisibility,
      loanSortMode,
      sorting,
    };
  } catch {
    return null;
  }
}

function persistMonthlyExpensesTablePreferences(
  preferences: MonthlyExpensesTablePreferences,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      MONTHLY_EXPENSES_TABLE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Ignore storage failures (private mode, disabled storage, etc.)
  }
}

interface LoanSortColumnHeaderProps {
  column: {
    getCanSort: () => boolean;
    getIsSorted: () => false | "asc" | "desc";
  };
  loanSortMode: LoanSortMode;
  onApplyLoanSort: (args: {
    direction: "asc" | "desc";
    mode: LoanSortMode;
  }) => void;
}

interface ReceiptDeleteConfirmButtonProps {
  actionDisabled: boolean;
  onConfirm: () => void;
  receiptFileName: string;
}

function ReceiptDeleteConfirmButton({
  actionDisabled,
  onConfirm,
  receiptFileName,
}: ReceiptDeleteConfirmButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Eliminar comprobante ${receiptFileName}`}
          className={styles.receiptDeleteButton}
          disabled={actionDisabled}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={styles.receiptDeleteConfirmPopover}>
        <p className={styles.receiptDeleteConfirmMessage}>
          ¿Querés eliminar este comprobante?
        </p>
        <div className={styles.receiptDeleteConfirmActions}>
          <Button
            onClick={() => setIsOpen(false)}
            size="sm"
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button
            aria-label={`Confirmar eliminación de comprobante ${receiptFileName}`}
            onClick={() => {
              setIsOpen(false);
              onConfirm();
            }}
            size="sm"
            type="button"
            variant="destructive"
          >
            Eliminar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LoanSortColumnHeader({
  column,
  loanSortMode,
  onApplyLoanSort,
}: LoanSortColumnHeaderProps) {
  const canSort = column.getCanSort();
  const currentSortDirection = column.getIsSorted() === "desc" ? "desc" : "asc";
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [draftLoanSortMode, setDraftLoanSortMode] =
    useState<LoanSortMode>(loanSortMode);
  const [draftLoanSortDirection, setDraftLoanSortDirection] = useState<
    "asc" | "desc"
  >(currentSortDirection);

  function handlePopoverOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftLoanSortMode(loanSortMode);
      setDraftLoanSortDirection(currentSortDirection);
    }

    setIsPopoverOpen(nextOpen);
  }

  if (!canSort) {
    return <span className={styles.headLabel}>Deuda / cuotas</span>;
  }

  return (
    <div className={styles.loanSortHeader}>
      <Popover onOpenChange={handlePopoverOpenChange} open={isPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label="Ordenar Deuda / cuotas"
            className={styles.headButton}
            size="sm"
            type="button"
            variant="ghost"
          >
            Deuda / cuotas
            <ArrowUpDown aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className={styles.loanSortPopover}>
          <p className={styles.loanSortPopoverTitle}>Criterio</p>

          <RadioGroup
            aria-label="Criterio de orden para Deuda / cuotas"
            className={styles.loanSortOptions}
            onValueChange={(value) => setDraftLoanSortMode(value as LoanSortMode)}
            value={draftLoanSortMode}
          >
            {LOAN_SORT_OPTIONS.map((option) => {
              const radioId = `loan-sort-mode-${option.value}`;

              return (
                <div className={styles.loanSortOption} key={option.value}>
                  <RadioGroupItem
                    aria-label={option.label}
                    id={radioId}
                    value={option.value}
                  />
                  <Label className={styles.loanSortOptionLabel} htmlFor={radioId}>
                    {option.label}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>

          <p className={styles.loanSortPopoverTitle}>Dirección</p>

          <RadioGroup
            aria-label="Dirección de orden para Deuda / cuotas"
            className={styles.loanSortOptions}
            onValueChange={(value) =>
              setDraftLoanSortDirection(value as "asc" | "desc")
            }
            value={draftLoanSortDirection}
          >
            {LOAN_SORT_DIRECTION_OPTIONS.map((option) => {
              const radioId = `loan-sort-direction-${option.value}`;

              return (
                <div className={styles.loanSortOption} key={option.value}>
                  <RadioGroupItem
                    aria-label={option.label}
                    id={radioId}
                    value={option.value}
                  />
                  <Label className={styles.loanSortOptionLabel} htmlFor={radioId}>
                    {option.label}
                  </Label>
                </div>
              );
            })}
          </RadioGroup>

          <p className={styles.loanSortHint}>Los cambios se aplican al presionar Aplicar.</p>

          <div className={styles.loanSortActions}>
            <Button
              className={styles.loanSortDiscardButton}
              onClick={() => {
                setIsPopoverOpen(false);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Descartar
            </Button>
            <Button
              className={styles.loanSortApplyButton}
              onClick={() => {
                onApplyLoanSort({
                  direction: draftLoanSortDirection,
                  mode: draftLoanSortMode,
                });
                setIsPopoverOpen(false);
              }}
              size="sm"
              type="button"
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export interface MonthlyExpensesEditableRow {
  allReceiptsFolderId: string;
  allReceiptsFolderStatus?: MonthlyExpenseDriveResourceStatus;
  allReceiptsFolderViewUrl: string;
  currency: MonthlyExpenseCurrency;
  description: string;
  id: string;
  installmentCount: string;
  isLoan: boolean;
  lenderId: string;
  lenderName: string;
  loanEndMonth: string;
  loanPaidInstallments: number | null;
  loanProgress: string;
  loanRemainingInstallments: number | null;
  loanTotalInstallments: number | null;
  manualCoveredPayments: string;
  occurrencesPerMonth: string;
  paymentLink: string;
  receipts: MonthlyExpensesEditableReceipt[];
  monthlyFolderId: string;
  monthlyFolderStatus?: MonthlyExpenseDriveResourceStatus;
  monthlyFolderViewUrl: string;
  startMonth: string;
  subtotal: string;
  total: string;
}

export type MonthlyExpenseDriveResourceStatus =
  | "normal"
  | "trashed"
  | "missing";

export interface MonthlyExpensesEditableReceipt {
  allReceiptsFolderId: string;
  allReceiptsFolderStatus?: MonthlyExpenseDriveResourceStatus;
  allReceiptsFolderViewUrl: string;
  coveredPayments: number;
  fileId: string;
  fileName: string;
  fileStatus?: MonthlyExpenseDriveResourceStatus;
  fileViewUrl: string;
  monthlyFolderId: string;
  monthlyFolderStatus?: MonthlyExpenseDriveResourceStatus;
  monthlyFolderViewUrl: string;
}

interface MonthlyExpensesTableProps {
  actionDisabled: boolean;
  changedFields: Set<string>;
  copySourceMonth: string | null;
  copySourceMonthOptions: Array<{
    label: string;
    value: string;
  }>;
  draft: MonthlyExpensesEditableRow | null;
  exchangeRateLoadError: string | null;
  exchangeRateSnapshot: {
    blueRate: number;
    month: string;
    officialRate: number;
    solidarityRate: number;
  } | null;
  feedbackMessage: string;
  feedbackTone: "default" | "error" | "success";
  isCopyFromDisabled: boolean;
  isExpenseSheetOpen: boolean;
  isSubmitting: boolean;
  lenders: LenderOption[];
  loadError: string | null;
  month: string;
  onAddExpense: () => void;
  onAddLender: () => void;
  onCopyFromMonth: () => void;
  onCopySourceMonthChange: (value: string) => void;
  onDeleteAllReceiptsFolderReference: (expenseId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onDeletePaymentLink: (expenseId: string) => void | Promise<void>;
  onDeleteMonthlyFolderReference: (expenseId: string) => void;
  onEditExpense: (expenseId: string) => void;
  onExpenseFieldChange: (
    fieldName: ExpenseEditableFieldName,
    value: string,
  ) => void;
  onExpenseLenderSelect: (lenderId: string | null) => void;
  onExpenseLoanToggle: (checked: boolean) => void;
  onMonthChange: (value: string) => void;
  onDeleteReceipt: (args: {
    expenseId: string;
    receiptFileId: string;
  }) => void;
  onEditReceiptCoverage: (args: {
    expenseId: string;
    receiptFileId: string;
  }) => void;
  onUpdateManualCoveredPayments: (args: {
    expenseId: string;
    manualCoveredPayments: number;
  }) => void;
  onUpdatePaymentLink: (args: {
    expenseId: string;
    paymentLink: string;
  }) => void | Promise<void>;
  onUploadReceipt: (expenseId: string) => void;
  onRequestCloseExpenseSheet: () => void;
  onSaveExpense: () => void;
  onSaveUnsavedChanges: () => void;
  onUnsavedChangesClose: () => void;
  onUnsavedChangesDiscard: () => void;
  rows: MonthlyExpensesEditableRow[];
  sheetMode: "create" | "edit";
  showCopyFromControls: boolean;
  showUnsavedChangesDialog: boolean;
  validationMessage: string | null;
}

interface PaymentLinkDialogState {
  expenseDescription: string;
  expenseId: string;
  mode: "create" | "edit";
}

function getSortableHeader(label: string) {
  return function SortableHeader({
    column,
  }: {
    column: {
      getCanSort: () => boolean;
      getIsSorted: () => false | "asc" | "desc";
      toggleSorting: (desc?: boolean) => void;
    };
  }) {
    if (!column.getCanSort()) {
      return <span className={styles.headLabel}>{label}</span>;
    }

    return (
      <Button
        className={styles.headButton}
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        size="sm"
        type="button"
        variant="ghost"
      >
        {label}
        <ArrowUpDown aria-hidden="true" />
      </Button>
    );
  };
}

function getLoanSortDirection(sorting: SortingState): "asc" | "desc" {
  const loanSortEntry = sorting.find((entry) => entry.id === LOAN_SORT_COLUMN_ID);

  if (!loanSortEntry) {
    return "asc";
  }

  return loanSortEntry.desc ? "desc" : "asc";
}

function getColumnSortDirection(
  sorting: SortingState,
  columnId: string,
): "asc" | "desc" {
  const sortEntry = sorting.find((entry) => entry.id === columnId);

  if (!sortEntry) {
    return "asc";
  }

  return sortEntry.desc ? "desc" : "asc";
}

function parseYearMonth(value: string): { month: string; year: string } | null {
  const normalizedValue = value.trim();
  const match = YEAR_MONTH_PATTERN.exec(normalizedValue);

  if (!match) {
    return null;
  }

  const [, year, month] = match;

  return {
    month,
    year,
  };
}

function formatYearMonth(value: string): string {
  const parsedValue = parseYearMonth(value);

  if (!parsedValue) {
    return "-";
  }

  return `${parsedValue.month}/${parsedValue.year}`;
}

function getYearMonthSortValue(value: string): number | null {
  const parsedValue = parseYearMonth(value);

  if (!parsedValue) {
    return null;
  }

  return Number(`${parsedValue.year}${parsedValue.month}`);
}

function getLoanSortValue(
  row: MonthlyExpensesEditableRow,
  loanSortMode: LoanSortMode,
): number | null {
  switch (loanSortMode) {
    case "paidInstallments":
      return row.loanPaidInstallments;
    case "remainingInstallments":
      return row.loanRemainingInstallments;
    case "totalInstallments":
      return row.loanTotalInstallments;
  }
}

function compareDescriptionByFuzzyRank(
  leftDescription: string,
  rightDescription: string,
  query: string,
): number {
  const leftRank = getFuzzyMatchRank(leftDescription, query);
  const rightRank = getFuzzyMatchRank(rightDescription, query);

  if (leftRank && !rightRank) {
    return -1;
  }

  if (!leftRank && rightRank) {
    return 1;
  }

  if (!leftRank && !rightRank) {
    return leftDescription.localeCompare(rightDescription, "es", {
      sensitivity: "base",
    });
  }

  if (!leftRank || !rightRank) {
    return leftDescription.localeCompare(rightDescription, "es", {
      sensitivity: "base",
    });
  }

  const rankComparison = compareFuzzyMatchRank(leftRank, rightRank);

  if (rankComparison !== 0) {
    return rankComparison;
  }

  if (leftDescription.length !== rightDescription.length) {
    return leftDescription.length - rightDescription.length;
  }

  return leftDescription.localeCompare(rightDescription, "es", {
    sensitivity: "base",
  });
}

function formatCurrencyAmount(
  currency: MonthlyExpenseCurrency,
  value: string,
): string {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
  }

  if (currency === "ARS") {
    return `$ ${new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(numericValue)}`;
  }

  const [, decimalPart = ""] = value.split(".");
  const normalizedDecimalPart = decimalPart.slice(0, 2);
  const minimumFractionDigits =
    normalizedDecimalPart.length === 0 || /^0+$/.test(normalizedDecimalPart)
      ? 0
      : normalizedDecimalPart.length;
  const prefix = currency === "USD" ? "US$" : "$";

  return `${prefix} ${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: Math.max(minimumFractionDigits, 0),
    minimumFractionDigits,
  }).format(numericValue)}`;
}

function formatConvertedAmount(
  currency: MonthlyExpenseCurrency,
  value: number | null,
): string {
  if (value == null) {
    return "-";
  }

  if (currency === "ARS") {
    return `$ ${new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(value)}`;
  }

  return formatCurrencyAmount(currency, value.toFixed(2));
}

function formatExchangeRateAmount(value: number): string {
  return `$ ${new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value)}`;
}

function getConvertedAmountForCurrency({
  currency,
  exchangeRateSnapshot,
  rowCurrency,
  total,
}: {
  currency: MonthlyExpenseCurrency;
  exchangeRateSnapshot: MonthlyExpensesTableProps["exchangeRateSnapshot"];
  rowCurrency: MonthlyExpenseCurrency;
  total: number;
}): number | null {
  if (!exchangeRateSnapshot || !Number.isFinite(total)) {
    return null;
  }

  if (currency === "ARS") {
    return rowCurrency === "ARS"
      ? total
      : total * exchangeRateSnapshot.solidarityRate;
  }

  return rowCurrency === "USD"
    ? total
    : total / exchangeRateSnapshot.solidarityRate;
}

function getConvertedTotalAmount({
  currency,
  exchangeRateSnapshot,
  rows,
}: {
  currency: MonthlyExpenseCurrency;
  exchangeRateSnapshot: MonthlyExpensesTableProps["exchangeRateSnapshot"];
  rows: MonthlyExpensesEditableRow[];
}): number | null {
  let total = 0;
  let hasValues = false;

  for (const row of rows) {
    const convertedAmount = getConvertedAmountForCurrency({
      currency,
      exchangeRateSnapshot,
      rowCurrency: row.currency,
      total: Number(row.total),
    });

    if (convertedAmount == null) {
      continue;
    }

    total += convertedAmount;
    hasValues = true;
  }

  return hasValues ? total : null;
}

function parseNonNegativeInteger(value: string): number {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return 0;
  }

  return numericValue;
}

function parsePositiveInteger(value: string): number {
  const numericValue = Number(value);

  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return 0;
  }

  return numericValue;
}

function clampManualCoveredPaymentsValue({
  fallbackValue,
  maxManualCoveredPayments,
  value,
}: {
  fallbackValue: number;
  maxManualCoveredPayments: number;
  value: string;
}): number {
  const parsedValue = Number(value.replace(/[^\d]/g, ""));

  if (!Number.isInteger(parsedValue)) {
    return fallbackValue;
  }

  return Math.min(Math.max(parsedValue, 0), maxManualCoveredPayments);
}

function getCoveredPaymentsByReceipts(receipts: MonthlyExpensesEditableReceipt[]): number {
  return receipts.reduce(
    (coveredPayments, receipt) => coveredPayments + receipt.coveredPayments,
    0,
  );
}

function getPaymentProgress(row: MonthlyExpensesEditableRow): {
  coveredPayments: number;
  coveredPaymentsByReceipts: number;
  requiredPayments: number;
} {
  const requiredPayments = parsePositiveInteger(row.occurrencesPerMonth);
  const manualCoveredPayments = parseNonNegativeInteger(
    row.manualCoveredPayments,
  );
  const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(row.receipts);

  return {
    coveredPayments: manualCoveredPayments + coveredPaymentsByReceipts,
    coveredPaymentsByReceipts,
    requiredPayments,
  };
}

function getValidHttpUrl(value: string): string | null {
  return getValidPaymentLinkUrl(value);
}

function getDriveStatusMessage(
  status: MonthlyExpenseDriveResourceStatus | undefined,
): string | null {
  if (status === "trashed") {
    return "Este recurso está en la papelera de Drive.";
  }

  if (status === "missing") {
    return "Este recurso fue eliminado en Drive.";
  }

  return null;
}

function isBrokenDriveStatus(
  status: MonthlyExpenseDriveResourceStatus | undefined,
): boolean {
  return status === "trashed" || status === "missing";
}

function DriveStatusBadge({
  status,
}: {
  status: MonthlyExpenseDriveResourceStatus | undefined;
}) {
  const message = getDriveStatusMessage(status);

  if (!message || !status) {
    return null;
  }

  const icon = status === "trashed"
    ? <AlertTriangle aria-hidden="true" className={styles.driveStatusWarning} />
    : <CircleX aria-hidden="true" className={styles.driveStatusError} />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={styles.driveStatusBadge}>{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}

function ManualCoveredPaymentsCell({
  actionDisabled,
  expenseDescription,
  expenseId,
  maxManualCoveredPayments,
  normalizedManualCoveredPayments,
  onUpdateManualCoveredPayments,
}: {
  actionDisabled: boolean;
  expenseDescription: string;
  expenseId: string;
  maxManualCoveredPayments: number;
  normalizedManualCoveredPayments: number;
  onUpdateManualCoveredPayments: (args: {
    expenseId: string;
    manualCoveredPayments: number;
  }) => void;
}) {
  const [draftManualCoveredPayments, setDraftManualCoveredPayments] =
    useState(String(normalizedManualCoveredPayments));
  const manualPaymentsHintId = `manual-covered-payments-hint-${expenseId}`;
  const clampedDraftManualCoveredPayments = clampManualCoveredPaymentsValue({
    fallbackValue: normalizedManualCoveredPayments,
    maxManualCoveredPayments,
    value: draftManualCoveredPayments,
  });
  const hasDraftChanges =
    clampedDraftManualCoveredPayments !== normalizedManualCoveredPayments;

  const handleConfirmChanges = () => {
    setDraftManualCoveredPayments(String(clampedDraftManualCoveredPayments));

    if (!hasDraftChanges || actionDisabled) {
      return;
    }

    onUpdateManualCoveredPayments({
      expenseId,
      manualCoveredPayments: clampedDraftManualCoveredPayments,
    });
  };

  return (
    <div className={styles.manualPaymentsCell}>
      <div className={styles.manualPaymentsControls}>
        <Input
          aria-describedby={manualPaymentsHintId}
          aria-label={`Pagos sin comprobante de ${expenseDescription}`}
          className={styles.manualPaymentsInput}
          disabled={actionDisabled}
          inputMode="numeric"
          max={maxManualCoveredPayments}
          min={0}
          onBlur={() => {
            setDraftManualCoveredPayments(String(clampedDraftManualCoveredPayments));
          }}
          onChange={(event) => {
            setDraftManualCoveredPayments(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") {
              return;
            }

            event.preventDefault();
            handleConfirmChanges();
          }}
          type="number"
          value={draftManualCoveredPayments}
        />
        <div className={styles.manualPaymentsActions}>
          <Button
            aria-label={`Descartar cambios de pagos sin comprobante de ${expenseDescription}`}
            disabled={actionDisabled || !hasDraftChanges}
            onClick={() => {
              setDraftManualCoveredPayments(String(normalizedManualCoveredPayments));
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
          <Button
            aria-label={`Confirmar pagos sin comprobante de ${expenseDescription}`}
            disabled={actionDisabled || !hasDraftChanges}
            onClick={handleConfirmChanges}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Check aria-hidden="true" />
          </Button>
        </div>
      </div>
      <span className={styles.manualPaymentsHint} id={manualPaymentsHintId}>
        0 a {maxManualCoveredPayments}
      </span>
    </div>
  );
}

export function MonthlyExpensesTable({
  actionDisabled,
  changedFields,
  copySourceMonth,
  copySourceMonthOptions,
  draft,
  exchangeRateLoadError,
  exchangeRateSnapshot,
  feedbackMessage,
  feedbackTone,
  isCopyFromDisabled,
  isExpenseSheetOpen,
  isSubmitting,
  lenders,
  loadError,
  month,
  onAddExpense,
  onAddLender,
  onCopyFromMonth,
  onCopySourceMonthChange,
  onDeleteAllReceiptsFolderReference,
  onDeleteExpense,
  onDeletePaymentLink,
  onDeleteMonthlyFolderReference,
  onEditExpense,
  onExpenseFieldChange,
  onExpenseLenderSelect,
  onExpenseLoanToggle,
  onDeleteReceipt,
  onEditReceiptCoverage,
  onUpdateManualCoveredPayments,
  onUpdatePaymentLink,
  onMonthChange,
  onUploadReceipt,
  onRequestCloseExpenseSheet,
  onSaveExpense,
  onSaveUnsavedChanges,
  onUnsavedChangesClose,
  onUnsavedChangesDiscard,
  rows,
  sheetMode,
  showCopyFromControls,
  showUnsavedChangesDialog,
  validationMessage,
}: MonthlyExpensesTableProps) {
  const hasSkippedInitialPersistence = useRef(false);
  const [loanSortMode, setLoanSortMode] =
    useState<LoanSortMode>(DEFAULT_LOAN_SORT_MODE);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [isRestoringTablePreferences, setIsRestoringTablePreferences] =
    useState(true);
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [paymentLinkDialogState, setPaymentLinkDialogState] =
    useState<PaymentLinkDialogState | null>(null);
  const [paymentLinkDraftValue, setPaymentLinkDraftValue] = useState("");
  const [paymentLinkDraftError, setPaymentLinkDraftError] =
    useState<string | null>(null);

  useEffect(() => {
    const persistedPreferences = getPersistedMonthlyExpensesTablePreferences();

    const restoreFrameId = window.requestAnimationFrame(() => {
      if (persistedPreferences) {
        setLoanSortMode(persistedPreferences.loanSortMode);
        setSorting(persistedPreferences.sorting);
        setColumnVisibility(persistedPreferences.columnVisibility);
      }

      setIsRestoringTablePreferences(false);
    });

    return () => {
      window.cancelAnimationFrame(restoreFrameId);
    };
  }, []);

  useEffect(() => {
    if (!hasSkippedInitialPersistence.current) {
      hasSkippedInitialPersistence.current = true;
      return;
    }

    persistMonthlyExpensesTablePreferences({
      columnVisibility,
      loanSortMode,
      sorting,
    });
  }, [columnVisibility, loanSortMode, sorting]);

  const loanSortDirection = getLoanSortDirection(sorting);
  const loanInstallmentStartSortDirection = getColumnSortDirection(
    sorting,
    LOAN_INSTALLMENT_START_COLUMN_ID,
  );
  const loanInstallmentEndSortDirection = getColumnSortDirection(
    sorting,
    LOAN_INSTALLMENT_END_COLUMN_ID,
  );
  const fuzzySortedRows = useMemo(() => {
    const normalizedFilter = descriptionFilter.trim();

    if (!normalizedFilter) {
      return rows;
    }

    return [...rows].sort((leftRow, rightRow) =>
      compareDescriptionByFuzzyRank(
        leftRow.description,
        rightRow.description,
        normalizedFilter,
      ));
  }, [descriptionFilter, rows]);

  const handleOpenPaymentLinkDialog = useCallback(({
    expenseDescription,
    expenseId,
    mode,
    paymentLink,
  }: {
    expenseDescription: string;
    expenseId: string;
    mode: "create" | "edit";
    paymentLink: string;
  }) => {
    setPaymentLinkDialogState({
      expenseDescription,
      expenseId,
      mode,
    });
    setPaymentLinkDraftValue(paymentLink);
    setPaymentLinkDraftError(null);
  }, []);

  const handleClosePaymentLinkDialog = () => {
    setPaymentLinkDialogState(null);
    setPaymentLinkDraftValue("");
    setPaymentLinkDraftError(null);
  };

  const handleSavePaymentLink = async () => {
    if (!paymentLinkDialogState) {
      return;
    }

    const normalizedPaymentLink = getValidPaymentLinkUrl(paymentLinkDraftValue);

    if (!normalizedPaymentLink) {
      setPaymentLinkDraftError(PAYMENT_LINK_VALIDATION_ERROR_MESSAGE);
      return;
    }

    setPaymentLinkDraftError(null);
    await onUpdatePaymentLink({
      expenseId: paymentLinkDialogState.expenseId,
      paymentLink: normalizedPaymentLink,
    });
    handleClosePaymentLinkDialog();
  };

  const columns = useMemo<ColumnDef<MonthlyExpensesEditableRow>[]>(
    () => [
      {
        accessorKey: "description",
        cell: ({ row, table }) => {
          const description = row.original.description;

          if (!description) {
            return "Sin descripción";
          }

          const filterValue = String(
            table.getColumn("description")?.getFilterValue() ?? "",
          );
          const matchIndices = getFuzzyMatchIndices(description, filterValue);

          if (!matchIndices || matchIndices.length === 0) {
            return description;
          }

          return renderHighlightedText(
            description,
            matchIndices,
            styles.descriptionHighlight,
            "description",
          );
        },
        enableHiding: false,
        filterFn: (row, columnId, filterValue) => {
          const description = String(row.getValue(columnId) ?? "");
          const query = String(filterValue ?? "");

          return getFuzzyMatchIndices(description, query) !== null;
        },
        header: getSortableHeader("Descripción"),
        meta: {
          cellClassName: styles.stickyDescriptionCell,
          label: "Descripción",
        },
      },
      {
        accessorKey: "currency",
        header: getSortableHeader("Moneda"),
        meta: { label: "Moneda" },
      },
      {
        accessorKey: "subtotal",
        cell: ({ row }) =>
          formatCurrencyAmount(row.original.currency, row.original.subtotal),
        header: getSortableHeader("Subtotal"),
        meta: { label: "Subtotal" },
        sortingFn: (rowA, rowB) =>
          Number(rowA.original.subtotal) - Number(rowB.original.subtotal),
      },
      {
        accessorKey: "occurrencesPerMonth",
        header: getSortableHeader("Veces al mes"),
        meta: { label: "Veces al mes" },
      },
      {
        accessorKey: "total",
        cell: ({ row }) => (
          <span className={styles.totalAmount}>
            {formatCurrencyAmount(row.original.currency, row.original.total)}
          </span>
        ),
        header: getSortableHeader("Total"),
        meta: { label: "Total" },
        sortingFn: (rowA, rowB) =>
          Number(rowA.original.total) - Number(rowB.original.total),
      },
      {
        accessorKey: "ars",
        cell: ({ row }) => {
          const total = Number(row.original.total);
          const arsAmount = getConvertedAmountForCurrency({
            currency: "ARS",
            exchangeRateSnapshot,
            rowCurrency: row.original.currency,
            total,
          });

          return formatConvertedAmount("ARS", arsAmount);
        },
        footer: ({ table }) => {
          const arsTotal = getConvertedTotalAmount({
            currency: "ARS",
            exchangeRateSnapshot,
            rows: table.getFilteredRowModel().rows.map((row) => row.original),
          });

          return (
            <span className={styles.totalFooterValue}>
              {formatConvertedAmount("ARS", arsTotal)}
            </span>
          );
        },
        header: getSortableHeader("ARS"),
        meta: { label: "ARS" },
        sortingFn: (rowA, rowB) => {
          const leftAmount = getConvertedAmountForCurrency({
            currency: "ARS",
            exchangeRateSnapshot,
            rowCurrency: rowA.original.currency,
            total: Number(rowA.original.total),
          });
          const rightAmount = getConvertedAmountForCurrency({
            currency: "ARS",
            exchangeRateSnapshot,
            rowCurrency: rowB.original.currency,
            total: Number(rowB.original.total),
          });

          return (leftAmount ?? Number.NEGATIVE_INFINITY) -
            (rightAmount ?? Number.NEGATIVE_INFINITY);
        },
      },
      {
        accessorKey: "usd",
        cell: ({ row }) => {
          const total = Number(row.original.total);
          const usdAmount = getConvertedAmountForCurrency({
            currency: "USD",
            exchangeRateSnapshot,
            rowCurrency: row.original.currency,
            total,
          });

          return formatConvertedAmount("USD", usdAmount);
        },
        footer: ({ table }) => {
          const usdTotal = getConvertedTotalAmount({
            currency: "USD",
            exchangeRateSnapshot,
            rows: table.getFilteredRowModel().rows.map((row) => row.original),
          });

          return (
            <span className={styles.totalFooterValue}>
              {formatConvertedAmount("USD", usdTotal)}
            </span>
          );
        },
        header: getSortableHeader("USD"),
        meta: { label: "USD" },
        sortingFn: (rowA, rowB) => {
          const leftAmount = getConvertedAmountForCurrency({
            currency: "USD",
            exchangeRateSnapshot,
            rowCurrency: rowA.original.currency,
            total: Number(rowA.original.total),
          });
          const rightAmount = getConvertedAmountForCurrency({
            currency: "USD",
            exchangeRateSnapshot,
            rowCurrency: rowB.original.currency,
            total: Number(rowB.original.total),
          });

          return (leftAmount ?? Number.NEGATIVE_INFINITY) -
            (rightAmount ?? Number.NEGATIVE_INFINITY);
        },
      },
      {
        accessorKey: "paymentLink",
        cell: ({ row }) => {
          const paymentLink = getValidPaymentLinkUrl(row.original.paymentLink);
          const expenseDescription = row.original.description.trim() || "gasto";

          if (!paymentLink) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Agregar link de pago para ${expenseDescription}`}
                    className={styles.paymentLinkActionButton}
                    disabled={actionDisabled}
                    onClick={() =>
                      handleOpenPaymentLinkDialog({
                        expenseDescription,
                        expenseId: row.original.id,
                        mode: "create",
                        paymentLink: row.original.paymentLink,
                      })}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agregar link de pago</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <div className={styles.paymentLinkActionsRow}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    className={styles.paymentLinkAction}
                    href={paymentLink}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Abrir
                    <ExternalLink aria-hidden="true" className={styles.paymentLinkIcon} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Abrir página de pago</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Editar link de pago para ${expenseDescription}`}
                    className={styles.paymentLinkActionButton}
                    disabled={actionDisabled}
                    onClick={() =>
                      handleOpenPaymentLinkDialog({
                        expenseDescription,
                        expenseId: row.original.id,
                        mode: "edit",
                        paymentLink: row.original.paymentLink,
                      })}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Editar link de pago</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Eliminar link de pago para ${expenseDescription}`}
                    className={styles.paymentLinkActionButton}
                    disabled={actionDisabled}
                    onClick={() => {
                      void onDeletePaymentLink(row.original.id);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Eliminar link de pago</TooltipContent>
              </Tooltip>
            </div>
          );
        },
        header: getSortableHeader("Link"),
        meta: { label: "Link" },
        sortingFn: (rowA, rowB) => {
          const leftHasPaymentLink =
            getValidPaymentLinkUrl(rowA.original.paymentLink) != null ? 1 : 0;
          const rightHasPaymentLink =
            getValidPaymentLinkUrl(rowB.original.paymentLink) != null ? 1 : 0;

          return leftHasPaymentLink - rightHasPaymentLink;
        },
      },
      {
        id: "paymentsProgress",
        accessorFn: (row) => {
          const { coveredPayments, requiredPayments } = getPaymentProgress(row);

          return requiredPayments > 0 ? coveredPayments / requiredPayments : 0;
        },
        cell: ({ row }) => {
          const { coveredPayments, requiredPayments } = getPaymentProgress(
            row.original,
          );
          const normalizedCoveredPayments = Math.max(coveredPayments, 0);

          if (coveredPayments >= requiredPayments) {
            return (
              <Badge
                className={cn(
                  styles.paymentProgressBadge,
                  "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
                )}
              >
                {coveredPayments} / {requiredPayments}
              </Badge>
            );
          }

          return (
            <Badge
              className={cn(
                styles.paymentProgressBadge,
                "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
              )}
            >
              {normalizedCoveredPayments} / {requiredPayments}
            </Badge>
          );
        },
        header: getSortableHeader("Pagos"),
        meta: { label: "Pagos" },
        sortingFn: (rowA, rowB) => {
          const leftProgress = getPaymentProgress(rowA.original);
          const rightProgress = getPaymentProgress(rowB.original);

          const leftIsDone =
            leftProgress.requiredPayments > 0 &&
            leftProgress.coveredPayments >= leftProgress.requiredPayments
              ? 1
              : 0;
          const rightIsDone =
            rightProgress.requiredPayments > 0 &&
            rightProgress.coveredPayments >= rightProgress.requiredPayments
              ? 1
              : 0;

          if (leftIsDone !== rightIsDone) {
            return leftIsDone - rightIsDone;
          }

          return leftProgress.coveredPayments - rightProgress.coveredPayments;
        },
      },
      {
        id: "manualCoveredPaymentsWithoutReceipt",
        accessorFn: (row) => {
          const requiredPayments = parsePositiveInteger(row.occurrencesPerMonth);
          const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(
            row.receipts,
          );

          return Math.max(requiredPayments - coveredPaymentsByReceipts, 0);
        },
        cell: ({ row }) => {
          const requiredPayments = parsePositiveInteger(row.original.occurrencesPerMonth);
          const coveredPaymentsByReceipts = getCoveredPaymentsByReceipts(
            row.original.receipts,
          );
          const maxManualCoveredPayments = Math.max(
            requiredPayments - coveredPaymentsByReceipts,
            0,
          );
          const normalizedManualCoveredPayments = Math.min(
            parseNonNegativeInteger(row.original.manualCoveredPayments),
            maxManualCoveredPayments,
          );
          const expenseDescription = row.original.description.trim() || "gasto";

          return (
            <ManualCoveredPaymentsCell
              actionDisabled={actionDisabled}
              expenseDescription={expenseDescription}
              expenseId={row.original.id}
              key={`${row.original.id}-${row.original.manualCoveredPayments}-${maxManualCoveredPayments}`}
              maxManualCoveredPayments={maxManualCoveredPayments}
              normalizedManualCoveredPayments={normalizedManualCoveredPayments}
              onUpdateManualCoveredPayments={onUpdateManualCoveredPayments}
            />
          );
        },
        header: getSortableHeader("Pagos sin comprobante"),
        meta: { label: "Pagos sin comprobante" },
        sortingFn: (rowA, rowB) => {
          const leftValue = parseNonNegativeInteger(
            rowA.original.manualCoveredPayments,
          );
          const rightValue = parseNonNegativeInteger(
            rowB.original.manualCoveredPayments,
          );

          return leftValue - rightValue;
        },
      },
      {
        id: "receiptFileUrl",
        accessorFn: (row) => row.receipts[0]?.fileViewUrl ?? "",
        cell: ({ row }) => {
          const receiptsCount = row.original.receipts.length;
          const { coveredPaymentsByReceipts, requiredPayments } = getPaymentProgress(
            row.original,
          );

          return (
            <div className={styles.receiptActionsCell}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Adjuntar comprobante"
                    disabled={actionDisabled}
                    onClick={() => onUploadReceipt(row.original.id)}
                    size="icon-sm"
                    type="button"
                    variant="outline"
                  >
                    <Paperclip aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Adjuntar comprobante</TooltipContent>
              </Tooltip>

              {receiptsCount > 0 ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className={styles.extraReceiptsTrigger}
                      type="button"
                      variant="link"
                    >
                      {`📎 ${receiptsCount} comprobantes`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className={styles.extraReceiptsPopover}>
                    <div className={styles.extraReceiptsList}>
                      {row.original.receipts.map((receipt, index) => {
                        const receiptFileUrl = getValidHttpUrl(receipt.fileViewUrl);

                        return (
                          <div className={styles.extraReceiptRow} key={receipt.fileId}>
                            <DriveStatusBadge status={receipt.fileStatus} />
                            {receiptFileUrl ? (
                              <div className={styles.extraReceiptInfo}>
                                <a
                                  className={styles.paymentLinkAction}
                                  href={receiptFileUrl}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  Ver comprobante parte {index + 1}
                                  <ExternalLink
                                    aria-hidden="true"
                                    className={styles.paymentLinkIcon}
                                  />
                                </a>
                                <span className={styles.receiptCoverage}>
                                  ({receipt.coveredPayments} pagos)
                                </span>
                              </div>
                            ) : (
                              <div className={styles.extraReceiptInfo}>
                                <span className={styles.mutedValue}>
                                  Comprobante parte {index + 1} sin enlace
                                </span>
                                <span className={styles.receiptCoverage}>
                                  ({receipt.coveredPayments} pagos)
                                </span>
                              </div>
                            )}
                            <Button
                              aria-label={`Editar cobertura de comprobante ${receipt.fileName}`}
                              className={styles.receiptEditButton}
                              disabled={actionDisabled}
                              onClick={() =>
                                onEditReceiptCoverage({
                                  expenseId: row.original.id,
                                  receiptFileId: receipt.fileId,
                                })}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <ReceiptDeleteConfirmButton
                              actionDisabled={actionDisabled}
                              onConfirm={() =>
                                onDeleteReceipt({
                                  expenseId: row.original.id,
                                  receiptFileId: receipt.fileId,
                                })}
                              receiptFileName={receipt.fileName}
                            />
                          </div>
                        );
                      })}
                      <p className={styles.receiptSummary}>
                        {`Total cubierto: ${coveredPaymentsByReceipts} / ${requiredPayments}`}
                      </p>
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          );
        },
        header: getSortableHeader("Comprobantes"),
        meta: { label: "Comprobantes" },
        sortingFn: (rowA, rowB) => rowA.original.receipts.length - rowB.original.receipts.length,
      },
      {
        id: "receiptFolderUrl",
        accessorFn: (row) => row.monthlyFolderViewUrl,
        cell: ({ row }) => {
          const receiptFolderUrl = getValidHttpUrl(row.original.monthlyFolderViewUrl);
          const canDeleteFolderReference = isBrokenDriveStatus(
            row.original.monthlyFolderStatus,
          );

          if (!receiptFolderUrl) {
            return (
              <div className={styles.folderCellValue}>
                <DriveStatusBadge status={row.original.monthlyFolderStatus} />
                <span>-</span>
                {canDeleteFolderReference ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Quitar referencia de carpeta del mes actual"
                        className={styles.receiptDeleteButton}
                        disabled={actionDisabled}
                        onClick={() =>
                          onDeleteMonthlyFolderReference(row.original.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Quitar referencia de carpeta</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            );
          }

          return (
            <div className={styles.folderCellValue}>
              <DriveStatusBadge status={row.original.monthlyFolderStatus} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    className={styles.paymentLinkAction}
                    href={receiptFolderUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Ver carpeta del mes actual
                    <ExternalLink aria-hidden="true" className={styles.paymentLinkIcon} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Abrir carpeta del mes actual en Drive</TooltipContent>
              </Tooltip>
              {canDeleteFolderReference ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Quitar referencia de carpeta del mes actual"
                      className={styles.receiptDeleteButton}
                      disabled={actionDisabled}
                      onClick={() =>
                        onDeleteMonthlyFolderReference(row.original.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quitar referencia de carpeta</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          );
        },
        header: getSortableHeader("Carpeta del mes actual"),
        meta: { label: "Carpeta del mes actual" },
        sortingFn: (rowA, rowB) => {
          const leftHasFolder = rowA.original.monthlyFolderViewUrl ? 1 : 0;
          const rightHasFolder = rowB.original.monthlyFolderViewUrl ? 1 : 0;

          return leftHasFolder - rightHasFolder;
        },
      },
      {
        id: "allReceiptsFolderUrl",
        accessorFn: (row) => row.allReceiptsFolderViewUrl,
        cell: ({ row }) => {
          const allReceiptsFolderUrl = getValidHttpUrl(
            row.original.allReceiptsFolderViewUrl,
          );
          const canDeleteFolderReference = isBrokenDriveStatus(
            row.original.allReceiptsFolderStatus,
          );

          if (!allReceiptsFolderUrl) {
            return (
              <div className={styles.folderCellValue}>
                <DriveStatusBadge status={row.original.allReceiptsFolderStatus} />
                <span>-</span>
                {canDeleteFolderReference ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label="Quitar referencia de carpeta de comprobantes"
                        className={styles.receiptDeleteButton}
                        disabled={actionDisabled}
                        onClick={() =>
                          onDeleteAllReceiptsFolderReference(row.original.id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Quitar referencia de carpeta</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            );
          }

          return (
            <div className={styles.folderCellValue}>
              <DriveStatusBadge status={row.original.allReceiptsFolderStatus} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    className={styles.paymentLinkAction}
                    href={allReceiptsFolderUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Ver carpeta
                    <ExternalLink aria-hidden="true" className={styles.paymentLinkIcon} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Abrir carpeta con todos los comprobantes en Drive</TooltipContent>
              </Tooltip>
              {canDeleteFolderReference ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label="Quitar referencia de carpeta de comprobantes"
                      className={styles.receiptDeleteButton}
                      disabled={actionDisabled}
                      onClick={() =>
                        onDeleteAllReceiptsFolderReference(row.original.id)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Quitar referencia de carpeta</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          );
        },
        header: getSortableHeader("Carpeta de comprobantes"),
        meta: { label: "Carpeta de comprobantes" },
        sortingFn: (rowA, rowB) => {
          const leftHasAllReceiptsFolder = rowA.original.allReceiptsFolderViewUrl ? 1 : 0;
          const rightHasAllReceiptsFolder = rowB.original.allReceiptsFolderViewUrl ? 1 : 0;

          return leftHasAllReceiptsFolder - rightHasAllReceiptsFolder;
        },
      },
      {
        accessorKey: "loanProgress",
        cell: ({ row }) => {
          if (!row.original.isLoan) {
            return "No aplica";
          }

          if (!row.original.loanProgress) {
            return "Completá datos de la deuda";
          }

          return (
            <div className={styles.loanProgressCell}>
              <span>{row.original.loanProgress}</span>
              <span className={styles.loanProgressRemaining}>
                {`${row.original.loanRemainingInstallments ?? 0} cuotas restantes`}
              </span>
            </div>
          );
        },
        header: ({ column }) => (
          <LoanSortColumnHeader
            column={column}
            loanSortMode={loanSortMode}
            onApplyLoanSort={({ direction, mode }) => {
              setLoanSortMode(mode);
              setSorting(buildLoanSortingState(direction));
            }}
          />
        ),
        meta: { label: "Deuda / cuotas" },
        sortingFn: (rowA, rowB) => {
          const leftIsNoAplica = !rowA.original.isLoan;
          const rightIsNoAplica = !rowB.original.isLoan;

          if (leftIsNoAplica && !rightIsNoAplica) {
            return loanSortDirection === "desc" ? -1 : 1;
          }

          if (!leftIsNoAplica && rightIsNoAplica) {
            return loanSortDirection === "desc" ? 1 : -1;
          }

          if (leftIsNoAplica && rightIsNoAplica) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          const leftValue = getLoanSortValue(rowA.original, loanSortMode);
          const rightValue = getLoanSortValue(rowB.original, loanSortMode);

          if (leftValue == null && rightValue != null) {
            return 1;
          }

          if (leftValue != null && rightValue == null) {
            return -1;
          }

          if (leftValue == null && rightValue == null) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          if (leftValue == null || rightValue == null) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          const difference = leftValue - rightValue;

          if (difference !== 0) {
            return difference;
          }

          return rowA.original.description.localeCompare(
            rowB.original.description,
            "es",
          );
        },
      },
      {
        accessorKey: "lenderName",
        cell: ({ row }) => {
          const lenderName = row.original.lenderName.trim();

          return lenderName.length > 0 ? lenderName : "-";
        },
        header: getSortableHeader("Prestamista"),
        meta: { label: "Prestamista" },
        sortingFn: (rowA, rowB) => {
          const leftValue = rowA.original.lenderName.trim();
          const rightValue = rowB.original.lenderName.trim();

          if (!leftValue && rightValue) {
            return 1;
          }

          if (leftValue && !rightValue) {
            return -1;
          }

          return leftValue.localeCompare(rightValue, "es", {
            sensitivity: "base",
          });
        },
      },
      {
        id: LOAN_INSTALLMENT_START_COLUMN_ID,
        accessorFn: (row) => row.startMonth,
        cell: ({ row }) => formatYearMonth(row.original.startMonth),
        header: getSortableHeader("Inicio cuota"),
        meta: { label: "Inicio cuota" },
        sortingFn: (rowA, rowB) => {
          const leftValue = getYearMonthSortValue(rowA.original.startMonth);
          const rightValue = getYearMonthSortValue(rowB.original.startMonth);

          if (leftValue == null && rightValue != null) {
            return loanInstallmentStartSortDirection === "desc" ? -1 : 1;
          }

          if (leftValue != null && rightValue == null) {
            return loanInstallmentStartSortDirection === "desc" ? 1 : -1;
          }

          if (leftValue == null && rightValue == null) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          if (leftValue == null || rightValue == null) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          const difference = leftValue - rightValue;

          if (difference !== 0) {
            return difference;
          }

          return rowA.original.description.localeCompare(
            rowB.original.description,
            "es",
          );
        },
      },
      {
        id: LOAN_INSTALLMENT_END_COLUMN_ID,
        accessorFn: (row) => row.loanEndMonth,
        cell: ({ row }) => formatYearMonth(row.original.loanEndMonth),
        header: getSortableHeader("Fin cuota"),
        meta: { label: "Fin cuota" },
        sortingFn: (rowA, rowB) => {
          const leftValue = getYearMonthSortValue(rowA.original.loanEndMonth);
          const rightValue = getYearMonthSortValue(rowB.original.loanEndMonth);

          if (leftValue == null && rightValue != null) {
            return loanInstallmentEndSortDirection === "desc" ? -1 : 1;
          }

          if (leftValue != null && rightValue == null) {
            return loanInstallmentEndSortDirection === "desc" ? 1 : -1;
          }

          if (leftValue == null && rightValue == null) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          if (leftValue == null || rightValue == null) {
            return rowA.original.description.localeCompare(
              rowB.original.description,
              "es",
            );
          }

          const difference = leftValue - rightValue;

          if (difference !== 0) {
            return difference;
          }

          return rowA.original.description.localeCompare(
            rowB.original.description,
            "es",
          );
        },
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className={styles.actionsCell}>
            <ExpenseRowActions
              actionDisabled={actionDisabled}
              description={row.original.description}
              onDelete={() => onDeleteExpense(row.original.id)}
              onEdit={() => onEditExpense(row.original.id)}
            />
          </div>
        ),
        enableHiding: false,
        enableSorting: false,
        header: () => null,
        meta: { cellClassName: styles.stickyActionsCell },
      },
    ],
    [
      actionDisabled,
      exchangeRateSnapshot,
      loanInstallmentEndSortDirection,
      loanInstallmentStartSortDirection,
      loanSortDirection,
      loanSortMode,
      onDeleteAllReceiptsFolderReference,
      onDeleteExpense,
      onDeletePaymentLink,
      onDeleteMonthlyFolderReference,
      onDeleteReceipt,
      onEditReceiptCoverage,
      onEditExpense,
      onUpdateManualCoveredPayments,
      onUploadReceipt,
      handleOpenPaymentLinkDialog,
    ],
  );

  return (
    <section className={styles.section}>
      <div className={styles.content}>
        <div className={styles.headerTopRow}>
          <div className={styles.header}>
            <p className={styles.pageDescription}>
              <Highlighter
                action="underline"
                animationDuration={450}
                color="#2fbf91"
                isView
                iterations={1}
                strokeWidth={2}
              >
                Cargá, editá y guardá
              </Highlighter>{" "}
              tus gastos mensuales.
            </p>
          </div>
        </div>

        {loadError ? (
          <p className={cn(styles.feedback, styles.errorText)} role="alert">
            {loadError}
          </p>
        ) : null}

        <div className={styles.tableContent}>
          <div className={styles.toolbar}>
            <div className={styles.monthField}>
              <div className={styles.monthLabelRow}>
                <Label htmlFor="monthly-expenses-month">Mes</Label>
                <LoanInfoPopover
                  closeLabel="Cerrar información de Mes"
                  message="Cambiá el mes para guardar o consultar otra planilla mensual."
                  triggerLabel="Información sobre el campo Mes"
                />
              </div>
              <Input
                id="monthly-expenses-month"
                onChange={(event) => onMonthChange(event.target.value)}
                type="month"
                value={month}
              />
            </div>

            {showCopyFromControls ? (
              <div className={styles.copyField}>
                <Label htmlFor="monthly-expenses-copy-source">Copia de</Label>
                <div className={styles.copyActions}>
                  <Select
                    onValueChange={onCopySourceMonthChange}
                    value={copySourceMonth ?? undefined}
                  >
                    <SelectTrigger
                      aria-label="Mes de origen para copiar"
                      className={styles.copySourceSelect}
                      id="monthly-expenses-copy-source"
                    >
                      <SelectValue placeholder="Seleccioná un mes guardado" />
                    </SelectTrigger>
                    <SelectContent>
                      {copySourceMonthOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    disabled={isCopyFromDisabled}
                    onClick={onCopyFromMonth}
                    type="button"
                    variant="outline"
                  >
                    Copia de
                  </Button>
                </div>
                <p className={styles.monthHint}>
                  Copiá gastos guardados de otro mes y revisá antes de guardar.
                </p>
              </div>
            ) : null}

            <Button
              disabled={actionDisabled}
              onClick={onAddExpense}
              type="button"
              variant="outline"
            >
              Agregar gasto
            </Button>
          </div>

          {exchangeRateSnapshot ? (
            <div className={styles.exchangeRateSummary}>
              <p className={styles.exchangeRateLine}>
                Dólar oficial:
                <span className={styles.exchangeRateValue}>
                  {formatExchangeRateAmount(exchangeRateSnapshot.officialRate)}
                </span>
              </p>
              <p className={styles.exchangeRateLine}>
                Dólar solidario:
                <span className={styles.exchangeRateValue}>
                  {formatExchangeRateAmount(exchangeRateSnapshot.solidarityRate)}
                </span>
              </p>
            </div>
          ) : exchangeRateLoadError ? (
            <p className={styles.exchangeRateFallback}>{exchangeRateLoadError}</p>
          ) : null}

          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Detalle del mes</h2>
            <p className={styles.tableDescription}>
              Editá cada gasto desde su menú de acciones.
            </p>
          </div>

          <div className={styles.tableWrapper}>
            {isRestoringTablePreferences ? (
              <div
                aria-label="Cargando configuración de tabla"
                aria-live="polite"
                className={styles.tableLoadingOverlay}
                role="status"
              >
                <div className={styles.tableLoadingContent}>
                  <span
                    aria-hidden="true"
                    className={styles.tableLoadingSpinner}
                  />
                  <span className={styles.tableLoadingText}>
                    Cargando configuración de tabla...
                  </span>
                </div>
              </div>
            ) : null}
            <DataTable
              columnVisibility={columnVisibility}
              columnVisibilityButtonLabel="Columnas"
              columnVisibilityMenuLabel="Mostrar columnas"
              columns={columns}
              data={fuzzySortedRows}
              emptyMessage="No hay gastos cargados para este mes."
              filterColumnId="description"
              filterLabel="Filtrar gastos"
              filterPlaceholder="Filtrar gastos por descripción"
              filterValue={descriptionFilter}
              onFilterValueChange={setDescriptionFilter}
              onColumnVisibilityChange={setColumnVisibility}
              onSortingChange={setSorting}
              showColumnVisibilityToggle={true}
              sorting={sorting}
            />
          </div>

          {feedbackMessage.trim().length > 0 ? (
            <p
              aria-live="polite"
              className={cn(
                styles.feedback,
                feedbackTone === "error" && styles.errorText,
                feedbackTone === "success" && styles.successText,
              )}
              role={feedbackTone === "error" ? "alert" : undefined}
            >
              {feedbackMessage}
            </p>
          ) : null}
        </div>

        <ExpenseSheet
          actionDisabled={actionDisabled || isSubmitting}
          changedFields={changedFields}
          draft={draft}
          isOpen={isExpenseSheetOpen}
          isSubmitting={isSubmitting}
          lenders={lenders}
          mode={sheetMode}
          onAddLender={onAddLender}
          onFieldChange={onExpenseFieldChange}
          onLenderSelect={onExpenseLenderSelect}
          onLoanToggle={onExpenseLoanToggle}
          onRequestClose={onRequestCloseExpenseSheet}
          onSave={onSaveExpense}
          onUnsavedChangesClose={onUnsavedChangesClose}
          onUnsavedChangesDiscard={onUnsavedChangesDiscard}
          onUnsavedChangesSave={onSaveUnsavedChanges}
          showUnsavedChangesDialog={showUnsavedChangesDialog}
          validationMessage={validationMessage}
        />

        <Dialog
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleClosePaymentLinkDialog();
            }
          }}
          open={paymentLinkDialogState != null}
        >
          <DialogContent
            className={styles.paymentLinkDialogContent}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              handleClosePaymentLinkDialog();
            }}
            onInteractOutside={(event) => {
              event.preventDefault();
              handleClosePaymentLinkDialog();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {paymentLinkDialogState?.mode === "edit"
                  ? "Editar link de pago"
                  : "Agregar link de pago"}
              </DialogTitle>
              <DialogDescription>
                {`Completá el link para ${paymentLinkDialogState?.expenseDescription ?? "este gasto"}.`}
              </DialogDescription>
            </DialogHeader>

            <div className={styles.paymentLinkDialogField}>
              <Label htmlFor="payment-link-dialog-input">Link de pago</Label>
              <InputGroup>
                <InputGroupAddon align="inline-start" aria-hidden="true">
                  <Link2 className={styles.paymentLinkDialogIcon} />
                </InputGroupAddon>
                <InputGroupInput
                  aria-invalid={paymentLinkDraftError ? "true" : "false"}
                  aria-label={`Link de pago de ${paymentLinkDialogState?.expenseDescription ?? "gasto"}`}
                  autoFocus
                  id="payment-link-dialog-input"
                  onChange={(event) => {
                    setPaymentLinkDraftValue(event.target.value);

                    if (paymentLinkDraftError) {
                      setPaymentLinkDraftError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSavePaymentLink();
                    }
                  }}
                  placeholder="https://..."
                  type="url"
                  value={paymentLinkDraftValue}
                />
              </InputGroup>
              {paymentLinkDraftError ? (
                <p className={styles.paymentLinkDialogError} role="alert">
                  {paymentLinkDraftError}
                </p>
              ) : null}
            </div>

            <DialogFooter className={styles.paymentLinkDialogActions}>
              <Button
                onClick={handleClosePaymentLinkDialog}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={actionDisabled}
                onClick={() => {
                  void handleSavePaymentLink();
                }}
                type="button"
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
