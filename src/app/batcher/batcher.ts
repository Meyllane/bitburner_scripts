import { RamMap, RamUnit } from '@/lib/rammap';
import { NS, Server } from '@ns';
import { Dispatcher, Job, JobAction } from './dispatcher';
import { customPrint } from '@/lib/func';
import { DELAY, FULL_DELAY, G_COST, H_COST, W_COST, WORKER_SCRIPT_PATH } from '@/lib/constant';


export enum BatcherMode {
    ATTACK = 0,
    XP = 1,
}

export class AttackPlan {
    public targetHostname: string;
    public hack: number;
    public weakenH: number;
    public grow: number;
    public weakenG: number;
    public stealPerc: number;
    public ramCost: number;
    public moneyStolen: number;
    public performance: number;

    public constructor(
        targetHostname: string,
        hack: number,
        weakenH: number,
        grow: number,
        weakenG: number,
        stealPerc: number,
        ramCost: number,
        moneyStolen: number,
        performance: number,
    ) {
        this.targetHostname = targetHostname;
        this.hack = hack;
        this.weakenH = weakenH;
        this.grow = grow;
        this.weakenG = weakenG;
        this.stealPerc = stealPerc;
        this.ramCost = ramCost;
        this.moneyStolen = moneyStolen;
        this.performance = performance;
    }
}

export class Batcher {
    private MIN_PERC = 0.01;
    private MAX_PERC = 0.99;

    private ns: NS;
    public hackableServers: Server[] = [];
    public batcherMode: BatcherMode = BatcherMode.ATTACK;
    public excludeHome: boolean = true;
    public maxParallelTargets: number = 1;
    public workers: string[];
    public dispatcher: Dispatcher;
    public ramMap: RamMap;
    public growSafetyFactor: number = 1.05;
    public hasFormulas: boolean;
    public usedPlans: AttackPlan[] = [];
    public targets: string[] = [];
    public playerLevel: number

    public constructor(ns: NS, workers: string[], ramMap: RamMap, hasFormulas: boolean) {
        this.ns = ns;
        this.workers = workers;
        this.ramMap = ramMap;
        this.dispatcher = new Dispatcher(this.ns);
        this.hasFormulas = hasFormulas;
        this.hackableServers = this.getHackableServers();
        this.playerLevel = ns.getHackingLevel()
    }

    public getHackableServers() {
        let servers = this.ns.read('/etc/servers.txt').split('\n');

        if (!this.ns.hasTorRouter()) servers = servers.filter((hostname) => hostname != 'darkweb');

        return servers
            .map((hostname) => this.ns.getServer(hostname))
            .filter((server) => server.moneyMax != undefined && server.moneyMax > 0 && server.hasAdminRights);
    }

