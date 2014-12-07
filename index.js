var EXP = EXP || {}

EXP.FleetEngine = function (slowness, listener) {
	this.listener = listener;
	this.fleet_slowness = slowness;
	this.nodes = [];
	this.fleets = [];
	this.players = [];

	this.createPlayer = function (attrs) {
		var player = {
			//this.material = new THREE.MeshBasicMaterial({color: color});
			name: attrs.name,
			growth: +attrs.growth,
			color: +attrs.color,
			knowledge: {
				nodes: {}
			},
			nodes: [], // TODO
			fleets: [] // TODO
		};
		/* TODO existing knowledge */
		this.players.push(player);
		return player;
	}

	this.createNode = function (attr) {
		var node = {
			name: attr.name,
			pos: {
				x: +attr.pos.x,
				y: +attr.pos.y,
				z: +attr.pos.z
			},
			player: attr.player,
			population: 0,
			production: +attr.production,
			attack: +attr.attack,
			defence: +attr.defence,
			toString: function () { return node.name; }
		};
		for (var i = 0; i < this.players.length; ++i) {
			var player = this.players[i];
			if (player == node.player) {
				player.knowledge.nodes[node] = node;
				player.nodes.push(node);
			} else {
				player.knowledge.nodes[node] = {
					name: node.name,
					pos: node.pos,
					player: undefined,
					population: undefined,
					production: undefined,
					attack: undefined,
					defence: undefined
				};
			}
		}
		this.nodes.push(node);
		return node;
	}

	this.travel_time = function(src, dst) {
		var dx = src.pos.x - dst.pos.x, dy = src.pos.y - dst.pos.y, dz = src.pos.z - dst.pos.z;
		return +Math.ceil(Math.sqrt(dx*dx + dy*dy + dz*dz)) * this.fleet_slowness;
	}

	this.sendFleet = function(player, src, dst, count) {
		if (src.player != player || src.population < count) {
			return null;
		}
		//console.log("fleet from ", src.name, " to ", dst.name, " count ", count);
		var total_time = this.travel_time(src, dst);
		var fleet = {
			player: player,
			src: src,
			dst: dst,
			count: +count,
			total_time: +total_time,
			time_left: +total_time
		};
		src.population -= count;
		player.fleets.push(fleet);
		this.fleets.push(fleet);
		return fleet;
	}

	this.tick = function () {
		// grow population
		for (var i = 0; i < this.nodes.length; ++i) {
			var node = this.nodes[i];
			node.population += node.production * node.player.growth;
		}

		// process fleets in flight
		var arrived = [];
		var in_flight = [];
		for (var i = 0; i < this.players.length; ++i) {
			this.players[i].fleets = [];
		}
		for (var i = 0; i < this.fleets.length; ++i) {
			var fleet = this.fleets[i];
			if (--fleet.time_left < 1) {
				arrived.push(fleet);
			} else {
				in_flight.push(fleet);
				fleet.player.fleets.push(fleet);
			}
		}
		this.fleets = in_flight;

		// process arrived fleets (TODO deterministic order)
		for (var i = 0; i < arrived.length; ++i) {
			var fleet = arrived[i];

			var loser = undefined;
			if (fleet.player == fleet.dst.player) {
				fleet.dst.population += fleet.count;
			} else {
				var winner = undefined;
				var attacker = fleet.count * fleet.src.attack;
				var defender = fleet.dst.population * fleet.dst.defence;
				// capture if attacking force is greater
				if (attacker > defender) {
					winner = fleet.player;
					loser = fleet.dst.player;
					fleet.dst.population = (attacker - defender) / fleet.src.attack;
					fleet.dst.player = fleet.player;

					// update player stats
					winner.nodes.push(fleet.dst);
					loser.nodes = loser.nodes.filter(function(a){return a != fleet.dst;});
				} else {
					winner = fleet.player;
					loser = fleet.dst.player;
					fleet.dst.population = (defender - attacker) / fleet.dst.defence;
				}

				// update knowledge
				winner.knowledge.nodes[fleet.dst] = fleet.dst;
				loser.knowledge.nodes[fleet.dst] = {
					name: node.name,
					pos: node.pos,
					player: winner,
					population: fleet.dst.population,
					production: fleet.dst.production,
					attack: fleet.dst.attack,
					defence: fleet.dst.attack
				}

				this.listener.fevFleetArrived(fleet);
				// notification on capture
				if (winner == fleet.player) {
					this.listener.fevNodeCaptured(fleet.dst);
				}
			} // if battle

			// mark player as dead
			if (loser && (loser.nodes.length == 0) && (loser.fleets.length == 0)) {
				loser.dead = true;
				this.listener.fevPlayerDied(loser);
				return;
			}
		} // for all arrived fleets
	} // function tick()
} // EXP.FleetEngine

