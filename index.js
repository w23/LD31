var EXP = {}

var FleetEngine = {
	nodes: [],
	fleets: [],
	players: []
};

FleetEngine.Player = function (color) {
	this.material = new THREE.MeshBasicMaterial({color: color});
	this.visible_nodes = {};
	FleetEngine.players.push(this);
}

var no_player = new FleetEngine.Player(0x808080);
var player = new FleetEngine.Player(0x00ff00);

FleetEngine.travel_time = function(src, dst) {
	var dx = src.x - dst.x, dy = src.y - dst.y, dz = src.z - dst.z;
	return +Math.ceil(Math.sqrt(dx*dx + dy*dy + dz*dz)) * 10;
}

FleetEngine.pop_fraction = function (node, fract) {
	var fract = Math.max(0, Math.min(1, fract));
	return node.population * fract * fract;
}

FleetEngine.add_fleet = function(player, src, dst, fraction) {
	var count = this.pop_fraction(src, fraction);
	if (src.player != player || src.population < count) {
		return false;
	}
	var fleet = {
		player: player,
		src: src,
		dst: dst,
		count: count,
		time_left: FleetEngine.travel_time(src, dst)
	};
	this.fleets.push(fleet);
	console.log("fleet", fleet);
	return true;
}

FleetEngine.tick = function () {
	for (var i = 0; i < this.nodes.length; ++i) {
		var node = this.nodes[i];
		node.population += node.production * ((node.player == no_player) ? 0.1 : 1);
		node.player.visible_nodes[node.name].population = node.population;
	}

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

	for (var i = 0; i < arrived.length; ++i) {
		var fleet = arrived[i];
		console.log("arrived", fleet, fleet.dst);
		var deltapop = 0;
		if (fleet.player == fleet.dst.player) {
			deltapop = fleet.count;
		} else {
			var attacker = fleet.count * fleet.src.attack;
			var defender = fleet.dst.population * fleet.dst.defence;
			deltapop = defender - attacker;
			console.log(attacker, defender, deltapop);
			if (deltapop < 0) {
				deltapop = - Math.floor(deltapop / fleet.src.attack) + 1;
				fleet.dst.player = fleet.player;
			} else {
				deltapop = 1 + Math.floor(deltapop / fleet.dst.defence) - fleet.dst.population;
			}
		}
		fleet.dst.population += deltapop;
		player.visible_nodes[fleet.dst.name].population = fleet.dst.population;
	}
}

function generate() {
	var count = 100;
	var SX = 20;
	var SY = 20;
	var SZ = 0;
	var pw_min = 1, pw_max = 4;
	for (var i = 0; i < count; ++i) {
		var power = Math.random() * (pw_max - pw_min) + pw_min;
		var node = {
			name: 'N' + i.toString(),
			player: (i == 0) ? player : no_player,
			x: Math.random() * 2 * SX - SX,
			y: Math.random() * 2 * SY - SY,
			z: Math.random() * 2 * SZ - SZ,
			population: 1,
			production: power,
			attack: 1 / power + Math.random(),
			defence: 1 + power / 2 + Math.random()
		};
		FleetEngine.nodes.push(node);
	}
}

var renderer = null;
var camera = null;
var scene = null;
var raycaster = null;

function generate_visual() {
	for (var i = 0; i < FleetEngine.nodes.length; ++i) {
		var node = FleetEngine.nodes[i];
		//var geom = new THREE.SphereGeometry(0.5);
		var geom = new THREE.BoxGeometry(1, 1, 1);
		var mat = node.player.material;
		var vnode = new THREE.Mesh(geom, mat);
		vnode.game_node = node;
		vnode.position.x = node.x;
		vnode.position.y = node.y;
		vnode.position.z = node.z;
		node.visual = vnode;
		scene.add(vnode);

		for (var j = 0; j < FleetEngine.players.length; ++j) {
			var player = FleetEngine.players[j];
			player.visible_nodes[node.name] = {node: node};
		}
	}
}

var raycaster = null;
var mouse = {x: 0, y: 0};
var selected = null;
var next_tick = undefined;
var ticks_per_second = 20;
var next_tick_delta = 1000.0 / ticks_per_second;

function main() {
	renderer = new THREE.WebGLRenderer();
	renderer.setClearColor(0x0f0f0f, 0);
	//renderer.autoClear = true;

	var container = document.getElementById('game');
	container.addEventListener('mousedown', onMouseDown, false);
	//container.addEventListener('mouseup', onMouseUp, false);
	container.addEventListener('mousemove', onMouseMove, false);
	container.addEventListener('contextmenu', function(e){e.preventDefault(); return false;}, false);
	window.addEventListener('resize', onWindowResize, false);
	container.innerHTML = '';
	container.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1.0, 100.0);
	camera.position.z = 50;
	camera.lookAt( new THREE.Vector3(0,0,0) );
	raycaster = new THREE.Raycaster();

	generate();

	generate_visual();

	onWindowResize();
	paint();

	next_tick = Date.now() + next_tick_delta;
}

function pick () {
	var x = (mouse.x / window.innerWidth) * 2 - 1;
	var y = - (mouse.y / window.innerHeight) * 2 + 1;

	var vector = new THREE.Vector3(x, y, camera.near).unproject(camera);
	raycaster.set(camera.position, vector.sub(camera.position ).normalize());
	var intersects = raycaster.intersectObjects(scene.children);

	if (intersects.length > 0) {
		return intersects[0].object;
	}
	return null;
}

var highlighted = null;

function paint() {
	requestAnimationFrame(update);

	for (var i = 0; i < FleetEngine.nodes.length; ++i) {
		var node = FleetEngine.nodes[i];
		if (node.visual == highlighted) {
			node.visual.material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
		} else {
			node.visual.material = node.player.material;
		}
	}

	renderer.render(scene, camera);
}

function update() {
	var time = Date.now();
	//console.log(time);
	var ticks_cap = 30;
	while (time > next_tick) {
		FleetEngine.tick();
		next_tick += next_tick_delta;
		if (--ticks_cap == 0) {
			next_tick = time + next_tick_delta;
			break;
		}
	}

	if (ticks_cap < 30) {
		if (highlighted) {
			console.log(highlighted.game_node);
		}
	}

	paint();
}

function onWindowResize() {
	renderer.setSize(window.innerWidth, window.innerHeight);
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
}

function onMouseDown(e) {
	e.preventDefault();
	mouse.x = e.clientX;
	mouse.y = e.clientY;

	object = pick();

	console.log("pick", object.game_node);

	if (!object) {
		selected = undefined;
	}

	if (selected && selected.game_node.player == player) {
		FleetEngine.add_fleet(player, selected.game_node, object.game_node, 0.5);
		selected = undefined;
	} else {
		selected = object;
	}

	return false;
}

function onMouseMove(e) {
	e.preventDefault();
	mouse.x = e.clientX;
	mouse.y = e.clientY;

	highlighted = pick();
	return false;
}
