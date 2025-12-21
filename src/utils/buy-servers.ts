import { NS } from "@ns";

export async function main(ns: NS) {
    let money = ns.getPlayer().money

    const SERVER_LIMIT = ns.getPurchasedServerLimit()
    const SERVER_PRICE = [...Array(20).keys()]
        .map((ramIndex) => ramIndex + 1)
        .map((ramIndex) => {return {ram:2**ramIndex, price:ns.getPurchasedServerCost(2**ramIndex)}})

    while (true) {
        let nb_servers = ns.getPurchasedServers().length

        if (nb_servers < SERVER_LIMIT) {
            let options = SERVER_PRICE
                .filter((server) => server.price <= money && server.ram >= 64)
                .sort((a, b) => b.price - a.price)
            
            if (options.length == 0) {
                ns.tprint("No good options for servers.")
                ns.exit()
            }

            nb_servers = ns.getPurchasedServers().length

            let serverName = `server-${nb_servers}`

            ns.purchaseServer(serverName, options[0].ram)
            ns.tprint(`Bought ${serverName} with ${ns.formatRam(options[0].ram)} RAM`)
            money -= options[0].price

            ns.run("utils/scp.js")

        } else {
            const SMALLEST_SERVER = ns.getPurchasedServers()
                .map((server) => ns.getServer(server))
                .sort((a, b) => a.maxRam - b.maxRam)[0]
            
            let options = SERVER_PRICE
                .filter((server) => server.price <= money && server.ram >= 64 && server.ram > SMALLEST_SERVER.maxRam)
                .sort((a, b) => b.price - a.price)

            if (options.length == 0) {
                ns.tprint("No good options for servers.")
                ns.exit()
            }

            ns.upgradePurchasedServer(SMALLEST_SERVER.hostname, options[0].ram);
            ns.tprint(`Upgraded ${SMALLEST_SERVER.hostname} with ${ns.formatRam(options[0].ram)} RAM`)
            money -= options[0].price
        }
    } 

}