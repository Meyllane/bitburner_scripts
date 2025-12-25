import { RamMap, RamUnit } from "@/lib/rammap";
import { NS, Server } from "@ns";
import { Job } from "./dispatcher";
import { getDepOptimizationConfig } from "vite";

const H_COST = 1.70
const W_COST = 1.75
const G_COST = 1.75

const DELAY = 50;
const FULL_DELAY = DELAY * 4

export enum PLANNER_ACTION {
    HACK = 0,
    GROW = 1,
    WEAKEN = 2
}

export class AttackPlan {
    public targetHostname: string
    public hack: number
    public weakenH: number
    public grow: number
    public weakenG: number
    public stealPerc: number
    public ramCost: number
    public moneyStolen: number
    public performance: number
    
    public constructor(targetHostname: string, hack: number, weakenH: number, grow: number, 
        weakenG: number, stealPerc: number, ramCost: number, moneyStolen: number, performance: number) {
        
        this.targetHostname = targetHostname
        this.hack = hack
        this.weakenH = weakenH
        this.grow = grow
        this.weakenG = weakenG
        this.stealPerc = stealPerc
        this.ramCost = ramCost
        this.moneyStolen = moneyStolen
        this.performance = performance
    }
}

export function simulatePreppedServer(ns: NS, targetName: string) {
    let target = ns.getServer(targetName)

    target.hackDifficulty = target.minDifficulty
    target.moneyAvailable = target.moneyMax

    return target
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
        const MAX_W_THREADS = Math.floor(server.availableRam / W_COST)
        
        if (MAX_W_THREADS == 0) continue

        const W_EFFECT = ns.weakenAnalyze(1, ns.getServer(server.hostname).cpuCores)
        
        let neededW = Math.ceil(secDelta/W_EFFECT)

        const NB_W = Math.min(MAX_W_THREADS, neededW)

        queue.push(new Job(
            `prepW-weaken-${targetServerName}`,
            server.hostname,
            PLANNER_ACTION.WEAKEN,
            "batcher/worker.js",
            targetServerName,
            NB_W,
            0,
            W_COST
        ))

        secDelta -= Math.min(W_EFFECT*NB_W, secDelta)
        server.availableRam -= W_COST*NB_W
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
        const W_EFFECT = ns.weakenAnalyze(1, ns.getServer(server.hostname).cpuCores)
        const G_SEC_EFFECT = ns.growthAnalyzeSecurity(1, targetServerName, ns.getServer(server.hostname).cpuCores)
        const WG_RATIO = Math.floor(W_EFFECT/G_SEC_EFFECT)
        const GW_COST = G_COST + WG_RATIO * W_COST

        const MAX_GW_THREADS = Math.floor(server.availableRam / GW_COST)

        if (MAX_GW_THREADS == 0) continue

        const NB_G = Math.min(neededG, MAX_GW_THREADS * WG_RATIO)
        const NB_W = MAX_GW_THREADS

        const W_TIME = counter*(DELAY*2)
        const G_TIME = ns.getWeakenTime(targetServerName) - ns.getGrowTime(targetServerName) - DELAY + counter*(DELAY*2)

        queue.push(new Job(
            `prepG-grow-${targetServerName}-${counter}`,
            server.hostname,
            PLANNER_ACTION.GROW,
            "batcher/worker.js",
            targetServerName,
            NB_G,
            G_TIME,
            G_COST
        ))

        queue.push(new Job(
            `prepG-weaken-${targetServerName}-${counter}`,
            server.hostname,
            PLANNER_ACTION.WEAKEN,
            "batcher/worker.js",
            targetServerName,
            NB_W,
            W_TIME,
            W_COST
        ))

        server.availableRam -= NB_G*GW_COST
        neededG -= Math.min(NB_G, neededG)
        if (neededG == 0) break
    }

    return queue
}

export function getHGWJobs(ns: NS, targetServer: Server, ramMap: RamMap, stealPerc: number, hasFormulas: boolean, growSafetyFactor: number = 1.10) {
    let queue = []
    const WEAKEN_TIME = ns.getWeakenTime(targetServer.hostname)
    const GROW_TIME = ns.getGrowTime(targetServer.hostname)
    const HACK_TIME = ns.getHackTime(targetServer.hostname)
    let remaining_cycle = Math.floor(HACK_TIME / (DELAY * 4))

    let cycle = 0
    for (let server of ramMap.map) {
        const CPU_CORES = ns.getServer(server.hostname).cpuCores
        let plan = getAttackPlan(ns, CPU_CORES, targetServer, stealPerc, hasFormulas, growSafetyFactor)

        const MAX_NB_BATCH = Math.floor(server.availableRam / plan.ramCost)
        if (MAX_NB_BATCH == 0) continue
        
        let allowed_cycle = Math.min(remaining_cycle, MAX_NB_BATCH)

        for (let i=cycle; i <= cycle + allowed_cycle - 1; i++) {
            queue.push(new Job(
                `hack-hack-${targetServer.hostname}-${i}`,
                server.hostname,
                PLANNER_ACTION.HACK,
                "batcher/worker.js",
                targetServer.hostname,
                plan.hack,
                WEAKEN_TIME - HACK_TIME - DELAY + FULL_DELAY * i,
                H_COST
            ))

            queue.push(new Job(
                `hack-weakenH-${targetServer.hostname}-${i}`,
                server.hostname,
                PLANNER_ACTION.WEAKEN,
                "batcher/worker.js",
                targetServer.hostname,
                plan.weakenH,
                FULL_DELAY * i,
                W_COST
            ))

            queue.push(new Job(
                `hack-grow-${targetServer.hostname}-${i}`,
                server.hostname,
                PLANNER_ACTION.GROW,
                "batcher/worker.js",
                targetServer.hostname,
                plan.grow,
                WEAKEN_TIME - GROW_TIME + DELAY + FULL_DELAY * i,
                G_COST
            ))

            queue.push(new Job(
                `hack-weakenG-${targetServer.hostname}-${i}`,
                server.hostname,
                PLANNER_ACTION.WEAKEN,
                "batcher/worker.js",
                targetServer.hostname,
                plan.weakenG,
                2*DELAY + FULL_DELAY * i,
                W_COST
            ))
        }

        cycle += allowed_cycle
        server.availableRam -= plan.ramCost * allowed_cycle
        remaining_cycle -= allowed_cycle
        if (remaining_cycle == 0) break
    }

    return queue
}

