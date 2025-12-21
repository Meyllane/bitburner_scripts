import { NS } from "@ns";

export async function main(ns: NS) {
    let scripts = [
        "batcher/worker.js",
        "batcher/planner.js",
        "batcher/dispatcher.js"
    ]

    ns.getPurchasedServers()
        .forEach((server) => ns.scp(scripts, server, "home"))
}