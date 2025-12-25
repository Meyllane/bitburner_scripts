import { RamMap } from "@/lib/rammap";
import { NS } from "@ns";
import { getBestAttackPlans, getHGWJobs, getWGJobs, getWJobs, getXPJobs } from "./planner";
import { Dispatcher, JOB_STATUS } from "./dispatcher";
import { customPrint } from "@/lib/func";

export function getHackableServers(ns: NS) {
    let servers = ns.read("/etc/servers.txt").split("\n")
    
    if (!ns.hasTorRouter()) servers = servers.filter(hostname => hostname != "darkweb")
    
    return servers
        .map(hostname => ns.getServer(hostname))
        .filter(server => server.moneyMax != undefined && server.moneyMax > 0 && server.hasAdminRights)
}

export async function main(ns: NS) {
    ns.disableLog("ALL")

    let excludeHome = false
    const MIN_PERC = 0.01
    const MAX_PERC = 0.99
    const GROW_SAFETY_FACTOR = 1.05
    let maxTargets = 1
    let workers = ["server-0"]
    let xpMode = false

    if (workers.length == 0) {
        workers = ns.getPurchasedServers()
        if (!excludeHome) workers.push("home")

        if (workers.length == 0) workers.push("home")
    } 
    let ramMap = new RamMap(ns, workers);

    const DISPATCHER = new Dispatcher(ns)
    DISPATCHER.clearAllPorts()

    let hackableTargets = getHackableServers(ns)
    let hasFormulas = ns.fileExists("Formulas.exe")
    let bestPlans = getBestAttackPlans(ns, hackableTargets, ramMap, hasFormulas, MIN_PERC, MAX_PERC, GROW_SAFETY_FACTOR)
    let actualTargets = bestPlans.slice(0, maxTargets).map(plan => plan.targetHostname)

    if (xpMode) actualTargets = ["joesguns"]
    
    let playerLevel = ns.getHackingLevel()

    //Decide targets

    while (true) {
        let newPlayerLevel = ns.getHackingLevel()
        ramMap = new RamMap(ns, workers)

        if (newPlayerLevel > playerLevel && !xpMode) {
            DISPATCHER.killAllNotRunning()
            //customPrint(ns, `Level up detected. Killing all non running jobs and recalculating targets.`)
            playerLevel = newPlayerLevel
            hackableTargets = getHackableServers(ns)
            bestPlans = getBestAttackPlans(ns, hackableTargets, new RamMap(ns, workers, true), hasFormulas, MIN_PERC, MAX_PERC, GROW_SAFETY_FACTOR)
            actualTargets = bestPlans.slice(0, maxTargets).map(plan => plan.targetHostname)
        }

        for (let target of actualTargets) {
            if (ns.getServerSecurityLevel(target) > ns.getServerMinSecurityLevel(target) && !DISPATCHER.isServerWorkedOn(target)) {
                customPrint(ns, `Weakening ${target}`)
                DISPATCHER.add(getWJobs(ns, target, ramMap))
            }

            if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target)  && !DISPATCHER.isServerWorkedOn(target)) {
                customPrint(ns, `Growing ${target}`)
                DISPATCHER.add(getWGJobs(ns, target, ramMap))
            }

            if (!DISPATCHER.isServerWorkedOn(target)) {
                if (!xpMode) {
                    if (!hasFormulas) {
                        bestPlans = getBestAttackPlans(ns, hackableTargets, new RamMap(ns, workers, true), hasFormulas, MIN_PERC, MAX_PERC, GROW_SAFETY_FACTOR)
                    }
                    let plan = bestPlans.find(plan => plan.targetHostname == target)
                    if (plan == undefined) continue
                    customPrint(ns, `Hacking ${target} with plan {H: ${plan.hack}, WH: ${plan.weakenH}, G: ${plan.grow}, WG: ${plan.weakenG}}`)
                    DISPATCHER.add(getHGWJobs(ns, ns.getServer(target), ramMap, plan.stealPerc, hasFormulas, GROW_SAFETY_FACTOR))
                } else {
                    customPrint(ns, `XPing on ${target}`)
                    DISPATCHER.add(getXPJobs(ns, target, ramMap))
                }
            }
        }

        DISPATCHER.dispatch()
        DISPATCHER.monitor()
        await ns.sleep(100)
    }
}