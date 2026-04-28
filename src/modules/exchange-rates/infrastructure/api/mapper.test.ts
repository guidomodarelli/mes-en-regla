import {
  mapAmbitoDollarHistoryDtoToMonthlyRate,
  mapAmbitoDollarRateDtoToRate,
  sanitizePrice,
} from "./mapper";
import {
  MissingMonthlyExchangeRateError,
} from "../../domain/errors/missing-monthly-exchange-rate-error";

describe("exchange-rates mapper", () => {
  it("sanitizes localized price strings from Ambito", () => {
    expect(sanitizePrice("1.234,56")).toBe(1234.56);
  });

  it("maps the venta field from Ambito payloads", () => {
    expect(
      mapAmbitoDollarRateDtoToRate({
        venta: "321,50",
      }),
    ).toBe(321.5);
  });

  it("rejects payloads without venta", () => {
    expect(() => mapAmbitoDollarRateDtoToRate({})).toThrow(
      "Cannot map an Ambito dollar rate DTO without a venta value.",
    );
  });

  it("maps the last available historical rate for the selected month", () => {
    expect(
      mapAmbitoDollarHistoryDtoToMonthlyRate(
        [
          ["Fecha", "Compra", "Venta"],
          ["04/03/2026", "1.200,00", "1.230,00"],
          ["31/03/2026", "1.210,00", "1.240,00"],
        ],
        "2026-03",
      ),
    ).toEqual({
      rate: 1240,
      sourceDateIso: "2026-03-31",
    });
  });

  it("uses the last row when Ambito returns duplicated dates", () => {
    expect(
      mapAmbitoDollarHistoryDtoToMonthlyRate(
        [
          ["Fecha", "Compra", "Venta"],
          ["31/03/2026", "1.210,00", "1.240,00"],
          ["31/03/2026", "1.220,00", "1.250,00"],
        ],
        "2026-03",
      ),
    ).toEqual({
      rate: 1250,
      sourceDateIso: "2026-03-31",
    });
  });

  it("rejects historical payloads without monthly values", () => {
    expect(
      () =>
        mapAmbitoDollarHistoryDtoToMonthlyRate(
          [["Fecha", "Compra", "Venta"]],
          "2026-03",
        ),
    ).toThrow(MissingMonthlyExchangeRateError);
  });
});
