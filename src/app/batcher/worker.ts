import { NS } from "@ns";
import { JOB_STATUS, JobAction } from "./dispatcher";

export class WorkerReport {
    public pid: number
    public status: JOB_STATUS

    public constructor(pid: number, status: JOB_STATUS) {
        this.pid = pid
        this.status = status
    }
}

export async function main(ns: NS) {

    ns.atExit(() => ns.writePort(PORT, new WorkerReport(PID, JOB_STATUS.FINISHED)))

    const ID = ns.args[0] as string
    const ACTION = ns.args[1] as number
    const THREADS = ns.args[2] as number
    const TARGET = ns.args[3] as string
    const SLEEP_TIME = ns.args[4] as number
    const PORT = ns.args[5] as number

    const PID = ns.self().pid
    ns.clearPort(PORT)
    
    ns.writePort(PORT, new WorkerReport(PID, JOB_STATUS.RUNNING))

    switch(ACTION) {
        case JobAction.HACK:
            await ns.hack(TARGET, {threads: THREADS, additionalMsec: SLEEP_TIME})
            break;
        case JobAction.GROW:
            await ns.grow(TARGET, {threads: THREADS, additionalMsec: SLEEP_TIME})
            break;
        case JobAction.WEAKEN:
            await ns.weaken(TARGET, {threads: THREADS, additionalMsec: SLEEP_TIME})
            break;
    }
}