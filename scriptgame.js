const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elementos da UI (ajustados para o seu HTML)
const playerHealthUI = document.getElementById('playerHealth');
const dragonHealthUI = document.getElementById('dragonHealth'); // Alterado de bossHealthUI
const waveUI = document.getElementById('wave');
const scoreUI = document.getElementById('score');
const gameOverScreen = document.getElementById('gameOverScreen');
const victoryScreen = document.getElementById('victoryScreen'); // Se for usar no futuro
const pauseButton = document.getElementById('pauseButton'); // Será null, pois não está no seu HTML

// Configurações do Jogo
canvas.width = 800;
canvas.height = 600;
const MAP_CENTER_X = canvas.width / 2;
const MAP_CENTER_Y = canvas.height * 0.3;

let player;
let boss = null; // Internamente ainda chamado de 'boss' para consistência do código
let enemies = [];
let playerProjectiles = [];
let enemyProjectiles = [];
let particles = [];
let keys = {};
let score = 0;
let currentWave = 1;
let gameOver = false;
let isPaused = false;

let waveClearMessage = "";
let waveClearMessageTimer = 0;
const WAVE_CLEAR_MESSAGE_DURATION = 180;

let powerUps = [];
const POWERUP_TYPES = {
    SHIELD: 'shield', RAPID_FIRE: 'rapid_fire', HEALTH_PACK: 'health_pack',
    DAMAGE_BOOST: 'damage_boost', FAST_REGEN: 'fast_regen'
};
const POWERUP_BASE_DURATION = 300; // 5 segundos
const FAST_REGEN_DURATION = 600; // 10 segundos

let gameTickCounter = 0;
let waveDurationTicks = 0;
let lastPowerUpSpawnGameTick = -Infinity;
const MIN_POWERUP_SPAWN_INTERVAL_TICKS = 240;

let randomPowerUpSpawnTimer = 0;
const RANDOM_POWERUP_SPAWN_INTERVAL_CHECK = 60;

let strategicPowerUpCheckTimer = 0;
const STRATEGIC_POWERUP_MIN_INTERVAL = 480;
const STRATEGIC_POWERUP_RANDOM_ADDITION = 480;

const PASSIVE_REGEN_AMOUNT_PER_SECOND = 5;
const PASSIVE_REGEN_PER_TICK = PASSIVE_REGEN_AMOUNT_PER_SECOND / 60;
const FAST_REGEN_MULTIPLIER = 3;

const ENEMY_TYPES = {
    GRUNT: 'grunt', DART: 'dart', SHOOTER: 'shooter'
};

// --- Função CRUCIAL ---
function generateWaveSettings(waveNum) {
    const settings = {
        playerProjectileWidth: 5,
        playerProjectileHeight: 10,
        playerProjectileColor: 'lime',
        playerEmpoweredShotChance: 0.1,
        playerEmpoweredShotSizeMultiplier: 1.8,

        dragonHealth: 1000 + (waveNum * 150),
        dragonMoveSpeedBase: 1 + (waveNum * 0.05),
        dragonAttackInterval: Math.max(40, 100 - waveNum * 3),
        projectileSpeedMultiplier: 1 + (waveNum * 0.03),
        numProjectiles: Math.min(5, 2 + Math.floor(waveNum / 5)),
        laserChance: 0.15 + Math.min(0.35, waveNum * 0.02),
        tripleAttackChance: 0.2 + Math.min(0.4, waveNum * 0.025),
        circlingChance: 0.1 + Math.min(0.3, waveNum * 0.015),
        circlingDuration: 300 + waveNum * 5,

        randomPowerUpSpawnChancePerSecond: 0.03 + Math.min(0.1, waveNum * 0.005)
    };
    return settings;
}

// --- Funções Auxiliares ---
function getRandomColor() {
    return `hsl(${Math.random() * 360}, 70%, 60%)`;
}

// --- Classes Base ---
class GameObject {
    constructor(x, y, width, height, color) {
        this.x = x; this.y = y; this.width = width; this.height = height; this.color = color;
        this.targetY = null;
        this.isDying = false;
        this.deathAnimationTimer = 0;
        this.TIME_TO_FADE_OUT = 30;
    }
    draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, this.width, this.height); }

    die(playSound = true) {
        if (this.isDying) return;
        this.isDying = true;
        this.deathAnimationTimer = 0;
        createExplosion(this.x + this.width / 2, this.y + this.height / 2, this.color, Math.max(5,Math.floor(this.width / 3)));
    }

    updateDeathAnimation() {
        if (!this.isDying) return false;

        this.deathAnimationTimer++;
        const scaleFactor = 1 - (this.deathAnimationTimer / this.TIME_TO_FADE_OUT);
        if (scaleFactor <= 0) return true;

        ctx.save();
        ctx.globalAlpha = Math.max(0, scaleFactor);
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.scale(scaleFactor, scaleFactor);
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();

        if (this.deathAnimationTimer % (Math.floor(this.TIME_TO_FADE_OUT / 5)) === 0) {
            createExplosion(this.x + this.width * Math.random(), this.y + this.height * Math.random(), this.color, 2);
        }
        return false;
    }
}

