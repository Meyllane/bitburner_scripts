import { RamMap } from "@/lib/rammap";
import { NS } from "@ns";
import { getHGWJobs, getWGJobs, getWJobs } from "./planner";
import { Dispatcher, JOB_STATUS } from "./dispatcher";
import { WorkerReport } from "./worker";
import { customPrint } from "@/lib/func";

export async function main(ns: NS) {
    ns.disableLog("ALL")

    let serverList = ns.getPurchasedServers()
    serverList.push("home")

    let ramMap = new RamMap(ns, serverList);
    const DISPATCHER = new Dispatcher(ns)
    DISPATCHER.clearAllPorts()

    let target = "max-hardware"

    let playerLevel = ns.getHackingLevel()

    while (true) {
        let newLevel = ns.getHackingLevel()
        ramMap = new RamMap(ns, serverList)

        if (newLevel > playerLevel) {
            customPrint(ns, "Level up detected. Killing all waiting jobs")
            playerLevel = newLevel
            DISPATCHER.killAllNotRunning()
        }

        let secDelta = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)

        if (secDelta > 0 && !DISPATCHER.isServerWorkedOn(target)) {
            customPrint(ns, `Weakening ${target}`)
            DISPATCHER.add(getWJobs(ns, target, ramMap))
        }
        
        if (ns.getServerMaxMoney(target) != ns.getServerMoneyAvailable(target) && !DISPATCHER.isServerWorkedOn(target)) {
            customPrint(ns, `Growing ${target}`)
            DISPATCHER.add(getWGJobs(ns, target, ramMap))
        }

        if (!DISPATCHER.isServerWorkedOn(target)) {
            customPrint(ns, `Hacking ${target}`)
            DISPATCHER.add(getHGWJobs(ns, target, ramMap))
        }

        DISPATCHER.dispatch()
        DISPATCHER.monitor()

        await ns.sleep(100)
    }
}