import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, Info, X } from "lucide-react";
import { useForm } from "react-hook-form";

import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  LenderPicker,
  type LenderOption,
} from "./lender-picker";
import { LoanInfoPopover } from "./loan-info-popover";
import type { MonthlyExpensesEditableRow } from "./monthly-expenses-table";
import styles from "./expense-sheet.module.scss";

export type ExpenseEditableFieldName =
  | "currency"
  | "description"
  | "installmentCount"
  | "occurrencesPerMonth"
  | "startMonth"
  | "subtotal";

interface ExpenseSheetProps {
  actionDisabled: boolean;
  changedFields: Set<string>;
  draft: MonthlyExpensesEditableRow | null;
  isOpen: boolean;
  isSubmitting: boolean;
  lenders: LenderOption[];
  mode: "create" | "edit";
  onFieldChange: (fieldName: ExpenseEditableFieldName, value: string) => void;
  onLenderSelect: (lenderId: string | null) => void;
  onLoanToggle: (checked: boolean) => void;
  onRequestClose: () => void;
  onSave: () => void;
  onUnsavedChangesClose: () => void;
  onUnsavedChangesDiscard: () => void;
  onUnsavedChangesSave: () => void;
  showUnsavedChangesDialog: boolean;
  validationMessage: string | null;
}

type ExpenseSheetContentProps = Omit<ExpenseSheetProps, "draft"> & {
  draft: MonthlyExpensesEditableRow;
};

type ExpenseFieldErrorMap = Partial<Record<ExpenseEditableFieldName, string>>;
type ExpenseSheetFormValues = Record<ExpenseEditableFieldName, string>;

const INSTALLMENT_COUNT_SUGGESTIONS = ["3", "6", "9", "12", "18", "24"];

function getFieldLabel(label: string, isChanged: boolean) {
  return (
    <span className={styles.fieldLabelRow}>
      <span
        className={cn(
          styles.fieldLabelText,
          isChanged && styles.changedFieldLabel,
        )}
      >
        {label}
      </span>
    </span>
  );
}

function normalizeCurrencyInput(value: string): string {
  const sanitizedValue = value.replace(/[^\d,.-]/g, "");

  if (!sanitizedValue) {
    return "";
  }

  const hasCommaDecimalSeparator = sanitizedValue.includes(",");

  if (!hasCommaDecimalSeparator) {
    return sanitizedValue.replace(/[^\d-]/g, "");
  }

  const decimalSeparatorIndex = sanitizedValue.lastIndexOf(",");
  const integerPart = sanitizedValue.slice(0, decimalSeparatorIndex);
  const decimalPart = sanitizedValue.slice(decimalSeparatorIndex + 1);
  const normalizedIntegerPart = integerPart.replace(/[^\d-]/g, "");
  const normalizedDecimalPart = decimalPart.replace(/[^\d]/g, "").slice(0, 2);

  if (normalizedDecimalPart.length === 0) {
    return `${normalizedIntegerPart}.`;
  }

  return `${normalizedIntegerPart}.${normalizedDecimalPart}`;
}

function formatCurrencyDisplay(value: string): string {
  const normalizedValue = /^-?\d+\.(\d{1,2})?$/.test(value)
    ? value
    : normalizeCurrencyInput(value);

  if (!normalizedValue) {
    return "";
  }

  const numericValue = Number(normalizedValue);

  if (!Number.isFinite(numericValue)) {
    return "";
  }

  if (normalizedValue.endsWith(".")) {
    return `${new Intl.NumberFormat("es-AR", {
      maximumFractionDigits: 0,
    }).format(numericValue)},`;
  }

  const [, decimalPart = ""] = normalizedValue.split(".");
  const normalizedDecimalPart = decimalPart.slice(0, 2);
  const minimumFractionDigits =
    normalizedDecimalPart.length === 0 || /^0+$/.test(normalizedDecimalPart)
      ? 0
      : normalizedDecimalPart.length;

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: Math.max(minimumFractionDigits, 0),
    minimumFractionDigits,
  }).format(numericValue);
}

function getExpenseSheetFormValues(
  draft: MonthlyExpensesEditableRow,
): ExpenseSheetFormValues {
  return {
    currency: draft.currency,
    description: draft.description,
    installmentCount: draft.installmentCount,
    occurrencesPerMonth: draft.occurrencesPerMonth,
    startMonth: draft.startMonth,
    subtotal: draft.subtotal,
  };
}

