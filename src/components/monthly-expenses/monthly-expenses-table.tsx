import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ArrowUpDown, ExternalLink } from "lucide-react";
import { z } from "zod";

import { ExpenseRowActions } from "@/components/monthly-expenses/expense-row-actions";
import {
  ExpenseSheet,
  type ExpenseEditableFieldName,
} from "@/components/monthly-expenses/expense-sheet";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
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

import type { LenderOption } from "./lender-picker";
import styles from "./monthly-expenses-table.module.scss";

type MonthlyExpenseCurrency = "ARS" | "USD";
const PAYMENT_LINK_PROTOCOL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const PAYMENT_LINK_URL_SCHEMA = z.url({
  protocol: /^https?$/,
  hostname: z.regexes.domain,
});
const DIACRITICS_PATTERN = /[\u0300-\u036f]/g;
type LoanSortMode = "paidInstallments" | "remainingInstallments" | "totalInstallments";
const DEFAULT_LOAN_SORT_MODE: LoanSortMode = "paidInstallments";
const LOAN_SORT_COLUMN_ID = "loanProgress";
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
  occurrencesPerMonth: string;
  paymentLink: string;
  startMonth: string;
  subtotal: string;
  total: string;
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
  onCopyFromMonth: () => void;
  onCopySourceMonthChange: (value: string) => void;
  onDeleteExpense: (expenseId: string) => void;
  onEditExpense: (expenseId: string) => void;
  onExpenseFieldChange: (
    fieldName: ExpenseEditableFieldName,
    value: string,
  ) => void;
  onExpenseLenderSelect: (lenderId: string | null) => void;
  onExpenseLoanToggle: (checked: boolean) => void;
  onMonthChange: (value: string) => void;
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

function formatCurrencyAmount(
  currency: MonthlyExpenseCurrency,
  value: string,
): string {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return value;
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

function getValidPaymentLink(value: string): string | null {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return null;
  }

  try {
    const paymentLinkWithProtocol = PAYMENT_LINK_PROTOCOL_PATTERN.test(
      normalizedValue,
    )
      ? normalizedValue
      : `https://${normalizedValue}`;
    return PAYMENT_LINK_URL_SCHEMA.parse(paymentLinkWithProtocol);
  } catch {
    return null;
  }
}

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .toLocaleLowerCase();
}

function getSearchCharsWithSourceIndices(
  value: string,
): Array<{ char: string; sourceIndex: number }> {
  const chars: Array<{ char: string; sourceIndex: number }> = [];

  for (let index = 0; index < value.length; index += 1) {
    const normalizedChar = normalizeSearchValue(value[index]);

    if (!normalizedChar) {
      continue;
    }

    for (const char of normalizedChar) {
      chars.push({
        char,
        sourceIndex: index,
      });
    }
  }

  return chars;
}

function getFuzzyMatchIndices(value: string, query: string): number[] | null {
  const normalizedQuery = normalizeSearchValue(query).trim();

  if (!normalizedQuery) {
    return [];
  }

  const valueChars = getSearchCharsWithSourceIndices(value);
  const queryChars = Array.from(normalizedQuery);
  const matchedIndices: number[] = [];
  let valueCursor = 0;

  for (const queryChar of queryChars) {
    let foundAt = -1;

    for (let index = valueCursor; index < valueChars.length; index += 1) {
      if (valueChars[index].char === queryChar) {
        foundAt = index;
        break;
      }
    }

    if (foundAt === -1) {
      return null;
    }

    matchedIndices.push(valueChars[foundAt].sourceIndex);
    valueCursor = foundAt + 1;
  }

  return Array.from(new Set(matchedIndices));
}

