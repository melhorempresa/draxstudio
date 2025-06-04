const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth');
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
const pauseButton = document.getElementById('pauseButton');

// Configurações do Jogo
canvas.width = 800;
canvas.height = 600;
const MAP_CENTER_X = canvas.width / 2;
const MAP_CENTER_Y = canvas.height * 0.3;

let player;
let dragon;
let playerProjectiles = [];
let dragonProjectiles = [];
let particles = [];
let keys = {};
let score = 0;
let currentWave = 1;
let gameOver = false;
let isPaused = false;

let waveClearMessage = "";
let waveClearMessageTimer = 0;
const WAVE_CLEAR_MESSAGE_DURATION = 180;

// Power-ups
let powerUps = [];
const POWERUP_TYPES = {
    SHIELD: 'shield',
    RAPID_FIRE: 'rapid_fire',
    HEALTH_PACK: 'health_pack',
    DAMAGE_BOOST: 'damage_boost',
    FAST_REGEN: 'fast_regen' // NOVO POWER-UP
};
const POWERUP_BASE_DURATION = 300; // 5 segundos para Shield, Rapid Fire, Damage Boost
const FAST_REGEN_DURATION = 600; // 10 segundos para Fast Regen

// Controle de Spawn de Power-ups
let gameTickCounter = 0;
let waveDurationTicks = 0;
let lastPowerUpSpawnGameTick = -Infinity;
const MIN_POWERUP_SPAWN_INTERVAL_TICKS = 300;

let randomPowerUpSpawnTimer = 0;
const RANDOM_POWERUP_SPAWN_INTERVAL_CHECK = 60;

let strategicPowerUpCheckTimer = 0;
const STRATEGIC_POWERUP_MIN_INTERVAL = 600;
const STRATEGIC_POWERUP_RANDOM_ADDITION = 600;

// Configurações de Regeneração de Vida
const PASSIVE_REGEN_AMOUNT = 5 / 60; // 5 de vida por segundo (dividido por 60 ticks)
const FAST_REGEN_MULTIPLIER = 3;


// --- Geração de Settings da Onda --- (sem mudanças diretas para regeneração aqui)
function generateWaveSettings(waveNum) {
    const settings = {};
    settings.dragonHealth = 100 + Math.pow(waveNum, 1.8) * 10 + (waveNum > 10 ? (waveNum - 10) * 25 : 0);
    settings.dragonAttackInterval = Math.max(25, 100 - waveNum * 2.7 - (waveNum > 15 ? (waveNum - 15) * 1.2 : 0) );
    settings.dragonMoveSpeedBase = Math.min(3.0, 0.7 + waveNum * 0.06 + (waveNum > 10 ? (waveNum-10) * 0.025 : 0) );
    settings.projectileSpeedMultiplier = 1 + waveNum * 0.045 + (waveNum > 10 ? (waveNum - 10) * 0.012 : 0);
    settings.numProjectiles = 1 + Math.floor(waveNum / 3.5);
    if (waveNum > 18) settings.numProjectiles += Math.floor((waveNum - 18) / 4.5);
    settings.numProjectiles = Math.min(6, settings.numProjectiles);
    settings.laserChance = Math.min(0.6, 0.05 + waveNum * 0.018);
    settings.tripleAttackChance = Math.min(0.65, 0.05 + waveNum * 0.022);
    settings.circlingChance = Math.min(0.55, 0.1 + waveNum * 0.012);
    settings.circlingDuration = 240 + waveNum * 6;

    settings.playerBaseProjectileSpeed = 7;
    settings.playerBaseShootCooldown = 18;
    settings.playerProjectileSpeed = (player ? player.currentBaseProjectileSpeed : settings.playerBaseProjectileSpeed) + waveNum * 0.09;
    settings.playerShootCooldown = Math.max(2, (player ? player.currentBaseShootCooldown : settings.playerBaseShootCooldown) - waveNum * 0.25);

    settings.playerProjectileBaseWidth = 5;
    settings.playerProjectileBaseHeight = 10;
    settings.playerProjectileWidth = settings.playerProjectileBaseWidth + Math.floor(waveNum / 4.5);
    settings.playerProjectileHeight = settings.playerProjectileBaseHeight + Math.floor(waveNum / 2.5);
    settings.playerProjectileWidth = Math.min(18, settings.playerProjectileWidth);
    settings.playerProjectileHeight = Math.min(35, settings.playerProjectileHeight);

    const playerProjectileColors = ['cyan', 'lightskyblue', 'white', 'yellow', 'gold', 'lightcoral', 'violet'];
    settings.playerProjectileColor = playerProjectileColors[Math.min(playerProjectileColors.length - 1, Math.floor((waveNum-1) / 3.5))];

    settings.playerEmpoweredShotChance = Math.min(0.35, 0.02 + waveNum * 0.008);
    settings.playerEmpoweredShotSizeMultiplier = 1.6;

    settings.powerUpDropChanceOnDefeat = Math.min(0.80, 0.12 + waveNum * 0.022);
    settings.randomPowerUpSpawnChancePerSecond = Math.min(0.06, 0.006 + waveNum * 0.0012);

    return settings;
}