    public getAttackPlan(hostCPUCores: number, targetServer: Server, stealPerc: number) {
        //Simulate sec prepped
        targetServer.hackDifficulty = targetServer.minDifficulty;

        const PLAYER = this.ns.getPlayer();
        const PERC_HACK_PER_THREAD = this.hasFormulas
            ? this.ns.formulas.hacking.hackPercent(targetServer, PLAYER)
            : this.ns.hackAnalyze(targetServer.hostname);
        const TARGET_MAX_MONEY = targetServer.moneyMax as number;
        const MONEY_STOLEN = Math.ceil(TARGET_MAX_MONEY * stealPerc);

        const H_NEEDED = Math.ceil(stealPerc / PERC_HACK_PER_THREAD);
        const H_SEC_EFFECT = this.ns.hackAnalyzeSecurity(H_NEEDED);
        const W_H_NEEDED = Math.ceil(H_SEC_EFFECT / this.ns.weakenAnalyze(1, hostCPUCores));

        const H_CHANCE = this.hasFormulas
            ? this.ns.formulas.hacking.hackChance(targetServer, PLAYER)
            : this.ns.hackAnalyzeChance(targetServer.hostname);

        let G_NEEDED;
        if (this.hasFormulas) {
            let cTargetServer = Object.assign({}, targetServer);
            cTargetServer.moneyAvailable = TARGET_MAX_MONEY - MONEY_STOLEN;
            G_NEEDED = Math.ceil(this.ns.formulas.hacking.growThreads(cTargetServer, PLAYER, TARGET_MAX_MONEY, hostCPUCores));
        } else {
            const GROW_FACTOR = TARGET_MAX_MONEY / (TARGET_MAX_MONEY * (1 - stealPerc));
            G_NEEDED = Math.ceil(this.ns.growthAnalyze(targetServer.hostname, GROW_FACTOR, hostCPUCores));
        }
        G_NEEDED = Math.ceil(G_NEEDED * this.growSafetyFactor);

        const G_SEC_EFFECT = this.ns.growthAnalyzeSecurity(G_NEEDED, undefined, hostCPUCores);
        const W_G_NEEDED = Math.ceil(G_SEC_EFFECT / this.ns.weakenAnalyze(1, hostCPUCores));

        const RAM_COST = H_NEEDED * H_COST + G_NEEDED * G_COST + (W_H_NEEDED + W_G_NEEDED) * W_COST;

        const W_TIME = this.hasFormulas
            ? this.ns.formulas.hacking.weakenTime(targetServer, PLAYER)
            : this.ns.getWeakenTime(targetServer.hostname);

        return new AttackPlan(
            targetServer.hostname,
            H_NEEDED,
            W_H_NEEDED,
            G_NEEDED,
            W_G_NEEDED,
            stealPerc,
            RAM_COST,
            MONEY_STOLEN,
            (MONEY_STOLEN / W_TIME) * H_CHANCE,
        );
    }

    public getBestAttackPlans() {
        let results: AttackPlan[] = [];

        const BIGGEST_RAM_UNIT = this.ramMap.getBiggestServer(false) as RamUnit;
        for (let target of this.hackableServers) {
            let options = this.getAttackPlans(target)
                .filter((plan) => plan.ramCost <= BIGGEST_RAM_UNIT.availableRam)
                .sort((a, b) => b.performance - a.performance);

            if (options.length > 0) results.push(options[0]);
        }

        return results.sort((a, b) => b.performance - a.performance);
    }

    public getAttackPlans(targetServer: Server) {
        let results: AttackPlan[] = [];

        const BIGGEST_SERVER = this.ns.getServer(this.ramMap.getBiggestServer(false)?.hostname as string);
        for (let i = this.MIN_PERC; i <= this.MAX_PERC; i += 0.01) {
            results.push(this.getAttackPlan(BIGGEST_SERVER.cpuCores, targetServer, i));
        }

        return results;
    }

    public getWJobs(targetServerName: string): Job[] {
        let queue = [];
        let secDelta = this.ns.getServerSecurityLevel(targetServerName) - this.ns.getServerMinSecurityLevel(targetServerName);
        for (let server of this.ramMap.map) {
            const MAX_W_THREADS = Math.floor(server.availableRam / W_COST);

            if (MAX_W_THREADS == 0) continue;

            const W_EFFECT = this.ns.weakenAnalyze(1, this.ns.getServer(server.hostname).cpuCores);

            let neededW = Math.ceil(secDelta / W_EFFECT);

            const NB_W = Math.min(MAX_W_THREADS, neededW);

            queue.push(
                new Job(
                    `prepW-weaken-${targetServerName}`,
                    server.hostname,
                    JobAction.WEAKEN,
                    WORKER_SCRIPT_PATH,
                    targetServerName,
                    NB_W,
                    0,
                    W_COST,
                ),
            );

            secDelta -= Math.min(W_EFFECT * NB_W, secDelta);
            server.availableRam -= W_COST * NB_W;
            if (secDelta == 0) break;
        }

        return queue;
    }

