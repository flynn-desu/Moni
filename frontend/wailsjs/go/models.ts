export namespace collector {
	
	export class HostInfo {
	    hostname: string;
	    os: string;
	    osVersion: string;
	    arch: string;
	    cpuName: string;
	    cpuCores: number;
	    memTotal: number;
	    gpuName: string;
	    vramTotal: number;
	    goVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new HostInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hostname = source["hostname"];
	        this.os = source["os"];
	        this.osVersion = source["osVersion"];
	        this.arch = source["arch"];
	        this.cpuName = source["cpuName"];
	        this.cpuCores = source["cpuCores"];
	        this.memTotal = source["memTotal"];
	        this.gpuName = source["gpuName"];
	        this.vramTotal = source["vramTotal"];
	        this.goVersion = source["goVersion"];
	    }
	}

}

export namespace config {
	
	export class Config {
	    intervalMs: number;
	    alwaysOnTop: boolean;
	    storageUnit: string;
	    netUnit: string;
	    mapTheme: string;
	    uiTheme: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.intervalMs = source["intervalMs"];
	        this.alwaysOnTop = source["alwaysOnTop"];
	        this.storageUnit = source["storageUnit"];
	        this.netUnit = source["netUnit"];
	        this.mapTheme = source["mapTheme"];
	        this.uiTheme = source["uiTheme"];
	    }
	}

}

export namespace store {
	
	export class Point {
	    ts: number;
	    cpu: number;
	    cores: number;
	    warmup: boolean;
	    memUsed: number;
	    memTotal: number;
	    memPercent: number;
	    commitUsed: number;
	    commitLim: number;
	    gpu: number;
	    byEngine: Record<string, number>;
	    adapterName: string;
	    vramDedUsed: number;
	    vramDedTotal: number;
	    vramShrUsed: number;
	    vramShrTotal: number;
	    netRecvBps: number;
	    netSentBps: number;
	    diskReadBps: number;
	    diskWriteBps: number;
	    diskActive: number;
	
	    static createFrom(source: any = {}) {
	        return new Point(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ts = source["ts"];
	        this.cpu = source["cpu"];
	        this.cores = source["cores"];
	        this.warmup = source["warmup"];
	        this.memUsed = source["memUsed"];
	        this.memTotal = source["memTotal"];
	        this.memPercent = source["memPercent"];
	        this.commitUsed = source["commitUsed"];
	        this.commitLim = source["commitLim"];
	        this.gpu = source["gpu"];
	        this.byEngine = source["byEngine"];
	        this.adapterName = source["adapterName"];
	        this.vramDedUsed = source["vramDedUsed"];
	        this.vramDedTotal = source["vramDedTotal"];
	        this.vramShrUsed = source["vramShrUsed"];
	        this.vramShrTotal = source["vramShrTotal"];
	        this.netRecvBps = source["netRecvBps"];
	        this.netSentBps = source["netSentBps"];
	        this.diskReadBps = source["diskReadBps"];
	        this.diskWriteBps = source["diskWriteBps"];
	        this.diskActive = source["diskActive"];
	    }
	}

}

