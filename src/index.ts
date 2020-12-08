import { Coin, Coins, LocalTerra } from "@terra-money/terra.js";
import basset from "./helper/basset_helper";

const terra = new LocalTerra();
const test9 = terra.wallets.test9;
const test3 = terra.wallets.test3;
const test2 = terra.wallets.test2;

const location = `/../../../anchor-bAsset-contracts/artifacts`;
const validator = "terravaloper1dcegyrekltswvyy0xy69ydgxn9x8x32zdy3ua5";

async function main() {
  const bluna = new basset();
  await bluna.storeCodes(test9, location);
  console.log("Wasm files are stored");
  await bluna.instantiate(test9);
  console.log("Instantiation is done");
  await bluna.params(test9);
  await bluna.register_validator(test9);
  //
  await bluna.bond(test9, 200, validator);
  //
  await bluna.bond(test9, 50, validator);
  await bluna.bond(test9, 50, validator);
  await bluna.bond(test3, 50, validator);
  await bluna.bond(test3, 50, validator);
  await bluna.bond(test3, 50, validator);
  const b = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_token.contractAddress,
    {
      balance: { address: `${test9.key.accAddress}` },
    }
  );
  console.log(b);
  const rew = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      accrued_rewards: { address: `${test9.key.accAddress}` },
    }
  );
  console.log(rew);
  await bluna.update_global(test9);
  await bluna.reward(test9);
  await bluna.reward(test3);
  let coin = new Coin("uluna", 1000);
  await bluna.bank_send(
    test9,
    bluna.contractInfo.anchor_basset_hub.contractAddress,
    coin
  );
  await delay(66000);

  const block = await terra.tendermint.blockInfo();
  const t = new Date(block.block.header.time);
  const time = t.getTime();
  console.log(time);
  const query = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_hub.contractAddress,
    {
      withdrawable_unbonded: {
        address: `${test9.key.accAddress}`,
        block_time: time,
      },
    }
  );
  console.log(query);
  await bluna.finish(test9);

  const query2 = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_hub.contractAddress,
    {
      withdrawable_unbonded: {
        address: `${test9.key.accAddress}`,
        block_time: time,
      },
    }
  );
  console.log(query2);
  await bluna.transfer_cw20_token(test3, test9, 50);
  const index1 = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      global_index: {},
    }
  );
  console.log(index1);
  await bluna.update_global(test9);
  const index = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      global_index: {},
    }
  );
  console.log(index);
  await bluna.transfer_cw20_token(test9, test3, 50);
  const reward2 = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      pending_rewards: { address: `${test9.key.accAddress}` },
    }
  );
  console.log(reward2);
  const a = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_token.contractAddress,
    {
      balance: { address: `${test9.key.accAddress}` },
    }
  );
  console.log(a);

  const reward3 = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      pending_rewards: { address: `${test3.key.accAddress}` },
    }
  );
  console.log(reward3);
  const c = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_token.contractAddress,
    {
      token_info: {},
    }
  );
  // console.log(c);
  await bluna.reward(test9);
  await bluna.reward(test3);

  const reward4 = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      pending_rewards: { address: `${test3.key.accAddress}` },
    }
  );
  console.log(reward4);
  const bal = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_token.contractAddress,
    {
      balance: { address: `${test3.key.accAddress}` },
    }
  );
  console.log(bal);
  await bluna.transfer_cw20_token(test3, test2, 10);
  const user = await terra.wasm.contractQuery(
    bluna.contractInfo.anchor_basset_reward.contractAddress,
    {
      user_index: { address: `${test2.key.accAddress}` },
    }
  );
  console.log(user);
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
