import { NS } from "@ns";
import { PLANNER_ACTION } from "./planner";

export async function main(ns: NS) {
    const ID = ns.args[0] as string
    const ACTION = ns.args[1] as number
    const THREADS = ns.args[2] as number
    const TARGET = ns.args[3] as string
    const SLEEP_TIME = ns.args[4] as number
    const PORT = ns.args[5] as number

    const PID = ns.self().pid

    switch(ACTION) {
        case PLANNER_ACTION.HACK:
            await ns.hack(TARGET, {additionalMsec: SLEEP_TIME, threads: THREADS})
            break;
        case PLANNER_ACTION.GROW:
            await ns.grow(TARGET, {additionalMsec: SLEEP_TIME, threads: THREADS})
            break;
        case PLANNER_ACTION.WEAKEN:
            await ns.weaken(TARGET, {additionalMsec: SLEEP_TIME, threads: THREADS})
            break;
    }

    ns.atExit(() => ns.writePort(PORT, PID))
}