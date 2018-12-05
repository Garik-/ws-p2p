import WebSocket from 'ws'
import { EventEmitter } from 'events';

const openConnections: Map<string, WebSocket> = new Map()

// нужен евент листеренер готовый ставит статус ready только после того как получил адресс у клиента
// нужны мапы или какая-то очередь отправки сообщений которые пойдут только после ready

interface Pack {
    event: string,
    data: string
}

class App {
    private _wss: WebSocket.Server
    private _ws: WebSocket
    private _openConnections: Map<string, WebSocket>
    private _queue: Map<string, Set<string>>
    private _name: string
    private _listener: NodeJS.EventEmitter

    private _log(info: any) {
        console.log(`[${this._name}] `, info)
    }

    constructor(options) {
        this._wss = new WebSocket.Server(options)
        this._name = options.name
        this._openConnections = new Map()
        this._queue = new Map()
        this._listener = new EventEmitter()

        this._listener.on('handshake', ({ address }, ws) => {
            this._openConnections.set(address, ws)
            this._log('server add address '+ address)
        })

        this._listener.on('message', ( message, ws ) => {
            this._log('message: ' + message)
        })

        this._listener.on('queue_send', address => {
            const ws = this._openConnections.get(address)
            if (!ws) {
                return false
            }

            const queue = this._queue.get(address)
            for (const message of queue) {
                this._sendMessage(ws, message)
            }
            queue.clear()
            this._queue.set(address, queue)
        })


        console.info(`Server listening on port ${this._wss.address().port}`)
        // this._openConnections.set(this.getAddress(), this._wss)

        process.on('SIGTERM', () => {
            this._closeConnections()
            this._stopServer()
        })
        process.on('SIGINT', () => {
            this._closeConnections()
            this._stopServer()
        })

        this._wss.on('connection', (ws) => { this._onConnection(ws, 'server') })
    }

    private _onConnection(ws: WebSocket, type: string) {
        ws.on('message', data => {
            this._log(`${type}: ${data}`)
            const json = JSON.parse(data)
            this._listener.emit(json.event, json.data, ws)
        })
    }

    private _closeConnections() {
        this._openConnections.forEach((ws: WebSocket, adress: string) => {
            ws.close()
        })
    }

    private _stopServer() {
        this._wss.close(() => {
            console.info('WebSockerSignalServer stoped')
        })
    }

    getAddress(): string {
        return `ws://localhost:${this._wss.address().port}/`
    }

    private _send(ws: WebSocket, message: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message, {}, resolve)
            } else {
                ws.on('open', () => {
                    ws.send(message, {}, resolve)
                })
            }
        })
    }

    private _createConnection = (address: string): Promise<WebSocket> => {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(address)
            ws.once('open',() => {
                resolve(ws)
            })
            ws.once('error', error => {
                reject(error)
            })
        })
       }

    private async _sendHandshake(ws: WebSocket) {
        this._send(ws, JSON.stringify({ event: 'handshake', data: { address: this.getAddress() } }))
    }

    private async _sendMessage(ws: WebSocket, message: string) {
        return this._send(ws, JSON.stringify({ event: 'message', data: message }))
    }

    private async _openConnection(address: string): Promise<WebSocket> {
        const ws = await this._createConnection(address)
        this._openConnections.set(address, ws)
        this._log('client connect to server ' + address)
        ws.on('close', () => {
            this._openConnections.delete(address)
        })

        this._onConnection(ws, 'client')
        await this._sendHandshake(ws)
        this._listener.emit('queue_send', address)
        return ws
    }

    async sendTo(address: string, message: string): Promise<void> {
        let queue = this._queue.get(address)
        if(!queue) {
            queue = new Set()
        }
        queue.add(message)
        this._queue.set(address, queue)

        if (!this._openConnections.has(address)) {
            await this._openConnection(address)
        }
    }

    getOpenConnections() {
        return this._openConnections
    }
}

