const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth');
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
// const victoryScreen = document.getElementById('victoryScreen'); // Não será mais usado para transição de onda

// Botão de Pausa (adicionar no HTML)
// <button id="pauseButton" style="position: absolute; top: 10px; right: 10px;">Pausar</button>
const pauseButton = document.getElementById('pauseButton'); // Certifique-se de que este botão existe no seu HTML

// Configurações do Jogo
canvas.width = 800;
canvas.height = 600;
const MAP_CENTER_X = canvas.width / 2;
const MAP_CENTER_Y = canvas.height * 0.3;

let player;
let dragon; // Pode ser null entre as ondas
let playerProjectiles = [];
let dragonProjectiles = [];
let particles = []; // Para explosões
let keys = {};
let score = 0;
let currentWave = 1;
let gameOver = false;
// let waveTransition = false; // Substituído por um sistema mais fluido
let isPaused = false;

// Mensagem de Transição de Onda
let waveClearMessage = "";
let waveClearMessageTimer = 0;
const WAVE_CLEAR_MESSAGE_DURATION = 180; // 3 segundos

// Power-ups
let powerUps = [];
const POWERUP_TYPES = { SHIELD: 'shield', RAPID_FIRE: 'rapid_fire', HEALTH_PACK: 'health_pack', DAMAGE_BOOST: 'damage_boost' };
const POWERUP_BASE_DURATION = 300; // 5 segundos

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

// --- Geração de Settings da Onda (sem grandes mudanças aqui) ---
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

    // Player
    settings.playerBaseProjectileSpeed = 7; // Velocidade base, evoluções somam a isso
    settings.playerBaseShootCooldown = 18; // Cooldown base, evoluções reduzem isso

    settings.playerProjectileSpeed = (player ? player.currentBaseProjectileSpeed : settings.playerBaseProjectileSpeed) + waveNum * 0.09; // Leve aumento por onda
    settings.playerShootCooldown = Math.max(2, (player ? player.currentBaseShootCooldown : settings.playerBaseShootCooldown) - waveNum * 0.25); // Leve redução por onda

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

    // Power-ups
    settings.powerUpDropChanceOnDefeat = Math.min(0.80, 0.12 + waveNum * 0.022);
    settings.randomPowerUpSpawnChancePerSecond = Math.min(0.06, 0.006 + waveNum * 0.0012);

    return settings;
}

// --- Classes GameObject, PowerUp --- (sem grandes mudanças)
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

// --- Partículas para Explosão ---
class Particle extends GameObject {
    constructor(x, y, size, color, velocity) {
        super(x, y, size, size, color);
        this.velocity = velocity;
        this.alpha = 1;
        this.friction = 0.98; // Atrito para desacelerar
        this.gravity = 0.08;  // Leve gravidade
    }

    update() {
        this.draw();
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.velocity.y += this.gravity; // Aplicar gravidade
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= 0.02;
        return this.alpha > 0; // Retorna false quando deve ser removida
    }

    draw() { // Sobrescreve para usar alpha
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.restore();
    }
}

function createExplosion(x, y, color = 'orange', count = 30) {
    for (let i = 0; i < count; i++) {
        const size = Math.random() * 5 + 2;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        const velocity = {
            x: Math.cos(angle) * speed,
            y: Math.sin(angle) * speed
        };
        particles.push(new Particle(x, y, size, color, velocity));
    }
}


