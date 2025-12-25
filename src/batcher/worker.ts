import { NS } from "@ns";
import { PLANNER_ACTION } from "./planner";
import { JOB_STATUS } from "./dispatcher";

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
    
    ns.writePort(PORT, new WorkerReport(PID, JOB_STATUS.WAITING))
    await ns.sleep(SLEEP_TIME)

    ns.writePort(PORT, new WorkerReport(PID, JOB_STATUS.RUNNING))

    switch(ACTION) {
        case PLANNER_ACTION.HACK:
            await ns.hack(TARGET, {threads: THREADS})
            break;
        case PLANNER_ACTION.GROW:
            await ns.grow(TARGET, {threads: THREADS})
            break;
        case PLANNER_ACTION.WEAKEN:
            await ns.weaken(TARGET, {threads: THREADS})
            break;
    }
}