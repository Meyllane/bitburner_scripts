export class Dispatcher {
    public queue: Job[] = []
}

export class Job {
    public id: string
    public host: string
    public script: string
    public target: string
    public threads: number
    public sleepTime: number
    public ramOverride: number

    public constructor(id: string, host: string, script: string, target: string, threads: number, sleepTime: number, ramOverride: number) {
        this.id = id
        this.host = host
        this.script = script
        this.target = target
        this.threads = threads
        this.sleepTime = sleepTime
        this.ramOverride = ramOverride
    }
}