import { NS } from "@ns";

export async function main(ns: NS) {
    while(true) {
        let target = "n00dles"

        if (ns.getServerMinSecurityLevel(target) > ns.getServerBaseSecurityLevel(target)) {
            ns.print("Need to weaken")
            await ns.weaken(target)
        } else if (ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target)) {
            await ns.grow(target)
        } else {
            await ns.hack(target)
        }
        await ns.sleep(5)
    }
}