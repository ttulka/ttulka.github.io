const outputDiv = document.querySelector('#output');
let commandGen = readChar('');
let inputGen = readChar('');

loadWasm(source).then(wasm => {
    document.querySelector('#run').onclick = e => {
        e.preventDefault();
        outputDiv.textContent = '';
        
        commandGen = readChar(document.querySelector('#source').value);
        inputGen = readChar(document.querySelector('#input').value);

        const measureLabel = 'brainfuck';
        console.time(measureLabel);
        
        wasm.brainfuck();
        
        console.timeEnd(measureLabel);
    }
});

async function loadWasm(source) {
    const nPages = ((source.length + 0xffff) & ~0xffff) >>> 16;
    const memory = new WebAssembly.Memory({ initial: nPages });

    const wasm = await WebAssembly
        .instantiateStreaming(fetch('./build/optimized.wasm'), {
            env: {
                memory, // --importMemory
                abort: (_msg, _file, line, column) => console.error(`Abort at ${line}:${column}`)
            },
            index: {
                command: () => commandGen.next().value,
                read: () => inputGen.next().value,
                write: writeChar
            }
        });
    return wasm.instance.exports;
}

function* readChar(str) {    
    for (let s of str.split('')) yield s.charCodeAt();
}

function writeChar(charCode) {
    outputDiv.textContent += String.fromCharCode(charCode);
}
