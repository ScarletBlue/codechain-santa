import { SDK } from "codechain-sdk";
import { Asset } from "codechain-sdk/lib/core/Asset";
import { AssetTransferAddress, H256, PlatformAddress, Transaction, U64 } from "codechain-sdk/lib/core/classes";
import { AssetTransaction } from "codechain-sdk/lib/core/Transaction";
import { TransferAsset } from "codechain-sdk/lib/core/transaction/TransferAsset";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import * as config from "config";

// should be modified.
const faucetSecret = "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
const faucetAddress = "tccq9h7vnl68frvqapzv3tujrxtxtwqdnxw6yamrrgd";

export default class Helper {
    private keyStore: KeyStore;
    private sdk: SDK;

    constructor(keyStore: KeyStore) {
        const rpcUrl = getConfig<string>("rpc_url");
        const networkId = getConfig<string>("network_id");

        this.sdk = new SDK({server: rpcUrl, networkId});
        this.keyStore = keyStore;
    };

    public createP2PKHAddress() {
        const p2pkh = this.sdk.key.createP2PKH({ keyStore: this.keyStore });
        return p2pkh.createAddress();
    }

    public async sendTransaction(
        tx: Transaction,
        params: {
            account: string | PlatformAddress;
            fee?: number | string | U64;
            seq?: number;
        }
    ) : Promise<H256> {
        const {account, fee = 10} = params;
        const { seq = await this.sdk.rpc.chain.getSeq(account) } = params;
        const signed = await this.sdk.key.signTransaction(tx, {
            keyStore: this.keyStore,
            account,
            fee,
            seq
        });
        return this.sdk.rpc.chain.sendSignedTransaction(signed);
    }

    public async sendAssetTransaction (
        tx: AssetTransaction & Transaction,
        options?: {
            seq?: number;
            fee?: number;
            awaitResult?: boolean;
            secret?: string;
        }
    ) : Promise<boolean[] | undefined> {
        const {
            seq = (await this.sdk.rpc.chain.getSeq(faucetAddress)) || 0,
            fee = 10,
            awaitResult = true,
            secret = faucetSecret
        } = options || {};
        const signed = tx.sign({
            secret,
            fee,
            seq
        });
        await this.sdk.rpc.chain.sendSignedTransaction(signed);
        if (awaitResult) {
            return this.sdk.rpc.chain.getTransactionResultsByTracker(
                tx.tracker(),
                {
                    timeout: 300 * 1000
                }
            );
        }
    }

    public async mintAsset(params: {
        supply: U64 | number;
        recipient?: string | AssetTransferAddress;
        secret?: string;
        seq?: number;
        metadata?: string;
    }) : Promise<Asset> {
        const {
            supply,
            seq,
            recipient = await this.createP2PKHAddress(),
            secret,
            metadata = "",
        } = params;
        const tx = this.sdk.core.createMintAssetTransaction({
            scheme: {
                shardId: 0,
                metadata,
                supply,
            },
            recipient
        });
        await this.sendAssetTransaction(tx, {
            secret,
            seq,
        });
        const asset = await this.sdk.rpc.chain.getAsset(tx.tracker(), 0, 0);
        if (asset === null) {
            throw Error(`Failed to mint asset`);
        }
        return asset;
    }

    public async signTransactionInput(
        tx: TransferAsset,
        index: number
    ) {
        await this.sdk.key.signTransactionInput(tx, index, { keyStore: this.keyStore });
    }
}

function getConfig<T>(field: string): T {
    const c = config.get<T>(field);
    if (c == null) {
        throw new Error(`${field} is not specified`);
    }
    return c;
}

export function haveConfig(field: string): boolean {
    return !!config.has(field) && config.get(field) != null;
}