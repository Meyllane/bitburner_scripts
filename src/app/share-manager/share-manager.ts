import { NS } from "@ns";

const SHARE_COST = 4

export async function main(ns: NS) {
    let workers = ["server-0"]

    let pids: number[] = []

    ns.atExit(() => pids.forEach(ns.kill))

    while (true) {
        for (let server of workers) {
            let MAX_SHARE = Math.floor(ns.getServerMaxRam(server) / SHARE_COST)
            if (MAX_SHARE == 0) continue
            let pid = ns.exec(
                "app/share-manager/share.js",
                server,
                {ramOverride: SHARE_COST, threads: MAX_SHARE}
            )
            pids.push(pid)
        }

        await ns.sleep(100)
    }
}