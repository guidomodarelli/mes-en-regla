import type { StoredMonthlyExpensesDocument } from "../../domain/entities/stored-monthly-expenses-document";

export type StoredMonthlyExpensesDocumentResult = StoredMonthlyExpensesDocument;

export interface MonthlyExpenseReceiptRenameWarningResult {
  fileId: string;
  nextFileName: string;
  previousFileName: string;
  reasonCode: "not_found" | "invalid_payload" | "insufficient_permissions" | "unexpected";
}

export interface SaveMonthlyExpensesDocumentResult {
  exchangeRateLoadError?: string | null;
  receiptRenameWarnings: MonthlyExpenseReceiptRenameWarningResult[];
  renamedReceiptFilesCount: number;
  storedDocument: StoredMonthlyExpensesDocumentResult;
}

export function toStoredMonthlyExpensesDocumentResult(
  document: StoredMonthlyExpensesDocument,
): StoredMonthlyExpensesDocumentResult {
  return {
    id: document.id,
    month: document.month,
    name: document.name,
    viewUrl: document.viewUrl,
  };
}
