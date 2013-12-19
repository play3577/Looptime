/*
	Scene, active player, time
 */

function Game() {
	this.timeline = new Timeline(30)		// Save state twice every second
	this.pointerIsLocked = false
	this.time = 0

	this.scene = new THREE.Scene()
	this.map = new Lobby(this.scene)
	this.scene.add(this.map)
	this.playerModels = new THREE.Object3D()	// Object3D of Object3D's (players) of PlayerModels (versions)
	this.scene.add(this.playerModels)

	// Initialize controlled player
	var initialState = {
		players: [new Player(0)]
	}
	this.playerwave = new Timewave(0, 1, initialState)
	this.timeline.timewaves.push(this.playerwave)
	this.controlled = {
		id: 0,
		version: 0
	}
	this.update()		// Create model and camera for first frame
}

Game.prototype.handle = function(event) {
	if(this.pointerIsLocked) {
		this.timeline.addEvent(this.time, new PlayerEvent(event, this.controlled.id, this.controlled.version))
	}
}

Game.prototype.update = function() {
	this.time++
	timeline.tick()

	// Add new players, timeclones and update old players
	this.playerModels.children.forEach(function(players) {
		players.children.forEach(function(model) {
			model.alive = false		// Reset existed-before bookkeeping
		}, this)
	}, this)
	this.playerwave.state.players.forEach(function(player) {
		var versions = this.playerModels.children.filter(function(differentversions) {
			return differentversions.gameid === player.id
		}, this)[0]
		if(!versions) {
			versions = new THREE.Object3D()
			versions.gameid = player.id
			this.playerModels.add(versions)
		}
		var version = versions.children.filter(function(version) {
			return verions.version === player.version
		}, this)
		if(!version) {
			var version = new PlayerModel(player.id, player.version)
			versions.add(version)
		}
		version.update(player)
		version.alive = true		// Model is new or existed before and in state	
	}, this)

	this.playerModels.children.forEach(function(models) {
		models.children.forEach(function(model) {
			if(!model.alive) {
				models.remove(model)		// Remove models that did exist and does not in this state
			}
			if(this.controlled.id === model.id && this.controlled.version === model.version) {
				this.activeplayer = model 	// Switch camera if nessesary
			}
		})
	}, this)
}