"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const ws_1 = __importDefault(require("ws"));
const dc_logging_1 = require("dc-logging");
const events_1 = require("events");
const Constants_1 = require("./Constants");
dotenv.config();
const log = new dc_logging_1.Logger('WebSocket server');
const randomString = () => Math.random()
    .toString(36)
    .substring(2, 15) +
    Math.random()
        .toString(36)
        .substring(2, 15);
const listener = new events_1.EventEmitter;
const parseRequest = (data) => JSON.parse(data);
const createResponse = (response) => JSON.stringify(response);
const rooms = {};
const sendTo = (peer, response) => {
    const jsonResponse = createResponse(response);
    const { socket } = peer;
    if (socket.readyState === ws_1.default.OPEN) { // TODO: возможно надо подписаться на событие ON
        socket.send(jsonResponse);
    }
    else {
        socket.on('open', () => {
            socket.send(jsonResponse);
        });
    }
};
const broadcast = (roomName, response, except = null) => {
    const jsonResponse = createResponse(response);
    if (roomName in rooms) {
        for (const peer of rooms[roomName].values()) {
            const { socket, id } = peer;
            if (except && except === id) {
                continue;
            }
            if (socket.readyState === ws_1.default.OPEN) {
                socket.send(jsonResponse);
            }
            else {
                socket.on('open', () => {
                    socket.send(jsonResponse);
                });
            }
        }
    }
};
const getPeerById = (id) => {
    let peer = null;
    const peers = Object.values(rooms);
    for (const map of peers) {
        peer = map.get(id);
        if (peer) {
            break;
        }
    }
    return peer;
};
class WebSocketRPC {
    constructor() {
        this.stopServer = () => {
            this.wss.close(() => {
                log.info('Server stoped.');
                process.exit(0);
            });
        };
    }
    startServer(options) {
        this.wss = new ws_1.default.Server(options);
        log.info(`Server listening on port ${options.port}`);
        process.on('SIGTERM', this.stopServer);
        process.on('SIGINT', this.stopServer);
        this.wss.on('connection', this._onConnection);
        listener.on(Constants_1.Method.START_ROOM, this._onStartRoom);
        listener.on(Constants_1.Method.LEAVE_ROOM, this._onLeaveRoom);
        listener.on(Constants_1.Method.SEND_TO, this._onSendTo);
        listener.on(Constants_1.Method.GET_PEERS, this._onGetPeers);
        listener.on(Constants_1.Method.HAS_PEER, this._onHasPeer);
        listener.on(Constants_1.Method.BROADCAST, this._onBroadcast);
    }
    _onStartRoom({ peer, request }) {
        const params = request.params;
        // const { params }: StartRoomParams = request
        const { name } = params;
        // log.debug({ peer, request })
        log.info(`Start Room: ${params.name}`);
        if (!(name in rooms)) {
            rooms[name] = new Map();
        }
        else {
            // TODO: Надо послать join всем чувакам из комнаты
            broadcast(name, {
                method: Constants_1.Method.PEER_JOIN,
                id: request.id,
                result: peer.id,
                error: null
            });
        }
        rooms[name].set(peer.id, peer);
        log.debug(rooms);
        // TODO: надо послать чуваку обратно его ID что бы он его сохранил
        sendTo(peer, {
            method: Constants_1.Method.START_ROOM,
            id: request.id,
            result: peer.id,
            error: null
        });
    }
    _onLeaveRoom({ peer, request }) {
        const params = request.params;
        const { name } = params;
        log.info(`${peer.id}\tleave room\t${name}`);
        let status = false;
        let error = null;
        if (name in rooms) {
            const peers = rooms[name];
            status = peers.delete(peer.id);
            if (status) {
                // надо послать всем чувакам что peer вышел
                broadcast(name, {
                    method: Constants_1.Method.PEER_LEAVE,
                    result: peer.id,
                    error: null,
                    id: request.id
                });
            }
        }
        else {
            error = `Room ${name} not exist`;
        }
        sendTo(peer, {
            method: Constants_1.Method.LEAVE_ROOM,
            id: request.id,
            result: status,
            error
        });
    }
    _onSendTo({ peer, request }) {
        const params = request.params;
        const toPeer = getPeerById(params.peer);
        let error = null;
        let status = false;
        if (toPeer) {
            sendTo(toPeer, {
                method: Constants_1.Method.MESSAGE,
                from: peer.id,
                id: request.id,
                result: params.message,
                error: null
            });
            status = true;
        }
        else {
            error = `Peer ${peer} not exists`;
        }
        sendTo(peer, {
            method: Constants_1.Method.SEND_TO,
            id: request.id,
            result: status,
            error
        });
    }
    _onGetPeers({ peer, request }) {
        let error = null;
        let result = [];
        const params = request.params;
        const { name } = params;
        if (name in rooms) {
            const peers = rooms[name];
            result = Array.from(peers.values()).map(item => item.id);
        }
        else {
            error = `Room ${name} not exist`;
        }
        sendTo(peer, {
            method: Constants_1.Method.GET_PEERS,
            id: request.id,
            result,
            error
        });
    }
    _onHasPeer({ peer, request }) {
        let error = null;
        let result = false;
        const params = request.params;
        const { name } = params;
        if (name in rooms) {
            const peers = rooms[name];
            result = peers.has(params.peer);
        }
        else {
            error = `Room ${name} not exist`;
        }
        sendTo(peer, {
            method: Constants_1.Method.HAS_PEER,
            id: request.id,
            result,
            error
        });
    }
    _onBroadcast({ peer, request }) {
        const params = request.params;
        const { name } = params;
        let error = null;
        let result = false;
        if (name in rooms) {
            broadcast(name, {
                method: Constants_1.Method.MESSAGE,
                from: peer.id,
                id: request.id,
                result: params.message,
                error: null
            }, peer.id);
            result = true;
        }
        else {
            error = `Room ${name} not exist`;
        }
        sendTo(peer, {
            method: Constants_1.Method.BROADCAST,
            id: request.id,
            result,
            error
        });
    }
    _onConnection(clientSocket) {
        const peer = {
            id: randomString(),
            socket: clientSocket
        };
        const _this = this;
        clientSocket.on('message', (data) => {
            try {
                const request = parseRequest(data);
                // log.debug(request)
                listener.emit(request.method, { peer, request });
            }
            catch (e) {
                log.error(e);
                // TODO: надо клиенту что-то возвращать наверное
            }
        });
    }
}
const ws = new WebSocketRPC();
ws.startServer({ port: process.env.PORT });
//# sourceMappingURL=server.js.map