function renderHighlightedDescription(
  description: string,
  matchedIndices: number[],
) {
  if (matchedIndices.length === 0) {
    return description;
  }

  const matchedIndexSet = new Set(matchedIndices);
  const highlightedParts: ReactNode[] = [];
  let currentStart = 0;
  let partIndex = 0;

  for (let index = 0; index < description.length; index += 1) {
    if (!matchedIndexSet.has(index)) {
      continue;
    }

    if (currentStart < index) {
      highlightedParts.push(
        <span key={`description-text-${partIndex}`}>
          {description.slice(currentStart, index)}
        </span>,
      );
      partIndex += 1;
    }

    let matchEnd = index + 1;
    while (matchEnd < description.length && matchedIndexSet.has(matchEnd)) {
      matchEnd += 1;
    }

    highlightedParts.push(
      <mark
        className={styles.descriptionHighlight}
        key={`description-match-${partIndex}`}
      >
        {description.slice(index, matchEnd)}
      </mark>,
    );
    partIndex += 1;
    currentStart = matchEnd;
    index = matchEnd - 1;
  }

  if (currentStart < description.length) {
    highlightedParts.push(
      <span key={`description-text-${partIndex}`}>
        {description.slice(currentStart)}
      </span>,
    );
  }

  return highlightedParts;
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
  onCopyFromMonth,
  onCopySourceMonthChange,
  onDeleteExpense,
  onEditExpense,
  onExpenseFieldChange,
  onExpenseLenderSelect,
  onExpenseLoanToggle,
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
  const [loanSortMode, setLoanSortMode] =
    useState<LoanSortMode>(DEFAULT_LOAN_SORT_MODE);
  const [sorting, setSorting] = useState<SortingState>([]);
  const loanSortDirection = getLoanSortDirection(sorting);

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

          return renderHighlightedDescription(description, matchIndices);
        },
        enableHiding: false,
        filterFn: (row, columnId, filterValue) => {
          const description = String(row.getValue(columnId) ?? "");
          const query = String(filterValue ?? "");

          return getFuzzyMatchIndices(description, query) !== null;
        },
        header: getSortableHeader("Descripción"),
        meta: { label: "Descripción" },
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
          const paymentLink = getValidPaymentLink(row.original.paymentLink);

          if (!paymentLink) {
            return "-";
          }

          return (
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
          );
        },
        header: getSortableHeader("Link"),
        meta: { label: "Link" },
        sortingFn: (rowA, rowB) => {
          const leftHasPaymentLink =
            getValidPaymentLink(rowA.original.paymentLink) != null ? 1 : 0;
          const rightHasPaymentLink =
            getValidPaymentLink(rowB.original.paymentLink) != null ? 1 : 0;

          return leftHasPaymentLink - rightHasPaymentLink;
        },
      },
      {
        accessorKey: "loanProgress",
        cell: ({ row }) =>
          row.original.isLoan
            ? row.original.loanProgress || "Completá datos de la deuda"
            : "No aplica",
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
      },
    ],
    [
      actionDisabled,
      exchangeRateSnapshot,
      loanSortDirection,
      loanSortMode,
      onDeleteExpense,
      onEditExpense,
    ],
  );

  return (
    <section className={styles.section}>
      <div className={styles.content}>
        <div className={styles.headerTopRow}>
          <div className={styles.header}>
            <p className={styles.pageDescription}>
              Cargá, editá y guardá tus gastos mensuales en la base de datos de
              la app.
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
              <Label htmlFor="monthly-expenses-month">Mes</Label>
              <Input
                id="monthly-expenses-month"
                onChange={(event) => onMonthChange(event.target.value)}
                type="month"
                value={month}
              />
              <p className={styles.monthHint}>
                Cambiá el mes para guardar otra planilla mensual.
              </p>
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
              Editá cada gasto desde su menú de acciones y guardá los cambios del
              mes.
            </p>
          </div>

          <div className={styles.tableWrapper}>
            <DataTable
              columnVisibilityButtonLabel="Columnas"
              columnVisibilityMenuLabel="Mostrar columnas"
              columns={columns}
              data={rows}
              emptyMessage="No hay gastos cargados para este mes."
              filterColumnId="description"
              filterLabel="Filtrar gastos"
              filterPlaceholder="Filtrar gastos por descripción"
              onSortingChange={setSorting}
              showColumnVisibilityToggle={true}
              sorting={sorting}
            />
          </div>

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
        </div>

        <ExpenseSheet
          actionDisabled={actionDisabled || isSubmitting}
          changedFields={changedFields}
          draft={draft}
          isOpen={isExpenseSheetOpen}
          isSubmitting={isSubmitting}
          lenders={lenders}
          mode={sheetMode}
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
      </div>
    </section>
  );
}
