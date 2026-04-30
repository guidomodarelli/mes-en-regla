import type { drive_v3 } from "googleapis";

import { VISIBLE_DRIVE_FOLDER_NAME } from "@/modules/storage/shared/visible-drive-folder-name";

import { GoogleDriveMonthlyExpensesRepository } from "./google-drive-monthly-expenses-repository";

function createDriveClientMock() {
  const files = {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
  };

  return {
    driveClient: {
      files,
    } as unknown as drive_v3.Drive,
    files,
  };
}

describe("GoogleDriveMonthlyExpensesRepository", () => {
  it("creates the app folder and stores new monthly files inside it", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.list
      .mockResolvedValueOnce({
        data: {
          files: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [],
        },
      });
    files.create
      .mockResolvedValueOnce({
        data: {
          id: "monthly-expenses-folder-id",
          mimeType: "application/vnd.google-apps.folder",
          name: VISIBLE_DRIVE_FOLDER_NAME,
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "monthly-expenses-file-id",
          name: "compromisos-mensuales-2026-marzo.json",
          webViewLink:
            "https://drive.google.com/file/d/monthly-expenses-file-id/view",
        },
      });

    const repository = new GoogleDriveMonthlyExpensesRepository(driveClient);

    const result = await repository.save({
      items: [
        {
          currency: "ARS",
          description: "Expensas",
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          receipts: [],
          subtotal: 55032.07,
          total: 55032.07,
        },
      ],
      month: "2026-03",
    });

    expect(files.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestBody: {
          mimeType: "application/vnd.google-apps.folder",
          name: VISIBLE_DRIVE_FOLDER_NAME,
        },
      }),
    );
    expect(files.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        q: expect.stringContaining("'monthly-expenses-folder-id' in parents"),
      }),
    );
    expect(files.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestBody: {
          name: "compromisos-mensuales-2026-marzo.json",
          parents: ["monthly-expenses-folder-id"],
        },
      }),
    );
    expect(result).toEqual({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "compromisos-mensuales-2026-marzo.json",
      viewUrl: "https://drive.google.com/file/d/monthly-expenses-file-id/view",
    });
  });

  it("updates an existing monthly file in the app folder", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.list
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "monthly-expenses-folder-id",
              name: VISIBLE_DRIVE_FOLDER_NAME,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "monthly-expenses-file-id",
              name: "compromisos-mensuales-2026-marzo.json",
              parents: ["monthly-expenses-folder-id"],
            },
          ],
        },
      });
    files.update.mockResolvedValueOnce({
      data: {
        id: "monthly-expenses-file-id",
        name: "compromisos-mensuales-2026-marzo.json",
        webViewLink:
          "https://drive.google.com/file/d/monthly-expenses-file-id/view",
      },
    });

    const repository = new GoogleDriveMonthlyExpensesRepository(driveClient);

    const result = await repository.save({
      items: [
        {
          currency: "ARS",
          description: "Internet",
          id: "expense-1",
          manualCoveredPayments: 0,
          occurrencesPerMonth: 1,
          receipts: [],
          subtotal: 15000,
          total: 15000,
        },
      ],
      month: "2026-03",
    });

    expect(files.update).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "monthly-expenses-file-id",
        requestBody: {
          name: "compromisos-mensuales-2026-marzo.json",
        },
      }),
    );
    expect(result).toEqual({
      id: "monthly-expenses-file-id",
      month: "2026-03",
      name: "compromisos-mensuales-2026-marzo.json",
      viewUrl: "https://drive.google.com/file/d/monthly-expenses-file-id/view",
    });
  });

  it("lists files from the app folder", async () => {
    const { driveClient, files } = createDriveClientMock();

    files.list
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "monthly-expenses-folder-id",
              name: VISIBLE_DRIVE_FOLDER_NAME,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          files: [
            {
              id: "current-file-id",
              name: "compromisos-mensuales-2026-marzo.json",
              parents: ["monthly-expenses-folder-id"],
            },
          ],
        },
      });
    files.get
      .mockResolvedValueOnce({
        data: JSON.stringify({
          items: [],
          month: "2026-03",
        }),
      });

    const repository = new GoogleDriveMonthlyExpensesRepository(driveClient);

    const result = await repository.listAll();

    expect(files.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        q: expect.stringContaining("'monthly-expenses-folder-id' in parents"),
      }),
    );
    expect(result).toEqual([
      {
        hasReplicatedFromPreviousMonth: false,
        items: [],
        month: "2026-03",
      },
    ]);
  });
});
