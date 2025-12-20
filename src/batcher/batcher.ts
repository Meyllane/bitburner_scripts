import { RamMap } from "@/lib/rammap";
import { NS } from "@ns";
import { getHGWJobs, getWGJobs, getWJobs } from "./planner";
import { Job } from "./dispatcher";
export async function main(ns: NS) {
    ns.disableLog("ALL")
    ns.enableLog("exec")

    let ramMap = new RamMap(ns);
    let target = "joesguns"

    let servers = ns.getPurchasedServers()
    servers.push("home")

    let playerLevel = ns.getHackingLevel()

    let queue: Job[] = []

    while (true) {
        await ns.sleep(3000)
        let newLevel = ns.getHackingLevel()
        ramMap = new RamMap(ns);

        let pids = servers
            .map((server) => ns.ps(server))
            .reduce((prev, curr) => prev.concat(curr), [])
            .filter((process) => process.filename == "batcher/worker.js")
            .map((process) => process.pid)

        if (newLevel > playerLevel) {
            ns.print("Level up detected : Killing all jobs and replanning.")
            playerLevel = newLevel
            pids.forEach((pid) => ns.kill(pid))
        }

        if (pids.length > 0) continue

        let secDelta = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)

        if (queue.length == 0 && secDelta > 0) {
            ns.print("Planning Weaken prep")
            queue = queue.concat(getWJobs(ns, target, ramMap))
        }
        
        if (queue.length == 0 && ns.getServerMaxMoney(target) != ns.getServerMoneyAvailable(target)) {
            ns.print("Planning Grow prep")
            queue = queue.concat(getWGJobs(ns, target, ramMap))
        }

        if (queue.length == 0) {
            ns.print("Planning Hack")
            queue = queue.concat(getHGWJobs(ns, target, ramMap))
        }

        if (queue.length > 0) {
            for (let job of queue) {
                ns.print(job)
                ns.exec(
                    "batcher/worker.js", job.host, {ramOverride: job.ramOverride, threads: job.threads},
                    job.id,
                    job.script,
                    job.threads,
                    job.target,
                    job.sleepTime
                )
            }
        queue = []
        }
    }
}