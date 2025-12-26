import { SHARE_COST, SHARE_SCRIPT_PATH } from '@/lib/constant';
import { RamMap } from '@/lib/rammap';
import { NS } from '@ns';

export class ShareManager {
    private ns: NS;
    public ramMap: RamMap;
    public pids: number[] = [];

    public constructor(ns: NS, ramMap: RamMap) {
        this.ns = ns;
        this.ramMap = ramMap;
    }

    public run() {
        for (let server of this.ramMap.map) {
            const MAX_SHARE = Math.floor(server.availableRam / SHARE_COST);
            if (MAX_SHARE == 0) continue;

            let pid = this.ns.exec(SHARE_SCRIPT_PATH, server.hostname, { threads: MAX_SHARE });

            this.pids.push(pid);
        }
    }

    public killShares() {
        this.pids.forEach(this.ns.kill);
        this.pids = [];
    }
}

export async function main(ns: NS) {
    ns.disableLog("ALL")

    let workers = ["server-0"]

    let t = new RamMap(ns, workers, false, true)

    const SHARE_MANAGER = new ShareManager(ns, t)

    SHARE_MANAGER.run()
}
