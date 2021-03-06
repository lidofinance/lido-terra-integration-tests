/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export type QueryMsg =
  | {
      config: {
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      state: {
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      current_batch: {
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      withdrawable_unbonded: {
        address: HumanAddr;
        block_time: number;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      parameters: {
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      unbond_requests: {
        address: HumanAddr;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      all_history: {
        limit?: number | null;
        start_from?: number | null;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    };
export type HumanAddr = string;
