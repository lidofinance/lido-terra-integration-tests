import {
  Coins,
  isTxError,
  LocalTerra,
  MsgExecuteContract,
  MsgStoreCode,
  Wallet,
} from "@terra-money/terra.js";
import * as fs from "fs";
import { instantiate, execute } from "./money_market_helper";
const terra = new LocalTerra();
const wallet = terra.wallet;

// TODO: anchor_token should be added in contracts.
const contracts = ["terraswap_pair", "terraswap_factory", "terraswap_token"];

export default class TerraSwap {
  public contractInfo: {
    [contractName: string]: { codeId: number; contractAddress: string };
  };

  constructor() {
    this.contractInfo = {};
  }

  public async storeCodes(sender: Wallet, location: string): Promise<void> {
    for (const c of contracts) {
      const bytecode = fs.readFileSync(__dirname + `${location}/${c}.wasm`);
      const storeCode = new MsgStoreCode(
        sender.key.accAddress,
        bytecode.toString("base64")
      );
      const tx = await sender.createAndSignTx({
        msgs: [storeCode],
      });
      const result = await terra.tx.broadcast(tx);
      if (isTxError(result)) {
        throw new Error(`Couldn't upload ${c}: ${result.raw_log}`);
      }

      const codeId = +result.logs[0].eventsByType.store_code.code_id[0];
      this.contractInfo[c] = {
        codeId,
        contractAddress: "",
      };
    }
  }

  public async instantiate_terraswap(sender: Wallet): Promise<void> {
    const terraswapFactory = await instantiate(
      sender,
      this.contractInfo.terraswap_factory.codeId,
      {
        token_code_id: this.contractInfo.terraswap_token.codeId,
        pair_code_id: this.contractInfo.terraswap_pair.codeId,
      }
    );

    if (isTxError(terraswapFactory)) {
      throw new Error(
        `Couldn't upload ${this.contractInfo.moneymarket_interest.codeId}: ${terraswapFactory.raw_log}`
      );
    }
    const interestAddr =
      terraswapFactory.logs[0].eventsByType.instantiate_contract
        .contract_address[0];
    this.contractInfo["terraswap_factory"].contractAddress = interestAddr;
  }

  public async provide_liquidity(
    sender: Wallet,
    asset: object[]
  ): Promise<void> {
    let contract = this.contractInfo["terraswap_pair"].contractAddress;
    const provideLiquidityExecution = await execute(sender, contract, {
      provide_liquidity: {
        assets: JSON.stringify(asset),
      },
    });
    if (isTxError(provideLiquidityExecution)) {
      throw new Error(`Couldn't run: ${provideLiquidityExecution.raw_log}`);
    }
  }

  public async send_cw20_token(
    sender: Wallet,
    amount: number,
    inputMsg: string,
    moneyMarketAddr: string
  ): Promise<void> {
    const msg = new MsgExecuteContract(
      sender.key.accAddress,
      this.contractInfo.terraswap_token.contractAddress,
      {
        send: {
          contract: moneyMarketAddr,
          amount: `${amount}`,
          msg: inputMsg,
        },
      }
    );
  }
}