    public getWGJobs(targetServerName: string): Job[] {
        let queue: Job[] = [];
        const growFactor = this.ns.getServerMaxMoney(targetServerName) / this.ns.getServerMoneyAvailable(targetServerName);
        let neededG = Math.ceil(this.ns.growthAnalyze(targetServerName, growFactor, 1));

        let counter = 0;
        for (let server of this.ramMap.map) {
            const W_EFFECT = this.ns.weakenAnalyze(1, this.ns.getServer(server.hostname).cpuCores);
            const G_SEC_EFFECT = this.ns.growthAnalyzeSecurity(1, targetServerName, this.ns.getServer(server.hostname).cpuCores);
            const WG_RATIO = Math.floor(W_EFFECT / G_SEC_EFFECT);
            const GW_COST = WG_RATIO * G_COST + W_COST;

            const MAX_GW_THREADS = Math.floor(server.availableRam / GW_COST);

            if (MAX_GW_THREADS == 0) continue;

            const NB_G = Math.min(neededG, MAX_GW_THREADS * WG_RATIO);
            const NB_W = MAX_GW_THREADS;

            const W_TIME = counter * (DELAY * 2);
            const G_TIME =
                this.ns.getWeakenTime(targetServerName) - this.ns.getGrowTime(targetServerName) - DELAY + counter * (DELAY * 2);

            queue.push(
                new Job(
                    `prepG-grow-${targetServerName}-${counter}`,
                    server.hostname,
                    JobAction.GROW,
                    WORKER_SCRIPT_PATH,
                    targetServerName,
                    NB_G,
                    G_TIME,
                    G_COST,
                ),
            );

            queue.push(
                new Job(
                    `prepG-weaken-${targetServerName}-${counter}`,
                    server.hostname,
                    JobAction.WEAKEN,
                    WORKER_SCRIPT_PATH,
                    targetServerName,
                    NB_W,
                    W_TIME,
                    W_COST,
                ),
            );

            server.availableRam -= NB_G * G_COST + NB_W * W_COST;
            neededG -= Math.min(NB_G, neededG);
            if (neededG == 0) break;
        }

        return queue;
    }

    public getHGWJobs(targetServer: Server, stealPerc: number) {
        let queue: Job[] = [];
        const WEAKEN_TIME = this.ns.getWeakenTime(targetServer.hostname);
        const GROW_TIME = this.ns.getGrowTime(targetServer.hostname);
        const HACK_TIME = this.ns.getHackTime(targetServer.hostname);
        let remaining_cycle = Math.floor(HACK_TIME / (DELAY * 4)) - 1;

        let cycle = 0;
        for (let server of this.ramMap.map) {
            const CPU_CORES = this.ns.getServer(server.hostname).cpuCores;
            let plan = this.getAttackPlan(CPU_CORES, targetServer, stealPerc);

            const MAX_NB_BATCH = Math.floor(server.availableRam / plan.ramCost);
            if (MAX_NB_BATCH == 0) continue;

            let allowed_cycle = Math.min(remaining_cycle, MAX_NB_BATCH);

            for (let i = cycle; i <= cycle + allowed_cycle - 1; i++) {
                queue.push(
                    new Job(
                        `hack-hack-${targetServer.hostname}-${i}`,
                        server.hostname,
                        JobAction.HACK,
                        WORKER_SCRIPT_PATH,
                        targetServer.hostname,
                        plan.hack,
                        WEAKEN_TIME - HACK_TIME - DELAY + FULL_DELAY * i,
                        H_COST,
                    ),
                );

                queue.push(
                    new Job(
                        `hack-weakenH-${targetServer.hostname}-${i}`,
                        server.hostname,
                        JobAction.WEAKEN,
                        WORKER_SCRIPT_PATH,
                        targetServer.hostname,
                        plan.weakenH,
                        FULL_DELAY * i,
                        W_COST,
                    ),
                );

                queue.push(
                    new Job(
                        `hack-grow-${targetServer.hostname}-${i}`,
                        server.hostname,
                        JobAction.GROW,
                        WORKER_SCRIPT_PATH,
                        targetServer.hostname,
                        plan.grow,
                        WEAKEN_TIME - GROW_TIME + DELAY + FULL_DELAY * i,
                        G_COST,
                    ),
                );

                queue.push(
                    new Job(
                        `hack-weakenG-${targetServer.hostname}-${i}`,
                        server.hostname,
                        JobAction.WEAKEN,
                        WORKER_SCRIPT_PATH,
                        targetServer.hostname,
                        plan.weakenG,
                        2 * DELAY + FULL_DELAY * i,
                        W_COST,
                    ),
                );

                if (i == 115) return queue
            }

            cycle += allowed_cycle;
            server.availableRam -= plan.ramCost * allowed_cycle;
            remaining_cycle -= allowed_cycle;
            if (remaining_cycle == 0) break;
            break
        }

        return queue;
    }

