let CELL_SIZE = 15;
let gridSize;
let grid;
let colorGrid;
let isDrawing = false;
let generationCount = 0;
let saveNextGenerations = false;
let generationsToSave = [];

let frozenFrame;
let lastFingerX = null;
let lastFingerY = null;


let videoPaused = false;

let instructionsDiv;
let helpVisible = true;
let alertShown = false;

let DELAY = 1000;
let followRules = false;
let isPaused = true;
let timer;
let showGrid = false;

let history = [];

let zoomFactor = 1.0;
let offset;

let video;
let handpose;
let predictions = [];

let currentRule = 0;

function preload() {
  console.log("Preparing to load handpose model...");

  const script1 = document.createElement('script');
  script1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.min.js';
  script1.onload = () => console.log("MediaPipe Hands loaded");
  document.body.appendChild(script1);

  const script2 = document.createElement('script');
  script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
  script2.onload = () => console.log("MediaPipe Camera Utils loaded");
  document.body.appendChild(script2);
}

function modelReady() {
  console.log("Handpose model loaded successfully!");
  handpose.onResults(results => {
    predictions = results.multiHandLandmarks || [];
  });
}

async function setup() {
  createCanvas(windowWidth, windowHeight);
  gridSize = createVector(floor(width / CELL_SIZE), floor(height / CELL_SIZE));

  grid = new Array(gridSize.x);
  colorGrid = new Array(gridSize.x);
  for (let i = 0; i < gridSize.x; i++) {
    grid[i] = new Array(gridSize.y).fill(0);
    colorGrid[i] = new Array(gridSize.y).fill([0, 0, 0]);
  }

  initializeGrid();
  isDrawing = true;
  followRules = false;
  isPaused = true;
  timer = millis();
  showGrid = false;

  history = [];
  offset = createVector(0, 0);

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();

  pixelDensity(1);

  const interval = setInterval(() => {
    if (typeof Hands !== 'undefined' && typeof Camera !== 'undefined') {
      clearInterval(interval);

      const handPoseOptions = {
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      };

      handpose = new Hands(handPoseOptions);
      handpose.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
      });

      handpose.onResults(results => {
        predictions = results.multiHandLandmarks || [];
      });

      const camera = new Camera(video.elt, {
        onFrame: async () => {
          await handpose.send({ image: video.elt });
        },
        width: width,
        height: height
      });
      camera.start();

    } else {
      console.log("Waiting for MediaPipe Hands and Camera Utils to be defined...");
    }
  }, 100);

  instructionsDiv = createDiv();
  instructionsDiv.style('font-family', "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif");
  instructionsDiv.style('background-color', 'rgba(255, 255, 255, 0.8)');
  instructionsDiv.style('padding', '10px');
  instructionsDiv.position(width - 220, 20);
  instructionsDiv.html(
    "<strong>How to Interact:</strong><br>" +
    "<ul>" +
    "<li>Draw or write with your fingertip.</li>" +
    "<li>Press <strong>ENTER</strong> to send.</li>" +
    "<li>Press <strong>Spacebar</strong> to stop or pause the simulation.</li>" +
    "<li>Press <strong>R</strong> to reset.</li>" +
    "<li>Press <strong>G</strong> to toggle grid visibility.</li>" +
    "</ul>");

  showInstructionsAlert();
}

