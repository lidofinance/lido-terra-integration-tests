import { mustPass, mustFailWithErrorMsg } from "../helper/flow/must";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { TestStateLocalTestNet } from "./common_localtestnet";

import { ERROR_MESSAGES } from "../helper/errors";

export default async function main(contracts?: Record<string, number>) {
  const testState = new TestStateLocalTestNet(contracts);
  await testState.init();

  let stLunaBondAmount = 20_000_000_000;
  let bLunaBondAmount = 20_000_000_000;

  await mustPass(
    testState.basset.bond_for_stluna(testState.wallets.c, stLunaBondAmount)
  );
  await mustPass(testState.basset.bond(testState.wallets.d, bLunaBondAmount));

  await mustPass(
    testState.basset.send_cw20_token(
      testState.basset.contractInfo.lido_terra_token.contractAddress,
      testState.wallets.d,
      10000,
      { unbond: {} },
      testState.basset.contractInfo.lido_terra_hub.contractAddress
    )
  );
  await mustPass(
    emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 15)
  );
  await mustPass(
    testState.basset.update_global_index(testState.wallets.ownerWallet)
  );

  // only the owner can manage guardians
  await mustFailWithErrorMsg(
    testState.basset.add_guardians(testState.wallets.d, [
      testState.wallets.a.key.accAddress,
      testState.wallets.b.key.accAddress,
    ]),
    ERROR_MESSAGES.UNAUTHORIZED
  );

  await mustPass(
    testState.basset.add_guardians(testState.wallets.ownerWallet, [
      testState.wallets.a.key.accAddress,
      testState.wallets.b.key.accAddress,
    ])
  );

  // guardian A pauses the contracts
  await mustPass(testState.basset.pauseContracts(testState.wallets.a));

  // check that all contracts are paused
  await mustFailWithErrorMsg(
    testState.basset.fabricate_mir_claim(testState.wallets.d, 10, "1000", [
      "aaa, bbb",
    ]),
    ERROR_MESSAGES.CONTRACT_PAUSED
  ); // airdrop must be paused
  await mustFailWithErrorMsg(
    testState.basset.update_global_index(testState.wallets.ownerWallet),
    ERROR_MESSAGES.CONTRACT_PAUSED
  ); // hub must be paused
  await mustFailWithErrorMsg(
    testState.basset.bond(testState.wallets.d, bLunaBondAmount),
    ERROR_MESSAGES.CONTRACT_PAUSED
  ); // hub must be paused
  await mustFailWithErrorMsg(
    testState.basset.bond_for_stluna(testState.wallets.d, stLunaBondAmount),
    ERROR_MESSAGES.CONTRACT_PAUSED
  ); // hub must be paused
  await mustFailWithErrorMsg(
    testState.basset.finish(testState.wallets.d),
    ERROR_MESSAGES.CONTRACT_PAUSED
  ); // hub must be paused
  await mustFailWithErrorMsg(
    testState.basset.reward(testState.wallets.d),
    ERROR_MESSAGES.CONTRACT_PAUSED
  ); // reward contract must be paused
  await mustFailWithErrorMsg(
    testState.basset.transfer_cw20_token(
      testState.basset.contractInfo.lido_terra_token.contractAddress,
      testState.wallets.d,
      testState.wallets.c,
      1_000_000_000
    ),
    ERROR_MESSAGES.CONTRACT_PAUSED
  );
  await mustFailWithErrorMsg(
    testState.basset.convert_bluna_to_stluna(
      testState.wallets.d,
      1_000_000_000
    ),
    ERROR_MESSAGES.CONTRACT_PAUSED
  );
  await mustFailWithErrorMsg(
    testState.basset.transfer_cw20_token(
      testState.basset.contractInfo.lido_terra_token_stluna.contractAddress,
      testState.wallets.c,
      testState.wallets.d,
      1_000_000_000
    ),
    ERROR_MESSAGES.CONTRACT_PAUSED
  );
  await mustFailWithErrorMsg(
    testState.basset.convert_bluna_to_stluna(
      testState.wallets.c,
      1_000_000_000
    ),
    ERROR_MESSAGES.CONTRACT_PAUSED
  );

  // only the owner can unpause contracts
  await mustFailWithErrorMsg(
    testState.basset.unpauseContracts(testState.wallets.a),
    ERROR_MESSAGES.UNAUTHORIZED
  );

  // unpause contracts
  await mustPass(
    testState.basset.unpauseContracts(testState.wallets.ownerWallet)
  );

  // check that all contracts are unpaused
  await mustPass(
    testState.basset.update_global_index(testState.wallets.ownerWallet)
  );
  await mustPass(testState.basset.bond(testState.wallets.d, bLunaBondAmount));
  await mustPass(
    testState.basset.bond_for_stluna(testState.wallets.d, stLunaBondAmount)
  );

  await mustPass(
    emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10)
  );

  await mustPass(testState.basset.finish(testState.wallets.d));
  await mustPass(testState.basset.reward(testState.wallets.d));
  await mustPass(
    testState.basset.transfer_cw20_token(
      testState.basset.contractInfo.lido_terra_token.contractAddress,
      testState.wallets.d,
      testState.wallets.c,
      1_000_000_000
    )
  );
  await mustPass(
    testState.basset.convert_bluna_to_stluna(testState.wallets.d, 1_000_000_000)
  );
  await mustPass(
    testState.basset.transfer_cw20_token(
      testState.basset.contractInfo.lido_terra_token.contractAddress,
      testState.wallets.c,
      testState.wallets.d,
      1_000_000_000
    )
  );
  await mustPass(
    testState.basset.convert_stluna_to_bluna(testState.wallets.c, 1_000_000_000)
  );

  // only the owner can manage guardians
  await mustFailWithErrorMsg(
    testState.basset.remove_guardians(testState.wallets.b, [
      testState.wallets.a.key.accAddress,
    ]),
    ERROR_MESSAGES.UNAUTHORIZED
  );

  await mustPass(
    testState.basset.remove_guardians(testState.wallets.ownerWallet, [
      testState.wallets.a.key.accAddress,
    ])
  );

  // guardian A cannot pause the contracts because it was removed
  await mustFailWithErrorMsg(
    testState.basset.pauseContracts(testState.wallets.a),
    ERROR_MESSAGES.UNAUTHORIZED
  );

  // but guardian B can pause the contracts
  await mustPass(testState.basset.pauseContracts(testState.wallets.b));
}

main()
  .then(() => console.log("done"))
  .catch(console.log);