export function getXPJobs(ns: NS, target: string, ramMap: RamMap) {
    let queue: Job[] = []

    for (let server of ramMap.map) {
        const MAX_GROW = Math.floor(server.availableRam/G_COST)

        if (MAX_GROW == 0) continue

        queue.push(new Job(
            "xp-grow",
            server.hostname,
            PLANNER_ACTION.GROW,
            "batcher/worker.js",
            target,
            MAX_GROW,
            0,
            G_COST
        ))

        server.availableRam -= MAX_GROW * G_COST
    }

    return queue
}

export function getBestAttackPlans(ns: NS, targetServers: Server[], ramMap: RamMap, hasFormulas: boolean, min_perc = 0.01, max_perc = 0.95, growSafetyFactor = 1.10) {
    let results: AttackPlan[] = []

    const BIGGEST_RAM_UNIT = (ramMap.getBiggestServer(false)as RamUnit)
    for (let target of targetServers) {
        let options = getAttackPlans(ns, target, ramMap, hasFormulas, min_perc, max_perc, growSafetyFactor)
            .filter(plan => plan.ramCost <= BIGGEST_RAM_UNIT.availableRam)
            .sort((a, b) => b.performance - a.performance)

        if (options.length > 0) results.push(options[0])
    }

    return results.sort((a, b) => b.performance - a.performance)
}

export function getAttackPlans(ns: NS, targetServer: Server, ramMap: RamMap, hasFormulas: boolean, min_perc = 0.01, max_perc = 0.95, growSafetyFactor = 1.10) {
    let results: AttackPlan[] = []

    const BIGGEST_SERVER = ns.getServer((ramMap.getBiggestServer(false)?.hostname as string))
    for (let i = min_perc; i <= max_perc; i += 0.01) {
        results.push(getAttackPlan(ns, BIGGEST_SERVER.cpuCores, targetServer, i, hasFormulas, growSafetyFactor))
    }

    return results
}

function getAttackPlan(ns: NS, hostCPUCores: number, targetServer: Server, stealPerc: number, hasFormulas: boolean, growSafetyFactor: number = 1.10) {
    //Simulate sec prepped
    targetServer.hackDifficulty = targetServer.minDifficulty

    const PLAYER = ns.getPlayer()
    const PERC_HACK_PER_THREAD = hasFormulas ? ns.formulas.hacking.hackPercent(targetServer, PLAYER) : ns.hackAnalyze(targetServer.hostname)
    const TARGET_MAX_MONEY = (targetServer.moneyMax as number)
    const MONEY_STOLEN = TARGET_MAX_MONEY * stealPerc

    const H_NEEDED = Math.ceil(stealPerc / PERC_HACK_PER_THREAD)
    const H_SEC_EFFECT = ns.hackAnalyzeSecurity(H_NEEDED)
    const W_H_NEEDED = Math.ceil(H_SEC_EFFECT / ns.weakenAnalyze(1, hostCPUCores))

    const H_CHANCE = hasFormulas ? ns.formulas.hacking.hackChance(targetServer, PLAYER) : ns.hackAnalyzeChance(targetServer.hostname)

    let G_NEEDED;
    if (hasFormulas) {
        let cTargetServer = Object.assign({}, targetServer)
        cTargetServer.moneyAvailable = TARGET_MAX_MONEY - MONEY_STOLEN 
        G_NEEDED = ns.formulas.hacking.growThreads(cTargetServer, PLAYER, TARGET_MAX_MONEY, hostCPUCores)
    } else {
        const GROW_FACTOR = TARGET_MAX_MONEY / (TARGET_MAX_MONEY * (1-stealPerc))
        G_NEEDED = Math.ceil(ns.growthAnalyze(targetServer.hostname, GROW_FACTOR, hostCPUCores)*growSafetyFactor)
    }
    
    const G_SEC_EFFECT = ns.growthAnalyzeSecurity(G_NEEDED, undefined, hostCPUCores)
    const W_G_NEEDED = Math.ceil(G_SEC_EFFECT/ns.weakenAnalyze(1, hostCPUCores))

    const RAM_COST = H_NEEDED * H_COST + G_NEEDED * G_COST + (W_H_NEEDED + W_G_NEEDED) * W_COST

    const W_TIME = hasFormulas ? ns.formulas.hacking.weakenTime(targetServer, PLAYER) : ns.getWeakenTime(targetServer.hostname)

    return new AttackPlan(
        targetServer.hostname,
        H_NEEDED,
        W_H_NEEDED,
        G_NEEDED,
        W_G_NEEDED,
        stealPerc,
        RAM_COST,
        MONEY_STOLEN,
        MONEY_STOLEN / RAM_COST / W_TIME * H_CHANCE
    )
}