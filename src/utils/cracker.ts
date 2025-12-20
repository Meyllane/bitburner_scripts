import { NS } from "@ns"; 

export async function main(ns: NS) {
    let servers = ns.read("/etc/servers.txt").split("\n")

    let tools = [];
    if (ns.fileExists("brutessh.exe")) tools.push((target: string) => ns.brutessh(target))
    if (ns.fileExists("ftpcrack.exe")) tools.push((target: string) => ns.ftpcrack(target))
    if (ns.fileExists("relaysmtp.exe")) tools.push((target: string) => ns.relaysmtp(target))
    if (ns.fileExists("httpworm.exe")) tools.push((target: string) => ns.httpworm(target))
    if (ns.fileExists("sqlinject.exe")) tools.push((target: string) => ns.sqlinject(target))

    for (let target of servers) {
        if (ns.hasRootAccess(target)) continue

        if (ns.getServerRequiredHackingLevel(target) > ns.getHackingLevel()) continue

        const PORTS_REQUIRED = ns.getServerNumPortsRequired(target)

        if (PORTS_REQUIRED == 0) {
            ns.nuke(target)
            continue
        }

        if (PORTS_REQUIRED > tools.length) continue

        for (let i = 0; i <= PORTS_REQUIRED - 1; i++) {
            tools[i](target)
        }
        ns.nuke(target)
    }
}