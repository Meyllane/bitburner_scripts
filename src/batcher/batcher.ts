import { RamMap } from "@/lib/rammap";
import { NS } from "@ns";
import { getHGWJobs, getWGJobs, getWJobs } from "./planner";
import { Dispatcher, Job } from "./dispatcher";
export async function main(ns: NS) {
    ns.disableLog("ALL")

    let serverList = ["home"]

    let ramMap = new RamMap(ns, serverList);
    const DISPATCHER = new Dispatcher(ns)
    DISPATCHER.clearAllPorts()

    let target = "joesguns"

    let playerLevel = ns.getHackingLevel()

    while (true) {
        let newLevel = ns.getHackingLevel()
        ramMap = new RamMap(ns, serverList)

        if (newLevel > playerLevel) {
            ns.print("Level up detected : Killing all jobs and replanning.")
            playerLevel = newLevel
            DISPATCHER.killAll()
        }

        let isWorkedOn = DISPATCHER.isServerWorkedOn(target)

        let secDelta = ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)

        if (secDelta > 0 && !isWorkedOn) {
            ns.print("Planning Weaken prep")
            DISPATCHER.add(getWJobs(ns, target, ramMap))
        }
        
        if (ns.getServerMaxMoney(target) != ns.getServerMoneyAvailable(target) && !isWorkedOn) {
            ns.print("Planning Grow prep")
            DISPATCHER.add(getWGJobs(ns, target, ramMap))
        }

        if (!isWorkedOn) {
            ns.print("Planning Hack")
            DISPATCHER.add(getHGWJobs(ns, target, ramMap))
        }

        DISPATCHER.dispatch()

        for (let port of DISPATCHER.getAssignedPorts()) {
            let data = ns.readPort(port)
            if (data != "NULL PORT DATA") {
                ns.tprint("Clearing PID " + data)
                DISPATCHER.clearJob(data)
            }
        }

        await ns.sleep(3000)
    }
}