const fs = require('fs').promises;
const readFileSync = require('fs').readFileSync;
const { inRange } = require('lodash');
const path = require('path');
const async = require('async');
const WebSocket = require('ws');
const servert = require('server');
const json = require('server/reply/json');
const status = require('server/reply/status');
const axios = require("axios")
const cheerio = require("cheerio")
const { MongoClient } = require('mongodb')
const Https = require('https')
const url = "mongodb://localhost:27017"
const uuidv4 = require('uuid').v4

const client = new MongoClient(url)

const { get, post } = servert.router;

const COLOR = [
    [0, 0, 0],
    [255, 255, 255],
    [170, 170, 170],
    [85, 85, 85],
    [254, 211, 199],
    [255, 196, 206],
    [250, 172, 142],
    [255, 139, 131],
    [244, 67, 54],
    [233, 30, 99],
    [226, 102, 158],
    [156, 39, 176],
    [103, 58, 183],
    [63, 81, 181],
    [0, 70, 112],
    [5, 113, 151],
    [33, 150, 243],
    [0, 188, 212],
    [59, 229, 219],
    [151, 253, 220],
    [22, 115, 0],
    [55, 169, 60],
    [137, 230, 66],
    [215, 255, 7],
    [255, 246, 209],
    [248, 203, 140],
    [255, 235, 59],
    [255, 193, 7],
    [255, 152, 0],
    [255, 87, 34],
    [184, 63, 39],
    [121, 85, 72],
];


const constants = require('./constants');

const VERIFY_TEXT = "LSPaintBoard";

const REGISTER_BEFORE = 1669824000;

const COLORR = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w'];