class GameObject {
    constructor(x, y, width, height, color) {
        this.x = x; this.y = y; this.width = width; this.height = height; this.color = color;
    }
    draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); }
}

class PowerUp extends GameObject {
    constructor(x, y, type) {
        let width = 25, height = 25, color = 'yellow', symbol = "?";
        switch (type) {
            case POWERUP_TYPES.SHIELD: color = 'rgba(0, 191, 255, 0.9)'; symbol = "S"; break;
            case POWERUP_TYPES.RAPID_FIRE: color = 'rgba(50, 205, 50, 0.9)'; symbol = "R"; break;
            case POWERUP_TYPES.HEALTH_PACK: color = 'rgba(255, 105, 180, 0.9)'; symbol = "H"; break;
            case POWERUP_TYPES.DAMAGE_BOOST: color = 'rgba(255, 69, 0, 0.9)'; symbol = "D"; break;
            case POWERUP_TYPES.FAST_REGEN: color = 'rgba(144, 238, 144, 0.9)'; symbol = "R+"; break; // LightGreen
        }
        super(x, y, width, height, color);
        this.type = type; this.symbol = symbol; this.fallSpeed = 1.5; this.lifeSpan = 720;
    }
    update() {
        this.y += this.fallSpeed; this.lifeSpan--;
        if (this.lifeSpan <= 0 || this.y > canvas.height + this.height) return false;
        this.draw();
        ctx.fillStyle = 'black'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2 + 1);
        ctx.fillStyle = 'white';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2);
        return true;
    }
}

class Particle extends GameObject { // Sem mudanças
    constructor(x, y, size, color, velocity) {
        super(x, y, size, size, color);
        this.velocity = velocity; this.alpha = 1; this.friction = 0.98; this.gravity = 0.08;
    }
    update() {
        this.draw(); this.velocity.x *= this.friction; this.velocity.y *= this.friction;
        this.velocity.y += this.gravity; this.x += this.velocity.x; this.y += this.velocity.y;
        this.alpha -= 0.02; return this.alpha > 0;
    }
    draw() {
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height); ctx.restore();
    }
}
function createExplosion(x, y, color = 'orange', count = 30) {
    for (let i = 0; i < count; i++) {
        const size = Math.random() * 5 + 2; const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
        particles.push(new Particle(x, y, size, color, velocity));
    }
}

