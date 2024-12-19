const fileInput = document.getElementById("pdfFile");
const pdfCanvas = document.getElementById("pdfCanvas");
const cropOverlay = document.getElementById("cropOverlay");
const cropButton = document.getElementById("cropButton");
const resetButton = document.getElementById("resetButton");
const cropData = document.getElementById("cropData");

let pdfDoc = null;
let currentPage = null;
let scale = 1.0;
let originalWidth = 0;
let originalHeight = 0;

let cropStartX, cropStartY, cropWidth, cropHeight;
let isDragging = false;
let isResizing = false;
let currentResizer = null;
let uploadedFile;
let initialCropRect = null;
let initialMouseX, initialMouseY;

fileInput.addEventListener("change", async (e) => {
    uploadedFile = e.target.files[0];
    if (uploadedFile && uploadedFile.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onload = async function (e) {
            const pdfData = new Uint8Array(e.target.result);
            try {
                pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
                await renderPage(1);
            } catch (error) {
                console.error("Error loading PDF:", error);
                alert("Failed to load PDF. Please try another file.");
            }
        };
        fileReader.readAsArrayBuffer(uploadedFile);
    } else {
        alert("Please upload a valid PDF file.");
    }
});

async function renderPage(pageNumber) {
    currentPage = await pdfDoc.getPage(pageNumber);
    const originalViewport = currentPage.getViewport({ scale: 1.0 });
    originalWidth = originalViewport.width;
    originalHeight = originalViewport.height;

    const container = document.getElementById("pdfContainer");
    const containerWidth = container.clientWidth;
    scale = containerWidth / originalViewport.width;

    const viewport = currentPage.getViewport({ scale });
    const context = pdfCanvas.getContext("2d");
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;

    await currentPage.render({ canvasContext: context, viewport }).promise;

    const defaultCropWidth = viewport.width * 0.5;
    const defaultCropHeight = viewport.height * 0.5;
    const defaultCropLeft = (viewport.width - defaultCropWidth) / 2;
    const defaultCropTop = (viewport.height - defaultCropHeight) / 2;

    cropStartX = defaultCropLeft;
    cropStartY = defaultCropTop;
    cropWidth = defaultCropWidth;
    cropHeight = defaultCropHeight;

    updateCropOverlay();
    updateCropData();
}

function updateCropOverlay() {
    cropOverlay.style.left = `${cropStartX}px`;
    cropOverlay.style.top = `${cropStartY}px`;
    cropOverlay.style.width = `${cropWidth}px`;
    cropOverlay.style.height = `${cropHeight}px`;
    cropOverlay.classList.remove("hidden");
}

cropOverlay.addEventListener("mousedown", (e) => {
    if (e.target.classList.contains("resizer")) {
        isResizing = true;
        currentResizer = e.target;
        initialCropRect = cropOverlay.getBoundingClientRect();
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;
        e.stopPropagation();
    } else {
        isDragging = true;
        const rect = cropOverlay.getBoundingClientRect();
        initialMouseX = e.clientX - rect.left;
        initialMouseY = e.clientY - rect.top;
    }
});

document.addEventListener("mousemove", (e) => {
    if (!isResizing && !isDragging) return;

    const canvasRect = pdfCanvas.getBoundingClientRect();
    
    if (isResizing) {
        const dx = e.clientX - initialMouseX;
        const dy = e.clientY - initialMouseY;
        
        const newRect = {
            left: initialCropRect.left,
            top: initialCropRect.top,
            width: initialCropRect.width,
            height: initialCropRect.height
        };

        switch (currentResizer.classList[1]) {
            case "top-left":
                newRect.left += dx;
                newRect.top += dy;
                newRect.width -= dx;
                newRect.height -= dy;
                break;
            case "top-right":
                newRect.top += dy;
                newRect.width += dx;
                newRect.height -= dy;
                break;
            case "bottom-left":
                newRect.left += dx;
                newRect.width -= dx;
                newRect.height += dy;
                break;
            case "bottom-right":
                newRect.width += dx;
                newRect.height += dy;
                break;
        }

        const minSize = 50; // Minimum size in pixels
        if (newRect.width >= minSize && newRect.height >= minSize) {
            cropStartX = newRect.left - canvasRect.left;
            cropStartY = newRect.top - canvasRect.top;
            cropWidth = newRect.width;
            cropHeight = newRect.height;
            
            updateCropOverlay();
            updateCropData();
        }
    } else if (isDragging) {
        const newLeft = e.clientX - initialMouseX - canvasRect.left;
        const newTop = e.clientY - initialMouseY - canvasRect.top;
        
        // Ensure crop area stays within canvas bounds
        cropStartX = Math.max(0, Math.min(newLeft, canvasRect.width - cropWidth));
        cropStartY = Math.max(0, Math.min(newTop, canvasRect.height - cropHeight));
        
        updateCropOverlay();
        updateCropData();
    }
});

document.addEventListener("mouseup", () => {
    isResizing = false;
    isDragging = false;
    currentResizer = null;
    initialCropRect = null;
});

function updateCropData() {
    const adjustedX = cropStartX;
    const adjustedY = cropStartY;
    const adjustedWidth = cropWidth;
    const adjustedHeight = cropHeight;

    const actualX = Math.round(adjustedX / scale);
    const actualY = Math.round(adjustedY / scale);
    const actualWidth = Math.round(adjustedWidth / scale);
    const actualHeight = Math.round(adjustedHeight / scale);

    cropData.innerText = `Original PDF Size: ${Math.round(originalWidth)}x${Math.round(originalHeight)}
Crop Area: X=${actualX}, Y=${actualY}, Width=${actualWidth}, Height=${actualHeight}`;
}

cropButton.addEventListener("click", async () => {
    if (!pdfDoc || cropWidth === 0 || cropHeight === 0) {
        alert("Please upload a PDF and select a crop area.");
        return;
    }

    try {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const pdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer);
        const pages = pdfLibDoc.getPages();
        const page = pages[0];

        const { width, height } = page.getSize();

        let cropX = cropStartX / scale;
        let cropY = cropStartY / scale;
        const cropW = cropWidth / scale;
        const cropH = cropHeight / scale;

        cropY = height - cropY - cropH;

        if (
            cropX < 0 ||
            cropY < 0 ||
            cropX + cropW > width ||
            cropY + cropH > height
        ) {
            alert("Crop area is out of bounds.");
            return;
        }

        page.setCropBox(cropX, cropY, cropW, cropH);

        const newPdfBytes = await pdfLibDoc.save();
        const blob = new Blob([newPdfBytes], { type: "application/pdf" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "cropped.pdf";
        link.click();

        // alert("PDF successfully cropped and downloaded!");
        window.location.href = "noti.html";
    } catch (error) {
        console.error("Crop failed:", error);
        alert("Failed to crop PDF. Please try again.");
    }
});

function resetCrop() {
    cropOverlay.classList.add("hidden");
    cropData.innerText = "";
}

resetButton.addEventListener("click", resetCrop);