// very simple AI
AI = function (params) {
	this._engine = params.engine;
	this._player = params.player;
	this._turn_delay = params.turn_delay;
	this._attacking_nodes_count = params.attacking_nodes_count;

	this._turns_left = this._turn_delay;

	this.tick = function () {
		if (this._player.dead) return;

		if (--this._turns_left > 0)
			return;
		this._turns_left = Math.ceil(this._turn_delay * (0.9 + 0.2 * Math.random()));

		// very simple AI:
		// 1. find attacking_nodes_count nodes with max pop
		// 2. find alien node closest to the most populated one
		// 3. send all population from top attacking_nodes_count to that node

		var nodes = this._player.nodes.slice(0, this._player.nodes.length);
		nodes.sort(function(a,b) { return b.population - a.population;});
		nodes = nodes.slice(0, this._attacking_nodes_count);

		if (nodes.length == 0) {
			//console.log("AI ", this, " has no nodes");
			return;
		}

		var dst = null;
		for (var i = 0; i < this._engine.nodes.length; ++i) {
			var node = this._engine.nodes[i];
			if (node.player != this._player && (!dst ||
				this._engine.travel_time(nodes[0],dst) >
				this._engine.travel_time(nodes[0],node)))
			{
				dst = node;
			}
		}

		if (!dst) {
			//console.log("AI ", this, " has nowhere to send fleet to");
			return;
		}

		for (var i = 0; i < nodes.length; ++i) {
			this._engine.sendFleet(this._player, nodes[i], dst, nodes[i].population);
		}
	}
}

var player_colors = [
	0x00ff00,
	0xff00ff,
	0xffff00,
	0x0000ff,
	0x00ffff,
	0x8000ff,
	0xff8000
]

/******************************************************************************/

