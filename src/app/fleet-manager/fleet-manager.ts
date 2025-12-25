import { customPrint } from "@/lib/func";
import { NS, Server } from "@ns";

export class FleetManager {
    private ns: NS
    public serverLimit: number
    public serverList: string[]
    public percMoneyAvailable: number = 0.9
    private moneyAvaiable;
    private serverBuyCost: {ram: number, price: number}[]
    public fleetFullyMaxed: boolean = false

    private scriptsToCopy = [
        "app/batcher/worker.js",
        "app/batcher/planner.js",
        "app/batcher/dispatcher.js",
        "app/share-manager/share.js"
    ]

    public constructor(ns: NS){
        this.ns = ns
        this.serverLimit = this.ns.getPurchasedServerLimit()
        this.serverList = this.ns.getPurchasedServers()
        this.moneyAvaiable = ns.getPlayer().money * this.percMoneyAvailable

        this.serverBuyCost = this.getServerBuyCost()
    }

    private getServerBuyCost() {
        let res = []
        for (let i=1; i<=20; i++) {
            res.push({
                ram: 2**i,
                price: this.ns.getPurchasedServerCost(2**i)
            })
        }

        return res
    }

    public updateServerList() {
        this.serverList = this.ns.getPurchasedServers()
    }

    public getBiggestNonMaxedServer() {
        let servers = this.serverList
            .map(host => {return {host: host, ram: this.ns.getServerMaxRam(host)}})
            .filter(server => server.ram != 2**20)
            .sort((a, b) => b.ram - a.ram)
        
        if (servers.length == 0) return undefined

        return servers[0].host
    }

    public buyServer() {
        let buyOrders = this.serverBuyCost
            .filter(order => order.price <= this.moneyAvaiable)
            .sort((a, b) => b.price - a.price)

        if (buyOrders.length == 0) return false

        let serverName = `server-${this.serverList.length}`
        let order = buyOrders[0]
        
        customPrint(this.ns, `Bought ${serverName} with ${this.ns.formatRam(order.ram)} for ${this.ns.formatNumber(order.price)}$.`)
        this.ns.purchaseServer(serverName, order.ram)
        this.ns.scp(this.scriptsToCopy, serverName, "home")
        this.moneyAvaiable -= order.price

        return true
    }

    public copyScripts() {
        this.serverList.forEach(server => this.ns.scp(this.scriptsToCopy, server, "home"))
    }

    public upgradeServer(hostname: string) {
        let buyOrders = []

        for (let i = 1; i<=20; i++) {
            let order = {
                ram: 2**i,
                price: this.ns.getPurchasedServerUpgradeCost(hostname, 2**i)
            }

            if (order.price == -1) continue
            if (order.price > this.moneyAvaiable) continue

            buyOrders.push(order)
        }

        if (buyOrders.length == 0) return false

        buyOrders = buyOrders
            .sort((a, b) => b.ram - a.ram)
        
        let order = buyOrders[0]

        customPrint(this.ns, `Upraded ${hostname} with ${this.ns.formatRam(order.ram)} for ${this.ns.formatNumber(order.price)}$`)
        this.ns.upgradePurchasedServer(hostname, order.ram)
        this.moneyAvaiable -= order.price

        return true
    }

    public run() {      
        if (this.serverList.length == 0) {
            this.buyServer()
            this.updateServerList()
        }
        
        while (true) {
            let server = this.getBiggestNonMaxedServer()

            if (server == undefined && this.serverList.length == this.serverLimit) {
                this.fleetFullyMaxed = true
                break
            }

            //Buy new
            if (server == undefined) {
                let succes = this.buyServer()
                if (!succes) break
                this.updateServerList()
                continue
            }

            //Upgrade
            if (!this.upgradeServer(server)) break

            this.updateServerList()
        }
    }
}

export async function main(ns: NS) {
    ns.disableLog("ALL")
    const FLEET_MANAGER = new FleetManager(ns)

    FLEET_MANAGER.run()
}