function draw() {
  background(22, 30, 40);
  textSize(22);
  textAlign(CENTER, CENTER);
  fill(255);

  // 🎥 Flip only the video
  push();
  translate(width, 0);
  scale(-1, 1);
  if (videoPaused && frozenFrame) {
    image(frozenFrame, 0, 0, width, height);
  } else {
    image(video, 0, 0, width, height);
    if (!videoPaused) {
      frozenFrame = video.get(); // Save the frozen frame
    }
  }
  pop(); // 🧹 Back to normal coordinate system

  // ✍️ Normal coordinate system for drawing

  let fingerX = null;
  let fingerY = null;

  if (predictions.length > 0 && predictions[0].length >= 9) {
    const indexTip = predictions[0][8];
    // 📍 BUT now since the video was flipped only during display, 
    // we need to flip the X coordinate manually
    fingerX = width - (indexTip.x * width);
    fingerY = indexTip.y * height;

    lastFingerX = fingerX;
    lastFingerY = fingerY;

    if (isDrawing && !videoPaused) {
      const i = floor(fingerX / CELL_SIZE);
      const j = floor(fingerY / CELL_SIZE);
      if (i >= 0 && i < gridSize.x && j >= 0 && j < gridSize.y) {
        grid[i][j] = 1;
        colorGrid[i][j] = generateColor(fingerX, fingerY, i * CELL_SIZE, j * CELL_SIZE);
        history.push(createVector(i, j));
      }
    }
  } else {
    fingerX = lastFingerX;
    fingerY = lastFingerY;
  }

  displayGrid(fingerX, fingerY);

  if (followRules && !isPaused && millis() - timer > DELAY) {
    nextGeneration();
    timer = millis();
  }

  if (saveNextGenerations && generationsToSave.includes(generationCount)) {
    drawGenerationCountOnCanvas();
    saveCanvas('Generation_' + generationCount, 'png');
    generationsToSave = generationsToSave.filter(g => g !== generationCount);
  }

  detectCursorHover();  
}



function generateColor(x1, y1, x2, y2) {
  let d = dist(x1, y1, x2, y2);
  let r = (sin(d * 0.01) + 1) * 127.5;
  let g = (cos(d * 0.05) + 1) * 90 +10;
  let b = (sin(d * 0.4) + 1) * 127.5;
  return [b, g, 120];
}
function drawOrganicBlob(x, y, radius) {
  beginShape();
  for (let a = 0; a < TWO_PI; a += radians(10)) { // fewer points = softer blob
    let r = radius + noise(x + cos(a)*10, y + sin(a)*10, frameCount*0.01) * 5;
    let vx = x + cos(a) * r;
    let vy = y + sin(a) * r;
    vertex(vx, vy);
  }
  endShape(CLOSE);
}

function displayGrid(cx, cy) {
  if (showGrid) {
    stroke(255, 100);
    for (let i = 0; i <= width; i += CELL_SIZE) {
      line(i, 0, i, height);
    }
    for (let j = 0; j <= height; j += CELL_SIZE) {
      line(0, j, width, j);
    }
  }

  stroke(255, 128);
  for (let i = 0; i < gridSize.x; i++) {
    for (let j = 0; j < gridSize.y; j++) {
      let x = i * CELL_SIZE;
      let y = j * CELL_SIZE;

      if (grid[i][j] === 1) {
        let col = videoPaused ? colorGrid[i][j] : generateColor(cx, cy, x, y);
        fill(col[0], col[1], col[2]);
        if (!videoPaused) colorGrid[i][j] = col;
        drawOrganicBlob(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE * 0.45);
      }
    }
  }
}

function initializeGrid() {
  for (let i = 0; i < gridSize.x; i++) {
    for (let j = 0; j < gridSize.y; j++) {
      grid[i][j] = 0;
      colorGrid[i][j] = [0, 0, 0];
    }
  }
}


    // Get the social button and popup elements
    let socialButton = document.getElementById('social-button');
    let socialPopup = document.getElementById('social-popup');
    let closePopupButton = document.getElementById('close-popup');

    // Toggle the popup on click
    socialButton.addEventListener('click', function() {
        socialPopup.style.display = socialPopup.style.display === 'block' ? 'none' : 'block';
    });

    // Close the popup when the close button is clicked
    closePopupButton.addEventListener('click', function() {
        socialPopup.style.display = 'none';
    });

// Correct About button handling
let aboutBtn = document.getElementById('about');
let aboutPopup = document.getElementById('aboutPopup');

