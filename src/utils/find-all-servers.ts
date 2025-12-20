import { NS } from "@ns";

function explore(ns: NS, target: string, archive: string[]) {
    archive.push(target)
    let scanRes = ns.scan(target)

    for (let res of scanRes) {
        if (!archive.includes(res)) explore(ns, res, archive)
    }

    return archive;
}

export async function main(ns: NS) {
    let data = explore(ns, "home", [])
    let toSave = data.join("/n")
    ns.write("/etc/servers.txt", toSave, "w")
}