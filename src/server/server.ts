import * as dotenv from 'dotenv'
import WebSocket from 'ws'
import { Logger } from 'dc-logging'

dotenv.config()
const log = new Logger('WebSocket p2p signal server')

class WebSocketSignalServer {
    private wss: WebSocket.Server
    startServer(options) {
        this.wss = new WebSocket.Server(options)
        log.info(`WebSockerSignalServer listening on port ${options.port}`)

        process.on('SIGTERM', this.stopServer)
        process.on('SIGINT', this.stopServer)
    }

    stopServer() {
        this.wss.close(() => {
            log.info('WebSockerSignalServer stoped')
            process.exit(0)
        })
    }
}

const ws = new WebSocketSignalServer()
ws.startServer({ port: process.env.PORT })