class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.baseSpeed = speed;
        this.currentSpeed = speed;
        this.health = health;
        this.maxHealth = health;

        this.evolutionLevel = 0;
        this.evolutionColors = ['lime', 'deepskyblue', 'gold', 'fuchsia', 'white'];

        this.currentBaseProjectileSpeed = 7;
        this.currentBaseShootCooldown = 18;
        this.currentBaseProjectileDamage = 10;

        this.actualShootCooldown = 20;
        this.actualProjectileSpeed = 7;
        this.actualProjectileDamage = 10;

        this.shootTimer = 0;
        this.isShielded = false; this.shieldTimer = 0;
        this.rapidFireActive = false; this.rapidFireTimer = 0;
        this.damageBoostActive = false; this.damageBoostTimer = 0;
        this.fastRegenActive = false; this.fastRegenTimer = 0; // NOVO
    }

    evolve() {
        this.evolutionLevel++;
        this.baseSpeed += 0.25;
        this.currentBaseProjectileSpeed += 0.3;
        this.currentBaseShootCooldown = Math.max(2, this.currentBaseShootCooldown * 0.92);
        this.currentBaseProjectileDamage += 2;
        this.maxHealth += 15;
        this.health = this.maxHealth;
        this.color = this.evolutionColors[Math.min(this.evolutionLevel, this.evolutionColors.length - 1)];
        updateUI();
    }

    handleRegeneration() {
        if (this.health < this.maxHealth) {
            let regenRate = PASSIVE_REGEN_AMOUNT;
            if (this.fastRegenActive) {
                regenRate *= FAST_REGEN_MULTIPLIER;
            }
            this.health = Math.min(this.maxHealth, this.health + regenRate);
            if(Math.floor(this.health) !== Math.floor(this.health - regenRate)) { // Atualiza UI só se mudar o valor inteiro
                updateUI();
            }
        }
    }

    update(settings) {
        this.handleRegeneration(); // Chama a regeneração a cada update

        this.currentSpeed = this.baseSpeed;
        this.actualProjectileSpeed = this.currentBaseProjectileSpeed + (currentWave * 0.05);
        this.actualShootCooldown = Math.max(2, this.currentBaseShootCooldown - (currentWave * 0.15));
        this.actualProjectileDamage = this.currentBaseProjectileDamage;

        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) this.x -= this.currentSpeed;
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) this.x += this.currentSpeed;
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.55) this.y -= this.currentSpeed;
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 5) this.y += this.currentSpeed;

        this.updatePowerUpTimers();

        let finalShootCooldown = this.actualShootCooldown;
        if (this.rapidFireActive) finalShootCooldown = Math.max(2, finalShootCooldown / 2.2);

        let finalProjectileDamage = this.actualProjectileDamage;
        if (this.damageBoostActive) finalProjectileDamage = Math.round(finalProjectileDamage * 1.8);

        if (this.shootTimer > 0) this.shootTimer--;
        if (keys['Space'] && this.shootTimer <= 0) {
            this.shoot(settings, this.actualProjectileSpeed, finalProjectileDamage);
            this.shootTimer = finalShootCooldown;
        }
        this.draw();
        if (this.isShielded) this.drawShield();
    }
    updatePowerUpTimers() {
        if (this.shieldTimer > 0) { this.shieldTimer--; if (this.shieldTimer === 0) this.isShielded = false; }
        if (this.rapidFireTimer > 0) { this.rapidFireTimer--; if (this.rapidFireTimer === 0) this.rapidFireActive = false; }
        if (this.damageBoostTimer > 0) { this.damageBoostTimer--; if (this.damageBoostTimer === 0) this.damageBoostActive = false; }
        if (this.fastRegenTimer > 0) { this.fastRegenTimer--; if (this.fastRegenTimer === 0) this.fastRegenActive = false; } // NOVO
    }
    drawShield() {
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.7)'; ctx.lineWidth = 4; ctx.beginPath();
        const pulse = Math.sin(Date.now() / 180) * 2.5;
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width * 0.75 + pulse, 0, Math.PI * 2);
        ctx.stroke(); ctx.lineWidth = 1;
    }
    activatePowerUp(type) {
        switch (type) {
            case POWERUP_TYPES.SHIELD:
                this.isShielded = true; this.shieldTimer = POWERUP_BASE_DURATION; break;
            case POWERUP_TYPES.RAPID_FIRE:
                this.rapidFireActive = true; this.rapidFireTimer = POWERUP_BASE_DURATION; break;
            case POWERUP_TYPES.HEALTH_PACK:
                this.health = this.maxHealth; updateUI(); break;
            case POWERUP_TYPES.DAMAGE_BOOST:
                this.damageBoostActive = true; this.damageBoostTimer = POWERUP_BASE_DURATION; break;
            case POWERUP_TYPES.FAST_REGEN: // NOVO
                this.fastRegenActive = true; this.fastRegenTimer = FAST_REGEN_DURATION; break;
        }
    }
    shoot(settings, projectileSpeed, projectileDamage) {
        let projWidth = settings.playerProjectileWidth;
        let projHeight = settings.playerProjectileHeight;
        let projColor = this.damageBoostActive ? 'orangered' : (this.color === 'lime' ? settings.playerProjectileColor : this.color);

        if (Math.random() < settings.playerEmpoweredShotChance) {
            projWidth *= settings.playerEmpoweredShotSizeMultiplier;
            projHeight *= settings.playerEmpoweredShotSizeMultiplier;
            if (!this.damageBoostActive) projColor = 'gold';
        }
        playerProjectiles.push(new Projectile(this.x + this.width / 2 - projWidth / 2, this.y, projWidth, projHeight, projColor, projectileSpeed, 'player', 0, 0, projectileDamage));
    }
    takeDamage(amount) {
        if (this.isShielded) return;
        this.health -= amount; updateUI();
        if (this.health <= 0) { this.health = 0; triggerGameOver(); }
    }
}

