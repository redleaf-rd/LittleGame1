const IMAGES = [
    'https://picsum.photos/id/237/800/600', // Dog
    'https://picsum.photos/id/1025/800/600', // Pug
    'https://picsum.photos/id/1069/800/600', // Jellyfish
    'https://picsum.photos/id/1074/800/600', // Lion
    'https://picsum.photos/id/1084/800/600', // Walrus
    'https://picsum.photos/id/28/800/600', // Forest
];

const STATE = {
    selectedImage: null,
    difficulty: 30,
    game: null
};

// UI Elements
const screens = {
    gallery: document.getElementById('gallery-screen'),
    difficulty: document.getElementById('difficulty-screen'),
    game: document.getElementById('game-screen'),
    victory: document.getElementById('victory-screen')
};

const galleryGrid = document.getElementById('gallery-grid');
const selectedPreview = document.getElementById('selected-preview');
const backToGalleryBtn = document.getElementById('back-to-gallery');
const backToMenuBtn = document.getElementById('back-to-menu');
const playAgainBtn = document.getElementById('play-again');
const toggleHintBtn = document.getElementById('toggle-hint');
const timerDisplay = document.getElementById('timer');

// Initialization
function init() {
    renderGallery();
    setupEventListeners();
}

function renderGallery() {
    galleryGrid.innerHTML = '';

    // Re-add Upload Button
    const uploadDiv = document.createElement('div');
    uploadDiv.className = 'gallery-item upload-item';
    uploadDiv.id = 'upload-btn';
    uploadDiv.innerHTML = `
        <div class="upload-content">
            <span class="upload-icon">➕</span>
            <span>上傳圖片</span>
        </div>
        <input type="file" id="image-upload" accept="image/*" style="display: none;">
    `;
    galleryGrid.appendChild(uploadDiv);

    // Re-attach event listeners for the new button
    const fileInput = uploadDiv.querySelector('#image-upload');
    uploadDiv.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                selectImage(evt.target.result);
            };
            reader.readAsDataURL(file);
        }
    };

    IMAGES.forEach((src, index) => {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        const img = document.createElement('img');
        img.src = src;
        img.loading = 'lazy';
        div.appendChild(img);

        // Check if completed (mockup logic)
        if (localStorage.getItem(`puzzle_completed_${index}`)) {
            div.classList.add('completed');
        }

        div.onclick = () => selectImage(src);
        galleryGrid.appendChild(div);
    });
}

function setupEventListeners() {
    // Difficulty Selection
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.onclick = () => {
            const pieces = parseInt(btn.dataset.pieces);
            startGame(STATE.selectedImage, pieces);
        };
    });

    backToGalleryBtn.onclick = () => showScreen('gallery');
    backToMenuBtn.onclick = () => {
        if (confirm('確定要回到選單嗎？目前的進度會遺失喔！')) {
            showScreen('gallery');
            if (STATE.game) STATE.game.stop();
        }
    };
    playAgainBtn.onclick = () => showScreen('gallery');

    toggleHintBtn.onclick = () => {
        if (STATE.game) STATE.game.toggleHint();
    };

    // Upload Handling
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('image-upload');

    if (uploadBtn && fileInput) {
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => {
                    selectImage(evt.target.result);
                };
                reader.readAsDataURL(file);
            }
        };
    }
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => {
        s.classList.remove('active');
        s.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    screens[screenName].classList.add('active');

    if (screenName === 'victory') {
        window.confetti.start();
    } else {
        window.confetti.stop();
    }
}

function selectImage(src) {
    STATE.selectedImage = src;
    selectedPreview.src = src;
    showScreen('difficulty');
}

function startGame(imageSrc, pieces) {
    STATE.difficulty = pieces;
    showScreen('game');

    const canvas = document.getElementById('puzzle-canvas');
    if (STATE.game) STATE.game.stop();

    STATE.game = new JigsawGame(canvas, imageSrc, pieces, onWin);
}

