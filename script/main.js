"use strict";

function clamp(v, min, max) {
	return Math.max(min, Math.min(max, v));
}

function dist2(ax, ay, bx, by) {
	var dx = ax - bx;
	var dy = ay - by;
	return dx * dx + dy * dy;
}

function angleDiffDeg(a, b) {
	return ((a - b + 540) % 360) - 180;
}

function pointInSector(px, py, facingAngle, radius, sectorAngle, tx, ty) {
	var dx = tx - px;
	var dy = ty - py;
	var d2 = dx * dx + dy * dy;
	if (d2 > radius * radius) return false;
	var targetAngle = Math.atan2(dy, dx) * 180 / Math.PI;
	return Math.abs(angleDiffDeg(targetAngle, facingAngle)) <= sectorAngle / 2;
}

function rectIntersectsSector(px, py, facingAngle, radius, sectorAngle, rx, ry, rw, rh) {
	var points = [
		{ x: rx, y: ry },
		{ x: rx + rw / 2, y: ry },
		{ x: rx + rw, y: ry },
		{ x: rx, y: ry + rh / 2 },
		{ x: rx + rw / 2, y: ry + rh / 2 },
		{ x: rx + rw, y: ry + rh / 2 },
		{ x: rx, y: ry + rh },
		{ x: rx + rw / 2, y: ry + rh },
		{ x: rx + rw, y: ry + rh },
		{ x: clamp(px, rx, rx + rw), y: clamp(py, ry, ry + rh) }
	];
	for (var i = 0; i < points.length; i++) {
		if (pointInSector(px, py, facingAngle, radius, sectorAngle, points[i].x, points[i].y)) return true;
	}
	return false;
}

function createRangeSectorSurface(radius, sectorAngle, color, alpha) {
	var size = radius * 2;
	var s = g.game.resourceFactory.createSurface(size, size);
	var r = s.renderer();
	var center = radius;
	var halfAngle = (sectorAngle / 2) * Math.PI / 180;
	r.begin();
	r.fillStyle = color;
	r.globalAlpha = alpha;
	for (var y = 0; y < size; y++) {
		for (var x = 0; x < size; x++) {
			var dx = x - center;
			var dy = y - center;
			var d2 = dx * dx + dy * dy;
			if (d2 > radius * radius) continue;
			var ang = Math.atan2(dy, dx);
			if (ang >= -halfAngle && ang <= halfAngle) r.fillRect(x, y, 1, 1);
		}
	}
	r.end();
	return s;
}

