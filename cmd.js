const neodoc = require('neodoc');
const { version: VERSION } = require('./package.json');
const constants = require('./constants');
const { createServer } = require('./lib');

const args = neodoc.run(`Run a paint-board server like Luogu.
Usage:
    lspb [options]
    
Options:
    --port=<port>      The port of the HTTP server on localhost.
                     [env: PORT] [default: ${constants.port}]
  
    --wsport=<wsport>  The port of the WebSocket server on localhost.
                     [env: WSPORT] [default: ${constants.wsport}]
    --noRestrict       Don't require cookies and referer and no CD time.
                     [env: NORESTRICT]
    --cd=<cd>          Interval between two paints of the same uid, in milliseconds.
                     [env: CD] [default: ${constants.cd}]
    --height=<height>  The height of the board. [env: HEIGHT] [default: ${constants.height}]
    --width=<width>    The width of the board.  [env: WIDTH]  [default: ${constants.width}]
    --verbose          Be more verbose.         [env: VERBOSE]
    --resetBoard       Generate a new board.
`, { version: `v${VERSION}`});

const {
    '--port': port,
    '--wsport': wsport,
    '--noRestrict': noRestrict,
    '--cd': cd,
    '--width': width,
    '--height': height,
    '--verbose': verbose,
    '--resetBoard': resetBoard
} = args;

createServer({
    port, wsport, noRestrict, cd, width, height, verbose, resetBoard,
}).then(({ homePageUrl, wsUrl }) => {
    // eslint-disable-next-line no-console
    console.log(`Homepage: ${homePageUrl}
WebSocket: ${wsUrl}`);
});