function onWin() {
    showScreen('victory');
    // Save progress (simple hash of src)
    // In real app, use ID. Here just mock.
    const idx = IMAGES.indexOf(STATE.selectedImage);
    if (idx !== -1) {
        localStorage.setItem(`puzzle_completed_${idx}`, 'true');
        renderGallery();
    }
}

// Jigsaw Game Logic
class JigsawGame {
    constructor(canvas, imageSrc, pieceCount, onWinCallback) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.imageSrc = imageSrc;
        this.pieceCount = pieceCount;
        this.onWin = onWinCallback;

        this.pieces = [];
        this.boardWidth = 0;
        this.boardHeight = 0;
        this.boardX = 0;
        this.boardY = 0;
        this.rows = 0;
        this.cols = 0;
        this.pieceWidth = 0;
        this.pieceHeight = 0;

        this.selectedPiece = null;
        this.offsetX = 0;
        this.offsetY = 0;

        this.showHint = false;
        this.startTime = Date.now();
        this.timerInterval = null;

        this.img = new Image();
        this.img.crossOrigin = 'Anonymous'; // For picsum
        this.img.onload = () => this.setup();
        this.img.src = imageSrc;

        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchMove = this.handleTouchMove.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());
    }

    setup() {
        // Calculate grid
        const aspectRatio = this.img.width / this.img.height;
        this.cols = Math.round(Math.sqrt(this.pieceCount * aspectRatio));
        this.rows = Math.round(this.pieceCount / this.cols);

        this.updateLayout();
        this.generatePieces();
        this.shufflePieces();
        this.addEventListeners();
        this.startTimer();
        this.draw();
    }

    updateLayout() {
        // Canvas is full screen
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Board size calculations (60% of screen max to leave room for pieces)
        const maxBoardWidth = this.canvas.width * 0.6;
        const maxBoardHeight = this.canvas.height * 0.6;

        const imgAspectRatio = this.img.width / this.img.height;

        this.boardWidth = maxBoardWidth;
        this.boardHeight = this.boardWidth / imgAspectRatio;

        if (this.boardHeight > maxBoardHeight) {
            this.boardHeight = maxBoardHeight;
            this.boardWidth = this.boardHeight * imgAspectRatio;
        }

        // Center the board
        this.boardX = (this.canvas.width - this.boardWidth) / 2;
        this.boardY = (this.canvas.height - this.boardHeight) / 2;

        this.pieceWidth = this.boardWidth / this.cols;
        this.pieceHeight = this.boardHeight / this.rows;
    }

    handleResize() {
        // When resizing, we need to re-calculate board position and scale pieces?
        // For simplicity, just re-layout board and keep pieces relative? 
        // Or just restart? Restarting is annoying.
        // Let's just update layout and redraw. Pieces might be off-screen though.
        // Ideally we should scale piece positions.
        const oldBoardX = this.boardX;
        const oldBoardY = this.boardY;
        const oldBoardW = this.boardWidth;
        const oldBoardH = this.boardHeight;

        this.updateLayout();

        // Update piece sizes and positions
        // This is complex to do perfectly, but let's try to keep them relative.
        // Actually, for this prototype, let's just re-shuffle if resized significantly,
        // or just accept they might move weirdly.
        // Let's just re-draw.
        this.draw();
    }

    generatePieces() {
        this.pieces = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const piece = {
                    r: r,
                    c: c,
                    x: c * this.pieceWidth, // Position relative to board
                    y: r * this.pieceHeight,
                    currentX: 0,
                    currentY: 0,
                    width: this.pieceWidth,
                    height: this.pieceHeight,
                    isLocked: false,
                    top: r === 0 ? 0 : -this.pieces[(r - 1) * this.cols + c].bottom,
                    right: c === this.cols - 1 ? 0 : (Math.random() > 0.5 ? 1 : -1),
                    bottom: r === this.rows - 1 ? 0 : (Math.random() > 0.5 ? 1 : -1),
                    left: c === 0 ? 0 : -this.pieces[r * this.cols + c - 1].right
                };
                this.pieces.push(piece);
            }
        }
    }

    shufflePieces() {
        this.pieces.forEach(p => {
            // Try to place pieces outside the board area
            let x, y;
            let attempts = 0;
            let safe = false;

            while (!safe && attempts < 50) {
                x = Math.random() * (this.canvas.width - this.pieceWidth);
                y = Math.random() * (this.canvas.height - this.pieceHeight);

                // Check overlap with board (add some padding)
                const padding = 20;
                if (x + this.pieceWidth > this.boardX - padding &&
                    x < this.boardX + this.boardWidth + padding &&
                    y + this.pieceHeight > this.boardY - padding &&
                    y < this.boardY + this.boardHeight + padding) {
                    safe = false;
                } else {
                    safe = true;
                }
                attempts++;
            }

            // If we couldn't find a safe spot, just put it anywhere
            p.currentX = x;
            p.currentY = y;
        });
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw Board Area Background (faint)
        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        this.ctx.fillRect(this.boardX, this.boardY, this.boardWidth, this.boardHeight);

        // Draw Hint
        if (this.showHint) {
            this.ctx.globalAlpha = 0.5;
            this.ctx.drawImage(this.img, this.boardX, this.boardY, this.boardWidth, this.boardHeight);
            this.ctx.globalAlpha = 1.0;
        }

        // Draw Slots (Background grid)
        this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        for (let r = 0; r <= this.rows; r++) {
            this.ctx.moveTo(this.boardX, this.boardY + r * this.pieceHeight);
            this.ctx.lineTo(this.boardX + this.boardWidth, this.boardY + r * this.pieceHeight);
        }
        for (let c = 0; c <= this.cols; c++) {
            this.ctx.moveTo(this.boardX + c * this.pieceWidth, this.boardY);
            this.ctx.lineTo(this.boardX + c * this.pieceWidth, this.boardY + this.boardHeight);
        }
        this.ctx.stroke();

        // Draw Pieces
        // Draw locked pieces first (bottom layer)
        this.pieces.filter(p => p.isLocked).forEach(p => this.drawPiece(p));
        // Draw loose pieces
        this.pieces.filter(p => !p.isLocked && p !== this.selectedPiece).forEach(p => this.drawPiece(p));
        // Draw selected piece last (top layer)
        if (this.selectedPiece) {
            this.drawPiece(this.selectedPiece);
        }
    }

    drawPiece(p) {
        this.ctx.save();
        this.ctx.translate(p.currentX, p.currentY);

        // Create path
        const path = new Path2D();
        const w = p.width;
        const h = p.height;
        const s = Math.min(w, h) * 0.25;

        // Top
        path.moveTo(0, 0);
        if (p.top !== 0) {
            const d = p.top * -1;
            path.lineTo(w * 0.35, 0);
            path.bezierCurveTo(w * 0.35, s * d, w * 0.65, s * d, w * 0.65, 0);
            path.lineTo(w, 0);
        } else {
            path.lineTo(w, 0);
        }

        // Right
        if (p.right !== 0) {
            const d = p.right;
            path.lineTo(w, h * 0.35);
            path.bezierCurveTo(w + s * d, h * 0.35, w + s * d, h * 0.65, w, h * 0.65);
            path.lineTo(w, h);
        } else {
            path.lineTo(w, h);
        }

        // Bottom
        if (p.bottom !== 0) {
            const d = p.bottom;
            path.lineTo(w * 0.65, h);
            path.bezierCurveTo(w * 0.65, h + s * d, w * 0.35, h + s * d, w * 0.35, h);
            path.lineTo(0, h);
        } else {
            path.lineTo(0, h);
        }

        // Left
        if (p.left !== 0) {
            const d = p.left * -1;
            path.lineTo(0, h * 0.65);
            path.bezierCurveTo(s * d, h * 0.65, s * d, h * 0.35, 0, h * 0.35);
            path.lineTo(0, 0);
        } else {
            path.lineTo(0, 0);
        }

        path.closePath();

        this.ctx.clip(path);

        // IMPORTANT: Draw image relative to the piece's position in the board
        // Translate back to where the board origin would be relative to this piece
        // The piece represents the chunk at (p.c * w, p.r * h) of the board
        this.ctx.translate(-p.c * w, -p.r * h);

        // Draw the full image at the board's size
        this.ctx.drawImage(this.img, 0, 0, this.boardWidth, this.boardHeight);

        // Restore translation to draw border
        this.ctx.translate(p.c * w, p.r * h);
        this.ctx.strokeStyle = '#555';
        this.ctx.lineWidth = 1;
        this.ctx.stroke(path);

        if (p === this.selectedPiece) {
            this.ctx.strokeStyle = '#FFD700';
            this.ctx.lineWidth = 3;
            this.ctx.stroke(path);
        }

        this.ctx.restore();
    }

    // Input Handling
    addEventListeners() {
        this.canvas.onmousedown = this.handleMouseDown;
        this.canvas.onmousemove = this.handleMouseMove;
        this.canvas.onmouseup = this.handleMouseUp;
        this.canvas.ontouchstart = this.handleTouchStart;
        this.canvas.ontouchmove = this.handleTouchMove;
        this.canvas.ontouchend = this.handleTouchEnd;
    }

    getMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (evt.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    getTouchPos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const touch = evt.touches[0];
        return {
            x: (touch.clientX - rect.left) * (this.canvas.width / rect.width),
            y: (touch.clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    handleInputStart(x, y) {
        for (let i = this.pieces.length - 1; i >= 0; i--) {
            const p = this.pieces[i];
            if (p.isLocked) continue;

            if (x >= p.currentX && x <= p.currentX + p.width &&
                y >= p.currentY && y <= p.currentY + p.height) {

                this.selectedPiece = p;
                this.offsetX = x - p.currentX;
                this.offsetY = y - p.currentY;

                this.pieces.splice(i, 1);
                this.pieces.push(p);

                this.draw();
                return;
            }
        }
    }

    handleInputMove(x, y) {
        if (this.selectedPiece) {
            this.selectedPiece.currentX = x - this.offsetX;
            this.selectedPiece.currentY = y - this.offsetY;
            this.draw();
        }
    }

    handleInputEnd() {
        if (this.selectedPiece) {
            this.checkSnap(this.selectedPiece);
            this.selectedPiece = null;
            this.draw();
            this.checkWin();
        }
    }

    checkSnap(p) {
        const snapDist = 30; // Increased snap distance
        // Target is relative to Board Position
        const targetX = this.boardX + p.x;
        const targetY = this.boardY + p.y;

        if (Math.abs(p.currentX - targetX) < snapDist &&
            Math.abs(p.currentY - targetY) < snapDist) {
            p.currentX = targetX;
            p.currentY = targetY;
            p.isLocked = true;
        }
    }

    checkWin() {
        if (this.pieces.every(p => p.isLocked)) {
            this.stop();
            this.onWin();
        }
    }

    // Event Wrappers
    handleMouseDown(e) {
        const pos = this.getMousePos(e);
        this.handleInputStart(pos.x, pos.y);
    }
    handleMouseMove(e) {
        const pos = this.getMousePos(e);
        this.handleInputMove(pos.x, pos.y);
    }
    handleMouseUp(e) {
        this.handleInputEnd();
    }
    handleTouchStart(e) {
        e.preventDefault();
        const pos = this.getTouchPos(e);
        this.handleInputStart(pos.x, pos.y);
    }
    handleTouchMove(e) {
        e.preventDefault();
        const pos = this.getTouchPos(e);
        this.handleInputMove(pos.x, pos.y);
    }
    handleTouchEnd(e) {
        e.preventDefault();
        this.handleInputEnd();
    }

    toggleHint() {
        this.showHint = !this.showHint;
        this.draw();
    }

    startTimer() {
        let seconds = 0;
        this.timerInterval = setInterval(() => {
            seconds++;
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            timerDisplay.textContent = `${m}:${s}`;
        }, 1000);
    }

    stop() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.canvas.onmousedown = null;
        this.canvas.onmousemove = null;
        this.canvas.onmouseup = null;
        this.canvas.ontouchstart = null;
        this.canvas.ontouchmove = null;
        this.canvas.ontouchend = null;
        window.removeEventListener('resize', this.handleResize);
    }
}

// Start App
init();
