const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth');
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
const victoryScreen = document.getElementById('victoryScreen');

// Configurações do Jogo
canvas.width = 800;
canvas.height = 600;
const MAP_CENTER_X = canvas.width / 2;
const MAP_CENTER_Y = canvas.height * 0.3;

let player;
let dragon;
let playerProjectiles = [];
let dragonProjectiles = [];
let keys = {};
let score = 0;
let currentWave = 1;
let gameOver = false;
let waveTransition = false;

// Power-ups
let powerUps = [];
const POWERUP_TYPES = { SHIELD: 'shield', RAPID_FIRE: 'rapid_fire', HEALTH_PACK: 'health_pack', DAMAGE_BOOST: 'damage_boost' };
const POWERUP_BASE_DURATION = 300; // 5 segundos (60fps * 5s)

// Controle de Spawn de Power-ups
let gameTickCounter = 0; // Contador de ticks global do jogo
let waveDurationTicks = 0; // Contador de ticks para a duração da onda atual
let lastPowerUpSpawnGameTick = -Infinity; // Para o intervalo global de power-ups
const MIN_POWERUP_SPAWN_INTERVAL_TICKS = 300; // 5 segundos entre qualquer power-up

let randomPowerUpSpawnTimer = 0; // Timer para o spawn aleatório genérico
const RANDOM_POWERUP_SPAWN_INTERVAL_CHECK = 60; // Checar a cada segundo (60 ticks)

let strategicPowerUpCheckTimer = 0; // Timer para o spawn estratégico de Health/Shield
const STRATEGIC_POWERUP_MIN_INTERVAL = 600; // Mínimo 10 segundos
const STRATEGIC_POWERUP_RANDOM_ADDITION = 600; // Máximo +10 segundos (total 10-20s)


function generateWaveSettings(waveNum) {
    const settings = {};
    // ... (configs do dragão e jogador como antes) ...
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

    settings.playerProjectileSpeed = 7 + waveNum * 0.18;
    settings.playerShootCooldown = Math.max(2, 18 - waveNum * 0.55);

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

    // Configurações de Power-up (genéricas)
    settings.powerUpDropChanceOnDefeat = Math.min(0.80, 0.12 + waveNum * 0.022); // Chance de dropar um power-up aleatório ao derrotar dragão
    settings.randomPowerUpSpawnChancePerSecond = Math.min(0.06, 0.006 + waveNum * 0.0012); // Chance de spawn aleatório por segundo

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
        }
        super(x, y, width, height, color);
        this.type = type; this.symbol = symbol; this.fallSpeed = 1.5; this.lifeSpan = 720; // Dura 12s na tela
    }
    update() {
        this.y += this.fallSpeed; this.lifeSpan--;
        if (this.lifeSpan <= 0 || this.y > canvas.height + this.height) return false; // Remove se sair da tela ou expirar
        this.draw();
        ctx.fillStyle = 'black'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2 + 1);
        ctx.fillStyle = 'white';
        ctx.fillText(this.symbol, this.x + this.width / 2, this.y + this.height / 2);
        return true;
    }
}

class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.speed = speed; this.health = health; this.maxHealth = health; // Usar o 'health' inicial como maxHealth
        this.currentShootCooldown = 20;
        this.currentProjectileSpeed = 7;
        this.projectileDamage = 10;
        this.shootTimer = 0;
        this.isShielded = false; this.shieldTimer = 0;
        this.rapidFireActive = false; this.rapidFireTimer = 0;
        this.damageBoostActive = false; this.damageBoostTimer = 0;
    }
    update(settings) {
        // Movimento
        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) this.x -= this.speed;
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) this.x += this.speed;
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.55) this.y -= this.speed;
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 5) this.y += this.speed;

        this.updatePowerUpTimers();

        this.currentShootCooldown = settings.playerShootCooldown;
        if (this.rapidFireActive) this.currentShootCooldown = Math.max(2, this.currentShootCooldown / 2.2);
        this.currentProjectileSpeed = settings.playerProjectileSpeed;
        this.projectileDamage = this.damageBoostActive ? 22 : 10;

        if (this.shootTimer > 0) this.shootTimer--;
        if (keys['Space'] && this.shootTimer <= 0) {
            this.shoot(settings);
            this.shootTimer = this.currentShootCooldown;
        }
        this.draw();
        if (this.isShielded) this.drawShield();
    }
    updatePowerUpTimers() {
        if (this.shieldTimer > 0) { this.shieldTimer--; if (this.shieldTimer === 0) this.isShielded = false; }
        if (this.rapidFireTimer > 0) { this.rapidFireTimer--; if (this.rapidFireTimer === 0) this.rapidFireActive = false; }
        if (this.damageBoostTimer > 0) { this.damageBoostTimer--; if (this.damageBoostTimer === 0) this.damageBoostActive = false; }
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
                this.isShielded = true;
                this.shieldTimer = POWERUP_BASE_DURATION; // Exatamente 5 segundos
                break;
            case POWERUP_TYPES.RAPID_FIRE:
                this.rapidFireActive = true;
                this.rapidFireTimer = POWERUP_BASE_DURATION;
                break;
            case POWERUP_TYPES.HEALTH_PACK:
                this.health = this.maxHealth; // Recupera vida toda
                updateUI();
                break;
            case POWERUP_TYPES.DAMAGE_BOOST:
                this.damageBoostActive = true;
                this.damageBoostTimer = POWERUP_BASE_DURATION;
                break;
        }
    }
    shoot(settings) {
        let projWidth = settings.playerProjectileWidth;
        let projHeight = settings.playerProjectileHeight;
        let projColor = this.damageBoostActive ? 'orangered' : settings.playerProjectileColor;

        if (Math.random() < settings.playerEmpoweredShotChance) {
            projWidth *= settings.playerEmpoweredShotSizeMultiplier;
            projHeight *= settings.playerEmpoweredShotSizeMultiplier;
            if (!this.damageBoostActive) projColor = 'gold';
        }
        playerProjectiles.push(new Projectile(this.x + this.width / 2 - projWidth / 2, this.y, projWidth, projHeight, projColor, this.currentProjectileSpeed, 'player'));
    }
    takeDamage(amount) {
        if (this.isShielded) { this.isShielded = false; this.shieldTimer = 0; return; }
        this.health -= amount; updateUI();
        if (this.health <= 0) { this.health = 0; triggerGameOver(); }
    }
}