async function createServer({
                                port = constants.port,
                                wsport = constants.wsport,
                                noRestrict = false,
                                cd = constants.cd,
                                width = constants.width,
                                height = constants.height,
                                verbose = false,
                                ast = constants.ast,
                                aet = constants.aet,
                                resetBoard = false,
                            } = {}) {
    let saved;
    let board;
    function genBoard(data){
        data = data.toString()
        let boardT = new Array(width).fill('0').map(() => new Array(height).fill(''));
        data.split('\n').map(function (colorStr, x) {
            colorStr.split("").map(function (color, y) {
                boardT[x][y] = color;

            });
        });
        return boardT
    }
    if (resetBoard) {
        board = await fs.readFile(path.resolve(constants.path, 'Default.txt'))
            .then((data) => genBoard(data));
    }
    else {
        board = await fs.readFile(path.resolve(constants.path, 'board.txt'))
            .then((data) => genBoard(data));
    }

    const lastPaint = new Map();
    const lastToken = new Map();
    const tokenCache = new Map();



    const wsUrl = `wss://segonoj.site:${wsport}/ws`;

    const homePage = await fs.readFile(path.resolve(constants.path, 'paintBoard.html'))
        .then((data) => data.toString()
            .replace(/\$wsUrl/g, (wsUrl).toString())
            .replace(/\$width/g, (width).toString())
            .replace(/\$height/g, (height).toString())
            .replace(/\$5width/g, (5 * width).toString())
            .replace(/\$5height/g, (5 * height).toString())
            .replace(/\$cd/g, (cd).toString())
            .replace(/\$ast/g, (ast).toString())
            .replace(/\$aet/g, (aet).toString()));
    const cert = readFileSync('/etc/nginx/cert.pem');
    const key = readFileSync('/etc/nginx/key.pem');
    const wss = await new Promise((resolve, reject) => {
        const opts = {
            cert: cert,
            key: key,
            path: '/ws'
        }
        const server = Https.createServer(opts);
        const wsServer = new WebSocket.WebSocketServer({ server });
        wsServer.on('connection', (ws, req) => {
            console.log("Get Websocket Connection: ", req.connection.remoteAddress)
            ws.on('message', (message) => {
                try {
                    const msg = JSON.parse(message);
                    console.log(msg)
                    if (msg.type === 'join_channel' && msg.channel === 'paintboard') {
                        ws.send(JSON.stringify({ type: 'result' }));
                    }
                    else {
                        ws.close();
                        wsServer.clients.delete(ws)
                    }
                }
                catch {
                    ws.close();
                    wsServer.clients.delete(ws)
                }
            });
            ws.on('close', function (message) {
                wsServer.clients.delete(ws)
            });
            ws.on('error', function (message) {
                ws.close();
                wsServer.clients.delete(ws)
            });
        });
        wsServer.on('listening', () => { resolve(wsServer);});

        wsServer.on('error', (error) => { reject(error); });


        server.listen(wsport);
    });

    await client.connect();

    const tokens = await client.db("paintboard").collection('token').find({}).toArray();

    tokens.forEach((dat) => { tokenCache.set(dat.uid, dat.token) })

    async function getToken(ctx) {
        function response(statusCode, message) {
            ctx.log.info(`${statusCode}: ${message}`);
            return json({ status: statusCode, data: message });
        }


        let userValid = 0, message = "";

        if (ctx.data) {
            const uid = ctx.data.uid.toString();
            const paste = ctx.data.paste;
            if (lastToken.has(uid) && Date.now() - lastToken.get(uid) < 300000) {
                return response(500, `uid:${uid} 冷却中`);
            }
            await axios.get(`https://www.luogu.com.cn/paste/${paste}`).then(resp => {
                //
                let $ = cheerio.load(resp.data)

                const reg = /(\{"code":(.)*\})+/;
                let res = decodeURIComponent($("script").eq(0).text().trim()).match(reg)[0];
                try {
                    res = JSON.parse(res)
                }
                catch (err) {
                    userValid = 401;
                    message = "用户认证失败";
                    lastToken.set(uid, Date.now());
                    return
                }
                const text = res.currentData.paste.data;
                const user = res.currentData.paste.user.uid.toString();
                const color = res.currentData.paste.user.color;
                if (text !== VERIFY_TEXT || user !== uid || (!(color === "Blue" || color === "Green" || color === "Orange" || color === "Red" || color === "Purple"))) {
                    userValid = 402;
                    message = "用户认证失败"; lastToken.set(uid, Date.now());
                }
            }).catch((err) => {
                userValid = 500;
                message = err;
            })

            await axios.get(`https://www.luogu.com.cn/user/${uid}`).then(resp => {
                const $ = cheerio.load(resp.data);
                const reg = /(\{"code":(.)*\})+/;
                let res = decodeURIComponent($("script").eq(0).text().trim()).match(reg)[0];
                try {
                    res = JSON.parse(res)
                }
                catch (err) {
                    userValid = 403;
                    message = "用户认证失败";
                    lastToken.set(uid, Date.now());
                    return
                }
                const registerTime = res.currentData.user.registerTime;
                if (registerTime >= REGISTER_BEFORE) {
                    userValid = 404;
                    message = "用户认证失败"; lastToken.set(uid, Date.now());
                }
            }).catch((err) => {
                userValid = 500;
                message = err;
            })

            if (userValid !== 0) return response(userValid, message)

            const token = uuidv4();
            const query = {uid: uid};

            const value = await client.db('paintboard').collection('token').findOne(query);
            if (value == null) {
                const doc = { uid: uid, token: token };
                await client.db('paintboard').collection('token').insertOne(doc)
            }
            else {
                const query = { uid: uid };
                const doc = { uid: uid, token: token };
                await client.db('paintboard').collection('token').updateOne(query, {"$set": doc})
            }
            lastToken.set(uid, Date.now())
            tokenCache.set(uid, token)
            return response(200, token)

        }
        return response(500, `传入参数不合法`)

    }

    async function getBoard() {
        console.log(Date().toLocaleUpperCase(), 'GetBoard!');
        let result = '';
        board.forEach((column) => { result += column.join(''); result += '\n'; });
        return result;
    }

    async function saveBoard() {
        if (Date.now()>aet)return;
        let result = '';
        board.forEach((column) => { result += column.join(''); result += '\n'; });
        if (Date.now() < ast * 1000) return;
        await fs.writeFile(constants.path + `board${constants.year}/Board${Math.floor((Date.now() - ast * 1000) / 1000.0)}.txt`, result)
    }

    const paintQueue = async.queue(async ({
                                              x, y, color, log,
                                          }) => {
        board[x][y] = COLORR[color];
        const broadcast = JSON.stringify({
            type: 'paintboard_update',
            x,
            y,
            color,
        });
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.WebSocket.OPEN) {
                try {

                    client.send(broadcast);
                }
                catch (err) {
                    client.close();
                    wss.clients.delete(client);
                }
            }
            else if (client !== WebSocket.WebSocket.CONNECTING) {
                client.close();
                wss.clients.delete(client);
            }
        });
        log.info(`WebSocket broadcast: ${broadcast}`);
    });

    async function paint(ctx) {
        const { data, log, ip } = ctx; let { uid, token, x, y, color } = data; if (Date.now() < ast * 1000 || Date.now() > aet * 1000) return json({ status: 402, data: '不在活动时间内' }); if (!uid || !token || !x || !y || !color) return json({ status: 400, data: 'data 中的 x, y, color, uid, token 不合法' }); try {
            uid = uid.toString();
            console.log(Date().toLocaleUpperCase(), `Get Post Paint x=${+x} y=${+y} color=${color} ip=` + ip);
            if (lastPaint.has(uid) && Date.now() - lastPaint.get(uid) < cd && uid !== "378849") {
                return json({ status: 500, data: `uid:${uid} 冷却中` });
            }
            const value = tokenCache.get(uid);
            if (value === null) return json({ status: 401, data: `用户认证失败` });
            if (value !== token) return json({ status: 401, data: `用户认证失败` });
            if (inRange(x, 0, width) && inRange(y, 0, height) && inRange(color, 0, COLOR.length)) {
                lastPaint.set(uid, Date.now());
                await paintQueue.push({
                    x, y, color, log
                });
                return json({ status: 200, data: `成功（uid:${uid}, x:${x}, y:${y}, color:${color}）` });
            }
        } catch {
            return json({ status: 500, data: `用户认证失败` });
        }
    }

    await servert({ port, security: { csrf: false, contentSecurityPolicy: false, permittedCrossDomainPolicies: true }, log: verbose ? 'info' : 'warning' }, [
        get('/paintboard', () => homePage),
        get('/paintboard/board', getBoard),
        post('/paintboard/paint', paint),
        post('/paintboard/gettoken', getToken),
        get(() => status(404).send('Not Found')),
        post(() => status(404).send('Not Found')),
    ]);
    setInterval(saveBoard, 20000)
    saved = false;
    return {
        homePageUrl: `http://segonoj.site:${port}/paintboard`,
        wsUrl,
    };
}

module.exports = { createServer };