class Dragon extends GameObject { // Sem mudanças
    constructor(x, y, width, height, color, health, attackIntervalBase, moveSpeedBase) {
        super(x, y, width, height, color);
        this.health = health; this.maxHealth = health;
        this.attackIntervalBase = attackIntervalBase; this.attackTimer = this.attackIntervalBase;
        this.moveSpeedBase = moveSpeedBase; this.moveDirection = 1;
        this.moveRange = { minX: 20, maxX: canvas.width - this.width - 20 };
        this.isCircling = false; this.circlingTimer = 0;
        this.circlingCheckInterval = 270;
        this.circlingCheckTimer = Math.random() * this.circlingCheckInterval;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitRadius = canvas.width * 0.3;
        this.orbitSpeed = 0.012;
        this.targetYDuringCircling = MAP_CENTER_Y;
        this.isDying = false; this.deathAnimationTimer = 0; this.TIME_TO_FADE_OUT = 45;
        this.hasTriggeredNextWave = false;
    }
    update(settings, playerRef) {
        if (this.isDying) {
            this.deathAnimationTimer++; this.width *= 0.98; this.height *= 0.98;
            this.x += (super.width - this.width) / 2; this.y += (super.height - this.height) / 2;
            if (this.deathAnimationTimer % 5 === 0) createExplosion(this.x + this.width / 2, this.y + this.height / 2, this.color, 2);
            if (this.deathAnimationTimer >= this.TIME_TO_FADE_OUT) {
                if (!this.hasTriggeredNextWave) { triggerSmoothNextWaveSetup(); this.hasTriggeredNextWave = true; }
                return false;
            }
            this.draw(); return true;
        }
        this.handleCirclingState(settings);
        if (!this.isCircling) {
            const currentMoveSpeed = this.moveSpeedBase * settings.projectileSpeedMultiplier;
            this.x += currentMoveSpeed * this.moveDirection;
            if (this.x <= this.moveRange.minX && this.moveDirection === -1) { this.moveDirection = 1; this.x = this.moveRange.minX; }
            else if (this.x >= this.moveRange.maxX && this.moveDirection === 1) { this.moveDirection = -1; this.x = this.moveRange.maxX; }
            if (Math.abs(this.y - 30) > 1) { this.y += (30 - this.y) * 0.08; }
        } else {
            this.orbitAngle += this.orbitSpeed * settings.projectileSpeedMultiplier;
            const targetX = MAP_CENTER_X + this.orbitRadius * Math.cos(this.orbitAngle) - this.width / 2;
            const targetY = this.targetYDuringCircling + (this.orbitRadius * 0.2) * Math.sin(this.orbitAngle * 2.5) - this.height / 2;
            this.x += (targetX - this.x) * 0.06; this.y += (targetY - this.y) * 0.06;
            this.y = Math.max(10, Math.min(this.y, canvas.height * 0.5 - this.height));
        }
        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this.performAttack(settings, playerRef);
            this.attackTimer = settings.dragonAttackInterval / (this.isCircling ? 1.3 : 1);
        }
        this.draw(); return true;
    }
    handleCirclingState(settings) { /* ... */ if (this.isCircling) { this.circlingTimer--; if (this.circlingTimer <= 0) { this.isCircling = false; this.circlingCheckTimer = this.circlingCheckInterval; } } else { this.circlingCheckTimer--; if (this.circlingCheckTimer <= 0) { this.circlingCheckTimer = this.circlingCheckInterval; if (Math.random() < settings.circlingChance) { this.isCircling = true; this.circlingTimer = settings.circlingDuration; } } } }
    performAttack(settings, playerRef) { /* ... */ const roll = Math.random(); if (roll < settings.tripleAttackChance) this.tripleAttack(settings, playerRef); else this.standardAttack(settings, playerRef); }
    fireProjectile(posX, posY, settings, isLaserOverride = false, targetPlayer = false, playerRef = null, fixedAngleDeg = null) { /* ... */ let pColor = 'orange', pWidth = 10, pHeight = 10, pBaseSpeed = 3, dx = 0, dy = 0; if (isLaserOverride || Math.random() < settings.laserChance) { pColor = 'red'; pWidth = 5; pHeight = 20; pBaseSpeed = 5; } const actualSpeed = pBaseSpeed * settings.projectileSpeedMultiplier; if (targetPlayer && playerRef) { const angleToPlayer = Math.atan2((playerRef.y + playerRef.height / 2) - (posY + pHeight / 2), (playerRef.x + playerRef.width / 2) - (posX + pWidth / 2)); dx = Math.cos(angleToPlayer) * actualSpeed; dy = Math.sin(angleToPlayer) * actualSpeed; } else if (fixedAngleDeg !== null) { const angleRad = fixedAngleDeg * (Math.PI / 180); dx = Math.cos(angleRad) * actualSpeed; dy = Math.sin(angleRad) * actualSpeed; } else { dy = actualSpeed; } dragonProjectiles.push(new Projectile(posX - pWidth / 2, posY, pWidth, pHeight, pColor, actualSpeed, 'dragon', dx, dy)); }
    standardAttack(settings, playerRef) { /* ... */ const shouldTarget = this.isCircling || Math.random() < 0.4; for (let i = 0; i < settings.numProjectiles; i++) { setTimeout(() => { if (this.isDying) return; const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height; this.fireProjectile(projSpawnX, projSpawnY, settings, false, shouldTarget, playerRef); }, i * 90); } }
    tripleAttack(settings, playerRef) { /* ... */ if (this.isDying) return; const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height; const spreadAngle = 18; this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90); setTimeout(() => { if (!this.isDying) this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle)}, 50); setTimeout(() => { if (!this.isDying) this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle)}, 100); }
    takeDamage(amount) {
        if (this.isDying) return;
        this.health -= amount; score += amount; updateUI();
        if (this.health <= 0 && !this.isDying) {
            this.health = 0; this.isDying = true; this.deathAnimationTimer = 0;
            createExplosion(this.x + this.width / 2, this.y + this.height / 2, 'red', 50);
            score += 100 * currentWave;
            const waveDefeatSettings = generateWaveSettings(currentWave);
            if (Math.random() < waveDefeatSettings.powerUpDropChanceOnDefeat) {
                spawnPowerUp(this.x + this.width / 2, this.y + this.height / 2);
            }
        }
    }
}

