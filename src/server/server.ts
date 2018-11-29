import * as dotenv from 'dotenv'
import WebSocket from 'ws'
import { Logger } from 'dc-logging'
import { RequestMessage, ResponseMessage, ServerEmitParams, Peer, StartRoomParams, LeaveRoomParams, SendToParams, GetPeersParams, HasPeerParams, BroadcastParams } from './Interfaces'
import { EventEmitter } from 'events'
import { Method } from './Constants'
import moment from 'moment'

dotenv.config()

const log = new Logger('WebSocket server')
const randomString = () =>
  Math.random()
    .toString(36)
    .substring(2, 15) +
  Math.random()
    .toString(36)
    .substring(2, 15)

const listener = new EventEmitter
const parseRequest = (data: string): RequestMessage => JSON.parse(data)
const createResponse = (response: ResponseMessage): string => JSON.stringify(response)
const rooms = {}

const logResponse = (peer: Peer, response: ResponseMessage): void => {
    const time: string = moment().format('DD/MMM/YYYY:HH:mm:ss ZZ')
    const fgGreen = "\x1b[32m"
    const fgYellow = "\x1b[33m"
    const reset = "\x1b[0m"
    const fgBlue = "\x1b[36m"
    const fgRed = "\x1b[31m"
    log.info(`${peer.id}\t${response.id.toString(16)} - ${fgGreen}[${time}]${reset}\t${fgYellow}${response.method}${reset} -> ${fgBlue}${response.result}${reset}${response.error ? ' ' + fgRed + response.error + reset : ''}`)
}

const sendTo = (peer: Peer, response: ResponseMessage) => {
    const jsonResponse: string = createResponse(response)
    const { socket } = peer
    if(socket.readyState === WebSocket.OPEN) { // TODO: возможно надо подписаться на событие ON
        socket.send(jsonResponse)
        logResponse(peer, response)
    } else {
        socket.on('open', () => {
            socket.send(jsonResponse)
            logResponse(peer, response)
        })
    }
}

const broadcast = (roomName: string, response: ResponseMessage, except: string = null) => {
    const jsonResponse: string = createResponse(response)
    if (roomName in rooms) {
        for(const peer of rooms[roomName].values()) {
            const { socket, id } = peer
            if (except && except === id) {
                continue
            }
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(jsonResponse)
                logResponse(peer, response)
            } else {
                socket.on('open', () => {
                    socket.send(jsonResponse)
                    logResponse(peer, response)
                })
            }
        }
    }
}

const getPeerById = (id: string): Peer =>{
    let peer: Peer = null

    const peers: Map<string, Peer>[] = Object.values(rooms)
    for(const map of peers) {
        peer = map.get(id)
        if (peer) {
            break
        }
    }
    return peer
}

class WebSocketRPC {
    private wss: WebSocket.Server
    startServer(options) {
        this.wss = new WebSocket.Server(options)
        log.info(`Server listening on port ${options.port}`)

        process.on('SIGTERM', this.stopServer)
        process.on('SIGINT', this.stopServer)

        this.wss.on('connection', this._onConnection)
        listener.on(Method.START_ROOM, this._onStartRoom)
        listener.on(Method.LEAVE_ROOM, this._onLeaveRoom)
        listener.on(Method.SEND_TO, this._onSendTo)
        listener.on(Method.GET_PEERS, this._onGetPeers)
        listener.on(Method.HAS_PEER, this._onHasPeer)
        listener.on(Method.BROADCAST, this._onBroadcast)
    }

    private _onStartRoom({ peer, request }: ServerEmitParams) {
        const params: StartRoomParams = request.params
        // const { params }: StartRoomParams = request
        const { name } = params
        // log.debug({ peer, request })
        log.info(`Start Room: ${params.name}`)

        if (!(name in rooms)) {
            rooms[name] = new Map()
        } else {
            // // TODO: Надо послать join всем чувакам из комнаты
            // broadcast(name, {
            //     method: Method.PEER_JOIN,
            //     id: request.id,
            //     result: peer.id,
            //     error: null
            // })
        }
        rooms[name].set(peer.id, peer)
        log.debug(rooms)

        // TODO: надо послать чуваку обратно его ID что бы он его сохранил
        sendTo(peer, {
            method: Method.START_ROOM,
            id: request.id,
            result: peer.id,
            error: null
        })

        // переместил оповещение после того как уже пир подключился к комнате
        broadcast(name, {
            method: Method.PEER_JOIN,
            id: request.id,
            result: peer.id,
            error: null
        })
    }