// --- PowerUps, Partículas ---
class PowerUp extends GameObject {
    constructor(x, y, type) {
        let width = 25, height = 25, color = 'yellow', symbol = "?";
        switch (type) {
            case POWERUP_TYPES.SHIELD: color = 'rgba(0, 191, 255, 0.9)'; symbol = "S"; break;
            case POWERUP_TYPES.RAPID_FIRE: color = 'rgba(50, 205, 50, 0.9)'; symbol = "R"; break;
            case POWERUP_TYPES.HEALTH_PACK: color = 'rgba(255, 105, 180, 0.9)'; symbol = "H"; break;
            case POWERUP_TYPES.DAMAGE_BOOST: color = 'rgba(255, 69, 0, 0.9)'; symbol = "D"; break;
            case POWERUP_TYPES.FAST_REGEN: color = 'rgba(144, 238, 144, 0.9)'; symbol = "R+"; break;
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

class Particle extends GameObject {
    constructor(x, y, size, color, velocity) {
        super(x, y, size, size, color);
        this.velocity = velocity; this.alpha = 1; this.friction = 0.98; this.gravity = 0.08;
    }
    update() {
        this.drawCustom();
        this.velocity.x *= this.friction; this.velocity.y *= this.friction;
        this.velocity.y += this.gravity; this.x += this.velocity.x; this.y += this.velocity.y;
        this.alpha -= 0.02; return this.alpha > 0;
    }
    drawCustom() {
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

// --- Classe Player ---
class Player extends GameObject {
    constructor(x, y, width, height, color, speed, health) {
        super(x, y, width, height, color);
        this.baseSpeed = speed;
        this.maxHealth = health;
        this.health = health;

        this.evolutionLevel = 0;
        this.evolutionColors = ['lime', 'deepskyblue', 'gold', 'fuchsia', 'white'];

        this.baseProjectileDamage = 10;
        this.currentBaseProjectileSpeed = 7;
        this.currentBaseShootCooldown = 18;

        this.currentSpeed = this.baseSpeed;
        this.actualProjectileDamage = this.baseProjectileDamage;
        this.actualProjectileSpeed = this.currentBaseProjectileSpeed;
        this.actualShootCooldown = this.currentBaseShootCooldown;

        this.shootTimer = 0;
        this.isShielded = false; this.shieldTimer = 0;
        this.rapidFireActive = false; this.rapidFireTimer = 0;
        this.damageBoostActive = false; this.damageBoostTimer = 0;
        this.fastRegenActive = false; this.fastRegenTimer = 0;
    }

    updateStatsForWave(waveNum) {
        this.actualProjectileDamage = this.baseProjectileDamage + ((waveNum -1) * 10);
    }

    evolve() {
        this.evolutionLevel++;
        this.baseSpeed += 0.3;
        this.currentBaseProjectileSpeed += 0.4;
        this.currentBaseShootCooldown = Math.max(2, this.currentBaseShootCooldown * 0.90);
        this.maxHealth += 20;
        this.health = this.maxHealth;
        this.color = this.evolutionColors[Math.min(this.evolutionLevel, this.evolutionColors.length - 1)];
        this.updateStatsForWave(currentWave);
        updateUI();
    }

    handleRegeneration() {
        if (this.health < this.maxHealth) {
            let currentRegenPerTick = PASSIVE_REGEN_PER_TICK;
            if (this.fastRegenActive) currentRegenPerTick *= FAST_REGEN_MULTIPLIER;
            const oldHealthInt = Math.floor(this.health);
            this.health = Math.min(this.maxHealth, this.health + currentRegenPerTick);
            if (Math.floor(this.health) !== oldHealthInt) updateUI();
        }
    }

    update(waveSettings) {
        this.handleRegeneration();

        this.currentSpeed = this.baseSpeed;
        let finalShootCooldown = this.currentBaseShootCooldown;
        let finalProjectileSpeed = this.currentBaseProjectileSpeed;
        let finalProjectileDamage = this.actualProjectileDamage;

        if ((keys['ArrowLeft'] || keys['KeyA']) && this.x > 0) this.x -= this.currentSpeed;
        if ((keys['ArrowRight'] || keys['KeyD']) && this.x < canvas.width - this.width) this.x += this.currentSpeed;
        if ((keys['ArrowUp'] || keys['KeyW']) && this.y > canvas.height * 0.55) this.y -= this.currentSpeed;
        if ((keys['ArrowDown'] || keys['KeyS']) && this.y < canvas.height - this.height - 5) this.y += this.currentSpeed;

        this.updatePowerUpTimers();

        if (this.rapidFireActive) finalShootCooldown = Math.max(2, finalShootCooldown / 2.2);
        if (this.damageBoostActive) finalProjectileDamage = Math.round(finalProjectileDamage * 1.8);

        if (this.shootTimer > 0) this.shootTimer--;
        if (keys['Space'] && this.shootTimer <= 0) {
            this.shoot(waveSettings, finalProjectileSpeed, finalProjectileDamage);
            this.shootTimer = finalShootCooldown;
        }
        this.draw();
        if (this.isShielded) this.drawShield();
    }
    updatePowerUpTimers() {
        if (this.shieldTimer > 0) { this.shieldTimer--; if (this.shieldTimer === 0) this.isShielded = false; }
        if (this.rapidFireTimer > 0) { this.rapidFireTimer--; if (this.rapidFireTimer === 0) this.rapidFireActive = false; }
        if (this.damageBoostTimer > 0) { this.damageBoostTimer--; if (this.damageBoostTimer === 0) this.damageBoostActive = false; }
        if (this.fastRegenTimer > 0) { this.fastRegenTimer--; if (this.fastRegenTimer === 0) this.fastRegenActive = false; }
    }
    drawShield() {
        ctx.strokeStyle = 'rgba(0, 220, 255, 0.7)'; ctx.lineWidth = 4; ctx.beginPath();
        const pulse = Math.sin(Date.now() / 180) * 2.5;
        ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width * 0.75 + pulse, 0, Math.PI * 2);
        ctx.stroke(); ctx.lineWidth = 1;
    }
    activatePowerUp(type) {
        switch (type) {
            case POWERUP_TYPES.SHIELD: this.isShielded = true; this.shieldTimer = POWERUP_BASE_DURATION; break;
            case POWERUP_TYPES.RAPID_FIRE: this.rapidFireActive = true; this.rapidFireTimer = POWERUP_BASE_DURATION; break;
            case POWERUP_TYPES.HEALTH_PACK: this.health = Math.min(this.maxHealth, this.health + 50); updateUI(); break;
            case POWERUP_TYPES.DAMAGE_BOOST: this.damageBoostActive = true; this.damageBoostTimer = POWERUP_BASE_DURATION; break;
            case POWERUP_TYPES.FAST_REGEN: this.fastRegenActive = true; this.fastRegenTimer = FAST_REGEN_DURATION; break;
        }
    }
    shoot(waveSettings, projectileSpeed, projectileDamage) {
        let projWidth = waveSettings.playerProjectileWidth;
        let projHeight = waveSettings.playerProjectileHeight;
        let projColor = this.damageBoostActive ? 'orangered' : (this.evolutionLevel > 0 ? this.color : waveSettings.playerProjectileColor);

        if (Math.random() < waveSettings.playerEmpoweredShotChance) {
            projWidth *= waveSettings.playerEmpoweredShotSizeMultiplier;
            projHeight *= waveSettings.playerEmpoweredShotSizeMultiplier;
            if (!this.damageBoostActive) projColor = 'gold';
            projectileDamage = Math.round(projectileDamage * 1.5);
        }
        playerProjectiles.push(new Projectile(this.x + this.width / 2 - projWidth / 2, this.y, projWidth, projHeight, projColor, projectileSpeed, 'player', 0, 0, projectileDamage));
    }
    takeDamage(amount) {
        if (this.isShielded) return;
        this.health -= amount; updateUI();
        if (this.health <= 0) { this.health = 0; triggerGameOver(); }
    }
}

// --- Classes de Inimigos ---
class BaseEnemy extends GameObject {
    constructor(x, y, width, height, color, health, speed, value) {
        super(x, y, width, height, color);
        this.health = health;
        this.speed = speed;
        this.value = value;
        this.TIME_TO_FADE_OUT = 20;
    }

    takeDamage(amount) {
        if (this.isDying) return;
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
            score += this.value;
            updateUI();
            if (Math.random() < 0.08) {
                spawnPowerUp(this.x + this.width / 2, this.y + this.height / 2);
            }
        }
    }
    update(playerRef) {
        if (this.isDying) return this.updateDeathAnimation();

        if (this.targetY !== null && this.y < this.targetY) {
            this.y += this.speed * 0.8;
            if (this.y >= this.targetY) {
                this.y = this.targetY;
                this.targetY = null;
            }
        }
        this.draw();
        return false;
    }
}

class GruntEnemy extends BaseEnemy {
    constructor(x, y) {
        super(x, y, 30, 30, 'lightcoral', 20 + currentWave * 5, 1.5 + currentWave * 0.1, 10);
        this.shootCooldown = Math.max(30, 120 - Math.min(60, currentWave * 3));
        this.shootTimer = Math.random() * this.shootCooldown;
        this.moveDirection = Math.random() < 0.5 ? 1 : -1;
        this.changeDirectionTimer = 180;
    }

    update(playerRef) {
        if (super.update(playerRef)) return true;

        if (this.targetY === null) {
            this.x += this.speed * 0.5 * this.moveDirection;
            if (this.x <= 0 || this.x + this.width >= canvas.width) {
                this.moveDirection *= -1;
                this.x = Math.max(0, Math.min(this.x, canvas.width - this.width));
            }
            this.changeDirectionTimer--;
            if (this.changeDirectionTimer <= 0) {
                this.moveDirection = Math.random() < 0.5 ? 1 : -1;
                this.changeDirectionTimer = 120 + Math.random() * 120;
            }

            this.shootTimer--;
            if (this.shootTimer <= 0) {
                enemyProjectiles.push(new Projectile(this.x + this.width / 2 - 3, this.y + this.height, 6, 12, 'pink', 3 + currentWave * 0.1, 'enemy_grunt', 0, 0, 5 + currentWave));
                this.shootTimer = this.shootCooldown;
            }
        }
        return false;
    }
}

class DartEnemy extends BaseEnemy {
    constructor(x, y) {
        super(x, y, 20, 20, 'yellowgreen', 10 + currentWave * 3, 2.5 + currentWave * 0.15, 15);
        this.angleToPlayer = 0;
        this.chargeTimer = 90;
        this.isCharging = false;
    }
    update(playerRef) {
        if (super.update(playerRef)) return true;

        if (this.targetY === null) {
            if (!this.isCharging) {
                this.chargeTimer--;
                if (this.chargeTimer <= 0) {
                    this.isCharging = true;
                    this.angleToPlayer = Math.atan2(playerRef.y - this.y, playerRef.x - this.x);
                }
                this.x += Math.sin(gameTickCounter * 0.05 + this.x + this.y) * 0.5;
            } else {
                this.x += Math.cos(this.angleToPlayer) * this.speed * 1.5;
                this.y += Math.sin(this.angleToPlayer) * this.speed * 1.5;
            }
            if (playerRef.x < this.x + this.width && playerRef.x + playerRef.width > this.x &&
                playerRef.y < this.y + this.height && playerRef.y + playerRef.height > this.y) {
                playerRef.takeDamage(15 + currentWave * 2);
                this.die(false);
                return true;
            }
        }
        if (this.y > canvas.height + 50 || this.x < -50 || this.x > canvas.width + 50) return true;
        return false;
    }
}

class ShooterEnemy extends BaseEnemy {
    constructor(x, y) {
        super(x, y, 35, 35, 'skyblue', 30 + currentWave * 7, 0.5 + currentWave * 0.05, 20);
        this.shootCooldown = Math.max(45, 150 - Math.min(90, currentWave * 4));
        this.shootTimer = Math.random() * this.shootCooldown;
        this.targetAngle = 0;
        this.currentAngle = Math.PI / 2;
        this.turnSpeed = 0.02;
    }

    update(playerRef) {
        if (super.update(playerRef)) return true;

        if (this.targetY === null) {
            this.targetAngle = Math.atan2(playerRef.y - (this.y + this.height / 2), playerRef.x - (this.x + this.width / 2));
            let diff = this.targetAngle - this.currentAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            if (Math.abs(diff) < this.turnSpeed) {
                this.currentAngle = this.targetAngle;
            } else {
                this.currentAngle += Math.sign(diff) * this.turnSpeed;
            }

            this.shootTimer--;
            if (this.shootTimer <= 0 && Math.abs(diff) < 0.2) {
                const projSpeed = 3.5 + currentWave * 0.15;
                const dx = Math.cos(this.currentAngle) * projSpeed;
                const dy = Math.sin(this.currentAngle) * projSpeed;
                enemyProjectiles.push(new Projectile(
                    this.x + this.width / 2 - 4 + dx * 3,
                    this.y + this.height / 2 - 4 + dy * 3,
                    8, 8, 'dodgerblue', projSpeed, 'enemy_shooter', dx, dy, 8 + currentWave * 1.5));
                this.shootTimer = this.shootCooldown;
            }
        }
        this.draw();
        return false;
    }
    draw() {
        super.draw();
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.rotate(this.currentAngle - Math.PI/2);
        ctx.fillStyle = "darkgrey";
        ctx.fillRect(-2, -this.height/2 - 5, 4, 10);
        ctx.restore();
    }
}


// --- Classe Boss (Dragão) ---
class BossDragon extends BaseEnemy {
    constructor(x, y, waveNum) {
        const settings = generateWaveSettings(waveNum);
        super(x, y, 100, 80, getRandomColor(), settings.dragonHealth, settings.dragonMoveSpeedBase, 250 * waveNum);
        this.maxHealth = settings.dragonHealth; // Usado para UI
        this.attackIntervalBase = settings.dragonAttackInterval;
        this.attackTimer = this.attackIntervalBase;
        this.projectileSpeedMultiplier = settings.projectileSpeedMultiplier;
        this.numProjectiles = settings.numProjectiles;
        this.laserChance = settings.laserChance;
        this.tripleAttackChance = settings.tripleAttackChance;
        this.circlingChance = settings.circlingChance;
        this.circlingDuration = settings.circlingDuration;

        this.moveDirection = 1;
        this.moveRange = { minX: 20, maxX: canvas.width - this.width - 20 };
        this.isCircling = false; this.circlingTimer = 0;
        this.circlingCheckInterval = 270;
        this.circlingCheckTimer = Math.random() * this.circlingCheckInterval;
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.orbitRadius = canvas.width * 0.3;
        this.orbitSpeed = 0.012;
        this.targetYDuringCircling = MAP_CENTER_Y;

        this.hasTriggeredNextWave = false;
        this.TIME_TO_FADE_OUT = 90;
    }

    update(playerRef) {
        if (this.isDying) {
            if (this.updateDeathAnimation()) {
                 if (!this.hasTriggeredNextWave) {
                    triggerSmoothNextWaveSetup();
                    this.hasTriggeredNextWave = true;
                }
                return true;
            }
            updateUI();
            return false;
        }


        if (this.targetY !== null && this.y < this.targetY) {
            this.y += 2;
            if (this.y >= this.targetY) {
                this.y = this.targetY;
                this.targetY = null;
            }
        } else if (this.targetY === null) {
            this.handleCirclingState();
            if (!this.isCircling) {
                const currentMoveSpeed = this.speed * this.projectileSpeedMultiplier;
                this.x += currentMoveSpeed * this.moveDirection;
                if (this.x <= this.moveRange.minX && this.moveDirection === -1) { this.moveDirection = 1; this.x = this.moveRange.minX; }
                else if (this.x >= this.moveRange.maxX && this.moveDirection === 1) { this.moveDirection = -1; this.x = this.moveRange.maxX; }
            } else {
                this.orbitAngle += this.orbitSpeed * this.projectileSpeedMultiplier;
                const targetX = MAP_CENTER_X + this.orbitRadius * Math.cos(this.orbitAngle) - this.width / 2;
                const targetYOrbit = this.targetYDuringCircling + (this.orbitRadius * 0.2) * Math.sin(this.orbitAngle * 2.5) - this.height / 2;
                this.x += (targetX - this.x) * 0.06; this.y += (targetYOrbit - this.y) * 0.06;
                this.y = Math.max(10, Math.min(this.y, canvas.height * 0.5 - this.height));
            }
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.performAttack(playerRef);
                this.attackTimer = this.attackIntervalBase / (this.isCircling ? 1.3 : 1);
            }
        }
        this.draw();
        updateUI();
        return false;
    }
    handleCirclingState() { if (this.isCircling) { this.circlingTimer--; if (this.circlingTimer <= 0) { this.isCircling = false; this.circlingCheckTimer = this.circlingCheckInterval; } } else { this.circlingCheckTimer--; if (this.circlingCheckTimer <= 0) { this.circlingCheckTimer = this.circlingCheckInterval; if (Math.random() < this.circlingChance) { this.isCircling = true; this.circlingTimer = this.circlingDuration; this.orbitAngle = Math.random() * Math.PI * 2; } } } }
    performAttack(playerRef) { const roll = Math.random(); if (roll < this.tripleAttackChance) this.tripleAttack(playerRef); else this.standardAttack(playerRef); }
    fireBossProjectile(posX, posY, isLaserOverride = false, targetPlayer = false, playerRef = null, fixedAngleDeg = null) {
        if (this.isDying) return;
        let pColor = 'orange', pWidth = 10, pHeight = 10, pBaseSpeed = 3, dx = 0, dy = 0;
        let damage = 15 + currentWave;
        if (isLaserOverride || Math.random() < this.laserChance) {
            pColor = 'red'; pWidth = 5; pHeight = 20; pBaseSpeed = 5; damage = 20 + currentWave * 1.5;
        }
        const actualSpeed = pBaseSpeed * this.projectileSpeedMultiplier;
        if (targetPlayer && playerRef) {
            const angleToPlayer = Math.atan2((playerRef.y + playerRef.height / 2) - (posY + pHeight / 2), (playerRef.x + playerRef.width / 2) - (posX + pWidth / 2));
            dx = Math.cos(angleToPlayer) * actualSpeed; dy = Math.sin(angleToPlayer) * actualSpeed;
        } else if (fixedAngleDeg !== null) {
            const angleRad = fixedAngleDeg * (Math.PI / 180);
            dx = Math.cos(angleRad) * actualSpeed; dy = Math.sin(angleRad) * actualSpeed;
        } else { dy = actualSpeed; dx = 0; }
        enemyProjectiles.push(new Projectile(posX - pWidth / 2, posY, pWidth, pHeight, pColor, actualSpeed, 'enemy_boss', dx, dy, damage));
    }
    standardAttack(playerRef) {
        const shouldTarget = this.isCircling || Math.random() < 0.4;
        const numProjs = this.isCircling ? Math.max(1, this.numProjectiles -1) : this.numProjectiles;
        for (let i = 0; i < numProjs; i++) {
            setTimeout(() => {
                if (this.isDying) return;
                const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
                this.fireBossProjectile(projSpawnX, projSpawnY, false, shouldTarget, playerRef);
            }, i * (this.isCircling ? 120 : 90) );
        }
    }
    tripleAttack(playerRef) {
        if (this.isDying) return;
        const projSpawnX = this.x + this.width / 2; const projSpawnY = this.y + this.height;
        const spreadAngle = 18;
        this.fireBossProjectile(projSpawnX, projSpawnY, false, this.isCircling, playerRef, this.isCircling ? null : 90);
        setTimeout(() => { if (!this.isDying) this.fireBossProjectile(projSpawnX, projSpawnY, false, this.isCircling, playerRef, this.isCircling ? null : 90 - spreadAngle)}, 50);
        setTimeout(() => { if (!this.isDying) this.fireBossProjectile(projSpawnX, projSpawnY, false, this.isCircling, playerRef, this.isCircling ? null : 90 + spreadAngle)}, 100);
    }
}


// --- Classe Projectile ---
class Projectile extends GameObject {
    constructor(x, y, width, height, color, speed, owner, dx = 0, dy = 0, damage = 10) {
        super(x, y, width, height, color);
        this.speed = speed; this.owner = owner; this.dx = dx; this.dy = dy; this.damage = damage;
        if (this.owner === 'player') { this.dy = -this.speed; this.dx = 0; }
        else if (this.owner === 'enemy_grunt') { this.dy = this.speed; this.dx = 0; }
    }
    update() {
        this.x += this.dx; this.y += this.dy;
        this.draw();
        if (this.y + this.height < 0 || this.y > canvas.height || this.x + this.width < 0 || this.x > canvas.width) {
            return true;
        }
        return false;
    }
}


// --- Funções de Power-up ---
function spawnPowerUp(x, y, specificType = null) {
    if (gameTickCounter - lastPowerUpSpawnGameTick < MIN_POWERUP_SPAWN_INTERVAL_TICKS && !specificType) return;
    let type;
    if (specificType) type = specificType;
    else { const typeKeys = Object.values(POWERUP_TYPES); type = typeKeys[Math.floor(Math.random() * typeKeys.length)]; }
    powerUps.push(new PowerUp(x, y, type));
    if (!specificType) lastPowerUpSpawnGameTick = gameTickCounter;
}
function handleRandomGenericPowerUpSpawns(waveSettings) {
    randomPowerUpSpawnTimer--;
    if (randomPowerUpSpawnTimer <= 0) {
        randomPowerUpSpawnTimer = RANDOM_POWERUP_SPAWN_INTERVAL_CHECK;
        if (Math.random() < waveSettings.randomPowerUpSpawnChancePerSecond / (60 / RANDOM_POWERUP_SPAWN_INTERVAL_CHECK) ) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            let availableTypes = [POWERUP_TYPES.RAPID_FIRE, POWERUP_TYPES.DAMAGE_BOOST, POWERUP_TYPES.FAST_REGEN];
            if (player.health < player.maxHealth * 0.5) availableTypes.push(POWERUP_TYPES.HEALTH_PACK);
            const typeToSpawn = availableTypes[Math.floor(Math.random() * availableTypes.length)];
            if (typeToSpawn) spawnPowerUp(spawnX, -30, typeToSpawn);
        }
    }
}
function handleStrategicPowerUpSpawns() {
    strategicPowerUpCheckTimer--;
    if (strategicPowerUpCheckTimer <= 0) {
        strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;
        let baseChance = 0.02 + (currentWave -1) * 0.015;
        if (currentWave >= 5) baseChance += 0.07;
        if (currentWave >= 9 && waveDurationTicks > 3000) baseChance += 0.12;
        if (currentWave >= 12 && waveDurationTicks > 4200) baseChance += 0.06;
        baseChance = Math.min(baseChance, 0.45);

        if (Math.random() < baseChance) {
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            const randType = Math.random(); let typeToSpawn;
            if (player.health < player.maxHealth * 0.6 || randType < 0.45) typeToSpawn = POWERUP_TYPES.HEALTH_PACK;
            else if (randType < 0.85) typeToSpawn = POWERUP_TYPES.SHIELD;
            else typeToSpawn = POWERUP_TYPES.FAST_REGEN;
            spawnPowerUp(spawnX, -30, typeToSpawn);
        }
    }
}

// --- Funções de Jogo e Onda ---
function initGame() {
    gameOver = false; isPaused = false; score = 0; currentWave = 1;
    playerProjectiles = []; enemyProjectiles = []; powerUps = []; particles = []; enemies = []; keys = {};
    boss = null;
    waveClearMessage = ""; waveClearMessageTimer = 0;

    gameTickCounter = 0; waveDurationTicks = 0; lastPowerUpSpawnGameTick = -Infinity;
    randomPowerUpSpawnTimer = Math.floor(Math.random() * RANDOM_POWERUP_SPAWN_INTERVAL_CHECK);
    strategicPowerUpCheckTimer = STRATEGIC_POWERUP_MIN_INTERVAL + Math.random() * STRATEGIC_POWERUP_RANDOM_ADDITION;

    gameOverScreen.style.display = 'none';
    gameOverScreen.innerHTML = '';
    if (victoryScreen) victoryScreen.style.display = 'none'; // Se existir

    player = new Player(canvas.width / 2 - 25, canvas.height - 70, 50, 30, 'lime', 5, 100);

    setupWaveContent(currentWave);
    updateUI();
    if (!gameLoopRequestId) {
        gameLoop();
    }
}
let gameLoopRequestId;

function setupWaveContent(waveNum) {
    waveDurationTicks = 0;
    player.updateStatsForWave(waveNum);
    enemies = [];
    boss = null;

    const waveSettings = generateWaveSettings(waveNum);

    if (waveNum % 5 === 0) {
        boss = new BossDragon(canvas.width / 2 - 50, -120, waveNum);
        boss.targetY = 30;
    } else {
        const numEnemiesToSpawn = 3 + Math.floor(waveNum / 2) + Math.floor(waveNum / 4);
        for (let i = 0; i < numEnemiesToSpawn; i++) {
            const enemyTypeRoll = Math.random();
            let newEnemy;
            const spawnX = Math.random() * (canvas.width - 60) + 30;
            const spawnY = - (Math.random() * 100 + 30);

            if (enemyTypeRoll < 0.40) newEnemy = new GruntEnemy(spawnX, spawnY);
            else if (enemyTypeRoll < 0.70) newEnemy = new DartEnemy(spawnX, spawnY);
            else newEnemy = new ShooterEnemy(spawnX, spawnY);
            
            newEnemy.targetY = Math.random() * (canvas.height * 0.3) + 40;
            enemies.push(newEnemy);
        }
    }
    updateUI();
}

function triggerSmoothNextWaveSetup() {
    currentWave++;
    waveClearMessage = `Onda ${currentWave - 1} Concluída!`;
    waveClearMessageTimer = WAVE_CLEAR_MESSAGE_DURATION;

    if ((currentWave -1) % 5 === 0 && currentWave > 1 && (currentWave-1) / 5 > player.evolutionLevel ) {
        player.evolve();
        waveClearMessage += " Você evoluiu!";
    }
    if (player.health < player.maxHealth) {
        player.health = Math.min(player.maxHealth, player.health + Math.floor(player.maxHealth * 0.20));
    }
    updateUI();

    setTimeout(() => {
        if (!gameOver) {
            waveClearMessage = "";
            setupWaveContent(currentWave);
        }
    }, WAVE_CLEAR_MESSAGE_DURATION * (1000/60) + 1000);
}


function updateUI() {
    if (!player) return;
    playerHealthUI.textContent = `${Math.floor(player.health)}/${player.maxHealth}`;
    
    // Ajustado para dragonHealthUI e para mostrar/esconder o <p> pai
    const dragonHealthParagraph = dragonHealthUI ? dragonHealthUI.parentElement : null;

    if (dragonHealthUI && dragonHealthParagraph) {
        if (boss && !boss.isDying) {
            dragonHealthUI.textContent = `${boss.health}/${boss.maxHealth}`;
            dragonHealthParagraph.style.display = 'block';
        } else if (boss && boss.isDying) {
            dragonHealthUI.textContent = `DERROTANDO...`;
            dragonHealthParagraph.style.display = 'block';
        } else {
            dragonHealthUI.textContent = `---`; // Ou o valor que você tinha antes
            dragonHealthParagraph.style.display = 'none';
        }
    }

    waveUI.textContent = currentWave;
    scoreUI.textContent = score;

    // Lida com a ausência do botão de pausa
    // if (pauseButton) pauseButton.textContent = isPaused ? "Continuar" : "Pausar";
    // Não há botão de pausa no seu HTML, então esta linha é removida/comentada.
    // A interface do usuário para o estado de pausa (se houver) seria apenas a tela de pausa no canvas.
}

function checkCollisions() {
    // Projéteis do jogador vs Inimigos Menores
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
        const p = playerProjectiles[i];
        if (!p) continue;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            if (!enemy || enemy.isDying) continue;
            if (p.x < enemy.x + enemy.width && p.x + p.width > enemy.x &&
                p.y < enemy.y + enemy.height && p.y + p.height > enemy.y) {
                enemy.takeDamage(p.damage);
                playerProjectiles.splice(i, 1);
                break;
            }
        }
    }
    // Projéteis do jogador vs Boss
    if (boss && !boss.isDying) {
        for (let i = playerProjectiles.length - 1; i >= 0; i--) {
            const p = playerProjectiles[i];
            if (!p) continue;
            if (p.x < boss.x + boss.width && p.x + p.width > boss.x &&
                p.y < boss.y + boss.height && p.y + p.height > boss.y) {
                boss.takeDamage(p.damage); // Dano é propriedade do projétil
                playerProjectiles.splice(i, 1);
            }
        }
    }

    // Projéteis Inimigos vs Jogador
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
        const p = enemyProjectiles[i];
        if (!p) continue;
        if (player.x < p.x + p.width && player.x + player.width > p.x &&
            player.y < p.y + p.height && player.y + player.height > p.y) {
            player.takeDamage(p.damage);
            enemyProjectiles.splice(i, 1);
        }
    }
    // Jogador vs Power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
        const pu = powerUps[i];
        if (!pu) continue;
        if (player.x < pu.x + pu.width && player.x + player.width > pu.x &&
            player.y < pu.y + pu.height && player.y + player.height > pu.y) {
            player.activatePowerUp(pu.type);
            powerUps.splice(i, 1);
        }
    }
}

