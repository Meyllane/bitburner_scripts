import { NS } from '@ns';
import { RamMap } from './lib/rammap';
import { Batcher, BatcherMode } from './app/batcher/batcher';
import { ShareManager } from './app/share-manager/share-manager';

export async function main(ns: NS) {
    ns.disableLog('ALL');

    let workers = [];
    let excludeHome = true;

    if (workers.length == 0) {
        workers.push(...ns.getPurchasedServers());

        if (excludeHome && workers.length == 0) {
            workers.push('home');
        }
    }

    let ramMap = new RamMap(ns, workers);
    let hasFormulas = ns.fileExists('Formulas.exe');
    const BATCHER = new Batcher(ns, workers, ramMap, hasFormulas);
    const SHARE_MANAGER = new ShareManager(ns, ramMap);
    BATCHER.batcherMode = BatcherMode.ATTACK;

    BATCHER.dispatcher.clearAllPorts();

    BATCHER.setup();
    while (true) {
        BATCHER.run();

        SHARE_MANAGER.ramMap = BATCHER.ramMap;

        if (BATCHER.dispatcher.getNumberQueued() > 0) {
            SHARE_MANAGER.killShares();
            BATCHER.dispatcher.dispatch();
        }

        SHARE_MANAGER.run();

        BATCHER.dispatcher.monitor();
        await ns.sleep(500);
    }
}
