import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { ExpenseRowActions } from "@/components/monthly-expenses/expense-row-actions";
import {
  ExpenseSheet,
  type ExpenseEditableFieldName,
} from "@/components/monthly-expenses/expense-sheet";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import type { LenderOption } from "./lender-picker";
import styles from "./monthly-expenses-table.module.scss";

type MonthlyExpenseCurrency = "ARS" | "USD";

export interface MonthlyExpensesEditableRow {
  currency: MonthlyExpenseCurrency;
  description: string;
  id: string;
  installmentCount: string;
  isLoan: boolean;
  lenderId: string;
  lenderName: string;
  loanEndMonth: string;
  loanProgress: string;
  occurrencesPerMonth: string;
  startMonth: string;
  subtotal: string;
  total: string;
}

interface MonthlyExpensesTableProps {
  actionDisabled: boolean;
  changedFields: Set<string>;
  draft: MonthlyExpensesEditableRow | null;
  feedbackMessage: string;
  feedbackTone: "default" | "error" | "success";
  isExpenseSheetOpen: boolean;
  isSubmitting: boolean;
  lenders: LenderOption[];
  loadError: string | null;
  month: string;
  onAddExpense: () => void;
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
  onUnsavedChangesDiscard: () => void;
  rows: MonthlyExpensesEditableRow[];
  sheetMode: "create" | "edit";
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

export function MonthlyExpensesTable({
  actionDisabled,
  changedFields,
  draft,
  feedbackMessage,
  feedbackTone,
  isExpenseSheetOpen,
  isSubmitting,
  lenders,
  loadError,
  month,
  onAddExpense,
  onDeleteExpense,
  onEditExpense,
  onExpenseFieldChange,
  onExpenseLenderSelect,
  onExpenseLoanToggle,
  onMonthChange,
  onRequestCloseExpenseSheet,
  onSaveExpense,
  onSaveUnsavedChanges,
  onUnsavedChangesDiscard,
  rows,
  sheetMode,
  showUnsavedChangesDialog,
  validationMessage,
}: MonthlyExpensesTableProps) {
  const columns = useMemo<ColumnDef<MonthlyExpensesEditableRow>[]>(
    () => [
      {
        accessorKey: "description",
        cell: ({ row }) => row.original.description || "Sin descripción",
        header: getSortableHeader("Descripción"),
      },
      {
        accessorKey: "currency",
        header: getSortableHeader("Moneda"),
      },
      {
        accessorKey: "subtotal",
        cell: ({ row }) =>
          formatCurrencyAmount(row.original.currency, row.original.subtotal),
        header: getSortableHeader("Subtotal"),
      },
      {
        accessorKey: "occurrencesPerMonth",
        header: getSortableHeader("Veces al mes"),
      },
      {
        accessorKey: "total",
        cell: ({ row }) =>
          formatCurrencyAmount(row.original.currency, row.original.total),
        header: getSortableHeader("Total"),
      },
      {
        accessorKey: "loanProgress",
        cell: ({ row }) =>
          row.original.isLoan
            ? row.original.loanProgress || "Completá datos de la deuda"
            : "No aplica",
        header: "Deuda / cuotas",
      },
      {
        cell: ({ row }) => (
          <ExpenseRowActions
            actionDisabled={actionDisabled}
            description={row.original.description}
            onDelete={() => onDeleteExpense(row.original.id)}
            onEdit={() => onEditExpense(row.original.id)}
          />
        ),
        enableSorting: false,
        header: "Acciones",
        id: "actions",
      },
    ],
    [actionDisabled, onDeleteExpense, onEditExpense],
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

            <Button
              disabled={actionDisabled}
              onClick={onAddExpense}
              type="button"
              variant="outline"
            >
              Agregar gasto
            </Button>
          </div>

          <div className={styles.tableHeader}>
            <h2 className={styles.tableTitle}>Detalle del mes</h2>
            <p className={styles.tableDescription}>
              Editá cada gasto desde su menú de acciones y guardá los cambios del
              mes.
            </p>
          </div>

          <div className={styles.tableWrapper}>
            <DataTable
              columns={columns}
              data={rows}
              emptyMessage="No hay gastos cargados para este mes."
              filterColumnId="description"
              filterLabel="Filtrar gastos"
              filterPlaceholder="Filtrar gastos por descripción"
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
          onUnsavedChangesDiscard={onUnsavedChangesDiscard}
          onUnsavedChangesSave={onSaveUnsavedChanges}
          showUnsavedChangesDialog={showUnsavedChangesDialog}
          validationMessage={validationMessage}
        />
      </div>
    </section>
  );
}