// --- Classe Player (com evoluções) ---
class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.baseSpeed = speed; // Velocidade que pode ser aumentada por evoluções
        this.currentSpeed = speed;
        this.health = health;
        this.maxHealth = health;

        this.evolutionLevel = 0;
        this.evolutionColors = ['lime', 'deepskyblue', 'gold', 'fuchsia', 'white'];

        // Atributos base que são afetados pelas evoluções e settings da onda
        this.currentBaseProjectileSpeed = 7;
        this.currentBaseShootCooldown = 18;
        this.currentBaseProjectileDamage = 10;

        // Atributos finais usados no jogo
        this.actualShootCooldown = 20;
        this.actualProjectileSpeed = 7;
        this.actualProjectileDamage = 10;

        this.shootTimer = 0;
        this.isShielded = false; this.shieldTimer = 0;
        this.rapidFireActive = false; this.rapidFireTimer = 0;
        this.damageBoostActive = false; this.damageBoostTimer = 0;
    }

    evolve() {
        this.evolutionLevel++;
        // Aplicar bônus de evolução
        this.baseSpeed += 0.25;
        this.currentBaseProjectileSpeed += 0.3;
        this.currentBaseShootCooldown = Math.max(2, this.currentBaseShootCooldown * 0.92); // Reduz em 8%
        this.currentBaseProjectileDamage += 2;
        this.maxHealth += 15;
        this.health = this.maxHealth; // Cura total ao evoluir
        this.color = this.evolutionColors[Math.min(this.evolutionLevel, this.evolutionColors.length - 1)];

        console.log(`Player Evolved! Level: ${this.evolutionLevel}`);
        updateUI(); // Atualiza a UI para refletir a vida máxima/atual
    }

    update(settings) {
        // Atualizar atributos com base nas evoluções e settings da onda
        this.currentSpeed = this.baseSpeed;
        this.actualProjectileSpeed = this.currentBaseProjectileSpeed + (currentWave * 0.05); // Pequeno bônus da onda
        this.actualShootCooldown = Math.max(2, this.currentBaseShootCooldown - (currentWave * 0.15));
        this.actualProjectileDamage = this.currentBaseProjectileDamage;


        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) this.x -= this.currentSpeed;
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) this.x += this.currentSpeed;
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.55) this.y -= this.currentSpeed;
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 5) this.y += this.currentSpeed;

        this.updatePowerUpTimers();

        // Ajuste fino com power-ups
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
                this.shieldTimer = POWERUP_BASE_DURATION;
                break;
            case POWERUP_TYPES.RAPID_FIRE:
                this.rapidFireActive = true;
                this.rapidFireTimer = POWERUP_BASE_DURATION;
                break;
            case POWERUP_TYPES.HEALTH_PACK:
                this.health = this.maxHealth;
                updateUI();
                break;
            case POWERUP_TYPES.DAMAGE_BOOST:
                this.damageBoostActive = true;
                this.damageBoostTimer = POWERUP_BASE_DURATION;
                break;
        }
    }
    shoot(settings, projectileSpeed, projectileDamage) { // Recebe velocidade e dano finais
        let projWidth = settings.playerProjectileWidth;
        let projHeight = settings.playerProjectileHeight;
        let projColor = this.damageBoostActive ? 'orangered' : (this.color === 'lime' ? settings.playerProjectileColor : this.color); // Usa cor da evolução se não for a base

        if (Math.random() < settings.playerEmpoweredShotChance) {
            projWidth *= settings.playerEmpoweredShotSizeMultiplier;
            projHeight *= settings.playerEmpoweredShotSizeMultiplier;
            if (!this.damageBoostActive) projColor = 'gold';
        }
        // Passa o projectileDamage final para o construtor do projétil
        playerProjectiles.push(new Projectile(this.x + this.width / 2 - projWidth / 2, this.y, projWidth, projHeight, projColor, projectileSpeed, 'player', 0, 0, projectileDamage));
    }
    takeDamage(amount) {
        if (this.isShielded) { // Escudo absorve tudo por 5s
            return;
        }
        this.health -= amount; updateUI();
        if (this.health <= 0) { this.health = 0; triggerGameOver(); }
    }
}

// --- Classe Dragon (com animação de morte) ---
class Dragon extends GameObject {
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

        this.isDying = false;
        this.deathAnimationTimer = 0;
        this.TIME_TO_FADE_OUT = 45; // Ticks para a animação de morte
        this.hasTriggeredNextWave = false; // Para garantir que nextWave só é chamado uma vez
    }
    update(settings, playerRef) {
        if (this.isDying) {
            this.deathAnimationTimer++;
            // Simples fade out e encolhimento
            this.width *= 0.98;
            this.height *= 0.98;
            this.x += (super.width - this.width) / 2; // Centralizar enquanto encolhe
            this.y += (super.height - this.height) / 2;


            if (this.deathAnimationTimer % 5 === 0) { // Cria partículas durante a morte
                createExplosion(this.x + this.width / 2, this.y + this.height / 2, this.color, 2);
            }

            if (this.deathAnimationTimer >= this.TIME_TO_FADE_OUT) {
                if (!this.hasTriggeredNextWave) {
                    triggerSmoothNextWaveSetup();
                    this.hasTriggeredNextWave = true;
                }
                return false; // Indica que o dragão deve ser removido
            }
            this.draw(); // Desenha o dragão enquanto morre
            return true; // Continua existindo
        }

        // Lógica normal de update
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
        return true; // Continua existindo
    }

    // ... (handleCirclingState, performAttack, fireProjectile, standardAttack, tripleAttack como antes)
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
                if (this.isDying) return; // Não atirar se estiver morrendo
                const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
                this.fireProjectile(projSpawnX, projSpawnY, settings, false, shouldTarget, playerRef);
            }, i * 90);
        }
    }
    tripleAttack(settings, playerRef) {
        if (this.isDying) return; // Não atirar se estiver morrendo
        const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
        const spreadAngle = 18;
        this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90);
        setTimeout(() => { if (!this.isDying) this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle)}, 50);
        setTimeout(() => { if (!this.isDying) this.fireProjectile(projSpawnX, projSpawnY, settings, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle)}, 100);
    }


    takeDamage(amount) {
        if (this.isDying) return; // Não tomar dano se já estiver morrendo

        this.health -= amount; score += amount; updateUI();
        if (this.health <= 0 && !this.isDying) {
            this.health = 0;
            this.isDying = true;
            this.deathAnimationTimer = 0;
            createExplosion(this.x + this.width / 2, this.y + this.height / 2, 'red', 50); // Explosão maior na morte

            score += 100 * currentWave; // Bônus de score ao matar
            const waveDefeatSettings = generateWaveSettings(currentWave);
            if (Math.random() < waveDefeatSettings.powerUpDropChanceOnDefeat) {
                spawnPowerUp(this.x + this.width / 2, this.y + this.height / 2);
            }
            // Não chama nextWave diretamente, o update do dragão fará isso quando a animação terminar
        }
    }
}

