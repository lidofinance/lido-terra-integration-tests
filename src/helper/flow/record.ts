import { Msg } from "@terra-money/terra.js";

interface ActionRecord {
  height: number;
  msgs: Msg.Data[];
  gas: number;
}
const _history: ActionRecord[] = [];
let _height = 2;

export const makeRecord = (msgs: Msg[], gas_wanted: number) => {
  _history.push({
    height: _height++,
    msgs: msgs.map((msg) => msg.toData()),
    gas: gas_wanted,
  });
};

export const getRecord = () => _history;
