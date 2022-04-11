import * as path from "path";
import * as fs from "fs";

const nodes = {
    node0: {
        config: {
            persistent_peers: "29e4f400c4e3e62af8c10706187f884920628533@192.168.10.4:26656,365ecef46bf2c9137420e63b8483402df585dee9@192.168.10.5:26656,9f4084dfa29956eedcea935f9076bf6eea2a6d43@192.168.10.3:26656"
        },
        node_key: {"priv_key": {"type": "tendermint/PrivKeyEd25519", "value": "TxciFfhjyz6KtEZOKE22cpguqrSc7RoFOo0FzKhpnR2GNZ6AP53CArCJvKXFEmHVjYoMmImH3O+u72LHXzaJfA=="}},
        priv_validator_key: {
            "address": "D711D9CEA071FF9348D0CA9B62AFBEF154A94595",
            "pub_key": {
                "type": "tendermint/PubKeyEd25519",
                "value": "NNMJk3AcFqAnMvjr9F4YEDNM+c5qPwpSW8SGFmXT028="
            },
            "priv_key": {
                "type": "tendermint/PrivKeyEd25519",
                "value": "ave1fioevp0qbMGiE3FZatWEvmj3sF3EjNkfzwF8bdo00wmTcBwWoCcy+Ov0XhgQM0z5zmo/ClJbxIYWZdPTbw=="
            }
        }
    },
    node1: {
        config: {
            persistent_peers: "29e4f400c4e3e62af8c10706187f884920628533@192.168.10.4:26656,365ecef46bf2c9137420e63b8483402df585dee9@192.168.10.5:26656,665c40fa97f2f21771333f8e67808bb0b04105a0@192.168.10.2:26656"
        },
        node_key: {"priv_key": {"type": "tendermint/PrivKeyEd25519", "value": "taId5bNIvi2nabSerP2ne0tvwpmds8ggdF/jgzQar47iBHvl6fpap0i+sGkt/+cJr6foUHK+lxSFM6XDepvJFQ=="}},
        priv_validator_key: {
            "address": "836D334C28311559682F94A164CA43C03DDB41B4",
            "pub_key": {
                "type": "tendermint/PubKeyEd25519",
                "value": "EjwJeD8Qo9M8lp79vfyUtF7YcEzkGEi3Y8PJWRB09+8="
            },
            "priv_key": {
                "type": "tendermint/PrivKeyEd25519",
                "value": "dXMquLvquuJbuY2ebjlwi92FBDV1V5Jic0d58Cv4cJQSPAl4PxCj0zyWnv29/JS0XthwTOQYSLdjw8lZEHT37w=="
            }
        }
    },
    node2: {
        config: {
            persistent_peers: "365ecef46bf2c9137420e63b8483402df585dee9@192.168.10.5:26656,665c40fa97f2f21771333f8e67808bb0b04105a0@192.168.10.2:26656,9f4084dfa29956eedcea935f9076bf6eea2a6d43@192.168.10.3:26656"
        },
        node_key: {"priv_key": {"type": "tendermint/PrivKeyEd25519", "value": "yxP73MyMnbRqu936B3oV7mubPfeNBj3FFn2UZSW/pim+N2jC1fE3gnVwb4Bet2dZdcrKk9W5dyazl7SCdsG84A=="}},
        priv_validator_key: {
            "address": "F1028FE2688D79A8D3132FB4BBAEE9A6A3FFADCB",
            "pub_key": {
                "type": "tendermint/PubKeyEd25519",
                "value": "SS4hV1IO0g9cXwV6ZxTmULnR8v2gj5sjpyrhJq4A50k="
            },
            "priv_key": {
                "type": "tendermint/PrivKeyEd25519",
                "value": "aR2hN1iX0hZOZPzmOJFd+9OzNRLdVuaLX4KFqknodSxJLiFXUg7SD1xfBXpnFOZQudHy/aCPmyOnKuEmrgDnSQ=="
            }
        }
    },
    node3: {
        config: {
            persistent_peers: "29e4f400c4e3e62af8c10706187f884920628533@192.168.10.4:26656,665c40fa97f2f21771333f8e67808bb0b04105a0@192.168.10.2:26656,9f4084dfa29956eedcea935f9076bf6eea2a6d43@192.168.10.3:26656"
        },
        node_key: {"priv_key": {"type": "tendermint/PrivKeyEd25519", "value": "oRM2OKHhAVHecg3QFHaDhiUav1gw71xgBGrotsa4gr/RtPOhNoO35HI/ZopiDCNsDW0DpLPJPL37l/GBK+FOmQ=="}},
        priv_validator_key: {
            "address": "1A7A69711ADB69218A387F30B22F411368F310DF",
            "pub_key": {
                "type": "tendermint/PubKeyEd25519",
                "value": "EAI7kGuMo6BG1poseFcoMiSa4vHmXcYM4VCpFeIMncw="
            },
            "priv_key": {
                "type": "tendermint/PrivKeyEd25519",
                "value": "lR/kNcbffQvvW5FA0EoUKkZ3XrpMyI7HPg9teMKuTjUQAjuQa4yjoEbWmix4VygyJJri8eZdxgzhUKkV4gydzA=="
            }
        }
    }
}


