export interface MonthlyExpenseReceiptUploadInput {
  contentBytes: Uint8Array;
  coveredPayments: number;
  expenseDescription: string;
  fileName: string;
  month: string;
  mimeType: string;
}

export interface MonthlyExpenseReceiptUpload {
  allReceiptsFolderId: string;
  allReceiptsFolderViewUrl: string;
  coveredPayments: number;
  fileId: string;
  fileName: string;
  fileViewUrl: string;
  monthlyFolderId: string;
  monthlyFolderViewUrl: string;
}

export type MonthlyExpenseDriveResourceStatus = "normal" | "trashed" | "missing";

export interface VerifyMonthlyExpenseReceiptInput {
  allReceiptsFolderId: string;
  fileId: string;
  monthlyFolderId: string;
}

export interface VerifyMonthlyExpenseFoldersInput {
  allReceiptsFolderId: string;
  monthlyFolderId?: string;
}

export interface MonthlyExpenseReceiptDriveStatus {
  allReceiptsFolderStatus: MonthlyExpenseDriveResourceStatus;
  fileStatus: MonthlyExpenseDriveResourceStatus;
  monthlyFolderStatus?: MonthlyExpenseDriveResourceStatus;
}

export interface MonthlyExpenseFoldersDriveStatus {
  allReceiptsFolderStatus: MonthlyExpenseDriveResourceStatus;
  monthlyFolderStatus?: MonthlyExpenseDriveResourceStatus;
}

export interface DeleteMonthlyExpenseReceiptInput {
  fileId: string;
}

export interface RenameMonthlyExpenseReceiptFolderInput {
  folderId: string;
  nextDescription: string;
}

export interface RenameMonthlyExpenseReceiptFileInput {
  fileId: string;
  nextFileName: string;
}

export interface MonthlyExpenseReceiptsRepository {
  deleteReceipt(
    input: DeleteMonthlyExpenseReceiptInput,
  ): Promise<void>;
  renameExpenseFolder(
    input: RenameMonthlyExpenseReceiptFolderInput,
  ): Promise<void>;
  renameReceiptFile(
    input: RenameMonthlyExpenseReceiptFileInput,
  ): Promise<void>;
  saveReceipt(
    input: MonthlyExpenseReceiptUploadInput,
  ): Promise<MonthlyExpenseReceiptUpload>;
  verifyFolders(
    input: VerifyMonthlyExpenseFoldersInput,
  ): Promise<MonthlyExpenseFoldersDriveStatus>;
  verifyReceipt(
    input: VerifyMonthlyExpenseReceiptInput,
  ): Promise<MonthlyExpenseReceiptDriveStatus>;
}
