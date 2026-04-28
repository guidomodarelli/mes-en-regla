import type {
  AmbitoDollarHistoryDto,
  AmbitoDollarRateDto,
} from "./dto/ambito-dollar-rate.dto";
import {
  MissingMonthlyExchangeRateError,
} from "../../domain/errors/missing-monthly-exchange-rate-error";

function normalizeAmbitoDate(dateValue: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateValue.trim());

  if (!match) {
    throw new Error(
      `normalizeAmbitoDate requires dates in DD/MM/YYYY format, received "${dateValue}".`,
    );
  }

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

export function sanitizePrice(price: string): number {
  const normalizedPrice = Number.parseFloat(
    price.replace(/\./g, "").replace(/,/g, "."),
  );

  if (!Number.isFinite(normalizedPrice)) {
    throw new Error(
      "sanitizePrice requires a valid numeric string with the expected locale format.",
    );
  }

  return normalizedPrice;
}

export function mapAmbitoDollarRateDtoToRate(dto: AmbitoDollarRateDto): number {
  const venta = dto.venta?.trim();

  if (!venta) {
    throw new Error(
      "Cannot map an Ambito dollar rate DTO without a venta value.",
    );
  }

  return sanitizePrice(venta);
}

export function mapAmbitoDollarHistoryDtoToMonthlyRate(
  dto: AmbitoDollarHistoryDto,
  month: string,
): {
  rate: number;
  sourceDateIso: string;
} {
  if (!Array.isArray(dto)) {
    throw new Error(
      "Cannot map an Ambito historical dollar payload without an array response.",
    );
  }

  const availableRates = dto.flatMap((row, rowIndex) => {
    if (!Array.isArray(row)) {
      throw new Error(
        "Cannot map an Ambito historical dollar payload with invalid row shapes.",
      );
    }

    if (
      rowIndex === 0 &&
      row[0]?.trim().toLocaleLowerCase() === "fecha"
    ) {
      return [];
    }

    const sourceDateIso = normalizeAmbitoDate(String(row[0] ?? ""));
    const venta = String(row[2] ?? "").trim();

    if (!venta) {
      throw new Error(
        "Cannot map an Ambito historical dollar payload without a venta value.",
      );
    }

    if (!sourceDateIso.startsWith(month)) {
      return [];
    }

    return [
      {
        rate: sanitizePrice(venta),
        rowIndex,
        sourceDateIso,
      },
    ];
  });

  if (availableRates.length === 0) {
    throw new MissingMonthlyExchangeRateError(month);
  }

  availableRates.sort((left, right) => {
    const dateComparison = left.sourceDateIso.localeCompare(right.sourceDateIso);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.rowIndex - right.rowIndex;
  });

  const lastRate = availableRates[availableRates.length - 1];

  return {
    rate: lastRate.rate,
    sourceDateIso: lastRate.sourceDateIso,
  };
}
