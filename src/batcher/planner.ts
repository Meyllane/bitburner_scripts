import { RamMap } from "@/lib/rammap";
import { NS } from "@ns";
import { Job } from "./dispatcher";

const H_COST = 1.70
const W_COST = 1.75
const G_COST = 1.75

const DELAY = 100;
const FULL_DELAY = DELAY * 4

export enum PLANNER_ACTION {
    HACK = 0,
    GROW = 1,
    WEAKEN = 2
}

class HGWPlan {
    public hack: number
    public weakenH: number
    public grow: number
    public weakenG: number
    public stealPerc: number
    public ramCost: number
    public moneyStolen: number
    public moneyPerRam: number
    
    public constructor(hack: number, weakenH: number, grow: number, weakenG: number, stealPerc: number, ramCost: number, moneyStolen: number, moneyPerRam: number) {
        this.hack = hack
        this.weakenH = weakenH
        this.grow = grow
        this.weakenG = weakenG
        this.stealPerc = stealPerc
        this.ramCost = ramCost
        this.moneyStolen = moneyStolen
        this.moneyPerRam = moneyPerRam
    }
}

export function findTargets(ns: NS) {
    let targets = ns.read("/etc/servers.txt").split("\n")
        .filter((server) => {
            return ns.hasRootAccess(server) && ns.getServerMaxMoney(server) > 0 && ns.getServerRequiredHackingLevel(server) <= ns.getHackingLevel()
        })
        .map((server) => {return {serverName: server, ratio: ns.getServerMaxMoney(server) / ns.getServerBaseSecurityLevel(server)}})
        .sort((a, b) => b.ratio - a.ratio)

    return targets
}

export function getWJobs(ns: NS, targetServerName: string, ramMap: RamMap): Job[] {
    let queue = [];
    let secDelta = ns.getServerSecurityLevel(targetServerName) - ns.getServerMinSecurityLevel(targetServerName)
    for (let server of ramMap.map) {
        const MAX_W_THREADS = Math.floor(server.ram / W_COST)
        
        if (MAX_W_THREADS == 0) continue

        const W_EFFECT = ns.weakenAnalyze(1, ns.getServer(server.serverName).cpuCores)
        
        let neededW = Math.ceil(secDelta/W_EFFECT)

        const NB_W = Math.min(MAX_W_THREADS, neededW)

        queue.push(new Job(
            `prepW-weaken-${targetServerName}`,
            server.serverName,
            PLANNER_ACTION.WEAKEN,
            "batcher/worker.js",
            targetServerName,
            NB_W,
            0,
            W_COST
        ))

        secDelta -= Math.min(W_EFFECT*NB_W, secDelta)
        server.ram -= W_COST*NB_W
        if (secDelta == 0) break
    }

    return queue;
}

//TODO : Batch limit
export function getWGJobs(ns: NS, targetServerName: string, ramMap: RamMap): Job[] {
    let queue: Job[] = []
    const growFactor = ns.getServerMaxMoney(targetServerName) / ns.getServerMoneyAvailable(targetServerName)
    let neededG = Math.ceil(ns.growthAnalyze(targetServerName, growFactor, 1))

    let counter = 0;
    for (let server of ramMap.map) {
        const W_EFFECT = ns.weakenAnalyze(1, ns.getServer(server.serverName).cpuCores)
        const G_SEC_EFFECT = ns.growthAnalyzeSecurity(1, targetServerName, ns.getServer(server.serverName).cpuCores)
        const WG_RATIO = Math.floor(W_EFFECT/G_SEC_EFFECT)
        const GW_COST = G_COST + WG_RATIO * W_COST

        const MAX_GW_THREADS = Math.floor(server.ram / GW_COST)

        if (MAX_GW_THREADS == 0) continue

        const NB_G = Math.min(neededG, MAX_GW_THREADS * WG_RATIO)
        const NB_W = MAX_GW_THREADS

        const W_TIME = counter*(DELAY*2)
        const G_TIME = ns.getWeakenTime(targetServerName) - ns.getGrowTime(targetServerName) - DELAY + counter*(DELAY*2)

        queue.push(new Job(
            `prepG-grow-${targetServerName}-${counter}`,
            server.serverName,
            PLANNER_ACTION.GROW,
            "batcher/worker.js",
            targetServerName,
            NB_G,
            G_TIME,
            G_COST
        ))

        queue.push(new Job(
            `prepG-weaken-${targetServerName}-${counter}`,
            server.serverName,
            PLANNER_ACTION.WEAKEN,
            "batcher/worker.js",
            targetServerName,
            NB_W,
            W_TIME,
            W_COST
        ))

        server.ram -= NB_G*GW_COST
        neededG -= Math.min(NB_G, neededG)
        if (neededG == 0) break
    }

    return queue
}

