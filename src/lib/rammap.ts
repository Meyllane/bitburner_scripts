import { NS } from "@ns"

export class RamUnit {
    public hostname: string
    public availableRam: number

    public constructor(hostname: string, availableRam: number) {
        this.hostname = hostname
        this.availableRam = availableRam
    }
}

export class RamMap {
    public ns: NS
    public map: RamUnit[]

    public constructor(ns: NS, hostList: string[]) {
        this.ns = ns
        this.map = hostList.map((hostname) => {
            return new RamUnit(
                hostname,
                this.ns.getServerMaxRam(hostname) - this.ns.getServerUsedRam(hostname)
            )
        })
    }

    public getBiggestServer(excludeHome: boolean) {
        let map = this.map
        if (excludeHome) map = map.filter((server) => server.hostname != 'home')

        if (map.length == 0) return null
        
        return map.sort((a, b) => b.availableRam - a.availableRam)[0]
    }
}