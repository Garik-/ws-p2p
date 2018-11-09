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
const mocha_1 = require("mocha");
const chai_1 = require("chai");
const websocket_pubsub_room_1 = require("../websocket-pubsub-room");
const ROOM_NAME = 'room-name';
const NUM_CLIENTS = 10; // нужно четное число
function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
dotenv.config();
const createConnection = (address) => {
    return new Promise((resolve, reject) => {
        const ws = new ws_1.default(address);
        ws.on('open', () => {
            resolve(ws);
        });
        ws.on('error', error => {
            reject(error);
        });
    });
};
mocha_1.describe('WebSocket client', () => {
    const clientSockets = [];
    const roomIntefaces = [];
    const peersInRoom = [];
    mocha_1.it('Create connections', async () => {
        for (let i = 0; i < NUM_CLIENTS; i++) {
            const ws = new ws_1.default(`ws://localhost:${process.env.PORT}`);
            chai_1.expect(ws).to.be.an.instanceof(ws_1.default);
            clientSockets.push(ws);
        }
    });
    mocha_1.it('Create Room interfaces', async () => {
        for (let i = 0; i < clientSockets.length; i++) {
            const ws = clientSockets[i];
            const room = new websocket_pubsub_room_1.Room(ws, ROOM_NAME);
            room.on(websocket_pubsub_room_1.Room.EVENT_PEER_JOIN, peer => {
                console.log(`Client #${i}: Peer joined the room`, peer);
            });
            room.on(websocket_pubsub_room_1.Room.EVENT_PEER_LEFT, peer => {
                console.log(`Client #${i}: Peer left...`, peer);
            });
            // now started to listen to room
            room.on(websocket_pubsub_room_1.Room.EVENT_SUBSCRIBED, () => {
                console.log(`Client #${i}: Now connected!`);
            });
            roomIntefaces.push(room);
            peersInRoom.push(await room.getPeerId());
        }
    });
    mocha_1.it('SendTo messages', async () => {
        for (let i = 0; i < roomIntefaces.length; i = i + 2) {
            const client1 = roomIntefaces[i];
            const client2 = roomIntefaces[i + 1];
            const _message = 'privet';
            client2.once('message', message => {
                console.log(`Client #${i} say ${message.data} to client #${i + 1}`);
                chai_1.expect(message.data).to.be.equal(_message);
            });
            const peer = await client2.getPeerId();
            const status = await client1.sendTo(peer, _message);
            /* tslint:disable-next-line  */
            chai_1.expect(status).to.be.true;
        }
    });
    mocha_1.it('Test set many onMessage listeners', async () => {
        for (let i = 0; i < roomIntefaces.length; i = i + 2) {
            const client1 = roomIntefaces[i];
            const client2 = roomIntefaces[i + 1];
            const _message = 'privet';
            client2.once('message', message => {
                console.log(`Client #${i} say ${message.data} to client #${i + 1} - first listener`);
                chai_1.expect(message.data).to.be.equal(_message);
            });
            client2.once('message', message => {
                console.log(`Client #${i} say ${message.data} to client #${i + 1} - second listener`);
                chai_1.expect(message.data).to.be.equal(_message);
            });
            const peer = await client2.getPeerId();
            const status = await client1.sendTo(peer, _message);
            /* tslint:disable-next-line  */
            chai_1.expect(status).to.be.true;
        }
    });
    mocha_1.it('Get peers in room', async () => {
        for (let i = 0; i < roomIntefaces.length; i++) {
            const room = roomIntefaces[i];
            const peers = await room.getPeers();
            chai_1.expect(peers).to.deep.equal(peersInRoom);
        }
    });
    mocha_1.it('Has peer in room', async () => {
        for (let i = 0; i < roomIntefaces.length; i = i + 2) {
            const client1 = roomIntefaces[i];
            const client2 = roomIntefaces[i + 1];
            const status = await client1.hasPeer(await client2.getPeerId());
            /* tslint:disable-next-line  */
            chai_1.expect(status).to.be.true;
        }
    });
    mocha_1.it('Broadcast message', async () => {
        let countMessages = 1;
        const messageBroadcast = 'broadcast';
        const src = roomIntefaces[0];
        for (let i = 1; i < roomIntefaces.length; i++) {
            const dest = roomIntefaces[i];
            dest.once('message', message => {
                if (messageBroadcast === message.data) {
                    countMessages++;
                }
            });
        }
        const status = await src.broadcast(messageBroadcast);
        /* tslint:disable-next-line  */
        chai_1.expect(status).to.be.true;
        chai_1.expect(countMessages).to.be.equal(roomIntefaces.length);
    });
    mocha_1.it('Leave rooms', async () => {
        // await sleep(2000)
        for (let i = 0; i < roomIntefaces.length; i++) {
            const room = roomIntefaces[i];
            const status = await room.leave();
            /* tslint:disable-next-line  */
            chai_1.expect(status).to.be.true;
        }
    });
    mocha_1.it('Close connections', () => {
        for (let i = 0; i < clientSockets.length; i++) {
            const ws = clientSockets[i];
            if (ws.readyState === ws_1.default.OPEN) {
                ws.close();
            }
            else {
                ws.on('open', () => {
                    ws.close();
                });
            }
        }
    });
});
//# sourceMappingURL=client.test.js.map