export function getHGWJobs(ns: NS, targetServerName: string, ramMap: RamMap) {
    let queue = []
    const WEAKEN_TIME = ns.getWeakenTime(targetServerName)
    const GROW_TIME = ns.getGrowTime(targetServerName)
    const HACK_TIME = ns.getHackTime(targetServerName)
    let remaining_cycle = Math.floor(HACK_TIME / (DELAY * 4))

    const OPTI = findOptimalHGW(ns, targetServerName, ramMap)

    let cycle = 0
    for (let server of ramMap.map) {
        let batch = OPTI.find((opti) => opti.serverName == server.serverName)
        if (batch === undefined) continue

        const MAX_NB_BATCH = Math.floor(server.ram / batch.plan.ramCost)
        if (MAX_NB_BATCH == 0) continue
        
        let allowed_cycle = Math.min(remaining_cycle, MAX_NB_BATCH)

        for (let i=cycle; i <= cycle + allowed_cycle - 1; i++) {
            queue.push(new Job(
                `hack-hack-${targetServerName}-${i}`,
                server.serverName,
                PLANNER_ACTION.HACK,
                "batcher/worker.js",
                targetServerName,
                batch.plan.hack,
                WEAKEN_TIME - HACK_TIME - DELAY + FULL_DELAY * i,
                H_COST
            ))

            queue.push(new Job(
                `hack-weakenH-${targetServerName}-${i}`,
                server.serverName,
                PLANNER_ACTION.WEAKEN,
                "batcher/worker.js",
                targetServerName,
                batch.plan.weakenH,
                FULL_DELAY * i,
                W_COST
            ))

            queue.push(new Job(
                `hack-grow-${targetServerName}-${i}`,
                server.serverName,
                PLANNER_ACTION.GROW,
                "batcher/worker.js",
                targetServerName,
                batch.plan.grow,
                WEAKEN_TIME - GROW_TIME + DELAY + FULL_DELAY * i,
                G_COST
            ))

            queue.push(new Job(
                `hack-weakenG-${targetServerName}-${i}`,
                server.serverName,
                PLANNER_ACTION.WEAKEN,
                "batcher/worker.js",
                targetServerName,
                batch.plan.weakenG,
                2*DELAY + FULL_DELAY * i,
                W_COST
            ))
        }

        cycle += allowed_cycle
        server.ram -= batch.plan.ramCost * allowed_cycle
        remaining_cycle -= allowed_cycle
        if (remaining_cycle == 0) break
    }

    return queue
}

export function findOptimalHGW(ns: NS, targetServerName: string, ramMap: RamMap) {
    const HOME_CPU_CORES = ns.getServer("home").cpuCores

    const MIN_PERC = 0.01
    const MAX_PERC = 0.95
    let stealPerc = MIN_PERC

    let home_results = []
    let other_results = []

    while (true) {
        if (stealPerc > MAX_PERC) break

        home_results.push(planHGWJob(ns, HOME_CPU_CORES, targetServerName, stealPerc))
        other_results.push(planHGWJob(ns, 1, targetServerName, stealPerc))
        stealPerc += 0.01
    }

    let opti: {serverName: string, plan: HGWPlan}[] = []
    for (let server of ramMap.map) {
        let res = server.serverName == "home" ? home_results : other_results

        let best = res.filter((res) => res.ramCost <= server.ram).sort((a, b) => b.moneyPerRam - a.moneyPerRam)

        if (best.length == 0) continue

        opti.push({serverName: server.serverName, plan: best[0]})
    }

    return opti
}

function planHGWJob(ns: NS, hostCPUCores: number, targetServerName: string, stealPerc: number) {
    const PERC_HACK_PER_THREAD = ns.hackAnalyze(targetServerName)
    const TARGET_MAX_MONEY = ns.getServerMaxMoney(targetServerName)
    const MONEY_STOLEN = TARGET_MAX_MONEY * stealPerc

    const H_NEEDED = Math.ceil(stealPerc / PERC_HACK_PER_THREAD)
    const H_SEC_EFFECT = ns.hackAnalyzeSecurity(H_NEEDED)
    const W_H_NEEDED = Math.ceil(H_SEC_EFFECT / ns.weakenAnalyze(1, hostCPUCores))

    const GROW_FACTOR = TARGET_MAX_MONEY / (TARGET_MAX_MONEY * (1-stealPerc))
    const G_NEEDED = Math.ceil(ns.growthAnalyze(targetServerName, GROW_FACTOR, hostCPUCores)*1.10) 
    const G_SEC_EFFECT = ns.growthAnalyzeSecurity(G_NEEDED, undefined, hostCPUCores)
    const W_G_NEEDED = Math.ceil(G_SEC_EFFECT/ns.weakenAnalyze(1, hostCPUCores))

    const RAM_COST = H_NEEDED * H_COST + G_NEEDED * G_COST + (W_H_NEEDED + W_G_NEEDED) * W_COST

    const W_TIME = ns.getWeakenTime(targetServerName)

    return new HGWPlan(
        H_NEEDED,
        W_H_NEEDED,
        G_NEEDED,
        W_G_NEEDED,
        stealPerc,
        RAM_COST,
        MONEY_STOLEN,
        MONEY_STOLEN / RAM_COST / W_TIME
    )
}