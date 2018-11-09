/// <reference types="node" />
import WebSocket from 'ws';
import { EventEmitter } from 'events';
export declare class Room extends EventEmitter {
    static EVENT_PEER_JOIN: string;
    static EVENT_PEER_LEFT: string;
    static EVENT_SUBSCRIBED: string;
    static EVENT_MESSAGE: string;
    static EVENT_READY: string;
    private _ws;
    private _id;
    private _peers;
    private _peerId;
    private _roomName;
    private _listener;
    constructor(ws: WebSocket, roomName: string, options?: object);
    private _getId;
    private _send;
    /**
     * Это для того что бы нам узнать результат от сервера на конкретный отпрвленный метод
     * результаты пролучаюься через встроенный eventEmmiter которы делает emit на приход сообщений в сокет
     * и только ты решаешь вешать на него какие-то обработчики или нет
     * @param id
     * @param method
     */
    private _recv;
    private _startRoom;
    private _start;
    broadcast(message: string): Promise<boolean>;
    sendTo(peer: string, message: string): Promise<boolean>;
    leave(): Promise<boolean>;
    getPeers(): Promise<string[]>;
    hasPeer(peer: string): Promise<boolean>;
    getPeerId(): Promise<string>;
}