Stage = function (camera) {
	this._pickable = [];
	this._camera = camera;
	this._scene = new THREE.Scene();
	this._engine = new EXP.FleetEngine(10, this);
	this._highlight = [];

	this._no_player = this._engine.createPlayer({growth:0.1, color:0x111111});
	this._player = this._engine.createPlayer({growth:1, color:0x00ff00});

	this._ai = [];
	for (var i = 0; i < 4; ++i) {
		this._ai.push(new AI({
			engine: this._engine,
			player: this._engine.createPlayer({
				growth: 1,
				color: player_colors[i+1]
      }),
			turn_delay: 100,
			attacking_nodes_count: 1
		}));
	}

	this._ticks_per_second = 20;
	this._next_tick_delta = 1000.0 / this._ticks_per_second;
	this._next_tick = Date.now() + this._next_tick_delta;

	this.pop_fraction = function (node, fract) {
		var fract = Math.max(0, Math.min(1, fract));
		return node.population * fract * fract;
	}

	this.makeVisualNode = function (node) {
		var geom = new THREE.SphereGeometry(node.production * .25);
		var mat = new THREE.MeshPhongMaterial({
			ambient: 0x444444,
			emissive: 0x101010,
			color: 0xdddddd,
			specular: 0xffffff,
			shininess: 100
		});
		var vnode = new THREE.Mesh(geom, mat);
		vnode.game_node = node;
		vnode.position.set(node.pos.x, node.pos.y, node.pos.z);
    node.visual_node = vnode;
		this._scene.add(vnode);
		this._pickable.push(vnode);
		return vnode;
	}

	var count = 40;
	var SX = 20;
	var SY = 20;
	var SZ = 2;
	var pw_min = 1, pw_max = 4;
	for (var i = 0; i < count; ++i) {
		var power = Math.random() * (pw_max - pw_min) + pw_min;
		var node = this._engine.createNode({
			name: 'N' + i.toString(),
			player: (i == 0) ? this._player :
				(i-1 < this._ai.length) ? this._ai[i-1]._player : this._no_player,
			pos: {
				x: Math.random() * 2 * SX - SX,
				y: Math.random() * 2 * SY - SY,
				z: Math.random() * 2 * SZ - SZ,
			},
			production: power,
			attack: 1 / power + Math.random(),
			defence: 1 + power / 2 + Math.random()
		});

		this.makeVisualNode(node);
	}

	/*for (var i = 0; i < 6; ++i) {
		var light = new THREE.PointLight(Math.random() * 0xffffff, 3, 15);
		light.position.set(
			Math.random() * 2 * SX - SX,
			Math.random() * 2 * SY - SY,
			Math.random() * 2 * SZ - SZ
		);
		this._scene.add(light);
	}*/

	var light = new THREE.DirectionalLight(0xffffff, 0.25);
	light.position.set(1, 1, 1);
	this._scene.add(light);

	this.makeVisualFleet = function (fleet) {
		var f = 1.0 - (fleet.time_left / fleet.total_time);
		var lines = new THREE.Geometry();
		lines.vertices.push(
			new THREE.Vector3(
				fleet.src.pos.x + (fleet.dst.pos.x-fleet.src.pos.x) * f,
				fleet.src.pos.y + (fleet.dst.pos.y-fleet.src.pos.y) * f,
				fleet.src.pos.z + (fleet.dst.pos.z-fleet.src.pos.z) * f
			),
			new THREE.Vector3(fleet.dst.pos.x, fleet.dst.pos.y, fleet.dst.pos.z)
		);
		var fleetlines = new THREE.Line(lines, new THREE.MeshBasicMaterial({color : fleet.player.color}), THREE.LinePieces);
		return fleetlines;
	}

	this.update = function (time) {
		var ticks_cap = 30;
		while (time > this._next_tick) {
			for (var i = 0; i < this._ai.length; ++i) {
				this._ai[i].tick();
			}
			this._engine.tick();
			this._next_tick += this._next_tick_delta;
			if (--ticks_cap == 0) {
				this._next_tick = time + this._next_tick_delta;
				break;
			}
		}
	}

	this.paint = function (renderer) {

		var fleetobjs = new THREE.Scene();
		for (var i = 0; i < this._engine.fleets.length; ++i) {
			fleetobjs.add(this.makeVisualFleet(this._engine.fleets[i]));
		}

		renderer.render(fleetobjs, this._camera);

		/*for (var n in this._player.knowledge.nodes) {
			var node = this._player.knowledge.nodes[n];
			if (node.player) {
				node.visual_node.material.emissive.setHex(node.player.color);
			}
		}*/

		for (var i = 0; i < this._engine.nodes.length; ++i) {
			var node = this._engine.nodes[i];
			node.visual_node.material.emissive.setHex(node.player.color);
		}

		for (var i = 0; i < this._highlight.length; ++i) {
			var node = this._highlight[i];
			node.emissive_cache = node.visual_node.material.emissive.getHex();
			node.visual_node.material.emissive.setHex(0xff9999);
		}

		if (this._arrow) {
			this._scene.add(this._arrow);
		}

		renderer.render(this._scene, this._camera);

		if (this._arrow) {
			this._scene.remove(this._arrow);
		}

		if (this._highlight) {
			for (var i = 0; i < this._highlight.length; ++i) {
				var node = this._highlight[i];
				node.visual_node.material.emissive.setHex(node.emissive_cache);
			}
		}
	}

	this.hlClear = function () {
		this._highlight = [];
	}

	this.hlAdd = function (node) {
		this._highlight.push(node);
	}

	this._raycaster = new THREE.Raycaster();
	this.pick = function (x, y) {
		var vector = new THREE.Vector3(x, y, this._camera.near).unproject(this._camera);
		this._raycaster.set(this._camera.position, vector.sub(this._camera.position).normalize());
		var intersects = this._raycaster.intersectObjects(this._pickable);

		if (intersects.length > 0) {
			return intersects[0].object.game_node;
		}
		return null;
	}

	this.showArrow = function (src, x, y) {
		if (!src) {
			this._arrow = null;
			return;
		}

		var g = new THREE.Geometry();
		g.vertices.push(
			new THREE.Vector3(src.pos.x, src.pos.y, src.pos.z),
			new THREE.Vector3(x, y, this._camera.near).unproject(this._camera)
		);
		this._arrow = new THREE.Line(g, new THREE.MeshBasicMaterial({color : src.player.color}), THREE.LinePieces);
	}

	this.fevFleetArrived = function (fleet) {
		//console.log("fleet arrived", fleet);
	}

	this.fevNodeCaptured = function (node) {
		//console.log("node captured", node);
	}

	this.fevPlayerDied = function (player) {
		console.log("Player ", player, " has died");
	}
}

