"strict mode";

var TIMEWAVE_SNAP = 240 //roughly 4 seconds


/*
	Bookkeeping events, states and waves
 */
function Timeline(stateCount, stateFrequency, initialState) {
	this.metatime = 0
	this.timewaves = []
	this.events = []    // IMPROV Prealocate for performance?
	this.arrivals = []
	this.states = new Array(stateCount)
	for (var i = 0; i < this.states.length; i++)
		this.states[i] = initialState
	this.stateCount = stateCount
	this.stateFrequency = stateFrequency
	this.jumps = []
}

Timeline.prototype.connect = function(timemap, ticker, sendmess) {
	this.timemap = timemap
	this.ticker = ticker
	this.sendmess = sendmess
}

Timeline.prototype.length = function () {
	return this.stateFrequency * this.stateCount
}

Timeline.prototype.createTimewave = function(time, speed, snap, wraparound) {
	var wave = new Timewave(speed, snap, wraparound)
	this.timewaves.push(wave)
	this.jump(time, wave)
	return wave
}

/*
	Move all timewaves according to their speed. Handle wave collision with noopTick's.
 */
Timeline.prototype.tick = function() {
	this.timewaves.forEach(function(wave) {
		wave.ticksDoneThisTick = 0
	})
	for (var ti = 0; ti < this.timewaves.length; ti++) {
		var tickerwave = this.timewaves[ti]
		while (tickerwave.ticksDoneThisTick < tickerwave.speed) {
			tickerwave.tick(this.events[tickerwave.time], this.arrivals[tickerwave.time+1], this.ticker)
			if (tickerwave.time < this.length()) {
				//do noop ticks for all waves that were on the same time and that still have ticks to do
				for (var i = 0; i < this.timewaves.length; i++) {
					var wave = this.timewaves[i]
					if (wave.time === tickerwave.time - 1 && wave.ticksDoneThisTick < wave.speed) {
						wave.noopTick(tickerwave.state)
					}
				}
				this.saveState(tickerwave.time, tickerwave.state)
			} else {
				if (tickerwave.wraparound) {
					this.jump(0, tickerwave)
				}
			}
			this.sendmess.send(-1, "onSmallTickDone")
		}
	}
	this.doPreparedJumps()
	this.sortWaves()
	this.metatime++
}

Timeline.prototype.sortWaves = function() {
	this.timewaves.sort(function(a, b) {
		return a.time - b.time
	})
}

Timeline.prototype.saveState = function(time, state) {
	var index = time / this.stateFrequency
	if (index > this.stateCount || index !== index|0) {
		return
	}

	this.states[index] = deepCopy(state)
}

Timeline.prototype.ensurePlayerAt = function(time, p) {
	var player = deepCopy(p)
	player.version++
	if (!this.arrivals[time])
		this.arrivals[time] = []
	for (var i = 0; i < this.arrivals[time].length; i++) {
		p = this.arrivals[time][i]
		if (p.id !== player.id || p.version !== player.version)
			continue
		this.arrivals[time][i] = player
		return
	}
	console.log("jump "+player.id+":("+(player.version-1)+"->"+player.version+") changed to success")
	this.arrivals[time].push(player)
}

Timeline.prototype.removePlayerAt = function(time, player) {
	if (!this.arrivals[time])
		return
	for (var i = 0; i < this.arrivals[time].length; i++) {
		var p = this.arrivals[time][i]
		if (p.id === player.id && p.version === player.version+1) {
			this.arrivals[time].splice(i, 1)
			console.log("jump "+player.id+":("+player.version+"->"+(player.version+1)+") changed to failure")
			return
		}
	}
}

Timeline.prototype.calcJumpTarget = function(time, metatimeOffset) {
	for (var i = 0; i < this.timewaves.length; i++) {
		var wave = this.timewaves[i]
		if (wave.snap && Math.abs(wave.time - time) < TIMEWAVE_SNAP) {
			return wave.time + metatimeOffset*wave.speed
		}
	}
	return Math.floor(time/this.stateFrequency)*this.stateFrequency
}

Timeline.prototype.prepareJump = function(time, timewave) {
	this.jumps.push({time: time, wave: timewave})
}

Timeline.prototype.doPreparedJumps = function() {
	if (this.jumps.length === 0)
		return
	this.jumps.forEach(function(jump) {
		this.jump(jump.time, jump.wave)
	}, this)
	this.jumps.length = 0
}

Timeline.prototype.jump = function(time, timewave) {
	var i = 0
	while (this.timewaves[i] && this.timewaves[i].time < time)
		i++
	if (this.timewaves[i] && this.timewaves[i].time === time) {
		timewave.state = deepCopy(this.timewaves[i].state)
		timewave.lastjump = {origin: timewave.time, target: time, metatime: this.metatime}
		timewave.time = time
		return timewave.time
	}

	// There was no timewave at the target time, jump to the closest saved state
	var index = Math.floor(time/this.stateFrequency)
	timewave.state = deepCopy(this.states[index])
  if (this.arrivals[time]) {
    timewave.state.players.push.apply(timewave.state.players, deepCopy(this.arrivals[time]))
  }
  timewave.lastjump = {origin: timewave.time, target: index*this.stateFrequency, metatime: this.metatime}
	timewave.time = timewave.lastjump.target
	return timewave.time
}

Timeline.prototype.addEvent = function(event) {
	if(!this.events[event.time])
		this.events[event.time] = []
	this.events[event.time].push(event)
}


/*
	This function assumes that all input-generating waves are
	at either the same point in time or with a distance of at
	least latency, as well as travelling at the same speed.

	Desync: if a timewave with new changes overtakes the point at
	which tempwave is created before the event has arrived over
	the network all timewaves affected by the call to addAndReplayEvent
	will get those changes before they should. This will probably
	rarely make a big change, and sometimes make things change slightly
	before being overtaken by a timewave.

	TODO: enable this function to mass-insert events
	TODO: check if works, have not seen this called
*/
Timeline.prototype.addAndReplayEvents = function(events, timewave) {
	if (this.jumps.length > 0) {
		console.warn("Some jumps were prepared when addAndReplayEvents was entered, they will never happen, WARN YOUR LOCAL TIMEWAVE-SPECIALIST! (or make sure no prepareJump()s happen outside of Ticker.tick())")
	}

	var replaywave = new Replaywave(this, timewave)
	replaywave.replay(events)
}