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
			growth: +attrs.growth,
			color: +attrs.color,
			knowledge: {
				nodes: {}
			},
			fleets: []
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
		//var count = this.pop_fraction(src, fraction);
		if (src.player != player || src.population < count) {
			return null;
		}
		var total_time = FleetEngine.travel_time(src, dst);
		var fleet = {
			player: player,
			src: src,
			dst: dst,
			count: +count,
			total_time: +total_time,
			time_left: +total_time
		};
		src.population -= count;
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
		for (var i = 0; i < this.fleets.length; ++i) {
			var fleet = this.fleets[i];
			fleet.time_left -= 1;
			if (fleet.time_left < 1) {
				arrived.push(fleet);
			} else {
				in_flight.push(fleet);
			}
		}
		this.fleets = in_flight;

		// process arrived fleets (TODO deterministic order)
		for (var i = 0; i < arrived.length; ++i) {
			var fleet = arrived[i];
			this.listener.fevFleetArrived(fleet);

			if (fleet.player == fleet.dst.player) {
				fleet.dst.population += fleet.count;
			} else {
				var winner = undefined, loser = undefined;
				var attacker = fleet.count * fleet.src.attack;
				var defender = fleet.dst.population * fleet.dst.defence;
				// capture if attacking force is greater
				if (attacker > defender) {
					winner = fleet.player;
					loser = fleet.dst.player;
					fleet.dst.population = (attacker - defender) / fleet.src.attack;
					fleet.dst.player = fleet.player;
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

				// notify listener
				if (winner == fleet.player) {
					this.listener.fevNodeCaptured(fleet.dst);
				}
			} // if battle
		} // for all arrived fleets
	} // function tick()
} // EXP.FleetEngine

var highlighted;

Stage = function (prevStage) {
	this._pickable = [];
	this._scene = new THREE.Scene();
	this._engine = new EXP.FleetEngine(10, this);
	this._highlight = null;

	this._no_player = this._engine.createPlayer({growth:0.1, color:0x111111});
	this._player = this._engine.createPlayer({growth:1, color:0x00ff00});

	this._ai = [
		this._engine.createPlayer({growth:1, color:0xff00ff*Math.random()}),
		this._engine.createPlayer({growth:1, color:0xff00ff*Math.random()}),
		this._engine.createPlayer({growth:1, color:0xff00ff*Math.random()}),
		this._engine.createPlayer({growth:1, color:0xff00ff*Math.random()})
	];

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
			ambient: 0x030303,
			emissive: 0x101010,
			color: 0xdddddd,
			specular: 0x009900,
			shininess: 30
		});
		var vnode = new THREE.Mesh(geom, mat);
		vnode.game_node = node;
		vnode.position.x = node.pos.x;
		vnode.position.y = node.pos.y;
		vnode.position.z = node.pos.z;
		node.visual_node = vnode;
		this._scene.add(vnode);
		this._pickable.push(vnode);
		return vnode;
	}

	var count = 20;
	var SX = 20;
	var SY = 20;
	var SZ = 0;
	var pw_min = 1, pw_max = 4;
	for (var i = 0; i < count; ++i) {
		var power = Math.random() * (pw_max - pw_min) + pw_min;
		var node = this._engine.createNode({
			name: 'N' + i.toString(),
			player: (i == 0) ? this._player :
				(i-1 < this._ai.length) ? this._ai[i-1] : this._no_player,
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

	for (var i = 0; i < 6; ++i) {
		var light = new THREE.PointLight(Math.random() * 0xffffff, 6, 15);
		light.position.set(
			Math.random() * 2 * SX - SX,
			Math.random() * 2 * SY - SY,
			Math.random() * 2 * SZ - SZ
		);
		this._scene.add(light);
	}

	this.makeVisualFleetLine = function (fleet) {
		var f = 1.0 - (fleet.time_left / fleet.total_time);
		lines.vertices.push(
			new THREE.Vector3(
				fleet.src.x + (fleet.dst.x-fleet.src.x) * f,
				fleet.src.y + (fleet.dst.y-fleet.src.y) * f,
				fleet.src.z + (fleet.dst.z-fleet.src.z) * f
			),
			new THREE.Vector3(fleet.dst.x, fleet.dst.y, fleet.dst.z)
		);
		var fleetlines = new THREE.Line(lines, player.material, THREE.LinePieces);
		return line;
	}

	this.makePreviewLine = function (node, pos) {
	}

	this.update = function (time) {
		var ticks_cap = 30;
		while (time > this._next_tick) {
			this._engine.tick();
			this._next_tick += this._next_tick_delta;
			if (--ticks_cap == 0) {
				this._next_tick = time + this._next_tick_delta;
				break;
			}
		}
	}

	this.paint = function (renderer, camera) {
		/*for (var i = 0; i < FleetEngine.nodes.length; ++i) {
			var node = FleetEngine.nodes[i];
			if (node.visual == highlighted) {
				node.visual.material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
			} else {
				node.visual.material = node.player.material;
			}
		}

		var lines = new THREE.Geometry();
		for (var i = 0; i < FleetEngine.fleets.length; ++i) {
			var fleet = FleetEngine.fleets[i];
		}
		var fleetlines = new THREE.Line(lines, player.material, THREE.LinePieces);

		scene.add(fleetlines);
		renderer.render(scene, camera);
		scene.remove(fleetlines);
*/
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

		if (highlighted) {
			for (var i = 0; i < highlighted.length; ++i) {
				var node = highlighted[i];
				node.emissive_cache = node.visual_node.material.emissive.getHex();
				node.visual_node.material.emissive.setHex(0xff9999);
			}
		}

		renderer.render(this._scene, camera);

		if (highlighted) {
			for (var i = 0; i < highlighted.length; ++i) {
				var node = highlighted[i];
				node.visual_node.material.emissive.setHex(node.emissive_cache);
			}
		}
	}

	this._raycaster = new THREE.Raycaster();
	this.pick = function (x, y, camera) {
		var vector = new THREE.Vector3(x, y, camera.near).unproject(camera);
		this._raycaster.set(camera.position, vector.sub(camera.position ).normalize());
		var intersects = this._raycaster.intersectObjects(this._pickable);

		if (intersects.length > 0) {
			return intersects[0].object.game_node;
		}
		return null;
	}
}

var renderer = null;
var camera = null;
var mouse = {x: 0, y: 0};
var source = null;
var stage = null;

function main() {
	renderer = new THREE.WebGLRenderer();
	renderer.setClearColor(0x000000, 0);

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

	stage = new Stage(null);

	onWindowResize();
	paint();
}

function to_screen(e) {
	return {
		x: (e.clientX / window.innerWidth) * 2 - 1,
		y: - (e.clientY / window.innerHeight) * 2 + 1
	};
}

function paint() {
	requestAnimationFrame(update);
	stage.paint(renderer, camera);
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

function onMouseDown(e) {
	e.preventDefault();

	var p = to_screen(e);
	mouse.x = p.x;
	mouse.y = p.y;

	source = stage.pick(p.x, p.y, camera);
	return false;
}

function onMouseUp(e) {
	e.preventDefault();
	var p = to_screen(e);

	object = pick(p.x, p.y);

	if (object && source && source.player == player) {
		stage._engine.sendFleet(player, source, object, source.population / 2);
	}
	source = null;
}

function onMouseMove(e) {
	e.preventDefault();
	var p = to_screen(e);
	var obj = stage.pick(p.x, p.y, camera);
	highlighted = obj ? [obj] : null;
	return false;
}
