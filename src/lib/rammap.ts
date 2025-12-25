import { NS } from "@ns"
import { on } from "events"

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

    //
    public constructor(ns: NS, hostList: string[], onlyMaxRam: boolean = false) {
        this.ns = ns
        this.map = hostList.map((hostname) => {
            return new RamUnit(
                hostname,
                this.ns.getServerMaxRam(hostname)
            )
        })

        if (!onlyMaxRam) this.map = this.map.map(unit => {
            unit.availableRam -= ns.getServerUsedRam(unit.hostname)
            return unit
        })
    }

    public getBiggestServer(excludeHome: boolean) {
        let map = this.map
        if (excludeHome) map = map.filter((server) => server.hostname != "home")

        if (map.length == 0) return null
        
        return map.sort((a, b) => b.availableRam - a.availableRam)[0]
    }

    public isHomePresent() {
        return this.map.some((unit) => unit.hostname == "home")
    }

    public isSomeServerPresent() {
        return this.map.some((unit) => unit.hostname != "home")
    }

    public getRam(hostname: string) {
        let unit = this.map.filter((unit) => unit.hostname == hostname)

        if (unit.length == 0) return -1

        return unit[0].availableRam
    }
}