    private _onLeaveRoom({ peer, request }: ServerEmitParams) {
        const params: LeaveRoomParams = request.params
        const { name } = params
        log.info(`${peer.id}\tleave room\t${name}`)

        let status: boolean = false
        let error = null

        if (name in rooms) {
            const peers: Map<string, Peer> = rooms[name]
            status = peers.delete(peer.id)

            if (status) {
                // надо послать всем чувакам что peer вышел
                broadcast(name, {
                    method: Method.PEER_LEAVE,
                    result: peer.id,
                    error: null,
                    id: request.id
                })
            } else {
                error = `No ${peer.id} in room ${name}`
            }
        }
        else {
            error = `Room ${name} not exist`
        }

        sendTo(peer, {
            method: Method.LEAVE_ROOM,
            id: request.id,
            result: status,
            error
        })
    }

    private _onSendTo({ peer, request }: ServerEmitParams) {
        const params: SendToParams = request.params

        const toPeer = getPeerById(params.peer)
        let error = null
        let status: boolean = false
        if (toPeer) {
            sendTo(toPeer, {
                method: Method.MESSAGE,
                from: peer.id,
                id: request.id,
                result: params.message,
                error: null
            })
            status = true
        }
        else {
            error = `Peer ${peer} not exists`
        }

        sendTo(peer, {
            method: Method.SEND_TO,
            id: request.id,
            result: status,
            error
        })
    }

    private _onGetPeers({ peer, request }: ServerEmitParams) {
        let error = null
        let result: string[] = []

        const params: GetPeersParams = request.params
        const { name } = params

        if (name in rooms) {
            const peers: Map<string, Peer> = rooms[name]
            result = Array.from(peers.values()).map(item => item.id)
        }
        else {
            error = `Room ${name} not exist`
        }

        sendTo(peer, {
            method: Method.GET_PEERS,
            id: request.id,
            result,
            error
        })
    }

    private _onHasPeer({ peer, request }: ServerEmitParams) {
        let error = null
        let result = false

        const params: HasPeerParams = request.params
        const { name } = params
        if (name in rooms) {
            const peers: Map<string, Peer> = rooms[name]
            result = peers.has(params.peer)
        }
        else {
            error = `Room ${name} not exist`
        }

        sendTo(peer, {
            method: Method.HAS_PEER,
            id: request.id,
            result,
            error
        })
    }

    private _onBroadcast({ peer, request }: ServerEmitParams) {
        const params: BroadcastParams = request.params
        const { name } = params

        let error = null
        let result: boolean = false

        if (name in rooms) {
            broadcast(name, {
                method: Method.MESSAGE,
                from: peer.id,
                id: request.id,
                result: params.message,
                error: null
            }, peer.id)

            result = true
        }
        else {
            error = `Room ${name} not exist`
        }

        sendTo(peer, {
            method: Method.BROADCAST,
            id: request.id,
            result,
            error
        })
    }

    private _onConnection(clientSocket: WebSocket) {
        const peer: Peer =  {
            id: randomString(),
            socket: clientSocket
        }

        const _this = this
        clientSocket.on('message', (data: string) => {
            try {
                const request: RequestMessage = parseRequest(data)
                // log.debug(request)
                listener.emit(request.method, { peer, request })
            } catch (e) {
                log.error(e)
                // TODO: надо клиенту что-то возвращать наверное
            }
        })
    }

    stopServer = () => {
        this.wss.close(() => {
            log.info('Server stoped.')
            process.exit(0)
        })
    }
}

const ws = new WebSocketRPC()
ws.startServer({ port: process.env.PORT })