/******************************************************************************/

StageLocal = function (camera) {
	this._camera = camera;
	this._pickable = [];
	this._scene = new THREE.Scene();
	this._engine = new EXP.FleetEngine(1, this);
	this._highlight = [];

	this._ticks_per_second = 20;
	this._next_tick_delta = 1000.0 / this._ticks_per_second;
	this._next_tick = Date.now() + this._next_tick_delta;

	this._no_player = this._engine.createPlayer({growth:0.1, color:0x111111});
	this._player = this._engine.createPlayer({growth:1, color:0x00ff00});

	this._ai = [];
	for (var i = 0; i < 4; ++i) {
		this._ai.push(new AI({
			engine: this._engine,
			player: this._engine.createPlayer({
				growth: 0.5,
				color: player_colors[i+1]
			}),
			turn_delay: 100,
			attacking_nodes_count: 1
		}));
	}

	this.generate = function () {
		var count = 5;
		var SX = 100;
		var SY = 100;
		var SZ = 0;
		var pw_min = 1, pw_max = 4;
		for (var y = 0; y <= count; ++y) {
			for (var x = 0; x <= count; ++x) {
				var cx = -SX + 2*x*(SX/count);
				var cy = -SY + 2*y*(SY/count);

				var power = Math.random() * (pw_max - pw_min) + pw_min;
				var player = this._no_player;

				if (x == 0     && y == 0)     player = this._ai[0]._player; else
				if (x == count && y == 0)     player = this._ai[1]._player; else
				if (x == count && y == count) player = this._ai[2]._player; else
				if (x == 0     && y == count) player = this._ai[3]._player; else
				if (x == Math.floor(count/2)&& y == Math.floor(count/2)) player = this._player;

				if (player != this._no_player)
					power = (pw_max + pw_min) / 2;

				var node = this._engine.createNode({
					name: 'N' + i.toString(),
					player: player,
					pos: {
						x: cx + Math.random() * (SX*2/count),
						z: cy + Math.random() * (SY*2/count),
						y: 5,
					},
					production: power,
					attack: 1 / power + Math.random(),
					defence: 1 + power / 2 + Math.random()
				});

				this.makeVisualNode(node);
			} // for x
		} // for y
	} // StageLocal.generate

	this.makeVisualNode = function (node) {
		var rc = Math.random() * 0.2 - 0.1;
		var color = new THREE.Color(
			0.5 + Math.random() * 0.2 - 0.1,
			0.5 + Math.random() * 0.2 - 0.1,
			0.5 + Math.random() * 0.2 - 0.1
		);
		var geom = new THREE.BoxGeometry(
			5 + 3*Math.random(),
			5 + 3*Math.random(),
			5 + 3*Math.random()
		);
		//var mat = new THREE.MeshLambertMaterial({color: color.getHex()});
		var mat = new THREE.MeshBasicMaterial({color: color.getHex()});
		var vnode = new THREE.Mesh(geom, mat);
		vnode.game_node = node;
		vnode.position.set(node.pos.x, node.pos.y, node.pos.z);
		vnode.rotation.set(0, Math.random() * 3.1415926, 0);
		node.visual_node = vnode;
		this._scene.add(vnode);
		this._pickable.push(vnode);
		return vnode;
	} // StageLocal.makeVisualNode

	this.generate();

	var light = new THREE.DirectionalLight(0xffffff, 0.25);
	light.position.set(1, 1, 1);
	this._scene.add(light);

	camera.far = 10000;
	camera.updateProjectionMatrix();
	camera.position.set(-80, 100, 320);
	camera.lookAt(new THREE.Vector3(0, 0, 0));

		this.update = function (time) {
		var ticks_cap = 30;
		while (time > this._next_tick) {
			for (var i = 0; i < this._ai.length; ++i) {
				this._ai[i].tick();
			}
			this._engine.tick();
			this._next_tick += this._next_tick_delta;
			if (--ticks_cap == 0) {
				this._next_tick = time + this._next_tick_delta;
				break;
			}
		}
	} // StageLocal.update

	this.makeVisualFleet = function (fleet) {
		var f = 1.0 - (fleet.time_left / fleet.total_time);
		var lines = new THREE.Geometry();
		lines.vertices.push(
			new THREE.Vector3(
				fleet.src.pos.x + (fleet.dst.pos.x-fleet.src.pos.x) * f,
				fleet.src.pos.y + (fleet.dst.pos.y-fleet.src.pos.y) * f,
				fleet.src.pos.z + (fleet.dst.pos.z-fleet.src.pos.z) * f
			),
			new THREE.Vector3(fleet.dst.pos.x, fleet.dst.pos.y, fleet.dst.pos.z)
		);
		var fleetlines = new THREE.Line(lines, new THREE.MeshBasicMaterial({color : fleet.player.color}), THREE.LinePieces);
		return fleetlines;
	} // StageLocal.makeVisualFleet

	this.paint = function (renderer) {
		var fleetobjs = new THREE.Scene();
		for (var i = 0; i < this._engine.fleets.length; ++i) {
			fleetobjs.add(this.makeVisualFleet(this._engine.fleets[i]));
		}

		renderer.render(fleetobjs, this._camera);

		/*for (var n in this._player.knowledge.nodes) {
			var node = this._player.knowledge.nodes[n];
			if (node.player) {
				node.visual_node.material.emissive.setHex(node.player.color);
			}
		}*/

		for (var i = 0; i < this._engine.nodes.length; ++i) {
			var node = this._engine.nodes[i];
			node.visual_node.material.color.setHex(node.player.color);
		}

		for (var i = 0; i < this._highlight.length; ++i) {
			var node = this._highlight[i];
			node.emissive_cache = node.visual_node.material.color.getHex();
			node.visual_node.material.color.setHex(0xff9999);
		}

		if (this._arrow) {
			this._scene.add(this._arrow);
		}

		renderer.render(this._scene, this._camera);

		if (this._arrow) {
			this._scene.remove(this._arrow);
		}

		if (this._highlight) {
			for (var i = 0; i < this._highlight.length; ++i) {
				var node = this._highlight[i];
				node.visual_node.material.color.setHex(node.emissive_cache);
			}
		}
	} // StageLocal.paint

	this.hlClear = function () { this._highlight = []; }
	this.hlAdd = function (node) { this._highlight.push(node); }

	this._raycaster = new THREE.Raycaster();
	this.pick = function (x, y) {
		var vector = new THREE.Vector3(x, y, this._camera.near).unproject(this._camera);
		this._raycaster.set(this._camera.position, vector.sub(this._camera.position).normalize());
		var intersects = this._raycaster.intersectObjects(this._pickable);

		if (intersects.length > 0) {
			return intersects[0].object.game_node;
		}
		return null;
	} // StageLocal.pick


	this.showArrow = function (src, x, y) {
		if (!src) {
			this._arrow = null;
			return;
		}

		var g = new THREE.Geometry();
		g.vertices.push(
			new THREE.Vector3(src.pos.x, src.pos.y, src.pos.z),
			new THREE.Vector3(x, y, this._camera.near).unproject(this._camera)
		);
		this._arrow = new THREE.Line(g, new THREE.MeshBasicMaterial({color : src.player.color}), THREE.LinePieces);
	} // StageLocal.showArrow

	this.fevFleetArrived = function (fleet) {
		//console.log("fleet arrived", fleet);
	}

	this.fevNodeCaptured = function (node) {
		//console.log("node captured", node);
	}

	this.fevPlayerDied = function (player) {
		console.log("Player ", player, " has died");
	}
} // StageLocal

