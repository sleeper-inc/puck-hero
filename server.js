const express = require('express')
const {WebSocketServer} = require('ws')
const http = require('http')

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({server})

// Serve static files
app.use(express.static('public'))

// Store active games
const games = new Map()

// Store waiting players
let waitingPlayer = null

class Game {
    constructor(player1, player2) {
        this.players = [player1, player2]
        this.state = {
            score: {player1: 0, player2: 0},
            puck: {
                x: 400,
                y: 300,
                velocityX: 0,
                velocityY: 0,
            },
            player1: {
                x: 100,
                y: 300
            },
            player2: {
                x: 700,
                y: 300
            }
        }

        this.gameInterval = setInterval(() => {
            this.update()
        }, 1000 / 60 ) // 60 FPS
    }

    update() {
        // Update puck physics
        this.state.puck.x += this.state.puck.velocityX
        this.state.puck.y += this.state.puck.velocityY

        // Apply friction
        this.state.puck.velocityX *= 0.99
        this.state.puck.velocityY *= 0.99

        // Send game state to both players
        this.broadcast()
    }

    broadcast() {
        const gameState = JSON.stringify({
            type: "gameState",
            state: this.state
        })

        this.players.forEach(player => {
            if (player.readyState === 1) { // Check if connection is open
                player.send(gameState)
            }
        })
    }

    handlePlayerMove(player, position) {
        const playerIndex = this.players.indexOf(player)
        const playerKey = playerIndex === 0 ? 'player1' : 'player2'
        this.state[playerKey] = position
    }

    handlePuckHit(data) {
        this.state.puck.velocityX = data.velocityX
        this.state.puck.velocityY = data.velocityY
    }
}

wss.on('connection', (ws) => {
    console.log('New player connected')

    if (!waitingPlayer) {
        waitingPlayer = ws
        ws.send(JSON.stringify({type: 'waiting'}))
    } else {
        // Create new game
        const game = new Game(waitingPlayer, ws)

        // Store game reference for both players
        waitingPlayer.gameId = Date.now()
        ws.gameId = waitingPlayer.gameId
        games.set(waitingPlayer.gameId, game)

        // Notify players game is starting
        waitingPlayer.send(JSON.stringify({type: "start", player: 1}))
        ws.send(JSON.stringify({type: "start", player: 2}))

        // Reset waiting player
        waitingPlayer = null
    }

    ws.on('message', (message) => {
        const data = JSON.parse(message)
        const game = games.get(ws.gameId)

        if (!game) return

        switch (data.type) {
            case 'playerMove':
                game.handlePlayerMove(ws, data.position)
                break
            case 'puckHit':
                game.handlePuckHit(data)
                break
        }
    })

    ws.on('close', () => {
        const game = games.get(ws.gameId)
        if (game) {
            // Notify other player about disconnection
            const otherPlayer = game.players.find(p => p !== ws)
            if (otherPlayer && otherPlayer.readyState === 1) {
                otherPlayer.send(JSON.stringify({type: 'playerDisconnected'}))
            }

            // Clean up game
            clearInterval(game.gameInterval)
            games.delete(ws.gameId)
        }
    })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
