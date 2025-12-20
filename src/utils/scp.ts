import { NS } from "@ns";

export async function main(ns: NS) {
    ns.getPurchasedServers()
        .forEach((server) => ns.scp("batcher/worker.js", server, "home"))
}