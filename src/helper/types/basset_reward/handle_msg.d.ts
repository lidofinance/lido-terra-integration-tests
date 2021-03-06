/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export type HandleMsg =
  | {
      swap_to_reward_denom: {
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      update_global_index: {
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      increase_balance: {
        address: HumanAddr;
        amount: Uint128;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      decrease_balance: {
        address: HumanAddr;
        amount: Uint128;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    }
  | {
      claim_rewards: {
        recipient?: HumanAddr | null;
        [k: string]: unknown;
      };
      [k: string]: unknown;
    };
export type HumanAddr = string;
export type Uint128 = string;
