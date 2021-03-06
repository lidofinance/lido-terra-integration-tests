/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * Binary is a wrapper around Vec<u8> to add base64 de/serialization with serde. It also adds some helper methods to help encode inline.
 *
 * This is only needed as serde-json-{core,wasm} has a horrible encoding for Vec<u8>
 */
export type Binary = string;

export interface Config {
  airdrop_registry_contract?: Binary | null;
  bluna_token_contract?: Binary | null;
  creator: Binary;
  reward_dispatcher_contract?: Binary | null;
  stluna_token_contract?: Binary | null;
  validators_registry_contract?: Binary | null;
  [k: string]: unknown;
}