class Projectile extends GameObject { // Sem mudanças
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0, damage = 10) {
        super(x, y, width, height, color);
        this.speed = speed; this.owner = owner; this.dx = dx; this.dy = dy; this.damage = damage;
        if (this.owner === 'player') { this.dy = -this.speed; this.dx = 0; }
        else { if (dx === 0 && dy === 0) { this.dy = this.speed; this.dx = 0; } }
    }
    update() { this.x += this.dx; this.y += this.dy; this.draw(); }
}

function spawnPowerUp(x, y, specificType = null) {
    if (gameTickCounter - lastPowerUpSpawnGameTick < MIN_POWERUP_SPAWN_INTERVAL_TICKS) return;
    let type;
    if (specificType) type = specificType;
    else {
        const typeKeys = Object.values(POWERUP_TYPES);
        type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    }
    powerUps.push(new PowerUp(x, y, type));
    lastPowerUpSpawnGameTick = gameTickCounter;
}

function handleRandomGenericPowerUpSpawns(settings) {
    randomPowerUpSpawnTimer--;
    if (randomPowerUpSpawnTimer <= 0) {
        randomPowerUpSpawnTimer = RANDOM_POWERUP_SPAWN_INTERVAL_CHECK;
        if (Math.random() < settings.randomPowerUpSpawnChancePerSecond) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            // Adicionado FAST_REGEN aqui com chance igual aos outros não-defensivos
            let availableTypes = [POWERUP_TYPES.RAPID_FIRE, POWERUP_TYPES.DAMAGE_BOOST, POWERUP_TYPES.FAST_REGEN];
            const typeToSpawn = availableTypes[Math.floor(Math.random() * availableTypes.length)];
            if (typeToSpawn) spawnPowerUp(spawnX, -30, typeToSpawn);
        }
    }
}
function handleStrategicPowerUpSpawns() {
    strategicPowerUpCheckTimer--;
    if (strategicPowerUpCheckTimer <= 0) {
        strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;
        let baseChance = 0.01 + (currentWave -1) * 0.015;
        if (currentWave >= 5) baseChance += 0.05;
        if (currentWave >= 9 && waveDurationTicks > 3600) baseChance += 0.10;
        if (currentWave >= 12 && waveDurationTicks > 4800) baseChance += 0.05;
        baseChance = Math.min(baseChance, 0.35);

        if (Math.random() < baseChance) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            // Prioriza Health e Shield, mas pode dar Fast Regen também
            const randType = Math.random();
            let typeToSpawn;
            if (randType < 0.45) typeToSpawn = POWERUP_TYPES.HEALTH_PACK;
            else if (randType < 0.85) typeToSpawn = POWERUP_TYPES.SHIELD;
            else typeToSpawn = POWERUP_TYPES.FAST_REGEN;
            spawnPowerUp(spawnX, -30, typeToSpawn);
        }
    }
}

