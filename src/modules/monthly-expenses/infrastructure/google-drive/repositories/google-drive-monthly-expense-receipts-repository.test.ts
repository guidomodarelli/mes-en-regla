import type { drive_v3 } from "googleapis";

import { GoogleDriveStorageError } from "@/modules/storage/infrastructure/google-drive/google-drive-storage-error";
import { VISIBLE_DRIVE_FOLDER_NAME } from "@/modules/storage/shared/visible-drive-folder-name";

import { GoogleDriveMonthlyExpenseReceiptsRepository } from "./google-drive-monthly-expense-receipts-repository";

function createDriveClientMock() {
  const files = {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
  };
  const permissions = {
    create: jest.fn(),
  };

  return {
    driveClient: {
      files,
      permissions,
    } as unknown as drive_v3.Drive,
    files,
    permissions,
  };
}

describe("GoogleDriveMonthlyExpenseReceiptsRepository", () => {
  it("uploads a receipt to an expense month folder and sets public read permission", async () => {
    const { driveClient, files, permissions } = createDriveClientMock();

    files.list
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "root-folder-id",
              name: VISIBLE_DRIVE_FOLDER_NAME,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "expense-folder-id",
              name: "Internet",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "month-folder-id",
              name: "2026-03",
            },
          ],
        },
      });
    files.create.mockResolvedValueOnce({
      data: {
        id: "receipt-file-id",
        name: "factura-internet.pdf",
        webViewLink: "https://drive.google.com/file/d/receipt-file-id/view",
      },
    });
    permissions.create.mockResolvedValueOnce({
      data: {
        id: "permission-id",
      },
    });

    const repository = new GoogleDriveMonthlyExpenseReceiptsRepository(driveClient);

    const result = await repository.saveReceipt({
      contentBytes: Uint8Array.from([1, 2, 3]),
      coveredPayments: 1,
      expenseDescription: "Internet",
      fileName: "factura-internet.pdf",
      mimeType: "application/pdf",
      month: "2026-03",
    });

    expect(files.create).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.objectContaining({
          body: expect.objectContaining({
            pipe: expect.any(Function),
          }),
          mimeType: "application/pdf",
        }),
        requestBody: {
          name: "factura-internet.pdf",
          parents: ["month-folder-id"],
        },
      }),
    );
    expect(permissions.create).toHaveBeenCalledWith({
      fields: "id",
      fileId: "receipt-file-id",
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });
    expect(result).toEqual({
      allReceiptsFolderId: "expense-folder-id",
      allReceiptsFolderViewUrl: "https://drive.google.com/drive/folders/expense-folder-id",
      coveredPayments: 1,
      fileId: "receipt-file-id",
      fileName: "factura-internet.pdf",
      fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
      monthlyFolderId: "month-folder-id",
      monthlyFolderViewUrl: "https://drive.google.com/drive/folders/month-folder-id",
    });
  });

  it("keeps the upload when public sharing permission is blocked", async () => {
    const { driveClient, files, permissions } = createDriveClientMock();

    files.list
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "root-folder-id",
              name: VISIBLE_DRIVE_FOLDER_NAME,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "expense-folder-id",
              name: "Internet",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "month-folder-id",
              name: "2026-03",
            },
          ],
        },
      });
    files.create.mockResolvedValueOnce({
      data: {
        id: "receipt-file-id",
        name: "factura-internet.pdf",
      },
    });
    permissions.create.mockRejectedValueOnce(
      new GoogleDriveStorageError("permissions denied", {
        code: "insufficient_permissions",
        endpoint: "drive.permissions.create",
        operation: "google-drive-monthly-expense-receipts-repository:test",
      }),
    );

    const repository = new GoogleDriveMonthlyExpenseReceiptsRepository(driveClient);

    await expect(
      repository.saveReceipt({
        contentBytes: Uint8Array.from([1, 2, 3]),
        coveredPayments: 1,
        expenseDescription: "Internet",
        fileName: "factura-internet.pdf",
        mimeType: "application/pdf",
        month: "2026-03",
      }),
    ).resolves.toEqual({
      allReceiptsFolderId: "expense-folder-id",
      allReceiptsFolderViewUrl: "https://drive.google.com/drive/folders/expense-folder-id",
      coveredPayments: 1,
      fileId: "receipt-file-id",
      fileName: "factura-internet.pdf",
      fileViewUrl: "https://drive.google.com/file/d/receipt-file-id/view",
      monthlyFolderId: "month-folder-id",
      monthlyFolderViewUrl: "https://drive.google.com/drive/folders/month-folder-id",
    });
  });

  it("deletes receipts by moving files to trash", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.update.mockResolvedValue({
      data: {
        id: "receipt-file-id",
        trashed: true,
      },
    });

    const repository = new GoogleDriveMonthlyExpenseReceiptsRepository(driveClient);

    await repository.deleteReceipt({
      fileId: "receipt-file-id",
    });

    expect(files.update).toHaveBeenCalledWith({
      fields: "id,trashed",
      fileId: "receipt-file-id",
      requestBody: {
        trashed: true,
      },
    });
  });

  it("renames an uploaded receipt file", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.update.mockResolvedValueOnce({
      data: {
        id: "receipt-file-id",
        name: "2026-03-16 - Internet - cubre 2 pagos.pdf",
      },
    });

    const repository = new GoogleDriveMonthlyExpenseReceiptsRepository(driveClient);

    await repository.renameReceiptFile({
      fileId: "receipt-file-id",
      nextFileName: "2026-03-16 - Internet - cubre 2 pagos.pdf",
    });

    expect(files.update).toHaveBeenCalledWith({
      fields: "id,name,mimeType,parents,webViewLink",
      fileId: "receipt-file-id",
      requestBody: {
        name: "2026-03-16 - Internet - cubre 2 pagos.pdf",
      },
    });
  });

  it("returns missing status when receipt resources no longer exist", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.get.mockRejectedValue(
      new GoogleDriveStorageError("not found", {
        code: "not_found",
        endpoint: "drive.files.get",
        operation: "google-drive-monthly-expense-receipts-repository:test",
      }),
    );

    const repository = new GoogleDriveMonthlyExpenseReceiptsRepository(driveClient);

    await expect(
      repository.verifyReceipt({
        allReceiptsFolderId: "expense-folder-id",
        fileId: "receipt-file-id",
        monthlyFolderId: "month-folder-id",
      }),
    ).resolves.toEqual({
      allReceiptsFolderStatus: "missing",
      fileStatus: "missing",
      monthlyFolderStatus: "missing",
    });
  });

  it("verifies only the shared receipts folder when the monthly folder reference is empty", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.get.mockResolvedValue({
      data: {
        id: "expense-folder-id",
        trashed: true,
      },
    });

    const repository = new GoogleDriveMonthlyExpenseReceiptsRepository(driveClient);

    await expect(
      repository.verifyFolders({
        allReceiptsFolderId: "expense-folder-id",
        monthlyFolderId: "",
      }),
    ).resolves.toEqual({
      allReceiptsFolderStatus: "trashed",
      monthlyFolderStatus: undefined,
    });
    expect(files.get).toHaveBeenCalledTimes(1);
    expect(files.get).toHaveBeenCalledWith({
      fields: "id,trashed",
      fileId: "expense-folder-id",
    });
  });
});