const configToml = {
    timeout_propose: "3s",
    timeout_propose_delta: "500ms",
    timeout_prevote: "1s",
    timeout_prevote_delta: "500ms",
    timeout_precommit: "500ms",
    timeout_precommit_delta: "500ms",
    timeout_commit: "1500ms",
}

const fastConfigToml = {
    timeout_propose: "3s",
    timeout_propose_delta: "500ms",
    timeout_prevote: "1s",
    timeout_prevote_delta: "500ms",
    timeout_precommit: "500ms",
    timeout_precommit_delta: "500ms",
    timeout_commit: "500ms",
}

const ghConfigToml = {
    timeout_propose: "3s",
    timeout_propose_delta: "500ms",
    timeout_prevote: "1s",
    timeout_prevote_delta: "500ms",
    timeout_precommit: "500ms",
    timeout_precommit_delta: "500ms",
    timeout_commit: "5000ms",
}

const genesis = {
    unbonding_time: "10s",
    slash_fraction_downtime: "0.01",
    signed_blocks_window: "10",
    min_signed_per_window: "0.500000000000000000",
    //oracles
    vote_period: "7",
    vote_threshold: "0.500000000000000000",
    slash_fraction: "0.000100000000000000",
    slash_window: "100800",
    min_valid_per_window: "0.050000000000000000"
}

const fastGenesis = {
    unbonding_time: "10s",
    slash_fraction_downtime: "0.01",
    signed_blocks_window: "10",
    min_signed_per_window: "0.500000000000000000",
    //oracles
    vote_period: "15",
    vote_threshold: "0.500000000000000000",
    slash_fraction: "0.000100000000000000",
    slash_window: "100800",
    min_valid_per_window: "0.050000000000000000"
}

export const defaultProjConf = {
    nodes: nodes,
    configToml: configToml,
    genesis: genesis,
}

export const fastProjConf = {
    nodes: nodes,
    configToml: fastConfigToml,
    genesis: fastGenesis,
}

export const ghProjConf = {
    nodes: nodes,
    configToml: ghConfigToml,
    genesis: genesis,
}


const template_dir = path.join(__dirname, "..", "..", "testkit", "node_templates")

const pathGenerator = (moniker: string, proj_dir: string): (filename: string) => string => {
    return (s) => {
        return path.join(proj_dir, moniker, s)
    }
}

const gen_node = (moniker: string, proj_dir: string, projConf: any) => {
    const pg = pathGenerator(moniker, proj_dir)
    fs.mkdirSync(path.join(proj_dir, moniker))

    const addrbookPath = pg("addrbook.json")
    fs.writeFileSync(addrbookPath, "{}")

    fs.copyFileSync(path.join(template_dir, "app.toml"), pg("app.toml"))
    fs.copyFileSync(path.join(template_dir, "client.toml"), pg("client.toml"))

    let configFile = fs.readFileSync(path.join(template_dir, "config.toml")).toString()
    const {persistent_peers} = projConf.nodes[moniker].config
    const {timeout_propose, timeout_propose_delta, timeout_prevote, timeout_prevote_delta, timeout_precommit, timeout_precommit_delta, timeout_commit} = projConf.configToml
    fs.writeFileSync(pg("config.toml"), eval(`\`${configFile}\``))

    let genesisJson = fs.readFileSync(path.join(template_dir, "genesis.json")).toString()
    const genesis = projConf.genesis
    fs.writeFileSync(pg("genesis.json"), eval(`\`${genesisJson}\``))

    fs.writeFileSync(pg("node_key.json"), JSON.stringify(projConf.nodes[moniker].node_key))
    fs.writeFileSync(pg("priv_validator_key.json"), JSON.stringify(projConf.nodes[moniker].priv_validator_key))
}


export const createNodesConfigs = (projConf: any): string => {
    const tmp = fs.mkdtempSync("/tmp/terra-")
    for (let moniker in projConf.nodes) {
        gen_node(moniker, tmp, projConf)
    }
    return tmp
}

if (require.main === module) {
    createNodesConfigs(defaultProjConf)
}