function initGame() {
    gameOver = false; isPaused = false; score = 0; currentWave = 1;
    playerProjectiles = []; dragonProjectiles = []; powerUps = []; particles = []; keys = {};
    waveClearMessage = ""; waveClearMessageTimer = 0;

    gameTickCounter = 0; waveDurationTicks = 0; lastPowerUpSpawnGameTick = -Infinity;
    randomPowerUpSpawnTimer = Math.floor(Math.random() * RANDOM_POWERUP_SPAWN_INTERVAL_CHECK);
    strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;

    gameOverScreen.style.display = 'none';
    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 5, 100);
    setupNewDragonForWave(currentWave);
    updateUI(); gameLoop();
}

function setupNewDragonForWave(waveNum) {
    waveDurationTicks = 0;
    const settings = generateWaveSettings(waveNum);
    dragon = new Dragon( canvas.width / 2 - 50, -100, 100, 80,
        `hsl(${Math.random() * 360}, 70%, 50%)`,
        settings.dragonHealth, settings.dragonAttackInterval, settings.dragonMoveSpeedBase
    );
    dragon.targetY = 30;
    dragonProjectiles = [];
    updateUI();
}

function triggerSmoothNextWaveSetup() {
    currentWave++;
    waveClearMessage = `Você passou a Onda ${currentWave - 1}!`;
    waveClearMessageTimer = WAVE_CLEAR_MESSAGE_DURATION;

    if ((currentWave -1) % 5 === 0 && currentWave > 1) player.evolve();
    if (currentWave > 1 && player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.15));
        updateUI();
    }
    setTimeout(() => { if (!gameOver) setupNewDragonForWave(currentWave); }, 1500);
}

function updateUI() {
    playerHealthUI.textContent = `${Math.floor(player.health)}/${player.maxHealth}`; // Mostra vida como inteiro
    dragonHealthUI.textContent = dragon && !dragon.isDying ? dragon.health : '---';
    waveUI.textContent = currentWave;
    scoreUI.textContent = score;
    if (pauseButton) pauseButton.textContent = isPaused ? "Continuar" : "Pausar";
}

