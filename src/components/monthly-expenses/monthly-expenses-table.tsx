import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ColumnDef,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Highlighter,
} from "@/components/ui/highlighter";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock3,
  CircleX,
  EyeOff,
  ExternalLink,
  Mail,
  MoreVertical,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { ExpenseRowActions } from "@/components/monthly-expenses/expense-row-actions";
import {
  ExpenseSheet,
  type ExpenseEditableFieldName,
} from "@/components/monthly-expenses/expense-sheet";

import {
  compareFuzzyMatchRank,
  getFuzzyMatchIndices,
  getFuzzyMatchRank,
  renderHighlightedText,
} from "./fuzzy-search";
import {
  formatCurrencyDisplayWithOptions,
  normalizeCurrencyInput,
} from "./currency-input-format";
import { LoanInfoPopover } from "./loan-info-popover";
import type { LenderOption } from "./lender-picker";
import {
  formatReceiptSharePhoneDisplay,
  normalizeReceiptSharePhoneDigits,
  RECEIPT_SHARE_PHONE_REQUIRED_ERROR_MESSAGE,
  validateOccurrencesPerMonth,
  validateReceiptSharePhoneDigits,
  validateSubtotalAmount,
} from "./expense-edit-validation";
import {
  getValidPaymentLink as getValidPaymentLinkUrl,
  PAYMENT_LINK_VALIDATION_ERROR_MESSAGE,
} from "./payment-link";
import styles from "./monthly-expenses-table.module.scss";

type MonthlyExpenseCurrency = "ARS" | "USD";
type MonthlyExpenseReceiptShareStatus = "pending" | "sent";
const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
type LoanSortMode = "paidInstallments" | "remainingInstallments" | "totalInstallments";
const DEFAULT_LOAN_SORT_MODE: LoanSortMode = "paidInstallments";
const LOAN_SORT_COLUMN_ID = "loanProgress";
const LOAN_INSTALLMENT_START_COLUMN_ID = "loanInstallmentStart";
const LOAN_INSTALLMENT_END_COLUMN_ID = "loanInstallmentEnd";
const MONTHLY_EXPENSES_TABLE_PREFERENCES_STORAGE_KEY =
  "larry.monthly-expenses.table-preferences";
const MONTHLY_EXPENSES_DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  usd: false,
};
const RECEIPT_FILE_ACCEPT = [
  "application/pdf",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");
const SORTABLE_COLUMN_IDS = new Set([
  "description",
  "paymentsProgress",
  "paymentHistory",
  "subtotal",
  "occurrencesPerMonth",
  "total",
  "usd",
  "paymentLink",
  "receiptShareStatus",
  "receiptShareLink",
  LOAN_SORT_COLUMN_ID,
  "lenderName",
  LOAN_INSTALLMENT_START_COLUMN_ID,
  LOAN_INSTALLMENT_END_COLUMN_ID,
]);
const PERSISTABLE_COLUMN_VISIBILITY_IDS = new Set([
  "paymentsProgress",
  "paymentHistory",
  "subtotal",
  "occurrencesPerMonth",
  "total",
  "usd",
  "paymentLink",
  "receiptShareStatus",
  "receiptShareLink",
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
const CURRENCY_FORMATTER_BY_CURRENCY: Record<MonthlyExpenseCurrency, Intl.NumberFormat> = {
  ARS: new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    style: "currency",
  }),
  USD: new Intl.NumberFormat("es-AR", {
    currency: "USD",
    style: "currency",
  }),
};

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
    const parsedColumnVisibility =
      parsePersistedColumnVisibility(parsedPreferences.columnVisibility) ?? {};
    const columnVisibility: VisibilityState = {
      ...MONTHLY_EXPENSES_DEFAULT_COLUMN_VISIBILITY,
      ...parsedColumnVisibility,
    };

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
    getCanHide: () => boolean;
    getCanSort: () => boolean;
    getIsSorted: () => false | "asc" | "desc";
    toggleVisibility: (value?: boolean) => void;
  };
  loanSortMode: LoanSortMode;
  onApplyLoanSort: (args: {
    direction: "asc" | "desc";
    mode: LoanSortMode;
  }) => void;
}

interface ReceiptDeleteConfirmButtonProps {
  actionDisabled: boolean;
  onConfirm: () => void | Promise<void>;
  receiptFileName: string;
}

interface PaymentLinkActionsMenuProps {
  actionDisabled: boolean;
  expenseDescription: string;
  onDelete: () => void | Promise<void>;
  onEdit: () => void;
}

interface QuickEditActionsMenuProps {
  actionDisabled: boolean;
  confirmDeleteActionAriaLabel?: string;
  confirmDeleteActionDescription?: string;
  confirmDeleteActionTitle?: string;
  deleteActionLabel?: string;
  editActionLabel: string;
  expenseDescription: string;
  onDelete?: () => void | Promise<void>;
  onEdit: () => void;
  triggerAriaLabel: string;
}

