/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export type Uint128 = string;
/**
 * A fixed-point decimal value with 18 fractional digits, i.e. Decimal(1_000_000_000_000_000_000) == 1.0
 *
 * The greatest possible value that can be represented is 340282366920938463463.374607431768211455 (which is (2^128 - 1) / 10^18)
 */
export type Decimal = string;

export interface AllHistoryResponse {
  history: UnbondHistory[];
}

export interface UnbondHistory {
  batch_id: number;
  bluna_amount: Uint128;
  bluna_applied_exchange_rate: Decimal;
  bluna_withdraw_rate: Decimal;
  released: boolean;
  stluna_amount: Uint128;
  stluna_applied_exchange_rate: Decimal;
  stluna_withdraw_rate: Decimal;
  time: number;
}