var renderer = null;
var camera = null;
var mouse = {x: 0, y: 0};
var source = null;
var stage = null;

var tool = null;

ToolIdleHover = function () {
	this.onMouseDown = function (x, y, e) {
		var node = stage.pick(x, y);
		if (node && node.player == stage._player) {
			tool = new ToolSelectDestination(node);
		} else {
			tool = new ToolRotate(x, y);
		}
	}

	this.onMouseMove = function (x, y, e) {
		stage.hlClear();
		var node = stage.pick(x, y);
		if (node) {
			stage.hlAdd(node);
			// TODO web gui
		}
	}

	this.onMouseUp = function (x, y, e) {
	}
}

ToolRotate = function (x, y) {
	this._x = x;
	this._y = y;

	this.onMouseDown = function (x, y, e) {
		console.error("Impossible");
	}

	this.onMouseMove = function (x, y, e) {
		var dx = x - this._x;
		var dy = y - this._y;

		//console.log(dx, dy);

		this._x = x;
		this._y = y;
	}

	this.onMouseUp = function (x, y, e) {
		tool = new ToolIdleHover();
	}
}

ToolSelectDestination = function (node) {
	this._node = node;

	this.valid = function () {
		if (this._node.player != stage._player) {
			tool = new ToolIdleHover();
			// todo web ui
			return false;
		}
		return true;
	}

	this.onMouseDown = function (x, y, e) {
		stage.showArrow(null, x, y);
		tool = new ToolIdleHover();
	}

	this.onMouseMove = function (x, y, e) {
		stage.hlClear();
		if (!this.valid()) {
			return;
		}

		var node = stage.pick(x, y);
		if (node) {
			stage.hlAdd(node);
			// TODO web gui
		}

		stage.hlAdd(this._node);
		stage.showArrow(this._node, x, y);
	}

	this.onMouseUp = function (x, y, e) {
		if (!this.valid()) {
			return;
		}

		var dst = stage.pick(x, y);

		if (dst) {
			tool = new ToolSelectAmount(this._node, dst);
		} else {
			tool = new ToolIdleHover();
		}
	}
}