function parseMonthIdentifier(value: string): Date | undefined {
  const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value.trim());

  if (!monthMatch) {
    return undefined;
  }

  const [, year, month] = monthMatch;

  return new Date(Number(year), Number(month) - 1, 1);
}

function formatMonthIdentifier(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function formatMonthDisplay(date: Date): string {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getFieldErrors(draft: MonthlyExpensesEditableRow): ExpenseFieldErrorMap {
  const fieldErrors: ExpenseFieldErrorMap = {};
  const subtotal = Number(draft.subtotal);
  const occurrencesPerMonth = Number(draft.occurrencesPerMonth);
  const installmentCount = Number(draft.installmentCount);

  if (!draft.description.trim()) {
    fieldErrors.description = "Completá la descripción.";
  }

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    fieldErrors.subtotal = "Ingresá un subtotal mayor a 0.";
  }

  if (!Number.isInteger(occurrencesPerMonth) || occurrencesPerMonth <= 0) {
    fieldErrors.occurrencesPerMonth = "Ingresá una cantidad mayor a 0.";
  }

  if (draft.isLoan && !draft.startMonth.trim()) {
    fieldErrors.startMonth = "Completá la fecha de inicio.";
  }

  if (draft.isLoan && (!Number.isInteger(installmentCount) || installmentCount <= 0)) {
    fieldErrors.installmentCount = "Completá la cantidad total de cuotas.";
  }

  return fieldErrors;
}

export function ExpenseSheet({
  draft,
  ...props
}: ExpenseSheetProps) {
  if (!draft) {
    return null;
  }

  return <ExpenseSheetContent {...props} draft={draft} />;
}

function ExpenseSheetContent({
  actionDisabled,
  changedFields,
  draft,
  isOpen,
  isSubmitting,
  lenders,
  mode,
  onFieldChange,
  onLenderSelect,
  onLoanToggle,
  onRequestClose,
  onSave,
  onUnsavedChangesClose,
  onUnsavedChangesDiscard,
  onUnsavedChangesSave,
  showUnsavedChangesDialog,
  validationMessage,
}: ExpenseSheetContentProps) {

  const title = mode === "create" ? "Nuevo gasto" : "Editar gasto";
  const description =
    mode === "create"
      ? "Completá y guardá este gasto del mes."
      : "Editá y guardá los cambios de este gasto.";
  const loanHelpMessage =
    "Marcá esta opción si el gasto corresponde a una deuda.";
  const hasPendingChanges = changedFields.size > 0;
  const currencyPrefix = draft.currency === "USD" ? "US$" : "$";
  const selectedStartMonthDate = useMemo(
    () => parseMonthIdentifier(draft.startMonth),
    [draft.startMonth],
  );
  const form = useForm<ExpenseSheetFormValues>({
    values: getExpenseSheetFormValues(draft),
  });
  const fieldErrors = useMemo(() => getFieldErrors(draft), [draft]);
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const shouldShowGlobalValidation =
    Boolean(validationMessage) && !hasFieldErrors;
  const [isStartMonthPickerOpen, setIsStartMonthPickerOpen] = useState(false);
  const [startMonthCalendarMonth, setStartMonthCalendarMonth] = useState<Date>(
    selectedStartMonthDate ?? new Date(),
  );

  useEffect(() => {
    form.clearErrors();

    (Object.entries(fieldErrors) as [ExpenseEditableFieldName, string][]).forEach(
      ([fieldName, message]) => {
        form.setError(fieldName, {
          message,
          type: "manual",
        });
      },
    );
  }, [fieldErrors, form]);

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onRequestClose();
          }
        }}
        open={isOpen}
      >
        <DialogContent
          className={styles.content}
          onEscapeKeyDown={(event) => {
            event.preventDefault();
            onRequestClose();
          }}
          onInteractOutside={(event) => {
            event.preventDefault();
            onRequestClose();
          }}
          showCloseButton={false}
        >
          <DialogHeader className={styles.header}>
            <div className={styles.headerTopRow}>
              <div>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </div>
              <Button
                aria-label="Cerrar formulario de gasto"
                className={styles.closeButton}
                onClick={onRequestClose}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </DialogHeader>

          <Form {...form}>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                onSave();
              }}
            >
              {shouldShowGlobalValidation ? (
                <p className={cn(styles.feedback, styles.errorText)} role="alert">
                  {validationMessage}
                </p>
              ) : null}

              <div className={cn(styles.grid, styles.topGrid)}>
                <FormField
                  control={form.control}
                  name="description"
                  render={() => (
                    <FormItem className={cn(styles.fieldGroup, styles.fullWidthField)}>
                      <FormLabel>
                        {getFieldLabel("Descripción", changedFields.has("description"))}
                      </FormLabel>
                      <div className={styles.fieldControlWrapper}>
                        <FormControl>
                          <Input
                            aria-label="Descripción"
                            className={cn(
                              fieldErrors.description && styles.invalidField,
                              changedFields.has("description") && styles.changedField,
                            )}
                            data-changed={
                              changedFields.has("description") ? "true" : "false"
                            }
                            onChange={(event) =>
                              onFieldChange("description", event.target.value)
                            }
                            placeholder="Ej. agua, expensas, alquiler"
                            type="text"
                            value={draft.description}
                          />
                        </FormControl>
                        <FormMessage className={styles.fieldErrorText} />
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={() => (
                    <FormItem className={styles.fieldGroup}>
                      <FormLabel>
                        {getFieldLabel("Moneda", changedFields.has("currency"))}
                      </FormLabel>
                      <div className={styles.fieldControlWrapper}>
                        <Select
                          onValueChange={(value) => onFieldChange("currency", value)}
                          value={draft.currency}
                        >
                          <FormControl>
                            <SelectTrigger
                              aria-label="Moneda"
                              className={cn(
                                changedFields.has("currency") && styles.changedField,
                              )}
                              data-changed={
                                changedFields.has("currency") ? "true" : "false"
                              }
                            >
                              <SelectValue placeholder="Moneda" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ARS">ARS</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage className={styles.fieldErrorText} />
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <div className={cn(styles.grid, styles.amountGrid)}>
                <FormField
                  control={form.control}
                  name="subtotal"
                  render={() => (
                    <FormItem className={styles.fieldGroup}>
                      <FormLabel>
                        {getFieldLabel("Subtotal", changedFields.has("subtotal"))}
                      </FormLabel>
                      <div className={styles.fieldControlWrapper}>
                        <InputGroup
                          className={cn(
                            fieldErrors.subtotal && styles.invalidField,
                            changedFields.has("subtotal") && styles.changedField,
                          )}
                          data-changed={
                            changedFields.has("subtotal") ? "true" : "false"
                          }
                        >
                          <InputGroupAddon align="inline-start" aria-hidden="true">
                            {currencyPrefix}
                          </InputGroupAddon>
                          <FormControl>
                            <InputGroupInput
                              aria-label="Subtotal"
                              data-changed={
                                changedFields.has("subtotal") ? "true" : "false"
                              }
                              inputMode="decimal"
                              onChange={(event) =>
                                onFieldChange(
                                  "subtotal",
                                  normalizeCurrencyInput(event.target.value),
                                )
                              }
                              type="text"
                              value={formatCurrencyDisplay(draft.subtotal)}
                            />
                          </FormControl>
                        </InputGroup>
                        <FormMessage className={styles.fieldErrorText} />
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="occurrencesPerMonth"
                  render={() => (
                    <FormItem className={styles.fieldGroup}>
                      <FormLabel>
                        {getFieldLabel(
                          "Veces al mes",
                          changedFields.has("occurrencesPerMonth"),
                        )}
                      </FormLabel>
                      <div className={styles.fieldControlWrapper}>
                        <FormControl>
                          <Input
                            aria-label="Veces al mes"
                            className={cn(
                              fieldErrors.occurrencesPerMonth && styles.invalidField,
                              changedFields.has("occurrencesPerMonth") &&
                                styles.changedField,
                            )}
                            data-changed={
                              changedFields.has("occurrencesPerMonth")
                                ? "true"
                                : "false"
                            }
                            inputMode="numeric"
                            min="0"
                            onChange={(event) =>
                              onFieldChange(
                                "occurrencesPerMonth",
                                event.target.value,
                              )
                            }
                            step="1"
                            type="number"
                            value={draft.occurrencesPerMonth}
                          />
                        </FormControl>
                        <FormMessage className={styles.fieldErrorText} />
                      </div>
                    </FormItem>
                  )}
                />

                <div className={styles.fieldGroup}>
                  <Label htmlFor="expense-total">Total</Label>
                  <InputGroup>
                    <InputGroupAddon align="inline-start" aria-hidden="true">
                      {currencyPrefix}
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label="Total"
                      id="expense-total"
                      readOnly
                      type="text"
                      value={formatCurrencyDisplay(draft.total)}
                    />
                  </InputGroup>
                </div>
              </div>

              <div className={styles.loanSection}>
                <div className={styles.loanToggleRow}>
                  <div className={styles.fieldControlWrapper}>
                    <input
                      checked={draft.isLoan}
                      className={styles.loanToggle}
                      id="expense-is-loan"
                      onChange={(event) => onLoanToggle(event.target.checked)}
                      type="checkbox"
                    />
                  </div>
                  <div className={styles.loanToggleLabelGroup}>
                    <Label htmlFor="expense-is-loan">
                      {getFieldLabel("Es deuda/préstamo", changedFields.has("isLoan"))}
                    </Label>
                    <LoanInfoPopover message={loanHelpMessage} usePortal={false} />
                  </div>
                </div>

                {draft.isLoan ? (
                  <>
                    <div className={styles.fieldGroup}>
                      <Label>
                        {getFieldLabel("Prestador (opcional)", changedFields.has("lender"))}
                      </Label>
                      <div className={styles.fieldControlWrapper}>
                        <LenderPicker
                          onSelect={onLenderSelect}
                          options={lenders}
                          selectedLenderId={draft.lenderId}
                          selectedLenderName={draft.lenderName}
                        />
                      </div>
                    </div>

                    <div className={styles.loanFieldsGrid}>
                      <FormField
                        control={form.control}
                        name="startMonth"
                        render={() => (
                          <FormItem className={styles.fieldGroup}>
                            <FormLabel>
                              {getFieldLabel(
                                "Inicio de la deuda",
                                changedFields.has("startMonth"),
                              )}
                            </FormLabel>
                            <div className={styles.fieldControlWrapper}>
                              <Popover
                                onOpenChange={(nextOpen) => {
                                  setIsStartMonthPickerOpen(nextOpen);

                                  if (nextOpen) {
                                    setStartMonthCalendarMonth(
                                      selectedStartMonthDate ?? new Date(),
                                    );
                                  }
                                }}
                                open={isStartMonthPickerOpen}
                              >
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      aria-label="Inicio de la deuda"
                                      className={cn(
                                        styles.datePickerTrigger,
                                        !selectedStartMonthDate &&
                                          styles.datePickerPlaceholder,
                                        fieldErrors.startMonth && styles.invalidField,
                                        changedFields.has("startMonth") &&
                                          styles.changedField,
                                      )}
                                      data-changed={
                                        changedFields.has("startMonth")
                                          ? "true"
                                          : "false"
                                      }
                                      type="button"
                                      variant="outline"
                                    >
                                      <span className={styles.datePickerValue}>
                                        {selectedStartMonthDate
                                          ? formatMonthDisplay(selectedStartMonthDate)
                                          : "Seleccioná una fecha"}
                                      </span>
                                      <CalendarIcon
                                        aria-hidden="true"
                                        className={styles.datePickerIcon}
                                      />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  className={styles.datePickerPopover}
                                >
                                  <Calendar
                                    buttonVariant="outline"
                                    captionLayout="dropdown"
                                    classNames={{
                                      month: "gap-1",
                                      months: "gap-0",
                                      nav: "hidden",
                                      month_caption: "h-auto px-0",
                                      table: "hidden",
                                      weekdays: "hidden",
                                      week: "hidden",
                                    }}
                                    formatters={{
                                      formatMonthDropdown: (date) =>
                                        new Intl.DateTimeFormat("es-AR", {
                                          month: "long",
                                        }).format(date),
                                    }}
                                    mode="single"
                                    month={startMonthCalendarMonth}
                                    onMonthChange={setStartMonthCalendarMonth}
                                    selected={selectedStartMonthDate}
                                    showOutsideDays={false}
                                    startMonth={new Date(2020, 0, 1)}
                                    endMonth={new Date(2040, 11, 1)}
                                  />
                                  <div className={styles.datePickerActions}>
                                    <Button
                                      className={styles.datePickerConfirmButton}
                                      onClick={() => {
                                        onFieldChange(
                                          "startMonth",
                                          formatMonthIdentifier(
                                            startMonthCalendarMonth,
                                          ),
                                        );
                                        setIsStartMonthPickerOpen(false);
                                      }}
                                      type="button"
                                    >
                                      Usar {formatMonthDisplay(startMonthCalendarMonth)}
                                    </Button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                              <FormMessage className={styles.fieldErrorText} />
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="installmentCount"
                        render={() => (
                          <FormItem className={styles.fieldGroup}>
                            <FormLabel>
                              {getFieldLabel(
                                "Cantidad total de cuotas",
                                changedFields.has("installmentCount"),
                              )}
                            </FormLabel>
                            <div className={styles.fieldControlWrapper}>
                              <FormControl>
                                <Input
                                  aria-label="Cantidad total de cuotas"
                                  className={cn(
                                    fieldErrors.installmentCount &&
                                      styles.invalidField,
                                    changedFields.has("installmentCount") &&
                                      styles.changedField,
                                  )}
                                  data-changed={
                                    changedFields.has("installmentCount")
                                      ? "true"
                                      : "false"
                                  }
                                  inputMode="numeric"
                                  onChange={(event) =>
                                    onFieldChange(
                                      "installmentCount",
                                      event.target.value.replace(/[^\d]/g, ""),
                                    )
                                  }
                                  pattern="[0-9]*"
                                  placeholder="Ej: 12"
                                  type="text"
                                  value={draft.installmentCount}
                                />
                              </FormControl>
                              <div className={styles.installmentSuggestions}>
                                {INSTALLMENT_COUNT_SUGGESTIONS.map((installment) => (
                                  <Button
                                    aria-label={`Usar ${installment} cuotas`}
                                    aria-pressed={draft.installmentCount === installment}
                                    className={cn(
                                      styles.installmentSuggestionButton,
                                      draft.installmentCount === installment &&
                                        styles.installmentSuggestionButtonActive,
                                    )}
                                    key={installment}
                                    onClick={() =>
                                      onFieldChange("installmentCount", installment)
                                    }
                                    size="xs"
                                    type="button"
                                    variant="outline"
                                  >
                                    {installment}
                                  </Button>
                                ))}
                              </div>
                              <FormMessage className={styles.fieldErrorText} />
                            </div>
                          </FormItem>
                        )}
                      />

                      <div className={styles.fieldGroup}>
                        <Label htmlFor="expense-loan-end-month">Fin de la deuda</Label>
                        <Input
                          aria-label="Fin de la deuda"
                          className={styles.readOnlyField}
                          id="expense-loan-end-month"
                          readOnly
                          tabIndex={-1}
                          type="month"
                          value={draft.loanEndMonth}
                        />
                      </div>
                    </div>

                    <Alert className={styles.loanStatus}>
                      <Info aria-hidden="true" className={styles.loanStatusIcon} />
                      <AlertDescription className={styles.loanStatusText}>
                        <p>
                          {draft.loanProgress ||
                            "Completá inicio y cuotas para ver el avance."}
                        </p>
                      </AlertDescription>
                    </Alert>
                  </>
                ) : null}
              </div>
            </form>
          </Form>

          <DialogFooter className={styles.footer}>
            {hasPendingChanges ? (
              <p className={styles.changesLegend} role="status">
                Los labels amarillos subrayados marcan cambios sin guardar.
              </p>
            ) : null}
            <div className={styles.footerActions}>
              <Button onClick={onRequestClose} type="button" variant="outline">
                Cancelar
              </Button>
              <Button
                disabled={actionDisabled || Boolean(validationMessage)}
                onClick={onSave}
                type="button"
              >
                {isSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onUnsavedChangesClose();
          }
        }}
        open={showUnsavedChangesDialog}
      >
        <DialogContent
          className={styles.unsavedChangesContent}
          showCloseButton={false}
        >
          <DialogHeader className={styles.unsavedChangesHeader}>
            <div className={styles.unsavedChangesHeaderTopRow}>
              <DialogTitle>Cambios sin guardar</DialogTitle>
              <Button
                aria-label="Cerrar aviso de cambios sin guardar"
                className={styles.unsavedChangesCloseButton}
                onClick={onUnsavedChangesClose}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <DialogDescription>
              Tenés cambios sin guardar en este gasto.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={styles.unsavedChangesFooter}>
            <Button
              className={styles.unsavedChangesButton}
              onClick={onUnsavedChangesDiscard}
              type="button"
              variant="outline"
            >
              Descartar los cambios
            </Button>
            <Button
              className={styles.unsavedChangesButton}
              onClick={onUnsavedChangesSave}
              type="button"
            >
              Guardar los cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