class Dragon extends GameObject { // Sem mudanças significativas no Dragão para esta request
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
    }
    update(settings, playerRef) {
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
            this.x += (targetX - this.x) * 0.06;
            this.y += (targetY - this.y) * 0.06;
            this.y = Math.max(10, Math.min(this.y, canvas.height * 0.5 - this.height));
        }
        this.attackTimer--;
        if (this.attackTimer <= 0) {
            this.performAttack(settings, playerRef);
            this.attackTimer = settings.dragonAttackInterval / (this.isCircling ? 1.3 : 1);
        }
        this.draw();
    }
    handleCirclingState(settings) {
        if (this.isCircling) {
            this.circlingTimer--;
            if (this.circlingTimer <= 0) {
                this.isCircling = false;
                this.circlingCheckTimer = this.circlingCheckInterval;
            }
        } else {
            this.circlingCheckTimer--;
            if (this.circlingCheckTimer <= 0) {
                this.circlingCheckTimer = this.circlingCheckInterval;
                if (Math.random() < settings.circlingChance) {
                    this.isCircling = true;
                    this.circlingTimer = settings.circlingDuration;
                }
            }
        }
    }
    performAttack(settings, playerRef) {
        const roll = Math.random();
        if (roll < settings.tripleAttackChance) this.tripleAttack(settings, playerRef);
        else this.standardAttack(settings, playerRef);
    }
    fireProjectile(posX, posY, settings, isLaserOverride = false, targetPlayer = false, playerRef = null, fixedAngleDeg = null) {
        let pColor = 'orange', pWidth = 10, pHeight = 10, pBaseSpeed = 3, dx = 0, dy = 0;
        if (isLaserOverride || Math.random() < settings.laserChance) {
            pColor = 'red'; pWidth = 5; pHeight = 20; pBaseSpeed = 5;
        }
        const actualSpeed = pBaseSpeed * settings.projectileSpeedMultiplier;
        if (targetPlayer && playerRef) {
            const angleToPlayer = Math.atan2((playerRef.y + playerRef.height / 2) - (posY + pHeight / 2), (playerRef.x + playerRef.width / 2) - (posX + pWidth / 2));
            dx = Math.cos(angleToPlayer) * actualSpeed; dy = Math.sin(angleToPlayer) * actualSpeed;
        } else if (fixedAngleDeg !== null) {
            const angleRad = fixedAngleDeg * (Math.PI / 180);
            dx = Math.cos(angleRad) * actualSpeed; dy = Math.sin(angleRad) * actualSpeed;
        } else { dy = actualSpeed; }
        dragonProjectiles.push(new Projectile(posX - pWidth / 2, posY, pWidth, pHeight, pColor, actualSpeed, 'dragon', dx, dy));
    }
    standardAttack(settings, playerRef) {
        const shouldTarget = this.isCircling || Math.random() < 0.4;
        for (let i = 0; i < settings.numProjectiles; i++) {
            setTimeout(() => {
                const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
                this.fireProjectile(projSpawnX, projSpawnY, settings, false, shouldTarget, playerRef);
            }, i * 90);
        }
    }
    tripleAttack(settings, playerRef) {
        const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
        const spreadAngle = 18;
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90);
        setTimeout(() => this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle), 50);
        setTimeout(() => this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle), 100);
    }
    takeDamage(amount) {
        this.health -= amount; score += amount; updateUI();
        if (this.health <= 0) {
            this.health = 0; score += 100 * currentWave;
            const waveDefeatSettings = generateWaveSettings(currentWave);
            if (Math.random() < waveDefeatSettings.powerUpDropChanceOnDefeat) { // Drop aleatório ao derrotar
                spawnPowerUp(this.x + this.width / 2, this.y + this.height / 2);
            }
            nextWave();
        }
    }
}

