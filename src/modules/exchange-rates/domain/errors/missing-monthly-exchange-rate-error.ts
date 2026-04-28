export class MissingMonthlyExchangeRateError extends Error {
  constructor(month: string) {
    super(
      `Cannot resolve a monthly exchange rate snapshot because no values were found for month "${month}".`,
    );
    this.name = "MissingMonthlyExchangeRateError";
  }
}