ToolSelectAmount = function (src, dst) {
	this._src = src;
	this._dst = dst;

	this.onMouseDown = function (x, y, e) {
	}

	this.onMouseMove = function (x, y, e) {
		// todo update web ui
	}

	this.onMouseUp = function (x, y, e) {
		if (this._src.player == stage._player) {
			stage._engine.sendFleet(stage._player, this._src, this._dst, this._src.population / 2);
		}
		stage.showArrow(null, x, y);
		tool = new ToolIdleHover();
	}
}

function to_screen(e) {
	return {
		x: (e.clientX / window.innerWidth) * 2 - 1,
		y: - (e.clientY / window.innerHeight) * 2 + 1
	};
}

function onMouseDown(e) {
	e.preventDefault();
	var p = to_screen(e);
	if (tool) {
		tool.onMouseDown(p.x, p.y, e);
	}
	return false;
}

function onMouseUp(e) {
	e.preventDefault();
	var p = to_screen(e);
	if (tool) {
		tool.onMouseUp(p.x, p.y, e);
	}
	return false;
}

function onMouseMove(e) {
	e.preventDefault();
	var p = to_screen(e);
	if (tool) {
		tool.onMouseMove(p.x, p.y, e);
	}
	return false;
}

function paint() {
	requestAnimationFrame(update);
	renderer.clear();
	stage.paint(renderer);
}

function update() {
	var time = Date.now();
	stage.update(time);
	paint();
}

function onWindowResize() {
	renderer.setSize(window.innerWidth, window.innerHeight);
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}

function main() {
	renderer = new THREE.WebGLRenderer();
	renderer.setClearColor(0x000000, 0);
	renderer.autoClear = false;

	var container = document.getElementById('game');
	container.addEventListener('mousedown', onMouseDown, false);
	container.addEventListener('mouseup', onMouseUp, false);
	container.addEventListener('mousemove', onMouseMove, false);
	container.addEventListener('contextmenu', function(e){e.preventDefault(); return false;}, false);
	window.addEventListener('resize', onWindowResize, false);
	container.innerHTML = '';
	container.appendChild(renderer.domElement);

	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1.0, 100.0);
	camera.position.z = 50;
	camera.lookAt( new THREE.Vector3(0,0,0) );

  //stage = new Stage(camera);
	stage = new StageLocal(camera);
	tool = new ToolIdleHover();

	onWindowResize();
	paint();
}

