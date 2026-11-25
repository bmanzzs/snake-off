import * as THREE from 'three';

const GRID_SIZE = 20;
const TICK_RATE = 150;
const SNAKE_COLOR = 0x4CAF50;
const SNAKE_HEAD_COLOR = 0x8BC34A;
const APPLE_COLOR = 0xFF5252;
const BOARD_COLOR = 0x222222;
const BG_COLOR = 0x111111;

class Game {
    constructor() {
        this.initScene();
        this.initGame();
        this.initInputs();
        this.animate();
        this.runTickLoop();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(BG_COLOR);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(GRID_SIZE/2, GRID_SIZE, GRID_SIZE * 1.2);
        this.camera.lookAt(GRID_SIZE/2, 0, GRID_SIZE/2);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(GRID_SIZE/2, GRID_SIZE, 0);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const boardGeo = new THREE.BoxGeometry(GRID_SIZE, 0.5, GRID_SIZE);
        const boardMat = new THREE.MeshStandardMaterial({ color: BOARD_COLOR });
        this.board = new THREE.Mesh(boardGeo, boardMat);
        this.board.position.set(GRID_SIZE/2 - 0.5, -0.25, GRID_SIZE/2 - 0.5);
        this.board.receiveShadow = true;
        this.scene.add(this.board);

        const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x444444, 0x333333);
        grid.position.set(GRID_SIZE/2 - 0.5, 0, GRID_SIZE/2 - 0.5);
        this.scene.add(grid);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    initGame() {
        this.snake = [];
        this.direction = { x: 1, z: 0 };
        this.nextDirection = { x: 1, z: 0 };
        this.score = 0;
        this.isGameOver = false;
        this.lastTick = 0;

        this.spawnSnake();
        this.spawnApple();

        this.scoreEl = document.getElementById('score');
        this.gameOverEl = document.getElementById('game-over');
        this.restartBtn = document.getElementById('restart-btn');
        this.restartBtn.onclick = () => this.restart();
        
        this.scoreEl.innerText = `Score: ${this.score}`;
        this.gameOverEl.classList.remove('visible');
    }

    spawnSnake() {
        const startPos = { x: 5, z: 10 };
        for (let i = 0; i < 3; i++) {
            this.addSnakeSegment(startPos.x - i, startPos.z);
        }
    }

    addSnakeSegment(x, z) {
        const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const mat = new THREE.MeshStandardMaterial({ color: this.snake.length === 0 ? SNAKE_HEAD_COLOR : SNAKE_COLOR });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.snake.push({ x, z, mesh });
    }

    spawnApple() {
        if (this.apple) this.scene.remove(this.apple.mesh);
        
        let x, z;
        do {
            x = Math.floor(Math.random() * GRID_SIZE);
            z = Math.floor(Math.random() * GRID_SIZE);
        } while (this.snake.some(seg => seg.x === x && seg.z === z));
        
        const geo = new THREE.SphereGeometry(0.4, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: APPLE_COLOR });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        
        this.apple = { x, z, mesh };
    }

    initInputs() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if ((key === 'arrowup' || key === 'w') && this.direction.z !== 1) this.nextDirection = { x: 0, z: -1 };
            if ((key === 'arrowdown' || key === 's') && this.direction.z !== -1) this.nextDirection = { x: 0, z: 1 };
            if ((key === 'arrowleft' || key === 'a') && this.direction.x !== 1) this.nextDirection = { x: -1, z: 0 };
            if ((key === 'arrowright' || key === 'd') && this.direction.x !== -1) this.nextDirection = { x: 1, z: 0 };
            if (this.isGameOver && (key === 'r' || key === 'Enter')) this.restart();
        });
    }

    runTickLoop(time) {
        requestAnimationFrame((t) => this.runTickLoop(t));
        if (this.isGameOver) return;
        if (time - this.lastTick > TICK_RATE) {
            this.tick();
            this.lastTick = time;
        }
    }

    tick() {
        this.direction = this.nextDirection;
        const head = this.snake[0];
        const newX = head.x + this.direction.x;
        const newZ = head.z + this.direction.z;

        if (newX < 0 || newX >= GRID_SIZE || newZ < 0 || newZ >= GRID_SIZE) {
            this.gameOver();
            return;
        }

        for (let i = 1; i < this.snake.length; i++) {
            if (this.snake[i].x === newX && this.snake[i].z === newZ) {
                this.gameOver();
                return;
            }
        }

        if (newX === this.apple.x && newZ === this.apple.z) {
            this.score += 10;
            this.scoreEl.innerText = `Score: ${this.score}`;
            this.grow();
            this.spawnApple();
            this.createParticles(this.apple.x, this.apple.z);
        }

        this.snake.unshift({
            x: newX,
            z: newZ,
            mesh: this.createSnakeMesh(true)
        });

        // Update old head to be body
        this.snake[1].mesh.material.color.set(SNAKE_COLOR);

        const tail = this.snake.pop();
        this.scene.remove(tail.mesh);

        this.updateMeshPositions();
    }

    createSnakeMesh(isHead) {
        const geo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
        const mat = new THREE.MeshStandardMaterial({ color: isHead ? SNAKE_HEAD_COLOR : SNAKE_COLOR });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        return mesh;
    }

    grow() {
        const tail = this.snake[this.snake.length - 1];
        this.addSnakeSegment(tail.x, tail.z);
    }

    updateMeshPositions() {
        this.snake.forEach(seg => {
            seg.mesh.position.set(seg.x, 0, seg.z);
        });
        if (this.apple) {
            this.apple.mesh.position.set(this.apple.x, 0, this.apple.z);
        }
    }

    createParticles(x, z) {
        for (let i = 0; i < 10; i++) {
            const pGeo = new THREE.SphereGeometry(0.1, 4, 4);
            const pMat = new THREE.MeshBasicMaterial({ color: APPLE_COLOR });
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.set(x, 0, z);
            this.scene.add(p);

            const vel = {
                x: (Math.random() - 0.5) * 0.2,
                y: Math.random() * 0.2,
                z: (Math.random() - 0.5) * 0.2
            };

            const animateP = () => {
                p.position.x += vel.x;
                p.position.y += vel.y;
                p.position.z += vel.z;
                p.scale.multiplyScalar(0.95);
                if (p.scale.x < 0.01) {
                    this.scene.remove(p);
                } else {
                    requestAnimationFrame(animateP);
                }
            };
            animateP();
        }
    }

    gameOver() {
        this.isGameOver = true;
        this.gameOverEl.classList.add('visible');
    }

    restart() {
        this.scene.children = this.scene.children.filter(c => 
            c instanceof THREE.AmbientLight || c instanceof THREE.DirectionalLight || c === this.board || c instanceof THREE.GridHelper
        );
        this.initGame();
        this.updateMeshPositions();
    }

    animate(time) {
        requestAnimationFrame((t) => this.animate(t));

        if (this.apple) {
            this.apple.mesh.rotation.y += 0.05;
            this.apple.mesh.position.y = Math.sin(time * 0.005) * 0.2;
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