class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0) {
        super(x, y, width, height, color);
        this.speed = speed; this.owner = owner; this.dx = dx; this.dy = dy;
        if (this.owner === 'player') { this.dy = -this.speed; this.dx = 0; }
        else { if (dx === 0 && dy === 0) { this.dy = this.speed; this.dx = 0; } }
    }
    update() { this.x += this.dx; this.y += this.dy; this.draw(); }
}

function spawnPowerUp(x, y, specificType = null) {
    // Verifica o intervalo global antes de spawnar QUALQUER power-up
    if (gameTickCounter - lastPowerUpSpawnGameTick < MIN_POWERUP_SPAWN_INTERVAL_TICKS) {
        // console.log("Power-up spawn blocked by global interval.");
        return; // Muito cedo para outro power-up
    }

    let type;
    if (specificType) {
        type = specificType;
    } else {
        const typeKeys = Object.values(POWERUP_TYPES);
        type = typeKeys[Math.floor(Math.random() * typeKeys.length)];
    }
    powerUps.push(new PowerUp(x, y, type));
    lastPowerUpSpawnGameTick = gameTickCounter; // Atualiza o tick do último spawn
}

// Spawn aleatório genérico (menos Health/Shield, que são controlados estrategicamente)
function handleRandomGenericPowerUpSpawns(settings) {
    randomPowerUpSpawnTimer--;
    if (randomPowerUpSpawnTimer <= 0) {
        randomPowerUpSpawnTimer = RANDOM_POWERUP_SPAWN_INTERVAL_CHECK;
        if (Math.random() < settings.randomPowerUpSpawnChancePerSecond) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            // Filtra para não spawnar Health ou Shield aqui, ou dá chance muito baixa
            let availableTypes = [POWERUP_TYPES.RAPID_FIRE, POWERUP_TYPES.DAMAGE_BOOST];
            // Poderia adicionar Health/Shield com chance mínima se quisesse:
            // if (Math.random() < 0.1) availableTypes.push(POWERUP_TYPES.HEALTH_PACK);
            // if (Math.random() < 0.1) availableTypes.push(POWERUP_TYPES.SHIELD);
            const typeToSpawn = availableTypes[Math.floor(Math.random() * availableTypes.length)];
            if (typeToSpawn) { // Garante que haja um tipo selecionado
                 spawnPowerUp(spawnX, -30, typeToSpawn);
            }
        }
    }
}

// Spawn estratégico de Health Packs e Shields
function handleStrategicPowerUpSpawns() {
    strategicPowerUpCheckTimer--;
    if (strategicPowerUpCheckTimer <= 0) {
        // Resetar o timer para o próximo check (ex: 10 a 20 segundos)
        strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;

        let baseChance = 0.01; // Chance base bem pequena
        baseChance += (currentWave -1) * 0.015; // Aumenta 1.5% por onda

        if (currentWave >= 5) {
            baseChance += 0.05; // Bônus a partir da onda 5
        }
        if (currentWave >= 9 && waveDurationTicks > 3600) { // Onda 9+ e mais de 1 minuto na onda
            baseChance += 0.10; // Bônus significativo por demorar em ondas altas
        }
         if (currentWave >= 12 && waveDurationTicks > 4800) { // Onda 12+ e mais de 1m20s na onda
            baseChance += 0.05; // Bônus adicional
        }

        baseChance = Math.min(baseChance, 0.35); // Limita a chance máxima para este check (ex: 35%)

        // console.log(`Strategic PowerUp Check: Wave ${currentWave}, Duration ${Math.round(waveDurationTicks/60)}s, Chance ${baseChance.toFixed(3)}`);

        if (Math.random() < baseChance) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            const typeToSpawn = (Math.random() < 0.55) ? POWERUP_TYPES.HEALTH_PACK : POWERUP_TYPES.SHIELD; // Pequeno viés para Health
            // console.log(`Attempting to spawn strategic: ${typeToSpawn}`);
            spawnPowerUp(spawnX, -30, typeToSpawn);
        }
    }
}


