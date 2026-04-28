import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";

import type { MonthlyExpensesEditableRow } from "./monthly-expenses-table";
import { ExpenseSheet } from "./expense-sheet";

function createDraftRow(): MonthlyExpensesEditableRow {
  return {
    allReceiptsFolderId: "",
    allReceiptsFolderViewUrl: "",
    currency: "ARS",
    description: "Internet",
    id: "expense-1",
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
    monthlyFolderId: "",
    monthlyFolderViewUrl: "",
    occurrencesPerMonth: "1",
    paymentLink: "",
    receiptShareMessage: "",
    receiptSharePhoneDigits: "",
    receiptShareStatus: "",
    requiresReceiptShare: false,
    receipts: [],
    startMonth: "",
    subtotal: "100",
    total: "100.00",
  };
}

function renderExpenseSheet({
  draft = createDraftRow(),
  mode = "create",
  onLoanToggle = jest.fn(),
}: {
  draft?: MonthlyExpensesEditableRow;
  mode?: "create" | "edit";
  onLoanToggle?: (checked: boolean) => void;
}) {
  return render(
    <TooltipProvider>
      <ExpenseSheet
        actionDisabled={false}
        changedFields={new Set()}
        draft={draft}
        isOpen={true}
        isSubmitting={false}
        lenders={[]}
        mode={mode}
        onAddLender={jest.fn()}
        onFieldChange={jest.fn()}
        onLenderSelect={jest.fn()}
        onLoanToggle={onLoanToggle}
        onReceiptShareToggle={jest.fn()}
        onRequestClose={jest.fn()}
        onSave={jest.fn()}
        onUnsavedChangesClose={jest.fn()}
        onUnsavedChangesDiscard={jest.fn()}
        onUnsavedChangesSave={jest.fn()}
        showUnsavedChangesDialog={false}
        validationMessage={null}
      />
    </TooltipProvider>,
  );
}

describe("ExpenseSheet", () => {
  it("does not render manual covered payments or payment link inputs in the modal", () => {
    renderExpenseSheet({ mode: "create" });

    expect(screen.getByText("Frecuencia de pago")).toBeInTheDocument();
    expect(
      screen.queryByText("Pagos manuales (sin comprobante)"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pagos manuales")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Link de pago")).not.toBeInTheDocument();
    expect(screen.queryByText("Link de pago (Opcional)")).not.toBeInTheDocument();
  });

  it("hides duplicated inline-edit fields when editing an expense", () => {
    renderExpenseSheet({
      draft: {
        ...createDraftRow(),
        receiptShareMessage: "Mensaje de prueba",
        receiptSharePhoneDigits: "5491123456789",
        requiresReceiptShare: true,
      },
      mode: "edit",
    });

    expect(screen.queryByLabelText("Moneda")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subtotal")).not.toBeInTheDocument();
    expect(screen.queryByText("Frecuencia de pago")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Total")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("¿Necesitas enviar el comprobante a alguien?"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Número de teléfono (WhatsApp)"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mensaje personalizado (opcional)"),
    ).not.toBeInTheDocument();
  });

  it("shows the loan direction selector for loans", () => {
    renderExpenseSheet({
      draft: {
        ...createDraftRow(),
        installmentCount: "3",
        isLoan: true,
        lenderId: "lender-1",
        lenderName: "Cliente",
        loanDirection: "receivable",
        startMonth: "2026-01",
      },
    });

    expect(screen.getByLabelText("Dirección del préstamo")).toHaveTextContent(
      "Me deben",
    );
  });

  it("hides the loan checkbox while editing a non-loan expense", () => {
    renderExpenseSheet({
      mode: "edit",
    });

    expect(screen.queryByLabelText("Es deuda/préstamo")).not.toBeInTheDocument();
  });

  it("does not toggle loan state from the loan checkbox while editing a loan expense", async () => {
    const user = userEvent.setup();
    const onLoanToggle = jest.fn();

    renderExpenseSheet({
      draft: {
        ...createDraftRow(),
        installmentCount: "12",
        isLoan: true,
        lenderId: "lender-1",
        lenderName: "Banco Ciudad",
        startMonth: "2026-01",
      },
      mode: "edit",
      onLoanToggle,
    });

    const loanToggle = screen.getByLabelText("Es deuda/préstamo");
    expect(loanToggle).toBeDisabled();
    await user.click(loanToggle);

    expect(onLoanToggle).not.toHaveBeenCalled();
  });
});