// --- Classe Projectile (com dano) ---
class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0, damage = 10) { // Adicionado damage
        super(x, y, width, height, color);
        this.speed = speed; this.owner = owner; this.dx = dx; this.dy = dy;
        this.damage = damage; // Dano do projétil

        if (this.owner === 'player') { this.dy = -this.speed; this.dx = 0; }
        else { if (dx === 0 && dy === 0) { this.dy = this.speed; this.dx = 0; } }
    }
    update() { this.x += this.dx; this.y += this.dy; this.draw(); }
}

// --- Funções de Power-up (sem grandes mudanças) ---
function spawnPowerUp(x, y, specificType = null) {
    if (gameTickCounter - lastPowerUpSpawnGameTick < MIN_POWERUP_SPAWN_INTERVAL_TICKS) {
        return;
    }
    let type;
    if (specificType) type = specificType;
    else { const typeKeys = Object.values(POWERUP_TYPES); type = typeKeys[Math.floor(Math.random() * typeKeys.length)]; }
    powerUps.push(new PowerUp(x, y, type));
    lastPowerUpSpawnGameTick = gameTickCounter;
}
function handleRandomGenericPowerUpSpawns(settings) {
    randomPowerUpSpawnTimer--;
    if (randomPowerUpSpawnTimer <= 0) {
        randomPowerUpSpawnTimer = RANDOM_POWERUP_SPAWN_INTERVAL_CHECK;
        if (Math.random() < settings.randomPowerUpSpawnChancePerSecond) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            let availableTypes = [POWERUP_TYPES.RAPID_FIRE, POWERUP_TYPES.DAMAGE_BOOST];
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
            const typeToSpawn = (Math.random() < 0.55) ? POWERUP_TYPES.HEALTH_PACK : POWERUP_TYPES.SHIELD;
            spawnPowerUp(spawnX, -30, typeToSpawn);
        }
    }
}

// --- Funções de Jogo e Onda ---
function initGame() {
    gameOver = false;
    isPaused = false;
    score = 0;
    currentWave = 1;
    playerProjectiles = [];
    dragonProjectiles = [];
    powerUps = [];
    particles = [];
    keys = {};
    waveClearMessage = "";
    waveClearMessageTimer = 0;

    gameTickCounter = 0;
    waveDurationTicks = 0;
    lastPowerUpSpawnGameTick = -Infinity;
    randomPowerUpSpawnTimer = Math.floor(Math.random() * RANDOM_POWERUP_SPAWN_INTERVAL_CHECK);
    strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;

    gameOverScreen.style.display = 'none';
    // victoryScreen.style.display = 'none'; // Removido

    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 5, 100); // Velocidade inicial ajustada
    // Stats do player são definidos e atualizados em seu método update e evolve

    setupNewDragonForWave(currentWave); // Inicia o primeiro dragão
    updateUI();
    gameLoop();
}

function setupNewDragonForWave(waveNum) {
    waveDurationTicks = 0; // Reseta o contador de tempo da onda
    const settings = generateWaveSettings(waveNum);
    // Spawn o dragão um pouco acima da tela para ele "entrar"
    dragon = new Dragon(
        canvas.width / 2 - 50, // X inicial
        -100, // Y inicial (acima da tela)
        100, 80,
        `hsl(${Math.random() * 360}, 70%, 50%)`, // Cor aleatória para variedade
        settings.dragonHealth,
        settings.dragonAttackInterval,
        settings.dragonMoveSpeedBase
    );
    dragon.targetY = 30; // Posição Y final que ele deve alcançar
    // Limpa projéteis inimigos restantes (projéteis do jogador podem continuar)
    dragonProjectiles = [];
    updateUI();
}

