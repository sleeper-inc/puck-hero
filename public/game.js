class PuckHeroOnline {
    constructor() {
        this.canvas = document.getElementById('gameCanvas')
        this.ctx = this.canvas.getContext('2d')
        this.scoreBoard = document.getElementById('scoreBoard')
        this.statusText = document.getElementById('statusText')

        // Game state
        this.state = {
            score: {player1: 0, player2: 0},
            gameStarted: false,
            playerNumber: null
        }

        // Connect to server
        this.connectToServer()

        // Set up game objects with default positions
        this.setupGame()

        // Start game loop
        requestAnimationFrame(this.gameLoop.bind(this))

        // Set up controls
        this.setupControls()
    }

    connectToServer() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws'
        this.socket = new WebSocket(`${protocol}://${window.location.host}`)

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data)

            switch (data.type) {
                case 'waiting':
                    this.statusText.textContent = 'Waiting for opponent...'
                    break
                case 'start':
                    this.statusText.textContent = 'Game Started!'
                    this.state.gameStarted = true
                    this.state.playerNumber = data.player
                    break
                case 'gameState':
                    this.updateGameState(data.state)
                    break
                case 'playerDisconnected':
                    this.statusText.textContent = 'Opponent disconnected!'
                    this.state.gameStarted = false
                    break
            }
        }

        this.socket.onclose = () => {
            this.statusText.textContent = 'Disconnected from server'
            this.state.gameStarted = false
        }
    }

    setupGame() {
        this.tableWidth = this.canvas.width
        this.tableHeight = this.canvas.height

        // Define goal areas
        this.goalArea = {
            width: 8,
            height: 120,
            y: (this.tableHeight / 2) - 60
        }

        this.gameState = {
            puck: {
                x: this.tableWidth / 2,
                y: this.tableHeight / 2,
                velocityX: 0,
                velocityY: 0
            },
            player1: {
                x: 100,
                y: this.tableHeight / 2,
            },
            player2: {
                x: this.tableWidth - 100,
                y: this.tableHeight / 2,
            }
        }
    }

    setupControls() {
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.state.gameStarted) return

            const rect = this.canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            // Send positions to server
            this.socket.send(JSON.stringify({
                type: 'playerMove',
                position: {x, y}
            }))
        })

        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.state.gameStarted) return

            // Calculate hit vector based on puck position
            const rect = this.canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            const y = e.clientY - rect.top

            const dx = this.gameState.puck.x - x
            const dy = this.gameState.puck.y - y
            const distance = Math.sqrt(dx * dx + dy * dy)

            if (distance < 50) { // Only hit if close to the puck
                const velocityX = (dx / distance) * 10
                const velocityY = (dy / distance) * 10

                this.socket.send(JSON.stringify({
                    type: 'puckHit',
                    velocityX,
                    velocityY,
                }))
            }
        })
    }

    updateGameState(newState) {
        console.log("New game state received:", newState);
        this.gameState = newState
        this.updateScore()
    }

    updateScore() {
        this.scoreBoard.textContent =
            `Player 1: ${this.state.score.player1} - Player 2: ${this.state.score.player2}`
    }

    gameLoop() {
        this.updatePuckPosition()
        this.render()
        requestAnimationFrame(this.gameLoop.bind(this))
    }

    updatePuckPosition() {
        let puck = this.gameState.puck

        puck.x += puck.velocityX
        puck.y += puck.velocityY

        // Apply friction
        puck.velocityX *= 0.98
        puck.velocityY *= 0.98

        // Bounce off top && bottom walls
        if (puck.y - 10 <= 0 || puck.y + 10 >= this.tableHeight) {
            puck.velocityY *= -1
            puck.y = Math.max(10, Math.min(this.tableHeight - 10, puck.y))
        }

        // Bounce off left & right walls (unless it's a goal)
        if (puck.x - 10 <= 0 || puck.x + 10 >= this.tableWidth) {
            if (!this.isGoalScored(puck.x, puck.y)) {
                puck.velocityX *= -1
                puck.x = Math.max(10, Math.min(this.tableWidth - 10, puck.x))
            }
        }
    }

    isGoalScored(x, y) {
        if (
            (
                x - 10 <= this.goalArea.width &&
                y >= this.goalArea.y &&
                y <= this.goalArea.y + this.goalArea.height
            ) ||
            (
                x + 10 >= this.tableWidth - this.goalArea.width &&
                y >= this.goalArea.y &&
                y <= this.goalArea.y + this.goalArea.height
            )
        ) {
            this.handleGoal(x)
            return true
        }
        return false
    }

    handleGoal(x) {
        if (x < this.tableWidth / 2) {
            this.state.score.player2++
        } else {
            this.state.score.player1++
        }
        this.resetPuck()
        this.updateScore()
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#333'
        this.ctx.fillRect(
            0,
            0,
            this.tableWidth,
            this.tableHeight
        )

        // Draw goal areas
        this.ctx.fillStyle = '#ffffff'
        this.ctx.fillRect( // Left goal
            0,
            this.goalArea.y,
            this.goalArea.width,
            this.goalArea.height
        )
        this.ctx.fillRect( // Right goal
            this.tableWidth - this.goalArea.width,
            this.goalArea.y,
            this.goalArea.width,
            this.goalArea.height
        )

        // Draw center line
        this.ctx.strokeStyle = '#0e8c09'
        this.ctx.beginPath()
        this.ctx.moveTo(this.tableWidth / 2, 0)
        this.ctx.lineTo(this.tableWidth / 2, this.tableHeight)
        this.ctx.stroke()

        // Draw puck
        this.ctx.fillStyle = '#ffffff'
        this.drawCircle(this.gameState.puck, 10)

        this.updateScore()

        // Debug log before drawing
        console.log("Rendering players at:", this.gameState.player1, this.gameState.player2);

        // Draw players 1
        this.ctx.fillStyle = '#ed3e3e'
        this.drawCircle(this.gameState.player1, 30)

        // Draw players 2
        this.ctx.fillStyle = '#3a3af4'
        this.drawCircle(this.gameState.player2, 30)
    }

    drawCircle(object, radius) {
        this.ctx.beginPath()
        this.ctx.arc(object.x, object.y, radius, 0, Math.PI * 2)
        this.ctx.fill()
    }

    resetPuck() {
        this.gameState.puck.x = this.tableWidth / 2
        this.gameState.puck.y = this.tableHeight / 2
        this.gameState.puck.velocityX = (Math.random() > 0.5 ? 1 : -1) * 3;
        this.gameState.puck.velocityY = (Math.random() > 0.5 ? 1 : -1) * 3;
    }
}