function checkCollisions() { // Sem mudanças
    for (let i = playerProjectiles.length - 1; i >= 0; i--) { const p = playerProjectiles[i]; if (dragon && !dragon.isDying && p.x < dragon.x + dragon.width && p.x + p.width > dragon.x && p.y < dragon.y + dragon.height && p.y + p.height > dragon.y) { dragon.takeDamage(p.damage); playerProjectiles.splice(i, 1); } }
    for (let i = dragonProjectiles.length - 1; i >= 0; i--) { const p = dragonProjectiles[i]; if (player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) { player.takeDamage(18); dragonProjectiles.splice(i, 1); } }
    for (let i = powerUps.length - 1; i >= 0; i--) { const pu = powerUps[i]; if (player.x < pu.x + pu.width && player.x + player.width > pu.x && player.y < pu.y + pu.height && player.y + player.height > pu.y) { player.activatePowerUp(pu.type); powerUps.splice(i, 1); } }
}

function triggerGameOver() { // Sem mudanças
    gameOver = true; isPaused = false;
    gameOverScreen.innerHTML = `<h2>Fim de Jogo!</h2><p>Você sobreviveu até a Onda ${currentWave}.</p><p>Sua pontuação: <span id="finalScoreOver">${score}</span></p><button id="restartButtonOver">Jogar Novamente</button>`;
    document.getElementById('finalScoreOver').textContent = score;
    gameOverScreen.style.display = 'block';
    document.getElementById('restartButtonOver').addEventListener('click', initGame);
}

function drawWaveClearMessage() { // Sem mudanças
    if (waveClearMessageTimer > 0) {
        ctx.save(); ctx.font = "bold 28px Arial"; ctx.textAlign = "center";
        const alpha = Math.min(1, waveClearMessageTimer / (WAVE_CLEAR_MESSAGE_DURATION / 2));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`; ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
        ctx.lineWidth = 2; const xPos = canvas.width / 2; const yPos = 60;
        ctx.strokeText(waveClearMessage, xPos, yPos); ctx.fillText(waveClearMessage, xPos, yPos);
        ctx.restore(); waveClearMessageTimer--;
    }
}

function drawPauseScreen() { // Sem mudanças
    ctx.save(); ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 48px Arial"; ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("JOGO PAUSADO", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px Arial"; ctx.fillText("Pressione ESC ou clique em 'Continuar' para voltar", canvas.width / 2, canvas.height / 2 + 50);
    ctx.restore();
}

function gameLoop() {
    if (gameOver) return;
    if (isPaused) { drawPauseScreen(); requestAnimationFrame(gameLoop); return; }

    gameTickCounter++; waveDurationTicks++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentWaveSettings = generateWaveSettings(currentWave);

    player.update(currentWaveSettings);
    if (dragon) {
        if (dragon.targetY && dragon.y < dragon.targetY) {
            dragon.y += 3; if (dragon.y >= dragon.targetY) { dragon.y = dragon.targetY; dragon.targetY = null; }
        }
        if (!dragon.update(currentWaveSettings, player)) dragon = null;
    }

    powerUps = powerUps.filter(p => p.update());
    particles = particles.filter(p => p.update());
    handleRandomGenericPowerUpSpawns(currentWaveSettings);
    handleStrategicPowerUpSpawns();

    playerProjectiles = playerProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    playerProjectiles.forEach(p => p.update());
    dragonProjectiles = dragonProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    dragonProjectiles.forEach(p => p.update());

    checkCollisions(); updateUI(); drawWaveClearMessage();
    requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { if (!gameOver) { isPaused = !isPaused; updateUI(); } }
    else keys[e.code] = true;
    if (!gameOver && !isPaused && (e.code === 'Space' || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) e.preventDefault();
});
window.addEventListener('keyup', (e) => { if (e.code !== 'Escape') keys[e.code] = false; });
if (pauseButton) pauseButton.addEventListener('click', () => { if (!gameOver) { isPaused = !isPaused; updateUI(); } });

initGame();
