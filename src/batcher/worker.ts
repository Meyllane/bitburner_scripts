import { NS } from "@ns";

export async function main(ns: NS) {
    const ID = ns.args[0] as string
    const ACTION = ns.args[1] as string
    const THREADS = ns.args[2] as number
    const TARGET = ns.args[3] as string
    const SLEEP_TIME = ns.args[4] as number

    switch(ACTION) {
        case "hack":
            await ns.hack(TARGET, {additionalMsec: SLEEP_TIME, threads: THREADS})
            break;
        case "grow":
            await ns.grow(TARGET, {additionalMsec: SLEEP_TIME, threads: THREADS})
            break;
        case "weaken":
            await ns.weaken(TARGET, {additionalMsec: SLEEP_TIME, threads: THREADS})
            break;
    }
}