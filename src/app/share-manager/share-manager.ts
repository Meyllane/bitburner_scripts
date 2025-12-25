import { NS } from "@ns";

const SHARE_COST = 2.5

export async function main(ns: NS) {
    let workers = ["server-0"]

    let pids: number[] = []

    ns.atExit(() => pids.forEach(ns.kill))

    for (let server of workers) {
        let MAX_SHARE = Math.floor(ns.getServerMaxRam(server) / SHARE_COST )
        let pid = ns.exec(
            "app/share-manager/share.js",
            server,
            {ramOverride: 2.5, threads: MAX_SHARE}
        )
        pids.push(pid)
    }
}