jest.mock("@libsql/client", () => ({
  createClient: jest.fn(),
}));

jest.mock("drizzle-orm/libsql", () => ({
  drizzle: jest.fn(),
}));

jest.mock("drizzle-orm/libsql/migrator", () => ({
  migrate: jest.fn(),
}));

jest.mock("../turso-server-config", () => ({
  requireTursoServerConfig: jest.fn(),
}));

describe("createMigratedTursoDatabase", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs migrations only once across repeated calls", async () => {
    await jest.isolateModulesAsync(async () => {
      const { createClient } = await import("@libsql/client");
      const { drizzle } = await import("drizzle-orm/libsql");
      const { migrate } = await import("drizzle-orm/libsql/migrator");
      const { requireTursoServerConfig } = await import("../turso-server-config");
      const { createMigratedTursoDatabase } = await import("./turso-database");

      jest.mocked(requireTursoServerConfig).mockReturnValue({
        authToken: "test-token",
        url: "libsql://test.local",
      });
      jest.mocked(createClient).mockReturnValue({} as never);
      jest
        .mocked(drizzle)
        .mockReturnValueOnce({ id: "db-1" } as never)
        .mockReturnValueOnce({ id: "db-2" } as never);
      jest.mocked(migrate).mockResolvedValue(undefined as never);

      await createMigratedTursoDatabase();
      await createMigratedTursoDatabase();

      expect(migrate).toHaveBeenCalledTimes(1);
      expect(drizzle).toHaveBeenCalledTimes(2);
    });
  });

  it("shares the same migration run for concurrent calls", async () => {
    await jest.isolateModulesAsync(async () => {
      const { createClient } = await import("@libsql/client");
      const { drizzle } = await import("drizzle-orm/libsql");
      const { migrate } = await import("drizzle-orm/libsql/migrator");
      const { requireTursoServerConfig } = await import("../turso-server-config");
      const { createMigratedTursoDatabase } = await import("./turso-database");

      let resolveMigration: () => void = () => undefined;
      const migrationPromise = new Promise<void>((resolve) => {
        resolveMigration = resolve;
      });

      jest.mocked(requireTursoServerConfig).mockReturnValue({
        authToken: "test-token",
        url: "libsql://test.local",
      });
      jest.mocked(createClient).mockReturnValue({} as never);
      jest
        .mocked(drizzle)
        .mockReturnValueOnce({ id: "db-1" } as never)
        .mockReturnValueOnce({ id: "db-2" } as never);
      jest.mocked(migrate).mockReturnValue(migrationPromise as never);

      const firstCall = createMigratedTursoDatabase();
      const secondCall = createMigratedTursoDatabase();

      expect(migrate).toHaveBeenCalledTimes(1);

      resolveMigration();
      await Promise.all([firstCall, secondCall]);
      expect(migrate).toHaveBeenCalledTimes(1);
      expect(drizzle).toHaveBeenCalledTimes(2);
    });
  });

  it("retries migrations after a failed first attempt", async () => {
    await jest.isolateModulesAsync(async () => {
      const { createClient } = await import("@libsql/client");
      const { drizzle } = await import("drizzle-orm/libsql");
      const { migrate } = await import("drizzle-orm/libsql/migrator");
      const { requireTursoServerConfig } = await import("../turso-server-config");
      const { createMigratedTursoDatabase } = await import("./turso-database");

      jest.mocked(requireTursoServerConfig).mockReturnValue({
        authToken: "test-token",
        url: "libsql://test.local",
      });
      jest.mocked(createClient).mockReturnValue({} as never);
      jest
        .mocked(drizzle)
        .mockReturnValueOnce({ id: "db-1" } as never)
        .mockReturnValueOnce({ id: "db-2" } as never);
      jest
        .mocked(migrate)
        .mockRejectedValueOnce(new Error("migration failed"))
        .mockResolvedValueOnce(undefined as never);

      await expect(createMigratedTursoDatabase()).rejects.toThrow(
        "migration failed",
      );
      await expect(createMigratedTursoDatabase()).resolves.toEqual({
        id: "db-2",
      });
      expect(migrate).toHaveBeenCalledTimes(2);
    });
  });
});
