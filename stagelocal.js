StageLocal = function (camera) {
	this._camera = camera;
	this._pickable = [];
	this._scene = new THREE.Scene();
	this._engine = new EXP.FleetEngine(1, this);
	this._highlight = [];

	this._ticks_per_second = 20;
	this._next_tick_delta = 1000.0 / this._ticks_per_second;
	this._next_tick = Date.now() + this._next_tick_delta;

	this._no_player = this._engine.createPlayer({growth:0.1, color:0x808080});
	this._player = this._engine.createPlayer({growth:1, color:0x00ff00});

  this._rotation = 0;

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
						x: cx + Math.random() * 1.6*(SX/count),
						z: cy + Math.random() * 1.67*(SY/count),
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
			5 + node.production,
			5 + 3*Math.random()
		);
		var mat = new THREE.MeshLambertMaterial({color: color.getHex()});
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

	this._sun = new THREE.DirectionalLight(0xffffff, 0.75);
	this._sun.position.set(1, 1, 1);
	this._scene.add(this._sun);

	this._camera.far = 10000;
	this._camera.updateProjectionMatrix();
	this._camera.position.set(-80, 180, 220);
	this._camera.lookAt(new THREE.Vector3(0, 0, 0));

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

  this.rotate = function (dx, dy) {
    this._rotation += dx;

    this._camera.position.set(Math.cos(this._rotation)*300, 180, 300*Math.sin(this._rotation));
    this._camera.lookAt(new THREE.Vector3(0, 0, 0));
  }
} // StageLocal