function triggerGameOver() {
    gameOver = true; isPaused = false;
    if (gameLoopRequestId) cancelAnimationFrame(gameLoopRequestId);
    gameLoopRequestId = null;

    gameOverScreen.innerHTML = `<h2>Fim de Jogo!</h2><p>Você sobreviveu até a Onda ${currentWave}.</p><p>Sua pontuação: <span id="finalScoreOver">${score}</span></p><button id="restartButtonOver">Jogar Novamente</button>`;
    gameOverScreen.style.display = 'block';
    
    const restartButton = document.getElementById('restartButtonOver');
    if(restartButton){
        restartButton.replaceWith(restartButton.cloneNode(true));
        document.getElementById('restartButtonOver').addEventListener('click', initGame, { once: true });
    }
    // updateUI(); // Não precisa mais atualizar o botão de pausa
}


function drawWaveClearMessage() {
    if (waveClearMessageTimer > 0 && waveClearMessage) {
        ctx.save(); ctx.font = "bold 28px Arial"; ctx.textAlign = "center";
        const alpha = Math.min(1, waveClearMessageTimer / (WAVE_CLEAR_MESSAGE_DURATION / 2));
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`; ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.7})`;
        ctx.lineWidth = 2; const xPos = canvas.width / 2; const yPos = 80;
        ctx.strokeText(waveClearMessage, xPos, yPos); ctx.fillText(waveClearMessage, xPos, yPos);
        ctx.restore(); waveClearMessageTimer--;
        if(waveClearMessageTimer <= 0) waveClearMessage = "";
    }
}

