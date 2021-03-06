"strict mode";
/*
	Scene, active player, time
 */

var SAVE_STATE_RATE = 30		// Save state twice every second
var SAVE_STATE_COUNT = 600  // A timeline of 5 min
var FASTWAVE_SPEED = 3
var FASTWAVE_SPACING = 120  // About a minute between each fastwave
var TARGET_FRAMERATE = 60
var START_DELAY = 5000      // A 5 second delay to start the game

function Game(numplayers, playerid, network, sendmess) {
	// The initial state that will populate the entire timeline at game start
	var initialState = {
		players: [],
		jumptimers: [],
	}

	// Initialize timing things
	this.deltatime = null
	this.realtime = performance.now()
	this.startDelayLeft = START_DELAY

	var map = new Lobby()
	this.timeline = new Timeline(SAVE_STATE_COUNT, SAVE_STATE_RATE, initialState)
	this.ticker = new Ticker()
	this.graphics = new Graphics(playerid)
	this.timemap = new Timemap()
	this.input = new Input(playerid)

	// Set up initial events and stuff on the timeline
	var startTime = this.timeline.calcJumpTarget(SAVE_STATE_COUNT * SAVE_STATE_RATE / 2)
	for (var id = 0; id < numplayers; id++)
		this.timeline.ensurePlayerAt(startTime, new Player(id, -1))
	// It is now safe to create timewaves, they will have an updated state

	// Create fast waves
	for (var time = 0; time < SAVE_STATE_COUNT * SAVE_STATE_RATE; time += FASTWAVE_SPACING * SAVE_STATE_RATE) {
		this.timeline.createTimewave(time, FASTWAVE_SPEED, false, true)
	}

	// Create the playerwave
	var playerwave = this.timeline.createTimewave(startTime, 1, true, false)

	// Set up ticker controlled array and create timewaves for other players
	for (var id = 0; id < numplayers; id++) {
		this.ticker.controlled.push({
			id: id,
			version: 0,
			timewave: id === playerid ? playerwave : this.timeline.createTimewave(startTime, 1, true, false)
		})
	}

	// Connect everything
	this.timeline.connect(this.timemap, this.ticker, sendmess)
	this.ticker.connect(map.collision, this.timeline, sendmess)
	this.timemap.connect(this.timeline)
	this.graphics.connect(map, playerwave)
	this.input.connect(this.timeline, playerwave, sendmess)
	network.connect(this.timeline, this.ticker.controlled.map(function(pInfo) { return pInfo.timewave }))
	sendmess.connect(playerwave)

	// Register receivers with sendmess
	sendmess.register(this.graphics)
	sendmess.register(this.timemap)
	sendmess.register(this.input)
	sendmess.register(network)

	network.sendPing()
}

/*
	World and client specific event here, put player handling in player.js.
*/

Game.prototype.update = function(ctx, width, height) {
	var temptime = performance.now()
	this.deltatime += temptime - this.realtime
	var deltatime = temptime - this.realtime
	this.realtime = temptime

	if (this.startDelayLeft > 0) {
		this.startDelayLeft -= this.deltatime
		this.deltatime = 0
		if (this.startDelayLeft < 0)
			this.deltatime = -this.startDelayLeft
		return
	}

	this.advanceTime()

	this.graphics.update(deltatime)
	this.timemap.render(ctx, width, height)
}

Game.prototype.adjustTimer = function(adjustment) {
	this.startDelayLeft += adjustment
}

Game.prototype.advanceTime = function() {
	while (this.deltatime >= 1000/TARGET_FRAMERATE) {	// Catch up
		this.timeline.tick()
		this.input.tick()
		this.deltatime -= 1000/TARGET_FRAMERATE
	}
}
