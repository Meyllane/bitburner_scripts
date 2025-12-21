import { NS } from "@ns"

export class RamMap {
    public map: {serverName: string, ram: number}[]

    public constructor(ns: NS, serversList: string[]) {
        this.map = serversList.map((serverName) => {
            return {serverName: serverName, ram: ns.getServerMaxRam(serverName) - ns.getServerUsedRam(serverName)}
        })
    }
}