import { NS } from "@ns";

export function customPrint(ns: NS, message: string) {
    const time = new Date().toLocaleTimeString("fr-FR", {
        hour12: false
    });

    ns.print(`${time} - ${message}`)
}