function initGame() {
    gameOver = false; waveTransition = false; score = 0; currentWave = 1;
    playerProjectiles = []; dragonProjectiles = []; powerUps = []; keys = {};

    gameTickCounter = 0;
    waveDurationTicks = 0;
    lastPowerUpSpawnGameTick = -Infinity; // Permite o primeiro spawn
    randomPowerUpSpawnTimer = Math.floor(Math.random() * RANDOM_POWERUP_SPAWN_INTERVAL_CHECK);
    strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;


    gameOverScreen.style.display = 'none'; victoryScreen.style.display = 'none';
    const initialSettings = generateWaveSettings(currentWave);
    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 7, 100); // Max health é 100
    player.currentShootCooldown = initialSettings.playerShootCooldown;
    player.currentProjectileSpeed = initialSettings.playerProjectileSpeed;
    // player.maxHealth já é setado no construtor do Player
    player.health = player.maxHealth;
    player.shootTimer = 0;

    player.isShielded = false; player.shieldTimer = 0;
    player.rapidFireActive = false; player.rapidFireTimer = 0;
    player.damageBoostActive = false; player.damageBoostTimer = 0;

    setupWave(currentWave);
    updateUI();
    gameLoop();
}

function setupWave(waveNum) {
    waveDurationTicks = 0; // Reseta o contador de tempo da onda
    const settings = generateWaveSettings(waveNum);
    dragon = new Dragon(canvas.width / 2 - 50, 30, 100, 80, 'purple', settings.dragonHealth, settings.dragonAttackInterval, settings.dragonMoveSpeedBase);
    dragon.attackTimer = settings.dragonAttackInterval;
    if (waveNum > 1) {
        player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.22));
        updateUI();
    }
    playerProjectiles = []; dragonProjectiles = []; // Limpa projéteis, mas não power-ups (podem estar caindo)
    updateUI();
}

function nextWave() {
    currentWave++; waveTransition = true;
    victoryScreen.innerHTML = `<h2>Onda ${currentWave - 1} Concluída!</h2><p>Preparando Onda ${currentWave}...</p>`;
    victoryScreen.style.display = 'block';
    setTimeout(() => {
        victoryScreen.style.display = 'none';
        setupWave(currentWave);
        waveTransition = false;
        if (!gameOver) gameLoop();
    }, 2200);
}

function updateUI() {
    playerHealthUI.textContent = player.health;
    dragonHealthUI.textContent = dragon ? dragon.health : 'N/A';
    waveUI.textContent = currentWave;
    scoreUI.textContent = score;
}

function checkCollisions() {
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
        const p = playerProjectiles[i];
        if (dragon && p.x < dragon.x + dragon.width && p.x + p.width > dragon.x && p.y < dragon.y + dragon.height && p.y + p.height > dragon.y) {
            dragon.takeDamage(player.projectileDamage); playerProjectiles.splice(i, 1);
        }
    }
    for (let i = dragonProjectiles.length - 1; i >= 0; i--) {
        const p = dragonProjectiles[i];
        if (player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) {
            player.takeDamage(18); dragonProjectiles.splice(i, 1);
        }
    }
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        if (player.x < pu.x + pu.width && player.x + player.width > pu.x && player.y < pu.y + pu.height && player.y + player.height > pu.y) {
            player.activatePowerUp(pu.type);
            powerUps.splice(i, 1);
        }
    }
}

function triggerGameOver() {
    gameOver = true;
    gameOverScreen.innerHTML = `
        <h2>Fim de Jogo!</h2>
        <p>Você sobreviveu até a Onda ${currentWave}.</p>
        <p>Sua pontuação: <span id="finalScoreOver">${score}</span></p>
        <button id="restartButtonOver">Jogar Novamente</button>
    `;
    document.getElementById('finalScoreOver').textContent = score;
    gameOverScreen.style.display = 'block';
    document.getElementById('restartButtonOver').addEventListener('click', initGame);
}

function gameLoop() {
    if (gameOver || waveTransition) return;

    gameTickCounter++;    // Incrementa o contador global de ticks
    waveDurationTicks++;  // Incrementa o contador de ticks da onda atual

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentWaveSettings = generateWaveSettings(currentWave);

    player.update(currentWaveSettings);
    if (dragon) dragon.update(currentWaveSettings, player);

    powerUps = powerUps.filter(p => p.update()); // Atualiza e remove power-ups se necessário

    handleRandomGenericPowerUpSpawns(currentWaveSettings); // Tenta spawnar power-ups aleatórios genéricos
    handleStrategicPowerUpSpawns(); // Tenta spawnar Health/Shield estrategicamente

    playerProjectiles = playerProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    playerProjectiles.forEach(p => p.update());
    dragonProjectiles = dragonProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    dragonProjectiles.forEach(p => p.update());

    checkCollisions();
    updateUI();
    requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (!gameOver && (e.code === 'Space' || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

initGame();