module.exports.main = function main() {
	var scene = new g.Scene({ game: g.game, assetIds: ["player_animation1", "player_animation2", "player_animation3", "chinpira_chara", "yakisoba_pan", "wood_sword", "sunglass", "kousya_ura", "bgm_game", "se_punch", "se_kick", "se_damage", "se_change", "se_win", "se_lose", "se_item"] });

	scene.onLoad.add(function () {
		var W = g.game.width;
		var H = g.game.height;
		var font = new g.DynamicFont({ game: g.game, size: 28, fontFamily: "sans-serif" });
		var smallFont = new g.DynamicFont({ game: g.game, size: 20, fontFamily: "sans-serif" });
		var playerImage = scene.asset.getImageById("player_animation1");
		var playerItemImage = scene.asset.getImageById("player_animation2");
		var playerStrongImage = scene.asset.getImageById("player_animation3");
		var enemyImage = scene.asset.getImageById("chinpira_chara");
		var sounds = {
			bgmGame: scene.asset.getAudioById("bgm_game"),
			punch: scene.asset.getAudioById("se_punch"),
			kick: scene.asset.getAudioById("se_kick"),
			damage: scene.asset.getAudioById("se_damage"),
			change: scene.asset.getAudioById("se_change"),
			item: scene.asset.getAudioById("se_item"),
			win: scene.asset.getAudioById("se_win"),
			lose: scene.asset.getAudioById("se_lose")
		};
		var itemImages = {
			pan: scene.asset.getImageById("yakisoba_pan"),
			woodSword: scene.asset.getImageById("wood_sword"),
			sunglass: scene.asset.getImageById("sunglass")
		};
		var bgImage = scene.asset.getImageById("kousya_ura");

		var state = "title";
		var score = 0;
		var killCount = 0;
		var itemCount = 0;
		var clear = false;
		var playUpdateHandler = null;

		var root = new g.E({ scene: scene });
		scene.append(root);

		function clearRoot() {
			root.children && root.children.slice().forEach(function (c) { c.destroy(); });
		}

		function makeButton(text, x, y, w, h, onPush) {
			var e = new g.FilledRect({ scene: scene, x: x, y: y, width: w, height: h, cssColor: "#333", touchable: true });
			var l = new g.Label({ scene: scene, x: x + 16, y: y + 10, text: text, font: font, fontSize: 28, textColor: "white" });
			e.onPointDown.add(function () { onPush(); });
			root.append(e);
			root.append(l);
		}

		var titleFrames = g.game.fps * 15;
		var gameFramesMax = g.game.fps * 100;
		var remainingGameFrames = gameFramesMax;
		var bossKillCount = 0;
		var provisionalScore = 0;
		var provisionalKillCount = 0;
		var provisionalBossKillCount = 0;
		var runStartProvisionalScore = 0;
		var titleUpdateHandler = null;
		var resultUpdateHandler = null;
		var bgmPlayer = null;
		g.game.vars.gameState = { score: 0 };

		function playSound(audioAsset) {
			if (!audioAsset) return null;
			return audioAsset.play();
		}

		function stopBgm() {
			if (bgmPlayer) {
				bgmPlayer.stop();
				bgmPlayer = null;
			}
		}

		function setScore(value) {
			score = value;
		}

		function publishScore(value) {
			g.game.vars.gameState.score = value;
		}

		function addScore(value) {
			setScore(score + value);
		}

		function clearHandlers() {
			stopBgm();
			if (playUpdateHandler) {
				scene.onUpdate.remove(playUpdateHandler);
				playUpdateHandler = null;
			}
			if (titleUpdateHandler) {
				scene.onUpdate.remove(titleUpdateHandler);
				titleUpdateHandler = null;
			}
			if (resultUpdateHandler) {
				scene.onUpdate.remove(resultUpdateHandler);
				resultUpdateHandler = null;
			}
		}

		function randomValue(min, max) {
			return min + g.game.random.generate() * (max - min);
		}

		function randomStagePoint(width, height) {
			return {
				x: Math.round(randomValue(60, W - width - 60)),
				y: Math.round(randomValue(120, H - height - 80))
			};
		}

		function randomEdgeSpawn(width, height) {
			var edge = Math.floor(g.game.random.generate() * 4);
			if (edge === 0) return { x: -width, y: Math.round(randomValue(80, H - height - 40)) };
			if (edge === 1) return { x: W, y: Math.round(randomValue(80, H - height - 40)) };
			if (edge === 2) return { x: Math.round(randomValue(0, W - width)), y: 60 - height };
			return { x: Math.round(randomValue(0, W - width)), y: H - 40 };
		}

		function showTitle() {
			clearHandlers();
			state = "title";
			clearRoot();
			var countdownFrames = titleFrames;
			root.append(new g.FilledRect({ scene: scene, x: 0, y: 0, width: W, height: H, cssColor: "#1a1a2e" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 36, text: "不良学園！校舎裏の戦い", font: font, fontSize: 48, textColor: "#ffd166" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 120, text: "ルール", font: font, fontSize: 34, textColor: "#80ed99" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 170, text: "迫りくるチンピラ・番長共をぶっ倒せ！", font: smallFont, fontSize: 24, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 205, text: "画面ドラッグで移動。敵を射程内に入れてタップすると通常攻撃。", font: smallFont, fontSize: 24, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 240, text: "射程内で敵を0.5秒長押しすると強攻撃。長押し中は主人公の下にゲージが出る。", font: smallFont, fontSize: 24, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 275, text: "強攻撃は通常攻撃の3倍ダメージで、撃破時スコアが2倍。", font: smallFont, fontSize: 24, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 310, text: "アイテムは射程内に入るだけで取得。", font: smallFont, fontSize: 24, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 345, text: "焼きそばパンでHP35回復、木刀で攻撃力20%UP、サングラスで射程角度15度UP。", font: smallFont, fontSize: 24, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 380, text: "チンピラ掃討→番長戦→超乱戦を100秒で戦い抜け。HPが0になっても再挑戦できる。", font: smallFont, fontSize: 24, textColor: "white" }));
			var countdownLabel = new g.Label({ scene: scene, x: 40, y: 490, text: "開始まで: 15", font: font, fontSize: 34, textColor: "#ffd166" });
			root.append(countdownLabel);
			titleUpdateHandler = function () {
				if (state !== "title") return;
				countdownFrames--;
				var sec = Math.ceil(countdownFrames / g.game.fps);
				countdownLabel.text = "開始まで: " + Math.max(0, sec);
				countdownLabel.invalidate();
				if (countdownFrames <= 0) {
					scene.onUpdate.remove(titleUpdateHandler);
					titleUpdateHandler = null;
					startGame(true);
				}
			};
			scene.onUpdate.add(titleUpdateHandler);
		}

		function startGame(resetTimer) {
			clearHandlers();
			state = "play";
			if (resetTimer) remainingGameFrames = gameFramesMax;
			setScore(0);
			killCount = 0;
			itemCount = 0;
			bossKillCount = 0;
			if (resetTimer) {
				provisionalScore = 0;
				provisionalKillCount = 0;
				provisionalBossKillCount = 0;
				publishScore(0);
			}
			runStartProvisionalScore = provisionalScore;
			clear = false;
			clearRoot();

			var bg = new g.Sprite({ scene: scene, src: bgImage, x: 0, y: 0, width: W, height: H, srcWidth: bgImage.width, srcHeight: bgImage.height, touchable: true });
			root.append(bg);
			bgmPlayer = playSound(sounds.bgmGame);

			var uiHp = new g.Label({ scene: scene, x: 20, y: 10, text: "HP: 100", font: font, fontSize: 28, textColor: "white" });
			var uiScore = new g.Label({ scene: scene, x: 220, y: 10, text: "SCORE: " + score, font: font, fontSize: 28, textColor: "white" });
			var uiProvisional = new g.Label({ scene: scene, x: 220, y: 42, text: "暫定: " + provisionalScore, font: smallFont, fontSize: 22, textColor: "#ffd166" });
			var uiProg = new g.Label({ scene: scene, x: 480, y: 10, text: "進行: チンピラ掃討", font: font, fontSize: 28, textColor: "white" });
			var uiTime = new g.Label({ scene: scene, x: 1020, y: 10, text: "TIME: " + Math.ceil(remainingGameFrames / g.game.fps), font: font, fontSize: 28, textColor: "#ffd166" });
			var uiGuide = new g.Label({ scene: scene, x: 20, y: H - 34, text: "タップして攻撃 / 長押しで強攻撃 / アイテムで強化", font: smallFont, fontSize: 22, textColor: "#ffd166" });
			root.append(uiHp);
			root.append(uiScore);
			root.append(uiProvisional);
			root.append(uiProg);
			root.append(uiTime);
			root.append(uiGuide);

			function refreshScoreLabels() {
				if (score > provisionalScore) {
					provisionalScore = score;
					provisionalKillCount = killCount;
					provisionalBossKillCount = bossKillCount;
					publishScore(provisionalScore);
				}
				uiScore.text = "SCORE: " + score;
				uiScore.invalidate();
				uiProvisional.text = "暫定: " + provisionalScore;
				uiProvisional.invalidate();
			}

			refreshScoreLabels();

			var animDefs = {
				move: [
					{ x: 335, y: 50, w: 164, h: 235 },
					{ x: 554, y: 51, w: 148, h: 234 },
					{ x: 752, y: 50, w: 152, h: 235 },
					{ x: 963, y: 51, w: 156, h: 234 },
					{ x: 1184, y: 49, w: 157, h: 236 }
				],
				attack: [
					{ x: 328, y: 331, w: 159, h: 212 },
					{ x: 536, y: 333, w: 163, h: 210 },
					{ x: 743, y: 335, w: 188, h: 208 },
					{ x: 962, y: 333, w: 178, h: 210 },
					{ x: 1175, y: 333, w: 158, h: 210 }
				],
				damage: [
					{ x: 322, y: 577, w: 168, h: 189 },
					{ x: 527, y: 588, w: 177, h: 177 },
					{ x: 728, y: 597, w: 176, h: 168 },
					{ x: 943, y: 592, w: 182, h: 171 },
					{ x: 1157, y: 601, w: 192, h: 158 }
				],
				itemPan: [
					{ x: 328, y: 822, w: 164, h: 148 },
					{ x: 522, y: 828, w: 164, h: 143 },
					{ x: 719, y: 823, w: 158, h: 149 },
					{ x: 937, y: 804, w: 130, h: 179 },
					{ x: 1136, y: 806, w: 131, h: 178 },
					{ x: 1339, y: 798, w: 147, h: 186 }
				],
				itemWoodSword: [
					{ x: 34, y: 154, w: 250, h: 312 },
					{ x: 290, y: 191, w: 238, h: 271 },
					{ x: 539, y: 199, w: 217, h: 261 },
					{ x: 797, y: 162, w: 221, h: 300 },
					{ x: 1049, y: 154, w: 207, h: 312 },
					{ x: 1254, y: 154, w: 264, h: 312 }
				],
				itemSunglass: [
					{ x: 34, y: 640, w: 267, h: 317 },
					{ x: 295, y: 675, w: 239, h: 273 },
					{ x: 552, y: 677, w: 241, h: 253 },
					{ x: 810, y: 643, w: 196, h: 297 },
					{ x: 1048, y: 642, w: 200, h: 302 },
					{ x: 1265, y: 640, w: 245, h: 302 }
				],
				strongAttack: [
					{ x: 40, y: 326, w: 210, h: 284 },
					{ x: 260, y: 326, w: 240, h: 284 },
					{ x: 540, y: 326, w: 210, h: 284 },
					{ x: 780, y: 326, w: 230, h: 284 },
					{ x: 1020, y: 326, w: 260, h: 284 },
					{ x: 1280, y: 326, w: 200, h: 284 }
				]
			};

			var enemyFrames = {
				mob1: { x: 55, y: 87, w: 180, h: 305 },
				mob2: { x: 285, y: 87, w: 195, h: 305 },
				mob3: { x: 530, y: 100, w: 195, h: 295 },
				boss: { x: 775, y: 100, w: 195, h: 295 }
			};

			var player = {
				hit: new g.FilledRect({ scene: scene, x: W / 2 - 64, y: H / 2 - 64, width: 128, height: 128, cssColor: "rgba(80,160,255,0.18)" }),
				e: new g.Sprite({ scene: scene, src: playerImage, x: W / 2, y: H / 2, width: 128, height: 128, srcX: 335, srcY: 50, srcWidth: 164, srcHeight: 235, anchorX: 0.5, anchorY: 0.5 }),
				itemE: new g.Sprite({ scene: scene, src: playerItemImage, x: W / 2, y: H / 2, width: 128, height: 128, srcX: 34, srcY: 151, srcWidth: 250, srcHeight: 307, anchorX: 0.5, anchorY: 0.5 }),
				strongE: new g.Sprite({ scene: scene, src: playerStrongImage, x: W / 2, y: H / 2 - 16, width: 96, height: 136, srcX: 40, srcY: 326, srcWidth: 210, srcHeight: 284, anchorX: 0.5, anchorY: 0.5 }),
				hp: 100,
				maxHp: 100,
				range: 128,
				rangeAngle: 45,
				facingAngle: 0,
				cooldown: 0,
				strongLock: 0,
				baseAttackPower: 10,
				attackPower: 10,
				woodSwordCount: 0,
				sunglassCount: 0,
				animType: "move",
				animFrame: 0,
				animTick: 0,
				animInterval: 3,
				animLoop: true,
				animRemain: 0,
				faceRight: true,
				vx: 0,
				vy: 0,
				targetDx: 0,
				targetDy: 0,
				dragTargetX: W / 2,
				dragTargetY: H / 2,
				dragging: false,
				pointerId: null
			};
			root.append(player.hit);

			var rangeSurface = createRangeSectorSurface(player.range, player.rangeAngle, "#90e0ef", 0.06);
			var rangeSprite = new g.Sprite({ scene: scene, src: rangeSurface, x: player.hit.x + 64, y: player.hit.y + 64, width: player.range * 2, height: player.range * 2, srcWidth: player.range * 2, srcHeight: player.range * 2, angle: 0, anchorX: 0.5, anchorY: 0.5 });
			rangeSprite.opacity = 0.9;
			root.append(rangeSprite);
			root.append(player.e);
			player.itemE.hide();
			root.append(player.itemE);
			player.strongE.hide();
			root.append(player.strongE);
			var effectLabel = new g.Label({ scene: scene, x: player.hit.x, y: player.hit.y - 28, text: "", font: smallFont, fontSize: 24, textColor: "#ffe066" });
			effectLabel.hide();
			root.append(effectLabel);

			var holdGaugeBg = new g.FilledRect({ scene: scene, x: player.hit.x + 14, y: player.hit.y + player.hit.height + 12, width: 100, height: 10, cssColor: "rgba(0,0,0,0.6)" });
			var holdGaugeBar = new g.FilledRect({ scene: scene, x: player.hit.x + 16, y: player.hit.y + player.hit.height + 14, width: 0, height: 6, cssColor: "#ffd166" });
			holdGaugeBg.hide();
			holdGaugeBar.hide();
			root.append(holdGaugeBg);
			root.append(holdGaugeBar);

			function refreshRangeSprite() {
				rangeSurface = createRangeSectorSurface(player.range, player.rangeAngle, "#90e0ef", 0.06);
				rangeSprite.src = rangeSurface;
				rangeSprite.srcWidth = player.range * 2;
				rangeSprite.srcHeight = player.range * 2;
				rangeSprite.invalidate();
				rangeSprite.modified();
			}

			function syncPlayerSpritePos() {
				player.e.x = player.hit.x + 64;
				player.e.y = player.hit.y + 64;
				player.e.modified();
				player.itemE.x = player.hit.x + 64;
				player.itemE.y = player.hit.y + 64;
				player.itemE.modified();
				player.strongE.x = player.hit.x + 64;
				player.strongE.y = player.hit.y + 48;
				player.strongE.modified();
				holdGaugeBg.x = player.hit.x + 14;
				holdGaugeBg.y = player.hit.y + player.hit.height + 12;
				holdGaugeBg.modified();
				holdGaugeBar.x = player.hit.x + 16;
				holdGaugeBar.y = player.hit.y + player.hit.height + 14;
				holdGaugeBar.modified();
				effectLabel.x = player.hit.x - 10;
				effectLabel.y = player.hit.y - 26;
				effectLabel.modified();
			}

			function getAnimInterval(type) {
				if (type === "attack") return 4;
				if (type === "strongAttack") return 4;
				if (type === "damage") return 4;
				if (type.indexOf("item") === 0) return 4;
				return 6;
			}

			function getFrameInterval(type, frame) {
				if (type === "strongAttack" && (frame === 3 || frame === 4)) return 8;
				return getAnimInterval(type);
			}

			function setPlayerAnim(type, loop, durationTick) {
				player.animType = type;
				player.animFrame = 0;
				player.animTick = 0;
				player.animInterval = getAnimInterval(type);
				player.animLoop = loop;
				player.animRemain = durationTick || 0;
				updatePlayerFrame();
			}

			function updatePlayerFrame() {
				var frames = animDefs[player.animType];
				var f = frames[player.animFrame];
				var activeSprite = player.e;
				if (player.animType === "itemWoodSword" || player.animType === "itemSunglass") activeSprite = player.itemE;
				if (player.animType === "strongAttack") activeSprite = player.strongE;
				[player.e, player.itemE, player.strongE].forEach(function (sprite) {
					if (sprite !== activeSprite && sprite.visible()) sprite.hide();
				});
				if (!activeSprite.visible()) activeSprite.show();
				activeSprite.srcX = f.x;
				activeSprite.srcY = f.y;
				activeSprite.srcWidth = f.w;
				activeSprite.srcHeight = f.h;
				var baseScale = 1;
				activeSprite.scaleX = player.faceRight ? baseScale : -baseScale;
				activeSprite.scaleY = baseScale;
				activeSprite.modified();
			}
			updatePlayerFrame();

			var enemies = [];
			var longPressFrames = Math.floor(g.game.fps * 0.5);
			var strongCooldownFrames = 0;
			var activePress = null;
			var currentStage = 1;
			var stage3EnemySpawn = g.game.fps * 2;
			var stage3ItemSpawn = g.game.fps * 3;
			var stage3EnemyTimer = stage3EnemySpawn;
			var stage3ItemTimer = stage3ItemSpawn;

			function showEffect(text, color) {
				effectLabel.text = text;
				effectLabel.textColor = color || "#ffe066";
				effectLabel.invalidate();
				effectLabel.show();
				scene.setTimeout(function () {
					if (!effectLabel.destroyed()) effectLabel.hide();
				}, 900);
			}

			function updateAttackPower() {
				player.attackPower = player.baseAttackPower * (1 + 0.2 * player.woodSwordCount);
			}

			function clearActivePress() {
				activePress = null;
				holdGaugeBar.width = 0;
				if (holdGaugeBg.visible()) holdGaugeBg.hide();
				if (holdGaugeBar.visible()) holdGaugeBar.hide();
				holdGaugeBg.modified();
				holdGaugeBar.modified();
			}

			function beginEnemyPress(enemy, pointerId) {
				if (state !== "play" || player.cooldown > 0 || player.strongLock > 0) return;
				if (!inRange(enemy)) return;
				updatePlayerAim(enemy.hit.x + enemy.hit.width / 2, enemy.hit.y + enemy.hit.height / 2);
				activePress = { enemy: enemy, pointerId: pointerId, startAge: g.game.age };
				holdGaugeBar.width = 0;
				if (!holdGaugeBg.visible()) holdGaugeBg.show();
				if (!holdGaugeBar.visible()) holdGaugeBar.show();
				holdGaugeBg.modified();
				holdGaugeBar.modified();
			}

			function endEnemyPress(enemy, pointerId) {
				if (!activePress) return;
				if (activePress.pointerId !== pointerId || activePress.enemy !== enemy) return;
				var heldFrames = g.game.age - activePress.startAge;
				clearActivePress();
				if (heldFrames >= longPressFrames) {
					attackEnemy(enemy, true);
					return;
				}
				if (inRange(enemy)) attackEnemy(enemy, false);
			}

			function spawnEnemy(x, y, hp, isBoss, frameKey) {
				var frame = enemyFrames[frameKey];
				var hit = new g.FilledRect({ scene: scene, x: x, y: y, width: 128, height: 128, cssColor: "rgba(255,120,80,0.18)", touchable: true });
				var e = new g.Sprite({ scene: scene, src: enemyImage, x: x + 64, y: y + 64, width: 128, height: 128, srcX: frame.x, srcY: frame.y, srcWidth: frame.w, srcHeight: frame.h, anchorX: 0.5, anchorY: 0.5, touchable: true });
				var hpBg = new g.FilledRect({ scene: scene, x: x, y: y - 10, width: 128, height: 5, cssColor: "#333" });
				var hpBar = new g.FilledRect({ scene: scene, x: x, y: y - 10, width: 128, height: 5, cssColor: "#80ed99" });
				var dangerLabel = isBoss ? new g.Label({ scene: scene, x: x + 22, y: y - 38, text: "強敵", font: smallFont, fontSize: 24, textColor: "#ff6b6b" }) : null;
				var obj = { hit: hit, e: e, hpBg: hpBg, hpBar: hpBar, dangerLabel: dangerLabel, hp: hp, maxHp: hp, isBoss: isBoss, atkCd: 0, faceRight: false };
				function onEnemyPointDown(ev) {
					beginEnemyPress(obj, ev.pointerId);
				}
				function onEnemyPointUp(ev) {
					endEnemyPress(obj, ev.pointerId);
				}
				hit.onPointDown.add(onEnemyPointDown);
				e.onPointDown.add(onEnemyPointDown);
				hit.onPointUp.add(onEnemyPointUp);
				e.onPointUp.add(onEnemyPointUp);
				root.append(hit);
				root.append(e);
				root.append(hpBg);
				root.append(hpBar);
				if (dangerLabel) root.append(dangerLabel);
				enemies.push(obj);
				return obj;
			}
			var items = [];
			function removeAllItems() {
				items.forEach(function (it) {
					if (!it.e.destroyed()) it.e.hide();
				});
				items = [];
			}

			function spawnItem(x, y, itemType) {
				var itemImage = itemImages[itemType];
				var e = new g.Sprite({ scene: scene, src: itemImage, x: x, y: y, width: 64, height: 64, srcWidth: itemImage.width, srcHeight: itemImage.height, touchable: true });
				var it = { e: e, used: false, type: itemType, collect: null };
				function collectItem() {
					if (state !== "play" || it.used) return false;
					if (!inRangeItem(it)) return false;
					it.used = true;
					itemCount++;
					e.hide();
					playSound(sounds.item);
					addScore(50);
					if (it.type === "pan") {
						player.hp = clamp(player.hp + 35, 0, player.maxHp);
						setPlayerAnim("itemPan", false, 24);
						showEffect("HP+35", "#80ed99");
					} else if (it.type === "woodSword") {
						player.woodSwordCount++;
						updateAttackPower();
						setPlayerAnim("itemWoodSword", false, 24);
						showEffect("攻撃力20%UP", "#ffd166");
					} else if (it.type === "sunglass") {
						player.sunglassCount++;
						player.rangeAngle += 15;
						refreshRangeSprite();
						setPlayerAnim("itemSunglass", false, 24);
						showEffect("射程角度15度UP", "#90e0ef");
					}
					uiHp.text = "HP: " + player.hp; uiHp.invalidate();
					refreshScoreLabels();
					return true;
				}
				it.collect = collectItem;
				e.onPointDown.add(function () {
					collectItem();
				});
				root.append(e);
				items.push(it);
			}

			function spawnRandomItem(itemType) {
				var pos = randomStagePoint(64, 64);
				spawnItem(pos.x, pos.y, itemType);
			}

			function spawnStage1() {
				currentStage = 1;
				uiProg.text = "進行: チンピラ掃討"; uiProg.invalidate();
				playSound(sounds.change);
				var p1 = randomEdgeSpawn(128, 128);
				var p2 = randomEdgeSpawn(128, 128);
				var p3 = randomEdgeSpawn(128, 128);
				spawnEnemy(p1.x, p1.y, 30, false, "mob1");
				spawnEnemy(p2.x, p2.y, 30, false, "mob2");
				spawnEnemy(p3.x, p3.y, 30, false, "mob3");
				spawnRandomItem("pan");
			}

			function spawnStage2() {
				currentStage = 2;
				uiProg.text = "進行: 番長戦"; uiProg.invalidate();
				playSound(sounds.change);
				var bossPos = randomEdgeSpawn(128, 128);
				spawnEnemy(bossPos.x, bossPos.y, 120, true, "boss");
				var m1 = randomEdgeSpawn(128, 128);
				var m2 = randomEdgeSpawn(128, 128);
				spawnEnemy(m1.x, m1.y, 30, false, "mob1");
				spawnEnemy(m2.x, m2.y, 30, false, "mob2");
				spawnRandomItem("sunglass");
				spawnRandomItem("woodSword");
				spawnRandomItem("pan");
			}

			function startStage3() {
				currentStage = 3;
				uiProg.text = "進行: 超乱戦！とにかく倒せ！"; uiProg.invalidate();
				playSound(sounds.change);
				stage3EnemyTimer = stage3EnemySpawn;
				stage3ItemTimer = stage3ItemSpawn;
			}

			function resetPlayerState() {
				player.hp = player.maxHp;
				player.rangeAngle = 45;
				player.attackPower = player.baseAttackPower;
				player.woodSwordCount = 0;
				player.sunglassCount = 0;
				player.cooldown = 0;
				player.strongLock = 0;
				player.hit.x = W / 2 - player.hit.width / 2;
				player.hit.y = H / 2 - player.hit.height / 2;
				player.vx = 0;
				player.vy = 0;
				player.pointerId = null;
				player.dragging = false;
				player.targetDx = 0;
				player.targetDy = 0;
				player.dragTargetX = player.hit.x + player.hit.width / 2;
				player.dragTargetY = player.hit.y + player.hit.height / 2;
				player.facingAngle = 0;
				player.faceRight = true;
				player.animType = "move";
				player.animFrame = 0;
				player.animTick = 0;
				player.animInterval = getAnimInterval("move");
				player.animLoop = true;
				player.animRemain = 0;
				refreshRangeSprite();
				updatePlayerFrame();
				player.hit.modified();
				syncPlayerSpritePos();
			}

			function showRetryResult() {
				clearHandlers();
				state = "retry";
				if (score > provisionalScore) {
					provisionalScore = score;
					provisionalKillCount = killCount;
					provisionalBossKillCount = bossKillCount;
					publishScore(provisionalScore);
				}
				playSound(sounds.lose);
				clearRoot();
				root.append(new g.FilledRect({ scene: scene, x: 0, y: 0, width: W, height: H, cssColor: "#111" }));
				root.append(new g.Label({ scene: scene, x: 40, y: 60, text: "超ボコられた・・・次はやりかえしてやるよ！", font: font, fontSize: 42, textColor: "#ff6b6b" }));
				var retryTimeLabel = new g.Label({ scene: scene, x: 980, y: 60, text: "TIME: " + Math.max(0, Math.ceil(remainingGameFrames / g.game.fps)), font: font, fontSize: 32, textColor: "#ffd166" });
				root.append(new g.Label({ scene: scene, x: 40, y: 150, text: "暫定スコア: " + provisionalScore, font: font, fontSize: 34, textColor: "white" }));
				root.append(new g.Label({ scene: scene, x: 40, y: 200, text: "撃破数: " + provisionalKillCount, font: font, fontSize: 30, textColor: "white" }));
				root.append(new g.Label({ scene: scene, x: 40, y: 245, text: "番長撃破数: " + provisionalBossKillCount, font: font, fontSize: 30, textColor: "white" }));
				root.append(new g.Label({ scene: scene, x: 40, y: 295, text: "再挑戦するとスコアは0に戻るが、暫定スコアは保持される。", font: smallFont, fontSize: 24, textColor: "white" }));
				root.append(new g.Label({ scene: scene, x: 40, y: 330, text: "次の挑戦で上回れば暫定スコアも更新される。", font: smallFont, fontSize: 24, textColor: "white" }));
				root.append(retryTimeLabel);
				makeButton("再挑戦", 40, 390, 180, 60, function () {
					startGame(false);
				});
				resultUpdateHandler = function () {
					if (state !== "retry") return;
					remainingGameFrames--;
					retryTimeLabel.text = "TIME: " + Math.max(0, Math.ceil(remainingGameFrames / g.game.fps));
					retryTimeLabel.invalidate();
					if (remainingGameFrames <= 0) {
						finishGame();
					}
				};
				scene.onUpdate.add(resultUpdateHandler);
			}

			function updatePlayerAim(targetX, targetY) {
				var px = player.hit.x + player.hit.width / 2;
				var py = player.hit.y + player.hit.height / 2;
				player.dragTargetX = targetX;
				player.dragTargetY = targetY;
				player.targetDx = targetX - px;
				player.targetDy = targetY - py;
				if (player.targetDx !== 0 || player.targetDy !== 0) {
					player.facingAngle = Math.atan2(player.targetDy, player.targetDx) * 180 / Math.PI;
					player.faceRight = player.targetDx >= 0;
				}
			}

			bg.onPointDown.add(function (ev) {
				if (state !== "play") return;
				if (player.pointerId !== null) return;
				player.pointerId = ev.pointerId;
				player.dragging = true;
				updatePlayerAim(ev.point.x, ev.point.y);
			});
			bg.onPointMove.add(function (ev) {
				if (state !== "play") return;
				if (player.strongLock > 0) return;
				if (player.pointerId !== ev.pointerId) return;
				player.dragging = true;
				updatePlayerAim(player.dragTargetX + ev.prevDelta.x, player.dragTargetY + ev.prevDelta.y);
			});
			bg.onPointUp.add(function (ev) {
				if (state !== "play") return;
				if (player.pointerId !== ev.pointerId) return;
				player.pointerId = null;
				player.dragging = false;
				player.targetDx = 0;
				player.targetDy = 0;
			});

			function inRange(enemy) {
				var px = player.hit.x + 64;
				var py = player.hit.y + 64;
				return rectIntersectsSector(px, py, player.facingAngle, player.range, player.rangeAngle, enemy.hit.x, enemy.hit.y, enemy.hit.width, enemy.hit.height);
			}

			function inRangeItem(item) {
				var px = player.hit.x + 64;
				var py = player.hit.y + 64;
				var ix = item.e.x + item.e.width / 2;
				var iy = item.e.y + item.e.height / 2;
				return pointInSector(px, py, player.facingAngle, player.range, player.rangeAngle, ix, iy);
			}

			function attackEnemy(enemy, strong) {
				if (player.cooldown > 0 || player.strongLock > 0) return false;
				var dmg = strong ? Math.round(player.attackPower * 3) : Math.round(player.attackPower);
				player.cooldown = strong ? strongCooldownFrames : 5;
				player.strongLock = strong ? strongCooldownFrames : 0;
				setPlayerAnim(strong ? "strongAttack" : "attack", false, strong ? 24 : 14);
				playSound(strong ? sounds.kick : sounds.punch);
				enemy.hp -= dmg;
				enemy.hit.cssColor = "rgba(255,255,255,0.28)";
				enemy.hit.modified();
				scene.setTimeout(function () {
					if (!enemy.hit.destroyed()) {
						enemy.hit.cssColor = "rgba(255,120,80,0.18)";
						enemy.hit.modified();
					}
				}, 80);
				enemy.hit.x += Math.cos(player.facingAngle * Math.PI / 180) * (strong ? 18 : 8);
				enemy.hit.y += Math.sin(player.facingAngle * Math.PI / 180) * (strong ? 18 : 8);
				enemy.hit.x = clamp(enemy.hit.x, 0, W - enemy.hit.width);
				enemy.hit.y = clamp(enemy.hit.y, 60, H - 60 - enemy.hit.height);
				enemy.hit.modified();
				enemy.e.x = enemy.hit.x + 64;
				enemy.e.y = enemy.hit.y + 64;
				enemy.e.modified();
				if (enemy.hp <= 0) {
					if (activePress && activePress.enemy === enemy) clearActivePress();
					enemy.hit.hide(); enemy.e.hide(); enemy.hpBg.hide(); enemy.hpBar.hide();
					if (enemy.dangerLabel) enemy.dangerLabel.hide();
					killCount++;
					if (enemy.isBoss) bossKillCount++;
					var baseScore = enemy.isBoss ? 1000 : 120;
					addScore(strong ? baseScore * 2 : baseScore);
					refreshScoreLabels();
				}
				return true;
			}

			function finishGame() {
				if (state !== "play" && state !== "retry") return;
				var endedFromRetry = state === "retry";
				clearHandlers();
				state = "result";
				var useCurrentRun = score > runStartProvisionalScore;
				var finalScore = useCurrentRun ? score : provisionalScore;
				var finalKillCount = useCurrentRun ? killCount : provisionalKillCount;
				var finalBossKillCount = useCurrentRun ? bossKillCount : provisionalBossKillCount;
				var resultMessage = "フルボッコにしてやったぜ！";
				var useLoseSe = false;
				if (endedFromRetry) {
					resultMessage = "クソッ、まだやり返せてねぇ・・";
					useLoseSe = true;
				} else if (!useCurrentRun) {
					resultMessage = "クソッ、まだやり返せてねぇ・・";
					useLoseSe = true;
				}
				provisionalScore = finalScore;
				provisionalKillCount = finalKillCount;
				provisionalBossKillCount = finalBossKillCount;
				publishScore(finalScore);
				if (typeof window !== "undefined" && window.RPGAtsumaru && window.RPGAtsumaru.experimental && window.RPGAtsumaru.experimental.scoreboards) {
					window.RPGAtsumaru.experimental.scoreboards.setRecord(1, finalScore).catch(function () { });
				}
				showResult(finalScore, finalKillCount, finalBossKillCount, resultMessage, useLoseSe, false);
			}

			function aliveEnemies() {
				return enemies.filter(function (en) { return en.hp > 0 && !en.e.destroyed(); });
			}

			resetPlayerState();
			spawnStage1();

			playUpdateHandler = function () {
				if (state !== "play") return;
				remainingGameFrames--;
				uiTime.text = "TIME: " + Math.max(0, Math.ceil(remainingGameFrames / g.game.fps));
				uiTime.invalidate();
				if (remainingGameFrames <= 0) {
					clear = true;
					finishGame();
					return;
				}
				if (player.cooldown > 0) player.cooldown--;
				if (player.strongLock > 0) player.strongLock--;

				var enemyBaseSpeed = 0.4;
				var playerMaxSpeed = enemyBaseSpeed * 6.0;
				var playerDeadZone = 24;
				var tdx = player.targetDx;
				var tdy = player.targetDy;
				var tlen = Math.sqrt(tdx * tdx + tdy * tdy);
				if (player.dragging && tlen > playerDeadZone) {
					var desiredSpeed = Math.min(playerMaxSpeed, Math.max(0.45, (tlen - playerDeadZone) * 0.08));
					var tvx = (tdx / tlen) * desiredSpeed;
					var tvy = (tdy / tlen) * desiredSpeed;
					player.vx += (tvx - player.vx) * 0.35;
					player.vy += (tvy - player.vy) * 0.35;
				} else {
					player.vx *= 0.4;
					player.vy *= 0.4;
					if (Math.abs(player.vx) < 0.05) player.vx = 0;
					if (Math.abs(player.vy) < 0.05) player.vy = 0;
				}
				player.hit.x = clamp(player.hit.x + player.vx, 0, W - player.hit.width);
				player.hit.y = clamp(player.hit.y + player.vy, 60, H - 60 - player.hit.height);
				player.hit.modified();
				syncPlayerSpritePos();

				if (activePress) {
					if (activePress.enemy.hp <= 0 || activePress.enemy.e.destroyed() || !inRange(activePress.enemy)) {
						clearActivePress();
					} else {
						var holdFrames = g.game.age - activePress.startAge;
						var progress = Math.min(1, holdFrames / longPressFrames);
						holdGaugeBar.width = Math.round(96 * progress);
						holdGaugeBar.modified();
						if (holdFrames >= longPressFrames) {
							var pressedEnemy = activePress.enemy;
							clearActivePress();
							attackEnemy(pressedEnemy, true);
						}
					}
				}

				if (player.animRemain > 0) {
					player.animRemain--;
					if (player.animRemain === 0 && !player.animLoop) setPlayerAnim("move", true, 0);
				}
				player.animTick++;
				if (player.animTick >= getFrameInterval(player.animType, player.animFrame)) {
					player.animTick = 0;
					var frames = animDefs[player.animType];
					player.animFrame++;
					if (player.animFrame >= frames.length) player.animFrame = player.animLoop ? 0 : frames.length - 1;
					updatePlayerFrame();
				}

				var px = player.hit.x + 64;
				var py = player.hit.y + 64;
				items.forEach(function (it) {
					if (!it.used && inRangeItem(it)) {
						it.collect();
					}
				});
				var alive = aliveEnemies();
				rangeSprite.x = Math.round(px);
				rangeSprite.y = Math.round(py);
				rangeSprite.angle = player.facingAngle;
				var enemyInRange = alive.some(function (en) {
					return inRange(en);
				});
				rangeSprite.opacity = enemyInRange ? (g.game.age % 12 < 6 ? 0.25 : 1) : 0.9;
				rangeSprite.modified();

				if (currentStage === 1 && alive.length === 0) {
					spawnStage2();
				} else if (currentStage === 2 && alive.length === 0) {
					startStage3();
				} else if (currentStage === 3) {
					stage3EnemyTimer--;
					stage3ItemTimer--;
					if (stage3EnemyTimer <= 0) {
						stage3EnemyTimer = stage3EnemySpawn;
						var edgePos = randomEdgeSpawn(128, 128);
						var isBoss = g.game.random.generate() < 0.2;
						var frameKey = isBoss ? "boss" : ["mob1", "mob2", "mob3"][Math.floor(g.game.random.generate() * 3)];
						spawnEnemy(edgePos.x, edgePos.y, isBoss ? 120 : 30, isBoss, frameKey);
					}
					if (stage3ItemTimer <= 0) {
						stage3ItemTimer = stage3ItemSpawn;
						var itemTypes = ["pan", "woodSword", "sunglass"];
						spawnRandomItem(itemTypes[Math.floor(g.game.random.generate() * itemTypes.length)]);
					}
				}

				alive.forEach(function (en) {
					if (en.hp <= 0) return;
					var ex = en.hit.x + 64;
					var ey = en.hit.y + 64;
					var dx = px - ex;
					var dy = py - ey;
					var len = Math.sqrt(dx * dx + dy * dy) || 1;
					var spd = 0.8;
					en.hit.x += (dx / len) * spd;
					en.hit.y += (dy / len) * spd;
					en.hit.x = clamp(en.hit.x, 0, W - en.hit.width);
					en.hit.y = clamp(en.hit.y, 60, H - 60 - en.hit.height);
					en.hit.modified();
					en.e.x = en.hit.x + 64;
					en.e.y = en.hit.y + 64;
					en.faceRight = dx > 0;
					en.e.scaleX = en.faceRight ? 1 : -1;
					en.e.modified();
					en.hpBg.x = en.hit.x; en.hpBg.y = en.hit.y - 10; en.hpBg.modified();
					en.hpBar.x = en.hit.x; en.hpBar.y = en.hit.y - 10; en.hpBar.width = 128 * Math.max(0, en.hp) / en.maxHp; en.hpBar.modified();
					if (en.dangerLabel) {
						en.dangerLabel.x = en.hit.x + 22;
						en.dangerLabel.y = en.hit.y - 38;
						en.dangerLabel.modified();
					}
					if (dist2(px, py, ex, ey) < 64 * 64) {
						if (en.atkCd <= 0) {
							player.hp -= en.isBoss ? 12 : 6;
							setPlayerAnim("damage", false, 20);
							playSound(sounds.damage);
							en.atkCd = en.isBoss ? 24 : 36;
							uiHp.text = "HP: " + player.hp; uiHp.invalidate();
						}
					}
					if (en.atkCd > 0) en.atkCd--;
				});

				if (player.hp <= 0) {
					player.hp = 0;
					uiHp.text = "HP: 0";
					uiHp.invalidate();
					clear = false;
					showRetryResult();
				}
			};
			scene.onUpdate.add(playUpdateHandler);
		}

		function showResult(finalScore, finalKillCount, finalBossKillCount, message, useLoseSe, withRetryButton) {
			clearHandlers();
			playSound(useLoseSe ? sounds.lose : sounds.win);
			clearRoot();
			root.append(new g.FilledRect({ scene: scene, x: 0, y: 0, width: W, height: H, cssColor: "#111" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 60, text: message, font: font, fontSize: 44, textColor: useLoseSe ? "#ff6b6b" : "#80ed99" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 150, text: "最終スコア: " + finalScore, font: font, fontSize: 34, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 200, text: "撃破数: " + finalKillCount, font: font, fontSize: 30, textColor: "white" }));
			root.append(new g.Label({ scene: scene, x: 40, y: 245, text: "番長撃破数: " + finalBossKillCount, font: font, fontSize: 30, textColor: "white" }));
			if (withRetryButton) {
				makeButton("再挑戦", 40, 320, 180, 60, function () {
					startGame(false);
				});
				return;
			}
		}

		showTitle();
	});

	g.game.pushScene(scene);
};
