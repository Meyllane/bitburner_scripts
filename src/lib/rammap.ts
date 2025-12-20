import { NS } from "@ns"

export class RamMap {
    private ns: NS;
    public map: {serverName: string, ram: number}[]

    public constructor(ns: NS) {
        this.ns = ns;
        let servers = ns.getPurchasedServers()
        servers.push("home")
        
        this.map = servers.map((serverName) => {
            return {serverName: serverName, ram: ns.getServerMaxRam(serverName) - ns.getServerUsedRam(serverName)}
        })
    }
}