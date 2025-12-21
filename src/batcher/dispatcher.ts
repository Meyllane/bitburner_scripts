import { NS } from "@ns"
import { PLANNER_ACTION } from "./planner"

export enum JOB_STATUS {
    QUEUED,
    RUNNING
}

export class Dispatcher {
    public queue: Job[]
    public ns: NS
    private portRange: number[]

    public constructor(ns: NS) {
        this.queue = []
        this.ns = ns
        this.portRange = [...Array(5000).keys()].map((index) => index + 1)
    }

    public add(jobs: Job[]) {
        this.queue.push(...jobs)
    }

    public dispatch() {
        this.queue
            .filter((job) => job.status == JOB_STATUS.QUEUED)
            .forEach((job) => job.run(this.ns, this.getFreePort()))
    }

    public getAssignedPorts() {
        return this.queue
            .filter((job) => job.port != -1)
            .map((job) => job.port)
    }

    private getFreePort() {
        let assignedPorts = new Set(this.getAssignedPorts())
        let freePorts = this.portRange
            .filter((port) => !assignedPorts.has(port))
        
        return freePorts[0]
    }

    public isServerWorkedOn(targetName: string) {
        return this.queue.some((job) => job.target == targetName)
    }

    public killAll() {
        this.queue.forEach((job) => this.ns.kill(job.pid))
    }

    public killTargetJobs(targetName: string) {
        this.queue
            .filter((job) => job.target = targetName)
            .forEach((job) => this.ns.kill(job.pid))
    }

    public clearJob(pid: number) {
        for (let job of this.queue) {
            if (job.pid == pid) {
                this.queue.splice(this.queue.indexOf(job), 1)
                break        
            }
        }
    }

    public clearAllPorts() {
        this.portRange.forEach((port) => this.ns.clearPort(port))
    }
}

export class Job {
    public id: string
    public port: number = -1
    public pid: number = -1
    public host: string
    public action: PLANNER_ACTION
    public script: string
    public target: string
    public threads: number
    public sleepTime: number
    public ramOverride: number
    public status: JOB_STATUS

    public constructor(id: string, host: string, action: PLANNER_ACTION, script:string, target: string, 
        threads: number, sleepTime: number, ramOverride: number, status: JOB_STATUS = JOB_STATUS.QUEUED) {
        
        this.id = id
        this.host = host
        this.action = action
        this.script = script
        this.target = target
        this.threads = threads
        this.sleepTime = sleepTime
        this.ramOverride = ramOverride
        this.status = status
    }

    public run(ns: NS, port: number) {
        this.port = port

        let pid = ns.exec(
            this.script,
            this.host,
            {ramOverride: this.ramOverride, threads: this.threads},
            this.id,
            this.action,
            this.threads,
            this.target,
            this.sleepTime,
            this.port
        )

        this.pid = pid
        this.status = JOB_STATUS.RUNNING
    }
}