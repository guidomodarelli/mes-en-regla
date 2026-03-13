import type { NextApiRequest, NextApiResponse } from "next";

import type { TursoDatabase } from "@/modules/shared/infrastructure/database/drizzle/turso-database";

import { createMonthlyExpensesLoansReportApiHandler } from "./create-monthly-expenses-loans-report-api-handler";

interface MockJsonResponse {
  body: unknown | undefined;
  headers: Record<string, string>;
  statusCode: number;
}

function createMockResponse(): NextApiResponse & MockJsonResponse {
  const response: MockJsonResponse & {
    json(payload: unknown): MockJsonResponse;
    setHeader(name: string, value: string): MockJsonResponse;
    status(code: number): MockJsonResponse;
  } = {
    body: undefined,
    headers: {},
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
    setHeader(name: string, value: string) {
      response.headers[name] = value;
      return response;
    },
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    statusCode: 200,
  };

  return response as unknown as NextApiResponse & MockJsonResponse;
}

describe("createMonthlyExpensesLoansReportApiHandler", () => {
  it("rejects methods other than GET", async () => {
    const handler = createMonthlyExpensesLoansReportApiHandler({
      load: jest.fn(),
    });

    const request = {
      method: "POST",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(response.headers).toEqual({ Allow: "GET" });
    expect(response.statusCode).toBe(405);
    expect(response.body).toEqual({
      error:
        "monthly-expenses-report only supports GET requests on this endpoint.",
    });
  });

  it("returns 200 with the loaded report", async () => {
    const database = {} as TursoDatabase;
    const load = jest.fn().mockResolvedValue({
      entries: [],
      summary: {
        activeLoanCount: 0,
        lenderCount: 0,
        remainingAmount: 0,
        trackedLoanCount: 0,
      },
    });

    const handler = createMonthlyExpensesLoansReportApiHandler({
      getDatabase: jest.fn().mockResolvedValue(database),
      getUserSubject: jest.fn().mockResolvedValue("google-user-123"),
      load,
    });

    const request = {
      method: "GET",
    } as NextApiRequest;
    const response = createMockResponse();

    await handler(request, response);

    expect(load).toHaveBeenCalledWith({
      database,
      userSubject: "google-user-123",
    });
    expect(response.statusCode).toBe(200);
  });
});
