function bytesToObject(vm, ) {

}


const sys_calls = [
    bytesToObject
];

class ROM {
    constructor(baseAddress, memory) {
        this.startAddress = baseAddress;
        this.endAddress = baseAddress + memory.length;
        this.memory = memory;
    }

}


class RAM {
    constructor(baseAddress, size) {
        this.startAddress = baseAddress;
        this.endAddress = baseAddress + size;
        this.pages = [];
    }



    createPage() {
        const [start, end] = [this.startAddress, this.endAddress];
        const maxPages = (end - start)/PAGE_SIZE;
        if (this.pages.length < maxPages) {
            let baseAddress = start + PAGE_SIZE * this.pages.length;
            const page = {
                free: PAGE_SIZE,
                address: [baseAddress, baseAddress + PAGE_SIZE], // [start, end)
                memory: []
            };
            this.pages.push(page);
            return page;// new page index
        }
        throw Error(`Not enough memory!`);
    }

    _addressToPage(address) {
        const pageNumber = (address - this.startAddress)/PAGE_SIZE;
        if (this.pages.length <= pageNumber) {
            throw Error('SEG_FAULT');
        }
        const page = this.pages[pageNumber];
        const offset = address - page.address[0];
        return [page, offset];
    }


    set(address, value) {
        const [page, offset] = this._addressToPage(address);
        for (let i = 0; i < WORD; i++) {
            page.memory[offset + i] = (value & (0xFF << (8 * i))) >>> 0; 
        }
    }

    get(address, size) {
        const [page, offset] = this._addressToPage(address);
        let value = 0;
        // little-endian
        for (let i = 0; i < size; i++) {
            value += (page.memory[offset + i] & (0xFF << (8 * i))) >>> 0; 
        }
        return value;
    }
}

function createNestedMappings(table, fakeAddress, size, partitionSize,  level = 0, maxLevel = 0) {
    const MAPPING_SIZE = size/partitionSize;
    for (let i = 0; i < partitionSize; i++) {
        const startAddress = fakeAddress + MAPPING_SIZE * i;
        const mapConfig = {
            virtualAddress: startAddress
        };
        if (level < maxLevel) {
            mapConfig.leaf = false;
            mapConfig.mappings = [];
            createNestedMappings(mapConfig.mappings, startAddress, MAPPING_SIZE, partitionSize, level + 1, maxLevel);
        } else {
            mapConfig.leaf = true;
            mapConfig.realAddress = 0x0;
        }
        table.push(mapConfig);
    }
    return table;
}

// assumme it is within range the memory range
function binarySearchMappings(mappings, virtualAddress, startIndex, endIndex, targetRange) {
    const length = (endIndex + startIndex);
    const middleIndex = Math.floor(length/2);
    const offset = virtualAddress - mappings[middleIndex].virtualAddress;
    if (offset < 0) {
        return binarySearchMappings(mappings, virtualAddress, startIndex, middleIndex, targetRange);
    } else if (offset >= targetRange) {
        return binarySearchMappings(mappings, virtualAddress, middleIndex + 1, endIndex, targetRange);
    }
    return mappings[middleIndex];
}


class MMU {
    constructor() {
        this.mappings = {};
    }

    findFrom(name, virtualAddress) {
        return this.find(this.mappings[name], virtualAddress);
    }

    find(mappings, virtualAddress) {
        // check if it is in the range
        const firstMapping = mappings[0];
        if (virtualAddress < firstMapping.virtualAddress) {
            return null;
        }

        let VIRTUAL_PAGE_SIZE = mappings[1].virtualAddress - mappings[0].virtualAddress;

        const lastMapping = mappings[mappings.length - 1];
        if (lastMapping.virtualAddress + VIRTUAL_PAGE_SIZE <= virtualAddress) {
            return null;
        }
        let currNode = binarySearchMappings(mappings, virtualAddress, 0, mappings.length, VIRTUAL_PAGE_SIZE);
        while (currNode && !currNode.leaf) {
            const currMappings = currNode.mappings;
            VIRTUAL_PAGE_SIZE = currMappings[1].virtualAddress - currMappings[0].virtualAddress;
            currNode = binarySearchMappings(currMappings, virtualAddress, 0, currMappings.length, VIRTUAL_PAGE_SIZE);
        }

        return currNode; 
    }

