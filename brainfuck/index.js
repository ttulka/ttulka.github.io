const outputDiv = document.querySelector('#output');
let commandGen = readChar('');
let inputGen = readChar('');

loadWasm().then(wasm => {
    document.querySelector('#run').onclick = e => {
        e.preventDefault();
        outputDiv.textContent = '';
        
        commandGen = readChar(document.querySelector('#source').value);
        inputGen = readChar(document.querySelector('#input').value);

        const measureLabel = 'brainfuck';
        console.time(measureLabel);        
        try {
            wasm.brainfuck();

        } catch (err) {
            outputDiv.textContent += err;
            console.error(err)
        } finally {
            console.timeEnd(measureLabel);
        }
    }
});

async function loadWasm() {
    const wasm = await WebAssembly
        .instantiateStreaming(fetch('optimized.wasm'), {
            env: {
                abort: (_msg, _file, line, column) => console.error(`Abort at ${line}:${column}`)
            },
            index: {
                command: () => commandGen.next().value,
                read: () => inputGen.next().value,
                write: writeChar,
                debug,
                error
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

function debug(pointer, value) {
    const msg = `pointer: ${pointer}, value: ${value}`;
    console.debug(msg);
    outputDiv.textContent += `\nDebug: ${msg}\n`;
}

function error(kind, value) {
    let msg;
    switch (kind) {
        case 1: 
            msg = `index out of bounds: ${value}`;
            break;
        case 2: 
            msg = `unmatched: ${String.fromCharCode(value)}`;
            break;
        default:
            msg = `unknown error (${kind}): ${value}`;
            break;
    }
    console.error(msg);
    outputDiv.textContent += `\nError: ${msg}\n`;
}
