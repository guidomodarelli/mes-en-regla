import { render, screen } from "@testing-library/react";

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
}: {
  draft?: MonthlyExpensesEditableRow;
  mode?: "create" | "edit";
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
        onLoanToggle={jest.fn()}
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
});