// Apply CSS styles to the popup
aboutPopup.style.fontFamily = "'Franklin Gothic Medium', 'Arial Narrow', Arial, sans-serif";
aboutPopup.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
aboutPopup.style.padding = '10px';
aboutPopup.style.textAlign = 'center';
aboutPopup.style.borderRadius = '8px';
aboutPopup.style.position = 'fixed';
aboutPopup.style.bottom = '50%';
aboutPopup.style.right = '50%';
aboutPopup.style.transform = 'translate(50%, 50%)';
aboutPopup.style.display = 'none';
aboutPopup.style.zIndex = '100';

// Show popup on mouse hover
aboutBtn.addEventListener('mouseover', () => {
  aboutPopup.style.display = 'block';
});

// Hide popup on mouse leave
aboutBtn.addEventListener('mouseout', () => {
  aboutPopup.style.display = 'none';
});


function showInstructionsAlert() {
  if (!alertShown) {
    alert("Please draw or write your message :) \n\n" +
      "Draw or write with your right hand. \n" +
      "Hit ENTER to send. \n" +
      "Space bar to stop or pause the simulation.\n" +
      "R to Reset.\n" +
      "G to toggle grid visibility.\n\n" +
      "Remember that more help is available in the top right corner! ");
    alertShown = true;
  }
}


function keyPressed() {
    if (key === 'r' || key === 'R') {
        initializeGrid(); // Clear the grid
        followRules = false; // Stop following the rules of Game of Life
        history = []; // Clear the history
        videoPaused = false;
        isPaused = true; // Start the simulation
        video.play(); // Resume the video

        generationCount = 0; // Reset generation count
        document.getElementById('generation-count').innerText = generationCount; // Update the display

    // } else if (key === 'Enter' ) {
    //     isPaused = false; // Start the simulation
    //     followRules = true; // Follow the rules
    //     video.pause(); // Pause the video
    //     videoPaused = true;
    //     saveCanvasImage(); // This calls your existing function to save the image
    } else if (key === ' ' || key === 'Enter' ) {
        isPaused = !isPaused; // Toggle pause state
        if (isPaused) {
            video.play(); // Resume the video
            videoPaused = false;
            followRules = false; // Stop following the rules
            generationCount = 0; // Reset generation count
        document.getElementById('generation-count').innerText = generationCount; // Update the display

        } else {
            video.pause(); // Pause the video
            videoPaused = true;
            followRules = true; // Start following the rules
            saveCanvasImage(); // This calls your existing function to save the image

        }


    } else if (key === 'g' || key === 'G') {
        showGrid = !showGrid; // Toggle grid visibility
    }
}

