function getType(element) {
    if (typeof element === "object" ) {
        return Array.isArray(element) ? 'array': 'object';
    }
    return typeof element;
}


function getArrayType(array) {
    let arrayType = getType(array[0]);

    for (let i = 1; i < array.length; i++) {
        if (arrayType !== getType(array[i])) {
            arrayType = "mixed";
            break;
        }
    }

    if (arrayType === 'number') {
        arrayType = 'integer';
        for (let i = 0; i < array.length; i++) {
            if (array[i].toString().indexOf('.') > -1) {
                arrayType = 'decimal';
                break;
            }
        }
    }
    
    return arrayType;
}

function optimizeIntegerArray(array) {
    let info = {
        type: "integer",
        optimized: true,
        length: array.length
    };
    let lowestNumber = array[0];
    let highestNumber = array[0]; 
    for (let i = 0; i < array.length; i++) {
        if (highestNumber < array[i]) {
            highestNumber = array[i];
        }
        
        if (lowestNumber > array[i]) {
            lowestNumber = array[i];
        }
    }
    return info;
}

function optimizeBooleanArray(array) {
    let info = {
        type: "boolean",
        length: array.length,
        compressedLength: Math.ceil(array.length/8)
    };
    return info;
}


function optimizeArray(array, arrayType) {
    let info = {
        type: arrayType,
        length: array.length
    };
    if (arrayType === "integer") {
        info = optimizeIntegerArray(array);
    } else if (arrayType === "boolean") {
        info = optimizeBooleanArray(array);
    } else if (arrayType === "string") {
        info.optimized = true;
    } else {
        info.optimized = false;
    }
    return info;
}

// optimizeArray(["a", "a", "a"])

function createArrayMakeList(array, makeList = []) {
    const arrayType = getArrayType(array);
    const optimizeInfo = optimizeArray(array, arrayType);
    if (optimizeInfo.optimized) {
        let instruction = `CREATE_TYPED_ARRAY:${array.length}:${arrayType}`;
        if (arrayType === "string") {
            array = array.map(JSON.stringify);
        }
        makeList.push(instruction);
        makeList.push(array);
    } else {
        makeList.push(`CREATE_ARRAY:${array.length}`);
        makeList.push(`PUSH`);
        for (let i = 0; i < array.length; i++) {
            if (typeof array[i] === "object") {
                createObjectMakeList(array[i], makeList);
                makeList.push(`set:${i}`);
            } else {
                makeList.push(`set:${i}:${JSON.stringify(array[i])}`);
            }
        }
        makeList.push(`POP`);
    }
}

function createObjectMakeList(object, makeList = []) {
    
    if (Array.isArray(object)) {
        createArrayMakeList(object, makeList);
    } else {
        makeList.push("CREATE_OBJECT");
        makeList.push("PUSH");
        for (let i in object) {
            if (typeof object[i] === "object") {
                createObjectMakeList(object[i], makeList);
                makeList.push(`sets:${i.length}${i}`);
            } else {
                makeList.push(`sets:${i.length}${i}:${object[i]}`)
            }
        }
        makeList.push("POP");
    }
    return makeList;
} 