function PaymentLinkActionsMenu({
  actionDisabled,
  expenseDescription,
  onDelete,
  onEdit,
}: PaymentLinkActionsMenuProps) {
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const normalizedExpenseDescription = expenseDescription.trim() || "gasto";

  return (
    <AlertDialog onOpenChange={setIsConfirmDialogOpen} open={isConfirmDialogOpen}>
      <DropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Abrir acciones de link de pago para ${normalizedExpenseDescription}`}
            className={styles.paymentLinkActionButton}
            disabled={actionDisabled}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreVertical aria-hidden="true" className={styles.paymentLinkIcon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setIsMenuOpen(false);
              window.setTimeout(() => {
                onEdit();
              }, 0);
            }}
          >
            <Pencil aria-hidden="true" />
            Editar link de pago
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setIsMenuOpen(false);
              window.setTimeout(() => {
                setIsConfirmDialogOpen(true);
              }, 0);
            }}
            variant="destructive"
          >
            <Trash2 aria-hidden="true" />
            Eliminar link de pago
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Querés eliminar este link de pago?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción guarda el cambio inmediatamente en tu archivo mensual.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            aria-label={`Confirmar eliminación de link de pago para ${normalizedExpenseDescription}`}
            onClick={() => {
              setIsConfirmDialogOpen(false);
              void onDelete();
            }}
            variant="destructive"
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function QuickEditActionsMenu({
  actionDisabled,
  confirmDeleteActionAriaLabel,
  confirmDeleteActionDescription,
  confirmDeleteActionTitle,
  deleteActionLabel,
  editActionLabel,
  expenseDescription,
  onDelete,
  onEdit,
  triggerAriaLabel,
}: QuickEditActionsMenuProps) {
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const normalizedExpenseDescription = expenseDescription.trim() || "gasto";
  const shouldConfirmDelete =
    Boolean(confirmDeleteActionTitle) && Boolean(confirmDeleteActionDescription);

  return (
    <AlertDialog onOpenChange={setIsConfirmDialogOpen} open={isConfirmDialogOpen}>
      <DropdownMenu onOpenChange={setIsMenuOpen} open={isMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`${triggerAriaLabel} para ${normalizedExpenseDescription}`}
            className={styles.paymentLinkActionButton}
            disabled={actionDisabled}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreVertical aria-hidden="true" className={styles.paymentLinkIcon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setIsMenuOpen(false);
              window.setTimeout(() => {
                onEdit();
              }, 0);
            }}
          >
            <Pencil aria-hidden="true" />
            {editActionLabel}
          </DropdownMenuItem>
          {onDelete ? (
            <DropdownMenuItem
              onSelect={() => {
                setIsMenuOpen(false);
                window.setTimeout(() => {
                  if (shouldConfirmDelete) {
                    setIsConfirmDialogOpen(true);
                    return;
                  }

                  void onDelete();
                }, 0);
              }}
              variant="destructive"
            >
              <Trash2 aria-hidden="true" />
              {deleteActionLabel ?? "Eliminar"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onDelete && shouldConfirmDelete ? (
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDeleteActionTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDeleteActionDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              aria-label={
                confirmDeleteActionAriaLabel ??
                `Confirmar eliminación para ${normalizedExpenseDescription}`
              }
              onClick={() => {
                setIsConfirmDialogOpen(false);
                void onDelete();
              }}
              variant="destructive"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );
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
              void onConfirm();
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
  const canHide = column.getCanHide();
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
    return (
      <span className={styles.sortableHeader}>
        <span className={styles.headLabel}>Deuda / cuotas</span>
        {canHide ? (
          <button
            aria-label="Ocultar columna Deuda / cuotas"
            className={styles.sortIconButton}
            onClick={() => column.toggleVisibility(false)}
            type="button"
          >
            <EyeOff aria-hidden="true" />
          </button>
        ) : null}
      </span>
    );
  }

  const sorted = column.getIsSorted();
  const SortIcon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <div className={styles.loanSortHeader}>
      <span className={styles.sortableHeader}>
        <span className={styles.headLabel}>Deuda / cuotas</span>
        <Popover onOpenChange={handlePopoverOpenChange} open={isPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Ordenar Deuda / cuotas"
              className={styles.sortIconButton}
              type="button"
            >
              <SortIcon aria-hidden="true" />
            </button>
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
        {canHide ? (
          <button
            aria-label="Ocultar columna Deuda / cuotas"
            className={styles.sortIconButton}
            onClick={() => column.toggleVisibility(false)}
            type="button"
          >
            <EyeOff aria-hidden="true" />
          </button>
        ) : null}
      </span>
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
  paymentRecords?: MonthlyExpensesEditablePaymentRecord[];
  paymentLink: string;
  receiptShareMessage: string;
  receiptSharePhoneDigits: string;
  receiptShareStatus: MonthlyExpenseReceiptShareStatus | "";
  requiresReceiptShare: boolean;
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

export interface MonthlyExpensesEditablePaymentRecord {
  coveredPayments: number;
  id: string;
  receipt?: MonthlyExpensesEditableReceipt;
  registeredAt: string | null;
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
  isMonthTransitionPending: boolean;
  isSubmitting: boolean;
  lenders: LenderOption[];
  loadError: string | null;
  month: string;
  pendingMonth: string | null;
  onAddExpense: () => void;
  onAddLender: () => void;
  onCopyFromMonth: () => void;
  onCopySourceMonthChange: (value: string) => void;
  onDeleteAllReceiptsFolderReference: (expenseId: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onDeleteExpenseReceiptShare: (expenseId: string) => void | Promise<void>;
  onDeletePaymentLink: (expenseId: string) => void | Promise<void>;
  onDeleteMonthlyFolderReference: (expenseId: string) => void;
  onEditExpense: (expenseId: string) => void;
  onExpenseFieldChange: (
    fieldName: ExpenseEditableFieldName,
    value: string,
  ) => void;
  onExpenseLenderSelect: (lenderId: string | null) => void;
  onExpenseLoanToggle: (checked: boolean) => void;
  onExpenseReceiptShareToggle: (checked: boolean) => void;
  onMonthChange: (value: string) => void;
  onDeleteReceipt: (args: {
    expenseId: string;
    receiptFileId: string;
  }) => void;
  onEditReceiptCoverage: (args: {
    expenseId: string;
    receiptFileId: string;
  }) => void;
  onRegisterPaymentRecord: (args: {
    coveredPayments: number;
    expenseId: string;
    file: File | null;
  }) => Promise<boolean>;
  onEditManualPaymentRecord: (args: {
    coveredPayments: number;
    expenseId: string;
    paymentRecordId: string;
  }) => void;
  onDeleteManualPaymentRecord: (args: {
    expenseId: string;
    paymentRecordId: string;
  }) => void;
  onUpdatePaymentLink: (args: {
    expenseId: string;
    paymentLink: string;
  }) => void | Promise<void>;
  onUpdateExpenseOccurrencesPerMonth: (args: {
    expenseId: string;
    occurrencesPerMonth: number;
  }) => void | Promise<void>;
  onUpdateExpenseReceiptShare: (args: {
    expenseId: string;
    receiptShareMessage: string;
    receiptSharePhoneDigits: string;
  }) => void | Promise<void>;
  onUpdateExpenseSubtotal: (args: {
    expenseId: string;
    subtotal: number;
  }) => void | Promise<void>;
  onUpdateReceiptShareStatus: (args: {
    expenseId: string;
    receiptShareStatus: MonthlyExpenseReceiptShareStatus;
  }) => void | Promise<void>;
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

interface ExpenseSubtotalDialogState {
  currency: MonthlyExpenseCurrency;
  expenseDescription: string;
  expenseId: string;
}

interface ExpenseOccurrencesDialogState {
  expenseDescription: string;
  expenseId: string;
}

interface ExpenseReceiptShareDialogState {
  expenseDescription: string;
  expenseId: string;
  mode: "create" | "edit";
}

function getSortableHeader(label: string) {
  return function SortableHeader({
    column,
  }: {
    column: {
      getCanHide: () => boolean;
      getCanSort: () => boolean;
      getIsSorted: () => false | "asc" | "desc";
      toggleSorting: (desc?: boolean) => void;
      toggleVisibility: (value?: boolean) => void;
    };
  }) {
    const canHide = column.getCanHide();

    if (!column.getCanSort()) {
      return (
        <span className={styles.sortableHeader}>
          <span className={styles.headLabel}>{label}</span>
          {canHide ? (
            <button
              aria-label={`Ocultar columna ${label}`}
              className={styles.sortIconButton}
              onClick={() => column.toggleVisibility(false)}
              type="button"
            >
              <EyeOff aria-hidden="true" />
            </button>
          ) : null}
        </span>
      );
    }

    const sorted = column.getIsSorted();
    const SortIcon =
      sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

    return (
      <span className={styles.sortableHeader}>
        <span className={styles.headLabel}>{label}</span>
        <button
          aria-label={`Ordenar ${label}`}
          className={styles.sortIconButton}
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          type="button"
        >
          <SortIcon aria-hidden="true" />
        </button>
        {canHide ? (
          <button
            aria-label={`Ocultar columna ${label}`}
            className={styles.sortIconButton}
            onClick={() => column.toggleVisibility(false)}
            type="button"
          >
            <EyeOff aria-hidden="true" />
          </button>
        ) : null}
      </span>
    );
  };
}

function getLoanSortModeLabel(loanSortMode: LoanSortMode): string {
  const option = LOAN_SORT_OPTIONS.find((entry) => entry.value === loanSortMode);

  if (!option) {
    return "Cuotas pagadas";
  }

  return option.label;
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

function normalizeSortToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.\s/_-]+/g, "");
}

function isInvalidSortValue(value: unknown): boolean {
  if (value == null) {
    return true;
  }

  if (typeof value === "number") {
    return !Number.isFinite(value);
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      return true;
    }

    const normalizedToken = normalizeSortToken(normalizedValue);

    return normalizedToken === "noaplica" || normalizedToken === "na";
  }

  return false;
}

function compareValuesKeepingInvalidLast<TValue>({
  compareValidValues,
  leftValue,
  rightValue,
  sortDirection,
}: {
  compareValidValues: (
    leftValue: NonNullable<TValue>,
    rightValue: NonNullable<TValue>,
  ) => number;
  leftValue: TValue;
  rightValue: TValue;
  sortDirection: "asc" | "desc";
}): number {
  const leftIsInvalid = isInvalidSortValue(leftValue);
  const rightIsInvalid = isInvalidSortValue(rightValue);

  if (leftIsInvalid && rightIsInvalid) {
    return 0;
  }

  if (leftIsInvalid && !rightIsInvalid) {
    return sortDirection === "desc" ? -1 : 1;
  }

  if (!leftIsInvalid && rightIsInvalid) {
    return sortDirection === "desc" ? 1 : -1;
  }

  return compareValidValues(
    leftValue as NonNullable<TValue>,
    rightValue as NonNullable<TValue>,
  );
}

function getReceiptShareStatusLabel(
  status: MonthlyExpenseReceiptShareStatus,
): string {
  return status === "sent" ? "Enviado" : "Pendiente";
}

function getReceiptShareStatusIcon(
  status: MonthlyExpenseReceiptShareStatus,
): typeof Clock3 {
  return status === "sent" ? Mail : Clock3;
}

function getNormalizedReceiptShareStatus(
  row: Pick<MonthlyExpensesEditableRow, "receiptShareStatus" | "requiresReceiptShare">,
): MonthlyExpenseReceiptShareStatus | null {
  if (!row.requiresReceiptShare) {
    return null;
  }

  return row.receiptShareStatus === "sent" ? "sent" : "pending";
}

function getReceiptShareStatusToneClassName(
  args: {
    isPaymentFullyCompleted: boolean;
    status: MonthlyExpenseReceiptShareStatus;
  },
): string {
  if (args.status === "sent") {
    return styles.receiptShareStatusSent;
  }

  return args.isPaymentFullyCompleted
    ? styles.receiptShareStatusPending
    : "";
}

function getReceiptShareMessage(value: string): string | null {
  const normalizedMessage = value.trim();

  return normalizedMessage.length > 0 ? normalizedMessage : null;
}

function getReceiptShareReceiptUrls(
  receipts: MonthlyExpensesEditableReceipt[],
): string[] {
  return receipts
    .map((receipt) => receipt.fileViewUrl.trim())
    .filter((receiptUrl) => receiptUrl.length > 0);
}

function getReceiptShareReceiptsMessage(receiptUrls: string[]): string | null {
  if (receiptUrls.length === 0) {
    return null;
  }

  if (receiptUrls.length === 1) {
    return `Comprobante: ${receiptUrls[0]}`;
  }

  return receiptUrls
    .map(
      (receiptUrl, index) => `Comprobante ${index + 1}: ${receiptUrl}`,
    )
    .join("\n");
}

function getReceiptShareWhatsAppLink(
  row: Pick<
    MonthlyExpensesEditableRow,
    | "receiptShareMessage"
    | "receiptSharePhoneDigits"
    | "receipts"
    | "requiresReceiptShare"
  >,
): string | null {
  if (!row.requiresReceiptShare) {
    return null;
  }

  const phoneDigits = row.receiptSharePhoneDigits.trim();

  if (!phoneDigits) {
    return null;
  }

  const receiptShareMessage = getReceiptShareReceiptsMessage(
    getReceiptShareReceiptUrls(row.receipts),
  );

  if (!receiptShareMessage) {
    return null;
  }

  const normalizedMessage = getReceiptShareMessage(row.receiptShareMessage);

  const fullMessage = normalizedMessage
    ? `${receiptShareMessage}\n\n${normalizedMessage}`
    : receiptShareMessage;

  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(fullMessage)}`;
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

  return CURRENCY_FORMATTER_BY_CURRENCY[currency].format(numericValue);
}

function formatConvertedAmount(
  currency: MonthlyExpenseCurrency,
  value: number | null,
): string {
  if (value == null) {
    return "-";
  }

  return CURRENCY_FORMATTER_BY_CURRENCY[currency].format(value);
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
  if (!Number.isFinite(total)) {
    return null;
  }

  if (currency === "ARS") {
    if (rowCurrency === "ARS") {
      return total;
    }

    if (!exchangeRateSnapshot) {
      return null;
    }

    return total * exchangeRateSnapshot.solidarityRate;
  }

  if (rowCurrency === "USD") {
    return total;
  }

  if (!exchangeRateSnapshot) {
    return null;
  }

  return total / exchangeRateSnapshot.solidarityRate;
}

function formatArsWithUsdSecondary({
  exchangeRateSnapshot,
  rowCurrency,
  value,
}: {
  exchangeRateSnapshot: MonthlyExpensesTableProps["exchangeRateSnapshot"];
  rowCurrency: MonthlyExpenseCurrency;
  value: string;
}) {
  if (rowCurrency === "ARS") {
    return formatCurrencyAmount("ARS", value);
  }

  const arsAmount = getConvertedAmountForCurrency({
    currency: "ARS",
    exchangeRateSnapshot,
    rowCurrency,
    total: Number(value),
  });

  return (
    <span className={styles.convertedCurrencyValue}>
      <span>{formatConvertedAmount("ARS", arsAmount)}</span>
      <span className={styles.convertedCurrencySecondaryValue}>
        ({formatCurrencyAmount("USD", value)})
      </span>
    </span>
  );
}

function getArsComparableAmount({
  exchangeRateSnapshot,
  rowCurrency,
  value,
}: {
  exchangeRateSnapshot: MonthlyExpensesTableProps["exchangeRateSnapshot"];
  rowCurrency: MonthlyExpenseCurrency;
  value: string;
}): number | null {
  return getConvertedAmountForCurrency({
    currency: "ARS",
    exchangeRateSnapshot,
    rowCurrency,
    total: Number(value),
  });
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

function isPaymentCompleted(row: MonthlyExpensesEditableRow): boolean {
  const { coveredPayments, requiredPayments } = getPaymentProgress(row);

  return requiredPayments > 0 && coveredPayments >= requiredPayments;
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

/**
 * Formats an ISO datetime for the payment history popover.
 *
 * @param isoDatetime - Datetime string to render.
 * @returns A DD/MM/YYYY label in Spanish locale.
 */
function formatPaymentRecordDate(isoDatetime: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoDatetime));
}

/**
 * Sorts payment records using the newest registration date first.
 *
 * @param leftRecord - Left record to compare.
 * @param rightRecord - Right record to compare.
 * @returns Positive when right should come first.
 */
function sortPaymentRecordsByDateDescending(
  leftRecord: MonthlyExpensesEditablePaymentRecord,
  rightRecord: MonthlyExpensesEditablePaymentRecord,
): number {
  const leftTimestamp = leftRecord.registeredAt
    ? new Date(leftRecord.registeredAt).getTime()
    : Number.NEGATIVE_INFINITY;
  const rightTimestamp = rightRecord.registeredAt
    ? new Date(rightRecord.registeredAt).getTime()
    : Number.NEGATIVE_INFINITY;

  if (leftTimestamp !== rightTimestamp) {
    return rightTimestamp - leftTimestamp;
  }

  return leftRecord.id.localeCompare(rightRecord.id);
}

function PaymentHistoryCell({
  actionDisabled,
  expenseDescription,
  expenseId,
  maxPaymentsPerRecord,
  onRegisterPaymentRecord,
  onDeleteManualPaymentRecord,
  onDeleteReceipt,
  onEditManualPaymentRecord,
  onEditReceiptCoverage,
  paymentRecords,
}: {
  actionDisabled: boolean;
  expenseDescription: string;
  expenseId: string;
  maxPaymentsPerRecord: number;
  onRegisterPaymentRecord: (args: {
    coveredPayments: number;
    expenseId: string;
    file: File | null;
  }) => Promise<boolean>;
  onDeleteManualPaymentRecord: (args: {
    expenseId: string;
    paymentRecordId: string;
  }) => void;
  onDeleteReceipt: (args: {
    expenseId: string;
    receiptFileId: string;
  }) => void;
  onEditManualPaymentRecord: (args: {
    coveredPayments: number;
    expenseId: string;
    paymentRecordId: string;
  }) => void;
  onEditReceiptCoverage: (args: {
    expenseId: string;
    receiptFileId: string;
  }) => void;
  paymentRecords: MonthlyExpensesEditablePaymentRecord[];
}) {
  const [manualRecordDraft, setManualRecordDraft] = useState("1");
  const [selectedReceiptFile, setSelectedReceiptFile] = useState<File | null>(null);
  const [paymentRegistrationError, setPaymentRegistrationError] =
    useState<string | null>(null);
  const [isRegisterPaymentDialogOpen, setIsRegisterPaymentDialogOpen] =
    useState(false);
  const [isRegisterPaymentSubmitting, setIsRegisterPaymentSubmitting] =
    useState(false);
  const registerPaymentInputId = `${expenseId}-register-payments-input`;
  const registerPaymentReceiptInputId = `${expenseId}-register-receipt-input`;
  const sortedPaymentRecords = [...paymentRecords].sort(
    sortPaymentRecordsByDateDescending,
  );
  const receiptPaymentRecordsCount = paymentRecords.filter(
    (paymentRecord) => Boolean(paymentRecord.receipt),
  ).length;
  const receiptCountLabel = receiptPaymentRecordsCount === 1
    ? "comprobante"
    : "comprobantes";
  const recordsCountLabel = paymentRecords.length === 1
    ? "registro"
    : "registros";
  const parsedManualCoveredPayments = Number(manualRecordDraft);
  const hasValidManualDraft =
    Number.isInteger(parsedManualCoveredPayments) &&
    parsedManualCoveredPayments >= 1 &&
    parsedManualCoveredPayments <= maxPaymentsPerRecord;
  const selectedReceiptFileName = selectedReceiptFile?.name ?? "Sin comprobante";

  const resetRegisterPaymentForm = useCallback(() => {
    setManualRecordDraft("1");
    setSelectedReceiptFile(null);
    setPaymentRegistrationError(null);
    setIsRegisterPaymentSubmitting(false);
  }, []);

  const handleRegisterPaymentDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsRegisterPaymentDialogOpen(nextOpen);

      if (!nextOpen) {
        resetRegisterPaymentForm();
      }
    },
    [resetRegisterPaymentForm],
  );

  const handleRegisterPaymentRecord = useCallback(async () => {
    if (!hasValidManualDraft) {
      setPaymentRegistrationError(
        `Ingresá una cantidad de pagos válida entre 1 y ${maxPaymentsPerRecord}.`,
      );
      return;
    }

    setIsRegisterPaymentSubmitting(true);
    setPaymentRegistrationError(null);

    const wasRegistered = await onRegisterPaymentRecord({
      coveredPayments: parsedManualCoveredPayments,
      expenseId,
      file: selectedReceiptFile,
    });

    if (!wasRegistered) {
      setIsRegisterPaymentSubmitting(false);
      setPaymentRegistrationError("No pudimos registrar el pago. Volvé a intentar.");
      return;
    }

    setIsRegisterPaymentDialogOpen(false);
    resetRegisterPaymentForm();
  }, [
    expenseId,
    hasValidManualDraft,
    maxPaymentsPerRecord,
    onRegisterPaymentRecord,
    parsedManualCoveredPayments,
    resetRegisterPaymentForm,
    selectedReceiptFile,
  ]);

  return (
    <div className={styles.receiptActionsCell}>
      <Dialog
        onOpenChange={handleRegisterPaymentDialogOpenChange}
        open={isRegisterPaymentDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar nuevo pago</DialogTitle>
            <DialogDescription>
              Elegí la cantidad de pagos y, si querés, adjuntá un comprobante.
            </DialogDescription>
          </DialogHeader>
          <div className={styles.manualPaymentsCell}>
            <Label htmlFor={registerPaymentInputId}>Cantidad de pagos a cubrir:</Label>
            <Input
              aria-label="Cantidad de pagos a cubrir"
              className={styles.manualPaymentsInput}
              disabled={actionDisabled || maxPaymentsPerRecord <= 0}
              id={registerPaymentInputId}
              inputMode="numeric"
              max={maxPaymentsPerRecord}
              min={1}
              onChange={(event) => setManualRecordDraft(event.target.value)}
              type="number"
              value={manualRecordDraft}
            />
            <Label htmlFor={registerPaymentReceiptInputId}>
              Adjuntar comprobante (opcional):
            </Label>
            <Input
              accept={RECEIPT_FILE_ACCEPT}
              aria-label="Seleccionar comprobante"
              disabled={actionDisabled || maxPaymentsPerRecord <= 0}
              id={registerPaymentReceiptInputId}
              onChange={(event) =>
                setSelectedReceiptFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <span className={styles.manualPaymentsHint}>
              {selectedReceiptFile
                ? `Comprobante seleccionado: ${selectedReceiptFileName}`
                : "Sin comprobante seleccionado."}
            </span>
            {paymentRegistrationError ? (
              <span className={styles.manualPaymentsHint}>{paymentRegistrationError}</span>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => handleRegisterPaymentDialogOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={
                actionDisabled ||
                isRegisterPaymentSubmitting ||
                maxPaymentsPerRecord <= 0 ||
                !hasValidManualDraft
              }
              onClick={() => {
                void handleRegisterPaymentRecord();
              }}
              type="button"
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Popover>
        <PopoverTrigger asChild>
          <Button className={styles.extraReceiptsTrigger} type="button" variant="link">
            {receiptPaymentRecordsCount > 0
              ? `${paymentRecords.length} ${recordsCountLabel} · 📎 ${receiptPaymentRecordsCount} ${receiptCountLabel}`
              : `${paymentRecords.length} ${recordsCountLabel}`}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className={styles.extraReceiptsPopover}>
          <div className={styles.extraReceiptsList}>
            <div className={styles.manualPaymentsControls}>
              <Button
                aria-label={`Agregar nuevo registro de pago para ${expenseDescription}`}
                className={styles.manualPaymentsRegisterButton}
                disabled={actionDisabled || maxPaymentsPerRecord <= 0}
                onClick={() => setIsRegisterPaymentDialogOpen(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Agregar nuevo registro de pago
              </Button>
            </div>
            {sortedPaymentRecords.map((paymentRecord) => {
              const displayDate = paymentRecord.registeredAt
                ? formatPaymentRecordDate(paymentRecord.registeredAt)
                : "Sin fecha";
              const paymentsLabel = paymentRecord.coveredPayments === 1
                ? "pago"
                : "pagos";
              const recordLabel =
                `${displayDate} — ${paymentRecord.coveredPayments} ${paymentsLabel}`;
              const receiptFileUrl = paymentRecord.receipt
                ? getValidHttpUrl(paymentRecord.receipt.fileViewUrl)
                : null;

              return (
                <div className={styles.extraReceiptRow} key={paymentRecord.id}>
                  {paymentRecord.receipt
                    ? <DriveStatusBadge status={paymentRecord.receipt.fileStatus} />
                    : null}
                  <div className={styles.extraReceiptInfo}>
                    <span>{recordLabel}</span>
                    {paymentRecord.receipt && receiptFileUrl
                      ? (
                          <a
                            className={styles.paymentLinkAction}
                            href={receiptFileUrl}
                            rel="noopener noreferrer"
                            target="_blank"
                          >
                            📎 Ver comprobante
                            <ExternalLink
                              aria-hidden="true"
                              className={styles.paymentLinkIcon}
                            />
                          </a>
                        )
                      : null}
                  </div>
                  {paymentRecord.receipt
                    ? (
                        <div className={styles.paymentRecordActions}>
                          <Button
                            aria-label={`Editar cobertura de comprobante ${paymentRecord.receipt.fileName}`}
                            className={styles.receiptEditButton}
                            disabled={actionDisabled}
                            onClick={() =>
                              onEditReceiptCoverage({
                                expenseId,
                                receiptFileId: paymentRecord.receipt?.fileId ?? "",
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
                                expenseId,
                                receiptFileId: paymentRecord.receipt?.fileId ?? "",
                              })}
                            receiptFileName={paymentRecord.receipt.fileName}
                          />
                        </div>
                      )
                    : (
                        <div className={styles.paymentRecordActions}>
                          <Button
                            aria-label={`Editar registro manual de ${expenseDescription}`}
                            className={styles.receiptEditButton}
                            disabled={actionDisabled}
                            onClick={() => {
                              const nextCoveredPaymentsValue = window.prompt(
                                "Ingresá la nueva cantidad de pagos",
                                String(paymentRecord.coveredPayments),
                              );

                              if (!nextCoveredPaymentsValue) {
                                return;
                              }

                              const parsedCoveredPayments = Number(
                                nextCoveredPaymentsValue,
                              );

                              onEditManualPaymentRecord({
                                coveredPayments: parsedCoveredPayments,
                                expenseId,
                                paymentRecordId: paymentRecord.id,
                              });
                            }}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            aria-label={`Eliminar registro manual de ${expenseDescription}`}
                            className={styles.receiptDeleteButton}
                            disabled={actionDisabled}
                            onClick={() =>
                              onDeleteManualPaymentRecord({
                                expenseId,
                                paymentRecordId: paymentRecord.id,
                              })}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
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
  isMonthTransitionPending,
  isSubmitting,
  lenders,
  loadError,
  month,
  pendingMonth,
  onAddExpense,
  onAddLender,
  onCopyFromMonth,
  onCopySourceMonthChange,
  onDeleteAllReceiptsFolderReference,
  onDeleteExpense,
  onDeleteExpenseReceiptShare,
  onDeletePaymentLink,
  onDeleteMonthlyFolderReference,
  onEditExpense,
  onExpenseFieldChange,
  onExpenseLenderSelect,
  onExpenseLoanToggle,
  onExpenseReceiptShareToggle,
  onDeleteReceipt,
  onEditReceiptCoverage,
  onRegisterPaymentRecord,
  onDeleteManualPaymentRecord,
  onEditManualPaymentRecord,
  onUpdatePaymentLink,
  onUpdateExpenseOccurrencesPerMonth,
  onUpdateExpenseReceiptShare,
  onUpdateExpenseSubtotal,
  onUpdateReceiptShareStatus,
  onMonthChange,
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
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    MONTHLY_EXPENSES_DEFAULT_COLUMN_VISIBILITY,
  );
  const [isRestoringTablePreferences, setIsRestoringTablePreferences] =
    useState(true);
  const [descriptionFilter, setDescriptionFilter] = useState("");
  const [paymentLinkDialogState, setPaymentLinkDialogState] =
    useState<PaymentLinkDialogState | null>(null);
  const [paymentLinkDraftValue, setPaymentLinkDraftValue] = useState("");
  const [paymentLinkDraftError, setPaymentLinkDraftError] =
    useState<string | null>(null);
  const [subtotalDialogState, setSubtotalDialogState] =
    useState<ExpenseSubtotalDialogState | null>(null);
  const [subtotalDraftValue, setSubtotalDraftValue] = useState("");
  const [subtotalDraftError, setSubtotalDraftError] = useState<string | null>(null);
  const [occurrencesDialogState, setOccurrencesDialogState] =
    useState<ExpenseOccurrencesDialogState | null>(null);
  const [occurrencesDraftValue, setOccurrencesDraftValue] = useState("");
  const [occurrencesDraftError, setOccurrencesDraftError] =
    useState<string | null>(null);
  const [receiptShareDialogState, setReceiptShareDialogState] =
    useState<ExpenseReceiptShareDialogState | null>(null);
  const [receiptSharePhoneDraftValue, setReceiptSharePhoneDraftValue] = useState("");
  const [receiptShareMessageDraftValue, setReceiptShareMessageDraftValue] = useState("");
  const [receiptShareDraftError, setReceiptShareDraftError] =
    useState<string | null>(null);
  const handleDialogInputAutoFocus = useCallback(
    (event: Event, inputId: string) => {
      event.preventDefault();

      window.requestAnimationFrame(() => {
        const inputElement = document.getElementById(inputId);

        if (
          inputElement instanceof HTMLInputElement ||
          inputElement instanceof HTMLTextAreaElement
        ) {
          inputElement.focus();

          if (inputElement instanceof HTMLTextAreaElement) {
            const selectionPosition = inputElement.value.length;
            inputElement.setSelectionRange(selectionPosition, selectionPosition);
          }
        }
      });
    },
    [],
  );
  const focusDialogInputById = useCallback((inputId: string) => {
    const focusTimeoutId = window.setTimeout(() => {
      const inputElement = document.getElementById(inputId);

      if (
        inputElement instanceof HTMLInputElement ||
        inputElement instanceof HTMLTextAreaElement
      ) {
        inputElement.focus();

        if (inputElement instanceof HTMLTextAreaElement) {
          const selectionPosition = inputElement.value.length;
          inputElement.setSelectionRange(selectionPosition, selectionPosition);
        }
      }
    }, 0);

    return () => {
      window.clearTimeout(focusTimeoutId);
    };
  }, []);

  useEffect(() => {
    if (!subtotalDialogState) {
      return;
    }

    return focusDialogInputById("subtotal-dialog-input");
  }, [focusDialogInputById, subtotalDialogState]);

  useEffect(() => {
    if (!occurrencesDialogState) {
      return;
    }

    return focusDialogInputById("occurrences-dialog-input");
  }, [focusDialogInputById, occurrencesDialogState]);

  useEffect(() => {
    if (!receiptShareDialogState) {
      return;
    }

    return focusDialogInputById("receipt-share-phone-dialog-input");
  }, [focusDialogInputById, receiptShareDialogState]);

  useEffect(() => {
    if (!paymentLinkDialogState) {
      return;
    }

    return focusDialogInputById("payment-link-dialog-input");
  }, [focusDialogInputById, paymentLinkDialogState]);

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

  const getSortDirection = useCallback(
    (columnId: string) => getColumnSortDirection(sorting, columnId),
    [sorting],
  );
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
  const completedPendingReceiptShareCount = useMemo(() => {
    let pendingCount = 0;

    for (const row of rows) {
      if (!isPaymentCompleted(row)) {
        continue;
      }

      const normalizedStatus = getNormalizedReceiptShareStatus(row);

      if (!normalizedStatus) {
        continue;
      }

      if (normalizedStatus === "pending") {
        pendingCount += 1;
      }
    }

    return pendingCount;
  }, [rows]);
  const completedPendingReceiptShareExpenses = useMemo(() => {
    const pendingExpenses: Array<{
      displayDescription: string;
      expenseId: string;
      rawDescription: string;
    }> = [];

    for (const row of rows) {
      if (!isPaymentCompleted(row)) {
        continue;
      }

      const normalizedStatus = getNormalizedReceiptShareStatus(row);

      if (normalizedStatus !== "pending") {
        continue;
      }

      pendingExpenses.push({
        displayDescription: row.description.trim() || "Gasto sin descripción",
        expenseId: row.id,
        rawDescription: row.description,
      });
    }

    return pendingExpenses;
  }, [rows]);
  const completedPendingReceiptShareMessage = useMemo(() => {
    const hasSinglePendingReceipt = completedPendingReceiptShareCount === 1;
    const completedLabel = hasSinglePendingReceipt ? "completo" : "completos";

    return `${completedPendingReceiptShareCount} pago${hasSinglePendingReceipt ? "" : "s"} ${completedLabel} con comprobante${hasSinglePendingReceipt ? "" : "s"} pendiente${hasSinglePendingReceipt ? "" : "s"} de envío:`;
  }, [completedPendingReceiptShareCount]);

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

  const handleOpenSubtotalDialog = useCallback(({
    currency,
    expenseDescription,
    expenseId,
    subtotal,
  }: {
    currency: MonthlyExpenseCurrency;
    expenseDescription: string;
    expenseId: string;
    subtotal: string;
  }) => {
    setSubtotalDialogState({
      currency,
      expenseDescription,
      expenseId,
    });
    setSubtotalDraftValue(subtotal);
    setSubtotalDraftError(null);
  }, []);

  const handleCloseSubtotalDialog = () => {
    setSubtotalDialogState(null);
    setSubtotalDraftValue("");
    setSubtotalDraftError(null);
  };

  const handleSaveSubtotal = async () => {
    if (!subtotalDialogState) {
      return;
    }

    const normalizedSubtotal = Number(subtotalDraftValue);

    const subtotalValidationError = validateSubtotalAmount(normalizedSubtotal);

    if (subtotalValidationError) {
      setSubtotalDraftError(subtotalValidationError);
      return;
    }

    setSubtotalDraftError(null);
    await onUpdateExpenseSubtotal({
      expenseId: subtotalDialogState.expenseId,
      subtotal: normalizedSubtotal,
    });
    handleCloseSubtotalDialog();
  };

  const handleOpenOccurrencesDialog = useCallback(({
    expenseDescription,
    expenseId,
    occurrencesPerMonth,
  }: {
    expenseDescription: string;
    expenseId: string;
    occurrencesPerMonth: string;
  }) => {
    setOccurrencesDialogState({
      expenseDescription,
      expenseId,
    });
    setOccurrencesDraftValue(occurrencesPerMonth);
    setOccurrencesDraftError(null);
  }, []);

  const handleCloseOccurrencesDialog = () => {
    setOccurrencesDialogState(null);
    setOccurrencesDraftValue("");
    setOccurrencesDraftError(null);
  };

  const handleSaveOccurrences = async () => {
    if (!occurrencesDialogState) {
      return;
    }

    const normalizedOccurrences = Number(occurrencesDraftValue);

    const occurrencesValidationError =
      validateOccurrencesPerMonth(normalizedOccurrences);

    if (occurrencesValidationError) {
      setOccurrencesDraftError(occurrencesValidationError);
      return;
    }

    setOccurrencesDraftError(null);
    await onUpdateExpenseOccurrencesPerMonth({
      expenseId: occurrencesDialogState.expenseId,
      occurrencesPerMonth: normalizedOccurrences,
    });
    handleCloseOccurrencesDialog();
  };

  const handleOpenReceiptShareDialog = useCallback(({
    expenseDescription,
    expenseId,
    mode,
    receiptShareMessage,
    receiptSharePhoneDigits,
  }: {
    expenseDescription: string;
    expenseId: string;
    mode: "create" | "edit";
    receiptShareMessage: string;
    receiptSharePhoneDigits: string;
  }) => {
    setReceiptShareDialogState({
      expenseDescription,
      expenseId,
      mode,
    });
    setReceiptSharePhoneDraftValue(receiptSharePhoneDigits);
    setReceiptShareMessageDraftValue(receiptShareMessage);
    setReceiptShareDraftError(null);
  }, []);

  const handleCloseReceiptShareDialog = () => {
    setReceiptShareDialogState(null);
    setReceiptSharePhoneDraftValue("");
    setReceiptShareMessageDraftValue("");
    setReceiptShareDraftError(null);
  };

  const handleSaveReceiptShare = async () => {
    if (!receiptShareDialogState) {
      return;
    }

    const normalizedPhoneDigits = normalizeReceiptSharePhoneDigits(
      receiptSharePhoneDraftValue,
    );

    if (!normalizedPhoneDigits) {
      setReceiptShareDraftError(RECEIPT_SHARE_PHONE_REQUIRED_ERROR_MESSAGE);
      return;
    }

    const receiptSharePhoneValidationError =
      validateReceiptSharePhoneDigits(normalizedPhoneDigits);

    if (receiptSharePhoneValidationError) {
      setReceiptShareDraftError(receiptSharePhoneValidationError);
      return;
    }

    setReceiptShareDraftError(null);
    await onUpdateExpenseReceiptShare({
      expenseId: receiptShareDialogState.expenseId,
      receiptShareMessage: receiptShareMessageDraftValue,
      receiptSharePhoneDigits: normalizedPhoneDigits,
    });
    handleCloseReceiptShareDialog();
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
        sortingFn: (rowA, rowB) =>
          compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) =>
              leftValue.localeCompare(rightValue, "es", {
                sensitivity: "base",
              }),
            leftValue: rowA.original.description,
            rightValue: rowB.original.description,
            sortDirection: getSortDirection("description"),
          }),
      },
      {
        accessorKey: "subtotal",
        cell: ({ row }) => {
          const expenseDescription = row.original.description.trim() || "gasto";

          return (
            <div className={styles.quickEditCell}>
              <span>
                {formatArsWithUsdSecondary({
                  exchangeRateSnapshot,
                  rowCurrency: row.original.currency,
                  value: row.original.subtotal,
                })}
              </span>
              <QuickEditActionsMenu
                actionDisabled={actionDisabled}
                editActionLabel="Editar subtotal"
                expenseDescription={expenseDescription}
                onEdit={() =>
                  handleOpenSubtotalDialog({
                    currency: row.original.currency,
                    expenseId: row.original.id,
                    expenseDescription,
                    subtotal: row.original.subtotal,
                  })}
                triggerAriaLabel="Abrir acciones de subtotal"
              />
            </div>
          );
        },
        header: getSortableHeader("Subtotal"),
        meta: { label: "Subtotal" },
        sortingFn: (rowA, rowB) =>
          compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) => leftValue - rightValue,
            leftValue: getArsComparableAmount({
              exchangeRateSnapshot,
              rowCurrency: rowA.original.currency,
              value: rowA.original.subtotal,
            }),
            rightValue: getArsComparableAmount({
              exchangeRateSnapshot,
              rowCurrency: rowB.original.currency,
              value: rowB.original.subtotal,
            }),
            sortDirection: getSortDirection("subtotal"),
          }),
      },
      {
        accessorKey: "occurrencesPerMonth",
        cell: ({ row }) => {
          const expenseDescription = row.original.description.trim() || "gasto";

          return (
            <div className={styles.quickEditCell}>
              <span>{row.original.occurrencesPerMonth}</span>
              <QuickEditActionsMenu
                actionDisabled={actionDisabled}
                editActionLabel="Editar pagos por mes"
                expenseDescription={expenseDescription}
                onEdit={() =>
                  handleOpenOccurrencesDialog({
                    expenseId: row.original.id,
                    expenseDescription,
                    occurrencesPerMonth: row.original.occurrencesPerMonth,
                  })}
                triggerAriaLabel="Abrir acciones de pagos por mes"
              />
            </div>
          );
        },
        header: getSortableHeader("por mes"),
        meta: { label: "por mes" },
        sortingFn: (rowA, rowB) =>
          compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) => leftValue - rightValue,
            leftValue: Number(rowA.original.occurrencesPerMonth),
            rightValue: Number(rowB.original.occurrencesPerMonth),
            sortDirection: getSortDirection("occurrencesPerMonth"),
          }),
      },
      {
        accessorKey: "total",
        cell: ({ row }) => (
          <span className={styles.totalAmount}>
            {formatArsWithUsdSecondary({
              exchangeRateSnapshot,
              rowCurrency: row.original.currency,
              value: row.original.total,
            })}
          </span>
        ),
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
        header: getSortableHeader("Total"),
        meta: { label: "Total" },
        sortingFn: (rowA, rowB) =>
          compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) => leftValue - rightValue,
            leftValue: getArsComparableAmount({
              exchangeRateSnapshot,
              rowCurrency: rowA.original.currency,
              value: rowA.original.total,
            }),
            rightValue: getArsComparableAmount({
              exchangeRateSnapshot,
              rowCurrency: rowB.original.currency,
              value: rowB.original.total,
            }),
            sortDirection: getSortDirection("total"),
          }),
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

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) => leftValue - rightValue,
            leftValue: leftAmount,
            rightValue: rightAmount,
            sortDirection: getSortDirection("usd"),
          });
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

              <PaymentLinkActionsMenu
                actionDisabled={actionDisabled}
                expenseDescription={expenseDescription}
                onDelete={() => onDeletePaymentLink(row.original.id)}
                onEdit={() =>
                  handleOpenPaymentLinkDialog({
                    expenseDescription,
                    expenseId: row.original.id,
                    mode: "edit",
                    paymentLink: row.original.paymentLink,
                  })}
              />
            </div>
          );
        },
        header: getSortableHeader("Link"),
        meta: { label: "Link" },
        sortingFn: (rowA, rowB) => {
          const leftPaymentLink = getValidPaymentLinkUrl(rowA.original.paymentLink);
          const rightPaymentLink = getValidPaymentLinkUrl(rowB.original.paymentLink);

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) =>
              leftValue.localeCompare(rightValue, "es", {
                sensitivity: "base",
              }),
            leftValue: leftPaymentLink,
            rightValue: rightPaymentLink,
            sortDirection: getSortDirection("paymentLink"),
          });
        },
      },
      {
        accessorKey: "receiptShareStatus",
        cell: ({ row }) => {
          const normalizedStatus = getNormalizedReceiptShareStatus(row.original);

          if (!normalizedStatus) {
            return null;
          }

          const expenseDescription = row.original.description.trim() || "gasto";
          const isPaymentFullyCompleted = isPaymentCompleted(row.original);
          const statusToneClassName = getReceiptShareStatusToneClassName({
            isPaymentFullyCompleted,
            status: normalizedStatus,
          });

          return (
              <Select
                onValueChange={(value) => {
                void onUpdateReceiptShareStatus({
                  expenseId: row.original.id,
                  receiptShareStatus: value as MonthlyExpenseReceiptShareStatus,
                });
              }}
              value={normalizedStatus}
            >
              <SelectTrigger
                aria-label={`Estado de envío de ${expenseDescription}`}
                className={cn(
                  styles.receiptShareStatusControl,
                  statusToneClassName,
                )}
              >
                <SelectValue>
                  <span className={styles.receiptShareStatusValue}>
                    {(() => {
                      const StatusIcon = getReceiptShareStatusIcon(normalizedStatus);

                      return <StatusIcon aria-hidden="true" className={styles.paymentLinkIcon} />;
                    })()}
                    <span>{getReceiptShareStatusLabel(normalizedStatus)}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  className={cn(
                    styles.receiptShareStatusControl,
                    getReceiptShareStatusToneClassName({
                      isPaymentFullyCompleted,
                      status: "pending",
                    }),
                  )}
                  value="pending"
                >
                  <span className={styles.receiptShareStatusValue}>
                    <Clock3 aria-hidden="true" className={styles.paymentLinkIcon} />
                    <span>Pendiente</span>
                  </span>
                </SelectItem>
                <SelectItem
                  className={cn(
                    styles.receiptShareStatusControl,
                    getReceiptShareStatusToneClassName({
                      isPaymentFullyCompleted,
                      status: "sent",
                    }),
                  )}
                  value="sent"
                >
                  <span className={styles.receiptShareStatusValue}>
                    <Mail aria-hidden="true" className={styles.paymentLinkIcon} />
                    <span>Enviado</span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          );
        },
        header: getSortableHeader("Estado de envío"),
        meta: { label: "Estado de envío" },
        sortingFn: (rowA, rowB) => {
          const leftStatus = getNormalizedReceiptShareStatus(rowA.original);
          const rightStatus = getNormalizedReceiptShareStatus(rowB.original);

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) => {
              const leftRank = leftValue === "pending" ? 0 : 1;
              const rightRank = rightValue === "pending" ? 0 : 1;

              return leftRank - rightRank;
            },
            leftValue: leftStatus,
            rightValue: rightStatus,
            sortDirection: getSortDirection("receiptShareStatus"),
          });
        },
      },
      {
        id: "receiptShareLink",
        accessorFn: (row) => getReceiptShareWhatsAppLink(row),
        cell: ({ row }) => {
          const receiptShareLink = getReceiptShareWhatsAppLink(row.original);
          const expenseDescription = row.original.description.trim() || "gasto";
          const hasReceiptShareTarget =
            row.original.requiresReceiptShare &&
            row.original.receiptSharePhoneDigits.trim().length > 0;

          if (!hasReceiptShareTarget) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={`Agregar datos de envío para ${expenseDescription}`}
                    className={styles.paymentLinkActionButton}
                    disabled={actionDisabled}
                    onClick={() =>
                      handleOpenReceiptShareDialog({
                        expenseId: row.original.id,
                        expenseDescription,
                        mode: "create",
                        receiptShareMessage: row.original.receiptShareMessage,
                        receiptSharePhoneDigits: row.original.receiptSharePhoneDigits,
                      })}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agregar datos de envío</TooltipContent>
              </Tooltip>
            );
          }

          const phoneDigits = row.original.receiptSharePhoneDigits.trim();
          const formattedPhoneDigits = formatReceiptSharePhoneDisplay(phoneDigits);

          return (
            <div className={styles.paymentLinkActionsRow}>
              {receiptShareLink ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      className={styles.paymentLinkAction}
                      href={receiptShareLink}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Enviar
                      <ExternalLink aria-hidden="true" className={styles.paymentLinkIcon} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>
                    {`Enviar comprobante a ${formattedPhoneDigits || phoneDigits}`}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span className={styles.mutedValue}>Sin comprobantes</span>
              )}
              <QuickEditActionsMenu
                actionDisabled={actionDisabled}
                confirmDeleteActionAriaLabel={`Confirmar eliminación de datos de envío para ${expenseDescription}`}
                confirmDeleteActionDescription="Esta acción borra el número de WhatsApp y el mensaje guardado para compartir comprobantes."
                confirmDeleteActionTitle="¿Querés eliminar estos datos de envío?"
                deleteActionLabel="Eliminar datos de envío"
                editActionLabel="Editar datos de envío"
                expenseDescription={expenseDescription}
                onDelete={() => onDeleteExpenseReceiptShare(row.original.id)}
                onEdit={() =>
                  handleOpenReceiptShareDialog({
                    expenseId: row.original.id,
                    expenseDescription,
                    mode: "edit",
                    receiptShareMessage: row.original.receiptShareMessage,
                    receiptSharePhoneDigits: row.original.receiptSharePhoneDigits,
                  })}
                triggerAriaLabel="Abrir acciones de envío"
              />
            </div>
          );
        },
        header: getSortableHeader("Enviar"),
        meta: { label: "Enviar" },
        sortingFn: (rowA, rowB) => {
          const leftLink = getReceiptShareWhatsAppLink(rowA.original);
          const rightLink = getReceiptShareWhatsAppLink(rowB.original);

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) =>
              leftValue.localeCompare(rightValue, "es", {
                sensitivity: "base",
              }),
            leftValue: leftLink,
            rightValue: rightLink,
            sortDirection: getSortDirection("receiptShareLink"),
          });
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
        id: "paymentHistory",
        accessorFn: (row) => (row.paymentRecords ?? []).length,
        cell: ({ row }) => {
          const { coveredPayments, requiredPayments } = getPaymentProgress(
            row.original,
          );
          const maxManualCoveredPayments = Math.max(
            requiredPayments - coveredPayments,
            0,
          );
          const expenseDescription = row.original.description.trim() || "gasto";

          return (
            <PaymentHistoryCell
              actionDisabled={actionDisabled}
              expenseDescription={expenseDescription}
              expenseId={row.original.id}
              maxPaymentsPerRecord={maxManualCoveredPayments}
              onRegisterPaymentRecord={onRegisterPaymentRecord}
              onDeleteManualPaymentRecord={onDeleteManualPaymentRecord}
              onDeleteReceipt={onDeleteReceipt}
              onEditManualPaymentRecord={onEditManualPaymentRecord}
              onEditReceiptCoverage={onEditReceiptCoverage}
              paymentRecords={row.original.paymentRecords ?? []}
            />
          );
        },
        header: getSortableHeader("Registro de pagos"),
        meta: { label: "Registro de pagos" },
        sortingFn: (rowA, rowB) =>
          (rowA.original.paymentRecords ?? []).length -
          (rowB.original.paymentRecords ?? []).length,
      },
      {
        accessorKey: "loanProgress",
        cell: ({ row }) => {
          if (!row.original.isLoan) {
            return "N/A";
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
          const leftValue = rowA.original.isLoan
            ? getLoanSortValue(rowA.original, loanSortMode)
            : null;
          const rightValue = rowB.original.isLoan
            ? getLoanSortValue(rowB.original, loanSortMode)
            : null;

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftNumericValue, rightNumericValue) => {
              const difference = leftNumericValue - rightNumericValue;

              if (difference !== 0) {
                return difference;
              }

              return rowA.original.description.localeCompare(
                rowB.original.description,
                "es",
              );
            },
            leftValue,
            rightValue,
            sortDirection: getSortDirection(LOAN_SORT_COLUMN_ID),
          });
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
        sortingFn: (rowA, rowB) =>
          compareValuesKeepingInvalidLast({
            compareValidValues: (leftValue, rightValue) =>
              leftValue.localeCompare(rightValue, "es", {
                sensitivity: "base",
              }),
            leftValue: rowA.original.lenderName.trim(),
            rightValue: rowB.original.lenderName.trim(),
            sortDirection: getSortDirection("lenderName"),
          }),
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

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftNumericValue, rightNumericValue) => {
              const difference = leftNumericValue - rightNumericValue;

              if (difference !== 0) {
                return difference;
              }

              return rowA.original.description.localeCompare(
                rowB.original.description,
                "es",
              );
            },
            leftValue,
            rightValue,
            sortDirection: loanInstallmentStartSortDirection,
          });
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

          return compareValuesKeepingInvalidLast({
            compareValidValues: (leftNumericValue, rightNumericValue) => {
              const difference = leftNumericValue - rightNumericValue;

              if (difference !== 0) {
                return difference;
              }

              return rowA.original.description.localeCompare(
                rowB.original.description,
                "es",
              );
            },
            leftValue,
            rightValue,
            sortDirection: loanInstallmentEndSortDirection,
          });
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const monthlyFolderViewUrl = getValidHttpUrl(row.original.monthlyFolderViewUrl);
          const allReceiptsFolderViewUrl = getValidHttpUrl(
            row.original.allReceiptsFolderViewUrl,
          );
          const canDeleteMonthlyFolderReference = isBrokenDriveStatus(
            row.original.monthlyFolderStatus,
          );
          const canDeleteAllReceiptsFolderReference = isBrokenDriveStatus(
            row.original.allReceiptsFolderStatus,
          );

          return (
            <div className={styles.actionsCell}>
              <ExpenseRowActions
                actionDisabled={actionDisabled}
                allReceiptsFolderViewUrl={allReceiptsFolderViewUrl}
                canDeleteAllReceiptsFolderReference={
                  canDeleteAllReceiptsFolderReference
                }
                canDeleteMonthlyFolderReference={canDeleteMonthlyFolderReference}
                description={row.original.description}
                monthlyFolderViewUrl={monthlyFolderViewUrl}
                onDelete={() => onDeleteExpense(row.original.id)}
                onDeleteAllReceiptsFolderReference={() =>
                  onDeleteAllReceiptsFolderReference(row.original.id)}
                onDeleteMonthlyFolderReference={() =>
                  onDeleteMonthlyFolderReference(row.original.id)}
                onEdit={() => onEditExpense(row.original.id)}
              />
            </div>
          );
        },
        enableHiding: false,
        enableSorting: false,
        header: () => null,
        meta: { cellClassName: styles.stickyActionsCell },
      },
    ],
    [
      actionDisabled,
      exchangeRateSnapshot,
      getSortDirection,
      loanInstallmentEndSortDirection,
      loanInstallmentStartSortDirection,
      loanSortMode,
      onDeleteAllReceiptsFolderReference,
      onDeleteExpense,
      onDeletePaymentLink,
      onDeleteExpenseReceiptShare,
      onDeleteMonthlyFolderReference,
      onDeleteReceipt,
      onDeleteManualPaymentRecord,
      onEditReceiptCoverage,
      onEditManualPaymentRecord,
      onEditExpense,
      onRegisterPaymentRecord,
      onUpdateReceiptShareStatus,
      handleOpenSubtotalDialog,
      handleOpenOccurrencesDialog,
      handleOpenReceiptShareDialog,
      handleOpenPaymentLinkDialog,
    ],
  );

  return (
    <section
      aria-busy={isMonthTransitionPending || isRestoringTablePreferences}
      className={styles.section}
    >
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
                disabled={isMonthTransitionPending}
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
              disabled={actionDisabled || isMonthTransitionPending}
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
            {completedPendingReceiptShareCount > 0 ? (
              <div
                aria-live="polite"
                className={cn(styles.receiptShareSummary, styles.receiptShareSummaryInfo)}
                role="status"
              >
                <AlertTriangle
                  aria-hidden="true"
                  className={styles.receiptShareSummaryIcon}
                />
                <div className={styles.receiptShareSummaryContent}>
                  <p className={styles.receiptShareSummaryText}>
                    {completedPendingReceiptShareMessage}
                  </p>
                  <ul className={styles.receiptShareSummaryList}>
                    {completedPendingReceiptShareExpenses.map((expense) => (
                      <li
                        key={expense.expenseId}
                        className={styles.receiptShareSummaryListItem}
                      >
                        <span className={styles.receiptShareSummaryListDescription}>
                          {expense.displayDescription}
                        </span>
                        <Button
                          aria-label={`Filtrar gasto ${expense.displayDescription}`}
                          className={styles.receiptShareSummaryFilterButton}
                          onClick={() => setDescriptionFilter(expense.rawDescription)}
                          type="button"
                          variant="ghost"
                        >
                          Filtrar
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            {isRestoringTablePreferences || isMonthTransitionPending ? (
              <div
                aria-label={
                  isMonthTransitionPending && pendingMonth
                    ? `Cargando mes ${pendingMonth}`
                    : "Cargando configuración de tabla"
                }
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
                    {isMonthTransitionPending && pendingMonth
                      ? `Cargando ${pendingMonth}...`
                      : "Cargando configuración de tabla..."}
                  </span>
                </div>
              </div>
            ) : null}
            <DataTable
              columnVisibility={columnVisibility}
              columnVisibilityButtonLabel="Columnas"
              columnVisibilityMenuLabel="Mostrar columnas"
              columns={columns}
              hideableColumnsDefaultVisibility={
                MONTHLY_EXPENSES_DEFAULT_COLUMN_VISIBILITY
              }
              data={fuzzySortedRows}
              emptyMessage="No hay gastos cargados para este mes."
              filterColumnId="description"
              filterLabel="Filtrar gastos"
              filterPlaceholder="Filtrar gastos por descripción"
              filterValue={descriptionFilter}
              getRowClassName={(row) =>
                isPaymentCompleted(row) ? styles.paidRow : undefined
              }
              onFilterValueChange={setDescriptionFilter}
              onColumnVisibilityChange={setColumnVisibility}
              onSortingChange={setSorting}
              selectAllColumnsLabel="Restablecer"
              showColumnVisibilityToggle={true}
              sortingBadgeLabelOverrides={{
                [LOAN_SORT_COLUMN_ID]: `Deuda / cuotas (${getLoanSortModeLabel(loanSortMode)})`,
              }}
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
          onReceiptShareToggle={onExpenseReceiptShareToggle}
          onRequestClose={onRequestCloseExpenseSheet}
          onSave={onSaveExpense}
          onUnsavedChangesClose={onUnsavedChangesClose}
          onUnsavedChangesDiscard={onUnsavedChangesDiscard}
          onUnsavedChangesSave={onSaveUnsavedChanges}
          showUnsavedChangesDialog={showUnsavedChangesDialog}
          validationMessage={validationMessage}
        />

        <AlertDialog
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleCloseSubtotalDialog();
            }
          }}
          open={subtotalDialogState != null}
        >
          <AlertDialogContent
            className={styles.paymentLinkDialogContent}
            onOpenAutoFocus={(event) => {
              handleDialogInputAutoFocus(event, "subtotal-dialog-input");
            }}
            size="sm"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Editar subtotal</AlertDialogTitle>
              <AlertDialogDescription>
                {`Actualizá el subtotal de ${subtotalDialogState?.expenseDescription ?? "este gasto"}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className={styles.paymentLinkDialogField}>
              <Label htmlFor="subtotal-dialog-input">Subtotal</Label>
              <InputGroup>
                <InputGroupAddon align="inline-start" aria-hidden="true">
                  {subtotalDialogState?.currency === "USD" ? "US$" : "$"}
                </InputGroupAddon>
                <InputGroupInput
                  aria-invalid={subtotalDraftError ? "true" : "false"}
                  aria-label={`Subtotal de ${subtotalDialogState?.expenseDescription ?? "gasto"}`}
                  autoFocus
                  id="subtotal-dialog-input"
                  inputMode="decimal"
                  onChange={(event) => {
                    setSubtotalDraftValue(
                      normalizeCurrencyInput(event.target.value),
                    );

                    if (subtotalDraftError) {
                      setSubtotalDraftError(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveSubtotal();
                    }
                  }}
                  placeholder="0"
                  type="text"
                  value={formatCurrencyDisplayWithOptions(subtotalDraftValue, {
                    preserveExplicitFractionDigits: true,
                  })}
                />
              </InputGroup>
              {subtotalDraftError ? (
                <p className={styles.paymentLinkDialogError} role="alert">
                  {subtotalDraftError}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter className={styles.paymentLinkDialogActions}>
              <Button
                onClick={handleCloseSubtotalDialog}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={actionDisabled}
                onClick={() => {
                  void handleSaveSubtotal();
                }}
                type="button"
              >
                Guardar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleCloseOccurrencesDialog();
            }
          }}
          open={occurrencesDialogState != null}
        >
          <AlertDialogContent
            className={styles.paymentLinkDialogContent}
            onOpenAutoFocus={(event) => {
              handleDialogInputAutoFocus(event, "occurrences-dialog-input");
            }}
            size="sm"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Editar pagos por mes</AlertDialogTitle>
              <AlertDialogDescription>
                {`Actualizá la frecuencia mensual de ${occurrencesDialogState?.expenseDescription ?? "este gasto"}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className={styles.paymentLinkDialogField}>
              <Label htmlFor="occurrences-dialog-input">Pagos por mes</Label>
              <Input
                aria-invalid={occurrencesDraftError ? "true" : "false"}
                aria-label={`Pagos por mes de ${occurrencesDialogState?.expenseDescription ?? "gasto"}`}
                autoFocus
                id="occurrences-dialog-input"
                inputMode="numeric"
                min="1"
                onChange={(event) => {
                  setOccurrencesDraftValue(event.target.value);

                  if (occurrencesDraftError) {
                    setOccurrencesDraftError(null);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSaveOccurrences();
                  }
                }}
                step="1"
                type="number"
                value={occurrencesDraftValue}
              />
              {occurrencesDraftError ? (
                <p className={styles.paymentLinkDialogError} role="alert">
                  {occurrencesDraftError}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter className={styles.paymentLinkDialogActions}>
              <Button
                onClick={handleCloseOccurrencesDialog}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={actionDisabled}
                onClick={() => {
                  void handleSaveOccurrences();
                }}
                type="button"
              >
                Guardar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleCloseReceiptShareDialog();
            }
          }}
          open={receiptShareDialogState != null}
        >
          <AlertDialogContent
            className={styles.paymentLinkDialogContent}
            onOpenAutoFocus={(event) => {
              handleDialogInputAutoFocus(event, "receipt-share-phone-dialog-input");
            }}
            size="sm"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {receiptShareDialogState?.mode === "create"
                  ? "Agregar datos de envío"
                  : "Editar datos de envío"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {`Completá WhatsApp y mensaje opcional para ${receiptShareDialogState?.expenseDescription ?? "este gasto"}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className={styles.paymentLinkDialogField}>
              <Label htmlFor="receipt-share-phone-dialog-input">
                Número de WhatsApp
              </Label>
              <Input
                aria-invalid={receiptShareDraftError ? "true" : "false"}
                aria-label={`Número de WhatsApp de ${receiptShareDialogState?.expenseDescription ?? "gasto"}`}
                autoFocus
                id="receipt-share-phone-dialog-input"
                inputMode="numeric"
                onChange={(event) => {
                  setReceiptSharePhoneDraftValue(
                    normalizeReceiptSharePhoneDigits(event.target.value),
                  );

                  if (receiptShareDraftError) {
                    setReceiptShareDraftError(null);
                  }
                }}
                placeholder="5491123456789"
                type="tel"
                value={formatReceiptSharePhoneDisplay(receiptSharePhoneDraftValue)}
              />
              <Label htmlFor="receipt-share-message-dialog-input">
                Mensaje opcional
              </Label>
              <Textarea
                aria-label={`Mensaje opcional de ${receiptShareDialogState?.expenseDescription ?? "gasto"}`}
                id="receipt-share-message-dialog-input"
                onChange={(event) => {
                  setReceiptShareMessageDraftValue(event.target.value);
                }}
                placeholder="Opcional"
                value={receiptShareMessageDraftValue}
              />
              {receiptShareDraftError ? (
                <p className={styles.paymentLinkDialogError} role="alert">
                  {receiptShareDraftError}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter className={styles.paymentLinkDialogActions}>
              <Button
                onClick={handleCloseReceiptShareDialog}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={actionDisabled}
                onClick={() => {
                  void handleSaveReceiptShare();
                }}
                type="button"
              >
                Guardar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              handleClosePaymentLinkDialog();
            }
          }}
          open={paymentLinkDialogState != null}
        >
          <AlertDialogContent
            className={styles.paymentLinkDialogContent}
            onOpenAutoFocus={(event) => {
              handleDialogInputAutoFocus(event, "payment-link-dialog-input");
            }}
            size="sm"
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {paymentLinkDialogState?.mode === "edit"
                  ? "Editar link de pago"
                  : "Agregar link de pago"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {`Completá el link para ${paymentLinkDialogState?.expenseDescription ?? "este gasto"}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className={styles.paymentLinkDialogField}>
              <Label htmlFor="payment-link-dialog-input">Link de pago</Label>
              <Textarea
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
                placeholder="https://..."
                value={paymentLinkDraftValue}
              />
              {paymentLinkDraftError ? (
                <p className={styles.paymentLinkDialogError} role="alert">
                  {paymentLinkDraftError}
                </p>
              ) : null}
            </div>

            <AlertDialogFooter className={styles.paymentLinkDialogActions}>
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
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