    public getXPJobs(target: string) {
        let queue: Job[] = [];

        for (let server of this.ramMap.map) {
            const MAX_GROW = Math.floor(server.availableRam / G_COST);

            if (MAX_GROW == 0) continue;

            queue.push(new Job('xp-grow', server.hostname, JobAction.GROW, WORKER_SCRIPT_PATH, target, MAX_GROW, 0, G_COST));

            server.availableRam -= MAX_GROW * G_COST;
        }

        return queue;
    }

    public choosePlans() {
        this.usedPlans = this.getBestAttackPlans().slice(0, this.maxParallelTargets);
    }

    public chooseTargets() {
        if (this.batcherMode == BatcherMode.ATTACK) {
            this.targets = this.usedPlans.map((plan) => plan.targetHostname);
            return;
        }

        if (this.batcherMode == BatcherMode.XP) {
            this.targets = ['joesguns'];
            return;
        }
    }

    public run() {
        this.ramMap = new RamMap(this.ns, this.workers, false, true)
        let actualLevel = this.ns.getHackingLevel()
        if (actualLevel > this.playerLevel) {
            this.playerLevel = actualLevel
            //this.dispatcher.killAllNotRunning()
            this.setup()
        }

        for (let target of this.targets) {
            if (
                this.ns.getServerSecurityLevel(target) > this.ns.getServerMinSecurityLevel(target) &&
                !this.dispatcher.isServerWorkedOn(target)
            ) {
                customPrint(this.ns, `Weakening ${target}`);
                this.dispatcher.add(this.getWJobs(target));
            }

            if (
                this.ns.getServerMoneyAvailable(target) < this.ns.getServerMaxMoney(target) &&
                !this.dispatcher.isServerWorkedOn(target)
            ) {
                customPrint(this.ns, `Growing ${target}`);
                this.dispatcher.add(this.getWGJobs(target));
            }

            if (!this.dispatcher.isServerWorkedOn(target)) {
                if (this.batcherMode == BatcherMode.ATTACK) {
                    let plan = this.usedPlans.find((plan) => plan.targetHostname == target) as AttackPlan;
                    this.dispatcher.add(this.getHGWJobs(this.ns.getServer(plan.targetHostname), plan.stealPerc));
                    customPrint(
                        this.ns,
                        `Hacking ${target} with plan {H: ${plan.hack}, WH: ${plan.weakenH}, G: ${plan.grow}, WG: ${plan.weakenG}}`,
                    );
                }

                if (this.batcherMode == BatcherMode.XP) {
                    customPrint(this.ns, `XPing on ${target}`);
                    this.dispatcher.add(this.getXPJobs(target));
                }
            }
        }
    }

    public setup() {
        this.choosePlans();
        this.chooseTargets();
    }
}

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
    BATCHER.batcherMode = BatcherMode.ATTACK

    BATCHER.dispatcher.clearAllPorts()

    BATCHER.setup();
    while (true) {
        BATCHER.run()
        BATCHER.dispatcher.dispatch()
        BATCHER.dispatcher.monitor()
        await ns.sleep(100)
    }
}
