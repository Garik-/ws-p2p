# Server
## Protocol
JSON Request Message
```
{
    from?: string
    method: string - название метода запрашиваемого
    params: any - параметры в виде объекта
    id: number - номер запроса
}
```
JSON Response Message
```
{
    from?: string
    method: string - название метода, который запросили
    result: any
    error: any
    id: number - номер запроса
}
```
При запросе генерируем ID и что бы узнать ответ на запрос сравниваем ID полученный и название метода.
### Methods
#### startRoom
```
params: {
    name: string - имя комнаты
}
result: string - peer ID пользователя, котороый инициалазировал запрос
```
при входе в комнату сервер отправляет участникам broadcast запрос **peerJoin**
#### leaveRoom
```
params: {
    name: string -  имя комнаты
}
result: boolean - статус отключения от комнаты
```
при выходе из комнаты сервер отправляет участникам broadcast запрос **peerLeave**