function drawPauseScreen() {
    ctx.save(); ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 48px Arial"; ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("JOGO PAUSADO", canvas.width / 2, canvas.height / 2);
    ctx.font = "24px Arial"; ctx.fillText("Pressione ESC para continuar", canvas.width / 2, canvas.height / 2 + 50);
    ctx.restore();
}

function gameLoop() {
    if (gameOver) return;

    if (isPaused) {
        drawPauseScreen();
        gameLoopRequestId = requestAnimationFrame(gameLoop);
        return;
    }

    gameTickCounter++; waveDurationTicks++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentWaveSettings = generateWaveSettings(currentWave);

    player.update(currentWaveSettings);

    if (boss) {
        if (boss.update(player)) {
            boss = null;
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        if (enemies[i].update(player) || enemies[i].y > canvas.height + enemies[i].height * 2) {
            enemies.splice(i, 1);
        }
    }

    if (!boss && enemies.length === 0 && waveClearMessageTimer <= 0 && !gameOver) {
        const isBossWaveJustEnded = (currentWave % 5 === 0);
        if (!isBossWaveJustEnded || (isBossWaveJustEnded && boss === null)) {
             if (!waveClearMessage && waveClearMessageTimer <= 0) {
                 triggerSmoothNextWaveSetup();
             }
        }
    }

    powerUps = powerUps.filter(p => p.update());
    particles = particles.filter(p => p.update());
    
    handleRandomGenericPowerUpSpawns(currentWaveSettings);
    handleStrategicPowerUpSpawns();

    playerProjectiles = playerProjectiles.filter(p => !p.update());
    enemyProjectiles = enemyProjectiles.filter(p => !p.update());

    checkCollisions();
    updateUI();
    drawWaveClearMessage();
    
    gameLoopRequestId = requestAnimationFrame(gameLoop);
}

// Event Listeners
window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        if (!gameOver) {
            isPaused = !isPaused;
            // updateUI(); // Não há botão de pausa para atualizar
        }
    } else {
        keys[e.code] = true;
    }
    if (!gameOver && !isPaused && (e.code === 'Space' || e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code))) {
        e.preventDefault();
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code !== 'Escape') {
        keys[e.code] = false;
    }
});

// Não há botão de pausa no seu HTML para adicionar listener.
// if (pauseButton) {
//     pauseButton.addEventListener('click', () => {
//         if (!gameOver) {
//             isPaused = !isPaused;
//             updateUI();
//         }
//     });
// }

// Iniciar o jogo
initGame();
