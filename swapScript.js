import fs from 'fs';
import readline from 'readline';
import { Factory, MAINNET_FACTORY_ADDR, Asset, PoolType, ReadinessStatus } from '@dedust/sdk';
import {Address, TonClient4, toNano, WalletContractV4} from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';

const tonClient = new TonClient4({
    endpoint: 'https://mainnet-v4.tonhubapi.com',
});
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

async function initializeVaultAndPool() {
    const tonVault = tonClient.open(await factory.getNativeVault());

    const SCALE_ADDRESS = Address.parse('EQBlqsm144Dq6SjbPI4jjZvA1hqTIP3CvHovbIfW_t-SCALE');
    const TON = Asset.native();
    const SCALE = Asset.jetton(SCALE_ADDRESS);

    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, SCALE]));

    if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Pool (TON, SCALE) does not exist.');
    }

    if ((await tonVault.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Vault (TON) does not exist.');
    }

    return { tonVault, pool };
}

async function processWallets(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        try {
            const { tonVault, pool } = await initializeVaultAndPool();
            const [walletAddress, mnemonicStr] = line.split(',');
            const mnemonic = mnemonicStr.trim().split(' ');
            const keys = await mnemonicToPrivateKey(mnemonic);
            const wallet = tonClient.open(
                WalletContractV4.create({
                    workchain: 0,
                    publicKey: keys.publicKey,
                })
            );


            const sender = wallet.sender(keys.secretKey);
            const amountIn = toNano('1'); //TON value

            await tonVault.sendSwap(sender, {
                poolAddress: pool.address,
                amount: amountIn,
                gasAmount: toNano('0.25'),
            });

            console.log(`Swap successful for wallet: ${walletAddress}`);
        } catch (error) {
            console.error(`Error processing wallet`, error);
        }
    }
}

const filePath = 'wallets.txt'; // Path to the file containing wallets and mnemonics
processWallets(filePath)
    .then(() => {
        console.log('All wallets processed.');
    })
    .catch((error) => {
        console.error('Error processing wallets:', error);
    });