    findFree(name, pageCount) {
        let base = this.mappings[name]; 
        let currNode = null;
        while(currNode == null) {
            currNode = base;
            while (true) {
                let randomTarget;
                if (Array.isArray(currNode)) {
                    randomTarget = currNode;
                } else if (Array.isArray(currNode.mappings)) {
                    randomTarget = currNode.mappings;
                }

                if (randomTarget[0].leaf) {
                    break;
                }

                let index = Math.floor(Math.random() * randomTarget.length);
                currNode = randomTarget[index];
            }
            const len = currNode.mappings.length;
            const parentNode = currNode;
            for (let i = 0; i < len; i++) {
                if ((len - i) < pageCount) {
                    currNode = null;
                    break;
                }
                currNode = parentNode.mappings[i];
                let isFound = true;
                for (let j = 0;j < pageCount; j++) {
                    if (currNode.realAddress !== 0) {
                        isFound = false;
                        i += j + 1;
                        break;
                    }
                    currNode = parentNode.mappings[i + j];
                }
                if (isFound) {
                    break;
                }
            }
        }
        return currNode.virtualAddress;
    }

    setup(offsets) {
        for (let offset of offsets) {
            this.mappings[offset.name] = [];
            createNestedMappings(this.mappings[offset.name], offset.start, offset.size, offset.partitionSize, 0, offset.maxLevel);
        }
    }

    add(name, virtualAddress, realAddress) {
        const mappings = this.mappings[name];
        const mapping = this.find(mappings, virtualAddress);
        if (mapping == null) {
            throw Error('Segmentation Fault!');
        }
        mapping.realAddress = realAddress;
    }

    get(name, virtualAddress) {
        const mappings =  this.mappings[name];
        const mapping = this.find(mappings, virtualAddress);
        if (mapping == null) {
            throw Error('Segmentation Fault!');
        }
        return mapping.realAddress;
    }
}

const WORD = 4; // bytes
const PAGE_SIZE = 0x800; // bytes
const ROM_SIZE = 0x8000000;
const RAM_SIZE = 0x8000000;

class VirtualMachine {
    constructor(rom) {
        const baseAddress = 0x10;
        this.rom = new ROM(baseAddress, rom);
        this.ram = new RAM(baseAddress, RAM_SIZE);
        this.mmu = new MMU();
        this.allocTable = {
            "small": [], // less than or equal to PAGE_SIZE/2, these will share a page
            "large": [], // greater than PAGE_SIZE/2, these will always get at least a page
        };

        this.virtualAddress = {
            'ROM': 0x40000000, 
            'RAM': 0xAFFFFFFF,
        };

        this.mmu.setup([{
            name: 'ROM',
            start: this.virtualAddress.ROM,
            size: ROM_SIZE,
            partitionSize: Math.log2(ROM_SIZE/PAGE_SIZE)/2,
            maxLevel: 1
        },{
            name: 'RAM',
            start: this.virtualAddress.RAM,
            size: RAM_SIZE,
            partitionSize: Math.log2(RAM_SIZE/PAGE_SIZE)/2,
            maxLevel: 1
        }]);
        this.regs = Array(32).fill(0);
    }

    cpu() {
    
    }


    

    allocate(size) {
        let realAddress = this.ram.startAddress;
        let virtualAddress = this.virtualAddress.RAM;
        let sizeAlignment;
        if (size%WORD) {
            sizeAlignment = WORD - (size & (WORD - 1)) + size;
        } else {
            sizeAlignment = size;
        }
        if (sizeAlignment <= PAGE_SIZE/2) {
            virtualAddress = this.mmu.findFree('RAM', 1);
            const page = this.ram.createPage();
            realAddress = page.address[0];
            this.mmu.add('RAM', virtualAddress, realAddress);
        } else {
            let pageCount = size;
            if (size%PAGE_SIZE) {
                pageCount = PAGE_SIZE - (size & (PAGE_SIZE - 1)) + size;
            }

            virtualAddress = this.mmu.findFree('RAM', pageCount);
            for (let i = 0; i < pageCount; i++) {
                const page = this.ram.createPage();
                realAddress = page.address[0];
                this.mmu.add('RAM', virtualAddress * PAGE_SIZE * i, realAddress * PAGE_SIZE * i);
            }
        }
        return virtualAddress;
    }
}