class Node {
    private _id: string
    private _serverSocket: WebSocket.Server
    private _fWaitHandshake: boolean
    private _listener: NodeJS.EventEmitter
    private _queue: Map<string, Set<string>>
    private _connections: Map<string, WebSocket>
    constructor (id: string) {
        this._id = id
        this._fWaitHandshake = false
        this._listener = new EventEmitter()
        this._queue = new Map()
        this._connections = new Map()

        this._listener.on('connect', address => {
            if (this._connections.has(address)) {
                return false
            }
            this._connections.set(address, null)
            this._log('Connected to server ' + address)
            const clientSocket = new WebSocket(address)
            clientSocket.once('open', async () => {
                this._connections.set(address, clientSocket)

                clientSocket.on('message', message => {
                    const { event, data } = JSON.parse(message)
                    this._listener.emit('recv:' + event, data, clientSocket)
                })
                // send handshake - my address
                this._log('send handshake')
                await this._send(clientSocket, 'handshake', { address: this.getDirectAddress() })
            })
            clientSocket.once('error', error => {
                this._log('client error: ' + error)
            })
        })

        this._listener.on('send', async address => { // шлем данные в сокет
            const queue = this._queue.get(address)
            if (!queue) {
                return false
            }

            if (!this._connections.has(address)) {
                if (!this._fWaitHandshake) { // пытаемся создать подключение
                    this._listener.emit('connect', address)
                }
                return false
            }

            const clientSocket = this._connections.get(address)
            if (!clientSocket) {
                return false
            }
            this._log('event send from ' + address)
            for (let message of queue) {
                await this._send(clientSocket, 'message', message)
            }
            queue.clear()
            this._queue.set(address, queue)
            this._listener.emit('send:' + address)
        })

        this._listener.on('recv:message', message => {
            this._log(message)
        })

        this._listener.on('recv:handshake-ok', address => {
            this._log('handshake ok')
            this._listener.emit('send', address)
        })

        this._listener.on('recv:handshake', async ({ address }, clientSocket) => {
            if (this._connections.has(address)) {
                return false
            }

            this._connections.set(address, clientSocket)

            clientSocket.on('close', () => {
                this._connections.delete(address)
            })

            this._log('server add client ' + address)

            this._fWaitHandshake = false
            await this._send(clientSocket, 'handshake-ok', this.getDirectAddress())
            this._listener.emit('send', address)
        })

        this._startServer()
    }



    private _send(ws: WebSocket, event:string, data: any): Promise<void> {
        return new Promise((resolve, reject) => {
            const message = JSON.stringify({
                event,
                data,
                from: this.getDirectAddress()
            })

            this._log(message)

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message, {}, resolve)
            } else {
                ws.on('open', () => {
                    ws.send(message, {}, resolve)
                })
            }
        })
    }

    private _log(message) {
        console.log(`[${this._id}]: `, message)
    }

    private _startServer() {
        const wss = new WebSocket.Server({ port: 0 })
        const { port } = wss.address()
        this._log(`Server listening on port ${port}`)
        this._serverSocket = wss

        wss.on('connection', clientSocket => {
            this._log('client connected, wait handshake')
            this._fWaitHandshake = true

            clientSocket.on('message', message => {
                const { event, data } = JSON.parse(message)
                this._listener.emit('recv:' + event, data, clientSocket)
            })
            // this._connections.set(clientSocket, null)
        })

        process.on('SIGTERM', () => {
            this._stopServer()
        })
        process.on('SIGINT', () => {
            this._stopServer()
        })
    }

    private _stopServer() {
        const { port } = this._serverSocket.address()
        this._serverSocket.close(() => {
            this._log(`Server stoped on port ${port}` )
        })
    }

    getDirectAddress() {
        if (!this._serverSocket) {
            return null
        } else {
            const { port } = this._serverSocket.address()
            return `ws://localhost:${port}/`
        }
    }

    send(address: string, message: string): Promise<void> {
        return new Promise(resolve => {
            this.addQueue(address, message)

            if (!this._fWaitHandshake) {
                this._listener.emit('send', address)
            }

            this._listener.once('send:' + address, resolve)
        })
    }

    addQueue(address: string, message: string) {
        let queue = this._queue.get(address)
        if (!queue) {
            queue = new Set()
        }
        queue.add(message)
        this._queue.set(address, queue)
    }
}

// const apps = [new App({ port: 0, name: 'name1' }), new App({ port: 0, name: 'name2' })]
// console.log('app 0', apps[0].getAddress())
// console.log('app 1', apps[1].getAddress())

// const test = async () => {
//     await apps[0].sendTo(apps[1].getAddress(), 'message from app 1')
//     await apps[0].sendTo(apps[1].getAddress(), 'second message from app 1')

//     // TODO: wait - add open enabled connections, it's wrong!
//     // setTimeout(async () => {
//         const openConnections = apps[1].getOpenConnections().keys()
//         console.log('apps 1 enabled connections', openConnections)
//         await apps[1].sendTo(apps[0].getAddress(), 'message from app 1 from app 0')
//     // }, 500)
// }

// test()
//apps[1].sendTo(apps[0].getAddress(), 'lol2')

//apps[0].sendTo(apps[1].getAddress(), 'second message')

const nodes = [new Node('node0'), new Node('node1')]

const test = async () => {
    nodes[0].addQueue(nodes[1].getDirectAddress(), 'hello node2')
    nodes[0].addQueue(nodes[1].getDirectAddress(), 'hello node23')
    await nodes[0].send(nodes[1].getDirectAddress(), 'hello node24')

    await nodes[1].send(nodes[0].getDirectAddress(), 'hello hode1')
    //await nodes[0].send(nodes[1].getDirectAddress(), 'how are you?')

    //nodes[1].addQueue(nodes[0].getDirectAddress(), 'I\'m fine')
    //await nodes[1].send(nodes[0].getDirectAddress(), 'thank')
}

test()
