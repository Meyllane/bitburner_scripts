import { NS } from "@ns";
import { FleetManager } from "../app/fleet-manager/fleet-manager";

export async function main(ns: NS) {
    const FLEET_MANAGER = new FleetManager(ns)

    FLEET_MANAGER.copyScripts()
}