function triggerSmoothNextWaveSetup() {
    currentWave++;
    waveClearMessage = `Você passou a Onda ${currentWave - 1}!`;
    waveClearMessageTimer = WAVE_CLEAR_MESSAGE_DURATION;

    // Verificar evolução do jogador
    if ((currentWave -1) % 5 === 0 && currentWave > 1) { // Evolui após onda 5, 10, 15...
        player.evolve();
    }

    // Recuperar um pouco de vida entre as ondas
    if (currentWave > 1 && player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.15));
        updateUI();
    }

    // Atraso para o próximo dragão aparecer
    setTimeout(() => {
        if (!gameOver) { // Só spawna se o jogo não acabou (ex: por tempo)
            setupNewDragonForWave(currentWave);
        }
    }, 1500); // 1.5 segundos de respiro
}


function updateUI() {
    playerHealthUI.textContent = `${player.health}/${player.maxHealth}`; // Mostra vida atual/máxima
    dragonHealthUI.textContent = dragon && !dragon.isDying ? dragon.health : '---';
    waveUI.textContent = currentWave;
    scoreUI.textContent = score;
    if (pauseButton) pauseButton.textContent = isPaused ? "Continuar" : "Pausar";
}

function checkCollisions() {
    // Projéteis do jogador vs Dragão
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
        const p = playerProjectiles[i];
        if (dragon && !dragon.isDying && p.x < dragon.x + dragon.width && p.x + p.width > dragon.x && p.y < dragon.y + dragon.height && p.y + p.height > dragon.y) {
            dragon.takeDamage(p.damage); // Usa o dano do projétil
            playerProjectiles.splice(i, 1);
        }
    }
    // Projéteis do Dragão vs Jogador
    for (let i = dragonProjectiles.length - 1; i >= 0; i--) {
        const p = dragonProjectiles[i];
        if (player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) {
            player.takeDamage(18); // Dano fixo do projétil do dragão (pode ser dinamizado)
            dragonProjectiles.splice(i, 1);
        }
    }
    // Jogador vs Power-ups
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
    isPaused = false; // Garante que não fique pausado na tela de game over
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

function drawWaveClearMessage() {
    if (waveClearMessageTimer > 0) {
        ctx.save();
        ctx.font = "bold 28px Arial";
        ctx.textAlign = "center";
        const alpha = Math.min(1, waveClearMessageTimer / (WAVE_CLEAR_MESSAGE_DURATION / 2)); // Fade in/out simples
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
        ctx.lineWidth = 2;

        const xPos = canvas.width / 2;
        const yPos = 60;

        ctx.strokeText(waveClearMessage, xPos, yPos);
        ctx.fillText(waveClearMessage, xPos, yPos);
        ctx.restore();
        waveClearMessageTimer--;
    }
}

function drawPauseScreen() {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 48px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("JOGO PAUSADO", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px Arial";
    ctx.fillText("Pressione ESC ou clique em 'Continuar' para voltar", canvas.width / 2, canvas.height / 2 + 50);
    ctx.restore();
}


function gameLoop() {
    if (gameOver) return;

    if (isPaused) {
        drawPauseScreen();
        requestAnimationFrame(gameLoop); // Continua chamando para poder despausar
        return;
    }

    gameTickCounter++;
    waveDurationTicks++;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentWaveSettings = generateWaveSettings(currentWave);

    player.update(currentWaveSettings);

    if (dragon) {
        // Se o dragão tem um targetY, ele está "entrando" na cena
        if (dragon.targetY && dragon.y < dragon.targetY) {
            dragon.y += 3; // Velocidade de entrada
            if (dragon.y >= dragon.targetY) {
                dragon.y = dragon.targetY;
                dragon.targetY = null; // Parou de entrar
            }
        }
        if (!dragon.update(currentWaveSettings, player)) { // Update retorna false se o dragão deve ser removido (após animação de morte)
            dragon = null; // Remove o dragão
        }
    }


    powerUps = powerUps.filter(p => p.update());
    particles = particles.filter(p => p.update()); // Atualiza e remove partículas

    handleRandomGenericPowerUpSpawns(currentWaveSettings);
    handleStrategicPowerUpSpawns();

    playerProjectiles = playerProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    playerProjectiles.forEach(p => p.update());
    dragonProjectiles = dragonProjectiles.filter(p => p.y + p.height > 0 && p.y < canvas.height && p.x + p.width > 0 && p.x < canvas.width);
    dragonProjectiles.forEach(p => p.update());

    checkCollisions();
    updateUI();
    drawWaveClearMessage(); // Desenha a mensagem de onda se ativa

    requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        if (!gameOver) { // Não pausa se for game over
            isPaused = !isPaused;
            updateUI(); // Atualiza texto do botão de pausa
        }
    } else {
        keys[e.code] = true;
    }

    if (!gameOver && !isPaused && (e.code === 'Space' || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code !== 'Escape') { // Não registra o keyup do ESC para o array 'keys'
        keys[e.code] = false;
    }
});

if (pauseButton) {
    pauseButton.addEventListener('click', () => {
        if (!gameOver) {
            isPaused = !isPaused;
            updateUI();
        }
    });
}

// Iniciar o jogo
initGame();