function nextGeneration() {
    let nextGrid = new Array(floor(gridSize.x));
    let nextColorGrid = new Array(floor(gridSize.x));
    for (let i = 0; i < floor(gridSize.x); i++) {
        nextGrid[i] = new Array(floor(gridSize.y)).fill(0);
        nextColorGrid[i] = new Array(floor(gridSize.y)).fill([0, 0, 0]);
    }

    for (let i = 0; i < gridSize.x; i++) {
        for (let j = 0; j < gridSize.y; j++) {
            let state = grid[i][j];
            let neighbors = countNeighbors(i, j);

            switch (currentRule) {
                case 0: // Game of Life Rule
                    if (state === 0 && neighbors === 3) {
                        nextGrid[i][j] = 1;
                        nextColorGrid[i][j] = averageNeighborColor(i, j); // Set color based on neighbors
                    } else if (state === 1 && (neighbors < 2 || neighbors > 3)) {
                        nextGrid[i][j] = 0;
                    } else {
                        nextGrid[i][j] = state;
                        nextColorGrid[i][j] = colorGrid[i][j]; // Retain current color
                    }
                    break;

                case 1: // Custom Rule 1
                    if (state === 0 && neighbors == 2) {
                        nextGrid[i][j] = 1;
                        nextColorGrid[i][j] = averageNeighborColor(i, j); // Set color based on neighbors
                    } else if (state === 1 && neighbors == 3) {
                        nextGrid[i][j] = 1;
                        nextColorGrid[i][j] = averageNeighborColor(i, j); // Set color based on neighbors
                    } else {
                        nextGrid[i][j] = 0;
                    }
                    break;

                case 2: // Higherlife Rule
                    if (state === 0 && neighbors == 3) {
                        nextGrid[i][j] = 1;
                        nextColorGrid[i][j] = averageNeighborColor(i, j); // Set color based on neighbors
                    } else if (state === 1 && (neighbors == 2 || neighbors == 3)) {
                        nextGrid[i][j] = 1;
                        nextColorGrid[i][j] = averageNeighborColor(i, j); // Set color based on neighbors
                    } else {
                        nextGrid[i][j] = 0;
                    }
                    break;

                case 3: // Custom Rule 2
                    if (state === 0 && (neighbors == 3 || neighbors == 6)) {
                        nextGrid[i][j] = 1;
                        nextColorGrid[i][j] = averageNeighborColor(i, j); // Set color based on neighbors
                    } else if (state === 1 && (neighbors < 2 || neighbors > 4)) {
                        nextGrid[i][j] = 0;
                    } else {
                        nextGrid[i][j] = state;
                        nextColorGrid[i][j] = colorGrid[i][j]; // Retain current color
                    }
                    break;
            }
        }
    }

    grid = nextGrid;
    colorGrid = nextColorGrid;

    generationCount++; // Increment the generation count
    document.getElementById('generation-count').innerText = generationCount; // Update HTML

    if (generationCount >= Math.max(...generationsToSave)) {
        saveNextGenerations = false; // Stop saving process after 10 generations
    }
}

function averageNeighborColor(x, y) {
    let neighbors = [];
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            let col = (x + i + gridSize.x) % gridSize.x;
            let row = (y + j + gridSize.y) % gridSize.y;
            if (grid[col][row] === 1) {
                neighbors.push(colorGrid[col][row]);
            }
        }
    }
    if (neighbors.length > 0) {
        let avgColor = neighbors.reduce((acc, col) => {
            acc[0] += col[0];
            acc[1] += col[1];
            acc[2] += col[2];
            return acc;
        }, [0, 0, 0]).map(sum => sum / neighbors.length);
        return avgColor;
    } else {
        return [255, 255, 255]; // Default to white if no neighbors
    }
}

function countNeighbors(x, y) {
    let count = 0;

    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            let col = (x + i + floor(gridSize.x)) % floor(gridSize.x);
            let row = (y + j + floor(gridSize.y)) % floor(gridSize.y);
            count += grid[col][row];
        }
    }

    count -= grid[x][y];
    return count;
}


function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function saveCanvasImage() {
    generationsToSave = [];
    while (generationsToSave.length < 5) {
        let gen = Math.floor(Math.random() * 10) + generationCount + 1;
        if (!generationsToSave.includes(gen)) {
            generationsToSave.push(gen);
        }
    }

    saveNextGenerations = true;

    if (isPaused) {
        isPaused = false;
    }
}

function drawGenerationCountOnCanvas() {
    push(); // Save current drawing settings

    textFont('Carrois Gothic'); // Set the custom font here

    translate(width, 0); // Move to the right side of the canvas
    scale(-1, 1); // Flip horizontally

    fill(255); // White color for text
    textSize(16); // Set text size
    textAlign(LEFT, BOTTOM); // Align text to the left and bottom
    text("Generation: " + generationCount, 10, height - 10); // Position at bottom-left

    pop(); // Restore original drawing settings
}

function detectCursorHover() {
    if (mouseX >= width - 60 && mouseY <= 40) {
        instructionsDiv.show(); // Show instructions when cursor hovers over the right corner
    } else {
        instructionsDiv.hide(); // Hide instructions otherwise
    }
}


function saveAndOpenArena() {
    saveCanvasImage(); // This calls your existing function to save the image
    window.open('https://www.are.na/melissa-yunzhi/noisy-messages', '_blank'); // Opens Arena page in a new tab
}
