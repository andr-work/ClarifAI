const overlay = document.getElementById("dialogOverlay");
const openBtn = document.getElementById("openDialogBtn");
const closeBtn = document.getElementById("closeDialogBtn");

function openDialog() {
    overlay.classList.remove("hidden");
}

function closeDialog() {
    overlay.classList.add("hidden");
}

openBtn.addEventListener("click", openDialog);
closeBtn.addEventListener("click", closeDialog);

// Close when clicking outside dialog
overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
        closeDialog();
    }
});

// Close on ESC key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        closeDialog();
    }
});
