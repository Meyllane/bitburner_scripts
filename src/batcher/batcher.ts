import { RamMap } from "@/lib/rammap";
import { NS } from "@ns";

export async function main(ns: NS) {
    let ramMap = new RamMap(ns);

    ns.tprint(ramMap.map)
}