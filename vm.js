'use strict';
const browser = globalThis.require == null;

class MMU {
    constructor() {
        this.mappings = {};
        this.pageTables = {};
    }

    setup(offsets) {
        for (let offset of offsets) {
            this.mappings[offset.name] = {
                address: {
                    start: offset.start,
                    end: offset.start + offset.size
                },
                // value 0 means free page
                pages: new Uint16Array((offset.size/PAGE_SIZE) - 1)
            };
            this.pageTables[offset.name] = [];
        }
    }

    addPageTable(name, proc, baseVirtualAddress, size) {
        const pageTable = this.pageTables[name];
        if (!Array.isArray(pageTable[proc])) {
            pageTable[proc] = [];
        }
        pageTable[proc] = {
            baseVirtualAddress,
            pages: new Uint16Array(size)
        };

    }

    set(name, proc, virtualAddress, realAddress) {
        const pageTable = this.pageTables[name];
        const procPageTable = pageTable[proc];
        const offset = virtualAddress - procPageTable.baseVirtualAddress;
        const pageOffset = realAddress/PAGE_SIZE;
        procPageTable.pages[offset] = pageOffset;
        const mappings = this.mappings[name];
        mappings.pages[pageOffset] = proc + 1;
    }

    get(name, proc, virtualAddress) {
        const pageTable = this.pageTables[name];
        const procPageTable = pageTable[proc];
        const offset = virtualAddress - procPageTable.baseVirtualAddress;
        const pageOffset = procPageTable.pages[offset];
        const mappings = this.mappings[name];
        if (mappings.pages[pageOffset] !== proc + 1) {
            throw Error(`SegFault`);
        }
        return pageOffset * PAGE_SIZE;
    }

    // find a single free page
    findFree(name) {
        let mapping = this.mappings[name]; 
        let index;
        do {
            index = Math.floor(Math.random() * mapping.pages.length);
        } while (mapping.pages[index] !== 0);
        return index * PAGE_SIZE;
    }
    
}

const WORD = 4; // bytes
const PAGE_SIZE = 0x1000; // bytes
const RAM_SIZE = 0x10000000; // bytes

function CrossBuffer(size) {
    if (browser) {
        const arrayBuffer = new ArrayBuffer(size);
        const view = new DataView(arrayBuffer);
        const apis = {};
        return apis;
    }

    return Buffer.alloc(size);
}

class VirtualMachine {
    constructor() {
        this.ram = CrossBuffer(RAM_SIZE);
        this.proc = [];
        this.mmu = new MMU();
        this.mmu.setup([{
            name: 'RAM',
            start: 0x0,
            size: RAM_SIZE,
            partitionSize: Math.log2(RAM_SIZE/PAGE_SIZE)/2,
            maxLevel: 1
        }]);
    }

    cpu() {
    
    }

    load() {
        const procId = this.proc.length;
        this.proc.push({
            state: new Uint8Array(1),
            registers: []
        });

        this.mmu.addPageTable(procId, [
            0x40000000
        ]);
    }

    

    allocate(proc, size) {

        return realAddress;
    }
}

const vm = new VirtualMachine();

vm.mmu.addPageTable('RAM', 0, 0x4, 50);

const realAddress = vm.mmu.findFree('RAM');
vm.mmu.set('RAM', 0, 0x4, realAddress);

console.log(realAddress === vm.mmu.get('RAM', 0, 0x4));