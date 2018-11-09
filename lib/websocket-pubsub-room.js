"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const Constants_1 = require("./Constants");
class Room extends events_1.EventEmitter {
    constructor(ws, roomName, options = {}) {
        super();
        this._ws = ws;
        this._id = 0;
        this._peers = [];
        this._roomName = roomName;
        this._listener = new events_1.EventEmitter;
        if (ws.readyState === ws_1.default.OPEN) {
            this._start();
        }
        else {
            ws.on('open', () => {
                this._start();
            });
        }
        ws.on('close', (code, reason) => {
            this.leave();
        });
        ws.on('error', e => {
            this.emit('error', e);
        });
    }
    _getId() {
        return Date.now() * 1000000 + this._id++;
    }
    _send(request) {
        const jsonRequest = JSON.stringify(request);
        if (this._ws.readyState === ws_1.default.OPEN) { // TODO: возможно надо подписаться на событие ON
            this._ws.send(jsonRequest);
        }
        else {
            this._ws.on('open', () => {
                this._ws.send(jsonRequest);
            });
        }
    }
    /**
     * Это для того что бы нам узнать результат от сервера на конкретный отпрвленный метод
     * результаты пролучаюься через встроенный eventEmmiter которы делает emit на приход сообщений в сокет
     * и только ты решаешь вешать на него какие-то обработчики или нет
     * @param id
     * @param method
     */
    _recv(id, method) {
        return new Promise((resolve, reject) => {
            this._listener.once(`${id}:${method}`, ({ result, error }) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(result);
                }
            });
        });
    }
    async _startRoom() {
        const id = this._getId();
        const params = {
            name: this._roomName
        };
        this._send({
            method: Constants_1.Method.START_ROOM,
            params,
            id
        });
        const result = await this._recv(id, Constants_1.Method.START_ROOM);
        // console.log('start-room result', result)
        this._peerId = result;
        this._listener.emit(Room.EVENT_READY);
        this.emit(Room.EVENT_SUBSCRIBED);
    }
    async _start() {
        // console.log('start room')
        // send start room -> return peers in room
        this._ws.on('message', (data) => {
            try {
                const response = JSON.parse(data);
                const { result } = response;
                // console.log(response)
                // вызываем евент что типа приняли это сообщение
                this._listener.emit(`${response.id}:${response.method}`, response);
                switch (response.method) {
                    case Constants_1.Method.PEER_JOIN:
                        this.emit(Room.EVENT_PEER_JOIN, result);
                        break;
                    case Constants_1.Method.PEER_LEAVE:
                        this.emit(Room.EVENT_PEER_LEFT, result);
                        break;
                    case Constants_1.Method.MESSAGE:
                        this.emit(Room.EVENT_MESSAGE, { from: response.from, data: result });
                        break;
                }
            }
            catch (e) { // TODO: надо обрабатывать
                console.error(e);
                this.emit('error', e);
            }
        });
        this._startRoom();
    }
    broadcast(message) {
        const id = this._getId();
        const params = {
            name: this._roomName,
            message
        };
        this._send({
            method: Constants_1.Method.BROADCAST,
            params,
            id
        });
        return this._recv(id, Constants_1.Method.BROADCAST);
    }
    sendTo(peer, message) {
        const id = this._getId();
        const params = { peer, message };
        this._send({
            method: Constants_1.Method.SEND_TO,
            params,
            id
        });
        // console.log('method send-to')
        return this._recv(id, Constants_1.Method.SEND_TO);
    }
    leave() {
        const id = this._getId();
        const params = {
            name: this._roomName
        };
        this._send({
            method: Constants_1.Method.LEAVE_ROOM,
            params,
            id
        });
        return this._recv(id, Constants_1.Method.LEAVE_ROOM);
    }
    getPeers() {
        const id = this._getId();
        const params = {
            name: this._roomName
        };
        this._send({
            method: Constants_1.Method.GET_PEERS,
            params,
            id
        });
        return this._recv(id, Constants_1.Method.GET_PEERS);
    }
    hasPeer(peer) {
        const id = this._getId();
        const params = {
            name: this._roomName,
            peer
        };
        this._send({
            method: Constants_1.Method.HAS_PEER,
            params,
            id
        });
        return this._recv(id, Constants_1.Method.HAS_PEER);
    }
    getPeerId() {
        return new Promise((resolve, reject) => {
            if (this._peerId) {
                resolve(this._peerId);
            }
            else {
                this._listener.once(Room.EVENT_READY, () => {
                    resolve(this._peerId);
                });
            }
        });
    }
}
Room.EVENT_PEER_JOIN = 'peer joined';
Room.EVENT_PEER_LEFT = 'peer left';
Room.EVENT_SUBSCRIBED = 'subscribed';
Room.EVENT_MESSAGE = 'message';
Room.EVENT_READY = 'ready';
exports.Room = Room;
//# sourceMappingURL=websocket-pubsub-room.js.map