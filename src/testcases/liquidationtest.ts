import * as fs from "fs";
import { mustFail, mustPass } from "../helper/flow/must";
import { getRecord } from "../helper/flow/record";
import { MantleState } from "../mantle-querier/MantleState";
import { emptyBlockWithFixedGas } from "../helper/flow/gas-station";
import { configureMMOracle } from "../helper/oracle/mm-oracle";
import {TestState} from "./common";

let mantleState: MantleState;

async function main() {
    const testState = new TestState()
    mantleState = await testState.getMantleState()


    //block 29
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 30
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //block 31
    await mustPass(testState.basset.bond(testState.wallets.a, 2000000000000))

    //block 32 - 34
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 3))

    //success test
    //35
    await mustPass(testState.basset.bond(testState.wallets.a, 20000000000000,))
    //36
    await mustPass(testState.moneyMarket.liquidation_submit_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "5000000uusd"))
    //37
    await mustPass(testState.moneyMarket.liquidation_retract_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress, "1000000"))
    //38
    await mustPass(testState.moneyMarket.liquidation_retract_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress))
    //39
    await mustPass(testState.moneyMarket.liquidation_submit_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "5000000uusd"))
    //40
    await mustPass(testState.basset.send_cw20_token(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a, 1000000, {
        execute_bid: {
            liquidator: testState.wallets.c.key.accAddress,
            repay_addr: testState.wallets.a.key.accAddress,
            fee_addr: testState.wallets.a.key.accAddress

        }
    }, testState.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

    //fail test
    //41 
    await mustFail(testState.moneyMarket.liquidation_submit_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "2000000ukrw"))
    //42
    await mustFail(testState.moneyMarket.liquidation_retract_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress, "1000000"))
    //43
    await mustPass(testState.moneyMarket.liquidation_retract_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress))
    //44
    await mustPass(testState.moneyMarket.liquidation_submit_bid(testState.wallets.c, testState.basset.contractInfo["anchor_basset_token"].contractAddress, "0.2", "3000000uusd"))
    //45
    await mustFail(testState.basset.send_cw20_token(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a, 1000000, {
        execute_bid: {
            liquidator: testState.wallets.b.key.accAddress,
            repay_addr: testState.wallets.a.key.accAddress,
            fee_addr: testState.wallets.a.key.accAddress
        }
    }, testState.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

    //allowance execute bid test
    //46
    await mustPass(testState.basset.increase_allowance(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a, testState.wallets.b.key.accAddress, 5000000, { "never": {} }))
    //47
    await mustPass(testState.basset.send_from_cw20_token(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b, testState.wallets.a, 1000000, {
        execute_bid: {
            liquidator: testState.wallets.c.key.accAddress,
            repay_addr: testState.wallets.b.key.accAddress,
            fee_addr: testState.wallets.b.key.accAddress
        }
    }, testState.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))
    //48-57
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation, 10))
    //58 should fail as allowance expired
    await mustFail(testState.basset.send_from_cw20_token(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b, testState.wallets.a, 1000000, {
        execute_bid: {
            liquidator: testState.wallets.c.key.accAddress,
            repay_addr: testState.wallets.a.key.accAddress,
            fee_addr: testState.wallets.a.key.accAddress
        }
    }, testState.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

    //change oracle price and test execute bid
    //change oracle price to 0.5(previously 1)
    //60
    await testState.testkit.clearAutomaticTx(testState.previousOracleFeed.id)
    const previousOracleFeed2 = await testState.testkit.registerAutomaticTx(configureMMOracle(
        testState.keys.owner,
        testState.anchor.moneyMarket.contractInfo["moneymarket_oracle"].contractAddress,
        testState.anchor.bAsset.contractInfo["anchor_basset_token"].contractAddress,
        0.01
    ))
    //need to pass at least one block
    //61
    await mustPass(emptyBlockWithFixedGas(testState.lcdClient, testState.gasStation))

    //allowance testing
    //62
    await mustPass(testState.basset.increase_allowance(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a, testState.wallets.b.key.accAddress, 5000000, { "never": {} }))
    //63
    await mustPass(testState.basset.send_from_cw20_token(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.b, testState.wallets.a, 1000000, {
        execute_bid: {
            liquidator: testState.wallets.c.key.accAddress,
            repay_addr: testState.wallets.a.key.accAddress,
            fee_addr: testState.wallets.a.key.accAddress
        }
    }, testState.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))
    // normal testing
    //64
    await mustPass(testState.basset.send_cw20_token(testState.basset.contractInfo["anchor_basset_token"].contractAddress,
        testState.wallets.a, 1000000, {
        execute_bid: {
            liquidator: testState.wallets.c.key.accAddress,
            repay_addr: testState.wallets.a.key.accAddress,
            fee_addr: testState.wallets.a.key.accAddress
        }
    }, testState.moneyMarket.contractInfo["moneymarket_liquidation"].contractAddress))

}

main()
    .then(() => console.log("done"))
    .then(async () => {
        console.log("saving state...");
        fs.writeFileSync(
            "liquidationtest_action.json",
            JSON.stringify(getRecord(), null, 2)
        );
        fs.writeFileSync(
            "liquidationtest_state.json",
            JSON.stringify(await mantleState.getState(), null, 2)
        );
    })
    .catch(console.log);